import { Box, Button, Group, HStack, Icon, SegmentGroup, Spinner, Text } from '@chakra-ui/react';
import { toJS } from 'mobx';
import { observer } from 'mobx-react';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { LuCloudOff, LuGlobe, LuInfo, LuScan, LuSquareDashed, LuX } from 'react-icons/lu';
import { useColorMode } from '@/components/ui/color-mode';
import { Tooltip } from '@/components/ui/tooltip';
import {
  areaLabel,
  gbifBasemapUrl,
  gbifDensityTileUrl,
  gbifTileFilterCoverage,
  isAbortError,
  obisGrid,
  supportsGbif,
  supportsObis,
  taxaLabel,
  yearsLabel,
} from '@/sources';
import type { AreaFilter, BBox, OccurrenceQuery } from '@/sources/types';
import { useStore } from '../../../store';
import { explorerUi } from '../explorerUi';
import { fmtInt } from '../format';
import { binHexagons, cachedPoints, type HexBins, RAMP_LEVELS, rampLevel, rampLut } from './loadedHexbin';
import {
  alphaExtent,
  bboxRings,
  decadeSteps,
  densityZoom,
  dragBbox,
  fitPolarView,
  fitView,
  legendLabel,
  type MapView,
  type PlacedTile,
  mapNote,
  MIN_DENSITY_ZOOM,
  mapProjection,
  type PolarSrs,
  polarDragBbox,
  polarSrsFor,
  polarTilesForView,
  queryCaption,
  ringsPath,
  tilesForView,
  unionBbox,
  unwrapBbox,
  wktBbox,
  wrapBbox,
} from './mapView';
import { useTileBlobs } from './useTileBlobs';

/** Approximate colour ramps of the GBIF point styles (sampled from rendered tiles). */
const GBIF_RAMP = {
  light: ['#5e0063', '#a42e61', '#d16a63', '#edab79', '#f6ca8e'],
  dark: ['#64360d', '#a05f19', '#d98724', '#e9a330', '#f6b739'],
};
/** Ramps of the hexagon styles used in area views (sampled from tiles, few to many records). */
const GBIF_HEX_RAMP = {
  light: ['#5e0063', '#a42e61', '#d26b63', '#eeab79', '#ffebaa'],
  dark: ['#ffff00', '#ffcc00', '#ff9900', '#ff6600', '#d60a00'],
};
const OBIS_FILL = 'var(--chakra-colors-teal-solid)';
/** OBIS cells drawn over the GBIF hexagons: an outline only, on a thin halo. */
const OBIS_STROKE = 'var(--chakra-colors-teal-fg)';
const OBIS_MIN_OPACITY = 0.18;
const OBIS_MAX_OPACITY = 0.8;
/** Opacity steps of the OBIS grid (one SVG path each). */
const OBIS_STEPS = 12;
/** Px kept free at the top of an area view for the map controls. */
const CONTROLS_INSET = 36;
/** Px between the legend box and the data of a polar view (legend offset 8 + gap 8). */
const LEGEND_GAP = 16;
const POLAR_BASEMAP = { 'EPSG:3575': '3575', 'EPSG:3031': '3031' } as const;

/** GBIF basemap tile in a polar projection (same grid as the polar density tiles). */
function polarBasemapUrl(srs: PolarSrs, t: { z: number; x: number; y: number }, scale: 1 | 2, dark: boolean): string {
  return `https://tile.gbif.org/${POLAR_BASEMAP[srs]}/omt/${t.z}/${t.x}/${t.y}@${scale}x.png?style=${dark ? 'gbif-dark' : 'gbif-light'}`;
}

/** A plate-carrée density tile URL re-targeted to a polar projection (GBIF's `srs` parameter). */
function polarUrl(url: string, srs: PolarSrs | null): string {
  if (!srs) return url;
  const u = new URL(url);
  u.searchParams.set('srs', srs);
  return u.toString();
}
const NO_CELLS: ObisCell[] = [];
/**
 * gbif-dark draws land almost black (#030303) and the ocean dark grey (#252525), about
 * 1.3:1. This linear map (sRGB, per channel) turns them into land #454545 and ocean #0f0f0f,
 * about 2:1 with land the lighter, as in the light basemap.
 */
const DARK_LAND = 0.27;
const DARK_OCEAN = 0.06;
const DARK_SLOPE = (DARK_OCEAN - DARK_LAND) / ((37 - 3) / 255);
const DARK_INTERCEPT = DARK_LAND - (DARK_SLOPE * 3) / 255;
/** Dilation (CSS px) of the 1-2 px GBIF point marks at world scale, so single records stay visible. */
const WORLD_MARK_DILATE = 0.6;

export type MapScope = 'query' | 'loaded';
const SCOPE_ITEMS = [
  { value: 'query', label: 'Query' },
  { value: 'loaded', label: 'Loaded' },
];
const MAX_HEIGHT = 'calc((100dvh - 132px) * 0.42)';
/** Hexagon size on screen (CSS px) for the density layer of an area view. */
const HEX_PX = 5;
/** Hexagons across a tile drawn `size` CSS px wide, so each is about HEX_PX on screen. */
const hexPerTile = (size: number) => Math.round(Math.min(256, Math.max(16, size / HEX_PX)));

