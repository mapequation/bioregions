// Client-side hexagon bins of the loaded records for the preview map's 'Loaded' scope.
// Pure and DOM-free: the records are flattened once per load into a Float64Array, then
// binned per view in one tight loop into a typed count grid (500k points in ~10-20 ms).
import { type MapView, type PolarSrs, polarForward } from './mapView';

/** Interleaved lon, lat pairs of every loaded point. */
export type LonLatArray = Float64Array;

interface PointGeometry {
  type: string;
  coordinates?: unknown;
}

/** Total point count of MultiPoint (and Point) geometries. */
function countPoints(geometries: readonly PointGeometry[]): number {
  let n = 0;
  for (const g of geometries) {
    if (g.type === 'MultiPoint') n += (g.coordinates as unknown[]).length;
    else if (g.type === 'Point') n += 1;
  }
  return n;
}

/** Flatten MultiPoint/Point geometries into interleaved lon/lat pairs (non-finite pairs dropped). */
export function flattenPoints(geometries: readonly PointGeometry[]): LonLatArray {
  const out = new Float64Array(countPoints(geometries) * 2);
  let k = 0;
  const push = (p: unknown) => {
    const c = p as number[];
    const lon = c[0];
    const lat = c[1];
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
    out[k++] = lon;
    out[k++] = lat;
  };
  for (const g of geometries) {
    if (g.type === 'MultiPoint') for (const p of g.coordinates as unknown[]) push(p);
    else if (g.type === 'Point') push(g.coordinates);
  }
  return k === out.length ? out : out.slice(0, k);
}

const flatCache = new WeakMap<object, { count: number; xy: LonLatArray }>();

/**
 * The points of a GeometryCollection, flattened once per load: the cache is keyed by the
 * collection object (replaced on every new load) and refreshed when points were added.
 */
export function cachedPoints(collection: { geometries: readonly PointGeometry[] }): LonLatArray {
  const count = countPoints(collection.geometries);
  const hit = flatCache.get(collection);
  if (hit && hit.count === count) return hit.xy;
  const xy = flattenPoints(collection.geometries);
  flatCache.set(collection, { count, xy });
  return xy;
}

// --- Hexagon grid ----------------------------------------------------------------------
// Flat-top hexagons like GBIF's `bin=hex` tiles: columns `dx` px apart (the tile width over
// `hexPerTile`, i.e. 1.5 circumradii), hexagons `sqrt(3) r` apart down a column, odd
// columns shifted down by half a hexagon.

export interface HexGrid {
  /** Px between neighbouring columns. */
  dx: number;
  /** Px origin of the tessellation (e.g. the top-left corner of a density tile). */
  ox: number;
  oy: number;
}

export interface HexBins {
  /** Circumradius in CSS px. */
  r: number;
  /** Px between columns, and between hexagons down a column. */
  dx: number;
  dy: number;
  /** Centre of cell (0, 0), normalised to just above-left of the frame. */
  ox: number;
  oy: number;
  cols: number;
  rows: number;
  /** Record count per cell, row-major (`row * cols + col`). */
  counts: Uint32Array;
  /** Largest cell count. */
  max: number;
  /** Points that fell inside the frame. */
  inView: number;
}

const SQRT3 = Math.sqrt(3);
const mod = (a: number, m: number) => ((a % m) + m) % m;

/** Centre (CSS px) of the cell in column `i`, row `j`. */
export function hexCenter(b: Pick<HexBins, 'dx' | 'dy' | 'ox' | 'oy'>, i: number, j: number): [number, number] {
  return [b.ox + i * b.dx, b.oy + (j + (i & 1) / 2) * b.dy];
}

/**
 * Bin lon/lat points into the hexagon grid over a `width` x `height` px frame, projected
 * through the view (plate carrée when `srs` is null, else polar). Points off the frame are
 * skipped. The cell lookup is d3-hexbin's on the transposed grid (nearest column, then the
 * nearer of two candidates), with distances compared in px.
 */
