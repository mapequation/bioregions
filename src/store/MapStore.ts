import * as d3 from 'd3';
import { action, makeObservable, observable } from 'mobx';
import { Node } from '../utils/QuadTreeGeoBinner';
import type RootStore from './RootStore';
import * as d3Zoom from 'd3-zoom';
import { select } from 'd3-selection';
import zoom from '../utils/zoom';
import { MultiPoint } from '../types/geojson';

const sphere: d3.GeoPermissibleObjects = { type: 'Sphere' };

interface CanvasDatum {
  width: number;
  height: number;
  radius: number;
}

export interface IMapRenderer { }

export type RenderType = 'raw' | 'grid';
export type GridColorBy = 'records' | 'modules';

type GetGridColor = (cell: Node) => string;

export const PROJECTIONS = [
  'geoMercator',
  'geoOrthographic',
  'geoNaturalEarth1',
] as const;

export type Projection = typeof PROJECTIONS[number];

export const PROJECTIONNAME: Record<Projection, string> = {
  geoMercator: 'Mercator',
  geoOrthographic: 'Orthographic',
  geoNaturalEarth1: 'Natural Earth'
} as const;

export default class MapStore {
  rootStore: RootStore;
  isZooming: boolean = false;

  projectionName: Projection = PROJECTIONS[0];
  projection = d3[this.projectionName]().precision(0.1)!;

  canvas: HTMLCanvasElement | null = null;
  svg: SVGSVGElement | null = null;
  context2d: CanvasRenderingContext2D | null = null;

  geoPath: d3.GeoPath | null = null;

  width: number = 800;
  height: number = 600;

  renderBatchIndex: number = 0;

  renderType: RenderType = 'raw';
  gridColorBy: GridColorBy = 'records';

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;

    makeObservable(this, {
      isZooming: observable,
      projectionName: observable,
      renderType: observable,
      gridColorBy: observable,
      onZoom: action,
      onZoomEnd: action,
      setProjection: action,
      setRenderType: action,
      setGridColorBy: action,
    });
  }

  setRenderType(type: RenderType) {
    this.renderType = type;
  }

  setGridColorBy(colorBy: GridColorBy) {
    this.gridColorBy = colorBy;
  }

  get multiPoints() {
    return this.rootStore.speciesStore.multiPointCollection.geometries as MultiPoint[];
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
    if (this.renderType !== 'raw') return;

    const { multiPoints } = this;
    if (this.renderBatchIndex === 0) {
      console.time("renderPoints");
    }

    // TODO: Adapt the number of batches to what can be run within 60 fps
    const numBatches = 4;
    const batchSize = Math.min(multiPoints.length, this.renderBatchIndex + numBatches);

    for (let i = this.renderBatchIndex; i < batchSize; i++) {
      this._renderMultiPoint(multiPoints[i], this.context2d!)
    }

    this.renderBatchIndex += numBatches;

    if (this.renderBatchIndex >= multiPoints.length) {
      console.timeEnd("renderPoints");
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

  private _renderGridCell(node: Node, ctx: CanvasRenderingContext2D, color: string) {
    const path = this.geoPath!;
    ctx.beginPath();
    path(node.geometry);
    ctx.fillStyle = color;
    ctx.fill();
  }

  private static _heatmapColor(cells: Node[]): GetGridColor {
    //TODO: Cache domain extent in QuadTreeGeoBinner as cells are cached
    const domainExtent = d3.extent(cells, (n: Node) => n.recordsPerArea) as [
      number,
      number,
    ];
    const domainMax = domainExtent[1];

    const domain = d3.range(0, domainMax, domainMax / 8); // Exact doesn't include the end for some reason
    domain.push(domainMax);

    const heatmapOpacityScale = d3.scaleLog().domain(domainExtent).range([0, 8]);

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

    return (cell: Node) =>
      colorRange[Math.floor(heatmapOpacityScale(cell.recordsPerArea))];
  }

  private static _bioregionColor(): GetGridColor {
    const CAT_20 = [
      '#D66F87',
      '#BDE628',
      '#27A3E7',
      '#89EBC0',
      '#A0915F',
      '#F6BE1D',
      '#E6B9FB',
      '#629E47',
      '#59B5BF',
      '#A581A6',
      '#AEB327',
      '#F3D2A3',
      '#F990CE',
      '#869AF4',
      '#A7D2F3',
      '#A18C82',
      '#E2CB74',
      '#F3A19B',
      '#FC739B',
      '#DECE4D',
    ];

    return (cell: Node) => CAT_20[cell.bioregionId % CAT_20.length];
  }

  renderGrid() {
    if (this.context2d === null) {
      return;
    }

    const { cells } = this.binner;
    const { tree } = this.rootStore.infomapStore;

    const getGridColor = (this.gridColorBy === 'records' || !tree)
      ? MapStore._heatmapColor(cells)
      : MapStore._bioregionColor();

    cells.forEach((cell: Node) => this._renderGridCell(cell, this.context2d!, getGridColor(cell)));
  }

  render() {
    if (this.context2d === null) {
      return;
    }

    this.context2d.save();

    this.renderLand();
    if (this.renderType === 'raw') {
      this.renderPoints();
    } else {
      this.renderGrid();
    }

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
    this.renderLand({ clip: false });
  }

  onZoomEnd() {
    this.isZooming = false;
    this.render();
  }
}
