// Pure geometry for the preview map: a plate-carrée viewport fitted to the query area,
// the GBIF EPSG:4326 tiles that cover it, and the legend/note texts. No DOM access.
import { GBIF_TILE_SIZE, gbifTileBounds, gbifTileGrid } from '@/sources/gbif/tiles';
import type { BBox } from '@/sources/types';

/** Visible lon/lat window and its scale in CSS px per degree (same in x and y). */
export interface MapView {
  west: number;
  south: number;
  east: number;
  north: number;
  /** CSS pixels per degree. */
  scale: number;
}

export interface PlacedTile {
  z: number;
  /** Tile column for the URL, wrapped into the world. */
  x: number;
  y: number;
  /** Unwrapped column (x + k * columns), unique per placed tile; differs from `x` across the antimeridian. */
  col: number;
  /** CSS px relative to the map's top-left corner. */
  left: number;
  top: number;
  size: number;
}

/**
 * Highest tile zoom. The preview has no free pan or zoom; it only fits the area, so
 * this keeps small areas (down to MIN_VIEW_DEGREES) sharp.
 */
export const MAX_TILE_ZOOM = 5;
/** Narrowest view in degrees, so small areas are not blown up into a blur. */
export const MIN_VIEW_DEGREES = 12;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * A box with east < west crosses the antimeridian (e.g. Oceania [110, -50, -120, 30]);
 * return it with east + 360 so it is a plain interval (east may exceed 180).
 */
export function unwrapBbox(bbox: BBox): BBox {
  const [w, s, e, n] = bbox;
  return e < w ? [w, s, e + 360, n] : bbox;
}

/**
 * Inverse of `unwrapBbox` for a box in unwrapped longitudes (e.g. drawn across 180°):
 * shifted into [-180, 180], with east < west when it crosses the antimeridian.
 */
export function wrapBbox(bbox: BBox): BBox {
  let [w, s, e, n] = bbox;
  if (e - w >= 360) return [-180, s, 180, n];
  while (w >= 180) {
    w -= 360;
    e -= 360;
  }
  while (w < -180) {
    w += 360;
    e += 360;
  }
  if (e > 180) e -= 360;
  return [w, s, e, n];
}

/**
 * Fit `bbox` (null = world) into a `width` x `height` px frame with some padding,
 * keeping the area below the top `insetTop` px (the map controls).
 * The view never gets wider than the world, and stays inside it when it is smaller;
 * a box across the antimeridian is fitted unwrapped (the view then reaches past 180°).
 */
export function fitView(bbox: BBox | null, width: number, height: number, insetTop = 0): MapView {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const [bw, bs, be, bn] = bbox ? unwrapBbox(bbox) : [-180, -90, 180, 90];
  const world = !bbox || (be - bw >= 359 && bn - bs >= 170);
  const pad = world ? 0 : Math.max(2, 0.08 * Math.max(be - bw, bn - bs));
  const tw = Math.max(MIN_VIEW_DEGREES, be - bw + 2 * pad);
  const th = Math.max(MIN_VIEW_DEGREES / 2, bn - bs + 2 * pad);
  // An area keeps clear of the top `insetTop` px, where the map controls sit.
  const inset = world ? 0 : Math.min(Math.max(0, insetTop), h / 3);
  const scale = Math.max(Math.min(w / tw, (h - inset) / th), w / 360);
  const vw = w / scale;
  const vh = h / scale;
  // A box across the antimeridian is centred as is (tiles wrap); others stay inside the world.
  const crosses = be > 180;
  const cx = crosses ? (bw + be) / 2 : vw >= 360 ? 0 : clamp((bw + be) / 2, -180 + vw / 2, 180 - vw / 2);
  const shift = inset / 2 / scale;
  const cy =
    vh >= 180 ? 0 : world ? clamp(8, -90 + vh / 2, 90 - vh / 2) : clamp((bs + bn) / 2 + shift, -90 + vh / 2, 90 - vh / 2);
  return { west: cx - vw / 2, east: cx + vw / 2, south: cy - vh / 2, north: cy + vh / 2, scale };
}

