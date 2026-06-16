import type * as d3 from 'd3';
import * as topojson from 'topojson-client';
import { makeObservable, observable, action } from 'mobx';
import type RootStore from './RootStore';

// const URL_LAND_50m = 'https://cdn.jsdelivr.net/npm/world-atlas@2/land-50m.json';
// const URL_LAND_110m =
//   'https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json';

export default class LandStore {
  rootStore: RootStore;
  land50m: d3.GeoPermissibleObjects | null = null;
  land110m: d3.GeoPermissibleObjects | null = null;
  loaded: boolean = false;
  private fineLandPromise: Promise<void> | null = null;

  constructor(rootStore: RootStore, { skipLoad }: { skipLoad?: boolean } = {}) {
    this.rootStore = rootStore;

    makeObservable(this, {
      loaded: observable,
      setLand110m: action,
      setLand50m: action,
    });

    if (!skipLoad) {
      this.loadLandLayer().catch(console.error);
    }
  }

  setLand110m = (land110m: d3.GeoPermissibleObjects) => {
    this.land110m = land110m;
    this.loaded = true;
    this.rootStore.mapStore.render();
  };

  setLand50m = (land50m: d3.GeoPermissibleObjects) => {
    this.land50m = land50m;
    this.rootStore.mapStore.render();
  };

  /** Load only the coarse 110m outline up front — it's small and fast to render. */
  async loadLandLayer() {
    const data = await fetch('/bioregions/data/maps/land-110m.json').then((res) =>
      res.json(),
    );
    this.setLand110m(topojson.feature(data, data.objects.land));
  }

  /** Lazily fetch the detailed 50m geometry the first time it's requested (once). */
  ensureFineLand(): Promise<void> {
    if (this.fineLandPromise) return this.fineLandPromise;
    this.fineLandPromise = fetch('/bioregions/data/maps/land-50m.json')
      .then((res) => res.json())
      .then((data) => this.setLand50m(topojson.feature(data, data.objects.land)))
      .catch((err) => {
        this.fineLandPromise = null; // allow a retry on failure
        throw err;
      });
    return this.fineLandPromise;
  }
}
