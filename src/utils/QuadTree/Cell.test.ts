import { describe, expect, it } from 'vitest';
import type { PointFeature } from '../../store/SpeciesStore';
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