/** Smallest zoom whose tiles are at least as sharp as the view (CSS px; @2x tiles cover HiDPI). */
export function chooseZoom(scale: number): number {
  for (let z = 0; z < MAX_TILE_ZOOM; z++) {
    if ((GBIF_TILE_SIZE * 2 ** z) / 180 >= scale) return z;
  }
  return MAX_TILE_ZOOM;
}

/**
 * Tiles of zoom `z` that cover the view, positioned in CSS px. Columns wrap around the
 * antimeridian; `within` (unwrapped lon/lat box) limits them to tiles touching it.
 */
export function tilesForView(view: MapView, z = chooseZoom(view.scale), within?: BBox | null): PlacedTile[] {
  const { cols, rows, degrees } = gbifTileGrid(z);
  let { west, east, south, north } = view;
  if (within) {
    const [bw, bs, be, bn] = unwrapBbox(within);
    west = Math.max(west, bw);
    east = Math.min(east, be);
    south = Math.max(south, bs);
    north = Math.min(north, bn);
    if (west >= east || south >= north) return [];
  }
  const eps = 1e-9;
  const x0 = Math.floor((west + 180) / degrees + eps);
  const x1 = Math.min(x0 + cols - 1, Math.ceil((east + 180) / degrees - eps) - 1);
  const y0 = clamp(Math.floor((90 - north) / degrees + eps), 0, rows - 1);
  const y1 = clamp(Math.ceil((90 - south) / degrees - eps) - 1, 0, rows - 1);
  const out: PlacedTile[] = [];
  for (let y = y0; y <= y1; y++) {
    for (let col = x0; col <= x1; col++) {
      const x = ((col % cols) + cols) % cols;
      const [, , , tileNorth] = gbifTileBounds({ z, x, y });
      const tileWest = -180 + col * degrees;
      out.push({
        z,
        x,
        y,
        col,
        left: (tileWest - view.west) * view.scale,
        top: (view.north - tileNorth) * view.scale,
        size: degrees * view.scale,
      });
    }
  }
  return out;
}

/**
 * CSS px offset in the map -> lon/lat, clamped to the view's world (longitude stays
 * unwrapped, so it can pass 180° in a view across the antimeridian; see `wrapBbox`).
 */
export function pxToLonLat(view: MapView, px: number, py: number): [number, number] {
  const east = Math.max(180, view.east);
  return [clamp(view.west + px / view.scale, east - 360, east), clamp(view.north - py / view.scale, -90, 90)];
}

/** Bounding box of every coordinate pair in a WKT string (null when none). */
export function wktBbox(wkt: string): BBox | null {
  const nums = wkt.match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi)?.map(Number) ?? [];
  if (nums.length < 2) return null;
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    w = Math.min(w, nums[i]);
    e = Math.max(e, nums[i]);
    s = Math.min(s, nums[i + 1]);
    n = Math.max(n, nums[i + 1]);
  }
  return [w, s, e, n];
}

/** Rounded bbox from two dragged corners; null when the drag is too small to be meant. */
export function dragBbox(a: [number, number], b: [number, number], minDegrees = 1): BBox | null {
  const r = (v: number) => Math.round(v * 10) / 10;
  const bbox: BBox = [r(Math.min(a[0], b[0])), r(Math.min(a[1], b[1])), r(Math.max(a[0], b[0])), r(Math.max(a[1], b[1]))];
  return bbox[2] - bbox[0] < minDegrees || bbox[3] - bbox[1] < minDegrees ? null : bbox;
}

/**
 * Extent of the non-transparent pixels in an RGBA image that spans `bounds`, ignoring
 * the outermost `trim` share of pixels on each axis so a few remote islands or
 * mis-georeferenced points do not stretch the fit. Null when the image is empty.
 */