// --- Area extent ---------------------------------------------------------------------

const countryExtents = new Map<string, Promise<BBox | null>>();

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null); // 204 for countries without records
    img.src = src;
  });
}

/** Where a country's GBIF records are, from its two zoom-0 density tiles (cached). */
function countryExtent(code: string, base: OccurrenceQuery): Promise<BBox | null> {
  let p = countryExtents.get(code);
  if (!p) {
    const q: OccurrenceQuery = {
      ...base,
      taxa: [],
      area: { kind: 'countries', codes: [code] },
      years: [null, null],
      depth: [null, null],
      quality: { ...base.quality, basisOfRecord: [] },
    };
    p = Promise.all(
      [0, 1].map((x) => loadImage(gbifDensityTileUrl(q, { z: 0, x, y: 0, mode: 'density' }))),
    ).then(([west, east]) => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        if (west) ctx.drawImage(west, 0, 0, 512, 512);
        if (east) ctx.drawImage(east, 512, 0, 512, 512);
        return alphaExtent(ctx.getImageData(0, 0, 1024, 512).data, 1024, 512, [-180, -90, 180, 90]);
      } catch {
        return null;
      }
    });
    countryExtents.set(code, p);
  }
  return p;
}

/** The area's bounding box (null = world), resolving countries asynchronously. */
function useAreaBbox(area: AreaFilter, query: OccurrenceQuery): BBox | null {
  const codes = area.kind === 'countries' ? area.codes.join(',') : '';
  const [countries, setCountries] = useState<{ codes: string; bbox: BBox | null } | null>(null);
  const template = useRef(query);
  template.current = query;
  useEffect(() => {
    if (!codes) return;
    let live = true;
    void Promise.all(codes.split(',').map((c) => countryExtent(c, template.current))).then((boxes) => {
      if (live) setCountries({ codes, bbox: unionBbox(boxes) });
    });
    return () => {
      live = false;
    };
  }, [codes]);
  switch (area.kind) {
    case 'bbox':
      return area.bbox;
    case 'wkt':
      return wktBbox(area.wkt);
    case 'countries':
      return countries?.codes === codes ? countries.bbox : null;
    default:
      return null;
  }
}

/** Polygon rings of a WKT area, as [lon, lat] lists. */
function wktRings(wkt: string): [number, number][][] {
  const rings: [number, number][][] = [];
  for (const m of wkt.matchAll(/\(([^()]+)\)/g)) {
    const ring = m[1]
      .split(',')
      .map((pair) => pair.trim().split(/\s+/).map(Number) as [number, number])
      .filter((p) => p.length === 2 && p.every(Number.isFinite));
    if (ring.length >= 3) rings.push(ring);
  }
  return rings;
}

/**
 * Lon/lat rings of the area outline (null when it has none, e.g. countries). A bbox across
 * the antimeridian stays unwrapped; in a polar view a full-longitude band is its parallels.
 */
function areaRings(area: AreaFilter, polar: boolean): [number, number][][] | null {
  if (area.kind === 'bbox') {
    if (polar) return bboxRings(area.bbox);
    const [w, s, e, n] = unwrapBbox(area.bbox);
    return [
      [
        [w, s],
        [e, s],
        [e, n],
        [w, n],
      ],
    ];
  }
  if (area.kind === 'wkt') {
    const rings = wktRings(area.wkt);
    return rings.length ? rings : null;
  }
  return null;
}

// --- Hooks ---------------------------------------------------------------------------

function useSize<T extends HTMLElement>(): [React.RefObject<T | null>, { width: number; height: number }] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      // Inside the border: the tiles and overlays are laid out in the padding box.
      const r = { width: el.clientWidth, height: el.clientHeight };
      setSize((s) =>
        Math.abs(s.width - r.width) < 0.5 && Math.abs(s.height - r.height) < 0.5
          ? s
          : { width: r.width, height: r.height },
      );
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

/** Border-box size of an element that may mount later (callback ref; 0 x 0 while absent). */
function useElementSize(): [(el: HTMLElement | null) => void, { width: number; height: number }] {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    if (!el) {
      setSize((s) => (s.width === 0 && s.height === 0 ? s : { width: 0, height: 0 }));
      return;
    }
    const update = () => {
      const w = Math.round(el.offsetWidth);
      const h = Math.round(el.offsetHeight);
      setSize((s) => (s.width === w && s.height === h ? s : { width: w, height: h }));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, size];
}

interface ObisCell {
  w: number;
  s: number;
  e: number;
  n: number;
  count: number;
}

