import * as d3 from 'd3';
import { action, makeObservable, observable, observableRef, computed, reaction } from 'mobx';
import type { Cell } from '../utils/QuadTree';
import type RootStore from './RootStore';
import type { Bioregion } from './InfomapStore';
import type { MultiPoint } from '../types/geojson';
import {
  geoMap,
  type GeoMap,
  type BackendType,
  type LayerHandle,
  type HoverHit,
} from '@mapequation/d3gl/map';
import { fitProjection, type ViewTransform } from '@mapequation/d3gl/geo';
import { ASPECT_RATIO, MAX_WIDTH } from '../responsive';

export const BACKENDS: BackendType[] = ['auto', 'canvas', 'svg'];

const sphere: d3.GeoSphere = { type: 'Sphere' };

export type IMapRenderer = Record<string, never>;

export type RenderType = 'records' | 'heatmap' | 'bioregions';

type GetGridColor = (cell: Cell) => string;

export type ColorMode = 'light' | 'dark';

// Base-map defaults per color mode; the dark pair sits just above the app's dark page/panel
// backgrounds so the ocean reads as a surface and land stays distinct from it.
const DEFAULT_MAP_COLORS: Record<ColorMode, { water: string; land: string }> = {
  light: { water: '#f0f8ff', land: '#ffffff' },
  dark: { water: '#0f1722', land: '#1d232b' },
};

// Cells outside the emphasized bioregions fade toward a neutral gray (not just transparency),
// so the emphasized region pops while the land shape stays readable.
const DIMMED_CELLS: Record<ColorMode, { fill: string; opacity: number }> = {
  light: { fill: '#d4d4d8', opacity: 0.6 },
  dark: { fill: '#3f3f46', opacity: 0.6 },
};

// Height of the bioregion legend overlaid along the map's bottom edge; fly-to frames regions in
// the space above it so a flown-to region isn't covered.
const LEGEND_INSET = 44;

// Flat projections pan/zoom in screen space; the orthographic projection becomes a
// drag-to-rotate globe (versor rotation on CPU, GPU-accelerated on the WebGL backend) —
// d3gl's enableZoom auto-dispatches the right interaction per projection.
export const PROJECTIONS = [
  'geoNaturalEarth1',
  'geoOrthographic',
  'geoMercator',
] as const;

export type Projection = (typeof PROJECTIONS)[number];

export const PROJECTIONNAME: Record<Projection, string> = {
  geoNaturalEarth1: 'Natural Earth',
  geoOrthographic: 'Orthographic',
  geoMercator: 'Mercator',
} as const;

// Static lookup of the d3 projection factories keyed by projection name. Equivalent to
// `d3[name]()` but uses explicit named references so the projections can be tree-shaken.
const PROJECTION_FACTORIES: Record<Projection, () => d3.GeoProjection> = {
  geoNaturalEarth1: d3.geoNaturalEarth1,
  geoOrthographic: d3.geoOrthographic,
  geoMercator: d3.geoMercator,
};

export const HEATMAP_TARGETS = [
  'records',
  'richness',
  'relativeRichness',
  'overlap',
  'endemicity',
  'occupancy',
] as const;

export type HeatmapTarget = (typeof HEATMAP_TARGETS)[number];

export const HEATMAP_TARGET_NAME: Record<HeatmapTarget, string> = {
  records: 'Records',
  richness: 'Species richness',
  relativeRichness: 'Relative species richness',
  overlap: 'Biota overlap',
  endemicity: 'Endemicity',
  occupancy: 'Occupancy',
} as const;

export const HEATMAP_TARGET_SCALE: Record<HeatmapTarget, 'linear' | 'log'> = {
  records: 'log',
  richness: 'log',
  relativeRichness: 'linear',
  overlap: 'linear',
  endemicity: 'linear',
  occupancy: 'linear',
} as const;

export default class MapStore {
  rootStore: RootStore;
  isZooming: boolean = false;
  renderDataWhileZooming: boolean = true;
  setRenderDataWhileZooming(value: boolean) {
    this.renderDataWhileZooming = value;
  }

  projectionName: Projection = PROJECTIONS[0];
  projection: d3.GeoProjection = PROJECTION_FACTORIES[this.projectionName]().precision(0.1);

  // WebGL by default: smooth pan/zoom and a GPU-accelerated globe for large datasets. Canvas2D
  // paints the first frame sooner (no async luma.gl device / GPU tessellation); SVG exports vectors.
  backend: BackendType = 'auto';

  host: HTMLElement | null = null;
  engine: GeoMap | null = null;
  // Persistent handle to the species-points pass-through layer, so each streamed chunk can be
  // drawn immediately via `append` (an O(chunk) draw-on-top) without re-projecting the whole set.
  // The layer is registered with a `() => multiPoints` callback, so pan/zoom/projection repaints
  // re-read and re-project everything (time-sliced by d3gl) — append only covers the new delta.
  private pointsHandle: LayerHandle<MultiPoint> | null = null;

