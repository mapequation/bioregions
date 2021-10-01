import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import { makeObservable, observable } from 'mobx';
import type RootStore from './RootStore';

// const URL_LAND_50m = 'https://cdn.jsdelivr.net/npm/world-atlas@2/land-50m.json';
// const URL_LAND_110m =
//   'https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json';

export default class LandStore {
  rootStore: RootStore;
  land50m: d3.GeoPermissibleObjects | null = null;
  land110m: d3.GeoPermissibleObjects | null = null;
  loaded: boolean = false;

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;

    makeObservable(this, {
      loaded: observable,
    });

    this.loadLandLayer().catch(console.error);
  }

  async loadLandLayer() {
    const [land110m, land50m] = await Promise.all([
      fetch('maps/physical/land-110m.json').then((res) => res.json()),
      fetch('maps/physical/land-50m.json').then((res) => res.json()),
    ]);
    this.land110m = topojson.feature(land110m, land110m.objects.land);
    this.land50m = topojson.feature(land50m, land50m.objects.land);

    this.loaded = true;
    this.rootStore.mapStore.render();
  }
}
