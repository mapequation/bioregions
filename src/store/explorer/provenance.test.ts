import { describe, expect, it } from 'vitest';
import { RecordCleaner } from '../../sources/clean';
import { defaultQuery } from '../../sources/query';
import type { OccurrenceQuery } from '../../sources/types';
import {
  type LoadProvenance,
  buildDatasetCsv,
  buildLedgerCsv,
  buildMethodsText,
  buildObisCitation,
  citingDownload,
  partialSentence,
} from './provenance';

const query = (): OccurrenceQuery => ({
  ...defaultQuery(),
  taxa: [{ name: 'Callitrichidae', rank: 'FAMILY', gbifKey: 9620 }],
  years: [1970, 2025],
  sources: { gbif: true, obis: true },
});

function load(extra: Partial<LoadProvenance> = {}): LoadProvenance {
  const cleaner = new RecordCleaner({ dedupe: 'exact' });
  cleaner.accept([
    { name: 'Callithrix jacchus', lon: -40, lat: -10, source: 'gbif', datasetKey: 'd1' },
    { name: 'Callithrix jacchus', lon: -40, lat: -10, source: 'gbif', datasetKey: 'd1' },
    { name: 'Saguinus oedipus', lon: -75, lat: 9, source: 'obis', datasetKey: 'o1' },
  ]);
  return {
    query: query(),
    retrievedAt: '2026-10-30T14:03:00.000Z',
    mode: 'replace',
    funnel: cleaner.funnel,
    ledger: [{ id: 'years', label: 'Years 1970–2025', toggleable: true, active: true, impact: 120, share: 0.1 }],
    kpis: { records: 2, recordsUpperBound: false, species: 2, datasets: 2, yearRange: null, bySource: {} },
    accepted: 2,
    partial: null,
    datasetCounts: { gbif: [{ key: 'd1', label: 'Dataset one', count: 1 }], obis: [{ key: 'o1', label: 'o1', count: 1 }] },
    ...extra,
  };
}

describe('buildMethodsText', () => {
  it('describes the load with both citations', () => {
    const text = buildMethodsText({ load: load(), query: query() });
    expect(text).toContain('Occurrence records of Callitrichidae');
    expect(text).toContain('GBIF occurrence API');
    expect(text).toContain('OBIS API');
    expect(text).toContain('derived dataset to be registered');
    expect(text).toContain('The final dataset has 2 records of 2 species');
  });

  it('cites a download DOI, and a derived DOI as a filtered export', () => {
    expect(buildMethodsText({ load: load(), query: query(), downloadDoi: '10.15468/dl.abc' })).toContain(
      'GBIF Occurrence Download https://doi.org/10.15468/dl.abc',
    );
    expect(buildMethodsText({ load: load({ derivedDoi: '10.15468/dd-xyz' }), query: query() })).toContain(
      'Filtered export of GBIF occurrence data https://doi.org/10.15468/dd-xyz',
    );
  });

  it('says when the load was partial, before the citations', () => {
    const partial = { planned: 272_546, accepted: 819, speciesLoaded: 1, speciesPlanned: 210, notReceived: 271_000 };
    const text = buildMethodsText({ load: load({ partial }), query: query() });
    expect(text).toContain(
      'Loading was stopped early: 819 of ~272,546 planned records (<1 %) from 1 of 210 species were loaded; because records stream species by species, the missing species are absent rather than thinned.',
    );
    expect(text.indexOf('Loading was stopped')).toBeLessThan(text.indexOf('Data citations:'));
  });

  it('drafts from the query before a load', () => {
    const text = buildMethodsText({ load: null, query: query(), now: '2026-10-30T00:00:00Z' });
    expect(text).toContain('Callitrichidae');
    expect(text).not.toContain('0 records of 0 species');
  });

  it('adds the tree citation', () => {
    expect(buildMethodsText({ load: load(), query: query(), treeCitation: 'Upham et al. 2019' })).toContain(
      'Phylogeny: Upham et al. 2019.',
    );
  });
});

describe('citations and CSVs', () => {
  it('lists OBIS dataset ids', () => {
    expect(buildObisCitation(load())).toMatch(/^OBIS \(2026\) .*Datasets: o1$/);
  });

  it('writes the GBIF datasetKey,count CSV', () => {
    expect(buildDatasetCsv(load())).toBe('datasetKey,count\nd1,1');
    expect(buildDatasetCsv(null)).toBe('datasetKey,count');
  });

  it('writes filter impact and cleaning rows', () => {
    const csv = buildLedgerCsv(load().ledger, load().funnel).split('\n');
    expect(csv[0]).toBe('section,step,active,records,share');
    expect(csv[1]).toBe('filter impact,Years 1970–2025,true,-120,0.1');
    expect(csv).toContain('cleaning,Received,true,3,');
    expect(csv).toContain('cleaning,Duplicates,true,-1,0.3333');
    expect(csv[csv.length - 1]).toBe('cleaning,Accepted,true,2,');
  });

  it('picks the citing download', () => {
    const downloads = [
      { key: 'a', status: 'SUCCEEDED' as const, doi: '10.1/a', createdAt: '2026-01-01', queryKey: 'q1' },
      { key: 'b', status: 'SUCCEEDED' as const, doi: '10.1/b', createdAt: '2026-02-01', queryKey: 'q2' },
    ];
    expect(citingDownload(null, downloads, 'q1')?.key).toBe('a');
    expect(citingDownload({ gbifDownloadKey: 'b' }, downloads, 'q1')?.doi).toBe('10.1/b');
    expect(citingDownload(null, downloads, 'q3')).toBeNull();
  });

  it('formats the partial sentence', () => {
    const p = { planned: 10, accepted: 5, speciesLoaded: 2, speciesPlanned: 4, notReceived: 5 };
    expect(partialSentence(p)).toContain('5 of ~10 planned records (50 %) from 2 of 4 species');
    expect(partialSentence({ ...p, accepted: 999, planned: 1000 })).toContain('(>99 %)');
    // Unknown species total: no "of".
    expect(partialSentence({ ...p, speciesPlanned: null })).toContain('from 2 species were loaded; because');
    // Every species present: nothing is absent.
    expect(partialSentence({ ...p, speciesLoaded: 4 })).toBe(
      'Loading was stopped early: 5 of ~10 planned records (50 %) from all 4 species were loaded.',
    );
  });
});
