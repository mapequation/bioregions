import { describe, expect, it } from 'vitest';
import type SpeciesStore from '../../store/SpeciesStore';
import type { PointFeature } from '../../store/SpeciesStore';
import type Cell from './Cell';
import QuadtreeGeoBinner from './QuadTreeGeoBinner';

const point = (x: number, y: number, name = 'A'): PointFeature => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [x, y] },
  properties: { name },
});

/** n points spread over the square [x, x + w] x [y, y + w]. */
const points = (n: number, x: number, y: number, w = 2) =>
  Array.from({ length: n }, (_, i) =>
    point(x + (w * (i + 0.5)) / n, y + (w * (i + 0.5)) / n, `S${i % 3}`),
  );

/** Bin like the app does (max cell 4 degrees, min 1 degree by default). */
function bin(
  features: PointFeature[],
  { min = 0, max = 2, minCapacity = 3, maxCapacity = 4, patch = true } = {},
) {
  const store = { collection: { features } } as unknown as SpeciesStore;
  const binner = new QuadtreeGeoBinner(store);
  binner.setCellSizeLog2(min, max);
  binner.setCellCapacity(minCapacity, maxCapacity);
  binner.setPatchSparseCells(patch);
  return binner;
}

const cellIds = (cells: Cell[]) => cells.map((c) => c.id);

/** Deterministic pseudo-random points (mulberry32). */
function randomPoints(n: number, seed: number) {
  let a = seed;
  const rand = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // Clustered around a few centres so that cells split to different depths.
  const centres = [
    [-60, -10],
    [10, 45],
    [120, 30],
    [179, 89],
  ];
  return Array.from({ length: n }, (_, i) => {
    const [cx, cy] = centres[i % centres.length];
    const r = 2 ** (1 + 4 * rand());
    const x = Math.max(-180, Math.min(180, cx + r * (rand() - 0.5)));
    const y = Math.max(-90, Math.min(90, cy + r * (rand() - 0.5)));
    return point(x, y, `S${Math.floor(rand() * 50)}`);
  });
}

describe('QuadtreeGeoBinner.cells: cells partition the records (S1)', () => {
  for (const patch of [true, false]) {
    it(`puts every record in at most one cell (patch ${patch})`, () => {
      const features = randomPoints(5000, 42);
      const binner = bin(features, { minCapacity: 10, maxCapacity: 30, patch });
      const { cells } = binner;
      const seen = new Set<PointFeature>();
      for (const cell of cells) {
        expect(cell.numFeatures).toBeGreaterThanOrEqual(10);
        for (const f of cell.features) {
          expect(seen.has(f as PointFeature)).toBe(false);
          seen.add(f as PointFeature);
        }
      }
      expect(seen.size + binner.numDroppedSparse).toBe(features.length);
      if (patch) {
        expect(cells.some((c) => c.isRemainder)).toBe(true);
      }
    });
  }

  it('gives the same cells after toggling patching off and on', () => {
    const binner = bin(randomPoints(2000, 7), { minCapacity: 10, maxCapacity: 50 });
    const before = binner.cells.map((c) => [c.id, c.numFeatures, c.area]);
    binner.setPatchSparseCells(false);
    expect(binner.cells.every((c) => c.isLeaf)).toBe(true);
    binner.setPatchSparseCells(true);
    expect(binner.cells.map((c) => [c.id, c.numFeatures, c.area])).toEqual(before);
  });
});

describe('QuadtreeGeoBinner.cells: remainder cells', () => {
  // The 4-degree cell [0, 4]^2 holds 9 records, so it splits (capacity 4):
  // SW and SE get 3 each and are cells; NW (1) and NE (2) fall short.
  const sw = points(3, 0, 0);
  const se = points(3, 2, 0);
  const nw = points(1, 0, 2);
  const ne = points(2, 2, 2);

  it('collects the records its children pass up', () => {
    const { cells } = bin([...sw, ...se, ...nw, ...ne]);
    expect(cellIds(cells)).toEqual(['3000000', '30000000', '30000001']);
    const [parent, cellSW, cellSE] = cells;
    expect(parent.isRemainder).toBe(true);
    expect(new Set(parent.features)).toEqual(new Set([...nw, ...ne]));
    expect(new Set(cellSW.features)).toEqual(new Set(sw));
    expect(new Set(cellSE.features)).toEqual(new Set(se));
  });

  it('has its own area minus the area of its emitted descendants', () => {
    const { cells } = bin([...sw, ...se, ...nw, ...ne]);
    const [parent, cellSW, cellSE] = cells;
    expect(parent.area).toBeCloseTo(
      parent.fullArea - cellSW.fullArea - cellSE.fullArea,
      6,
    );
    expect(parent.recordsPerArea).toBeCloseTo(3 / parent.area, 12);
    expect(cellSW.area).toBe(cellSW.fullArea);
  });

  it('passes records up through a parent that falls short', () => {
    // NW alone passes 1 record up; with NE empty the parent holds 1 < 3.
    const binner = bin([...sw, ...se, ...nw]);
    expect(cellIds(binner.cells)).toEqual(['30000000', '30000001']);
    expect(binner.numDroppedSparse).toBe(1);
  });

  it('drops records still short at the coarsest adaptive level', () => {
    for (const patch of [true, false]) {
      const binner = bin([...points(2, 0, 0, 4), ...points(5, 8, 8, 4)], {
        minCapacity: 4,
        patch,
      });
      // The 4-degree cell [8, 12]^2 splits into four sparse children; with
      // patching they pass their 5 records up to it.
      expect(binner.cells.map((c) => c.numFeatures)).toEqual(patch ? [5] : []);
      expect(binner.numDroppedSparse).toBe(patch ? 2 : 7);
    }
  });

  it('does not patch a polar cell for its off-globe quadrants (B8)', () => {
    // The top row [0, 4] x [88, 92] has two on-globe quadrants, both cells.
    const polar = [...points(3, 0, 88), ...points(3, 2, 88)];
    const { cells } = bin(polar);
    expect(cells).toHaveLength(2);
    for (const cell of cells) {
      expect(cell.isLeaf).toBe(true);
      expect([cell.x2 - cell.x1, cell.y2 - cell.y1]).toEqual([2, 2]);
    }
    expect(cells[0].parent?.isCell).toBe(false);
  });
});
