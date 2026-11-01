import { geoPath, geoProjection } from 'd3';
import type { GeoPermissibleObjects } from 'd3';

// Bioregion minimaps are small multiples: every minimap shares one frame (the padded data extent)
// in an equirectangular projection with a standard parallel at the frame's mid-latitude. Lon/lat
// are affine in that projection, so grid cells are exact rectangles.

/** A lon/lat rectangle, as on `Cell` (x1 west, y1 south, x2 east, y2 north). */
export interface LonLatRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Shared minimap frame in degrees; `k` = cos(standard parallel) scales longitudes. */
export interface MinimapFrame {
  w: number;
  s: number;
  e: number;
  n: number;
  k: number;
}

export const FRAME_PAD = 0.06;
const MAX_PARALLEL = 60;
const MIN_ASPECT = 0.86;
const MAX_ASPECT = 1.72;
/** Minimum cell side in device pixels, so single cells stay visible. */
export const MIN_CELL_PX = 1.5;
/** Region bboxes covering less than this share of the frame get a locator rectangle. */
export const LOCATOR_MAX_SHARE = 0.04;
const LOCATOR_GAP = 3; // css px outside the region bbox
/** Regions drawn narrower or shorter than this (css px) get a ring instead, so they stay visible. */
export const RING_MAX_PX = 8;
const RING_MIN_RADIUS = 4; // css px
const RING_RADIUS_SHARE = 0.065; // of the canvas height
const RING_WIDTH = 1.5; // css px
const RING_HALO = 1; // css px on each side of the ring

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** Bounding box of `cells`, padded by `pad` of its span on each side and clamped to the globe. */
export function computeFrame(
  cells: Iterable<LonLatRect>,
  pad = FRAME_PAD,
): MinimapFrame | null {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const c of cells) {
    if (c.x1 < w) w = c.x1;
    if (c.y1 < s) s = c.y1;
    if (c.x2 > e) e = c.x2;
    if (c.y2 > n) n = c.y2;
  }
  if (!(e > w && n > s)) return null;
  const dx = (e - w) * pad;
  const dy = (n - s) * pad;
  w = clamp(w - dx, -180, 180);
  e = clamp(e + dx, -180, 180);
  s = clamp(s - dy, -90, 90);
  n = clamp(n + dy, -90, 90);
  const phi0 = clamp((s + n) / 2, -MAX_PARALLEL, MAX_PARALLEL);
  return { w, s, e, n, k: Math.cos((phi0 * Math.PI) / 180) };
}

const frameCache = new WeakMap<readonly LonLatRect[], MinimapFrame | null>();

/** `computeFrame` memoized on the cells array identity (one frame for all minimaps). */
export function getFrame(cells: readonly LonLatRect[]): MinimapFrame | null {
  if (!frameCache.has(cells)) frameCache.set(cells, computeFrame(cells));
  return frameCache.get(cells) ?? null;
}

/** Projected width / height of the frame. */
export function frameAspect(frame: MinimapFrame) {
  return ((frame.e - frame.w) * frame.k) / (frame.n - frame.s);
}

/** Box width for a minimap of `height`: the frame aspect, clamped so boxes stay card-sized. */
export function minimapWidth(height: number, frame: MinimapFrame | null) {
  const aspect = frame
    ? clamp(frameAspect(frame), MIN_ASPECT, MAX_ASPECT)
    : 1.4;
  return Math.round(height * aspect);
}

export interface Projection {
  x: (lon: number) => number;
  y: (lat: number) => number;
  /** Pixels per projected degree. */
  scale: number;
}

/** Fit `frame` into a `width` x `height` box (any pixel unit), centered (letterboxed). */
export function fitProjection(
  frame: MinimapFrame,
  width: number,
  height: number,
): Projection {
  const fw = (frame.e - frame.w) * frame.k;
  const fh = frame.n - frame.s;
  const scale = Math.min(width / fw, height / fh);
  const ox = (width - fw * scale) / 2;
  const oy = (height - fh * scale) / 2;
  const kScale = frame.k * scale;
  return {
    x: (lon) => ox + (lon - frame.w) * kScale,
    y: (lat) => oy + (frame.n - lat) * scale,
    scale,
  };
}

/** Pixel-snapped fillRect arguments [x, y, w, h] for a lon/lat rectangle, at least `minSize` per
 *  side. Adjacent cells share snapped edges, so the grid has no seams. */
export function cellRect(
  proj: Projection,
  rect: LonLatRect,
  minSize = MIN_CELL_PX,
): [number, number, number, number] {
  const x0 = Math.round(proj.x(rect.x1));
  const x1 = Math.round(proj.x(rect.x2));
  const y0 = Math.round(proj.y(rect.y2));
  const y1 = Math.round(proj.y(rect.y1));
  return [x0, y0, Math.max(x1 - x0, minSize), Math.max(y1 - y0, minSize)];
}