  // Current CSS pixel size, mirrored from the responsive host so projection re-fits
  // (setProjection) use the live box. The host is the single source of truth (d3gl owns
  // resize); these are kept in sync by `sizeObserver`.
  width: number = MAX_WIDTH;
  height: number = MAX_WIDTH / ASPECT_RATIO;
  private sizeObserver: ResizeObserver | null = null;
  // True while the view is the automatic fit-to-data framing (set by fitToData, cleared by any
  // user pan/zoom or view reset), so a later container resize re-frames the data: d3gl's resize
  // rescales the projection but keeps the pixel pan, which would leave the data off-centre.
  private framedToData = false;
  private applyingFit = false;
  private fitFrame = 0;
  // Fraction of the map section (#world-map) inside the viewport, so list actions can tell
  // whether a camera move would be seen.
  mapVisibleRatio: number = 1;
  private visibilityObserver: IntersectionObserver | null = null;
  // Re-applies the selection/preview/tree-hover dimming whenever SelectionStore changes.
  private emphasisReaction: (() => void) | null = null;
  // Cancels a running fly-to animation (a new fly-to, a projection switch or teardown).
  private cancelFly: (() => void) | null = null;
  // Removes the pointer/wheel listeners that drive `isZooming` (the tooltip hides while it's set).
  private gestureCleanup: (() => void) | null = null;

  renderType: RenderType = 'records';
  clipToLand: boolean = true;
  // Use the coarse 110m land by default (fast); the detailed 50m is loaded on demand.
  useFineLand: boolean = false;
  colorModuleParticipation: boolean = true;
  colorModuleParticipationStrength: number = 1.0;

  // The app's resolved color mode, mirrored from Chakra by WorldMap.
  colorMode: ColorMode = 'light';
  // User-picked base-map colors; null follows the color mode's default.
  private customWaterColor: string | null = null;
  private customLandColor: string | null = null;

  get waterColor(): string {
    return this.customWaterColor ?? DEFAULT_MAP_COLORS[this.colorMode].water;
  }

  get landColor(): string {
    return this.customLandColor ?? DEFAULT_MAP_COLORS[this.colorMode].land;
  }

  heatmapTarget: HeatmapTarget = 'records';
  get heatmapScale(): 'linear' | 'log' {
    return HEATMAP_TARGET_SCALE[this.heatmapTarget];
  }

  // Hover state for the React tooltip, set from d3gl's native `hover` event (clip-aware
  // picking on the cells layer). The tooltip content is a React component (see WorldMap),
  // not built imperatively here.
  hoverCell: Cell | null = null;
  hoverPos: [number, number] = [0, 0];

  // The engine's affine view (pan/zoom) mirrored for DOM overlays (RegionLocators): screen =
  // projection(p) * k + [x, y]. Replaced on every zoom/pan frame, fly-to step, projection
  // switch (identity) and resize, so observers re-place themselves.
  viewTransform: ViewTransform = { k: 1, x: 0, y: 0 };
  // True while a fly-to animation runs. The globe flies by rotating the projection, which
  // overlays can't follow per frame, so they step aside until it lands.
  isFlying: boolean = false;
  // Untransformed projected bounds per bioregion, keyed by the projection state they were
  // computed under (see `regionBounds`).
  private boundsCache = new WeakMap<
    Bioregion,
    { key: string; bounds: [number, number, number, number] }
  >();

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;

