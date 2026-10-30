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
  const rootStore = {
    clearData: vi.fn(),
    speciesStore: {
      collection: { features: [] as unknown[] },
      loadRecords: vi.fn(async (iter: AsyncIterable<{ name: string }[]>, opts: { name: string; controller: AbortController }) => {
        loadedName = opts.name;
        for await (const b of iter) {
          if (opts.controller.signal.aborted) break;
          consumed.push(b);
        }
      }),
    },
  } as unknown as RootStore;
  const store = new ExplorerStore(rootStore);
  store.query = structuredClone(QUERY);
  vi.mocked(planSource).mockImplementation(async (id, q) => (id === 'gbif' ? gbifPlan(q) : obisPlan(q)));
  return { store, rootStore, consumed, name: () => loadedName };
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
    expect(store.job?.funnel.dropped.duplicate).toBe(2);
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
    expect(store.countStory).toMatchObject({ speciesLevel: store.estimate?.records, duplicates: 2, loaded: 3 });
    expect(store.ledger.find((r) => r.id === 'duplicates')?.impact).toBe(2);
    expect(last?.ledger.find((r) => r.id === 'duplicates')?.impact).toBe(2);
    store.setYears([1980, 2025]);
    expect(store.loadedMatchesQuery).toBe(false);
    expect(store.countStory).toMatchObject({ duplicates: null, loaded: null });
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
    const { store, rootStore } = setup();
    const running = store.load();
    await vi.waitFor(() => expect(store.job?.funnel.accepted).toBe(1));
    store.cancel('keep');
    open();
    await running;
    expect(store.job?.state).toBe('cancelled');
    expect(store.lastLoad?.partial).toEqual({ planned: 5, accepted: 1 });
    expect(store.methodsText).toContain('Loading was stopped early');
    expect(rootStore.clearData).not.toHaveBeenCalled();
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
