import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpError } from '../sources/http';
import { DEFAULT_BASIS } from '../sources/query';
import type { PreviewSummary, SourceId, TaxonRef } from '../sources/types';
import ExplorerStore, {
  explorerJob,
  buildLedger,
  checkDownload,
  computeBiasFlags,
  dirtySections,
  explorerDefaultQuery,
  mergeKpis,
  recentShareOf,
  zipVerdict,
  PREVIEW_DEBOUNCE_MS,
  type BiasActions,
  type ToggleMemory,
} from './ExplorerStore';
import type RootStore from './RootStore';
import { mergeProgress, speciesCoverage } from './data/streamLoad';
import type { DataLoadJob, QueryOccurrences } from './data/types';
import type { LoadProvenance } from './explorer/provenance';

// The store asks each source for a fast summary plus ledger counts; the tests stub one
// full preview per source and serve it as the summary (its baseTotal/filterImpact win).
vi.mock('../sources/gbif/preview', async (orig) => {
  const previewGbif = vi.fn();
  return {
    ...(await orig<typeof import('../sources/gbif/preview')>()),
    previewGbif,
    previewGbifSummary: (q: unknown, s: unknown) => previewGbif(q, s),
    previewGbifImpact: async () => ({ filterImpact: {} }),
  };
});
vi.mock('../sources/obis/preview', async (orig) => {
  const previewObis = vi.fn();
  return {
    ...(await orig<typeof import('../sources/obis/preview')>()),
    previewObis,
    previewObisParts: (q: unknown, s: unknown) => {
      const summary = Promise.resolve(previewObis(q, s));
      return { summary, impact: summary.then(() => ({ filterImpact: {} })) };
    },
  };
});
vi.mock('../sources/gbif/taxa', async (orig) => ({
  ...(await orig<typeof import('../sources/gbif/taxa')>()),
  suggestGbifTaxa: vi.fn(),
  gbifTaxonCount: vi.fn(),
}));
vi.mock('../sources/obis/taxa', async (orig) => ({
  ...(await orig<typeof import('../sources/obis/taxa')>()),
  suggestObisTaxa: vi.fn(),
  resolveQueryTaxa: vi.fn(async () => ({ ids: [], unresolved: [], empty: false })),
}));

const { previewGbif } = await import('../sources/gbif/preview');
const { previewObis } = await import('../sources/obis/preview');
const { suggestGbifTaxa, gbifTaxonCount } = await import('../sources/gbif/taxa');
const { suggestObisTaxa } = await import('../sources/obis/taxa');

function preview(source: SourceId, patch: Partial<PreviewSummary> = {}): PreviewSummary {
  return {
    source,
    total: 1000,
    species: 10,
    datasets: 5,
    yearRange: [1990, 2020],
    years: [],
    basisOfRecord: [],
    topSpecies: [],
    topDatasets: [],
    countries: [],
    issues: [],
    uncertainty: null,
    filterImpact: {},
    ...patch,
  };
}

const memory: ToggleMemory = { years: null, depth: null, uncertainty: 10000, datasets: [], minRecords: 5 };
const felidae: TaxonRef = { name: 'Felidae', rank: 'FAMILY', gbifKey: 9703 };
const newStore = () => new ExplorerStore({} as RootStore);

describe('mergeKpis', () => {
  it('sums records and datasets, takes the max species and the widest year range', () => {
    const k = mergeKpis([
      preview('gbif', { total: 900, species: 200, datasets: 100, yearRange: [1900, 2020] }),
      preview('obis', { total: 100, species: 40, datasets: 7, yearRange: [1850, 2024] }),
    ]);
    expect(k).toEqual({
      records: 1000,
      recordsUpperBound: true,
      species: 200,
      datasets: 107,
      yearRange: [1850, 2024],
      bySource: { gbif: 900, obis: 100 },
    });
  });

  it('is not an upper bound with one contributing source, and null without previews', () => {
    expect(mergeKpis([preview('gbif'), preview('obis', { total: 0 })])?.recordsUpperBound).toBe(false);
    expect(mergeKpis([])).toBeNull();
  });
});