/** OBIS record grid for the query, debounced and abortable. */
function useObisGrid(query: OccurrenceQuery, enabled: boolean, precision: number) {
  const key = enabled ? JSON.stringify([query.taxa.map((t) => t.name), query.area, query.years, query.depth, query.quality, precision]) : '';
  const [state, setState] = useState<{ key: string; cells: ObisCell[]; max: number; loading: boolean }>({
    key: '',
    cells: [],
    max: 0,
    loading: false,
  });
  const latest = useRef(query);
  latest.current = query;
  useEffect(() => {
    if (!key) {
      setState({ key: '', cells: [], max: 0, loading: false });
      return;
    }
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true }));
    const snapshot = toJS(latest.current);
    const timer = setTimeout(() => {
      obisGrid(snapshot, precision, controller.signal)
        .then((fc) => {
          const cells: ObisCell[] = [];
          let max = 0;
          for (const f of fc.features) {
            const ring = f.geometry?.coordinates?.[0];
            if (!ring?.length) continue;
            const xs = ring.map((p) => p[0]);
            const ys = ring.map((p) => p[1]);
            const count = f.properties?.n ?? 0;
            if (count <= 0) continue;
            max = Math.max(max, count);
            cells.push({ w: Math.min(...xs), e: Math.max(...xs), s: Math.min(...ys), n: Math.max(...ys), count });
          }
          setState({ key, cells, max, loading: false });
        })
        .catch((error) => {
          if (controller.signal.aborted || isAbortError(error)) return;
          setState({ key, cells: [], max: 0, loading: false });
        });
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // `key` captures every query field the grid depends on.
  }, [key, precision]);
  return state;
}

/** The loaded records as hexagons on a canvas (CSS px of the map frame, HiDPI-sharp). */
function LoadedHexLayer({ bins, ramp, width, height }: { bins: HexBins; ramp: string[]; width: number; height: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dpr = typeof window !== 'undefined' ? Math.min(3, window.devicePixelRatio || 1) : 1;
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const lut = rampLut(ramp);
    // Cells grouped by colour, one fill per level; a hair larger than the cell to hide seams.
    const levels: number[][] = Array.from({ length: RAMP_LEVELS }, () => []);
    const { counts, cols } = bins;
    for (let c = 0; c < counts.length; c++) if (counts[c] > 0) levels[rampLevel(counts[c])].push(c);
    const r = bins.r + 0.35 / dpr;
    const corners = Array.from({ length: 6 }, (_, k) => {
      const a = (Math.PI / 3) * k;
      return [r * Math.cos(a), r * Math.sin(a)] as const; // flat-top, like GBIF's hexagons
    });
    levels.forEach((cells, level) => {
      if (!cells.length) return;
      ctx.beginPath();
      for (const c of cells) {
        const j = Math.floor(c / cols);
        const i = c - j * cols;
        const cx = bins.ox + i * bins.dx;
        const cy = bins.oy + (j + (i & 1) / 2) * bins.dy;
        ctx.moveTo(cx + corners[0][0], cy + corners[0][1]);
        for (let k = 1; k < 6; k++) ctx.lineTo(cx + corners[k][0], cy + corners[k][1]);
        ctx.closePath();
      }
      ctx.fillStyle = lut[level];
      ctx.fill();
    });
  }, [bins, ramp, width, height, dpr]);
  return (
    <canvas
      ref={ref}
      data-testid="preview-map-loaded"
      style={{ position: 'absolute', left: 0, top: 0, width, height }}
    />
  );
}

// --- Component -----------------------------------------------------------------------

export interface PreviewMapProps {
  /** Empty state: a faint global map without controls behind the example cards. */
  faint?: boolean;
}