export function binHexagons(
  xy: LonLatArray,
  view: MapView,
  srs: PolarSrs | null,
  width: number,
  height: number,
  grid: HexGrid,
): HexBins {
  const dx = Math.max(1, grid.dx);
  const r = dx / 1.5;
  const dy = SQRT3 * r;
  // Shift the origin by whole cells (two columns keep the odd-column offset) to sit above-left of the frame.
  const ox = mod(grid.ox, 2 * dx) - 2 * dx;
  const oy = mod(grid.oy, dy) - dy;
  const cols = Math.ceil((width - ox) / dx) + 2;
  const rows = Math.ceil((height - oy) / dy) + 2;
  const counts = new Uint32Array(cols * rows);
  const { west, north, scale } = view;
  const wraps = !srs && view.east > 180;
  const xMin = -r;
  const xMax = width + r;
  const yMin = -r;
  const yMax = height + r;
  let max = 0;
  let inView = 0;
  const n = xy.length;
  for (let k = 0; k < n; k += 2) {
    let lon = xy[k];
    const lat = xy[k + 1];
    let x: number;
    let y: number;
    if (srs) {
      const p = polarForward(srs, lon, lat);
      x = (p[0] - west) * scale;
      y = (north - p[1]) * scale;
    } else {
      if (wraps && lon < west) lon += 360;
      x = (lon - west) * scale;
      y = (north - lat) * scale;
    }
    if (!(x >= xMin && x <= xMax && y >= yMin && y <= yMax)) continue;
    // Nearest centre: round to the nearest column and row, then check the neighbour column.
    const pu = (x - ox) / dx;
    let ci = Math.round(pu);
    const pv = (y - oy) / dy - (ci & 1) / 2;
    let rj = Math.round(pv);
    const pu1 = pu - ci;
    if (Math.abs(pu1) * 3 > 1) {
      const pv1 = pv - rj;
      const rj2 = rj + (pv < rj ? -1 : 1) / 2;
      const ci2 = ci + (pu < ci ? -1 : 1);
      const pv2 = pv - rj2;
      const pu2 = pu - ci2;
      const ex1 = pu1 * dx;
      const ey1 = pv1 * dy;
      const ex2 = pu2 * dx;
      const ey2 = pv2 * dy;
      if (ex1 * ex1 + ey1 * ey1 > ex2 * ex2 + ey2 * ey2) {
        rj = rj2 + ((ci & 1) !== 0 ? 1 : -1) / 2;
        ci = ci2;
      }
    }
    if (ci < 0 || rj < 0 || ci >= cols || rj >= rows) continue;
    const c = rj * cols + ci;
    const v = counts[c] + 1;
    counts[c] = v;
    if (v > max) max = v;
    inView++;
  }
  return { r, dx, dy, ox, oy, cols, rows, counts, max, inView };
}

// --- Colour ramp -----------------------------------------------------------------------

/** Ramp position of a cell count on the legend's log scale: 1 -> 0, 10 -> 1/3, 1000+ -> 1. */
export function rampPosition(count: number): number {
  return count <= 1 ? 0 : Math.min(1, Math.log10(count) / 3);
}

function parseHex(hex: string): [number, number, number] {
  const v = Number.parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** Colour at `t` in [0, 1] along evenly spaced hex stops, linear in sRGB (like the CSS gradient). */
export function rampColor(stops: readonly string[], t: number): string {
  const s = Math.min(1, Math.max(0, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(s));
  const f = s - i;
  const a = parseHex(stops[i]);
  const b = parseHex(stops[i + 1]);
  const c = a.map((v, k) => Math.round(v + (b[k] - v) * f));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

/** Colour steps used to batch the canvas fills. */
export const RAMP_LEVELS = 48;

/** Level (0 .. RAMP_LEVELS - 1) of a cell count. */
export function rampLevel(count: number): number {
  return Math.round(rampPosition(count) * (RAMP_LEVELS - 1));
}

/** One CSS colour per level along the ramp. */
export function rampLut(stops: readonly string[]): string[] {
  return Array.from({ length: RAMP_LEVELS }, (_, i) => rampColor(stops, i / (RAMP_LEVELS - 1)));
}
