import { Box, Button, Group, HStack, Icon, Spinner, Text } from '@chakra-ui/react';
import { toJS } from 'mobx';
import { observer } from 'mobx-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { LuGlobe, LuInfo, LuScan, LuSquareDashed } from 'react-icons/lu';
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
import {
  alphaExtent,
  decadeSteps,
  dragBbox,
  fitView,
  legendLabel,
  type MapView,
  mapNote,
  pxToLonLat,
  tilesForView,
  unionBbox,
  wktBbox,
} from './mapView';

/** Approximate colour ramps of the GBIF point styles (sampled from rendered tiles). */
const GBIF_RAMP = {
  light: ['#5e0063', '#a42e61', '#d16a63', '#edab79', '#f6ca8e'],
  dark: ['#64360d', '#a05f19', '#d98724', '#e9a330', '#f6b739'],
};
const OBIS_FILL = 'var(--chakra-colors-teal-solid)';
const OBIS_MIN_OPACITY = 0.18;
const OBIS_MAX_OPACITY = 0.8;
const NO_CELLS: ObisCell[] = [];
const MAX_HEIGHT = 'calc((100dvh - 132px) * 0.42)';

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

function areaPath(area: AreaFilter): string | null {
  const ring = (pts: [number, number][]) => `M${pts.map(([x, y]) => `${x},${-y}`).join('L')}Z`;
  if (area.kind === 'bbox') {
    const [w, s, e, n] = area.bbox;
    return ring([
      [w, s],
      [e, s],
      [e, n],
      [w, n],
    ]);
  }
  if (area.kind === 'wkt') {
    const rings = wktRings(area.wkt);
    return rings.length ? rings.map(ring).join('') : null;
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
      const r = el.getBoundingClientRect();
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

// --- Component -----------------------------------------------------------------------

export interface PreviewMapProps {
  /** Empty state: a faint global map without controls behind the example cards. */
  faint?: boolean;
}

export default observer(function PreviewMap({ faint = false }: PreviewMapProps) {
  const { explorerStore } = useStore();
  const query = explorerStore.query;
  const dark = useColorMode().colorMode === 'dark';
  const [frameRef, size] = useSize<HTMLDivElement>();
  const [fit, setFit] = useState<'area' | 'world'>('area');
  const areaKey = JSON.stringify(query.area);
  // Refit to the new area whenever it changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on area change
  useEffect(() => setFit('area'), [areaKey]);

  const bbox = useAreaBbox(query.area, query);
  const hasArea = query.area.kind !== 'world';
  const view: MapView = useMemo(
    () => fitView(fit === 'world' || !hasArea ? null : bbox, size.width, size.height),
    [fit, hasArea, bbox, size.width, size.height],
  );
  const ready = size.width > 0 && size.height > 0;
  const tiles = ready ? tilesForView(view) : [];
  const tileScale: 1 | 2 = typeof window !== 'undefined' && window.devicePixelRatio > 1.25 ? 2 : 1;

  // GBIF density layer: only when GBIF is on, supports the query and knows a taxon.
  const gbifKnowsTaxa = query.taxa.length === 0 || query.taxa.some((t) => t.gbifKey != null);
  const showGbif = query.sources.gbif && supportsGbif(query).ok && gbifKnowsTaxa;
  const coverage = gbifTileFilterCoverage(query);
  const densityUrls = showGbif
    ? tiles.map((t) => gbifDensityTileUrl(query, { z: t.z, x: t.x, y: t.y, scale: tileScale, dark }))
    : [];

  // Track which density tiles have settled, and which failed (204 = empty).
  const settled = useRef(new Map<string, boolean>());
  const [, bump] = useState(0);
  const settle = (src: string, ok: boolean) => {
    if (settled.current.size > 400) settled.current.clear();
    settled.current.set(src, ok);
    bump((n) => n + 1);
  };
  const densityPending = densityUrls.some((u) => !settled.current.has(u));

  // OBIS grid overlay.
  const showObis = query.sources.obis && supportsObis(query).ok && (query.taxa.length > 0 || hasArea) && !faint;
  const precision: number = 3;
  const obis = useObisGrid(query, showObis, precision);
  const obisCells = showObis && obis.key ? obis.cells : NO_CELLS;

  // Rectangle draw (Esc cancels the drag, a second Esc leaves draw mode).
  const drawing = explorerUi.drawing;
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
    return pxToLonLat(view, e.clientX - r.left, e.clientY - r.top);
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
    const box = dragBbox(drag.a, localPx(e));
    setDrag(null);
    if (box) {
      explorerStore.setArea({ kind: 'bbox', bbox: box });
      explorerUi.setDrawing(false);
    }
  };

  const outline = areaPath(query.area);
  const vb = `${view.west} ${-view.north} ${view.east - view.west} ${view.north - view.south}`;
  const outer = `M${view.west - 1},${-view.north - 1}H${view.east + 1}V${-view.south + 1}H${view.west - 1}Z`;
  const logMax = Math.log10(Math.max(10, obis.max));
  const obisOpacity = (n: number) =>
    OBIS_MIN_OPACITY + (OBIS_MAX_OPACITY - OBIS_MIN_OPACITY) * Math.min(1, Math.log10(Math.max(1, n)) / logMax);
  // Thousands of cells: build them once per grid, not on every tile load.
  const obisLayer = useMemo(() => {
    const lm = Math.log10(Math.max(10, obis.max));
    return obisCells.map((c) => (
      <rect
        key={`${c.w},${c.n}`}
        x={c.w}
        y={-c.n}
        width={c.e - c.w}
        height={c.n - c.s}
        fill={OBIS_FILL}
        fillOpacity={OBIS_MIN_OPACITY + (OBIS_MAX_OPACITY - OBIS_MIN_OPACITY) * Math.min(1, Math.log10(Math.max(1, c.count)) / lm)}
      />
    ));
  }, [obisCells, obis.max]);

  const updating = (densityPending || (showObis && obis.loading)) && !faint;
  const summary = [
    `Preview map of ${taxaLabel(query.taxa).toLowerCase() === 'all taxa' ? 'all' : taxaLabel(query.taxa)} records`,
    areaLabel(query.area),
    yearsLabel(query.years).toLowerCase(),
  ].join(', ');
  const layers = [showGbif && 'GBIF record density', obisCells.length > 0 && `OBIS grid with ${fmtInt(obisCells.length)} cells`]
    .filter(Boolean)
    .join(' and ');
  const ariaLabel = `${summary}. ${layers ? `Shows ${layers}.` : 'No occurrence layer.'}${updating ? ' Updating.' : ''}`;

  const note = showGbif
    ? mapNote(coverage.ignored)
    : showObis
      ? 'Map shows the OBIS record grid for this query; GBIF density is off.'
      : 'No occurrence layer for this query.';
  const ramp = dark ? GBIF_RAMP.dark : GBIF_RAMP.light;
  const obisSteps = decadeSteps(obis.max).slice(0, 5);

  return (
    <Box>
      <Box
        ref={frameRef}
        data-testid="preview-map"
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
          {tiles.map((t) => (
            <img
              key={`b-${t.z}-${t.x}-${t.y}`}
              src={gbifBasemapUrl({ z: t.z, x: t.x, y: t.y, scale: tileScale, dark })}
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
          {tiles.map((t, i) => {
            const src = densityUrls[i];
            if (!src) return null;
            return (
              <img
                key={`d-${t.z}-${t.x}-${t.y}`}
                src={src}
                alt=""
                draggable={false}
                onLoad={() => settle(src, true)}
                onError={() => settle(src, false)}
                style={{
                  position: 'absolute',
                  left: t.left,
                  top: t.top,
                  width: t.size,
                  height: t.size,
                  maxWidth: 'none',
                  userSelect: 'none',
                  visibility: settled.current.get(src) === false ? 'hidden' : 'visible',
                }}
              />
            );
          })}
          {ready && (
            <Box asChild position="absolute" inset={0} w="full" h="full" color="fg">
              <svg
                viewBox={vb}
                preserveAspectRatio="none"
                aria-hidden="true"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={() => setDrag(null)}
                style={{ cursor: drawing ? 'crosshair' : 'default', touchAction: drawing ? 'none' : 'auto' }}
              >
                {obisLayer}
                {outline && fit === 'area' && (
                  <>
                    <path d={outer + outline} fill="var(--chakra-colors-bg)" fillOpacity={0.4} fillRule="evenodd" />
                    <path
                      d={outline}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.5}
                      vectorEffect="non-scaling-stroke"
                      strokeLinejoin="round"
                    />
                  </>
                )}
                {outline && fit === 'world' && (
                  <path d={outline} fill="none" stroke="currentColor" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                )}
                {drag && (
                  <rect
                    x={Math.min(drag.a[0], drag.b[0])}
                    y={-Math.max(drag.a[1], drag.b[1])}
                    width={Math.abs(drag.b[0] - drag.a[0])}
                    height={Math.abs(drag.b[1] - drag.a[1])}
                    fill="var(--chakra-colors-brand-solid)"
                    fillOpacity={0.15}
                    stroke="currentColor"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    vectorEffect="non-scaling-stroke"
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

        {(
          <Group attached position="absolute" top={2} right={2} boxShadow="xs" borderRadius="l2">
            {hasArea && !faint && (
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
        )}

        {(showGbif || obisCells.length > 0) && (
          <Box
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
            gap={4}
          >
            {showGbif && (
              <Box>
                <Text lineHeight="short" mb={1}>
                  GBIF records per pixel
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
            {obisCells.length > 0 && (
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
      {!faint && (
        <HStack mt={1.5} gap={1.5} align="start" fontSize="xs" color="fg.muted">
          <Icon as={LuInfo} mt="2px" flexShrink={0} />
          <Text title={coverage.ignored.length ? `Not drawn: ${coverage.ignored.join(', ')}` : undefined}>{note}</Text>
        </HStack>
      )}
    </Box>
  );
});
