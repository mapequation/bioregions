// GBIF download zips through DataStore.loadGbifZip and DOI patches through
// DataStore.patchOccurrence (spec §2.2, §2.4, §3 paths 3, 9, 10, 11), with a mocked zip
// reader and a fake SpeciesStore.
import { describe, expect, it, vi } from 'vitest';
import type { GbifZipSummary } from '../../sources/gbif/zip';
import type { OccurrenceQuery, OccurrenceRecord } from '../../sources/types';
import DataStore, { LOAD_RUNNING } from '../DataStore';
import type RootStore from '../RootStore';
import type { LoadProvenance } from '../explorer/provenance';
import type { QueryOccurrences, ZipOccurrences } from './types';

vi.mock('../../sources/gbif/zip', async (orig) => ({
  ...(await orig<typeof import('../../sources/gbif/zip')>()),
  importGbifZip: vi.fn(),
}));

const { importGbifZip } = await import('../../sources/gbif/zip');

const QUERY: OccurrenceQuery = {
  taxa: [{ name: 'Callitrichidae', rank: 'FAMILY', gbifKey: 9620, obisId: 1 }],
  area: { kind: 'world' },
  years: [null, null],
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
  sources: { gbif: true, obis: false },
};

const SUMMARY: GbifZipSummary = {
  downloadKey: '0001234-260101120000000',
  rows: 4,
  absent: 1,
  introduced: 0,
  format: 'SIMPLE_CSV',
  citation: 'GBIF.org (1 January 2026) GBIF Occurrence Download https://doi.org/10.15468/dl.abc123',
  doi: '10.15468/dl.abc123',
};

const rec = (name: string, lon: number, lat: number): OccurrenceRecord => ({ name, lon, lat, source: 'gbif', datasetKey: 'd1', year: 2000 });

/** Two identical records and one more: `dedupe: 'none'` keeps 3, the query's 'exact' keeps 2. */
const RECORDS = [rec('Callithrix jacchus', -40, -10), rec('Callithrix jacchus', -40, -10), rec('Saguinus oedipus', -75, 9)];

function mockZip(records: OccurrenceRecord[], summary: GbifZipSummary = SUMMARY, gate?: Promise<void>) {
  vi.mocked(importGbifZip).mockImplementation(async function* (_file, opts = {}) {
    if (gate) await gate;
    if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (records.length > 0) yield { source: 'gbif', records, progress: { fetched: records.length } } as never;
    return summary;
  });
}

