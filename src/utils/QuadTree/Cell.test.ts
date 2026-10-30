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

  it('turns a cell into an internal node when polygons split it', () => {
    // One range in each 2-degree sub-cell of the south-west quadrant.
    const ranges = [
      rectangle(0.5, 0.5, 1.5, 1.5, 'Range 0'),
      rectangle(2.5, 0.5, 3.5, 1.5, 'Range 1'),
      rectangle(2.5, 2.5, 3.5, 3.5, 'Range 2'),
      rectangle(0.5, 2.5, 1.5, 3.5, 'Range 3'),
    ];
    const root = build(ranges, { capacity: 2 });

    expect(root.isLeaf).toBe(false);
    const [southWest] = root._children;
    expect(southWest?.isLeaf).toBe(false);
    root.visit((cell) => {
      if (!cell.isLeaf) expect(cell.features).toEqual([]);
    });
    // The split drops the record that triggers it, as it does for points, but
    // every later range goes into the children instead of refilling the parent.
    expect(cellsWith(root, ranges[3]).map((cell) => cell.sizeLog2)).toEqual([1]);
  });

  it('skips the zero-width cells clamped at longitude 180', () => {
    // The east half [180, 184] of this root is clamped to [180, 180].
    const range = rectangle(178, 1, 180, 3);
    const root = build([range], { extent: [176, 0, 184, 8] });

    const cells = cellsWith(root, range);
    expect(cells.map((cell) => cell.extent)).toEqual([[176, 0, 180, 4]]);
    root.visit((cell) => {
      expect(cell.x2).toBeGreaterThan(cell.x1);
    });
  });
});