    makeObservable<MapStore, 'customWaterColor' | 'customLandColor'>(this, {
      isZooming: observable,
      setZooming: action,
      renderDataWhileZooming: observable,
      setRenderDataWhileZooming: action,
      projectionName: observable,
      renderType: observable,
      clipToLand: observable,
      useFineLand: observable,
      setUseFineLand: action,
      colorModuleParticipation: observable,
      colorModuleParticipationStrength: observable,
      colorMode: observable,
      customWaterColor: observable,
      customLandColor: observable,
      waterColor: computed,
      landColor: computed,
      mapVisibleRatio: observable,
      clickedCellId: observable,
      hoverCell: observableRef,
      hoverPos: observableRef,
      setHover: action,
      heatmapTarget: observable,
      heatmapScale: computed,
      backend: observable,
      setBackend: action,
      setProjection: action,
      resetView: action,
      setRenderType: action,
      viewTransform: observableRef,
      isFlying: observable,
    });
  }

  setRenderType(type: RenderType) {
    this.renderType = type;
    this.render();
  }

  setClipToLand = action((value: boolean) => {
    if (value === this.clipToLand) return;
    this.clipToLand = value;
    this.render();
  });

  setUseFineLand = action((value: boolean) => {
    if (value === this.useFineLand) return;
    this.useFineLand = value;
    // Lazily fetch the detailed 50m geometry the first time it's requested.
    if (value) this.rootStore.landStore.ensureFineLand();
    this.render();
  });

  setColorMode = action((mode: ColorMode) => {
    if (mode === this.colorMode) return;
    this.colorMode = mode;
    this.render();
  });

  // Picking the current mode's default resets to "follow the mode" rather than pinning it.
  setWaterColor = action((value: string) => {
    if (value === this.waterColor) return;
    const isDefault =
      value.toLowerCase() === DEFAULT_MAP_COLORS[this.colorMode].water;
    this.customWaterColor = isDefault ? null : value;
    this.render();
  });

  setLandColor = action((value: string) => {
    if (value === this.landColor) return;
    const isDefault =
      value.toLowerCase() === DEFAULT_MAP_COLORS[this.colorMode].land;
    this.customLandColor = isDefault ? null : value;
    this.render();
  });

  setColorModuleParticipation = action((value: boolean) => {
    this.colorModuleParticipation = value;
    this.render();
  });

  setColorModuleParticipationStrength = action(
    (value: number, render: boolean = false) => {
      this.colorModuleParticipationStrength = value;
      if (render) this.render();
    },
  );

  setHeatmapTarget = action((value: HeatmapTarget, render: boolean = false) => {
    this.heatmapTarget = value;
    if (render) this.render();
  });

  get multiPoints() {
    return this.rootStore.speciesStore.multiPointCollection
      .geometries as MultiPoint[];
  }

  get binner() {
    return this.rootStore.speciesStore.binner;
  }

  // --- Color accessors (unchanged logic, now used as d3gl fill accessors) ---

  private _getHeatmapColorTargetGetter(): (n: Cell) => number {
    switch (this.heatmapTarget) {
      case 'records':
        return (n: Cell) => n.recordsPerArea;
      case 'richness':
        return (n: Cell) => n.speciesRichness;
      case 'relativeRichness':
        return (n: Cell) => n.bioregionMetrics.relativeRichness;
      case 'overlap':
        return (n: Cell) => n.bioregionMetrics.overlap;
      case 'endemicity':
        return (n: Cell) => n.bioregionMetrics.endemicity;
      case 'occupancy':
        return (n: Cell) => n.bioregionMetrics.occupancy;
      default:
        console.warn(`Heatmap target '${this.heatmapTarget}' lacks implementation.`);
        return (n: Cell) => n.recordsPerArea;
    }
  }

  /** The current heatmap metric for one cell (what the heatmap colors it by), for the tooltip. */
  heatmapValue(cell: Cell): number {
    return this._getHeatmapColorTargetGetter()(cell);
  }

  private _heatmapColor(cells: Cell[]): GetGridColor {
    const getTarget = this._getHeatmapColorTargetGetter();

    const domainExtent = d3.extent(cells, getTarget) as [number, number];

    const heatmapColorIndexScale = (
      this.heatmapScale === 'log' ? d3.scaleLog() : d3.scaleLinear()
    )
      .domain(domainExtent)
      .range([0, 8]);

    const colorRange = [
      '#ffffcc',
      '#ffeda0',
      '#fed976',
      '#feb24c',
      '#fd8d3c',
      '#fc4e2a',
      '#e31a1c',
      '#bd0026',
      '#800026',
    ]; // Colorbrewer YlOrRd

    return (cell: Cell) =>
      colorRange[Math.floor(heatmapColorIndexScale(getTarget(cell)))] ?? colorRange[0];
  }

  private cellColor(): GetGridColor {
    return this.rootStore.colorStore.colorCell;
  }

  // --- d3gl engine lifecycle ---

  setBackend = action((backend: BackendType) => {
    if (backend === this.backend) return;
    this.backend = backend;
    // Swaps the backend in place — the projected/tessellated Scene and the current zoom are
    // preserved, so no re-projection is needed.
    this.engine?.setBackend(backend);
    this.render();
  });

  setHost(host: HTMLElement) {
    this.host = host;
    this.initEngine();
  }

  disposeEngine = () => {
    this.cancelFly?.();
    this.emphasisReaction?.();
    this.emphasisReaction = null;
    this.gestureCleanup?.();
    this.gestureCleanup = null;
    this.sizeObserver?.disconnect();
    this.sizeObserver = null;
    cancelAnimationFrame(this.fitFrame);
    this.fitFrame = 0;
    this.framedToData = false;
    this.visibilityObserver?.disconnect();
    this.visibilityObserver = null;
    this.pointsHandle = null;
    this.engine?.destroy();
    this.engine = null;
  };

  // Mirror the responsive host's CSS width into this.width/height (height = width / aspect).
  // d3gl runs its own ResizeObserver to resize+refit the engine; this one only keeps the
  // store's size in sync so setProjection re-fits to the current box. Sharing the host means
  // both observers see the same value.
  private observeSize() {
    const host = this.host;
    if (host === null) return;
    const measure = () => {
      const w = Math.round(host.getBoundingClientRect().width);
      if (w > 0 && w !== this.width) {
        this.width = w;
        this.height = Math.round(w / ASPECT_RATIO);
        if (this.framedToData) this.scheduleFitToData();
        // d3gl refits the projection in its own observer (registered after this one), so read
        // the new view a frame later.
        requestAnimationFrame(() => this.syncViewTransform());
      }
    };
    measure();
    if (typeof ResizeObserver !== 'undefined') {
      this.sizeObserver = new ResizeObserver(measure);
      this.sizeObserver.observe(host);
    }
  }

  private observeVisibility() {
    const section = this.host?.closest('#world-map') ?? this.host;
    if (!section || typeof IntersectionObserver === 'undefined') return;
    this.visibilityObserver = new IntersectionObserver(
      ([entry]) => this.setMapVisibleRatio(entry.intersectionRatio),
      { threshold: Array.from({ length: 11 }, (_, i) => i / 10) },
    );
    this.visibilityObserver.observe(section);
  }

  setViewTransform = action((t: ViewTransform) => {
    this.viewTransform = { k: t.k, x: t.x, y: t.y };
  });

  setFlying = action((value: boolean) => {
    this.isFlying = value;
  });

  /** Re-read the engine's current transform, e.g. after a resize refit the projection. */
  private syncViewTransform() {
    const engine = this.engine as unknown as {
      transform?: ViewTransform;
    } | null;
    this.setViewTransform(engine?.transform ?? { k: 1, x: 0, y: 0 });
  }

  setMapVisibleRatio = action((ratio: number) => {
    this.mapVisibleRatio = ratio;
  });

  private initEngine() {
    if (this.host === null) return;
    this.disposeEngine();

    this.observeSize();
    this.observeVisibility();
    // Fit the projection to the measured box so the first paint is correct; the engine refits
    // on every later resize via its own ResizeObserver (GeoMap.onResize).
    this.projection = fitProjection(
      PROJECTION_FACTORIES[this.projectionName]().precision(0.1),
      sphere,
      this.width,
      this.height,
    );

    const engine = geoMap(this.host, {
      aspectRatio: ASPECT_RATIO,
      projection: this.projection,
      backend: this.backend,
    });
    this.engine = engine;

    // One call for every projection: d3gl auto-dispatches drag-to-rotate (versor) for the
    // orthographic globe and affine pan/zoom for flat projections. Hover/click picking
    // inverts screen → data internally, so we no longer track the transform ourselves.
    engine.enableZoom([1, 18], this.onZoom);
    this.setViewTransform({ k: 1, x: 0, y: 0 });

    // Clip-aware picking on the cells layer drives the React tooltip (see WorldMap.MapTooltip).
    engine.on('hover', this.onHover);
    // Clicking a cell selects its bioregion (again to deselect); clicking off the grid clears.
    engine.on('click', this.onClick);

    this.emphasisReaction = reaction(
      () => this.rootStore.selectionStore.emphasized,
      () => this.applyEmphasis(),
    );

    this.trackGestures(this.host);
  }

  setZooming(value: boolean) {
    this.isZooming = value;
  }

  /** Flag `isZooming` while a drag (pan/rotate) is held or wheel-zoom events keep arriving, so
   *  the hover tooltip can step aside. d3gl's own interacting flag is not public. */
  private trackGestures(host: HTMLElement) {
    let wheelTimer = 0;
    // Press position; a press only counts as a drag once it moves past d3gl's 4px click slop.
    let down: [number, number] | null = null;
    const onDown = (ev: PointerEvent) => {
      if (ev.button === 0) down = [ev.clientX, ev.clientY];
    };
    const onMove = (ev: PointerEvent) => {
      if (down === null || this.isZooming) return;
      if (Math.hypot(ev.clientX - down[0], ev.clientY - down[1]) > 4)
        this.setZooming(true);
    };
    const onUp = () => {
      down = null;
      if (wheelTimer === 0 && this.isZooming) this.setZooming(false);
    };
    const onWheel = () => {
      this.setZooming(true);
      window.clearTimeout(wheelTimer);
      wheelTimer = window.setTimeout(() => {
        wheelTimer = 0;
        this.setZooming(false);
      }, 250);
    };
    host.addEventListener('pointerdown', onDown);
    host.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    this.gestureCleanup = () => {
      window.clearTimeout(wheelTimer);
      host.removeEventListener('pointerdown', onDown);
      host.removeEventListener('wheel', onWheel);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      this.setZooming(false);
    };
  }

  /**
   * (Re)register all layers in paint order from current data + color accessors. The unused data
   * layer (cells in records mode, points otherwise) is registered empty so it's cleared.
   * Dense layers are flagged `hideOnInteraction` so only the cheap land re-projects per rotation
   * frame. The points layer handle is retained for incremental streaming via `append`.
   */
  private buildLayers() {
    const engine = this.engine;
    if (engine === null) return;

    // Coarse 110m by default (fast); the detailed 50m is used only when toggled on (and loaded).
    const { land50m, land110m } = this.rootStore.landStore;
    const land = this.useFineLand ? (land50m ?? land110m) : land110m;
    const clipTo = this.clipToLand && land ? 'land' : undefined;

    engine.layer('sphere', [sphere], { fill: this.waterColor });
    engine.layer('land', land ? [land as GeoJSON.Feature] : [], {
      fill: this.landColor,
    });

    const records = this.renderType === 'records';

    if (records) {
      engine.layer('cells', [] as Cell[], {});
    } else {
      const { cells } = this.binner;
      const { tree } = this.rootStore.infomapStore;
      const getGridColor =
        this.renderType === 'heatmap' || !tree
          ? this._heatmapColor(cells)
          : this.cellColor();
      engine.layer('cells', cells, {
        fill: (cell: Cell) => getGridColor(cell),
        clipTo,
        id: (cell: Cell) => cell.id,
        // Native d3gl interaction (clip-aware): outline the hovered cell into a tiny overlay
        // (the grid's buffers are untouched), and let `select()` dim non-members — driven from
        // the tree's ancestral-range hover (see `highlightBioregions`). The hover *event*
        // (engine.on('hover')) feeds the React tooltip; the tooltip content lives in WorldMap.
        hover: {
          stroke: this.colorMode === 'dark' ? '#ffffff' : '#000000',
          lineWidth: 1.5,
        },
        selection: { others: DIMMED_CELLS[this.colorMode] },
        // hideOnInteraction: true,
      });
    }

    if (records) {
      // Pass-through path: the engine re-reads `() => this.multiPoints` on every repaint
      // (pan/zoom, projection switch, settle), so the full set re-projects each time with
      // no retained-geometry ceiling — the right fit for potentially millions of records.
      // Registering the layer already draws whatever has loaded so far (time-sliced by the
      // engine); newly streamed chunks are drawn immediately via `append` (see `renderMultiPoint`).
      // Pass-through layers aren't pickable (no hit index) and ignore `clipTo`.
      this.pointsHandle = engine.layer('points', () => this.multiPoints, {
        fill: 'red',
        pointRadius: 0.5,
        passThrough: true,
      });
    } else {
      // Re-register `points` as an empty pass-through layer to CLEAR the previous one: d3gl keeps
      // pass-through specs keyed by name and repaints them on every render, and registering a
      // retained layer of the same name would not remove that spec — so the points would persist.
      // An empty pass-through repaint does a `replace-first` that clears the layer's pixels.
      this.pointsHandle = null;
      engine.layer('points', [] as MultiPoint[], { passThrough: true });
    }
  }

  render() {
    if (this.engine === null) return;
    this.buildLayers();
    // Re-registering the cells layer resets its style overrides, so restore the dimming.
    this.applyEmphasis();
    this.engine.render();
  }

  /** File extension for the current export format (SVG when the SVG backend is selected). */
  get imageExtension(): '.svg' | '.png' {
    return this.backend === 'svg' ? '.svg' : '.png';
  }

  /** Export the current map as an SVG (svg backend) or PNG (canvas/webgl) blob. */
  async getImageBlob(): Promise<Blob> {
    if (this.engine === null) {
      throw new Error('No map engine to export');
    }
    if (this.backend === 'svg') {
      const svg = this.engine.toSVG();
      if (!svg) throw new Error("Can't export map image");
      return new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    }
    const dataUrl = this.engine.toPNG();
    if (!dataUrl) {
      throw new Error("Can't export map image");
    }
    return (await fetch(dataUrl)).blob();
  }

  // Incremental draw hook from the streaming loader. The chunk is already in `multiPoints` (so a
  // later full repaint re-projects it via the layer callback); draw just this delta on top now
  // via the pass-through layer's `append` (O(chunk)). Only meaningful in records mode.
  renderMultiPoint(point: MultiPoint) {
    if (this.engine === null || this.renderType !== 'records' || this.pointsHandle === null) {
      return;
    }
    this.pointsHandle.append(point);
  }

  renderShape(_shape: unknown) { }

  setProjection(projection: Projection) {
    this.cancelFly?.();
    this.projectionName = projection;
    this.framedToData = false;
    // Re-fit the new projection to the (fixed) viewport and swap it in place: d3gl re-projects
    // the existing layers and re-dispatches the right interaction (globe rotation vs pan/zoom).
    this.projection = fitProjection(
      PROJECTION_FACTORIES[projection]().precision(0.1),
      sphere,
      this.width,
      this.height,
    );
    this.engine?.setProjection(this.projection);
    // setProjection resets the affine view to identity.
    this.setViewTransform({ k: 1, x: 0, y: 0 });
  }

  // Reset pan/zoom (flat) or rotation (globe) to the default view. Re-fitting the current
  // projection re-projects the layers, resets the affine transform to identity, and re-seeds
  // the interaction — the same path setProjection takes, with the projection unchanged.
  resetView() {
    this.setProjection(this.projectionName);
  }

  /**
   * Frame the binned data: a flat projection zooms/pans so the grid cells' extent fills the view
   * (with `padding` as a share of each side, zoom capped at `maxZoom`, and the pan kept on the
   * world where it covers the view); the globe rotates to face the data. A no-op without cells.
   */
  fitToData(padding = 0.1, maxZoom = 8) {
    const engine = this.engine;
    const cells = this.rootStore.speciesStore.binner.cells;
    if (engine === null || cells.length === 0) return;
    this.applyingFit = true;
    try {
      this.frameData(engine, cells, padding, maxZoom);
      this.framedToData = true;
      this.syncViewTransform();
    } finally {
      this.applyingFit = false;
    }
  }

  /**
   * Fit to the data once layout has settled: two animation frames, so the React commit, the
   * dialog's scroll-lock release and d3gl's own (frame-deferred) resize have all landed and the
   * fit uses the container's final size. Repeated calls coalesce into one fit.
   */
  scheduleFitToData = () => {
    if (typeof requestAnimationFrame === 'undefined') {
      this.fitToData();
      return;
    }
    cancelAnimationFrame(this.fitFrame);
    this.fitFrame = requestAnimationFrame(() => {
      this.fitFrame = requestAnimationFrame(() => {
        this.fitFrame = 0;
        this.fitToData();
      });
    });
  };

  // Any pan/zoom that is not our own fit hands the view to the user (no refit on resize).
  private onViewChange = () => {
    if (!this.applyingFit) this.framedToData = false;
  };

  // d3-zoom callback: every pan/zoom frame updates the fit state and the mirrored view.
  private onZoom = (t: ViewTransform) => {
    this.onViewChange();
    this.setViewTransform(t);
  };

  private frameData(engine: GeoMap, cells: readonly Cell[], padding: number, maxZoom: number) {
    if ((this.projection.clipAngle() ?? 0) > 0) {
      const [lon, lat] = d3.geoCentroid({
        type: 'MultiPoint',
        coordinates: cells.map((c) => [(c.x1 + c.x2) / 2, (c.y1 + c.y2) / 2]),
      });
      this.projection = fitProjection(
        PROJECTION_FACTORIES[this.projectionName]().precision(0.1).rotate([-lon, -lat]),
        sphere,
        this.width,
        this.height,
      );
      engine.setProjection(this.projection);
      return;
    }

    // Data bounds in projected (untransformed) pixels, from the cell corners.
    const projection = this.projection;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const c of cells) {
      for (const corner of [[c.x1, c.y1], [c.x1, c.y2], [c.x2, c.y1], [c.x2, c.y2]] as const) {
        const p = projection([corner[0], Math.max(-85, Math.min(85, corner[1]))]);
        if (p === null || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
        x0 = Math.min(x0, p[0]);
        y0 = Math.min(y0, p[1]);
        x1 = Math.max(x1, p[0]);
        y1 = Math.max(y1, p[1]);
      }
    }
    if (!Number.isFinite(x0) || !Number.isFinite(y0)) return;

    const { width: W, height: H } = this;
    const fit = 1 - 2 * padding;
    const k = Math.max(1, Math.min(maxZoom, (W * fit) / Math.max(x1 - x0, 1), (H * fit) / Math.max(y1 - y0, 1)));
    // Centre the data, then keep the zoomed world covering the view where it can (no empty
    // band beyond the world's edge); where the world is narrower than the view, centre it.
    const [[sx0, sy0], [sx1, sy1]] = d3.geoPath(projection).bounds(sphere);
    const place = (centre: number, size: number, lo: number, hi: number) => {
      const min = size - k * hi;
      const max = -k * lo;
      return min > max ? size / 2 - (k * (lo + hi)) / 2 : Math.max(min, Math.min(max, size / 2 - k * centre));
    };
    engine.setTransform({
      k,
      x: place((x0 + x1) / 2, W, sx0, sx1),
      y: place((y0 + y1) / 2, H, sy0, sy1),
    });
    // Re-seed d3-zoom from the engine's transform so the next wheel/drag continues from here.
    engine.enableZoom([1, 18], this.onZoom);
  }

  // --- Hover tooltip + cross-highlight (native d3gl interaction) ---

  /** Track the hovered grid cell + pointer position for the React tooltip. Fires from d3gl's
   *  clip-aware `hover` event; `null` (off a cell / off the painted grid) hides the tooltip. */
  private onHover = (hit: HoverHit | null, ev: PointerEvent) => {
    this.setHover(
      hit?.layer === 'cells' ? (hit.datum as Cell) : null,
      [ev.offsetX, ev.offsetY],
    );
  };

  clickedCellId: string | null = null;
  setClickedCellId = action((id: string | null) => {
    this.clickedCellId = id;
  });

  setHover = action((cell: Cell | null, pos: [number, number]) => {
    if (cell?.id !== this.clickedCellId) this.clickedCellId = null;
    this.hoverCell = cell;
    this.hoverPos = pos;
  });

  private onClick = (hit: HoverHit | null) => {
    const cell = hit?.layer === 'cells' ? (hit.datum as Cell) : null;
    // Hide the tooltip over the clicked cell so it doesn't cover the region just selected;
    // it returns once the pointer moves to another cell.
    this.setClickedCellId(cell?.id ?? null);
    const { selectionStore } = this.rootStore;
    if (cell?.bioregionId) {
      selectionStore.toggle(cell.bioregionId);
    } else {
      selectionStore.select(null);
    }
  };

  /** Emphasize a set of bioregions on the map (dimming the rest) while a tree branch is hovered,
   *  so a clade's reconstructed range lights up geographically. `null` (or an empty set) falls
   *  back to the list preview / selection, see SelectionStore.emphasized. */
  highlightBioregions = (regionIds: Set<number> | null) => {
    this.rootStore.selectionStore.setTreeIds(regionIds);
  };

  /** Dim every cell outside the emphasized bioregions (one style-table write via `select`, no
   *  re-tessellation), and paint the emphasized ones in their solid region color so fuzzy
   *  boundary blends don't read as a different region against the grey. No-op in records mode
   *  (no cells layer). */
  private applyEmphasis() {
    const engine = this.engine;
    if (engine === null || this.renderType === 'records') return;
    const set = this.rootStore.selectionStore.emphasized;
    if (set === null) engine.select('cells', null);
    else engine.select('cells', (cell: Cell) => set.has(cell.bioregionId));
    // Grid squares without records show the land through; dim it with the cells so those holes
    // don't become the brightest marks on the map. The land layer's one feature has id 0.
    if (set === null) engine.clearStyle('land');
    else
      engine.setStyle('land', 0, {
        fill: this.colorMode === 'dark' ? '#363940' : '#d9d9dd',
      });
    // `select` rewrote the whole override map (and `null` restored base styles), so the solid
    // fills go on after it. The heatmap keeps its own colors.
    const { infomapStore, colorStore } = this.rootStore;
    if (set === null || this.renderType === 'heatmap' || !infomapStore.tree)
      return;
    for (const bioregion of infomapStore.bioregions) {
      const id = bioregion.bioregionId;
      if (!set.has(id)) continue;
      const fill = colorStore.colorBioregion(id);
      if (!fill) continue;
      // The partition already groups cells per region; keep only those whose top region it is
      // (a state network can list a cell under several).
      const ids: string[] = [];
      for (const cell of bioregion.cells)
        if (cell.bioregionId === id) ids.push(cell.id);
      if (ids.length > 0) engine.setStyle('cells', ids, { fill });
    }
  }

  /** Pan/zoom (flat projections) or rotate (globe) the map so the bioregion fills the view,
   *  animated unless the user prefers reduced motion. */
  flyToBioregion(bioregion: Bioregion) {
    if (bioregion.numGridCells === 0) return;
    // Leave margin and cap the zoom so a small region keeps its surroundings for context.
    this.flyTo(bioregion.cells, bioregion.centroid, { pad: 0.6, maxZoom: 5 });
  }

  /** "Show on map" from the list: select the bioregion, bring the map into view when less than
   *  60% of it is visible, and frame the region. */
  showOnMap(bioregion: Bioregion) {
    this.rootStore.selectionStore.select(bioregion.bioregionId);
    const section = this.host?.closest('#world-map') ?? this.host;
    if (section) {
      const r = section.getBoundingClientRect();
      const visible =
        Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
      if (visible < 0.6 * r.height) {
        section.scrollIntoView({
          behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)')
            .matches
            ? 'auto'
            : 'smooth',
          block: 'start',
        });
      }
    }
    this.flyToBioregion(bioregion);
  }

  private flyTo(
    cells: Iterable<Cell>,
    center: [number, number],
    { pad, maxZoom }: { pad: number; maxZoom: number },
  ) {
    const engine = this.engine;
    if (engine === null) return;
    this.cancelFly?.();
    // A deliberate camera move: later resizes keep it instead of re-framing all the data.
    this.framedToData = false;
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const duration = reduceMotion ? 0 : 750;

    if (this.projectionName === 'geoOrthographic') {
      const [lon, lat] = center;
      const from = this.projection.rotate();
      const to: [number, number, number] = [-lon, -lat, 0];
      const interpolate = d3.interpolate(from, to);
      this.setFlying(true);
      this.animate(
        duration,
        (t) => {
          this.projection.rotate(interpolate(t) as [number, number, number]);
          engine.setProjection(this.projection);
        },
        () => {
          this.setFlying(false);
          this.setViewTransform({ k: 1, x: 0, y: 0 });
        },
      );
      return;
    }

    const [x0, y0, x1, y1] = this.projectedBounds(cells);
    if (!Number.isFinite(x0)) return;
    const { width, height } = this;
    // Fit into the area above the legend, then shift the view center down (the region up) by
    // half the inset so the region sits centered in that area — but never past the map's bottom
    // edge, so a zoomed-out view doesn't open a gap below the world.
    const inset = Math.min(LEGEND_INSET, height / 4);
    const k = Math.max(
      1,
      Math.min(
        maxZoom,
        pad / Math.max((x1 - x0) / width, (y1 - y0) / (height - inset)),
      ),
    );
    const cx = (x0 + x1) / 2;
    const cy0 = (y0 + y1) / 2;
    const cy = Math.min(
      cy0 + inset / 2 / k,
      Math.max(cy0, height - height / (2 * k)),
    );
    // d3-zoom's view interpolation works on [center x, center y, visible width] in world space.
    const current = (
      engine as unknown as { transform: { k: number; x: number; y: number } }
    ).transform;
    const viewFrom: [number, number, number] = [
      (width / 2 - current.x) / current.k,
      (height / 2 - current.y) / current.k,
      width / current.k,
    ];
    const viewTo: [number, number, number] = [cx, cy, width / k];
    const interpolate = d3.interpolateZoom(viewFrom, viewTo);
    this.animate(
      duration,
      (t) => {
        const [vx, vy, vw] = interpolate(t);
        const kt = width / vw;
        const view = {
          k: kt,
          x: width / 2 - vx * kt,
          y: height / 2 - vy * kt,
        };
        engine.setTransform(view);
        this.setViewTransform(view);
      },
      () => {
        // Re-seed d3-zoom from the engine's transform so the next wheel/drag continues from here.
        engine.enableZoom([1, 18], this.onZoom);
      },
    );
  }

  /** A bioregion's projected bounds at the fitted, untransformed view (apply `viewTransform` for
   *  screen space). Cached per projection state, so overlays can re-check every frame of a pan or
   *  zoom without re-projecting the cells. */
  regionBounds(bioregion: Bioregion): [number, number, number, number] {
    const p = this.projection;
    const key = `${p.scale()}|${p.translate()}|${p.rotate()}`;
    const hit = this.boundsCache.get(bioregion);
    if (hit?.key === key) return hit.bounds;
    const bounds = this.projectedBounds(bioregion.cells);
    this.boundsCache.set(bioregion, { key, bounds });
    return bounds;
  }

  /** Screen-space bounds (at the fitted, untransformed view) of a set of cells. */
  private projectedBounds(
    cells: Iterable<Cell>,
  ): [number, number, number, number] {
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const cell of cells) {
      for (const corner of [
        [cell.x1, cell.y1],
        [cell.x2, cell.y1],
        [cell.x1, cell.y2],
        [cell.x2, cell.y2],
      ] as [number, number][]) {
        const p = this.projection(corner);
        if (!p) continue;
        x0 = Math.min(x0, p[0]);
        y0 = Math.min(y0, p[1]);
        x1 = Math.max(x1, p[0]);
        y1 = Math.max(y1, p[1]);
      }
    }
    return [x0, y0, x1, y1];
  }

  private animate(
    duration: number,
    step: (t: number) => void,
    done?: () => void,
  ) {
    let frame = 0;
    let cancelled = false;
    const ease = d3.easeCubicInOut;
    const start = performance.now();
    const tick = (now: number) => {
      if (cancelled) return;
      const t = duration > 0 ? Math.min(1, (now - start) / duration) : 1;
      step(ease(t));
      if (t < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        this.cancelFly = null;
        done?.();
      }
    };
    this.cancelFly = () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      this.cancelFly = null;
      done?.();
    };
    frame = requestAnimationFrame(tick);
  }
}
