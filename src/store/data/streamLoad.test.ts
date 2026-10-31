// Stream loads through ExplorerStore.load into the DataStore (spec §2.3, §3 paths 6, 7, 13, 14,
// §4.1), with mocked sources and a fake SpeciesStore.
import { describe, expect, it, vi } from 'vitest';
import type { GbifPlanDetail } from '../../sources/gbif/stream';
import type { OccurrenceQuery, RecordBatch, StreamOptions, StreamPlan } from '../../sources/types';
import DataStore, { LOAD_RUNNING } from '../DataStore';
import ExplorerStore from '../ExplorerStore';
import type RootStore from '../RootStore';

vi.mock('../../sources/gbif/stream', async (orig) => ({
  ...(await orig<typeof import('../../sources/gbif/stream')>()),
  streamGbif: vi.fn(),
}));
vi.mock('../../sources/obis/stream', async (orig) => ({
  ...(await orig<typeof import('../../sources/obis/stream')>()),
  streamObis: vi.fn(),
}));
vi.mock('../explorer/plan', async (orig) => ({
  ...(await orig<typeof import('../explorer/plan')>()),
  planSource: vi.fn(),
}));
// Previews are not under test: keep them pending.
vi.mock('../../sources/gbif/preview', async (orig) => ({
  ...(await orig<typeof import('../../sources/gbif/preview')>()),
  previewGbif: vi.fn(() => new Promise(() => {})),
}));
vi.mock('../../sources/obis/preview', async (orig) => ({
  ...(await orig<typeof import('../../sources/obis/preview')>()),
  previewObis: vi.fn(() => new Promise(() => {})),
}));

const { streamGbif } = await import('../../sources/gbif/stream');
const { streamObis } = await import('../../sources/obis/stream');
const { planSource } = await import('../explorer/plan');

const QUERY: OccurrenceQuery = {
  taxa: [{ name: 'Callitrichidae', rank: 'FAMILY', gbifKey: 9620, obisId: 1 }],
  area: { kind: 'bbox', bbox: [-118, -56, -34, 33] },
  years: [1970, 2025],
  depth: [null, null],
  quality: {
    basisOfRecord: [],
    maxUncertaintyMeters: null,
    keepMissingUncertainty: true,
    excludeGeospatialIssues: false,
    excludeIntroduced: false,
    presentOnly: false,
    dedupe: 'exact',
  },
  sources: { gbif: true, obis: true },
};

function gbifPlan(query: OccurrenceQuery): StreamPlan {
  const detail: GbifPlanDetail = { species: [{ key: 1, name: 'Callithrix jacchus', count: 3 }], total: 3 };
  return {
    source: 'gbif',
    query,
    expectedRecords: 3,
    expectedSpecies: 1,
    requests: 1,
    estimatedBytes: 450,
    speciesCounts: [{ key: '1', label: 'Callithrix jacchus', count: 3 }],
    detail,
  };
}

function obisPlan(query: OccurrenceQuery): StreamPlan {
  return {
    source: 'obis',
    query,
    expectedRecords: 2,
    expectedSpecies: 2,
    requests: 1,
    estimatedBytes: 580,
    speciesCounts: [
      { key: '10', label: 'Callithrix jacchus', count: 1 },
      { key: '11', label: 'Saguinus oedipus', count: 1 },
    ],
    detail: { params: 'taxonid=1', taxonIds: [1], unresolvedTaxa: [], clientFilter: {}, pageSize: 5000 },
  };
}

const record = (name: string, lon: number, lat: number, source: 'gbif' | 'obis', datasetKey: string) => ({
  name,
  lon,
  lat,
  source,
  datasetKey,
  year: 2000,
});

function batches(source: 'gbif' | 'obis', list: RecordBatch['records'][], gate?: Promise<void>) {
  return async function* (_plan: StreamPlan, opts: StreamOptions) {
    let fetched = 0;
    for (const records of list) {
      if (gate) await gate;
      if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      fetched += records.length;
      yield { source, records, progress: { fetched, expected: 3, requestsDone: 1, requestsTotal: 1, bytes: 100 } };
    }
    return { fetched, truncated: 0, requests: 1, reachedCap: false };
  };
}