export type Locator =
  | { kind: 'ring'; cx: number; cy: number; r: number }
  | { kind: 'rect'; x0: number; y0: number; x1: number; y1: number };

/** Locator marks for a region bbox [w, s, e, n] (east may exceed 180), in the units of `proj`;
 *  `px` is the size of one css pixel in those units and `height` the box height. A part drawn
 *  under `RING_MAX_PX` css px in either dimension gets a ring around its center; a larger region
 *  covering under `LOCATOR_MAX_SHARE` of the frame gets a rectangle just outside its bbox. */
export function regionLocators(
  proj: Projection,
  frame: MinimapFrame,
  bbox: readonly [number, number, number, number],
  height: number,
  px = 1,
): Locator[] {
  const [w, s, e, n] = bbox;
  if (!(e > w && n >= s)) return [];
  const parts: [number, number][] =
    e > 180
      ? [
          [w, 180],
          [-180, e - 360],
        ]
      : [[w, e]];
  const y0 = proj.y(n);
  const y1 = proj.y(s);
  const dims = parts.map(([pw, pe]) => ({ x0: proj.x(pw), x1: proj.x(pe) }));
  const isTiny = dims.some(
    ({ x0, x1 }) => Math.min(x1 - x0, y1 - y0) < RING_MAX_PX * px,
  );
  if (isTiny) {
    return dims.map(({ x0, x1 }) => {
      // Big enough to enclose the short side of a thin region.
      const minSide = Math.min(x1 - x0, y1 - y0);
      const r = Math.max(
        RING_MIN_RADIUS * px,
        RING_RADIUS_SHARE * height,
        minSide / 2 + 1.5 * px,
      );
      return { kind: 'ring', cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, r };
    });
  }
  const share =
    ((e - w) * (n - s)) / ((frame.e - frame.w) * (frame.n - frame.s));
  if (share >= LOCATOR_MAX_SHARE) return [];
  const gap = LOCATOR_GAP * px;
  return dims.map(({ x0, x1 }) => ({
    kind: 'rect',
    x0: x0 - gap,
    y0: y0 - gap,
    x1: x1 + gap,
    y1: y1 + gap,
  }));
}

const formatLat = (lat: number) => {
  const v = Math.round(lat);
  return v === 0 ? '0°' : `${Math.abs(v)}°${v > 0 ? 'N' : 'S'}`;
};
const formatLon = (lon: number) => {
  let v = Math.round(lon);
  if (v > 180) v -= 360;
  if (v < -180) v += 360;
  return v === 0 || Math.abs(v) === 180
    ? `${Math.abs(v)}°`
    : `${Math.abs(v)}°${v > 0 ? 'E' : 'W'}`;
};

/** "8°N–34°S, 78°W–52°W" for a [w, s, e, n] bbox (east may exceed 180 across the antimeridian). */
export function formatBBox([w, s, e, n]: readonly [
  number,
  number,
  number,
  number,
]) {
  return `${formatLat(n)}–${formatLat(s)}, ${formatLon(w)}–${formatLon(e)}`;
}

// ---------------------------------------------------------------------------------------------
// Drawing (browser only)

export type MinimapMode = 'light' | 'dark';

const PALETTE: Record<
  MinimapMode,
  { water: string; land: string; cells: string; halo: string }
> = {
  light: {
    water: '#e9eff4',
    land: '#fbfbfa',
    cells: 'rgba(0, 0, 0, 0.13)',
    halo: 'rgba(255, 255, 255, 0.92)',
  },
  dark: {
    water: '#0b0c0e',
    land: '#1c1d21',
    cells: 'rgba(255, 255, 255, 0.14)',
    halo: 'rgba(0, 0, 0, 0.85)',
  },
};

const baseCache = new WeakMap<
  readonly LonLatRect[],
  Map<string, HTMLCanvasElement>
>();
const MAX_BASES_PER_CELLS = 8;

