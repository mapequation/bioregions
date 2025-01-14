import * as d3 from 'd3';
import { action, makeObservable, observable, computed } from 'mobx';
import { type Cell } from '../utils/QuadTree';
import type RootStore from './RootStore';
import * as d3Zoom from 'd3-zoom';
import { select } from 'd3-selection';
import { zoomProjection, zoomFixed } from '../utils/zoom';
import { MultiPoint } from '../types/geojson';
import { GeometryFeature } from './SpeciesStore';
// import * as c3 from '@mapequation/c3';
// import type { SchemeName } from '@mapequation/c3';

const sphere: d3.GeoPermissibleObjects = { type: 'Sphere' };

interface CanvasDatum {
  width: number;
  height: number;
  radius: number;
}

export interface IMapRenderer { }

export type RenderType = 'records' | 'heatmap' | 'bioregions';

type GetGridColor = (cell: Cell) => string;

export const PROJECTIONS = [
  'geoNaturalEarth1',
  'geoOrthographic',
  'geoMercator',
] as const;

export type Projection = typeof PROJECTIONS[number];

export const PROJECTIONNAME: Record<Projection, string> = {
  geoNaturalEarth1: 'Natural Earth',
  geoOrthographic: 'Orthographic',
  geoMercator: 'Mercator',
} as const;

export const HEATMAP_TARGETS = [
  "records",
  "richness",
  "relativeRichness",
  "overlap",
  "endemicity",
  "occupancy",
] as const;

export type HeatmapTarget = typeof HEATMAP_TARGETS[number];

export const HEATMAP_TARGET_NAME: Record<HeatmapTarget, string> = {
  records: "Records",
  richness: "Species richness",
  relativeRichness: "Relative species richness",
  overlap: "Biota overlap",
  endemicity: "Endemicity",
  occupancy: "Occupancy",
} as const;

export const HEATMAP_TARGET_SCALE: Record<HeatmapTarget, "linear" | "log"> = {
  records: "log",
  richness: "log",
  relativeRichness: "linear",
  overlap: "linear",
  endemicity: "linear",
  occupancy: "linear",
} as const;

// type TooltipData = {
//   x: number,
//   y: number,
//   active: boolean,
// }

export default class MapStore {
  rootStore: RootStore;
  isZooming: boolean = false;
  renderDataWhileZooming: boolean = true;
  setRenderDataWhileZooming(value: boolean) {
    this.renderDataWhileZooming = value;
  }

  projectionName: Projection = PROJECTIONS[0];
  projection = d3[this.projectionName]().precision(0.1)!;
  rotation: [number, number] = [40, 0]; // for orthographic projection
  // translation: [number, number] = [480, 250]; // Places the 0˚,0˚ point at the center of a 960x500 area
  translation: [number, number] = [600, 450];

  canvas: HTMLCanvasElement | null = null;
  svg: SVGSVGElement | null = null;
  context2d: CanvasRenderingContext2D | null = null;

  geoPath: d3.GeoPath | null = null;

  width: number = 1200;
  height: number = 900;

  renderBatchIndex: number = 0;
  renderType: RenderType = 'records';
  clipToLand: boolean = true;
  colorModuleParticipation: boolean = true;
  colorModuleParticipationStrength: number = 1.0;

  waterColor: string = '#f0f8ff';
  landColor: string = '#ffffff';

  tooltipActive: boolean = false;
  tooltipPos: [number, number] = [0, 0];
  tooltipCell: Cell | null = null;

