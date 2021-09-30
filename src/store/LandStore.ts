import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import { makeObservable, observable } from 'mobx';

// const URL_LAND_50m = 'https://cdn.jsdelivr.net/npm/world-atlas@2/land-50m.json';
// const URL_LAND_110m =
//   'https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json';

export default class LandStore {
  rootStore: any = null;
  land50m: d3.GeoPermissibleObjects | null = null;
  land110m: d3.GeoPermissibleObjects | null = null;
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

    const [land110m, land50m] = await Promise.all([
      fetch('maps/physical/land-110m.json').then((res) => res.json()),
      fetch('maps/physical/land-50m.json').then((res) => res.json()),
    ]);
    this.land110m = topojson.feature(land110m, land110m.objects.land);
    this.land50m = topojson.feature(land50m, land50m.objects.land);

    // const res = await fetch('maps/physical/land.topojson');
    // if (!res.ok) {
    //   console.error(`Failed to load land: ${res.statusText}`);
    //   return;
    // }
    // const land = await res.json();
    // const geojson = topojson.feature(land, land.objects.land);
    // console.log('geojson:', geojson);
    // this.land110m = geojson;
    this.loaded = true;
  }
}