/** Background, land and all cells in neutral gray, drawn once per frame/size/dpr/mode/cells. */
function getBase(
  cells: readonly LonLatRect[],
  frame: MinimapFrame,
  pxW: number,
  pxH: number,
  mode: MinimapMode,
  land: GeoPermissibleObjects | null,
) {
  let bases = baseCache.get(cells);
  if (!bases) {
    bases = new Map();
    baseCache.set(cells, bases);
  }
  const key = `${frame.w},${frame.s},${frame.e},${frame.n}|${pxW}x${pxH}|${mode}|${land ? 1 : 0}`;
  const cached = bases.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = pxW;
  canvas.height = pxH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const colors = PALETTE[mode];
  const proj = fitProjection(frame, pxW, pxH);

  ctx.fillStyle = colors.water;
  ctx.fillRect(0, 0, pxW, pxH);

  if (land) {
    // Same affine mapping as `proj`, but as a d3 projection so polygons crossing the antimeridian
    // (Fiji, Chukotka, Antarctica) are cut instead of smeared across the frame.
    const { k } = frame;
    const landProjection = geoProjection((lambda, phi) => [lambda * k, phi])
      .scale((proj.scale * 180) / Math.PI)
      .translate([proj.x(0), proj.y(0)])
      .precision(0);
    ctx.beginPath();
    geoPath(landProjection, ctx)(land);
    ctx.fillStyle = colors.land;
    ctx.fill('evenodd');
  }

  // One path for all cells: overlapping min-size rects are filled once, keeping the alpha even.
  ctx.beginPath();
  for (const cell of cells) ctx.rect(...cellRect(proj, cell));
  ctx.fillStyle = colors.cells;
  ctx.fill();

  if (bases.size >= MAX_BASES_PER_CELLS) {
    const oldest = bases.keys().next().value;
    if (oldest !== undefined) bases.delete(oldest);
  }
  bases.set(key, canvas);
  return canvas;
}

export interface MinimapDrawOptions {
  /** All grid cells (shared frame and gray base layer). */
  cells: readonly LonLatRect[];
  /** This region's cells. */
  regionCells: Iterable<LonLatRect>;
  /** Region bbox [w, s, e, n]; east may exceed 180. */
  bbox: readonly [number, number, number, number];
  color: string;
  /** CSS size of the canvas. */
  width: number;
  height: number;
  mode: MinimapMode;
  land: GeoPermissibleObjects | null;
}

/** Draw a bioregion minimap into `canvas`: cached base + one fillRect per region cell. */
export function drawMinimap(
  canvas: HTMLCanvasElement,
  opts: MinimapDrawOptions,
) {
  const dpr = window.devicePixelRatio || 1;
  const pxW = Math.max(1, Math.round(opts.width * dpr));
  const pxH = Math.max(1, Math.round(opts.height * dpr));
  if (canvas.width !== pxW) canvas.width = pxW;
  if (canvas.height !== pxH) canvas.height = pxH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const frame = getFrame(opts.cells);
  if (!frame) {
    ctx.fillStyle = PALETTE[opts.mode].water;
    ctx.fillRect(0, 0, pxW, pxH);
    return;
  }
  ctx.drawImage(
    getBase(opts.cells, frame, pxW, pxH, opts.mode, opts.land),
    0,
    0,
  );

  const proj = fitProjection(frame, pxW, pxH);
  ctx.fillStyle = opts.color;
  for (const cell of opts.regionCells) ctx.fillRect(...cellRect(proj, cell));

  // Locators: a haloed ring around regions too small to see, a 1 css px rectangle just outside
  // the bbox of other small regions.
  const locators = regionLocators(proj, frame, opts.bbox, pxH, dpr);
  const half = Math.round(dpr) / 2;
  for (const loc of locators) {
    if (loc.kind === 'ring') {
      ctx.beginPath();
      ctx.arc(loc.cx, loc.cy, loc.r, 0, 2 * Math.PI);
      ctx.strokeStyle = PALETTE[opts.mode].halo;
      ctx.lineWidth = (RING_WIDTH + 2 * RING_HALO) * dpr;
      ctx.stroke();
      ctx.strokeStyle = opts.color;
      ctx.lineWidth = RING_WIDTH * dpr;
      ctx.stroke();
    } else {
      const x0 = Math.round(loc.x0) + half;
      const x1 = Math.round(loc.x1) - half;
      const y0 = Math.round(loc.y0) + half;
      const y1 = Math.round(loc.y1) - half;
      ctx.strokeStyle = opts.color;
      ctx.lineWidth = Math.round(dpr) || 1;
      ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Lazy first draw: one IntersectionObserver shared by all minimaps.

let observer: IntersectionObserver | null = null;
const onVisible = new Map<Element, () => void>();

/** Call `callback` once when `el` comes within 200px of the viewport. Returns an unsubscribe. */
export function whenVisible(el: Element, callback: () => void) {
  if (typeof IntersectionObserver === 'undefined') {
    callback();
    return () => {};
  }
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const cb = onVisible.get(entry.target);
        onVisible.delete(entry.target);
        observer?.unobserve(entry.target);
        cb?.();
      }
    },
    { rootMargin: '200px' },
  );
  onVisible.set(el, callback);
  observer.observe(el);
  return () => {
    onVisible.delete(el);
    observer?.unobserve(el);
  };
}
