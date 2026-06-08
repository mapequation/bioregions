import * as d3 from 'd3';
import { action, makeObservable, observable, computed } from 'mobx';
import { type Cell } from '../utils/QuadTree';
import type RootStore from './RootStore';
import { MultiPoint } from '../types/geojson';
import {
  geoMap,
  type GeoMap,
  type BackendType,
  type LayerHandle,
} from '@mapequation/d3gl/map';
import {
  fitProjection,
  lonLatFromScreen,
  type ViewTransform,
} from '@mapequation/d3gl/geo';

export const BACKENDS: BackendType[] = ['canvas', 'webgl', 'svg'];

const sphere: d3.GeoPermissibleObjects = { type: 'Sphere' };

export interface IMapRenderer { }

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
  projection: d3.GeoProjection = d3[this.projectionName]().precision(0.1);

  // Canvas2D is the default: it paints synchronously, so the first frame appears immediately
  // (WebGL needs an async luma.gl device + GPU tessellation). Switch to WebGL for smooth
  // pan/zoom on large datasets.
  backend: BackendType = 'webgl';

  host: HTMLElement | null = null;
  engine: GeoMap | null = null;
  // Persistent handle to the species-points layer, so streamed records can be appended
  // incrementally (only the new points project) rather than re-registering the whole layer.
  private pointsHandle: LayerHandle<MultiPoint> | null = null;
  // How many of `multiPoints` have been appended so far, and the pending rAF drain. Points
  // are appended a frame-budget at a time so the browser stays responsive while data streams
  // in (each MultiPoint chunk can hold tens of thousands of points).
  private appendIndex = 0;
  private drainRaf: number | null = null;
  // Current d3gl view transform (screen-space pan/zoom for flat projections), kept in sync via
  // enableZoom so hover can invert screen → lon/lat. Orthographic keeps rotation in the
  // projection itself, so the transform stays at identity there.
  transform: ViewTransform = { k: 1, x: 0, y: 0 };

  width: number = 1200;
  height: number = 900;

  renderType: RenderType = 'records';
  clipToLand: boolean = true;
  // Use the coarse 110m land by default (fast); the detailed 50m is loaded on demand.
  useFineLand: boolean = false;
  colorModuleParticipation: boolean = true;
  colorModuleParticipationStrength: number = 1.0;

  waterColor: string = '#f0f8ff';
  landColor: string = '#ffffff';

  tooltipActive: boolean = false;
  tooltipPos: [number, number] = [0, 0];
  tooltipCell: Cell | null = null;

  heatmapTarget: HeatmapTarget = 'records';
  get heatmapScale(): 'linear' | 'log' {
    return HEATMAP_TARGET_SCALE[this.heatmapTarget];
  }

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
      tooltipActive: observable,
      tooltipPos: observable,
      tooltipCell: observable.ref,
      heatmapTarget: observable,
      heatmapScale: computed,
      backend: observable,
      setBackend: action,
      setProjection: action,
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
    this.cancelDrain();
    this.pointsHandle = null;
    this.appendIndex = 0;
    this.engine?.destroy();
    this.engine = null;
  };

  private initEngine() {
    if (this.host === null) return;
    this.disposeEngine();

    this.adjustHeight();
    // Size the host element to match the engine (height depends on the projection fit).
    this.host.style.width = `${this.width}px`;
    this.host.style.height = `${this.height}px`;

    const engine = geoMap(this.host, {
      width: this.width,
      height: this.height,
      projection: this.projection,
      backend: this.backend,
    });
    this.engine = engine;

    // One call for every projection: d3gl auto-dispatches drag-to-rotate (versor) for the
    // orthographic globe and affine pan/zoom for flat projections.
    engine.enableZoom([1, 12], (t) => {
      this.transform = t;
    });

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
        // hideOnInteraction: true,
      });
    }

    if (records) {
      // Register the points layer EMPTY and stream the accumulated points in over successive
      // animation frames (see `drainPoints`) so a large dataset never blocks the main thread.
      this.pointsHandle = engine.layer('points', [] as MultiPoint[], {
        fill: 'red',
        pointRadius: 0.5,
        clipTo,
        pickable: false, // potentially millions of points — skip the hit index
        // hideOnInteraction: true,
      });
      this.appendIndex = 0;
      this.scheduleDrain();
    } else {
      this.cancelDrain();
      this.pointsHandle = null;
      this.appendIndex = 0;
      engine.layer('points', [] as MultiPoint[], { pickable: false });
    }
  }

  // --- Incremental points streaming ---
  // Append at most this many points per animation frame, then yield to the browser (≈30ms of
  // projection work per frame, so streaming stays responsive even for millions of points).
  private static readonly POINT_BUDGET = 20_000;

  private scheduleDrain() {
    if (this.drainRaf === null) {
      this.drainRaf = requestAnimationFrame(this.drainPoints);
    }
  }

  private cancelDrain() {
    if (this.drainRaf !== null) {
      cancelAnimationFrame(this.drainRaf);
      this.drainRaf = null;
    }
  }

  /** Append the next frame's worth of `multiPoints` (bounded by POINT_BUDGET), then reschedule
   *  until the index has caught up with the (growing) collection. */
  private drainPoints = () => {
    this.drainRaf = null;
    const handle = this.pointsHandle;
    if (this.engine === null || handle === null || this.renderType !== 'records') {
      return;
    }
    const all = this.multiPoints;
    const batch: MultiPoint[] = [];
    let n = 0;
    while (this.appendIndex < all.length && n < MapStore.POINT_BUDGET) {
      const mp = all[this.appendIndex++];
      batch.push(mp);
      n += mp.coordinates.length;
    }
    if (batch.length > 0) {
      handle.append(batch); // paints only the appended delta — no full re-render
    }
    if (this.appendIndex < all.length) {
      this.scheduleDrain();
    }
  };

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

  // Incremental draw hook from the streaming loader. The chunk's MultiPoint is already in
  // `multiPoints`; just make sure the rAF drain is running so it (and any backlog) gets appended
  // a frame-budget at a time. Only meaningful in records mode.
  renderMultiPoint(_point: MultiPoint) {
    if (this.engine === null || this.renderType !== 'records' || this.pointsHandle === null) {
      return;
    }
    this.scheduleDrain();
  }

  renderShape(_shape: unknown) { }

  setProjection(projection: Projection) {
    this.projectionName = projection;
    // Re-fit the new projection to the (fixed) viewport and swap it in place: d3gl re-projects
    // the existing layers and re-dispatches the right interaction (globe rotation vs pan/zoom).
    this.projection = fitProjection(
      d3[projection]().precision(0.1),
      sphere as GeoJSON.GeoJSON,
      this.width,
      this.height,
    );
    this.transform = { k: 1, x: 0, y: 0 };
    this.engine?.setProjection(this.projection);
  }

  adjustHeight() {
    const { projection, width } = this;
    const [[x0, y0], [x1, y1]] = d3
      .geoPath(projection.fitWidth(width, sphere))
      .bounds(sphere);
    const height = Math.ceil(y1 - y0);
    const l = Math.min(Math.ceil(x1 - x0), height);
    projection.scale((projection.scale() * (l - 1)) / l).precision(0.2);
    this.height = height;
    projection.translate([width / 2, height / 2]);
  }

  // --- Tooltip / hover (React mouse handlers on the host div) ---

  getPosFromEvent(event: React.MouseEvent<HTMLElement>): [number, number] {
    const { offsetX, offsetY } = event.nativeEvent;
    return [offsetX, offsetY];
  }

  setTooltipPos = action((event: React.MouseEvent<HTMLElement>) => {
    this.tooltipPos = this.getPosFromEvent(event);
  });

  onMouseEnter = action((event: React.MouseEvent<HTMLElement>) => {
    this.tooltipActive = true;
    this.setTooltipPos(event);
  });

  onMouseLeave = action(() => {
    this.tooltipActive = false;
    this.tooltipCell = null;
  });

  onMouseMove = action((event: React.MouseEvent<HTMLElement>) => {
    this.setTooltipPos(event);
    const [x, y] = this.tooltipPos;
    // Orthographic keeps its rotation in the projection (transform stays identity), so invert
    // directly; flat projections invert through the affine view transform. invert() returns
    // null off the globe / outside the sphere.
    const longlat =
      this.projectionName === 'geoOrthographic'
        ? (this.projection.invert?.([x, y]) ?? null)
        : lonLatFromScreen(this.projection, this.transform, x, y);
    if (!longlat) {
      this.tooltipCell = null;
      return;
    }
    const cell = this.rootStore.speciesStore.binner.find(...longlat) ?? null;
    this.tooltipCell = cell?.visible ? cell : null;
  });

  onMouseClick = action((_event: React.MouseEvent<HTMLElement>) => { });
}