export default observer(function PreviewMap({ faint = false }: PreviewMapProps) {
  const { explorerStore, speciesStore } = useStore();
  const query = explorerStore.query;
  const filterId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const dark = useColorMode().colorMode === 'dark';
  const [frameRef, size] = useSize<HTMLDivElement>();
  const [fit, setFit] = useState<'area' | 'world'>('area');
  const areaKey = JSON.stringify(query.area);
  // Refit to the new area whenever it changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on area change
  useEffect(() => setFit('area'), [areaKey]);

  const bbox = useAreaBbox(query.area, query);
  const hasArea = query.area.kind !== 'world';
  // Drawing shows the whole world, so any box can be drawn; a committed box changes the
  // area, which refits the view to it.
  const drawing = explorerUi.drawing;
  const showWorld = fit === 'world' || drawing;
  // Fitted to an area, density tiles are hexagon bins of about HEX_PX, requested only where
  // the area is and never at zoom 0, whose ad-hoc tiles bin records too coarsely to touch.
  const zoomedToArea = !showWorld && hasArea && bbox != null;
  // Circumpolar areas switch to GBIF's polar tiles; plate carrée would show a thin strip.
  const srs = zoomedToArea ? polarSrsFor(bbox) : null;
  const areaKeyRings = JSON.stringify(areaRings(query.area, srs != null));
  // biome-ignore lint/correctness/useExhaustiveDependencies: `areaKeyRings` stands for the rings
  const rings = useMemo(() => areaRings(query.area, srs != null), [areaKeyRings]);
  const inset = zoomedToArea && !faint ? CONTROLS_INSET : 0;
  // A polar view keeps its data clear of the legend in the bottom-left corner.
  const [legendRef, legendSize] = useElementSize();
  const legendW = legendSize.width > 0 ? legendSize.width + LEGEND_GAP : 0;
  const legendH = legendSize.height > 0 ? legendSize.height + LEGEND_GAP : 0;
  const view: MapView = useMemo(
    () =>
      srs && bbox
        ? fitPolarView(srs, rings ?? bboxRings(bbox), size.width, size.height, inset, {
            width: legendW,
            height: legendH,
          })
        : fitView(showWorld || !hasArea ? null : bbox, size.width, size.height, inset),
    [srs, rings, showWorld, hasArea, bbox, size.width, size.height, inset, legendW, legendH],
  );
  const proj = useMemo(() => mapProjection(view, srs), [view, srs]);
  const ready = size.width > 0 && size.height > 0;
  const tiles = !ready ? [] : srs ? polarTilesForView(srs, view) : tilesForView(view);
  const densityTiles = !ready
    ? []
    : !zoomedToArea
      ? tiles
      : srs
        ? polarTilesForView(srs, view, MIN_DENSITY_ZOOM)
        : tilesForView(view, densityZoom(view.scale), bbox);
  const tileScale: 1 | 2 = typeof window !== 'undefined' && window.devicePixelRatio > 1.25 ? 2 : 1;

  // Map scope: the query's GBIF/OBIS layers, or the records loaded into Infomap (once a load exists).
  // The store owns the scope: 'loaded' by default while a load with records matches the query.
  const loadedCount = speciesStore.numPointsDebounced;
  const hasLoad = !faint && loadedCount > 0 && explorerStore.mapLoadedAvailable;
  const scope: MapScope = hasLoad ? explorerStore.mapScope : 'query';
  const setScope = (next: MapScope) => explorerStore.setMapScope(next);
  const loadedScope = scope === 'loaded';

  // GBIF density layer: only when GBIF is on, supports the query and knows a taxon.
  const gbifKnowsTaxa = query.taxa.length === 0 || query.taxa.some((t) => t.gbifKey != null);
  const showGbif = query.sources.gbif && supportsGbif(query).ok && gbifKnowsTaxa;
  const gbifLayer = showGbif && !loadedScope;
  const coverage = gbifTileFilterCoverage(query);
  const tileUrl = (t: PlacedTile, hex: boolean) =>
    polarUrl(
      gbifDensityTileUrl(query, {
        z: t.z,
        x: t.x,
        y: t.y,
        scale: tileScale,
        dark,
        ...(hex && { bin: 'hex' as const, hexPerTile: hexPerTile(t.size) }),
      }),
      srs,
    );
  const densityUrls = gbifLayer ? densityTiles.map((t) => tileUrl(t, zoomedToArea)) : [];

  // Density tiles as blob URLs (missing = still loading; failed tiles are retried with backoff).
  const density = useTileBlobs(densityUrls);
  // Hexagon tiles GBIF still cannot render (it answers 503 under load) fall back to its point style.
  const fallbackUrls = zoomedToArea
    ? densityTiles.map((t, i) => (density.tiles.get(densityUrls[i] ?? '') === 'failed' ? tileUrl(t, false) : ''))
    : [];
  const fallback = useTileBlobs(fallbackUrls.filter(Boolean));
  const tileImage = (i: number): string | null => {
    const state = density.tiles.get(densityUrls[i] ?? '');
    const shown = state === 'failed' && fallbackUrls[i] ? fallback.tiles.get(fallbackUrls[i]) : state;
    return shown && shown !== 'empty' && shown !== 'failed' ? shown : null;
  };
  const densityPending =
    densityUrls.some((u) => !density.tiles.has(u)) || fallbackUrls.some((u) => u !== '' && !fallback.tiles.has(u));
  const tilesFailed = densityUrls.some((u) => density.tiles.get(u) === 'failed');
  const retryTiles = () => {
    density.retry();
    fallback.retry();
  };

  // Loaded records, flattened once per load and binned like the GBIF hexagons of the view.
  const lastLoad = explorerStore.lastLoad;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `loadedCount` and `lastLoad` stand for the (non-observable) point collection
  const loadedPoints = useMemo(
    () => (loadedScope ? cachedPoints(speciesStore.multiPointCollection) : null),
    [loadedScope, loadedCount, lastLoad, speciesStore],
  );
  const hexTile = zoomedToArea ? densityTiles[0] : undefined;
  const hexDx = hexTile ? hexTile.size / hexPerTile(hexTile.size) : HEX_PX;
  const hexOx = hexTile?.left ?? 0;
  const hexOy = hexTile?.top ?? 0;
  const loadedBins = useMemo(
    () =>
      loadedPoints && ready
        ? binHexagons(loadedPoints, view, srs, size.width, size.height, { dx: hexDx, ox: hexOx, oy: hexOy })
        : null,
    [loadedPoints, ready, view, srs, size.width, size.height, hexDx, hexOx, hexOy],
  );
  const loadedTotal = loadedPoints ? loadedPoints.length / 2 : loadedCount;

  // OBIS grid overlay.
  const showObis = query.sources.obis && supportsObis(query).ok && (query.taxa.length > 0 || hasArea) && !faint;
  const precision: number = 3;
  const obis = useObisGrid(query, showObis, precision);
  const obisCells = showObis && obis.key && !loadedScope ? obis.cells : NO_CELLS;
  // Over GBIF hexagons the OBIS cells are outlines, so neither layer hides the other.
  const obisOutlined = gbifLayer;

  // Rectangle draw (Esc cancels the drag, a second Esc leaves draw mode).
  // Drag corners in CSS px of the map frame.
  const [drag, setDrag] = useState<{ a: [number, number]; b: [number, number] } | null>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `drawing` is MobX state read during render
  useEffect(() => {
    if (!drawing) {
      setDrag(null);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Capture phase on window: runs before the dialog's own Esc handling.
      e.preventDefault();
      e.stopPropagation();
      if (dragRef.current) setDrag(null);
      else explorerUi.setDrawing(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [drawing]);

  const localPx = (e: React.PointerEvent): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  /** The lon/lat box between two px corners (wrapped into [-180, 180]). */
  const dragArea = (a: [number, number], b: [number, number]): BBox | null => {
    const la = proj.fromPx(a[0], a[1]);
    const lb = proj.fromPx(b[0], b[1]);
    if (srs) return polarDragBbox(la, lb);
    const box = dragBbox(la, lb);
    return box ? wrapBbox(box) : null;
  };
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!drawing || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = localPx(e);
    setDrag({ a: p, b: p });
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (drag) setDrag({ a: drag.a, b: localPx(e) });
  };
  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!drag) return;
    const box = dragArea(drag.a, localPx(e));
    setDrag(null);
    if (box) {
      explorerStore.setArea({ kind: 'bbox', bbox: box });
      explorerUi.setDrawing(false);
    }
  };

  // Overlays are drawn in CSS px through the view's projection (plate carrée or polar).
  const outline = useMemo(() => {
    if (!rings) return null;
    const d = ringsPath(proj, rings);
    // Plate carrée across the antimeridian: repeat the outline one world west for the world view.
    if (!srs && rings.some((r) => r.some(([lon]) => lon > 180))) {
      return d + ringsPath(proj, rings.map((r) => r.map(([lon, lat]): [number, number] => [lon - 360, lat])));
    }
    return d;
  }, [rings, proj, srs]);
  const outer = `M-2,-2H${size.width + 2}V${size.height + 2}H-2Z`;
  const logMax = Math.log10(Math.max(10, obis.max));
  const obisOpacity = (n: number) =>
    OBIS_MIN_OPACITY + (OBIS_MAX_OPACITY - OBIS_MIN_OPACITY) * Math.min(1, Math.log10(Math.max(1, n)) / logMax);
  // Thousands of cells: one path per opacity step, rebuilt only when the grid or view changes.
  const obisLayer = useMemo(() => {
    const lm = Math.log10(Math.max(10, obis.max));
    const paths: string[][] = Array.from({ length: OBIS_STEPS }, () => []);
    const shifts = !srs && view.east > 180 ? [0, 360] : [0];
    for (const c of obisCells) {
      const level = Math.min(OBIS_STEPS - 1, Math.round((Math.min(1, Math.log10(Math.max(1, c.count)) / lm) * (OBIS_STEPS - 1))));
      for (const dx of shifts) {
        const corners: [number, number][] = [
          [c.w + dx, c.s],
          [c.e + dx, c.s],
          [c.e + dx, c.n],
          [c.w + dx, c.n],
        ];
        paths[level].push(`M${corners.map(([lon, lat]) => proj.toPx(lon, lat).map((v) => v.toFixed(1)).join(',')).join('L')}Z`);
      }
    }
    if (obisOutlined) {
      const d = paths.flat().join('');
      if (!d) return null;
      return (
        <>
          <path d={d} fill="none" stroke="var(--chakra-colors-bg)" strokeOpacity={0.5} strokeWidth={2.25} strokeLinejoin="round" />
          <path d={d} fill="none" stroke={OBIS_STROKE} strokeWidth={1.25} strokeLinejoin="round" />
        </>
      );
    }
    return paths.map((d, i) =>
      d.length ? (
        <path
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed opacity steps
          key={i}
          d={d.join('')}
          fill={OBIS_FILL}
          fillOpacity={OBIS_MIN_OPACITY + ((OBIS_MAX_OPACITY - OBIS_MIN_OPACITY) * i) / (OBIS_STEPS - 1)}
        />
      ) : null,
    );
  }, [obisCells, obis.max, proj, srs, view.east, obisOutlined]);
  // The density layer is clipped to the area outline; the basemap outside it is dimmed.
  const densityClip = outline && !showWorld ? `path(evenodd, '${outline}')` : undefined;
  // A letterboxed world view keeps the overlays on the world, out of the muted margins.
  const worldBox = !srs && view.east - view.west > 360 ? [proj.toPx(-180, 90), proj.toPx(180, -90)] : null;
  const dragPath = useMemo(() => {
    if (!drag) return null;
    if (!srs) {
      const [x0, x1] = [Math.min(drag.a[0], drag.b[0]), Math.max(drag.a[0], drag.b[0])];
      const [y0, y1] = [Math.min(drag.a[1], drag.b[1]), Math.max(drag.a[1], drag.b[1])];
      return `M${x0},${y0}H${x1}V${y1}H${x0}Z`;
    }
    const a = proj.fromPx(drag.a[0], drag.a[1]);
    const b = proj.fromPx(drag.b[0], drag.b[1]);
    let lon = b[0];
    while (lon - a[0] > 180) lon -= 360;
    while (a[0] - lon > 180) lon += 360;
    return ringsPath(proj, [
      [
        [a[0], a[1]],
        [lon, a[1]],
        [lon, b[1]],
        [a[0], b[1]],
      ],
    ]);
  }, [drag, proj, srs]);

  const updating = (densityPending || (showObis && !loadedScope && obis.loading)) && !faint;
  // Tiles GBIF could not serve after the retries: say so instead of 'Updating' forever.
  const unavailable = tilesFailed && !densityPending && !faint;
  const summary = [
    `Preview map of ${taxaLabel(query.taxa).toLowerCase() === 'all taxa' ? 'all' : taxaLabel(query.taxa)} records`,
    areaLabel(query.area),
    yearsLabel(query.years).toLowerCase(),
  ].join(', ');
  const layers = loadedScope
    ? `the ${fmtInt(loadedTotal)} loaded records binned into hexagons`
    : [gbifLayer && 'GBIF record density', obisCells.length > 0 && `OBIS grid with ${fmtInt(obisCells.length)} cells`]
        .filter(Boolean)
        .join(' and ');
  const ariaLabel = `${summary}. ${layers ? `Shows ${layers}.` : 'No occurrence layer.'}${updating ? ' Updating.' : ''}`;

  const note = showGbif
    ? mapNote(coverage.ignored)
    : showObis
      ? 'Map shows the OBIS record grid for this query; GBIF density is off.'
      : 'No occurrence layer for this query.';
  const caption = loadedScope
    ? `Loaded · ${fmtInt(loadedTotal)} records`
    : queryCaption({ gbif: showGbif, obis: showObis }, coverage.ignored);
  const captionTitle = loadedScope
    ? 'The loaded records, binned into hexagons like the GBIF layer: the data that goes into Infomap.'
    : `${note}${coverage.ignored.length ? ` Not drawn: ${coverage.ignored.join(', ')}.` : ''}`;
  // The loaded layer always uses the hexagon ramp; GBIF uses it in area views, points elsewhere.
  const ramps = zoomedToArea || loadedScope ? GBIF_HEX_RAMP : GBIF_RAMP;
  const ramp = dark ? ramps.dark : ramps.light;
  const obisSteps = decadeSteps(obis.max).slice(0, 5);
  const showRamp = gbifLayer || loadedScope;
  // GBIF point tiles (world scale, or standing in for failed hexagon tiles) draw 1-2 px
  // marks: grow them a little so single records stay visible.
  const dilate = gbifLayer && (!zoomedToArea || tilesFailed);
  const obisLabel = `OBIS ${precision === 2 ? '11°' : '1.4°'} cell`;

  return (
    <Box>
      {hasLoad && (
        <HStack mb={2} gap={3} minW={0}>
          <SegmentGroup.Root
            size="sm"
            flexShrink={0}
            value={scope}
            onValueChange={(e) => {
              if (e.value === 'query' || e.value === 'loaded') setScope(e.value);
            }}
            aria-label="Map shows"
            data-testid="map-scope"
          >
            <SegmentGroup.Indicator />
            <SegmentGroup.Items items={SCOPE_ITEMS} />
          </SegmentGroup.Root>
          <Text
            fontSize="xs"
            color="fg.muted"
            fontVariantNumeric="tabular-nums"
            truncate
            minW={0}
            title={captionTitle}
            data-testid="map-caption"
          >
            {caption}
          </Text>
        </HStack>
      )}
      <Box
        ref={frameRef}
        data-testid="preview-map"
        data-scope={scope}
        position="relative"
        w="full"
        aspectRatio="2 / 1"
        minH="220px"
        maxH={MAX_HEIGHT}
        overflow="hidden"
        borderRadius="md"
        borderWidth="1px"
        borderColor="border"
        bg="bg.muted"
      >
        <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}>
          <defs>
            <filter id={`${filterId}-base`} colorInterpolationFilters="sRGB">
              <feComponentTransfer>
                <feFuncR type="linear" slope={DARK_SLOPE} intercept={DARK_INTERCEPT} />
                <feFuncG type="linear" slope={DARK_SLOPE} intercept={DARK_INTERCEPT} />
                <feFuncB type="linear" slope={DARK_SLOPE} intercept={DARK_INTERCEPT} />
              </feComponentTransfer>
            </filter>
            <filter id={`${filterId}-dilate`} colorInterpolationFilters="sRGB">
              <feMorphology operator="dilate" radius={WORLD_MARK_DILATE} />
            </filter>
          </defs>
        </svg>
        {/* Only the map imagery is faded in the empty state, so the Draw button keeps its contrast. */}
        <Box
          role="img"
          aria-label={ariaLabel}
          position="absolute"
          inset={0}
          aria-busy={updating || undefined}
          opacity={faint && !drawing ? 0.45 : 1}
          transition="opacity 0.2s"
        >
          <Box position="absolute" inset={0} style={{ filter: dark ? `url(#${filterId}-base)` : undefined }}>
            {tiles.map((t) => (
              <img
                key={`b-${t.z}-${t.col}-${t.y}`}
                src={
                  srs
                    ? polarBasemapUrl(srs, t, tileScale, dark)
                    : gbifBasemapUrl({ z: t.z, x: t.x, y: t.y, scale: tileScale, dark })
                }
                alt=""
                draggable={false}
                style={{
                  position: 'absolute',
                  left: t.left,
                  top: t.top,
                  width: t.size,
                  height: t.size,
                  maxWidth: 'none',
                  userSelect: 'none',
                }}
              />
            ))}
          </Box>
          <Box
            position="absolute"
            inset={0}
            style={{ clipPath: densityClip, filter: dilate ? `url(#${filterId}-dilate)` : undefined }}
          >
            {gbifLayer &&
              densityTiles.map((t, i) => {
                const src = tileImage(i);
                if (!src) return null;
                return (
                  <img
                    key={`d-${t.z}-${t.col}-${t.y}`}
                    src={src}
                    alt=""
                    draggable={false}
                    style={{
                      position: 'absolute',
                      left: t.left,
                      top: t.top,
                      width: t.size,
                      height: t.size,
                      maxWidth: 'none',
                      userSelect: 'none',
                    }}
                  />
                );
              })}
            {loadedScope && loadedBins && (
              <LoadedHexLayer bins={loadedBins} ramp={ramp} width={size.width} height={size.height} />
            )}
          </Box>
          {ready && (
            <Box asChild position="absolute" inset={0} w="full" h="full" color="fg">
              <svg
                viewBox={`0 0 ${size.width} ${size.height}`}
                aria-hidden="true"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={() => setDrag(null)}
                style={{ cursor: drawing ? 'crosshair' : 'default', touchAction: drawing ? 'none' : 'auto' }}
              >
                {worldBox && (
                  <defs>
                    <clipPath id={`${filterId}-world`}>
                      <rect
                        x={worldBox[0][0]}
                        y={worldBox[0][1]}
                        width={worldBox[1][0] - worldBox[0][0]}
                        height={worldBox[1][1] - worldBox[0][1]}
                      />
                    </clipPath>
                  </defs>
                )}
                <g clipPath={worldBox ? `url(#${filterId}-world)` : undefined}>
                  {outline && !showWorld && (
                    <path d={outer + outline} fill="var(--chakra-colors-bg)" fillOpacity={0.45} fillRule="evenodd" />
                  )}
                  {obisLayer}
                  {outline && (
                    <path d={outline} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
                  )}
                </g>
                {dragPath && (
                  <path
                    d={dragPath}
                    fill="var(--chakra-colors-brand-solid)"
                    fillOpacity={0.15}
                    stroke="currentColor"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                  />
                )}
              </svg>
            </Box>
          )}
        </Box>

        {/* Veil while the tiles or grid for a changed query load. */}
        <HStack
          position="absolute"
          top={2}
          left={2}
          gap={1.5}
          px={2}
          py={1}
          borderRadius="sm"
          bg="bg/85"
          backdropFilter="blur(4px)"
          fontSize="xs"
          color="fg.muted"
          pointerEvents="none"
          opacity={updating && !drawing ? 1 : 0}
          transition="opacity 0.2s"
          transitionDelay={updating ? '0.3s' : '0s'}
          aria-hidden="true"
        >
          <Spinner size="xs" />
          <Text>Updating map…</Text>
        </HStack>

        {unavailable && !drawing && (
          <HStack
            position="absolute"
            top={2}
            left={2}
            gap={1.5}
            pl={2}
            pr={0.5}
            py={0.5}
            borderRadius="sm"
            bg="bg/90"
            backdropFilter="blur(4px)"
            borderWidth="1px"
            borderColor="border"
            fontSize="xs"
            color="fg.muted"
            role="status"
            data-testid="map-tiles-unavailable"
          >
            <Icon as={LuCloudOff} flexShrink={0} />
            <Text title={zoomedToArea ? 'Missing hexagon tiles are drawn as GBIF points instead.' : undefined}>
              Map tiles unavailable from GBIF
            </Text>
            <Text aria-hidden="true">·</Text>
            <Button size="2xs" variant="ghost" colorPalette="brand" onClick={retryTiles}>
              Retry
            </Button>
          </HStack>
        )}

        {drawing && (
          <HStack
            position="absolute"
            top={2}
            left="50%"
            transform="translateX(-50%)"
            gap={1.5}
            px={2.5}
            py={1}
            borderRadius="sm"
            bg="bg"
            borderWidth="1px"
            borderColor="border"
            boxShadow="sm"
            fontSize="xs"
            pointerEvents="none"
            role="status"
          >
            <Icon as={LuSquareDashed} color="fg.muted" />
            <Text>Drag on the map to draw an area · Esc to cancel</Text>
          </HStack>
        )}

        <Group attached position="absolute" top={2} right={2} boxShadow="xs" borderRadius="l2">
          {hasArea && !faint && !drawing && (
            <Tooltip content="Clear area (search the whole world)" portalled={false}>
              <Button
                size="xs"
                variant="outline"
                bg="bg"
                onClick={() => explorerStore.setArea({ kind: 'world' })}
                aria-label="Clear area (search the whole world)"
                data-testid="map-clear-area"
              >
                <Icon as={LuX} />
                Clear area
              </Button>
            </Tooltip>
          )}
          {hasArea && !faint && !drawing && (
            <Tooltip content={fit === 'area' ? 'Show the whole world' : 'Zoom to the area'} portalled={false}>
              <Button
                size="xs"
                variant="outline"
                bg="bg"
                onClick={() => setFit(fit === 'area' ? 'world' : 'area')}
                aria-label={fit === 'area' ? 'Show the whole world' : 'Zoom to the area'}
              >
                <Icon as={fit === 'area' ? LuGlobe : LuScan} />
                {fit === 'area' ? 'World' : 'Area'}
              </Button>
            </Tooltip>
          )}
          <Button
            size="xs"
            variant={drawing ? 'solid' : 'outline'}
            bg={drawing ? undefined : 'bg'}
            aria-pressed={drawing}
            onClick={() => explorerUi.setDrawing(!drawing)}
          >
            <Icon as={LuSquareDashed} />
            {drawing ? 'Drawing…' : 'Draw area'}
          </Button>
        </Group>

        {(showRamp || obisCells.length > 0) && (
          <Box
            ref={legendRef}
            position="absolute"
            left={2}
            bottom={2}
            px={2}
            py={1.5}
            borderRadius="sm"
            bg="bg/85"
            backdropFilter="blur(4px)"
            fontSize="xs"
            color="fg.muted"
            fontVariantNumeric="tabular-nums"
            pointerEvents="none"
            display="flex"
            flexDirection={srs || obisOutlined ? 'column' : 'row'}
            gap={srs || obisOutlined ? 1.5 : 4}
          >
            {showRamp && (
              <Box>
                <Text lineHeight="short" mb={1}>
                  {loadedScope ? 'Loaded' : 'GBIF'} records per {zoomedToArea || loadedScope ? 'hexagon' : 'pixel'}
                </Text>
                <Box
                  h="8px"
                  w="112px"
                  borderRadius="xs"
                  style={{ background: `linear-gradient(to right, ${ramp.join(', ')})` }}
                />
                <HStack justify="space-between" w="112px" mt={0.5} lineHeight="short">
                  <span>1</span>
                  <span>10</span>
                  <span>100</span>
                  <span>1k+</span>
                </HStack>
              </Box>
            )}
            {obisCells.length > 0 && obisOutlined && (
              <HStack gap={1.5} lineHeight="short">
                <Box
                  w="12px"
                  h="10px"
                  flexShrink={0}
                  borderWidth="1.5px"
                  borderColor="teal.fg"
                  borderRadius="1px"
                  bg="transparent"
                />
                <Text>{obisLabel} with records</Text>
              </HStack>
            )}
            {obisCells.length > 0 && !obisOutlined && (
              <Box>
                <Text lineHeight="short" mb={1}>
                  OBIS records per {precision === 2 ? '11°' : '1.4°'} cell
                </Text>
                <HStack gap={0} align="start">
                  {obisSteps.map((n) => (
                    <Box key={n} w="28px">
                      <Box h="8px" style={{ background: OBIS_FILL, opacity: obisOpacity(n) }} />
                      <Text mt={0.5} lineHeight="short">
                        {legendLabel(n)}
                      </Text>
                    </Box>
                  ))}
                </HStack>
              </Box>
            )}
          </Box>
        )}
      </Box>
      {!faint && !hasLoad && (
        <HStack mt={1.5} gap={1.5} align="start" fontSize="xs" color="fg.muted">
          <Icon as={LuInfo} mt="2px" flexShrink={0} />
          <Text title={coverage.ignored.length ? `Not drawn: ${coverage.ignored.join(', ')}` : undefined}>{note}</Text>
        </HStack>
      )}
    </Box>
  );
});