function setup() {
  /** The occurrence source as it was right after the commit. */
  const atCommit: { source: unknown } = { source: null };
  const speciesStore = {
    loaded: false,
    numRecords: 0,
    numSpecies: 0,
    numPolygonsDebounced: 0,
    speciesMap: new Map<string, unknown>(),
    clearData: vi.fn(),
    cancelLoad: vi.fn(),
    loadRecords: vi.fn(
      async (iter: AsyncIterable<OccurrenceRecord[]>, opts: { controller: AbortController; onFirstRecord?: () => void }) => {
        let received = 0;
        for await (const b of iter) {
          if (opts.controller.signal.aborted) break;
          if (received === 0) {
            opts.onFirstRecord?.();
            atCommit.source = rootStore.dataStore.occurrence;
          }
          received += b.length;
        }
        speciesStore.numRecords = received;
        if (received > 0) speciesStore.loaded = true;
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
  return { dataStore: rootStore.dataStore, rootStore, speciesStore, atCommit };
}

const file = () => new File(['zip'], '0001234-260101120000000.zip', { type: 'application/zip' });

describe('DataStore.loadGbifZip', () => {
  it('loads a standalone zip as it is and settles its download summary at the finish', async () => {
    mockZip(RECORDS);
    const { dataStore, speciesStore, atCommit } = setup();
    const result = await dataStore.loadGbifZip(file());
    expect(result).toEqual({ started: true, committed: true });
    // dedupe 'none': the duplicate record is kept.
    expect(speciesStore.numRecords).toBe(3);
    expect(atCommit.source).toMatchObject({ kind: 'gbif-zip', status: 'loading', download: null, provenance: null });
    const source = dataStore.occurrence as ZipOccurrences;
    expect(source).toMatchObject({
      kind: 'gbif-zip',
      status: 'done',
      label: 'GBIF download 0001234-260101120000000',
      file: { name: '0001234-260101120000000.zip' },
      download: { key: SUMMARY.downloadKey, doi: SUMMARY.doi, format: 'SIMPLE_CSV', rows: 4, absent: 1 },
      provenance: null,
    });
    expect(dataStore.job).toMatchObject({ kind: 'zip', state: 'done', origin: 'upload', committed: true });
    expect(vi.mocked(importGbifZip).mock.calls[0][1]).toMatchObject({ excludeIntroduced: false });
    speciesStore.numSpecies = 2;
    expect(dataStore.methodsText).toBe(
      'Occurrence records were taken from GBIF download 0001234-260101120000000 (SIMPLE_CSV; 4 rows, 1 absence records skipped; 3 records of 2 species kept).',
    );
    expect(dataStore.citations).toEqual([expect.objectContaining({ kind: 'gbif-download', text: SUMMARY.citation, doi: SUMMARY.doi })]);
  });

  it('a "Replace" against the loaded query cleans like the query and sets its provenance at the finish', async () => {
    mockZip(RECORDS);
    const { dataStore, speciesStore, atCommit } = setup();
    await dataStore.loadGbifZip(file(), { origin: 'search', query: QUERY, download: SUMMARY });
    expect(speciesStore.numRecords).toBe(2);
    expect(atCommit.source).toMatchObject({ status: 'loading', download: null, provenance: null });
    const source = dataStore.occurrence as ZipOccurrences;
    expect(source.status).toBe('done');
    expect(source.download).toMatchObject({ key: SUMMARY.downloadKey, doi: SUMMARY.doi });
    expect(source.provenance).toMatchObject({
      query: QUERY,
      accepted: 2,
      partial: null,
      fromZip: true,
      gbifDownloadKey: SUMMARY.downloadKey,
      gbifDownloadDoi: SUMMARY.doi,
    });
    expect(source.provenance?.funnel.dropped.duplicate).toBe(1);
  });

  it('refuses while a load runs (I9)', async () => {
    let open = () => {};
    const gate = new Promise<void>((r) => {
      open = r;
    });
    mockZip(RECORDS, SUMMARY, gate);
    const { dataStore } = setup();
    const first = dataStore.loadGbifZip(file());
    expect(dataStore.isLoading).toBe(true);
    expect(await dataStore.loadGbifZip(file())).toEqual({ started: false, reason: LOAD_RUNNING });
    open();
    await first;
    expect(dataStore.isLoading).toBe(false);
  });

  it('an empty zip commits nothing (I6)', async () => {
    mockZip([]);
    const { dataStore, speciesStore } = setup();
    expect(await dataStore.loadGbifZip(file())).toEqual({ started: true, committed: false });
    expect(dataStore.occurrence).toBeNull();
    expect(speciesStore.clearData).not.toHaveBeenCalled();
    expect(dataStore.job).toMatchObject({ state: 'error', error: 'No records matched this query' });
  });

  it('a read error before the first record leaves the slots untouched', async () => {
    vi.mocked(importGbifZip).mockImplementation(async function* () {
      const fail = true;
      if (fail) throw new Error('Not a GBIF occurrence table: missing species');
      yield* [];
      return SUMMARY;
    });
    const { dataStore } = setup();
    await dataStore.loadGbifZip(file());
    expect(dataStore.occurrence).toBeNull();
    expect(dataStore.job).toMatchObject({ state: 'error', error: expect.stringContaining('Not a GBIF occurrence table') });
  });

  it('a read error after the commit keeps the records as a partial load that cites no download', async () => {
    vi.mocked(importGbifZip).mockImplementation(async function* () {
      yield { source: 'gbif', records: RECORDS, progress: { fetched: RECORDS.length } } as never;
      throw new Error('invalid stored block lengths');
    });
    const { dataStore } = setup();
    await dataStore.loadGbifZip(file(), { origin: 'search', query: QUERY, download: SUMMARY });
    const source = dataStore.occurrence as ZipOccurrences;
    expect(source.status).toBe('done');
    expect(source.download).toBeNull();
    expect(source.provenance?.partial).not.toBeNull();
    expect(source.provenance?.gbifDownloadDoi).toBeUndefined();
    expect(dataStore.job).toMatchObject({ state: 'error', error: expect.stringContaining('invalid stored block lengths') });
    expect(dataStore.methodsText).not.toContain(SUMMARY.doi);
    expect(JSON.stringify(dataStore.citations)).not.toContain(SUMMARY.doi);
  });

  it('a discard after the commit removes the occurrences and keeps the tree', async () => {
    let open = () => {};
    const gate = new Promise<void>((r) => {
      open = r;
    });
    vi.mocked(importGbifZip).mockImplementation(async function* (_file, opts = {}) {
      yield { source: 'gbif', records: RECORDS, progress: { fetched: 3 } } as never;
      await gate;
      if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      yield { source: 'gbif', records: [rec('Mico argentatus', -50, -5)], progress: { fetched: 4 } } as never;
      return SUMMARY;
    });
    const { dataStore, rootStore, atCommit } = setup();
    const load = dataStore.loadGbifZip(file());
    await vi.waitFor(() => expect(atCommit.source).not.toBeNull());
    dataStore.cancel('discard');
    open();
    await load;
    expect(dataStore.occurrence).toBeNull();
    expect(dataStore.job?.state).toBe('cancelled');
    expect(rootStore.treeStore.reset).not.toHaveBeenCalled();
  });
});

describe('DataStore.patchOccurrence', () => {
  function loadedQuery(dataStore: DataStore): QueryOccurrences {
    const provenance = { query: QUERY, accepted: 3, fromZip: false } as unknown as LoadProvenance;
    const source: QueryOccurrences = {
      id: dataStore.mintSourceId(),
      role: 'occurrences',
      kind: 'explorer-query',
      label: 'Callitrichidae',
      exportName: 'Callitrichidae',
      status: 'done',
      retrievedAt: '2026-10-31T00:00:00.000Z',
      completedAt: '2026-10-31T00:01:00.000Z',
      query: QUERY,
      cap: 1000,
      provenance,
      resumable: false,
    };
    dataStore.commitOccurrence(source);
    return source;
  }

  it('"keep the stream, cite the DOI" patches only the download DOIs of the same source', () => {
    const { dataStore } = setup();
    const before = loadedQuery(dataStore);
    expect(dataStore.patchOccurrence(before.id, { gbifDownloadKey: SUMMARY.downloadKey, gbifDownloadDoi: SUMMARY.doi })).toBe(true);
    const after = dataStore.occurrence as QueryOccurrences;
    expect(after.id).toBe(before.id);
    expect(after.provenance).toEqual({ ...before.provenance, gbifDownloadKey: SUMMARY.downloadKey, gbifDownloadDoi: SUMMARY.doi });
    expect({ ...after, provenance: null }).toEqual({ ...before, provenance: null });
  });

  it('sets and clears a derived-dataset DOI', () => {
    const { dataStore } = setup();
    const { id } = loadedQuery(dataStore);
    dataStore.patchOccurrence(id, { derivedDoi: '10.15468/dd.xyz' });
    expect((dataStore.occurrence as QueryOccurrences).provenance?.derivedDoi).toBe('10.15468/dd.xyz');
    dataStore.patchOccurrence(id, { derivedDoi: undefined });
    expect((dataStore.occurrence as QueryOccurrences).provenance?.derivedDoi).toBeUndefined();
  });

  it('refuses another id, and a derived DOI on a zip without a query', async () => {
    mockZip(RECORDS);
    const { dataStore } = setup();
    await dataStore.loadGbifZip(file());
    const zip = dataStore.occurrence as ZipOccurrences;
    expect(dataStore.patchOccurrence('src-999', { derivedDoi: '10.1/x' })).toBe(false);
    expect(dataStore.patchOccurrence(zip.id, { derivedDoi: '10.1/x' })).toBe(false);
    expect(dataStore.patchOccurrence(zip.id, { gbifDownloadDoi: '10.15468/dl.other' })).toBe(true);
    expect((dataStore.occurrence as ZipOccurrences).download?.doi).toBe('10.15468/dl.other');
  });
});
