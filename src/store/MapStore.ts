import * as d3 from 'd3';
import { action, makeObservable, observable } from 'mobx';
import type RootStore from './RootStore';

const sphere: d3.GeoPermissibleObjects = { type: 'Sphere' };

export interface IMapRenderer {}

export default class MapStore {
  rootStore: RootStore;
  loaded: boolean = false;
  isZooming: boolean = false;
  projection: d3.GeoProjection;
  projectionName: string = 'geoOrthographic';
  context2d: CanvasRenderingContext2D | null = null;
  geoPath: d3.GeoPath | null = null;
  width: number = 800;
  height: number = 600;

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;
    const projection = 'geoOrthographic';
    this.projection = d3[projection]().precision(0.1)!;

    makeObservable(this, {
      loaded: observable,
      isZooming: observable,
      projectionName: observable,
      onZoom: action,
      onZoomEnd: action,
    });
  }

  renderLand() {
    if (this.context2d === null || !this.rootStore.landStore.loaded) {
      return;
    }
    const { land110m, land50m } = this.rootStore.landStore;
    const land = (
      this.isZooming ? land110m : land50m
    ) as d3.GeoPermissibleObjects;

    // const path = d3.geoPath(this.projection, this.context2d);
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
  }

  private _renderPoint(
    position: [long: number, lat: number],
    ctx: CanvasRenderingContext2D,
  ) {
    const [x, y] = this.projection(position)!;
    ctx.fillStyle = 'red';
    ctx.fillRect(x, y, 2, 2);
  }

  renderPoint(position: [long: number, lat: number]) {
    if (this.context2d === null) {
      return;
    }
    this._renderPoint(position, this.context2d);
  }

  renderPoints() {
    if (this.context2d === null) {
      return;
    }
    this.rootStore.speciesStore.pointCollection.features.forEach((point) => {
      this._renderPoint(point.geometry.coordinates, this.context2d!);
    });
  }

  render() {
    this.renderLand();
    this.renderPoints();
  }

  setContext(ctx: CanvasRenderingContext2D) {
    this.context2d = ctx;
    this.geoPath = d3.geoPath(this.projection, this.context2d);
  }

  onZoom() {
    this.isZooming = true;
    this.renderLand();
  }

  onZoomEnd() {
    this.isZooming = false;
    this.renderLand();
    this.renderPoints();
  }
}