function setup() {
  const consumed: { name: string }[][] = [];
  const speciesStore = {
    collection: { features: [] as unknown[] },
    loaded: false,
    numRecords: 0,
    numSpecies: 0,
    numPolygonsDebounced: 0,
    speciesMap: new Map<string, unknown>(),
    skipped: null as boolean | null,
    /** SpeciesStore.name: the loaded source's export name. */
    get name(): string {
      return rootStore.dataStore.occurrence?.exportName ?? 'data';
    },
    clearData: vi.fn(() => {
      speciesStore.loaded = false;
      speciesStore.numRecords = 0;
    }),
    cancelLoad: vi.fn(),
    runBioregions: vi.fn(async () => {}),
    loadString: vi.fn(async (_csv: string, opts: { onFirstRecord?: () => void } = {}) => {
      opts.onFirstRecord?.();
      speciesStore.loaded = true;
      return { received: 1 };
    }),
    loadRecords: vi.fn(
      async (
        iter: AsyncIterable<{ name: string }[]>,
        opts: { controller: AbortController; skipBioregions?: () => boolean; onFirstRecord?: () => void },
      ) => {
        let received = 0;
        for await (const b of iter) {
          if (opts.controller.signal.aborted) break;
          if (b.length === 0) continue;
          if (received === 0) opts.onFirstRecord?.();
          consumed.push(b);
          received += b.length;
        }
        if (received > 0) speciesStore.loaded = true;
        if (received > 0 && opts.controller.signal.reason !== 'discard') speciesStore.skipped = opts.skipBioregions?.() ?? false;
        return { received };
      },
    ),
  };
  const rootStore = {
    speciesStore,
    infomapStore: { clearData: vi.fn(), run: vi.fn(async () => {}), setIncludeTree: vi.fn() },
    mapStore: { render: vi.fn(), setRenderType: vi.fn() },
    treeStore: { reset: vi.fn() },
  } as unknown as RootStore;
  rootStore.dataStore = new DataStore(rootStore);
  const store = new ExplorerStore(rootStore);
  rootStore.explorerStore = store;
  store.query = structuredClone(QUERY);
  vi.mocked(planSource).mockImplementation(async (id, q) => (id === 'gbif' ? gbifPlan(q) : obisPlan(q)));
  return { store, rootStore, dataStore: rootStore.dataStore, speciesStore, consumed };
}

