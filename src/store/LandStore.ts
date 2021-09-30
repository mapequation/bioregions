import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import { makeObservable, observable } from 'mobx';

// const URL_LAND_50m = 'https://cdn.jsdelivr.net/npm/world-atlas@2/land-50m.json';
// const URL_LAND_110m =
//   'https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json';

export default class LandStore {
  rootStore: any = null;
  land50m: any = null;
  land110m: any = null;
  loaded: boolean = false;

  constructor(rootStore: any) {
    this.rootStore = rootStore;

    makeObservable(this, {
      loaded: observable,
    });

    this.loadLandLayer().catch(console.error);
  }

  async loadLandLayer() {
    console.log('Loading land.topojson...');
    const res = await fetch('maps/physical/land.topojson');
    if (!res.ok) {
      console.error(`Failed to load land: ${res.statusText}`);
      return;
    }
    const land = await res.json();
    const geojson = topojson.feature(land, land.objects.land);
    console.log('geojson:', geojson);
    this.land110m = geojson;
    this.loaded = true;
  }
}
