import { describe, expect, it } from 'vitest';
import type {
  GeoFeature,
  PointFeature,
  PolygonFeature,
} from '../../store/SpeciesStore';
import { createPointFeature } from '../../store/SpeciesStore';
import Cell from './Cell';

const point = (x: number, y: number, name = 'A'): PointFeature => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [x, y] },
  properties: { name },
});

/** Build a quadtree like QuadtreeGeoBinner does (extent [-256, 256]^2). */
function build(
  points: PointFeature[],
  { min = 0, max = 2, capacity = 100 } = {},
) {
  const root = new Cell([-256, -256, 256, 256], max);
  for (const p of points) root.add(p, max, min, capacity);
  return root;
}

function allCells(cell: Cell): Cell[] {
  const children = cell._children.filter((c): c is Cell => c !== undefined);
  return [cell, ...children.flatMap(allCells)];
}

function cellsWithFeatures(root: Cell) {
  return allCells(root).filter((c) => c.features.length > 0);
}

function cellOf(root: Cell, p: PointFeature) {
  const found = cellsWithFeatures(root).filter((c) => c.features.includes(p));
  expect(found).toHaveLength(1);
  return found[0];
}

describe('Cell.add: record that triggers a split (B1)', () => {
  it('keeps every record when a cell splits', () => {
    // Three points in the same 4-degree cell [0, 4] x [0, 4], capacity 2:
    // the third arrival splits the cell.
    const points = [point(0.5, 0.5), point(2.5, 0.5), point(0.5, 2.5)];
    const root = build(points, { capacity: 2 });
    const stored = cellsWithFeatures(root).flatMap((c) => c.features);
    expect(stored).toHaveLength(points.length);
    for (const p of points) {
      const cell = cellOf(root, p);
      expect(cell.x2 - cell.x1).toBe(2); // split into 2-degree cells
    }
  });

  it('does not depend on insertion order', () => {
    const points = Array.from({ length: 25 }, (_, i) =>
      point((i % 5) * 0.7 + 0.1, Math.floor(i / 5) * 0.7 + 0.1, `S${i}`),
    );
    const count = (ps: PointFeature[]) =>
      cellsWithFeatures(build(ps, { capacity: 4 })).reduce(
        (sum, c) => sum + c.features.length,
        0,
      );
    expect(count(points)).toBe(25);
    expect(count([...points].reverse())).toBe(25);
  });
});

describe('Cell.add: points on the domain edge (B2)', () => {
  for (const max of [1, 2, 3]) {
    it(`puts lon 180 and lat 90 in the last column and row (max ${max})`, () => {
      const edge = [point(180, 0), point(0, 90), point(180, 90), point(180, -90)];
      const root = build(edge, { max });
      for (const cell of cellsWithFeatures(root)) {
        expect(cell.x2).toBeGreaterThan(cell.x1);
        expect(cell.y2).toBeGreaterThan(cell.y1);
        expect(cell.area).toBeGreaterThan(0);
      }
      expect(cellOf(root, edge[0]).x2).toBe(180);
      expect(cellOf(root, edge[1]).y2).toBe(90);
      const corner = cellOf(root, edge[2]);
      expect([corner.x2, corner.y2]).toEqual([180, 90]);
    });
  }

  it('still puts interior midline points east/north', () => {
    const p = point(0, 0);
    const cell = cellOf(build([p]), p);
    expect([cell.x1, cell.y1, cell.x2, cell.y2]).toEqual([0, 0, 4, 4]);
  });
});