describe('ExplorerStore.load into the data store', () => {
  it('streams both sources through one cleaner into SpeciesStore', async () => {
    vi.mocked(streamGbif).mockImplementation(
      batches('gbif', [
        [record('Callithrix jacchus', -40, -10, 'gbif', 'd1'), record('Callithrix jacchus', -40, -10, 'gbif', 'd1')],
        [record('Callithrix jacchus', -41, -11, 'gbif', 'd2')],
      ]),
    );
    vi.mocked(streamObis).mockImplementation(
      batches('obis', [[record('Callithrix jacchus', -40, -10, 'obis', 'o1'), record('Saguinus oedipus', -75, 9, 'obis', 'o1')]]),
    );
    const { store, consumed, speciesStore } = setup();
    await store.load();
    expect(speciesStore.name).toBe(store.querySummary);
    expect(consumed.flat()).toHaveLength(3);
    expect(store.job?.state).toBe('done');
    expect(store.job?.funnel).toMatchObject({ received: 5, accepted: 3 });
    // One GBIF record twice (same source), one also in OBIS (cross-source).
    expect(store.job?.funnel.dropped).toMatchObject({ duplicate: 1, crossSource: 1 });
    expect(store.job?.perSource.map((p) => p.state)).toEqual(['done', 'done']);
    const last = store.lastLoad;
    expect(last?.partial).toBeNull();
    expect(last?.kpis).toMatchObject({ records: 3, species: 2, datasets: 3 });
    expect(last?.datasetCounts.gbif?.map((b) => b.key)).toEqual(['d1', 'd2']);
    expect((last as { requests?: Record<string, unknown> }).requests?.obis).toBe('taxonid=1');
    expect(store.recent[0].kpis?.records).toBe(3);
    expect(store.methodsText).toContain('The final dataset has 3 records of 2 species');
    expect(store.datasetCsv).toBe('datasetKey,count\nd1,1\nd2,1');
    // One derivation chain: plans -> duplicates removed while loading -> loaded.
    expect(store.loadedMatchesQuery).toBe(true);
    expect(store.countStory).toMatchObject({ duplicates: 2, crossSource: 1, loaded: 3 });
    // The load planned through planQuery: the workspace plans stay as they were.
    expect(store.plans.state).toBe('idle');
    expect(store.ledger.find((r) => r.id === 'duplicates')).toMatchObject({ impact: 1, label: 'Duplicates (same species within ~11 m)' });
    expect(store.ledger.find((r) => r.id === 'crossSource')).toMatchObject({
      impact: 1,
      toggleable: false,
      label: 'Same record in GBIF and OBIS',
    });
    expect(last?.ledger.find((r) => r.id === 'duplicates')?.impact).toBe(1);
    expect(last?.ledger.find((r) => r.id === 'crossSource')?.impact).toBe(1);
    expect(store.dedupeLabel).toBe('same species within ~11 m');
    expect(store.methodsText).toContain('1 duplicates of the same species within about 11 m in one source, 1 records already received');
    expect(store.insightsScope).toEqual({ kind: 'loaded', records: 3, label: 'For the query you loaded · 3 records loaded' });
    store.setYears([1980, 2025]);
    expect(store.loadedMatchesQuery).toBe(false);
    expect(store.countStory).toMatchObject({ duplicates: null, loaded: null });
    expect(store.insightsScope.kind).toBe('query');
    store.setQuality({ dedupe: 'cell' });
    expect(store.dedupeLabel).toBe('same species in one ~1 km cell');
  });

  it('names only sources that contributed records', async () => {
    vi.mocked(streamGbif).mockImplementation(batches('gbif', [[record('Callithrix jacchus', -40, -10, 'gbif', 'd1')]]));
    vi.mocked(streamObis).mockImplementation(batches('obis', []));
    const { store } = setup();
    await store.load();
    expect(store.methodsText).toContain('(GBIF)');
    expect(store.methodsText).not.toContain('OBIS');
  });

  it('drops OBIS records of low-count species and GBIF species at plan time', async () => {
    vi.mocked(streamGbif).mockImplementation(batches('gbif', [[record('Callithrix jacchus', -40, -10, 'gbif', 'd1')]]));
    vi.mocked(streamObis).mockImplementation(batches('obis', [[record('Saguinus oedipus', -75, 9, 'obis', 'o1')]]));
    const { store } = setup();
    store.setQuality({ minRecordsPerSpecies: 2 });
    await store.load();
    expect(store.job?.funnel.dropped.lowCount).toBe(1);
    expect(store.lastLoad?.kpis.records).toBe(1);
  });

  it('keeps what arrived on cancel and marks the load partial', async () => {
    let open!: () => void;
    const gate = new Promise<void>((r) => {
      open = r;
    });
    vi.mocked(streamGbif).mockImplementation(batches('gbif', [[record('Callithrix jacchus', -40, -10, 'gbif', 'd1')]]));
    vi.mocked(streamObis).mockImplementation(batches('obis', [[record('Saguinus oedipus', -75, 9, 'obis', 'o1')]], gate));
    const { store, rootStore, speciesStore } = setup();
    const running = store.load();
    await vi.waitFor(() => expect(store.job?.funnel.accepted).toBe(1));
    store.cancel('keep');
    open();
    await running;
    expect(store.job?.state).toBe('cancelled');
    // GBIF fetched 1 of 3, OBIS 0 of 2; the plans name 2 species, 1 arrived.
    expect(store.lastLoad?.partial).toEqual({
      kind: 'speciesMissing',
      planned: 5,
      accepted: 1,
      speciesLoaded: 1,
      speciesPlanned: 2,
      notReceived: 4,
      coverage: 0.5,
      // The planned species with no record, largest first, with the records planned for it.
      missingSpecies: [{ name: 'Saguinus oedipus', expected: 1 }],
    });
    // Half the species arrived: bioregions run as usual.
    expect(store.lastLoad?.bioregionsSkipped).toBeUndefined();
    expect(speciesStore.skipped).toBe(false);
    expect(store.insightsScope).toMatchObject({ kind: 'partial', records: 1 });
    expect(store.insightsScope.label).toBe('For the partial load · 1 of ~5 records loaded (1 of 2 species)');
    expect(store.lastLoad?.accepted).toBe(1);
    expect(store.lastLoad?.emptyReason).toBeUndefined();
    expect(store.methodsText).toContain(
      'Loading was stopped early: 1 of ~5 planned records (20 %) from 1 of 2 species were loaded; requests alternate packed batches',
    );
    expect(store.methodsText).toContain('The missing species is Saguinus oedipus (~1 planned records).');
    // A partial load is on the map and in the insights: both describe the loaded records.
    expect(store.recentShare.scope).toBe('loaded');
    expect(store.mapScope).toBe('loaded');
    expect(rootStore.treeStore.reset).not.toHaveBeenCalled();
  });

  it('pauses while the cancel menu is open and keeps exactly the frozen records', async () => {
    let open!: () => void;
    const more = new Promise<void>((r) => {
      open = r;
    });
    // GBIF: one batch now, a second once `more` resolves (it arrives while paused).
    vi.mocked(streamGbif).mockImplementation(async function* (_plan: StreamPlan, opts: StreamOptions) {
      yield { source: 'gbif', records: [record('Callithrix jacchus', -40, -10, 'gbif', 'd1')], progress: { fetched: 1, expected: 3, requestsDone: 1, requestsTotal: 2 } };
      await more;
      if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      yield { source: 'gbif', records: [record('Callithrix jacchus', -41, -11, 'gbif', 'd1'), record('Callithrix jacchus', -42, -12, 'gbif', 'd2')], progress: { fetched: 3, expected: 3, requestsDone: 2, requestsTotal: 2 } };
      return { fetched: 3, truncated: 0, requests: 2, reachedCap: false };
    });
    vi.mocked(streamObis).mockImplementation(batches('obis', [[record('Saguinus oedipus', -75, 9, 'obis', 'o1')]], more));
    const { store, consumed } = setup();
    const running = store.load();
    await vi.waitFor(() => expect(store.job?.funnel.accepted).toBe(1));
    store.pauseLoad();
    expect(store.job?.paused).toBe(true);
    expect(store.job?.speciesLoaded).toBe(1);
    expect(store.job?.speciesPlanned).toBe(2);
    open();
    await new Promise((r) => setTimeout(r, 30));
    // Batches arrived but none was counted or handed on.
    expect(store.job?.funnel.accepted).toBe(1);
    expect(consumed.flat()).toHaveLength(1);
    store.cancel('keep');
    await running;
    expect(store.job?.paused).toBe(false);
    expect(store.lastLoad?.accepted).toBe(1);
    expect(consumed.flat()).toHaveLength(1);
    expect(store.lastLoad?.partial).toMatchObject({ kind: 'speciesMissing', speciesLoaded: 1, speciesPlanned: 2 });
  });

  it('resumes a paused load to completion', async () => {
    let open!: () => void;
    const more = new Promise<void>((r) => {
      open = r;
    });
    vi.mocked(streamGbif).mockImplementation(batches('gbif', [[record('Callithrix jacchus', -40, -10, 'gbif', 'd1')]]));
    vi.mocked(streamObis).mockImplementation(batches('obis', [[record('Saguinus oedipus', -75, 9, 'obis', 'o1')]], more));
    const { store, consumed } = setup();
    const running = store.load();
    await vi.waitFor(() => expect(store.job?.funnel.accepted).toBe(1));
    store.pauseLoad();
    open();
    await new Promise((r) => setTimeout(r, 20));
    expect(store.job?.funnel.accepted).toBe(1);
    store.resumeLoad();
    await running;
    expect(store.job?.state).toBe('done');
    expect(consumed.flat()).toHaveLength(2);
    expect(store.lastLoad?.partial).toBeNull();
  });

  it('describes the loaded records, not the preview, once the query is loaded', async () => {
    const rec = (name: string, lon: number, basisOfRecord: string, country: string | undefined, year: number, datasetKey: string) => ({
      name,
      lon,
      lat: -10,
      source: 'gbif' as const,
      datasetKey,
      basisOfRecord,
      year,
      ...(country && { country }),
      uncertainty: lon === -40 ? 100 : 300,
    });
    vi.mocked(streamGbif).mockImplementation(
      batches('gbif', [
        [
          rec('Callithrix jacchus', -40, 'HUMAN_OBSERVATION', 'BR', 2020, 'd1'),
          rec('Callithrix jacchus', -41, 'HUMAN_OBSERVATION', 'BR', 2021, 'd1'),
          rec('Callithrix jacchus', -42, 'PRESERVED_SPECIMEN', 'PE', 1950, 'd2'),
        ],
      ]),
    );
    vi.mocked(streamObis).mockImplementation(batches('obis', [[rec('Saguinus oedipus', -75, 'HUMAN_OBSERVATION', undefined, 2019, 'o1')]]));
    const { store } = setup();
    // A preview far larger than the load must not leak into the loaded scope.
    store.sources.gbif.preview = {
      source: 'gbif',
      total: 16_772,
      species: 3,
      datasets: 1,
      yearRange: [1950, 2021],
      years: [{ year: 2020, count: 16_772 }],
      basisOfRecord: [{ key: 'HUMAN_OBSERVATION', label: 'Human observation', count: 16_772 }],
      topSpecies: [],
      topDatasets: [{ key: 'd1', label: 'eBird', count: 16_000 }],
      countries: [{ key: 'BR', label: 'Brazil', count: 16_772 }],
      issues: [{ key: 'X', label: 'X', count: 5 }],
      uncertainty: null,
      filterImpact: {},
    };
    await store.load();
    expect(store.insightsScope.kind).toBe('loaded');
    const c = store.composition;
    expect(c).toMatchObject({ scopeKind: 'loaded', total: 4, issues: [] });
    expect(c.basisOfRecord[0]).toEqual({ key: 'HUMAN_OBSERVATION', label: 'Human observation', count: 3 });
    expect(c.topDatasets[0]).toEqual({ key: 'd1', label: 'eBird', count: 2 });
    expect(c.topSpecies[0]).toEqual({ key: 'Callithrix jacchus', label: 'Callithrix jacchus', count: 3 });
    expect(c.countries).toEqual([
      { key: 'BR', label: 'Brazil', count: 2 },
      { key: 'PE', label: 'Peru', count: 1 },
    ]);
    expect(c.uncertainty).toEqual({ min: 100, max: 300, avg: 250 });
    expect(c.notes?.countries).toBe('Countries are known for 3 of 4 loaded records (OBIS records often carry no country code).');
    const flags = store.biasFlags;
    for (const f of flags) if (f.action?.cost != null) expect(f.action.cost).toBeLessThanOrEqual(4);
    expect(flags.find((f) => f.id === 'humanObservation')).toMatchObject({ value: 0.75, action: { cost: 3 } });
    expect(flags.find((f) => f.id === 'datasetDominance')).toMatchObject({ value: 0.5, action: { cost: 2 } });
    expect(flags.find((f) => f.id === 'temporalSkew')?.action?.cost).toBe(1);
    expect(flags.find((f) => f.id === 'countryConcentration')?.text).toContain('of records with a country are from Brazil');
    expect(flags.find((f) => f.id === 'lowCountSpecies')?.action).toMatchObject({ cost: 4, discouraged: true, leaves: 0 });
    // Loaded records: the overlap is gone, so nothing is approximate.
    expect(flags.some((f) => f.approximate)).toBe(false);
    // The temporal share describes the loaded records too: 3 of 4 dated records since the cutoff.
    expect(store.recentShare).toMatchObject({ scope: 'loaded', share: 0.75 });
  });

  it('shows the loaded records on the map by default until the query diverges', async () => {
    vi.mocked(streamGbif).mockImplementation(batches('gbif', [[record('Callithrix jacchus', -40, -10, 'gbif', 'd1')]]));
    vi.mocked(streamObis).mockImplementation(batches('obis', [[record('Saguinus oedipus', -75, 9, 'obis', 'o1')]]));
    const { store } = setup();
    expect(store.mapScope).toBe('query');
    store.setMapScope('loaded');
    expect(store.mapScope).toBe('query'); // nothing loaded yet
    await store.load();
    expect(store.mapScope).toBe('loaded');
    store.setMapScope('query');
    expect(store.mapScope).toBe('query');
    // Editing the query makes the load stale: back to the query, and to the default after.
    store.setYears([2000, 2025]);
    expect(store.mapScope).toBe('query');
    store.setYears([1970, 2025]);
    expect(store.mapScope).toBe('loaded');
    expect(store.recentShare.scope).toBe('loaded');
    store.setYears([2000, 2025]);
    expect(store.recentShare.scope).toBe('query');
  });

  it('keeps the year brush histogram free of the year filter', () => {
    const { store } = setup();
    const base = {
      total: 10,
      species: 1,
      datasets: 1,
      yearRange: null,
      basisOfRecord: [],
      topSpecies: [],
      topDatasets: [],
      countries: [],
      issues: [],
      uncertainty: null,
      filterImpact: {},
    };
    store.sources.gbif.preview = {
      ...base,
      source: 'gbif',
      years: [{ year: 2010, count: 10 }],
      yearsAll: [
        { year: 1950, count: 90 },
        { year: 2010, count: 10 },
      ],
    };
    store.sources.obis.preview = { ...base, source: 'obis', years: [{ year: 2010, count: 5 }], yearsAll: [{ year: 1950, count: 5 }, { year: 2010, count: 5 }] };
    store.sources.gbif.state = 'ready';
    store.sources.obis.state = 'ready';
    expect(store.mergedYearsAll).toEqual([
      { year: 1950, count: 95 },
      { year: 2010, count: 15 },
    ]);
    expect(store.yearShareAfter(2000)).toBeCloseTo(15 / 110);
  });

  it('keeps a load stopped with few species but skips bioregions until asked', async () => {
    let open!: () => void;
    const gate = new Promise<void>((r) => {
      open = r;
    });
    vi.mocked(streamGbif).mockImplementation(batches('gbif', [[record('Callithrix jacchus', -40, -10, 'gbif', 'd1')]]));
    vi.mocked(streamObis).mockImplementation(batches('obis', [[record('Saguinus oedipus', -75, 9, 'obis', 'o1')]], gate));
    const { store, speciesStore } = setup();
    vi.mocked(planSource).mockImplementation(async (id, q) => {
      if (id === 'gbif') return gbifPlan(q);
      const plan = obisPlan(q);
      return {
        ...plan,
        speciesCounts: [...(plan.speciesCounts ?? []), { key: '12', label: 'Saguinus midas', count: 1 }],
      };
    });
    const running = store.load();
    await vi.waitFor(() => expect(store.job?.funnel.accepted).toBe(1));
    store.cancel('keep');
    open();
    await running;
    // 1 of 3 planned species: below half, so Infomap does not run.
    expect(store.lastLoad?.partial?.coverage).toBeCloseTo(1 / 3);
    expect(store.lastLoad?.bioregionsSkipped).toBe(true);
    expect(speciesStore.skipped).toBe(true);
    expect(store.methodsText).toContain('Species coverage is 33 %; bioregions were not computed for this incomplete dataset.');
    await store.runBioregionsAnyway();
    expect(speciesStore.runBioregions).toHaveBeenCalledTimes(1);
    expect(store.lastLoad?.bioregionsSkipped).toBeUndefined();
    expect(store.methodsText).toContain('Species coverage is 33 %.');
  });

  it('reports live species coverage and never shrinks the request total', async () => {
    vi.mocked(streamObis).mockImplementation(batches('obis', []));
    vi.mocked(streamGbif).mockImplementation(async function* () {
      const progress = { fetched: 1, expected: 3, requestsDone: 1, requestsTotal: 3, bytes: 1, speciesDone: 0, speciesTotal: 2 };
      yield { source: 'gbif' as const, records: [record('Callithrix jacchus', -40, -10, 'gbif', 'd1')], progress };
      yield {
        source: 'gbif' as const,
        records: [record('Callithrix jacchus', -41, -10, 'gbif', 'd1')],
        progress: { ...progress, fetched: 2, requestsDone: 2, requestsTotal: 2, speciesDone: 1 },
      };
      return { fetched: 2, truncated: 0, requests: 2, reachedCap: false };
    });
    const { store } = setup();
    await store.load();
    const gbif = store.job?.perSource.find((p) => p.source === 'gbif');
    expect(gbif?.requestsTotal).toBe(3);
    expect(store.job?.speciesCoverage).toBe(0.5);
  });

  it('cites the data on screen after an empty load kept it', async () => {
    vi.mocked(streamGbif).mockImplementation(batches('gbif', [[record('Callithrix jacchus', -40, -10, 'gbif', 'd1')]]));
    vi.mocked(streamObis).mockImplementation(batches('obis', []));
    const { store } = setup();
    await store.load();
    const methods = store.methodsText;
    const csv = store.datasetCsv;
    const ledgerCsv = store.ledgerCsv;
    vi.mocked(streamGbif).mockImplementation(batches('gbif', []));
    store.setYears([1980, 2025]);
    await store.load();
    expect(store.rootStore.dataStore.job?.outcome).toEqual({ emptyReason: 'noMatches', previousKept: true });
    expect(store.loaded?.accepted).toBe(1);
    expect(store.methodsText).toBe(methods);
    expect(store.methodsText).toContain('recorded 1970–2025');
    expect(store.datasetCsv).toBe(csv);
    expect(store.ledgerCsv).toBe(ledgerCsv);
    expect(store.obisCitation).toBe(store.obisCitation);
  });

  it('lists the plan species once and counts entries without a usable name', async () => {
    const { store } = setup();
    vi.mocked(planSource).mockImplementation(async (id, q) => {
      if (id === 'obis') return obisPlan(q);
      // Two GBIF species keys with one name (Callithrix geoffroyi has two), and a hybrid.
      const species = [
        { key: 1, name: 'Callithrix jacchus', count: 3 },
        { key: 2, name: 'Callithrix jacchus', count: 1 },
        { key: 3, name: 'Callithrix jacchus × penicillata', count: 1 },
      ];
      return { ...gbifPlan(q), detail: { species, total: 5 } };
    });
    const names = await store.querySpecies();
    expect(names).toEqual(['Callithrix jacchus', 'Saguinus oedipus']);
    expect(store.speciesWithoutName).toBe(1);
  });

  it('aborts on a discard before the first record and keeps no provenance', async () => {
    let open!: () => void;
    const gate = new Promise<void>((r) => {
      open = r;
    });
    vi.mocked(streamGbif).mockImplementation(batches('gbif', [[record('Callithrix jacchus', -40, -10, 'gbif', 'd1')]], gate));
    vi.mocked(streamObis).mockImplementation(batches('obis', [], gate));
    const { store, rootStore } = setup();
    const running = store.load();
    await vi.waitFor(() => expect(store.job?.state).toBe('streaming'));
    store.cancel('discard');
    open();
    await running;
    expect(store.job?.state).toBe('cancelled');
    expect(store.lastLoad).toBeNull();
    expect(store.rootStore.dataStore.occurrence).toBeNull();
    expect(rootStore.treeStore.reset).not.toHaveBeenCalled();
    // SpeciesStore reads the reason to skip binning and Infomap.
    const opts = vi.mocked(rootStore.speciesStore.loadRecords).mock.calls[0][1];
    expect(opts?.controller?.signal.reason).toBe('discard');
  });

  it('ends a load that matched nothing as an empty, non-success load', async () => {
    vi.mocked(streamGbif).mockImplementation(batches('gbif', []));
    vi.mocked(streamObis).mockImplementation(batches('obis', []));
    const { store, rootStore } = setup();
    await store.load();
    expect(store.job?.state).toBe('error');
    expect(store.job?.error).toBe('No records matched this query');
    expect(store.loaded).toBeNull();
    expect(store.rootStore.dataStore.occurrence).toBeNull();
    expect(store.rootStore.dataStore.job?.outcome).toEqual({ emptyReason: 'noMatches', previousKept: false });
    expect(store.recent).toHaveLength(0);
    expect(rootStore.treeStore.reset).not.toHaveBeenCalled();
  });

  it('reports a load whose records were all dropped, and that the previous dataset was kept', async () => {
    // First a real load, then a query whose only record falls outside the area.
    vi.mocked(streamGbif).mockImplementation(batches('gbif', [[record('Callithrix jacchus', -40, -10, 'gbif', 'd1')]]));
    vi.mocked(streamObis).mockImplementation(batches('obis', []));
    const { store } = setup();
    await store.load();
    const first = store.loaded;
    expect(first?.accepted).toBe(1);
    vi.mocked(streamGbif).mockImplementation(batches('gbif', [[record('Callithrix jacchus', 100, 10, 'gbif', 'd1')]]));
    store.setYears([1980, 2025]);
    await store.load();
    expect(store.job?.state).toBe('error');
    expect(store.job?.error).toBe('Cleaning removed every record');
    expect(store.loaded).toBe(first);
    expect(store.rootStore.dataStore.job?.outcome).toEqual({ emptyReason: 'allDropped', previousKept: true });
    expect(store.recent).toHaveLength(1);
  });

  it('marks a load cancelled before any record arrived', async () => {
    let open!: () => void;
    const gate = new Promise<void>((r) => {
      open = r;
    });
    vi.mocked(streamGbif).mockImplementation(batches('gbif', [[record('Callithrix jacchus', -40, -10, 'gbif', 'd1')]], gate));
    vi.mocked(streamObis).mockImplementation(batches('obis', [], gate));
    const { store, rootStore } = setup();
    const running = store.load();
    await vi.waitFor(() => expect(store.job?.state).toBe('streaming'));
    store.cancel('keep');
    open();
    await running;
    expect(store.job?.state).toBe('cancelled');
    expect(store.loaded).toBeNull();
    expect(store.rootStore.dataStore.occurrence).toBeNull();
    expect(store.rootStore.dataStore.job?.outcome).toEqual({ emptyReason: 'cancelledEarly', previousKept: false });
    expect(store.rootStore.dataStore.job?.funnel).toMatchObject({ received: 0, accepted: 0 });
    expect(rootStore.treeStore.reset).not.toHaveBeenCalled();
  });

  it('reports a failing source and keeps the other', async () => {
    vi.mocked(streamGbif).mockImplementation(batches('gbif', [[record('Callithrix jacchus', -40, -10, 'gbif', 'd1')]]));
    vi.mocked(streamObis).mockImplementation(async function* () {
      yield* [];
      throw new Error('HTTP 502 from OBIS');
    });
    const { store } = setup();
    await store.load();
    expect(store.job?.state).toBe('done');
    expect(store.job?.error).toContain('OBIS');
    expect(store.job?.perSource.find((p) => p.source === 'obis')?.state).toBe('error');
    expect(store.lastLoad?.partial).not.toBeNull();
  });
});

