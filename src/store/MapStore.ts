import * as d3 from 'd3';
import { action, makeObservable, observable, computed } from 'mobx';
import type { Cell } from '../utils/QuadTree';
import type RootStore from './RootStore';
import type { MultiPoint } from '../types/geojson';
import {
  geoMap,
  type GeoMap,
  type BackendType,
  type LayerHandle,
  type HoverHit,
} from '@mapequation/d3gl/map';
import { fitProjection } from '@mapequation/d3gl/geo';
import { ASPECT_RATIO, MAX_WIDTH } from '../responsive';

export const BACKENDS: BackendType[] = ['auto', 'canvas', 'svg'];

const sphere: d3.GeoPermissibleObjects = { type: 'Sphere' };

export type IMapRenderer = Record<string, never>;

export type RenderType = 'records' | 'heatmap' | 'bioregions';

type GetGridColor = (cell: Cell) => string;

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

  renderType: RenderType = 'records';
  clipToLand: boolean = true;
  // Use the coarse 110m land by default (fast); the detailed 50m is loaded on demand.
  useFineLand: boolean = false;
  colorModuleParticipation: boolean = true;
  colorModuleParticipationStrength: number = 1.0;

  waterColor: string = '#f0f8ff';
  landColor: string = '#ffffff';

  heatmapTarget: HeatmapTarget = 'records';
  get heatmapScale(): 'linear' | 'log' {
    return HEATMAP_TARGET_SCALE[this.heatmapTarget];
  }

  // Hover state for the React tooltip, set from d3gl's native `hover` event (clip-aware
  // picking on the cells layer). The tooltip content is a React component (see WorldMap),
  // not built imperatively here.
  hoverCell: Cell | null = null;
  hoverPos: [number, number] = [0, 0];

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;

    makeObservable(this, {
      isZooming: observable,
      renderDataWhileZooming: observable,
      setRenderDataWhileZooming: action,
      projectionName: observable,
      renderType: observable,
      clipToLand: observable,
      useFineLand: observable,
      setUseFineLand: action,
      colorModuleParticipation: observable,
      colorModuleParticipationStrength: observable,
      waterColor: observable,
      landColor: observable,
      hoverCell: observable.ref,
      hoverPos: observable.ref,
      setHover: action,
      heatmapTarget: observable,
      heatmapScale: computed,
      backend: observable,
      setBackend: action,
      setProjection: action,
      resetView: action,
      setRenderType: action,
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

  setWaterColor = action((value: string) => {
    if (value === this.waterColor) return;
    this.waterColor = value;
    this.render();
  });

  setLandColor = action((value: string) => {
    if (value === this.landColor) return;
    this.landColor = value;
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
    this.sizeObserver?.disconnect();
    this.sizeObserver = null;
    cancelAnimationFrame(this.fitFrame);
    this.fitFrame = 0;
    this.framedToData = false;
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
      }
    };
    measure();
    if (typeof ResizeObserver !== 'undefined') {
      this.sizeObserver = new ResizeObserver(measure);
      this.sizeObserver.observe(host);
    }
  }

  private initEngine() {
    if (this.host === null) return;
    this.disposeEngine();

    this.observeSize();
    // Fit the projection to the measured box so the first paint is correct; the engine refits
    // on every later resize via its own ResizeObserver (GeoMap.onResize).
    this.projection = fitProjection(
      PROJECTION_FACTORIES[this.projectionName]().precision(0.1),
      sphere as GeoJSON.GeoJSON,
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
    engine.enableZoom([1, 18], this.onViewChange);

    // Clip-aware picking on the cells layer drives the React tooltip (see WorldMap.MapTooltip).
    engine.on('hover', this.onHover);
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
        hover: { stroke: '#000000', lineWidth: 1.5 },
        selection: { others: { opacity: 0.25 } },
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
    this.projectionName = projection;
    this.framedToData = false;
    // Re-fit the new projection to the (fixed) viewport and swap it in place: d3gl re-projects
    // the existing layers and re-dispatches the right interaction (globe rotation vs pan/zoom).
    this.projection = fitProjection(
      PROJECTION_FACTORIES[projection]().precision(0.1),
      sphere as GeoJSON.GeoJSON,
      this.width,
      this.height,
    );
    this.engine?.setProjection(this.projection);
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

  private frameData(engine: GeoMap, cells: readonly Cell[], padding: number, maxZoom: number) {
    if ((this.projection.clipAngle() ?? 0) > 0) {
      const [lon, lat] = d3.geoCentroid({
        type: 'MultiPoint',
        coordinates: cells.map((c) => [(c.x1 + c.x2) / 2, (c.y1 + c.y2) / 2]),
      });
      this.projection = fitProjection(
        PROJECTION_FACTORIES[this.projectionName]().precision(0.1).rotate([-lon, -lat]),
        sphere as GeoJSON.GeoJSON,
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
    engine.enableZoom([1, 18], this.onViewChange);
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

  setHover = action((cell: Cell | null, pos: [number, number]) => {
    this.hoverCell = cell;
    this.hoverPos = pos;
  });

  /** Emphasize a set of bioregions on the map by dimming every cell that isn't a member
   *  (one style-table write via `select`, no re-tessellation). Driven by the tree's
   *  ancestral-range hover so a clade's reconstructed range lights up geographically.
   *  `null` (or an empty set) clears the selection. No-op in records mode (no cells layer). */
  highlightBioregions = action((regionIds: Set<number> | null) => {
    if (this.engine === null) return;
    if (regionIds === null || regionIds.size === 0) {
      this.engine.select('cells', null);
      return;
    }
    this.engine.select('cells', (cell: Cell) => regionIds.has(cell.bioregionId));
  });
}