export function alphaExtent(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  bounds: BBox,
  trim = 0.003,
): BBox | null {
  const cols = new Float64Array(width);
  const rows = new Float64Array(height);
  let total = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rgba[(y * width + x) * 4 + 3] > 0) {
        cols[x]++;
        rows[y]++;
        total++;
      }
    }
  }
  if (total === 0) return null;
  const range = (counts: Float64Array): [number, number] => {
    const cut = total * trim;
    let lo = 0;
    for (let acc = 0; lo < counts.length - 1 && acc + counts[lo] <= cut; lo++) acc += counts[lo];
    let hi = counts.length - 1;
    for (let acc = 0; hi > lo && acc + counts[hi] <= cut; hi--) acc += counts[hi];
    return [lo, hi + 1];
  };
  const [w, s, e, n] = bounds;
  const [x0, x1] = range(cols);
  const [y0, y1] = range(rows);
  const dx = (e - w) / width;
  const dy = (n - s) / height;
  return [w + x0 * dx, n - y1 * dy, w + x1 * dx, n - y0 * dy];
}

/** Union of boxes (null when empty). */
export function unionBbox(boxes: (BBox | null)[]): BBox | null {
  const ok = boxes.filter((b): b is BBox => b != null);
  if (ok.length === 0) return null;
  return [
    Math.min(...ok.map((b) => b[0])),
    Math.min(...ok.map((b) => b[1])),
    Math.max(...ok.map((b) => b[2])),
    Math.max(...ok.map((b) => b[3])),
  ];
}

const NOT_SHOWN = new Set(['Taxa after the first', 'Countries after the first']);

/**
 * The note under the map, from `gbifTileFilterCoverage(query).ignored`: the spec
 * sentence when some quality filter only applies to the counts.
 */
export function mapNote(ignored: string[]): string {
  const parts: string[] = [];
  if (ignored.includes('Taxa after the first')) parts.push('Map shows the first taxon only.');
  if (ignored.includes('Countries after the first')) parts.push('Map shows the first country only.');
  const quality = ignored.filter((i) => !NOT_SHOWN.has(i));
  parts.push(
    quality.length > 0
      ? 'Map shows taxon, area, years and basis of record only; quality filters apply to the counts.'
      : 'Map applies every filter of the query.',
  );
  return parts.join(' ');
}

/** "1", "10", "100", "1k", "10k" ... for legend steps. */
export function legendLabel(n: number): string {
  if (n >= 1e6) return `${n / 1e6}M`;
  if (n >= 1e3) return `${n / 1e3}k`;
  return String(n);
}

/** Powers of ten from 1 up to the first one at or above `max` (at least [1, 10]). */
export function decadeSteps(max: number): number[] {
  const steps = [1];
  while (steps[steps.length - 1] < max || steps.length < 2) steps.push(steps[steps.length - 1] * 10);
  return steps;
}

// --- Polar views ---------------------------------------------------------------------
// GBIF serves basemap and density tiles in two polar projections as well. A circumpolar
// area (a full-longitude band, or one entirely poleward of 45°) is a thin strip in plate
// carrée, so it is shown in the polar projection instead. The forward/inverse formulas
// below are those of the EPSG definitions, so overlays line up with the tiles exactly.

export type PolarSrs = 'EPSG:3575' | 'EPSG:3031';

/** Sphere radius GBIF uses for its EPSG:3575 grid. */
const R_3575 = 6371007.2;
/** Half the width of the zoom-0 tile, in projected metres (GBIF's tile grids). */
export const POLAR_EXTENT: Record<PolarSrs, number> = {
  'EPSG:3575': R_3575 * Math.SQRT2,
  'EPSG:3031': 12367396.2185,
};
const POLAR_MAX_ZOOM = 6;
const RAD = Math.PI / 180;
// WGS84 polar stereographic with true scale at 71° S (EPSG:3031).
const WGS84_A = 6378137;
const WGS84_E = Math.sqrt(2 / 298.257223563 - (1 / 298.257223563) ** 2);
const stT = (phi: number) =>
  Math.tan(Math.PI / 4 - phi / 2) / ((1 - WGS84_E * Math.sin(phi)) / (1 + WGS84_E * Math.sin(phi))) ** (WGS84_E / 2);