describe('buildLedger', () => {
  it('sums impacts over sources, keeps unknown impacts null and computes shares', () => {
    const query = explorerDefaultQuery();
    query.years = [1970, 2025];
    const rows = buildLedger({
      query,
      previews: [
        preview('gbif', { total: 800, filterImpact: { uncertainty: 150, years: 50 } }),
        preview('obis', { total: 200, filterImpact: { years: 50 } }),
      ],
      memory,
      speciesCounts: null,
      base: 1500,
    });
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId.uncertainty).toMatchObject({ label: 'Uncertainty ≤ 10 km', toggleable: true, active: true, impact: 150 });
    // One common denominator: every share is impact / base.
    expect(byId.uncertainty.share).toBeCloseTo(150 / 1500);
    expect(byId.years.share).toBeCloseTo(100 / 1500);
    expect(byId.years).toMatchObject({ label: 'Years 1970–2025', impact: 100 });
    expect(byId.basisOfRecord).toMatchObject({ label: 'No fossil/living specimens', active: true, impact: null, share: null });
    expect(byId.datasets).toMatchObject({ label: 'Excluded datasets (0)', active: false });
    expect(byId.minRecords).toMatchObject({ label: 'Min. 5 records per species', active: false });
    expect(byId.depth.label).toBe('Depth 0–200 m');
    expect(rows.map((r) => r.id)).toHaveLength(12);
    expect(byId.speciesLevel).toMatchObject({ label: 'Not identified to species', toggleable: false, impact: null, share: null });
    expect(byId.duplicates).toMatchObject({
      label: 'Duplicates (same species within ~11 m)',
      toggleable: false,
      impact: null,
    });
    // GBIF∩OBIS overlap has its own fixed row next to the duplicates.
    expect(rows.map((r) => r.id).slice(-2)).toEqual(['duplicates', 'crossSource']);
    expect(byId.crossSource).toMatchObject({ label: 'Same record in GBIF and OBIS', toggleable: false, active: true, impact: null });
  });

  it('fills the fixed rows and leaves shares null without a base', () => {
    const rows = buildLedger({
      query: explorerDefaultQuery(),
      previews: [preview('gbif', { total: 800, filterImpact: { uncertainty: 150 } })],
      memory,
      speciesCounts: null,
      base: 2000,
      speciesLevel: 200,
      duplicates: 50,
    });
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId.speciesLevel).toMatchObject({ impact: 200, share: 0.1, active: true });
    expect(byId.duplicates).toMatchObject({ impact: 50, share: 0.025 });
    const noBase = buildLedger({ query: explorerDefaultQuery(), previews: [], memory, speciesCounts: null, base: null });
    expect(noBase.every((r) => r.share === null)).toBe(true);
  });

  it('derives the minimum-records impact from species counts and reads loaded impacts', () => {
    const query = explorerDefaultQuery();
    query.quality.minRecordsPerSpecies = 5;
    const rows = buildLedger({
      query,
      previews: [preview('gbif')],
      memory,
      speciesCounts: [
        { key: 'a', label: 'A', count: 3 },
        { key: 'b', label: 'B', count: 4 },
        { key: 'c', label: 'C', count: 50 },
      ],
      loaded: [{ id: 'minRecords', label: '', toggleable: true, active: true, impact: 2, share: null }],
      base: null,
    });
    const row = rows.find((r) => r.id === 'minRecords');
    expect(row).toMatchObject({ active: true, impact: 7, loadedImpact: 2 });
  });
});

describe('toggleFilter', () => {
  it('flips filters between their recommended value and off', () => {
    const s = newStore();
    s.toggleFilter('uncertainty');
    expect(s.query.quality.maxUncertaintyMeters).toBeNull();
    s.toggleFilter('uncertainty');
    expect(s.query.quality.maxUncertaintyMeters).toBe(10000);
    s.setQuality({ maxUncertaintyMeters: 1000 });
    s.toggleFilter('uncertainty');
    s.toggleFilter('uncertainty');
    expect(s.query.quality.maxUncertaintyMeters).toBe(1000);

    s.toggleFilter('basisOfRecord');
    expect(s.query.quality.basisOfRecord).toEqual([]);
    s.toggleFilter('basisOfRecord');
    expect(s.query.quality.basisOfRecord).toEqual(DEFAULT_BASIS);

    s.toggleFilter('geospatialIssues');
    expect(s.query.quality.excludeGeospatialIssues).toBe(false);
    s.toggleFilter('presentOnly');
    expect(s.query.quality.presentOnly).toBe(false);
    s.dispose();
  });

  it('restores the last year bounds, depth and excluded datasets', () => {
    const s = newStore();
    s.setYears([1970, 2025]);
    s.toggleFilter('years');
    expect(s.query.years).toEqual([null, null]);
    s.toggleFilter('years');
    expect(s.query.years).toEqual([1970, 2025]);

    s.toggleFilter('depth');
    expect(s.query.depth).toEqual([0, 200]);
    s.toggleFilter('depth');
    expect(s.query.depth).toEqual([null, null]);

    s.excludeDataset('d1');
    s.excludeDataset('d2');
    s.excludeDataset('d1');
    expect(s.query.quality.excludeDatasets).toEqual(['d1', 'd2']);
    s.toggleFilter('datasets');
    expect(s.query.quality.excludeDatasets).toEqual([]);
    s.toggleFilter('datasets');
    expect(s.query.quality.excludeDatasets).toEqual(['d1', 'd2']);

    s.toggleFilter('minRecords');
    expect(s.query.quality.minRecordsPerSpecies).toBe(5);
    s.dispose();
  });

  it('applies presets and reports the matching preset', () => {
    const s = newStore();
    expect(s.preset).toBe('recommended');
    s.applyPreset('permissive');
    expect(s.preset).toBe('permissive');
    s.setQuality({ maxUncertaintyMeters: 2000 });
    expect(s.preset).toBe('custom');
    s.dispose();
  });
});

