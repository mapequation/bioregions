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
  partialCoverage,
  partialKind,
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
    const text = buildMethodsText({ load: load() });
    expect(text).toContain('Occurrence records of Callitrichidae');
    expect(text).toContain('GBIF occurrence API');
    expect(text).toContain('OBIS API');
    expect(text).toContain('derived dataset to be registered');
    expect(text).toContain('The final dataset has 2 records of 2 species');
  });

  it('cites a download DOI, and a derived DOI as a filtered export', () => {
    expect(buildMethodsText({ load: load(), downloadDoi: '10.15468/dl.abc' })).toContain(
      'GBIF Occurrence Download https://doi.org/10.15468/dl.abc',
    );
    expect(buildMethodsText({ load: load({ derivedDoi: '10.15468/dd-xyz' }) })).toContain(
      'Filtered export of GBIF occurrence data https://doi.org/10.15468/dd-xyz',
    );
  });

  it('says when the load was partial, before the citations', () => {
    const partial = { kind: 'speciesMissing' as const, planned: 272_546, accepted: 819, speciesLoaded: 1, speciesPlanned: 210, notReceived: 271_000, coverage: 1 / 210 };
    const text = buildMethodsText({ load: load({ partial, bioregionsSkipped: true }) });
    expect(text).toContain(
      'Loading was stopped early: 819 of ~272,546 planned records (<1 %) from 1 of 210 species were loaded; requests alternate packed batches of small species with parts of large ones, so the missing species are absent rather than thinned, and species still being fetched have fewer records than they would. Species coverage is <1 %; bioregions were not computed for this incomplete dataset.',
    );
    const ran = buildMethodsText({ load: load({ partial: { ...partial, speciesLoaded: 150, coverage: 150 / 210 } }) });
    expect(ran).toContain('from 150 of 210 species were loaded;');
    expect(ran).toContain('Species coverage is 71 %.');
    expect(text.indexOf('Loading was stopped')).toBeLessThan(text.indexOf('Data citations:'));
    // All species present, records cut: the methods text says so instead.
    const cut = buildMethodsText({
      load: load({ partial: { ...partial, kind: 'recordsTruncated', speciesLoaded: 210, coverage: 1 } }),
    });
    expect(cut).toContain('all 210 species are present, but later records were not received');
    expect(cut).not.toContain('absent rather than thinned');
  });

  it('adds the tree citation', () => {
    expect(buildMethodsText({ load: load(), treeCitation: 'Upham et al. 2019' })).toContain(
      'Phylogeny: Upham et al. 2019.',
    );
  });
});

describe('partialCoverage', () => {
  it('uses species when planned, else records', () => {
    expect(partialCoverage({ planned: 100, accepted: 10, speciesLoaded: 1, speciesPlanned: 46 })).toBeCloseTo(1 / 46);
    expect(partialCoverage({ planned: 100, accepted: 10, speciesLoaded: 1, speciesPlanned: null })).toBeCloseTo(0.1);
    expect(partialCoverage({ planned: 0, accepted: 0, speciesLoaded: 0, speciesPlanned: null })).toBe(0);
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
    expect(csv).toContain('cleaning,Duplicates within a source,true,-1,0.3333');
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
    const p = {
      kind: 'speciesMissing' as const,
      planned: 10,
      accepted: 5,
      speciesLoaded: 2,
      speciesPlanned: 4,
      notReceived: 5,
      coverage: 0.5,
    };
    expect(partialSentence(p)).toContain('5 of ~10 planned records (50 %) from 2 of 4 species');
    expect(partialSentence(p)).toContain('missing species are absent rather than thinned, and species still being fetched');
    expect(partialSentence(p)).toContain('fewer records than they would. Species coverage is 50 %.');
    // The largest missing species are named.
    const named = partialSentence({
      ...p,
      missingSpecies: [
        { name: 'Ee ff', expected: 9000 },
        { name: 'Gg hh', expected: 45 },
      ],
    });
    expect(named).toContain('The missing species are Ee ff (~9,000 planned records) and Gg hh (~45). Species coverage');
    const many = partialSentence({
      ...p,
      speciesPlanned: 40,
      missingSpecies: [
        { name: 'Aa', expected: 900 },
        { name: 'Bb', expected: 80 },
        { name: 'Cc', expected: 7 },
        { name: 'Dd', expected: 6 },
      ],
    });
    expect(many).toContain('The largest of the 38 missing species are Aa (~900 planned records), Bb (~80) and Cc (~7).');
    expect(partialSentence({ ...p, accepted: 999, planned: 1000 })).toContain('(>99 %)');
    // Unknown species total: no "of", record coverage instead.
    const unknown = partialSentence({ ...p, kind: 'recordsTruncated', speciesPlanned: null });
    expect(unknown).toContain('from 2 species were loaded; the planned species are unknown');
    expect(unknown).toContain('Record coverage is 50 %.');
    // Every species present: records were cut, nothing is absent.
    expect(partialSentence({ ...p, kind: 'recordsTruncated', speciesLoaded: 4 })).toBe(
      'Loading was stopped early: 5 of ~10 planned records (50 %) were loaded; all 4 species are present, but later records were not received, so record counts per species are not representative.',
    );
    expect(partialSentence({ ...p, kind: 'recordsTruncated', speciesLoaded: 4 }, true)).toContain(
      'representative; bioregions were not computed',
    );
  });

  it('tells missing species from truncated records', () => {
    expect(partialKind(42, 46)).toBe('speciesMissing');
    expect(partialKind(46, 46)).toBe('recordsTruncated');
    expect(partialKind(12, null)).toBe('recordsTruncated');
  });
});