const ST_PHI_C = 71 * RAD;
const ST_MC = Math.cos(ST_PHI_C) / Math.sqrt(1 - WGS84_E ** 2 * Math.sin(ST_PHI_C) ** 2);
const ST_TC = stT(ST_PHI_C);

/** Polar projection for an area (null = keep plate carrée). */
export function polarSrsFor(bbox: BBox | null): PolarSrs | null {
  if (!bbox) return null;
  const [w, s, e, n] = unwrapBbox(bbox);
  const band = e - w >= 359;
  if (s >= 45 || (band && s >= 20)) return 'EPSG:3575';
  if (n <= -45 || (band && n <= -20)) return 'EPSG:3031';
  return null;
}

/** lon/lat -> projected metres (y up). */
export function polarForward(srs: PolarSrs, lon: number, lat: number): [number, number] {
  if (srs === 'EPSG:3575') {
    // Lambert azimuthal equal-area, lat_0 = 90, lon_0 = 10, on GBIF's sphere.
    const l = (lon - 10) * RAD;
    const rho = 2 * R_3575 * Math.sin(((90 - lat) * RAD) / 2);
    return [rho * Math.sin(l), -rho * Math.cos(l)];
  }
  // Polar stereographic, lat_0 = -90, lat_ts = -71, lon_0 = 0, WGS84.
  const rho = (WGS84_A * ST_MC * stT(-lat * RAD)) / ST_TC;
  const l = lon * RAD;
  return [rho * Math.sin(l), rho * Math.cos(l)];
}

/** Projected metres -> lon/lat. */
export function polarInverse(srs: PolarSrs, x: number, y: number): [number, number] {
  const rho = Math.hypot(x, y);
  if (srs === 'EPSG:3575') {
    const c = 2 * Math.asin(Math.min(1, rho / (2 * R_3575)));
    return [rho === 0 ? 10 : 10 + Math.atan2(x, -y) / RAD, 90 - c / RAD];
  }
  const t = (rho * ST_TC) / (WGS84_A * ST_MC);
  let phi = Math.PI / 2 - 2 * Math.atan(t);
  for (let i = 0; i < 8; i++) {
    const es = WGS84_E * Math.sin(phi);
    phi = Math.PI / 2 - 2 * Math.atan(t * ((1 - es) / (1 + es)) ** (WGS84_E / 2));
  }
  return [rho === 0 ? 0 : Math.atan2(x, y) / RAD, -phi / RAD];
}

/** Points along a lon/lat ring, at most `step` degrees apart (edges follow parallels and meridians). */
export function densifyRing(ring: [number, number][], step = 1): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % ring.length];
    // A jump of a whole turn along a parallel (180° back to -180°) is the same point: no edge.
    const seam = Math.abs(x1 - x0) >= 359.999 && y1 === y0;
    const n = seam ? 1 : Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) / step));
    for (let k = 0; k < n; k++) out.push([x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n]);
  }
  return out;
}

/**
 * Lon/lat rings that outline a bbox. A full-longitude band is drawn as its bounding
 * parallels only (two circles around the pole, or one when it reaches the pole).
 */
export function bboxRings(bbox: BBox): [number, number][][] {
  const [w, s, e, n] = unwrapBbox(bbox);
  if (e - w >= 359) {
    const circle = (lat: number): [number, number][] => [
      [-180, lat],
      [0, lat],
      [180, lat],
    ];
    return [s, n].filter((lat) => Math.abs(lat) < 89.999).map(circle);
  }
  return [
    [
      [w, s],
      [e, s],
      [e, n],
      [w, n],
    ],
  ];
}

/**
 * Fit a polar view (projected metres; `scale` = CSS px per metre) around the rings,
 * leaving `insetTop` px free at the top for the map controls.
 */
