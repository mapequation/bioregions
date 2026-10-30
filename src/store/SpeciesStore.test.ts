import { describe, expect, it } from 'vitest';
import type RootStore from './RootStore';
import SpeciesStore from './SpeciesStore';

function createStore() {
  const noop = () => {};
  const rootStore = {
    mapStore: { render: noop, renderShape: noop, setRenderType: noop },
    infomapStore: { run: async () => {} },
  } as unknown as RootStore;
  return new SpeciesStore(rootStore);
}

const CSV = [
  'species,longitude,latitude',
  'Puma concolor,-60.5,-10.25',
  'Puma concolor,,-10.25',
  'Puma concolor,-60.5,',
  'Puma concolor,abc,-10.25',
  'Puma concolor,0x10,-10.25',
  'Puma concolor,Infinity,-10.25',
  'Puma concolor,-60.5,95',
  'Puma concolor,190,-10.25',
  ',-60.5,-10.25',
  'NA,-60.5,-10.25',
  'Panthera onca,180,-90',
].join('\n');

describe('SpeciesStore.loadString', () => {
  it('skips rows with a missing name or an empty, non-numeric or out-of-range coordinate', async () => {
    const store = createStore();
    await store.loadString(CSV);

    const points = store.collection.features.map((feature) => ({
      name: feature.properties.name,
      coordinates:
        feature.geometry.type === 'Point'
          ? feature.geometry.coordinates
          : undefined,
    }));
    expect(points).toEqual([
      { name: 'Puma concolor', coordinates: [-60.5, -10.25] },
      { name: 'Panthera onca', coordinates: [180, -90] },
    ]);
    expect(store.numSkippedRecords).toBe(9);
  });

  it('creates no inverted cells', async () => {
    const store = createStore();
    Object.assign(store.binner, { minCellCapacity: 1, maxCellCapacity: 1 });
    // Without the point on lon 180, which lands in a zero-width edge cell.
    await store.loadString(CSV.slice(0, CSV.lastIndexOf('\n')));

    const { cells } = store.binner;
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) {
      expect(cell.x1).toBeLessThan(cell.x2);
      expect(cell.y1).toBeLessThan(cell.y2);
    }
  });
});
