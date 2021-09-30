import * as d3 from 'd3';
import { action, makeObservable, observable } from 'mobx';
import type RootStore from './RootStore';

export default class ProjectionStore {
  rootStore: RootStore;
  loaded: boolean = false;
  isZooming: boolean = false;
  projection: d3.GeoProjection;
  projectionName: string = 'geoOrthographic';

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

  onZoom() {
    this.isZooming = true;
  }

  onZoomEnd() {
    this.isZooming = false;
  }
}