export function fitPolarView(srs: PolarSrs, rings: [number, number][][], width: number, height: number, insetTop = 0): MapView {
  const w = Math.max(1, width);
  const h = Math.max(1, height - insetTop);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const ring of rings) {
    for (const [lon, lat] of densifyRing(ring, 2)) {
      const [x, y] = polarForward(srs, lon, lat);
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  }
  if (!Number.isFinite(x0)) [x0, y0, x1, y1] = [-1e6, -1e6, 1e6, 1e6];
  const pad = Math.max(1e5, 0.06 * Math.max(x1 - x0, y1 - y0));
  const scale = Math.min(w / (x1 - x0 + 2 * pad), h / (y1 - y0 + 2 * pad));
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const north = cy + h / 2 / scale + insetTop / scale;
  return { west: cx - w / 2 / scale, east: cx + w / 2 / scale, north, south: north - height / scale, scale };
}

/** GBIF polar tiles (same 512 px grid for basemap and density) covering a polar view. */
export function polarTilesForView(srs: PolarSrs, view: MapView): PlacedTile[] {
  const extent = POLAR_EXTENT[srs];
  let z = 0;
  while (z < POLAR_MAX_ZOOM && (GBIF_TILE_SIZE * 2 ** z) / (2 * extent) < view.scale) z++;
  const n = 2 ** z;
  const span = (2 * extent) / n;
  const eps = 1e-9;
  const x0 = clamp(Math.floor((view.west + extent) / span + eps), 0, n - 1);
  const x1 = clamp(Math.ceil((view.east + extent) / span - eps) - 1, 0, n - 1);
  const y0 = clamp(Math.floor((extent - view.north) / span + eps), 0, n - 1);
  const y1 = clamp(Math.ceil((extent - view.south) / span - eps) - 1, 0, n - 1);
  const out: PlacedTile[] = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      out.push({
        z,
        x,
        y,
        col: x,
        left: (-extent + x * span - view.west) * view.scale,
        top: (view.north - (extent - y * span)) * view.scale,
        size: span * view.scale,
      });
    }
  }
  return out;
}

/** A view's lon/lat <-> CSS px mapping: plate carrée (`srs` null) or polar. */
export interface MapProjection {
  srs: PolarSrs | null;
  toPx(lon: number, lat: number): [number, number];
  /** Unwrapped lon (plate carrée) or lon in [-180, 180] (polar), clamped lat. */
  fromPx(px: number, py: number): [number, number];
}

export function mapProjection(view: MapView, srs: PolarSrs | null): MapProjection {
  if (!srs) {
    return {
      srs,
      toPx: (lon, lat) => [(lon - view.west) * view.scale, (view.north - lat) * view.scale],
      fromPx: (px, py) => pxToLonLat(view, px, py),
    };
  }
  return {
    srs,
    toPx: (lon, lat) => {
      const [x, y] = polarForward(srs, lon, lat);
      return [(x - view.west) * view.scale, (view.north - y) * view.scale];
    },
    fromPx: (px, py) => {
      const [lon, lat] = polarInverse(srs, view.west + px / view.scale, view.north - py / view.scale);
      return [lon, srs === 'EPSG:3575' ? Math.max(0, lat) : Math.min(0, lat)];
    },
  };
}

/** SVG path (CSS px) of closed lon/lat rings, densified so parallels curve in polar views. */
export function ringsPath(proj: MapProjection, rings: [number, number][][], step = 1): string {
  return rings
    .map((ring) => {
      const pts = proj.srs ? densifyRing(ring, step) : ring;
      return `M${pts.map((p) => proj.toPx(p[0], p[1]).map((v) => v.toFixed(1)).join(',')).join('L')}Z`;
    })
    .join('');
}

/**
 * Bbox from two dragged lon/lat corners in a polar view: the second longitude is taken
 * the short way round from the first, so a drag across 180° gives a box across it.
 */
export function polarDragBbox(a: [number, number], b: [number, number], minDegrees = 1): BBox | null {
  let lon = b[0];
  while (lon - a[0] > 180) lon -= 360;
  while (a[0] - lon > 180) lon += 360;
  const box = dragBbox(a, [lon, b[1]], minDegrees);
  return box ? wrapBbox(box) : null;
}
