import { describe, expect, it } from 'vitest';
import {
  cellRect,
  computeFrame,
  fitProjection,
  formatBBox,
  getFrame,
  minimapWidth,
  regionLocators,
} from './minimap';

const rect = (x1: number, y1: number, x2: number, y2: number) => ({
  x1,
  y1,
  x2,
  y2,
});

describe('computeFrame', () => {
  it('pads the cell extent by 6% of its span on each side', () => {
    const frame = computeFrame([rect(0, 0, 10, 10), rect(40, 40, 50, 50)]);
    expect(frame).not.toBeNull();
    expect(frame?.w).toBeCloseTo(-3);
    expect(frame?.e).toBeCloseTo(53);
    expect(frame?.s).toBeCloseTo(-3);
    expect(frame?.n).toBeCloseTo(53);
    // standard parallel at the mid-latitude (25°)
    expect(frame?.k).toBeCloseTo(Math.cos((25 * Math.PI) / 180));
  });

  it('clamps to the globe and the standard parallel to ±60°', () => {
    const frame = computeFrame([rect(-180, 50, 180, 90)]);
    expect(frame).toMatchObject({ w: -180, e: 180, n: 90 });
    expect(frame?.s).toBeCloseTo(47.6);
    expect(frame?.k).toBeCloseTo(0.5);
  });

  it('returns null without cells', () => {
    expect(computeFrame([])).toBeNull();
  });

  it('memoizes on the cells array identity', () => {
    const cells = [rect(0, 0, 1, 1)];
    expect(getFrame(cells)).toBe(getFrame(cells));
  });
});

describe('projection', () => {
  // frame 40° x 20° at the equator: aspect 2
  const frame = { w: 0, s: -10, e: 40, n: 10, k: 1 };

  it('clamps the box width to the allowed aspect range', () => {
    expect(minimapWidth(100, frame)).toBe(172);
    expect(minimapWidth(100, { ...frame, e: 20 })).toBe(100);
    expect(minimapWidth(100, { ...frame, e: 5 })).toBe(86);
  });

  it('fits and letterboxes the frame', () => {
    const proj = fitProjection(frame, 200, 200); // scale 5, 50px bars top and bottom
    expect(proj.scale).toBe(5);
    expect(proj.x(0)).toBe(0);
    expect(proj.x(40)).toBe(200);
    expect(proj.y(10)).toBe(50);
    expect(proj.y(-10)).toBe(150);
  });

  it('scales longitudes by cos(phi0)', () => {
    const proj = fitProjection({ w: 0, s: 50, e: 20, n: 70, k: 0.5 }, 100, 100);
    expect(proj.scale).toBe(5);
    expect(proj.x(20) - proj.x(0)).toBe(50);
  });

  it('snaps cells to pixels with a minimum size', () => {
    const proj = fitProjection(frame, 200, 100); // scale 5, no letterbox
    expect(cellRect(proj, rect(1, 0, 2, 1))).toEqual([5, 45, 5, 5]);
    expect(cellRect(proj, rect(1.02, 0, 1.1, 0.1))).toEqual([5, 50, 1.5, 1.5]);
  });
});

describe('regionLocators', () => {
  // 100° x 50° frame in a 200 x 100 box: 2 px per degree, no letterbox
  const frame = { w: 0, s: 0, e: 100, n: 50, k: 1 };
  const proj = fitProjection(frame, 200, 100);

  it('rings a region drawn under 8 px, radius max(4, 6.5% of the height)', () => {
    // one 2° cell = 4 px
    expect(regionLocators(proj, frame, [10, 10, 12, 12], 100)).toEqual([
      { kind: 'ring', cx: 22, cy: 78, r: 6.5 },
    ]);
    // compact 36 px thumbnail: the 4 px minimum wins
    expect(regionLocators(proj, frame, [10, 10, 12, 12], 36)).toEqual([
      expect.objectContaining({ kind: 'ring', r: 4 }),
    ]);
  });

  it('rings a thin region and encloses its short side', () => {
    // 60 px wide, 7 px tall
    const [loc] = regionLocators(proj, frame, [10, 10, 40, 13.5], 36);
    expect(loc).toMatchObject({ kind: 'ring', cx: 50, r: 5 });
  });

  it('scales the ring with the css pixel size', () => {
    // at 2x, the same 4 css px cell is 8 device px and still gets a ring
    const proj2 = fitProjection(frame, 400, 200);
    expect(regionLocators(proj2, frame, [10, 10, 12, 12], 200, 2)).toEqual([
      expect.objectContaining({ kind: 'ring', r: 13 }),
    ]);
  });

  it('frames a small region of at least 8 px with a rectangle', () => {
    // 10° x 10° = 20 px, 2% of the frame
    expect(regionLocators(proj, frame, [10, 10, 20, 20], 100)).toEqual([
      { kind: 'rect', x0: 17, y0: 57, x1: 43, y1: 83 },
    ]);
  });

  it('leaves larger regions unmarked', () => {
    expect(regionLocators(proj, frame, [10, 10, 40, 40], 100)).toEqual([]);
    expect(regionLocators(proj, frame, [10, 10, 10, 10], 100)).toEqual([]);
  });

  it('marks both sides of a region across the antimeridian', () => {
    const world = { w: -180, s: -90, e: 180, n: 90, k: 1 };
    const p = fitProjection(world, 360, 180);
    const locs = regionLocators(p, world, [178, 0, 182, 2], 100);
    expect(locs.map((l) => l.kind)).toEqual(['ring', 'ring']);
  });
});

describe('formatBBox', () => {
  it('formats north–south, west–east', () => {
    expect(formatBBox([-78.2, -34, -52, 8.4])).toBe('8°N–34°S, 78°W–52°W');
    expect(formatBBox([170, -20, 190, 0])).toBe('0°–20°S, 170°E–170°W');
  });
});
