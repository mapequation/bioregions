// SpeciesStore.loadRecords: the commit on the first record, the no-records path and
// discard, with the data owner, map and Infomap stores mocked.
import { action, observable } from 'mobx';
import { describe, expect, it, vi } from 'vitest';
import type RootStore from './RootStore';
import SpeciesStore from './SpeciesStore';

type Rec = { name: string; lon: number; lat: number };

function setup() {
  const mapStore = {
    setRenderType: vi.fn(),
    renderMultiPoint: vi.fn(),
    renderShape: vi.fn(),
    render: vi.fn(),
  };
  const infomapStore = { run: vi.fn(async () => true), clearData: vi.fn() };
  // The data owner: its occurrence source names the data (SpeciesStore.name).
  const dataStore = observable({ occurrence: null as { exportName: string } | null }, { occurrence: observable.ref });
  const rootStore = { mapStore, infomapStore, dataStore } as unknown as RootStore;
  const store = new SpeciesStore(rootStore);
  rootStore.speciesStore = store;
  /** Like `DataStore.commitOccurrence`: clear the previous data and swap the source. */
  const commit = (exportName: string) =>
    action(() => {
      store.clearData();
      dataStore.occurrence = { exportName };
    });
  return { store, mapStore, infomapStore, dataStore, commit };
}

async function* stream(list: Rec[][], hooks: { before?: (i: number) => void | Promise<void> } = {}) {
  for (const [i, batch] of list.entries()) {
    await hooks.before?.(i);
    yield batch;
  }
}

const rec = (name: string, lon = 10, lat = 50): Rec => ({ name, lon, lat });

/** Load one dataset so the store holds something to keep or replace. */
async function seed(store: SpeciesStore, commit: (name: string) => () => void) {
  await store.loadRecords(stream([[rec('Old one'), rec('Old two', 11, 51)]]), { onFirstRecord: commit('old') });
  expect(store.collection.features).toHaveLength(2);
}

