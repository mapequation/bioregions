// ExplorerStore download and library flows with mocked sources (the stream-load tests live in
// src/store/data/streamLoad.test.ts).
import { describe, expect, it, vi } from 'vitest';
import type { GbifPlanDetail } from '../../sources/gbif/stream';
import type { OccurrenceQuery, StreamPlan } from '../../sources/types';
import ExplorerStore from '../ExplorerStore';
import type RootStore from '../RootStore';

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
    // No methods draft before a load (I4); the download still cites the query.
    expect(store.methodsText).toBe('');
    expect(store.citingDownload?.doi).toBe('10.15468/dl.abc123');
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
