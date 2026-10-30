import { describe, expect, it } from 'vitest';
import {
  alphaExtent,
  chooseZoom,
  decadeSteps,
  dragBbox,
  fitView,
  mapNote,
  pxToLonLat,
  tilesForView,
  unionBbox,
  wktBbox,
} from './mapView';

describe('fitView', () => {
  it('shows the whole world in a 2:1 frame', () => {
    const v = fitView(null, 720, 360);
    expect(v.scale).toBe(2);
    expect([v.west, v.south, v.east, v.north]).toEqual([-180, -90, 180, 90]);
  });

  it('never gets wider than the world', () => {
    const v = fitView(null, 1000, 300);
    expect(v.east - v.west).toBeCloseTo(360);
    expect(v.north - v.south).toBeCloseTo(108);
    expect(v.north).toBeLessThanOrEqual(90);
  });

  it('fits a region with padding and keeps it centred', () => {
    const v = fitView([-120, -60, -30, 30], 800, 400);
    expect(v.west).toBeLessThan(-120);
    expect(v.east).toBeGreaterThan(-30);
    expect((v.west + v.east) / 2).toBeCloseTo(-75);
    expect(v.south).toBeLessThan(-60);
    expect(v.north).toBeGreaterThan(30);
  });

  it('clamps the view inside the world', () => {
    const v = fitView([160, -50, 180, -30], 800, 400);
    expect(v.east).toBeCloseTo(180);
  });

  it('does not zoom into tiny areas', () => {
    const v = fitView([10, 10, 10.5, 10.5], 800, 400);
    expect(v.east - v.west).toBeGreaterThanOrEqual(12);
  });
});

describe('tiles', () => {
  it('picks the coarsest zoom that is sharp enough', () => {
    expect(chooseZoom(2)).toBe(0);
    expect(chooseZoom(3)).toBe(1);
    expect(chooseZoom(100)).toBe(3);
  });

  it('covers the world with the two zoom-0 tiles', () => {
    const tiles = tilesForView(fitView(null, 720, 360));
    expect(tiles.map((t) => [t.z, t.x, t.y, t.left, t.top, t.size])).toEqual([
      [0, 0, 0, 0, 0, 360],
      [0, 1, 0, 360, 0, 360],
    ]);
  });

  it('positions tiles relative to the view', () => {
    const view = { west: -100, south: -10, east: -60, north: 10, scale: 10 };
    const tiles = tilesForView(view, 2);
    expect(tiles.every((t) => t.size === 450)).toBe(true);
    expect(tiles[0]).toMatchObject({ x: 1, y: 1, left: -350, top: -350 });
  });

  it('maps pixels back to lon/lat', () => {
    expect(pxToLonLat({ west: -10, south: 0, east: 10, north: 10, scale: 10 }, 100, 50)).toEqual([0, 5]);
  });
});

describe('boxes', () => {
  it('reads the extent of a WKT polygon', () => {
    expect(wktBbox('POLYGON((-10 -5, 20 -5, 20 30, -10 30, -10 -5))')).toEqual([-10, -5, 20, 30]);
    expect(wktBbox('POLYGON EMPTY')).toBeNull();
  });

  it('rounds dragged boxes and ignores clicks', () => {
    expect(dragBbox([10.04, 5.06], [-3.33, 20])).toEqual([-3.3, 5.1, 10, 20]);
    expect(dragBbox([0, 0], [0.2, 0.2])).toBeNull();
  });

  it('unions boxes', () => {
    expect(unionBbox([null, [0, 0, 1, 1], [-1, 2, 0, 3]])).toEqual([-1, 0, 1, 3]);
    expect(unionBbox([null])).toBeNull();
  });

  it('finds the extent of opaque pixels and trims stray points', () => {
    const w = 10;
    const h = 5;
    const rgba = new Uint8Array(w * h * 4);
    const set = (x: number, y: number) => {
      rgba[(y * w + x) * 4 + 3] = 255;
    };
    for (let x = 2; x <= 4; x++) for (let y = 1; y <= 2; y++) for (let k = 0; k < 100; k++) set(x, y);
    expect(alphaExtent(rgba, w, h, [0, 0, 10, 5], 0)).toEqual([2, 2, 5, 4]);
    set(9, 4);
    expect(alphaExtent(rgba, w, h, [0, 0, 10, 5], 0.2)).toEqual([2, 2, 5, 4]);
    expect(alphaExtent(new Uint8Array(w * h * 4), w, h, [0, 0, 10, 5])).toBeNull();
  });
});

describe('texts', () => {
  it('uses the spec note when quality filters are not drawn', () => {
    expect(mapNote(['Coordinate uncertainty'])).toBe(
      'Map shows taxon, area, years and basis of record only; quality filters apply to the counts.',
    );
    expect(mapNote([])).toBe('Map applies every filter of the query.');
    expect(mapNote(['Taxa after the first'])).toMatch(/^Map shows the first taxon only\./);
  });

  it('builds decade legend steps', () => {
    expect(decadeSteps(0)).toEqual([1, 10]);
    expect(decadeSteps(1500)).toEqual([1, 10, 100, 1000, 10000]);
  });
});
