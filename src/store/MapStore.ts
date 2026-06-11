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

export const BACKENDS: BackendType[] = ['auto', 'canvas', 'svg'];

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
    this.pointsHandle = null;
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
