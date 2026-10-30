// ExplorerStore load, cancel, download and library flows with mocked sources.
import { describe, expect, it, vi } from 'vitest';
import type { GbifPlanDetail } from '../../sources/gbif/stream';
import type { OccurrenceQuery, RecordBatch, StreamOptions, StreamPlan } from '../../sources/types';
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
vi.mock('./plan', async (orig) => ({
  ...(await orig<typeof import('./plan')>()),
  planSource: vi.fn(),
}));
vi.mock('../../sources/gbif/download', async (orig) => ({
  ...(await orig<typeof import('../../sources/gbif/download')>()),
  requestGbifDownload: vi.fn(),
  getGbifDownload: vi.fn(),
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
const { planSource } = await import('./plan');
const { requestGbifDownload, getGbifDownload, GbifDownloadError } = await import('../../sources/gbif/download');

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
  let loadedName = '';
  const speciesStore = {
    collection: { features: [] as unknown[] },
    loaded: false,
    numRecords: 0,
    skipped: null as boolean | null,
    runBioregions: vi.fn(async () => {}),
    loadRecords: vi.fn(
      async (
        iter: AsyncIterable<{ name: string }[]>,
        opts: { name: string; controller: AbortController; skipBioregions?: () => boolean },
      ) => {
      loadedName = opts.name;
      let received = 0;
      for await (const b of iter) {
        if (opts.controller.signal.aborted) break;
        consumed.push(b);
        received += b.length;
      }
      if (received > 0) speciesStore.loaded = true;
      if (received > 0 && opts.controller.signal.reason !== 'discard') speciesStore.skipped = opts.skipBioregions?.() ?? false;
      return { received };
      },
    ),
  };
  const rootStore = { clearData: vi.fn(), speciesStore } as unknown as RootStore;
  const store = new ExplorerStore(rootStore);
  store.query = structuredClone(QUERY);
  vi.mocked(planSource).mockImplementation(async (id, q) => (id === 'gbif' ? gbifPlan(q) : obisPlan(q)));
  return { store, rootStore, speciesStore, consumed, name: () => loadedName };
}

describe('ExplorerStore.load', () => {
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
    const { store, consumed, name } = setup();
    await store.load();
    expect(name()).toBe(store.querySummary);
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
    expect(store.countStory).toMatchObject({ speciesLevel: store.estimate?.records, duplicates: 2, crossSource: 1, loaded: 3 });
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
      planned: 5,
      accepted: 1,
      speciesLoaded: 1,
      speciesPlanned: 2,
      notReceived: 4,
      coverage: 0.5,
    });
    // Half the species arrived: bioregions run as usual.
    expect(store.lastLoad?.bioregionsSkipped).toBeUndefined();
    expect(speciesStore.skipped).toBe(false);
    expect(store.insightsScope).toMatchObject({ kind: 'partial', records: 1 });
    expect(store.insightsScope.label).toBe('For the partial load · 1 of ~5 records loaded (1 of 2 species)');
    expect(store.lastLoad?.accepted).toBe(1);
    expect(store.lastLoad?.emptyReason).toBeUndefined();
    expect(store.methodsText).toContain(
      'Loading was stopped early: 1 of ~5 planned records (20 %) from 1 of 2 species were loaded; because records stream species by species',
    );
    expect(rootStore.clearData).not.toHaveBeenCalled();
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
    expect(store.lastLoad).toMatchObject({ accepted: 0, previousKept: true });
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

  it('clears the data on discard and keeps no provenance', async () => {
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
    expect(rootStore.clearData).toHaveBeenCalled();
    // SpeciesStore reads the reason to skip binning and Infomap.
    const opts = vi.mocked(rootStore.speciesStore.loadRecords).mock.calls[0][1];
    expect(opts.controller?.signal.reason).toBe('discard');
  });

  it('ends a load that matched nothing as an empty, non-success load', async () => {
    vi.mocked(streamGbif).mockImplementation(batches('gbif', []));
    vi.mocked(streamObis).mockImplementation(batches('obis', []));
    const { store, rootStore } = setup();
    await store.load();
    expect(store.job?.state).toBe('error');
    expect(store.job?.error).toBe('No records matched this query');
    expect(store.lastLoad).toMatchObject({ accepted: 0, emptyReason: 'noMatches', previousKept: false, partial: null });
    expect(store.recent).toHaveLength(0);
    expect(rootStore.clearData).not.toHaveBeenCalled();
  });

  it('reports a load whose records were all dropped, and that the previous dataset was kept', async () => {
    // First a real load, then a query whose only record falls outside the area.
    vi.mocked(streamGbif).mockImplementation(batches('gbif', [[record('Callithrix jacchus', -40, -10, 'gbif', 'd1')]]));
    vi.mocked(streamObis).mockImplementation(batches('obis', []));
    const { store } = setup();
    await store.load();
    const first = store.lastLoad;
    expect(first?.accepted).toBe(1);
    vi.mocked(streamGbif).mockImplementation(batches('gbif', [[record('Callithrix jacchus', 100, 10, 'gbif', 'd1')]]));
    store.setYears([1980, 2025]);
    await store.load();
    expect(store.job?.state).toBe('error');
    expect(store.job?.error).toBe('Cleaning removed every record');
    expect(store.lastLoad).toMatchObject({ accepted: 0, emptyReason: 'allDropped', previousKept: true });
    expect((store.lastLoad as { previous?: unknown }).previous).toBe(first);
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
    expect(store.lastLoad).toMatchObject({ accepted: 0, emptyReason: 'cancelledEarly', previousKept: false });
    expect(store.lastLoad?.partial).toMatchObject({ planned: 5, accepted: 0, speciesLoaded: 0, notReceived: 5 });
    expect(rootStore.clearData).not.toHaveBeenCalled();
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

describe('ExplorerStore citation and library', () => {
  it('keeps the download error for the dialog and never stores the password', async () => {
    const { store } = setup();
    vi.mocked(requestGbifDownload).mockRejectedValueOnce(new GbifDownloadError('GBIF rejected the login.', 401));
    await store.requestDownload({ user: 'u', password: 'secret', email: '' });
    expect(store.downloadRequest).toEqual({ state: 'error', error: 'GBIF rejected the login.' });
    vi.mocked(requestGbifDownload).mockResolvedValueOnce('0012345-261030123456789');
    await store.requestDownload({ user: 'u', password: 'secret', email: 'a@b.c' });
    expect(store.downloads[0]).toMatchObject({ key: '0012345-261030123456789', status: 'PREPARING' });
    expect(JSON.stringify(store.downloads)).not.toContain('secret');
    vi.mocked(getGbifDownload).mockResolvedValueOnce({
      key: '0012345-261030123456789',
      status: 'SUCCEEDED',
      doi: '10.15468/dl.abc123',
      totalRecords: 10,
    });
    await store.pollDownloads();
    expect(store.downloads[0]).toMatchObject({ status: 'SUCCEEDED', doi: '10.15468/dl.abc123' });
    expect(store.methodsText).toContain('https://doi.org/10.15468/dl.abc123');
    store.dispose();
  });

  it('saves, restores, imports and exports queries', () => {
    const { store } = setup();
    store.saveQuery('Marmosets');
    const id = store.saved[0].id;
    store.importQueryJson(JSON.stringify({ ...QUERY, years: [2000, 2010] }));
    expect(store.query.years).toEqual([2000, 2010]);
    expect(store.importQueryJson('{"area": 3}').ok).toBe(false);
    store.restore(id);
    expect(store.query.years).toEqual([1970, 2025]);
    expect(JSON.parse(store.exportQueryJson()).taxa[0].name).toBe('Callitrichidae');
    store.restore(store.examples[1].id);
    expect(store.query.taxa[0].name).toBe('Felidae');
    store.deleteSaved(id);
    expect(store.saved).toHaveLength(0);
    store.dispose();
  });
});