describe('SpeciesStore.loadRecords', () => {
  it('commits only when the first record arrives, in the same action', async () => {
    const { store, infomapStore, commit } = setup();
    await seed(store, commit);
    infomapStore.run.mockClear();
    const seen: number[] = [];
    const onFirstRecord = vi.fn(commit('new'));
    const result = await store.loadRecords(
      stream([[], [rec('New one')], [rec('New two')]], {
        // Before each batch: the old data stays until a batch with a record arrived.
        before: () => {
          seen.push(store.collection.features.length);
        },
      }),
      { onFirstRecord },
    );
    expect(onFirstRecord).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([2, 2, 1]);
    expect(result).toEqual({ received: 2 });
    expect(store.collection.features.map((f) => f.properties.name)).toEqual(['New one', 'New two']);
    expect(store.name).toBe('new');
    expect(store.loaded).toBe(true);
    expect(infomapStore.run).toHaveBeenCalledTimes(1);
  });

  it('keeps the previous dataset and skips Infomap when no record arrives', async () => {
    const { store, infomapStore, mapStore, commit } = setup();
    await seed(store, commit);
    infomapStore.run.mockClear();
    mapStore.setRenderType.mockClear();
    const onFirstRecord = vi.fn();
    const result = await store.loadRecords(stream([[], []]), { onFirstRecord });
    expect(result).toEqual({ received: 0 });
    expect(onFirstRecord).not.toHaveBeenCalled();
    expect(store.collection.features).toHaveLength(2);
    expect(store.name).toBe('old');
    expect(store.loaded).toBe(true);
    expect(store.isLoading).toBe(false);
    expect(store.loadController).toBeNull();
    expect(infomapStore.run).not.toHaveBeenCalled();
    expect(mapStore.setRenderType).not.toHaveBeenCalled();
  });

  it('stays empty without running Infomap when nothing was loaded before', async () => {
    const { store, infomapStore } = setup();
    const result = await store.loadRecords(stream([]));
    expect(result).toEqual({ received: 0 });
    expect(store.loaded).toBe(false);
    expect(store.isLoading).toBe(false);
    expect(store.name).toBe('data');
    expect(infomapStore.run).not.toHaveBeenCalled();
  });

  it('rethrows a failing stream without touching the previous data when nothing arrived', async () => {
    const { store, infomapStore, commit } = setup();
    await seed(store, commit);
    infomapStore.run.mockClear();
    async function* failing(): AsyncGenerator<Rec[]> {
      yield* [];
      throw new Error('HTTP 502');
    }
    await expect(store.loadRecords(failing(), { onFirstRecord: commit('x') })).rejects.toThrow('HTTP 502');
    expect(store.collection.features).toHaveLength(2);
    expect(store.name).toBe('old');
    expect(infomapStore.run).not.toHaveBeenCalled();
  });

  it('keeps a partial load on cancel and runs Infomap on it', async () => {
    const { store, infomapStore, commit } = setup();
    const controller = new AbortController();
    const result = await store.loadRecords(
      stream([[rec('A')], [rec('B')]], {
        before: (i) => {
          if (i === 1) controller.abort();
        },
      }),
      { controller, onFirstRecord: commit('partial') },
    );
    expect(result).toEqual({ received: 1 });
    expect(store.collection.features).toHaveLength(1);
    expect(infomapStore.run).toHaveBeenCalledTimes(1);
  });

  it('keeps a stopped load on the record layer without Infomap when asked, and runs it later', async () => {
    const { store, infomapStore, mapStore, commit } = setup();
    const controller = new AbortController();
    await store.loadRecords(
      stream([[rec('A')], [rec('B')]], {
        before: (i) => {
          if (i === 1) controller.abort('keep');
        },
      }),
      { controller, skipBioregions: () => controller.signal.aborted, onFirstRecord: commit('partial') },
    );
    expect(store.collection.features).toHaveLength(1);
    expect(store.loaded).toBe(true);
    expect(infomapStore.run).not.toHaveBeenCalled();
    expect(infomapStore.clearData).toHaveBeenCalled();
    expect(mapStore.setRenderType).toHaveBeenLastCalledWith('records');
    await store.runBioregions();
    expect(infomapStore.run).toHaveBeenCalledTimes(1);
    expect(mapStore.setRenderType).toHaveBeenLastCalledWith('bioregions');
  });

  it('skips binning and Infomap on a discard after the commit and leaves the clearing to the owner', async () => {
    const { store, infomapStore, commit } = setup();
    await seed(store, commit);
    infomapStore.run.mockClear();
    const controller = new AbortController();
    const result = await store.loadRecords(
      stream([[rec('A')], [rec('B')]], {
        before: (i) => {
          if (i === 1) controller.abort('discard');
        },
      }),
      { controller, onFirstRecord: commit('discarded') },
    );
    expect(result).toEqual({ received: 1 });
    expect(store.isLoading).toBe(false);
    expect(store.loaded).toBe(false);
    expect(store.loadController).toBeNull();
    expect(infomapStore.run).not.toHaveBeenCalled();
  });

  it('leaves the old data loaded and isLoading false on a discard before the first record', async () => {
    const { store, infomapStore, commit } = setup();
    await seed(store, commit);
    infomapStore.run.mockClear();
    const controller = new AbortController();
    const onFirstRecord = vi.fn();
    const result = await store.loadRecords(
      stream([[], [rec('A')]], {
        before: (i) => {
          if (i === 1) controller.abort('discard');
        },
      }),
      { controller, onFirstRecord },
    );
    expect(result).toEqual({ received: 0 });
    expect(onFirstRecord).not.toHaveBeenCalled();
    expect(store.isLoading).toBe(false);
    expect(store.loaded).toBe(true);
    expect(store.collection.features).toHaveLength(2);
    expect(store.name).toBe('old');
    expect(infomapStore.run).not.toHaveBeenCalled();
  });

  it('takes its name from the loaded occurrence source', () => {
    const { store, dataStore } = setup();
    expect(store.name).toBe('data');
    action(() => {
      dataStore.occurrence = { exportName: 'Felidae · Neotropic' };
    })();
    expect(store.name).toBe('Felidae · Neotropic');
    action(() => {
      dataStore.occurrence = null;
    })();
    expect(store.name).toBe('data');
  });
});
