// SpeciesStore.loadRecords: lazy clear, the no-records path and discard, with the map and
// Infomap stores mocked.
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
  const infomapStore = { run: vi.fn(async () => {}), clearData: vi.fn() };
  const rootStore = { mapStore, infomapStore } as unknown as RootStore;
  const store = new SpeciesStore(rootStore);
  rootStore.speciesStore = store;
  return { store, mapStore, infomapStore };
}

async function* stream(list: Rec[][], hooks: { before?: (i: number) => void | Promise<void> } = {}) {
  for (const [i, batch] of list.entries()) {
    await hooks.before?.(i);
    yield batch;
  }
}

const rec = (name: string, lon = 10, lat = 50): Rec => ({ name, lon, lat });

/** Load one dataset so the store holds something to keep or replace. */
async function seed(store: SpeciesStore) {
  await store.loadRecords(stream([[rec('Old one'), rec('Old two', 11, 51)]]), { name: 'old' });
  expect(store.collection.features).toHaveLength(2);
}

describe('SpeciesStore.loadRecords', () => {
  it('clears the previous data only when the first record arrives', async () => {
    const { store, infomapStore } = setup();
    await seed(store);
    infomapStore.run.mockClear();
    const seen: number[] = [];
    const result = await store.loadRecords(
      stream([[], [rec('New one')], [rec('New two')]], {
        // Before each batch: the old data stays until a batch with a record arrived.
        before: () => {
          seen.push(store.collection.features.length);
        },
      }),
      { name: 'new' },
    );
    expect(seen).toEqual([2, 2, 1]);
    expect(result).toEqual({ received: 2 });
    expect(store.collection.features.map((f) => f.properties.name)).toEqual(['New one', 'New two']);
    expect(store.name).toBe('new');
    expect(store.loaded).toBe(true);
    expect(infomapStore.run).toHaveBeenCalledTimes(1);
  });

  it('keeps the previous dataset and skips Infomap when no record arrives', async () => {
    const { store, infomapStore, mapStore } = setup();
    await seed(store);
    infomapStore.run.mockClear();
    mapStore.setRenderType.mockClear();
    const result = await store.loadRecords(stream([[], []]), { name: 'empty' });
    expect(result).toEqual({ received: 0 });
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
    const result = await store.loadRecords(stream([]), { name: 'empty' });
    expect(result).toEqual({ received: 0 });
    expect(store.loaded).toBe(false);
    expect(store.isLoading).toBe(false);
    expect(infomapStore.run).not.toHaveBeenCalled();
  });

  it('rethrows a failing stream without touching the previous data when nothing arrived', async () => {
    const { store, infomapStore } = setup();
    await seed(store);
    infomapStore.run.mockClear();
    async function* failing(): AsyncGenerator<Rec[]> {
      yield* [];
      throw new Error('HTTP 502');
    }
    await expect(store.loadRecords(failing(), { name: 'x' })).rejects.toThrow('HTTP 502');
    expect(store.collection.features).toHaveLength(2);
    expect(infomapStore.run).not.toHaveBeenCalled();
  });

  it('keeps a partial load on cancel and runs Infomap on it', async () => {
    const { store, infomapStore } = setup();
    const controller = new AbortController();
    const result = await store.loadRecords(
      stream([[rec('A')], [rec('B')]], {
        before: (i) => {
          if (i === 1) controller.abort();
        },
      }),
      { name: 'partial', controller },
    );
    expect(result).toEqual({ received: 1 });
    expect(store.collection.features).toHaveLength(1);
    expect(infomapStore.run).toHaveBeenCalledTimes(1);
  });

  it('keeps a stopped load on the record layer without Infomap when asked, and runs it later', async () => {
    const { store, infomapStore, mapStore } = setup();
    const controller = new AbortController();
    await store.loadRecords(
      stream([[rec('A')], [rec('B')]], {
        before: (i) => {
          if (i === 1) controller.abort('keep');
        },
      }),
      { name: 'partial', controller, skipBioregions: () => controller.signal.aborted },
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

  it('drops what arrived on discard, even into an add', async () => {
    const { store, infomapStore } = setup();
    await seed(store);
    infomapStore.run.mockClear();
    const controller = new AbortController();
    await store.loadRecords(
      stream([[rec('A')], [rec('B')]], {
        before: (i) => {
          if (i === 1) controller.abort('discard');
        },
      }),
      { name: 'discarded', controller, clear: false },
    );
    expect(store.collection.features).toHaveLength(0);
    expect(store.loaded).toBe(false);
    expect(infomapStore.run).not.toHaveBeenCalled();
  });
});