  heatmapTarget: HeatmapTarget = "records";
  // heatmapScale: "linear" | "log" = "linear";
  get heatmapScale(): "linear" | "log" {
    return HEATMAP_TARGET_SCALE[this.heatmapTarget]
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
      colorModuleParticipation: observable,
      colorModuleParticipationStrength: observable,
      waterColor: observable,
      landColor: observable,
      tooltipActive: observable,
      tooltipPos: observable,
      tooltipCell: observable.ref,
      heatmapTarget: observable,
      heatmapScale: computed,
      onZoom: action,
      onZoomEnd: action,
      setProjection: action,
      setRenderType: action,
    });

    if (this.projectionName === 'geoOrthographic') {
      this.projection.rotate(this.rotation);
    }

    if (this.projectionName === 'geoNaturalEarth1') {
      this.projection.translate(this.translation);
    }
  }

  setRenderType(type: RenderType) {
    this.renderType = type;
  }

  setClipToLand = action((value: boolean) => {
    if (value === this.clipToLand) { return; }
    this.clipToLand = value;
    this.render();
  })

  setWaterColor = action((value: string) => {
    console.log(`!!! setWaterColor: ${value}, current: ${this.waterColor}`)
    if (value === this.waterColor) { return; }
    this.waterColor = value;
  })

  setLandColor = action((value: string) => {
    if (value === this.waterColor) { return; }
    this.waterColor = value;
  })

  setColorModuleParticipation = action((value: boolean) => {
    this.colorModuleParticipation = value;
    this.render();
  })

  setColorModuleParticipationStrength = action((value: number, render: boolean = false) => {
    this.colorModuleParticipationStrength = value;
    if (render) {
      this.render();
    }
  })

  setHeatmapTarget = action((value: HeatmapTarget, render: boolean = false) => {
    this.heatmapTarget = value;
    if (render) {
      this.render();
    }
  })

  get multiPoints() {
    return this.rootStore.speciesStore.multiPointCollection
      .geometries as MultiPoint[];
  }

  get binner() {
    return this.rootStore.speciesStore.binner;
  }

  renderLand({ clip = true } = {}) {
    if (this.context2d === null || !this.rootStore.landStore.loaded) {
      return;
    }
    const { land110m, land50m } = this.rootStore.landStore;
    const land = (
      this.isZooming ? land110m : land50m
    ) as d3.GeoPermissibleObjects;

    const path = this.geoPath!;

    const ctx = this.context2d;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.beginPath();
    path(sphere);
    ctx.fillStyle = this.waterColor;
    ctx.fill();

    ctx.beginPath();
    path(land);
    ctx.fillStyle = this.landColor;
    ctx.fill();

    if (clip) {
      ctx.clip();
    }
  }

  private _renderShape(shape: GeometryFeature, ctx: CanvasRenderingContext2D) {
    const path = this.geoPath!;
    ctx.beginPath();
    path(shape);
    ctx.fillStyle = 'red';
    ctx.fill();
  }

  renderShape(shape: GeometryFeature) {
    if (this.context2d === null) {
      return;
    }

    this._renderShape(shape, this.context2d);
  }

  private _renderMultiPoint(point: MultiPoint, ctx: CanvasRenderingContext2D) {
    const path = this.geoPath!;
    ctx.beginPath();
    path(point);
    ctx.fillStyle = 'red';
    ctx.fill();
  }

  renderMultiPoint(point: MultiPoint) {
    if (this.context2d === null) {
      return;
    }

    this._renderMultiPoint(point, this.context2d);
  }

  private _renderPoints() {
    if (this.renderType !== 'records') return;

    const { multiPoints } = this;
    if (this.renderBatchIndex === 0) {
      console.time('renderPoints');
    }

    // TODO: Adapt the number of batches to what can be run within 60 fps
    const numBatches = 4;
    const batchSize = Math.min(
      multiPoints.length,
      this.renderBatchIndex + numBatches,
    );

    for (let i = this.renderBatchIndex; i < batchSize; i++) {
      this._renderMultiPoint(multiPoints[i], this.context2d!);
    }

    this.renderBatchIndex += numBatches;

    if (this.renderBatchIndex >= multiPoints.length) {
      console.timeEnd('renderPoints');
    }

    if (this.renderBatchIndex < multiPoints.length) {
      requestAnimationFrame(() => this._renderPoints());
    }
  }

  renderPoints() {
    if (this.context2d === null || this.multiPoints.length === 0) {
      return;
    }

    this.renderBatchIndex = 0;
    this._renderPoints();
  }

  private _renderGridCell(
    node: Cell,
    ctx: CanvasRenderingContext2D,
    color: string,
  ) {
    const path = this.geoPath!;
    ctx.beginPath();
    path(node.geometry);
    ctx.fillStyle = color;
    ctx.fill();
  }

  private _getHeatmapColorTargetGetter(): (n: Cell) => number {
    switch (this.heatmapTarget) {
      case "records":
        return (n: Cell) => n.recordsPerArea;
      case "richness":
        return (n: Cell) => n.speciesRichness;
      case "relativeRichness":
        return (n: Cell) => n.bioregionMetrics.relativeRichness;
      case "overlap":
        return (n: Cell) => n.bioregionMetrics.overlap;
      case "endemicity":
        return (n: Cell) => n.recordsPerArea; //TODO: Implement
      case "occupancy":
        return (n: Cell) => n.recordsPerArea; //TODO: Implement
      default:
        console.warn(`Heatmap target '${this.heatmapTarget}' lacks implementation.`);
        return (n: Cell) => n.recordsPerArea;
    }
  }

  private _heatmapColor(cells: Cell[]): GetGridColor {
    //TODO: Cache domain extent in QuadTreeGeoBinner as cells are cached

    const getTarget = this._getHeatmapColorTargetGetter();

    const domainExtent = d3.extent(cells, getTarget) as [
      number,
      number,
    ];
    const domainMax = domainExtent[1];

    const domain = d3.range(0, domainMax, domainMax / 8); // Exact doesn't include the end for some reason
    domain.push(domainMax);

    const heatmapColorIndexScale = (this.heatmapScale === "log" ? d3.scaleLog() : d3.scaleLinear())
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
    console.log(heatmapColorIndexScale)

    return (cell: Cell) =>
      colorRange[Math.floor(heatmapColorIndexScale(getTarget(cell)))];
  }

  // private _bioregionColor(): GetGridColor {
  //   const { bioregionColors } = this.rootStore.colorStore;
  //   return (cell: Cell) => bioregionColors[cell.bioregionId - 1];
  // }

  private cellColor(): GetGridColor {
    return this.rootStore.colorStore.colorCell;
  }

  renderGrid() {
    if (this.context2d === null) {
      return;
    }

    const { cells } = this.binner;
    const { tree } = this.rootStore.infomapStore;

    const getGridColor =
      this.renderType === 'heatmap' || !tree
        ? this._heatmapColor(cells)
        : this.cellColor();

    cells.forEach((cell: Cell) =>
      this._renderGridCell(cell, this.context2d!, getGridColor(cell)),
    );
  }

  renderData() {
    if (this.renderType === 'records') {
      this.renderPoints();
    } else {
      this.renderGrid();
    }
  }

  render() {
    if (this.context2d === null) {
      return;
    }

    this.context2d.save();

    this.renderLand({ clip: this.clipToLand });
    this.renderData();

    this.context2d.restore();
  }

  setProjection(projection: Projection) {
    this.projectionName = projection;
    this.projection = d3[projection]().precision(0.1)!;
    this.setGeoPath(this.projection, this.context2d!);
    this.adjustHeight();
    this.applyZoom();
    this.render();
  }

  setGeoPath(projection: d3.GeoProjection, ctx: CanvasRenderingContext2D) {
    this.geoPath = d3.geoPath(projection, ctx);
    this.geoPath.pointRadius(0.5);
  }

  setSVG(svg: SVGSVGElement) {
    this.svg = svg;
  }

  setCanvas(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.context2d = canvas.getContext('2d')!;

    if (!this.context2d) {
      console.warn('Failed to create context');
      return;
    }

    this.setGeoPath(this.projection, this.context2d);
    this.adjustHeight();
    this.applyZoom();
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
    if (this.canvas !== null) {
      this.canvas.height = height;
    }
    projection.translate([width / 2, height / 2]);
  }

  applyZoom() {
    const zoomBehavior = this.projectionName === "geoOrthographic" ? zoomProjection : zoomFixed;
    const canvasZoom = zoomBehavior(this.projection) as d3Zoom.ZoomBehavior<
      HTMLCanvasElement,
      CanvasDatum
    >;

    canvasZoom
      .on('zoom.render', () => this.onZoom())
      .on('end.render', () => this.onZoomEnd());

    if (this.canvas != null) {
      const canvasSelection = select<HTMLCanvasElement, CanvasDatum>(
        this.canvas,
      );
      canvasZoom(canvasSelection);
    }
  }

  onZoom() {
    this.isZooming = true;
    if (this.renderDataWhileZooming && this.renderType !== 'records') {
      this.render();
    } else {
      this.renderLand({ clip: false });
    }
  }

  onZoomEnd() {
    this.isZooming = false;
    this.render();
  }

  getPosFromEvent(event: React.MouseEvent<HTMLCanvasElement>): [number, number] {
    const { offsetX, offsetY } = event.nativeEvent;
    return [offsetX, offsetY];
  }

  setTooltipPos = action((event: React.MouseEvent<HTMLCanvasElement>) => {
    this.tooltipPos = this.getPosFromEvent(event);
  })

  onMouseEnter = action((event: React.MouseEvent<HTMLCanvasElement>) => {
    this.tooltipActive = true;
    this.setTooltipPos(event);
  })

  onMouseLeave = action(() => {
    this.tooltipActive = false;
    this.tooltipCell = null;
  })

  onMouseMove = action((event: React.MouseEvent<HTMLCanvasElement>) => {
    this.setTooltipPos(event);
    const longlat = this.projection.invert!(this.tooltipPos);
    if (!longlat) {
      return;
    }
    const cell = this.rootStore.speciesStore.binner.find(...longlat) ?? null;
    this.tooltipCell = cell?.visible ? cell : null;
  })

  onMouseClick = action((event: React.MouseEvent<HTMLCanvasElement>) => {
    console.log(event)
  })
}
