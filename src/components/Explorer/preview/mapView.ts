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
  x: number;
  y: number;
  /** CSS px relative to the map's top-left corner. */
  left: number;
  top: number;
  size: number;
}

/** Highest tile zoom the preview uses (spec: zoom 0-3, no free pan or zoom). */
export const MAX_TILE_ZOOM = 3;
/** Narrowest view in degrees, so small areas are not blown up into a blur. */
export const MIN_VIEW_DEGREES = 12;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Fit `bbox` (null = world) into a `width` x `height` px frame with some padding.
 * The view never gets wider than the world, and stays inside it when it is smaller.
 */
export function fitView(bbox: BBox | null, width: number, height: number): MapView {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const [bw, bs, be, bn] = bbox ?? [-180, -90, 180, 90];
  const world = !bbox || (be - bw >= 359 && bn - bs >= 170);
  const pad = world ? 0 : Math.max(2, 0.08 * Math.max(be - bw, bn - bs));
  const tw = Math.max(MIN_VIEW_DEGREES, be - bw + 2 * pad);
  const th = Math.max(MIN_VIEW_DEGREES / 2, bn - bs + 2 * pad);
  const scale = Math.max(Math.min(w / tw, h / th), w / 360);
  const vw = w / scale;
  const vh = h / scale;
  const cx = vw >= 360 ? 0 : clamp((bw + be) / 2, -180 + vw / 2, 180 - vw / 2);
  // Polar latitudes rarely hold records: with the world in a wide frame, centre a bit north.
  const cy = vh >= 180 ? 0 : world ? clamp(8, -90 + vh / 2, 90 - vh / 2) : clamp((bs + bn) / 2, -90 + vh / 2, 90 - vh / 2);
  return { west: cx - vw / 2, east: cx + vw / 2, south: cy - vh / 2, north: cy + vh / 2, scale };
}

/** Smallest zoom whose tiles are at least as sharp as the view (CSS px; @2x tiles cover HiDPI). */
export function chooseZoom(scale: number): number {
  for (let z = 0; z < MAX_TILE_ZOOM; z++) {
    if ((GBIF_TILE_SIZE * 2 ** z) / 180 >= scale) return z;
  }
  return MAX_TILE_ZOOM;
}

/** Tiles of zoom `z` that cover the view, positioned in CSS px. */
export function tilesForView(view: MapView, z = chooseZoom(view.scale)): PlacedTile[] {
  const { cols, rows, degrees } = gbifTileGrid(z);
  const x0 = clamp(Math.floor((view.west + 180) / degrees), 0, cols - 1);
  const x1 = clamp(Math.ceil((view.east + 180) / degrees) - 1, 0, cols - 1);
  const y0 = clamp(Math.floor((90 - view.north) / degrees), 0, rows - 1);
  const y1 = clamp(Math.ceil((90 - view.south) / degrees) - 1, 0, rows - 1);
  const out: PlacedTile[] = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const [west, , , north] = gbifTileBounds({ z, x, y });
      out.push({
        z,
        x,
        y,
        left: (west - view.west) * view.scale,
        top: (view.north - north) * view.scale,
        size: degrees * view.scale,
      });
    }
  }
  return out;
}

/** CSS px offset in the map -> lon/lat (clamped to the world). */
export function pxToLonLat(view: MapView, px: number, py: number): [number, number] {
  return [clamp(view.west + px / view.scale, -180, 180), clamp(view.north - py / view.scale, -90, 90)];
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
