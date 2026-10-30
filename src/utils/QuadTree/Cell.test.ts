import { describe, expect, it } from 'vitest';
import type { GeoFeature, PolygonFeature } from '../../store/SpeciesStore';
import { createPointFeature } from '../../store/SpeciesStore';
import Cell from './Cell';

// An 8x8 degree root is above the 4-degree max cell size (log2 = 2), so it
// always splits into four 4-degree quadrants, which split further only when
// they overflow `capacity`.
const MAX_SIZE_LOG2 = 2;
const MIN_SIZE_LOG2 = 0;

const rectangle = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  name = 'Range',
): PolygonFeature => ({
  type: 'Feature',
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [x1, y1],
        [x2, y1],
        [x2, y2],
        [x1, y2],
        [x1, y1],
      ],
    ],
  },
  properties: { name },
});

const build = (
  features: GeoFeature[],
  { extent = [0, 0, 8, 8] as [number, number, number, number], capacity = 10 } = {},
) => {
  const root = new Cell(extent, MAX_SIZE_LOG2);
  for (const feature of features) {
    root.add(feature, MAX_SIZE_LOG2, MIN_SIZE_LOG2, capacity);
  }
  return root;
};

const cellsWith = (root: Cell, feature: GeoFeature) => {
  const cells: Cell[] = [];
  root.visit((cell) => {
    if (cell.features.includes(feature)) cells.push(cell);
  });
  return cells;
};

describe('Cell polygon binning', () => {
  it('uses the same quadrant indices for points and polygons', () => {
    const northWestRange = rectangle(1, 5, 2, 6);
    const southWestPoint = createPointFeature([1, 1], { name: 'Point' });
    const root = build([northWestRange, southWestPoint]);

    const [pointCell] = cellsWith(root, southWestPoint);
    expect(pointCell).toBeDefined();
    expect(pointCell.extent).toEqual([0, 0, 4, 4]);
    expect(cellsWith(root, northWestRange).map((cell) => cell.extent)).toEqual([
      [0, 4, 4, 8],
    ]);
  });
});
