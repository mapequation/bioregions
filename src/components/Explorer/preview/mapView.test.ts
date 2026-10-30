import { describe, expect, it } from 'vitest';
import {
  alphaExtent,
  bboxRings,
  chooseZoom,
  densifyRing,
  fitPolarView,
  mapProjection,
  POLAR_EXTENT,
  polarDragBbox,
  polarForward,
  polarInverse,
  polarSrsFor,
  polarTilesForView,
  decadeSteps,
  MAX_TILE_ZOOM,
  dragBbox,
  fitView,
  mapNote,
  pxToLonLat,
  tilesForView,
  unionBbox,
  unwrapBbox,
  wktBbox,
  wrapBbox,
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
    expect(chooseZoom(30)).toBe(4);
    expect(chooseZoom(1000)).toBe(MAX_TILE_ZOOM);
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

  it('fits a box across the antimeridian unwrapped and wraps its tiles', () => {
    const view = fitView([110, -50, -120, 30], 800, 400);
    // Centred on the box (110..240), not stretched over the whole world.
    expect((view.west + view.east) / 2).toBeCloseTo(175);
    expect(view.east - view.west).toBeLessThan(210);
    const tiles = tilesForView(view, 1);
    const cols = tiles.filter((t) => t.y === 0).map((t) => [t.col, t.x]);
    // Column 4 (lon 180..270) is fetched as column 0 of the world.
    expect(cols).toContainEqual([4, 0]);
    expect(new Set(tiles.map((t) => `${t.col},${t.y}`)).size).toBe(tiles.length);
  });

  it('limits tiles to a box', () => {
    const view = fitView([-82, -56, -34, 13], 800, 320);
    const all = tilesForView(view, 2);
    const inside = tilesForView(view, 2, [-82, -56, -34, 13]);
    expect(inside.length).toBeGreaterThan(0);
    expect(inside.length).toBeLessThan(all.length);
    expect(tilesForView(view, 2, [100, 0, 110, 10])).toEqual([]);
  });

  it('wraps drawn boxes back into the world', () => {
    expect(wrapBbox([170, -20, 200, 10])).toEqual([170, -20, -160, 10]);
    expect(wrapBbox([190, -20, 200, 10])).toEqual([-170, -20, -160, 10]);
    expect(wrapBbox([-10, 0, 10, 5])).toEqual([-10, 0, 10, 5]);
    expect(unwrapBbox([170, -20, -160, 10])).toEqual([170, -20, 200, 10]);
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

describe('fitView insetTop', () => {
  it('keeps an area below the controls', () => {
    const v = fitView([-120, -60, -30, 30], 800, 400, 40);
    const top = (v.north - 30) * v.scale;
    expect(top).toBeGreaterThanOrEqual(40);
  });
});

describe('polar views', () => {
  it('picks a polar projection for circumpolar areas only', () => {
    expect(polarSrsFor([-180, 66, 180, 90])).toBe('EPSG:3575');
    expect(polarSrsFor([10, 70, 40, 80])).toBe('EPSG:3575');
    expect(polarSrsFor([-180, -80, 180, -50])).toBe('EPSG:3031');
    expect(polarSrsFor([-180, -90, 180, -60])).toBe('EPSG:3031');
    expect(polarSrsFor([-120, -60, -30, 30])).toBeNull();
    expect(polarSrsFor([-180, -30, 180, 30])).toBeNull();
    expect(polarSrsFor(null)).toBeNull();
  });

  it('projects to the GBIF tile grids and back', () => {
    // EPSG:3575: the equator lies on the tile edge circle; lon 10 points down.
    const [x, y] = polarForward('EPSG:3575', 10, 0);
    expect(x).toBeCloseTo(0, 3);
    expect(y).toBeCloseTo(-POLAR_EXTENT['EPSG:3575'], 0);
    for (const srs of ['EPSG:3575', 'EPSG:3031'] as const) {
      for (const [lon, lat] of srs === 'EPSG:3575' ? [[-150, 61], [25, 71], [140, 35]] : [[166, -78], [-67, -56], [18, -34]]) {
        const [px, py] = polarForward(srs, lon, lat);
        const [lon2, lat2] = polarInverse(srs, px, py);
        expect(lon2).toBeCloseTo(lon, 6);
        expect(lat2).toBeCloseTo(lat, 6);
      }
    }
    // EPSG:3031 true scale at 71 S: McMurdo ~1.3e6 m from the pole.
    expect(Math.hypot(...polarForward('EPSG:3031', 166.67, -77.85))).toBeGreaterThan(1.2e6);
  });

  it('densifies without crossing the 180/-180 seam of a parallel', () => {
    const ring = bboxRings([-180, 66, 180, 90]);
    expect(ring).toHaveLength(1);
    const pts = densifyRing(ring[0], 1);
    expect(pts).toHaveLength(361); // 180 + 180 one-degree steps, the seam adds no points
    expect(bboxRings([-180, -80, 180, -50])).toHaveLength(2);
  });

  it('fits the area circle into the frame and covers it with tiles', () => {
    const v = fitPolarView('EPSG:3575', bboxRings([-180, 66, 180, 90]), 800, 400, 36);
    const proj = mapProjection(v, 'EPSG:3575');
    const [, top] = proj.toPx(190, 66);
    const [, bottom] = proj.toPx(10, 66);
    expect(top).toBeGreaterThanOrEqual(36);
    expect(bottom).toBeLessThanOrEqual(400);
    const [lon, lat] = proj.fromPx(...proj.toPx(-100, 75));
    expect(lon).toBeCloseTo(-100, 6);
    expect(lat).toBeCloseTo(75, 6);
    const tiles = polarTilesForView('EPSG:3575', v);
    expect(tiles.length).toBeGreaterThan(0);
    const z = tiles[0].z;
    expect(tiles.every((t) => t.x >= 0 && t.y >= 0 && t.x < 2 ** z && t.y < 2 ** z)).toBe(true);
  });

  it('drags a box the short way across 180 degrees', () => {
    expect(polarDragBbox([170, 70], [-170, 80])).toEqual([170, 70, -170, 80]);
    expect(polarDragBbox([10, 70], [10.2, 70.3])).toBeNull();
  });
});
