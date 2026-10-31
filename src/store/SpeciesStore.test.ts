import { describe, expect, it } from 'vitest';
import type Cell from '../utils/QuadTree/Cell';
import type RootStore from './RootStore';
import type { GeometryFeature } from './SpeciesStore';
import SpeciesStore, { createPointFeature } from './SpeciesStore';

const createStore = () =>
  new SpeciesStore({
    mapStore: { render: () => {}, renderShape: () => {} },
  } as unknown as RootStore);

const range = (name: string): GeometryFeature => ({
  type: 'Feature',
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [10.5, 10.5],
        [11.5, 10.5],
        [11.5, 11.5],
        [10.5, 11.5],
        [10.5, 10.5],
      ],
    ],
  },
  properties: { name },
});

const binnedNames = (store: SpeciesStore) => {
  const names: string[] = [];
  store.binner.visit((cell: Cell) => {
    for (const feature of cell.features) names.push(feature.properties.name);
  });
  return names.sort();
};

describe('SpeciesStore.addFeature', () => {
  it('bins range polygons as they arrive, like points', () => {
    const store = createStore();
    // Reading the cells mid-load (as the map does) builds the tree, so later
    // features reach the grid only through addFeature.
    expect(store.binner.cells).toEqual([]);
    store.addFeature(createPointFeature([11, 11], { name: 'Point' }));
    store.addFeature(range('Range'));

    expect(store.binner.treeNeedUpdate).toBe(false);
    expect(binnedNames(store)).toEqual(['Point', 'Range']);
  });
});