describe('DataStore stream loads (S2a)', () => {
  const gbifOne = () => batches('gbif', [[record('Callithrix jacchus', -40, -10, 'gbif', 'd1')]]);

  it('replaces a GBIF query load with an example: one card, and no GBIF citation left', async () => {
    vi.mocked(streamGbif).mockImplementation(gbifOne());
    vi.mocked(streamObis).mockImplementation(batches('obis', []));
    const { store, dataStore } = setup();
    await store.load();
    expect(dataStore.sources.map((s) => s.kind)).toEqual(['explorer-query']);
    expect(dataStore.citations.map((c) => c.kind)).toEqual(['gbif']);
    expect(dataStore.methodsText).toContain('GBIF.org');
    await dataStore.loadInline({ label: 'Demo', csv: 'species,longitude,latitude\nA a,1,2' });
    expect(dataStore.sources.map((s) => s.kind)).toEqual(['example']);
    expect(dataStore.citations).toEqual([]);
    expect(dataStore.methodsText).not.toContain('GBIF');
    expect(store.loaded).toBeNull();
    expect(store.lastLoad).toBeNull();
  });

  it('discards before the first record without touching the previous source or data', async () => {
    vi.mocked(streamGbif).mockImplementation(gbifOne());
    vi.mocked(streamObis).mockImplementation(batches('obis', []));
    const { store, dataStore, speciesStore } = setup();
    await store.load();
    const first = dataStore.occurrence;
    const loaded = store.loaded;
    speciesStore.clearData.mockClear();
    let open!: () => void;
    const gate = new Promise<void>((r) => {
      open = r;
    });
    vi.mocked(streamGbif).mockImplementation(batches('gbif', [[record('Saguinus oedipus', -70, 5, 'gbif', 'd2')]], gate));
    vi.mocked(streamObis).mockImplementation(batches('obis', [], gate));
    store.setYears([1980, 2025]);
    const running = store.load();
    await vi.waitFor(() => expect(dataStore.job?.state).toBe('streaming'));
    dataStore.cancel('discard');
    open();
    await running;
    expect(dataStore.occurrence).toBe(first);
    expect(store.loaded).toBe(loaded);
    expect(speciesStore.clearData).not.toHaveBeenCalled();
    expect(dataStore.job).toMatchObject({ state: 'cancelled', outcome: { emptyReason: 'cancelledEarly', previousKept: true } });
  });

  it('removes the committed source and its data on a discard after the first record', async () => {
    let open!: () => void;
    const gate = new Promise<void>((r) => {
      open = r;
    });
    vi.mocked(streamGbif).mockImplementation(gbifOne());
    vi.mocked(streamObis).mockImplementation(batches('obis', [[]], gate));
    const { store, dataStore, speciesStore, rootStore } = setup();
    const running = store.load();
    await vi.waitFor(() => expect(dataStore.occurrence?.status).toBe('loading'));
    speciesStore.clearData.mockClear();
    store.cancel('discard');
    open();
    await running;
    expect(dataStore.job?.state).toBe('cancelled');
    expect(dataStore.occurrence).toBeNull();
    expect(speciesStore.clearData).toHaveBeenCalledTimes(1);
    expect(rootStore.treeStore.reset).not.toHaveBeenCalled();
    expect(store.recent).toHaveLength(0);
  });

  it('commits a loading source with no provenance and settles it at the finish', async () => {
    let open!: () => void;
    const gate = new Promise<void>((r) => {
      open = r;
    });
    vi.mocked(streamGbif).mockImplementation(gbifOne());
    vi.mocked(streamObis).mockImplementation(batches('obis', [[]], gate));
    const { store, dataStore } = setup();
    store.open();
    const running = store.load();
    await vi.waitFor(() => expect(dataStore.occurrence?.status).toBe('loading'));
    const source = dataStore.occurrence;
    expect(source).toMatchObject({ kind: 'explorer-query', status: 'loading', provenance: null, completedAt: null, cap: store.cap });
    expect(store.loaded).toBeNull();
    expect(store.lastLoad).toBeNull();
    expect(store.loadedMatchesQuery).toBe(false);
    expect(store.methodsText).toBe('');
    expect(dataStore.methodsText).toBe(`Loading ${store.querySummary}…`);
    expect(dataStore.citations).toEqual([]);
    // Close hides the portal; the load keeps running (D4).
    store.close();
    expect(dataStore.job?.state).toBe('streaming');
    // One occurrence load at a time (I9).
    const request = {
      query: structuredClone(QUERY),
      cap: 10,
      origin: 'search' as const,
      plan: async () => [],
      labels: { datasets: new Map(), basisOfRecord: new Map(), countries: new Map() },
      ledger: [],
      ledgerBase: null,
    };
    expect(await dataStore.loadQuery(request)).toEqual({ started: false, reason: LOAD_RUNNING });
    expect(await store.load()).toMatchObject({ started: false });
    open();
    await running;
    const done = dataStore.occurrence;
    expect(done).toMatchObject({ id: source?.id, status: 'done', retrievedAt: source?.retrievedAt });
    expect(done?.completedAt).not.toBeNull();
    expect(store.loaded).toMatchObject({ accepted: 1, retrievedAt: source?.retrievedAt, cap: store.cap, stop: null });
    expect(dataStore.runs.has(source?.id ?? '')).toBe(true);
    // dirty and loadedMatchesQuery read the loaded source.
    expect(store.dirty.size).toBe(0);
    expect(store.loadedMatchesQuery).toBe(true);
    store.setYears([1980, 2025]);
    expect(store.dirty.has('years')).toBe(true);
    expect(store.loadedMatchesQuery).toBe(false);
    store.resetToLoaded();
    expect(store.dirty.size).toBe(0);
  });

  it('plans another query without touching the workspace plans', async () => {
    const { store } = setup();
    const internals = store as unknown as { rawPlans: unknown; planController: unknown };
    const before = { plans: store.plans, raw: internals.rawPlans, controller: internals.planController };
    const other: OccurrenceQuery = { ...structuredClone(QUERY), years: [1990, 2000] };
    const plans = await store.planQuery(other, 100, new AbortController().signal);
    expect(plans.map((p) => p.source)).toEqual(['gbif', 'obis']);
    expect(vi.mocked(planSource)).toHaveBeenCalledWith('gbif', other, 100, expect.any(AbortSignal));
    expect(store.plans).toBe(before.plans);
    expect(internals.rawPlans).toBe(before.raw);
    expect(internals.planController).toBe(before.controller);
  });

  it('has no add mode and no minimized state', () => {
    const { store } = setup();
    store.setLoadMode('add');
    expect(store.loadMode).toBe('replace');
    expect(() => {
      // @ts-expect-error loadMode is read-only: every load replaces.
      store.loadMode = 'add';
    }).toThrow();
    store.open();
    store.setMinimized(true);
    expect(store.isOpen).toBe(false);
    expect(store.minimized).toBe(false);
    expect(() => {
      // @ts-expect-error minimized is read-only: the portal is open or closed.
      store.minimized = true;
    }).toThrow();
  });
});
