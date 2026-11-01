import { describe, expect, it } from 'vitest';
import {
  binHexagons,
  cachedPoints,
  flattenPoints,
  hexCenter,
  RAMP_LEVELS,
  rampColor,
  rampLevel,
  rampPosition,
} from './loadedHexbin';
import { fitPolarView, fitView, mapProjection } from './mapView';

const multi = (coords: [number, number][]) => ({ type: 'MultiPoint', coordinates: coords });

describe('flattenPoints / cachedPoints', () => {
  it('flattens MultiPoint and Point geometries and drops non-finite pairs', () => {
    const xy = flattenPoints([
      multi([
        [1, 2],
        [3, 4],
      ]),
      { type: 'Point', coordinates: [5, 6] },
      multi([[Number.NaN, 1]]),
    ]);
    expect(Array.from(xy)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('caches per collection and refreshes when points are added', () => {
    const col = { geometries: [multi([[1, 2]])] };
    const a = cachedPoints(col);
    expect(cachedPoints(col)).toBe(a);
    col.geometries.push(multi([[3, 4]]));
    expect(Array.from(cachedPoints(col))).toEqual([1, 2, 3, 4]);
  });
});

describe('binHexagons', () => {
  const view = fitView(null, 720, 360); // 2 px per degree, world
  const grid = { dx: 10, ox: 0, oy: 0 };

  it('puts each point in the hexagon whose centre is nearest', () => {
    const proj = mapProjection(view, null);
    const pts: [number, number][] = [];
    for (let lon = -170; lon < 170; lon += 13.7) for (let lat = -80; lat < 80; lat += 9.1) pts.push([lon, lat]);
    const xy = new Float64Array(pts.flat());
    const b = binHexagons(xy, view, null, 720, 360, grid);
    expect(b.inView).toBe(pts.length);
    let sum = 0;
    for (const c of b.counts) sum += c;
    expect(sum).toBe(pts.length);
    // Every point lies within the circumradius of a non-empty cell's centre.
    for (const [lon, lat] of pts) {
      const [x, y] = proj.toPx(lon, lat);
      let best = Infinity;
      for (let j = 0; j < b.rows; j++)
        for (let i = 0; i < b.cols; i++) {
          if (!b.counts[j * b.cols + i]) continue;
          const [cx, cy] = hexCenter(b, i, j);
          best = Math.min(best, Math.hypot(x - cx, y - cy));
        }
      expect(best).toBeLessThanOrEqual(b.r + 1e-9);
    }
  });

  it('counts repeated points in one cell and tracks the maximum', () => {
    const xy = new Float64Array([10, 10, 10, 10, 10, 10, -100, 40]);
    const b = binHexagons(xy, view, null, 720, 360, grid);
    expect(b.max).toBe(3);
    expect(b.inView).toBe(4);
  });

  it('skips points outside the frame and wraps across the antimeridian', () => {
    const v = fitView([150, -50, -150, 10], 600, 300); // crosses 180°
    const xy = new Float64Array([-170, -20, 0, 0]);
    const b = binHexagons(xy, v, null, 600, 300, grid);
    expect(b.inView).toBe(1);
  });

  it('bins through a polar projection', () => {
    const rings: [number, number][][] = [
      [
        [-180, 60],
        [0, 60],
        [180, 60],
      ],
    ];
    const v = fitPolarView('EPSG:3575', rings, 500, 500);
    const xy = new Float64Array([10, 89.5, 100, 70, 10, 10]);
    const b = binHexagons(xy, v, 'EPSG:3575', 500, 500, grid);
    expect(b.inView).toBe(2);
  });

  it('bins 500k points quickly', () => {
    const n = 500_000;
    const xy = new Float64Array(n * 2);
    for (let k = 0; k < n; k++) {
      xy[2 * k] = ((k * 7919) % 36000) / 100 - 180;
      xy[2 * k + 1] = ((k * 104729) % 18000) / 100 - 90;
    }
    const t0 = performance.now();
    const b = binHexagons(xy, view, null, 720, 360, grid);
    expect(performance.now() - t0).toBeLessThan(500);
    expect(b.inView).toBeGreaterThan(n * 0.99);
  });
});

describe('ramp', () => {
  it('maps counts onto the 1 / 10 / 100 / 1k+ legend', () => {
    expect(rampPosition(1)).toBe(0);
    expect(rampPosition(10)).toBeCloseTo(1 / 3);
    expect(rampPosition(1e5)).toBe(1);
    expect(rampLevel(1)).toBe(0);
    expect(rampLevel(5000)).toBe(RAMP_LEVELS - 1);
  });

  it('interpolates evenly spaced stops', () => {
    const stops = ['#000000', '#ff0000', '#ffffff'];
    expect(rampColor(stops, 0)).toBe('rgb(0, 0, 0)');
    expect(rampColor(stops, 0.5)).toBe('rgb(255, 0, 0)');
    expect(rampColor(stops, 0.75)).toBe('rgb(255, 128, 128)');
    expect(rampColor(stops, 1)).toBe('rgb(255, 255, 255)');
  });
});
