import * as d3 from 'd3';
import { action, makeObservable, observable } from 'mobx';
import { Cell } from '../utils/QuadTreeGeoBinner';
import type RootStore from './RootStore';
import * as d3Zoom from 'd3-zoom';
import { select } from 'd3-selection';
import zoom from '../utils/zoom';
import { MultiPoint } from '../types/geojson';
// import * as c3 from '@mapequation/c3';
// import type { SchemeName } from '@mapequation/c3';

const sphere: d3.GeoPermissibleObjects = { type: 'Sphere' };

interface CanvasDatum {
  width: number;
  height: number;
  radius: number;
}

export interface IMapRenderer {}

export type RenderType = 'records' | 'heatmap' | 'bioregions';

type GetGridColor = (cell: Cell) => string;

export const PROJECTIONS = [
  'geoOrthographic',
  'geoMercator',
  'geoNaturalEarth1',
] as const;

export type Projection = typeof PROJECTIONS[number];

export const PROJECTIONNAME: Record<Projection, string> = {
  geoOrthographic: 'Orthographic',
  geoMercator: 'Mercator',
  geoNaturalEarth1: 'Natural Earth',
} as const;

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

  canvas: HTMLCanvasElement | null = null;
  svg: SVGSVGElement | null = null;
  context2d: CanvasRenderingContext2D | null = null;

  geoPath: d3.GeoPath | null = null;

  width: number = 800;
  height: number = 600;

  renderBatchIndex: number = 0;

  renderType: RenderType = 'records';

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;

    makeObservable(this, {
      isZooming: observable,
      renderDataWhileZooming: observable,
      setRenderDataWhileZooming: action,
      projectionName: observable,
      renderType: observable,
      onZoom: action,
      onZoomEnd: action,
      setProjection: action,
      setRenderType: action,
    });

    if (this.projectionName === 'geoOrthographic') {
      this.projection.rotate(this.rotation);
    }
  }

  setRenderType(type: RenderType) {
    this.renderType = type;
  }

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
    ctx.fillStyle = 'AliceBlue';
    ctx.fill();

    ctx.beginPath();
    path(land);
    ctx.fillStyle = '#777';
    ctx.fill();

    if (clip) {
      ctx.clip();
    }
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

  private static _heatmapColor(cells: Cell[]): GetGridColor {
    //TODO: Cache domain extent in QuadTreeGeoBinner as cells are cached
    const domainExtent = d3.extent(cells, (n: Cell) => n.recordsPerArea) as [
      number,
      number,
    ];
    const domainMax = domainExtent[1];

    const domain = d3.range(0, domainMax, domainMax / 8); // Exact doesn't include the end for some reason
    domain.push(domainMax);

    const heatmapOpacityScale = d3
      .scaleLog()
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
      colorRange[Math.floor(heatmapOpacityScale(cell.recordsPerArea))];
  }

  private _bioregionColor(): GetGridColor {
    const { bioregionColors } = this.rootStore.colorStore;
    return (cell: Cell) => bioregionColors[cell.bioregionId - 1];
  }

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
        ? MapStore._heatmapColor(cells)
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

    this.renderLand();
    this.renderData();

    this.context2d.restore();
  }

  setProjection(projection: Projection) {
    this.projectionName = projection;
    this.projection = d3[projection]().precision(0.1)!;
    if (projection === 'geoOrthographic' || true) {
      this.projection.rotate(this.rotation);
    }
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
  }

  applyZoom() {
    const canvasZoom = zoom(this.projection) as d3Zoom.ZoomBehavior<
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
}
