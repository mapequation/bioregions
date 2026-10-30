import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpError } from '../sources/http';
import { DEFAULT_BASIS } from '../sources/query';
import type { PreviewSummary, SourceId, TaxonRef } from '../sources/types';
import ExplorerStore, {
  buildLedger,
  computeBiasFlags,
  dirtySections,
  explorerDefaultQuery,
  mergeKpis,
  PREVIEW_DEBOUNCE_MS,
  type BiasActions,
  type ToggleMemory,
} from './ExplorerStore';
import type RootStore from './RootStore';

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
    expect(rows.map((r) => r.id)).toHaveLength(11);
    expect(byId.speciesLevel).toMatchObject({ label: 'Not identified to species', toggleable: false, impact: null, share: null });
    expect(byId.duplicates).toMatchObject({
      label: 'Duplicates (same species at one site)',
      toggleable: false,
      impact: null,
    });
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

describe('computeBiasFlags', () => {
  const actions = (): BiasActions => ({
    excludeDataset: vi.fn(),
    specimensOnly: vi.fn(),
    narrowYears: vi.fn(),
    showCountries: vi.fn(),
    setMinRecords: vi.fn(),
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
    expect(byId.temporalSkew.action?.label).toBe('Restrict to 2011');
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
    expect(open.temporalSkew.action?.label).toBe('Restrict to 2012–2024');
    expect(open.humanObservation.action).toBeUndefined();
    expect(open.lowCountSpecies.action).toBeUndefined();
    const bounded = Object.fromEntries(computeBiasFlags(input([1980, 2020]), actions()).map((f) => [f.id, f]));
    expect(bounded.temporalSkew.action?.label).toBe('Restrict to 2012–2020');
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
    expect(byId.datasetDominance.action).toBeUndefined();
    expect(byId.lowCountSpecies.triggered).toBe(false);
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
    const s = newStore();
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

  it('shares one ledger base and names only sources with records in the methods draft', async () => {
    vi.mocked(previewGbif).mockResolvedValue(
      preview('gbif', { total: 900, baseTotal: 1800, filterImpact: { uncertainty: 450 } }),
    );
    vi.mocked(previewObis).mockResolvedValue(preview('obis', { total: 0, baseTotal: 0 }));
    const s = newStore();
    s.addTaxon(felidae);
    await vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS + 10);
    expect(s.ledgerBase).toBe(1800);
    expect(s.ledger.find((r) => r.id === 'uncertainty')?.share).toBeCloseTo(0.25);
    expect(s.ledger.find((r) => r.id === 'speciesLevel')).toMatchObject({ toggleable: false, impact: null });
    expect(s.countStory).toEqual({ matching: 900, speciesLevel: null, duplicates: null, loaded: null });
    expect(s.loadedMatchesQuery).toBe(false);
    expect(s.methodsSources).toEqual(['gbif']);
    expect(s.methodsText).toContain('Global Biodiversity Information Facility');
    expect(s.methodsText).not.toContain('OBIS');
    expect(s.methodsText).toContain('Only records identified to species were used');
    s.toggleFilter('speciesLevel');
    expect(s.query.quality.maxUncertaintyMeters).toBe(10000);
    s.dispose();
  });

  it('retries automatically when rate-limited and reports other errors', async () => {
    vi.mocked(previewGbif)
      .mockRejectedValueOnce(new HttpError(429, '', 'https://api.gbif.org/v1/x'))
      .mockResolvedValueOnce(preview('gbif'));
    vi.mocked(previewObis).mockRejectedValue(new HttpError(502, 'bad', 'https://api.obis.org/v3/x'));
    const s = newStore();
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
    const s = newStore();
    expect(s.canLoad).toEqual({ ok: false, reason: 'Add a taxon or narrow the area to a region' });
    s.addTaxon(felidae);
    expect(s.canLoad).toEqual({ ok: true });
    s.online = false;
    expect(s.canLoad).toEqual({ ok: false, reason: "You're offline" });
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