describe('Cell.add: split at unclipped midpoints (B8)', () => {
  it('splits a polar row cell into square children', () => {
    // The 4-degree top row [0, 4] x [88, 92] is clipped to [88, 90]. Its
    // children are 2-degree squares; the northern half lies off the globe.
    const points = [point(0.5, 88.5), point(2.5, 88.5), point(0.5, 89.5)];
    const root = build(points, { capacity: 2 });
    for (const p of points) {
      const cell = cellOf(root, p);
      expect(cell.size).toBe(2);
      expect(cell.x2 - cell.x1).toBe(2);
      expect(cell.y2 - cell.y1).toBe(2);
      expect(cell.y1).toBe(88);
    }
    const parent = cellOf(root, points[0]).parent;
    expect(parent?.size).toBe(4);
    expect(parent?.y2).toBe(90); // still clipped for display
  });

  it('keeps the unclipped width east of lon 180', () => {
    // With 8-degree cells, the last column [176, 184] is clipped to [176, 180]
    // but is still 8 degrees wide, and splits at lon 180.
    const a = point(177, 1);
    const b = point(179, 1);
    const c = point(177, 3);
    const root = build([a, b, c], { min: 2, max: 3, capacity: 2 });
    const cell = cellOf(root, a);
    expect(cell.size).toBe(4);
    expect([cell.x1, cell.y1, cell.x2, cell.y2]).toEqual([176, 0, 180, 4]);
    expect(cell.parent?.size).toBe(8);
    expect(cell.parent?.x2).toBe(180);
    expect(cellOf(root, b)).toBe(cell);
  });
});

// Polygon binning. An 8x8 degree root is above the 4-degree max cell size
// (log2 = 2), so it always splits into four 4-degree quadrants, which split
// further only when they overflow `capacity`.
const POLYGON_MAX_SIZE_LOG2 = 2;
const POLYGON_MIN_SIZE_LOG2 = 0;

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

const buildMixed = (
  features: GeoFeature[],
  {
    extent = [0, 0, 8, 8] as [number, number, number, number],
    capacity = 10,
  } = {},
) => {
  const root = new Cell(extent, POLYGON_MAX_SIZE_LOG2);
  for (const feature of features) {
    root.add(feature, POLYGON_MAX_SIZE_LOG2, POLYGON_MIN_SIZE_LOG2, capacity);
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
    const root = buildMixed([northWestRange, southWestPoint]);

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
    const root = buildMixed(ranges, { capacity: 2 });

    expect(root.isLeaf).toBe(false);
    const [southWest] = root._children;
    expect(southWest?.isLeaf).toBe(false);
    root.visit((cell) => {
      if (!cell.isLeaf) expect(cell.features).toEqual([]);
    });
    // Every range after the split goes into the children instead of refilling
    // the parent.
    expect(cellsWith(root, ranges[3]).map((cell) => cell.sizeLog2)).toEqual([1]);
  });

  it('skips the zero-width cells clamped at longitude 180', () => {
    // The east half [180, 184] of this root is clamped to [180, 180].
    const range = rectangle(178, 1, 180, 3);
    const root = buildMixed([range], { extent: [176, 0, 184, 8] });

    const cells = cellsWith(root, range);
    expect(cells.map((cell) => cell.extent)).toEqual([[176, 0, 180, 4]]);
    root.visit((cell) => {
      expect(cell.x2).toBeGreaterThan(cell.x1);
    });
  });

  it('counts a range only in cells whose interior it overlaps', () => {
    const quadrant = rectangle(0, 0, 4, 4);
    const corner = rectangle(4, 4, 5, 5);
    const covering = rectangle(-1, -1, 9, 9);
    const root = buildMixed([quadrant, corner, covering]);

    expect(cellsWith(root, quadrant).map((cell) => cell.extent)).toEqual([
      [0, 0, 4, 4],
    ]);
    expect(cellsWith(root, corner).map((cell) => cell.extent)).toEqual([
      [4, 4, 8, 8],
    ]);
    expect(cellsWith(root, covering)).toHaveLength(4);
  });

  it('does not count a range in a cell that lies in one of its holes', () => {
    const ring = rectangle(-1, -1, 9, 9);
    ring.geometry.coordinates.push([
      [0, 0],
      [0, 4],
      [4, 4],
      [4, 0],
      [0, 0],
    ]);
    const root = buildMixed([ring]);

    expect(
      cellsWith(root, ring)
        .map((cell) => cell.extent)
        .sort(),
    ).toEqual([
      [0, 4, 4, 8],
      [4, 0, 8, 4],
      [4, 4, 8, 8],
    ]);
  });
});
