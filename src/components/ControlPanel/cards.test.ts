import { describe, expect, it } from 'vitest';
import { sourceCards, type SourceCardsInput } from './cards';
import { defaultQuery } from '../../sources/query';
import type { DataLoadJob, LoadedSource, OccurrenceSource, TreeSource } from '../../store/data/types';

const counts = { records: 1200, species: 40, polygons: 0 };

function input(over: Partial<SourceCardsInput> = {}): SourceCardsInput {
  return { sources: [], job: null, treeJob: null, overlap: null, counts, includeTree: true, continueCap: null, ...over };
}

const base = { label: 'Data', status: 'done' as const, retrievedAt: '2026-10-31', completedAt: '2026-10-31', exportName: 'x' };

const fileSource = { ...base, id: 'f1', role: 'occurrences', kind: 'file', format: 'csv', files: [{ name: 'birds.csv', size: 9 }] } as OccurrenceSource;
const exampleSource = { ...base, id: 'e1', role: 'occurrences', kind: 'example', exampleId: 'ex', label: 'Mammals' } as OccurrenceSource;
const querySource = (over: Record<string, unknown> = {}) =>
  ({
    ...base,
    id: 'q1',
    role: 'occurrences',
    kind: 'explorer-query',
    query: defaultQuery(),
    cap: 500_000,
    provenance: null,
    resumable: false,
    ...over,
  }) as unknown as OccurrenceSource;
const openTree = {
  id: 't1',
  role: 'tree',
  kind: 'opentree',
  label: 'Open Tree',
  status: 'done',
  retrievedAt: '',
  completedAt: '',
  tips: 300,
  candidate: { id: 'synth', kind: 'synthetic', title: 'Synthetic', citation: 'c', year: null, synthVersion: '15.1' },
  grafen: true,
  selection: {},
  matchedFrom: 'loaded',
  citation: 'Open Tree of Life',
} as unknown as TreeSource;

const job = (over: Partial<DataLoadJob> = {}) =>
  ({
    id: 'job-1',
    kind: 'query',
    origin: 'search',
    targetId: null,
    committed: false,
    state: 'streaming',
    label: 'Aves',
    perSource: [{ source: 'gbif', fetched: 100, expected: 400, state: 'streaming' }],
    funnel: { accepted: 90 },
    paused: false,
    ...over,
  }) as unknown as DataLoadJob;

const ids = (actions: { id: string }[]) => actions.map((a) => a.id);
const cardsOf = (sources: LoadedSource[], over: Partial<SourceCardsInput> = {}) => sourceCards(input({ sources, ...over }));

describe('sourceCards', () => {
  it('derives cards only from sources', () => {
    expect(cardsOf([])).toEqual([]);
    expect(cardsOf([exampleSource]).map((c) => c.kindLabel)).toEqual(['Example']);
  });

  it('gives a file no Cite and points to the original source', () => {
    const [card] = cardsOf([fileSource]);
    expect(card.title).toBe('birds.csv');
    expect(ids(card.primary)).toEqual(['replace']);
    expect(ids(card.menu)).toEqual(['remove']);
    expect(card.notes).toContain('Cite the original source of this file');
  });

  it('cites an example only when it has a citation, else shows the placeholder', () => {
    expect(ids(cardsOf([exampleSource])[0].primary)).toEqual(['examples']);
    expect(cardsOf([exampleSource])[0].notes).toEqual(['Source: Infomap Bioregions example data']);
    const cited = { ...exampleSource, citation: 'Doe 2020' } as OccurrenceSource;
    expect(ids(cardsOf([cited])[0].primary)).toEqual(['examples', 'cite']);
  });

  it('offers Continue only when the query is resumable', () => {
    expect(ids(cardsOf([querySource()], { continueCap: 1000 })[0].primary)).toEqual(['edit', 'cite']);
    const stop = { reason: 'cap', failedParts: 0, stoppedEarly: true, sources: ['gbif'] };
    const card = cardsOf([querySource({ resumable: true, provenance: { stop } })], { continueCap: 1_000_000 })[0];
    expect(ids(card.primary)).toEqual(['edit', 'cite', 'continue']);
    expect(card.primary[2].label).toBe('Continue up to 1,000,000');
    expect(card.status?.tone).toBe('warning');
    expect(ids(card.menu)).toEqual(['loadAgain', 'remove']);
  });

  it('labels the Stop menu before and after the commit', () => {
    const before = cardsOf([], { job: job() })[0];
    expect(before.role).toBe('job');
    expect(before.stopOptions?.map((o) => o.label)).toEqual(['Stop and keep 90 records', 'Cancel the load']);
    const withPrevious = cardsOf([fileSource], { job: job({ targetId: 'f1' }) });
    expect(withPrevious.map((c) => c.role)).toEqual(['job', 'occurrences']);
    expect(withPrevious[0].stopOptions?.[1].label).toBe('Cancel; keep the previous data');
    expect(withPrevious[1].menu[0].disabled).toBeTruthy();

    const loading = querySource({ status: 'loading' });
    const after = cardsOf([loading], { job: job({ committed: true }) });
    expect(after).toHaveLength(1);
    expect(after[0].progress).toEqual({ value: 100, max: 400, text: 'GBIF 100 / 400' });
    expect(after[0].stopOptions?.map((o) => o.label)).toEqual([
      'Stop and keep 90 records',
      'Discard the 90 records loaded so far',
    ]);
    expect(cardsOf([], { job: job({ kind: 'continue' }) })[0].stopOptions?.map((o) => o.mode)).toEqual(['keep']);
  });

  it('hides Open for file loads and sidebar loads', () => {
    expect(ids(cardsOf([], { job: job() })[0].primary)).toEqual(['open', 'stop']);
    expect(cardsOf([], { job: job() })[0].openTab).toBe('search');
    expect(ids(cardsOf([], { job: job({ kind: 'file', origin: 'upload' }) })[0].primary)).toEqual(['stop']);
    expect(ids(cardsOf([], { job: job({ origin: 'sidebar' }) })[0].primary)).toEqual(['stop']);
  });

  it('shows the tree card with live overlap and warns below 50 %', () => {
    const ok = cardsOf([openTree], { overlap: { tips: 300, inTree: 30, datasetSpecies: 40 } })[0];
    expect(ok.role).toBe('tree');
    expect(ok.title).toBe('Open Tree synthetic tree v15.1');
    expect(ok.stats).toEqual(['300 tips · 30 of 40 dataset species in tree']);
    expect(ok.status).toBeUndefined();
    expect(ok.badges.map((b) => b.text)).toEqual(['Topology only']);
    expect(ids(ok.primary)).toEqual(['change', 'cite']);
    expect(ids(ok.menu)).toEqual(['remove']);
    const few = cardsOf([openTree], { overlap: { tips: 300, inTree: 19, datasetSpecies: 40 } })[0];
    expect(few.status).toEqual({ tone: 'warning', text: 'Few dataset species are in this tree' });
  });

  it('says the tree is not used when Include tree is off', () => {
    expect(cardsOf([openTree])[0].notes).toEqual([]);
    expect(cardsOf([openTree], { includeTree: false })[0].notes).toEqual(['Not used in the analysis (Include tree is off)']);
  });

  it('orders the occurrence card before the tree card', () => {
    expect(cardsOf([openTree, fileSource]).map((c) => c.role)).toEqual(['occurrences', 'tree']);
  });
});