describe('recentShareOf', () => {
  it('is the temporal-skew value: one histogram, one cutoff', () => {
    const years = [
      { year: 2000, count: 280 },
      { year: 2011, count: 720 },
    ];
    expect(recentShareOf(years, 2025)).toEqual({ cutoffYear: 2011, share: 0.72, scope: 'query' });
    expect(recentShareOf([], 2025, 'loaded')).toEqual({ cutoffYear: 2011, share: null, scope: 'loaded' });
    const flags = computeBiasFlags(
      { query: explorerDefaultQuery(), previews: [preview('gbif', { total: 1000, years })], speciesCounts: null, currentYear: 2025 },
      {
        excludeDataset: vi.fn(),
        specimensOnly: vi.fn(),
        narrowYears: vi.fn(),
        showCountries: vi.fn(),
        setMinRecords: vi.fn(),
        useGbifOnly: vi.fn(),
        pinBaseline: vi.fn(),
      },
    );
    expect(flags.find((f) => f.id === 'temporalSkew')?.value).toBe(recentShareOf(years, 2025).share);
  });
});

describe('load progress helpers', () => {
  it('never lets the request total shrink', () => {
    const p = { requestsTotal: 184, requestsDone: 0, fetched: 0 };
    mergeProgress(p, { requestsTotal: 25, requestsDone: 8, fetched: 100 });
    expect(p).toEqual({ requestsTotal: 184, requestsDone: 8, fetched: 100 });
    mergeProgress(p, { requestsTotal: 190 });
    expect(p.requestsTotal).toBe(190);
  });

  it('measures live species coverage over the sources that report species', () => {
    expect(speciesCoverage([{ speciesDone: 1, speciesTotal: 46 }, {}])).toBeCloseTo(1 / 46);
    expect(speciesCoverage([{ speciesDone: 3, speciesTotal: 4 }, { speciesDone: 1, speciesTotal: 4 }])).toBe(0.5);
    expect(speciesCoverage([{}])).toBeNull();
  });

  it('keeps the loaded provenance after an empty load; the outcome stays on the job', () => {
    const first = { accepted: 5, query: explorerDefaultQuery() } as LoadProvenance;
    const source = { id: 'src-1', kind: 'explorer-query', status: 'done', provenance: first } as QueryOccurrences;
    const job = { kind: 'query', state: 'error', outcome: { emptyReason: 'noMatches', previousKept: true } } as DataLoadJob;
    const s = new ExplorerStore({ dataStore: { occurrence: source, job, isLoading: false } } as unknown as RootStore);
    expect(s.loaded).toBe(first);
    expect(explorerJob(job)?.outcome).toEqual({ emptyReason: 'noMatches', previousKept: true });
    expect(explorerJob({ ...job, kind: 'file' })).toBeNull();
    // While the source streams, nothing counts as loaded.
    const streaming = new ExplorerStore({
      dataStore: { occurrence: { ...source, status: 'loading', provenance: null }, job: null, isLoading: true },
    } as unknown as RootStore);
    expect(streaming.loaded).toBeNull();
    s.dispose();
    streaming.dispose();
  });

  it('schedules no preview while the portal is closed and catches up on open (§5.7)', () => {
    vi.useFakeTimers();
    try {
      const s = new ExplorerStore({ dataStore: { occurrence: null, job: null, isLoading: false } } as unknown as RootStore);
      const timer = () => (s as unknown as { previewTimer: unknown }).previewTimer;
      s.addTaxon(felidae);
      expect(timer()).toBeNull();
      s.open();
      expect(s.tab).toBe('search');
      expect(timer()).not.toBeNull();
      s.close();
      expect(s.isOpen).toBe(false);
      expect(timer()).toBeNull();
      s.setArea({ kind: 'countries', codes: ['SE'] });
      expect(timer()).toBeNull();
      s.open('cite');
      expect(s.tab).toBe('cite');
      expect(timer()).not.toBeNull();
      s.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('GBIF download zip checks', () => {
  const query = () => {
    const q = explorerDefaultQuery();
    q.taxa = [{ name: 'Callitrichidae', rank: 'FAMILY', gbifKey: 9620 }];
    q.area = { kind: 'bbox', bbox: [-118, -56, -34, 33] };
    q.years = [1970, 2025];
    return q;
  };
  // The same taxa, area and years as gbif.org writes them: other order, YEAR as "a,b", ring reversed.
  const sameAsGbif = {
    type: 'and',
    predicates: [
      { type: 'equals', key: 'YEAR', value: '1970,2025' },
      { type: 'within', geometry: 'POLYGON((-118 -56,-118 33,-34 33,-34 -56,-118 -56))' },
      { type: 'equals', key: 'HAS_COORDINATE', value: 'true' },
      { type: 'equals', key: 'TAXON_KEY', value: '9620' },
    ],
  };

  it('matches a download made for the same taxa, area and years', async () => {
    const r = await checkDownload('0012345-261030123456789', query(), undefined, async (key) => ({
      key,
      status: 'SUCCEEDED',
      doi: '10.15468/dl.abc',
      request: { predicate: sameAsGbif },
    }));
    expect(r).toMatchObject({ match: 'match', differences: [], doi: '10.15468/dl.abc' });
    expect(r.text).toBe('Callitrichidae · lon -118 to -34, lat -56 to 33 · 1970–2025');
  });

  it('names what differs, and is unknown without metadata', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'));
    const other = { ...sameAsGbif, predicates: [...sameAsGbif.predicates.slice(0, 3), { type: 'equals', key: 'TAXON_KEY', value: '2436436' }] };
    const r = await checkDownload('k', query(), undefined, async (key) => ({ key, status: 'SUCCEEDED', request: { predicate: other } }));
    expect(r).toMatchObject({ match: 'mismatch', differences: ['taxa'], text: 'unknown taxon (key 2436436) · lon -118 to -34, lat -56 to 33 · 1970–2025' });
    const failed = await checkDownload('k', query(), undefined, async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(failed.match).toBe('unknown');
    fetchSpy.mockRestore();
  });

  it('names alphanumeric checklist keys through the resolver', async () => {
    const other = { ...sameAsGbif, predicates: [...sameAsGbif.predicates.slice(0, 3), { type: 'equals', key: 'TAXON_KEY', value: '935Y2' }] };
    const names = vi.fn(async (keys: string[]) => new Map(keys.map((k) => [k, k === '935Y2' ? 'Helleborus torquatus' : k])));
    const r = await checkDownload('k', query(), undefined, async (key) => ({ key, status: 'SUCCEEDED', request: { predicate: other } }), names);
    expect(names).toHaveBeenCalledWith(['935Y2'], expect.anything());
    expect(r.text).toBe('Helleborus torquatus · lon -118 to -34, lat -56 to 33 · 1970–2025');
  });

  it('only replaces or cites with a matching download', () => {
    const base = { key: 'k', doi: '10.15468/dl.abc', accepted: 0, received: 7, streamGbifRecords: 12_094, hasData: true };
    const mismatch = zipVerdict({ ...base, check: { match: 'mismatch', differences: ['taxa', 'area'], text: 'Felidae · worldwide · all years' } });
    expect(mismatch).toMatchObject({ queryMatch: 'mismatch', canReplace: false, canCiteDoi: false, downloadQueryText: 'Felidae · worldwide · all years' });
    expect(mismatch.note).toContain('different query (its taxa and area differ)');
    expect(mismatch.note).not.toContain('GBIF changed');
    const match = zipVerdict({ ...base, accepted: 12_000, check: { match: 'match', differences: [] } });
    expect(match).toMatchObject({ queryMatch: 'match', canReplace: true, canCiteDoi: true });
    expect(match.note).toContain('GBIF changed between the two snapshots: 12,000 records after cleaning here, 12,094 GBIF records loaded on screen');
    expect(zipVerdict({ ...base, check: { match: 'match', differences: [] } })).toMatchObject({ canReplace: false, canCiteDoi: true });
    const unknown = zipVerdict({ ...base, accepted: 10, check: { match: 'unknown', differences: [], failure: 'offline' } });
    expect(unknown).toMatchObject({ queryMatch: 'unknown', canReplace: false, canCiteDoi: false });
    expect(zipVerdict({ ...base, key: undefined, check: null }).note).toContain('No GBIF download key');
  });
});

describe('computeBiasFlags', () => {
  const actions = (): BiasActions => ({
    excludeDataset: vi.fn(),
    specimensOnly: vi.fn(),
    narrowYears: vi.fn(),
    showCountries: vi.fn(),
    setMinRecords: vi.fn(),
    useGbifOnly: vi.fn(),
    pinBaseline: vi.fn(),
  });

  it('triggers each check strictly above its threshold', () => {
    const a = actions();
    const flags = computeBiasFlags(
      {
        query: explorerDefaultQuery(),
        previews: [
          preview('gbif', {
            total: 1000,
            topDatasets: [{ key: 'ebird', label: 'eBird', count: 310 }],
            basisOfRecord: [{ key: 'HUMAN_OBSERVATION', label: 'Human observation', count: 600 }],
            years: [
              { year: 2000, count: 280 },
              { year: 2011, count: 720 },
            ],
            countries: [{ key: 'BR', label: 'Brazil', count: 510 }],
          }),
        ],
        speciesCounts: [
          { key: 'a', label: 'A', count: 1 },
          { key: 'b', label: 'B', count: 100 },
          { key: 'c', label: 'C', count: 100 },
          { key: 'd', label: 'D', count: 100 },
          { key: 'e', label: 'E', count: 100 },
        ],
        currentYear: 2025,
      },
      a,
    );
    const byId = Object.fromEntries(flags.map((f) => [f.id, f]));
    expect(flags).toHaveLength(5);
    expect(byId.datasetDominance.triggered).toBe(true);
    expect(byId.datasetDominance.text).toBe(
      '31 % of records come from one dataset (eBird). Its sampling design can shape your regions.',
    );
    expect(byId.humanObservation.triggered).toBe(false); // exactly 60 %
    expect(byId.temporalSkew.triggered).toBe(true);
    expect(byId.temporalSkew.text).toBe('72 % of records are from 2011 or later; historical ranges may be missing.');
    expect(byId.countryConcentration.triggered).toBe(true);
    expect(byId.lowCountSpecies.triggered).toBe(false); // exactly 20 %
    expect(byId.lowCountSpecies.value).toBeCloseTo(0.2);

    byId.datasetDominance.action?.run();
    expect(a.excludeDataset).toHaveBeenCalledWith('ebird');
    byId.temporalSkew.action?.run();
    expect(a.narrowYears).toHaveBeenCalledWith(2011);
    // Concrete action labels and legend text.
    expect(byId.datasetDominance.action?.label).toBe('Exclude this dataset');
    expect(byId.datasetDominance.action?.title).toBe('Exclude eBird');
    expect(byId.temporalSkew.action?.label).toBe('Use recent records only (2011)');
    expect(byId.humanObservation.action?.label).toBe('Specimens only');
    expect(byId.lowCountSpecies.action?.label).toBe('5+ records per species');
    expect(byId.countryConcentration.thresholdLabel).toBe('flagged above 50 % of records');
  });

  it('grades triggered flags as notes or warnings and prices each remedy', () => {
    const flags = computeBiasFlags(
      {
        query: explorerDefaultQuery(),
        previews: [
          preview('gbif', {
            total: 1000,
            topDatasets: [{ key: 'inat', label: 'iNaturalist Research-grade Observations', count: 450 }],
            basisOfRecord: [
              { key: 'HUMAN_OBSERVATION', label: 'Human observation', count: 700 },
              { key: 'PRESERVED_SPECIMEN', label: 'Preserved specimen', count: 250 },
              { key: 'MATERIAL_SAMPLE', label: 'Material sample', count: 50 },
            ],
            // 50 records undated.
            years: [
              { year: 2000, count: 100 },
              { year: 2020, count: 850 },
            ],
            countries: [{ key: 'BR', label: 'Brazil', count: 740 }],
          }),
        ],
        speciesCounts: [
          { key: 'a', label: 'A', count: 1 },
          { key: 'b', label: 'B', count: 3 },
          { key: 'c', label: 'C', count: 100 },
        ],
        currentYear: 2025,
      },
      actions(),
    );
    const byId = Object.fromEntries(flags.map((f) => [f.id, f]));
    // 45 % >= 1.5 x 30 %: a warning; 74 % < 1.5 x 50 %: a note; 70 % < 90 %: a note.
    expect(byId.datasetDominance.level).toBe('warning');
    expect(byId.countryConcentration.level).toBe('note');
    expect(byId.humanObservation.level).toBe('note');
    expect(byId.temporalSkew.level).toBe('note'); // 850 / 950 = 89 %
    expect(byId.lowCountSpecies.level).toBe('warning'); // 67 %
    expect(byId.datasetDominance.action).toMatchObject({
      label: 'Exclude this dataset',
      title: 'Exclude iNaturalist Research-grade Observations',
      cost: 450,
    });
    expect(byId.humanObservation.action?.cost).toBe(700);
    expect(byId.temporalSkew.action?.cost).toBe(150); // 100 older + 50 undated
    expect(byId.countryConcentration.action?.cost).toBeUndefined();
    expect(byId.lowCountSpecies.action?.cost).toBe(4);
    const passed = computeBiasFlags(
      { query: explorerDefaultQuery(), previews: [preview('gbif', { total: 10 })], speciesCounts: null, currentYear: 2025 },
      actions(),
    );
    expect(passed.find((f) => f.id === 'lowCountSpecies')?.level).toBeUndefined();
  });

  it('names the year range it sets and drops actions that are already applied', () => {
    const query = explorerDefaultQuery();
    query.quality.basisOfRecord = ['PRESERVED_SPECIMEN', 'MATERIAL_SAMPLE'];
    query.quality.minRecordsPerSpecies = 5;
    const input = (years: [number | null, number | null]) => ({
      query: { ...query, years },
      previews: [
        preview('gbif', {
          total: 1000,
          years: [
            { year: 1990, count: 100 },
            { year: 2024, count: 900 },
          ],
        }),
      ],
      speciesCounts: [{ key: 'a', label: 'A', count: 1 }],
      currentYear: 2026,
    });
    const open = Object.fromEntries(computeBiasFlags(input([null, null]), actions()).map((f) => [f.id, f]));
    expect(open.temporalSkew.action?.label).toBe('Use recent records only (2012–2024)');
    expect(open.humanObservation.action).toBeUndefined();
    expect(open.lowCountSpecies.action).toBeUndefined();
    const bounded = Object.fromEntries(computeBiasFlags(input([1980, 2020]), actions()).map((f) => [f.id, f]));
    expect(bounded.temporalSkew.action?.label).toBe('Use recent records only (2012–2020)');
    const narrowed = Object.fromEntries(computeBiasFlags(input([2015, null]), actions()).map((f) => [f.id, f]));
    expect(narrowed.temporalSkew.action).toBeUndefined();
  });

  it('skips the country check for a single-country area and offers no exclusion for OBIS datasets', () => {
    const query = explorerDefaultQuery();
    query.area = { kind: 'countries', codes: ['BR'] };
    const flags = computeBiasFlags(
      {
        query,
        previews: [
          preview('obis', {
            topDatasets: [{ key: 'x', label: 'OBIS set', count: 900 }],
            countries: [{ key: 'BR', label: 'Brazil', count: 1000 }],
          }),
        ],
        speciesCounts: null,
        currentYear: 2025,
      },
      actions(),
    );
    const byId = Object.fromEntries(flags.map((f) => [f.id, f]));
    expect(byId.countryConcentration.triggered).toBe(false);
    expect(byId.datasetDominance.triggered).toBe(true);
    // Leaving OBIS out is the only remedy, and with no GBIF records it would leave none.
    expect(byId.datasetDominance.action).toMatchObject({ label: 'Use GBIF only', discouraged: true, leaves: 0 });
    expect(byId.lowCountSpecies.triggered).toBe(false);
  });

  it('marks merged GBIF + OBIS preview values approximate and offers GBIF only for an OBIS dataset', () => {
    const a = actions();
    const previews = [
      preview('gbif', {
        total: 700,
        topDatasets: [{ key: 'g', label: 'GBIF set', count: 100 }],
        basisOfRecord: [{ key: 'HUMAN_OBSERVATION', label: 'Human observation', count: 650 }],
      }),
      preview('obis', {
        total: 300,
        topDatasets: [{ key: 'o', label: 'OBIS survey', count: 280 }],
        basisOfRecord: [{ key: 'HUMAN_OBSERVATION', label: 'Human observation', count: 300 }],
      }),
    ];
    const flags = computeBiasFlags({ query: explorerDefaultQuery(), previews, speciesCounts: null, currentYear: 2025 }, a);
    const byId = Object.fromEntries(flags.map((f) => [f.id, f]));
    for (const f of flags) {
      expect(f).toMatchObject({ approximate: true, approximateNote: 'may change after GBIF/OBIS overlap removal' });
    }
    expect(byId.datasetDominance.action).toMatchObject({ label: 'Use GBIF only', cost: 300 });
    expect(byId.datasetDominance.action?.discouraged).toBeUndefined();
    byId.datasetDominance.action?.run();
    expect(a.useGbifOnly).toHaveBeenCalled();
    // OBIS contributes: human observations are survey effort, not citizen science.
    expect(byId.humanObservation.text).toBe(
      '95 % are human observations, mostly survey and sighting effort; coverage follows survey tracks.',
    );
    // One source, or loaded records (overlap already removed): exact.
    const one = computeBiasFlags({ query: explorerDefaultQuery(), previews: [previews[0]], speciesCounts: null, currentYear: 2025 }, a);
    expect(one.some((f) => f.approximate)).toBe(false);
    expect(one.find((f) => f.id === 'humanObservation')?.text).toContain('often citizen science');
    // OBIS dataset dominance without GBIF enabled: nothing to fall back on.
    const noGbif = explorerDefaultQuery();
    noGbif.sources = { gbif: false, obis: true };
    const obisOnly = computeBiasFlags({ query: noGbif, previews: [previews[1]], speciesCounts: null, currentYear: 2025 }, a);
    expect(obisOnly.find((f) => f.id === 'datasetDominance')?.action).toBeUndefined();
  });

  it('uses the survey wording for a marine preset area', () => {
    const query = explorerDefaultQuery();
    query.area = { kind: 'bbox', bbox: [114, -11, 163, 20], label: 'Coral Triangle' };
    const flags = computeBiasFlags(
      {
        query,
        previews: [preview('gbif', { total: 100, basisOfRecord: [{ key: 'HUMAN_OBSERVATION', label: 'Human observation', count: 90 }] })],
        speciesCounts: null,
        currentYear: 2025,
      },
      actions(),
    );
    expect(flags.find((f) => f.id === 'humanObservation')?.text).toContain('mostly survey and sighting effort');
  });

  it('discourages a remedy that would remove more than 80 % of the scope', () => {
    const flags = computeBiasFlags(
      {
        query: explorerDefaultQuery(),
        previews: [
          preview('gbif', {
            total: 5000,
            basisOfRecord: [
              { key: 'HUMAN_OBSERVATION', label: 'Human observation', count: 4857 },
              { key: 'PRESERVED_SPECIMEN', label: 'Preserved specimen', count: 143 },
            ],
            years: [
              { year: 1950, count: 4100 },
              { year: 2020, count: 900 },
            ],
          }),
        ],
        speciesCounts: null,
        currentYear: 2025,
      },
      actions(),
    );
    const byId = Object.fromEntries(flags.map((f) => [f.id, f]));
    expect(byId.humanObservation.action).toMatchObject({ label: 'Specimens only', cost: 4857, discouraged: true, leaves: 143 });
    // 82 % older: restricting to recent years is discouraged too, and so is its compare variant.
    expect(byId.temporalSkew.action).toMatchObject({ discouraged: true, leaves: 900 });
    expect(byId.temporalSkew.secondaryAction).toBeUndefined();
  });

  it('offers to compare before restricting to recent years', () => {
    const a = actions();
    const calls: string[] = [];
    vi.mocked(a.pinBaseline).mockImplementation(() => calls.push('pin'));
    vi.mocked(a.narrowYears).mockImplementation(() => calls.push('narrow'));
    const flags = computeBiasFlags(
      {
        query: explorerDefaultQuery(),
        previews: [
          preview('gbif', {
            total: 1000,
            years: [
              { year: 2000, count: 200 },
              { year: 2025, count: 800 },
            ],
          }),
        ],
        speciesCounts: null,
        currentYear: 2025,
      },
      a,
    );
    const temporal = flags.find((f) => f.id === 'temporalSkew');
    expect(temporal?.action?.label).toBe('Use recent records only (2011–2025)');
    expect(temporal?.action?.discouraged).toBeUndefined();
    expect(temporal?.secondaryAction?.label).toBe('Compare first: pin baseline, then restrict');
    temporal?.secondaryAction?.run();
    expect(calls).toEqual(['pin', 'narrow']);
    expect(a.pinBaseline).toHaveBeenCalledWith('Before: 2011–2025 only');
    expect(a.narrowYears).toHaveBeenCalledWith(2011);
  });

  it('returns no flags without records', () => {
    expect(
      computeBiasFlags(
        { query: explorerDefaultQuery(), previews: [preview('gbif', { total: 0 })], speciesCounts: null, currentYear: 2025 },
        actions(),
      ),
    ).toEqual([]);
  });
});

describe('dirtySections', () => {
  it('lists the sections that changed', () => {
    const a = explorerDefaultQuery();
    const b = explorerDefaultQuery();
    b.taxa = [felidae];
    b.quality.maxUncertaintyMeters = 1000;
    expect([...dirtySections(a, b)].sort()).toEqual(['quality', 'taxa']);
  });
});

describe('preview pipeline', () => {
  // Previews run only while the portal is open (§5.7).
  const openStore = () => {
    const s = newStore();
    s.open();
    return s;
  };
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(previewGbif).mockReset();
    vi.mocked(previewObis).mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces, merges sources and marks old results stale', async () => {
    vi.mocked(previewGbif).mockResolvedValue(
      preview('gbif', { total: 900, filterImpact: { uncertainty: 100 } }),
    );
    vi.mocked(previewObis).mockResolvedValue(preview('obis', { total: 100 }));
    const s = openStore();
    expect(s.previewState).toBe('empty');
    s.addTaxon(felidae);
    s.addTaxon({ ...felidae, name: 'felidae' });
    s.setYears([1970, 2025]);
    expect(s.query.taxa).toHaveLength(1);
    expect(s.previewState).toBe('first');
    await vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS + 10);
    expect(previewGbif).toHaveBeenCalledTimes(1);
    expect(previewObis).toHaveBeenCalledTimes(1);
    expect(s.previewState).toBe('ready');
    expect(s.kpis?.records).toBe(1000);
    expect(s.ledgerTotal).toBe(1000);
    expect(s.biggestRestriction?.row.id).toBe('uncertainty');
    expect(s.biggestRestriction?.relaxLabel).toBe('Remove the uncertainty limit');

    s.setArea({ kind: 'bbox', bbox: [-90, -60, -30, 15] });
    expect(s.sources.gbif.stale).toBe(true);
    expect(s.previewState).toBe('stale');
    await vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS + 10);
    expect(previewGbif).toHaveBeenCalledTimes(2);
    expect(s.previewState).toBe('ready');

    s.pinBaseline();
    expect(s.baseline?.total).toBe(1000);
    s.dispose();
  });

  it('shares one ledger base and drafts no methods text before a load', async () => {
    vi.mocked(previewGbif).mockResolvedValue(
      preview('gbif', { total: 900, baseTotal: 1800, filterImpact: { uncertainty: 450 } }),
    );
    vi.mocked(previewObis).mockResolvedValue(preview('obis', { total: 0, baseTotal: 0 }));
    const s = openStore();
    s.addTaxon(felidae);
    await vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS + 10);
    expect(s.ledgerBase).toBe(1800);
    expect(s.ledger.find((r) => r.id === 'uncertainty')?.share).toBeCloseTo(0.25);
    expect(s.ledger.find((r) => r.id === 'speciesLevel')).toMatchObject({ toggleable: false, impact: null });
    expect(s.countStory).toEqual({ matching: 900, speciesLevel: null, duplicates: null, crossSource: null, loaded: null });
    expect(s.insightsScope).toEqual({ kind: 'query', records: 900, label: 'For the query · 900 matching records' });
    expect(s.loadedMatchesQuery).toBe(false);
    // The methods text describes loaded data only (I4).
    expect(s.methodsText).toBe('');
    s.toggleFilter('speciesLevel');
    expect(s.query.quality.maxUncertaintyMeters).toBe(10000);
    s.dispose();
  });

  it('retries automatically when rate-limited and reports other errors', async () => {
    vi.mocked(previewGbif)
      .mockRejectedValueOnce(new HttpError(429, '', 'https://api.gbif.org/v1/x'))
      .mockResolvedValueOnce(preview('gbif'));
    vi.mocked(previewObis).mockRejectedValue(new HttpError(502, 'bad', 'https://api.obis.org/v3/x'));
    const s = openStore();
    s.addTaxon(felidae);
    await vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS + 10);
    expect(s.sources.gbif.state).toBe('rateLimited');
    expect(s.sources.gbif.retryAt).toBeGreaterThan(Date.now());
    expect(s.sources.obis).toMatchObject({ state: 'error', error: 'HTTP 502' });
    await vi.advanceTimersByTimeAsync(5000);
    expect(s.sources.gbif.state).toBe('ready');
    expect(s.kpis?.recordsUpperBound).toBe(false);

    vi.mocked(previewObis).mockResolvedValueOnce(preview('obis'));
    s.retrySource('obis');
    await vi.advanceTimersByTimeAsync(0);
    expect(s.sources.obis.state).toBe('ready');
    s.dispose();
  });

  it('does not preview a query that cannot run and explains why Load is disabled', () => {
    const s = openStore();
    expect(s.canLoad).toEqual({ ok: false, reason: 'Add a taxon or narrow the area to a region' });
    s.addTaxon(felidae);
    expect(s.canLoad).toEqual({ ok: true });
    s.online = false;
    expect(s.canLoad).toEqual({ ok: false, reason: "You're offline" });
    s.dispose();
  });

  it('disables Load when every settled preview matches no record', async () => {
    vi.mocked(previewGbif).mockResolvedValue(preview('gbif', { total: 0, species: 0 }));
    vi.mocked(previewObis).mockResolvedValue(preview('obis', { total: 0, species: 0 }));
    const s = openStore();
    s.addTaxon(felidae);
    // Previews still pending: Load keeps its usual state.
    expect(s.canLoad).toEqual({ ok: true });
    await vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS + 10);
    expect(s.previewState).toBe('ready');
    expect(s.previewsAllZero).toBe(true);
    expect(s.canLoad).toEqual({ ok: false, reason: 'No records match this query' });

    // One source with records is enough.
    vi.mocked(previewObis).mockResolvedValue(preview('obis', { total: 12 }));
    s.setYears([1980, 2025]);
    expect(s.canLoad).toEqual({ ok: true });
    await vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS + 10);
    expect(s.previewsAllZero).toBe(false);
    expect(s.canLoad).toEqual({ ok: true });

    // A disabled source does not count.
    s.setSourceEnabled('obis', false);
    expect(s.query.sources.obis).toBe(false);
    await vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS + 10);
    expect(s.canLoad).toEqual({ ok: false, reason: 'No records match this query' });
    s.dispose();
  });
});

describe('suggestTaxa', () => {
  it('merges GBIF and OBIS suggestions by name and adds cached GBIF counts', async () => {
    vi.mocked(suggestGbifTaxa).mockResolvedValue([felidae, { name: 'Felis', rank: 'GENUS', gbifKey: 1 }]);
    vi.mocked(suggestObisTaxa).mockResolvedValue([
      { name: 'FELIDAE', rank: 'FAMILY', obisId: 136977 },
      { name: 'Felis marina', rank: 'SPECIES', obisId: 5 },
    ]);
    vi.mocked(gbifTaxonCount).mockResolvedValue(3_100_000);
    const s = newStore();
    const out = await s.suggestTaxa('fel');
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ name: 'Felidae', gbifKey: 9703, obisId: 136977, inGbif: true, inObis: true, gbifCount: 3_100_000 });
    expect(out[2]).toMatchObject({ name: 'Felis marina', inGbif: false, inObis: true });
    await s.suggestTaxa('fel');
    expect(gbifTaxonCount).toHaveBeenCalledTimes(2); // Felidae + Felis, then cached
    s.dispose();
  });

  it('keeps one source when the other fails', async () => {
    vi.mocked(suggestGbifTaxa).mockRejectedValue(new Error('down'));
    vi.mocked(suggestObisTaxa).mockResolvedValue([{ name: 'Gadus', rank: 'GENUS', obisId: 1 }]);
    const s = newStore();
    expect(await s.suggestTaxa('gad')).toEqual([{ name: 'Gadus', rank: 'GENUS', obisId: 1, inGbif: false, inObis: true }]);
    s.dispose();
  });
});
