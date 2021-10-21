import { action, makeObservable, observable } from 'mobx';
import { spawn, Thread, Worker } from 'threads';
import { QuadtreeGeoBinner } from '../utils/QuadTreeGeoBinner';
import type RootStore from './RootStore';
import type { Feature, FeatureCollection, Point } from '../types/geojson';

export interface PointProperties {
  name: string;
  [key: string]: any;
}

export type PointFeature = Feature<Point, PointProperties>;
export type PointFeatureCollection = FeatureCollection<Point, PointProperties>;

export const createPointFeature = (
  coordinates: [number, number],
  properties: PointProperties,
): PointFeature => ({
  type: 'Feature',
  geometry: {
    type: 'Point',
    coordinates,
  },
  properties,
});

export const createPointCollection = (
  features: PointFeature[] = [],
): PointFeatureCollection => ({
  type: 'FeatureCollection',
  features,
});

export default class SpeciesStore {
  rootStore: RootStore;
  loaded: boolean = false;
  pointCollection: PointFeatureCollection = createPointCollection();
  binner: QuadtreeGeoBinner = new QuadtreeGeoBinner(this);;

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;

    makeObservable(this, {
      loaded: observable,
      pointCollection: observable.ref,
      setPointCollection: action,
      setLoaded: action,
    });
  }

  setLoaded(loaded: boolean) {
    this.loaded = loaded;
  }

  setPointCollection(pointCollection: PointFeatureCollection) {
    this.pointCollection = pointCollection;
  }

  updatePointCollection() {
    this.setPointCollection(
      createPointCollection(this.pointCollection.features),
    );
  }

  private async *loadData(
    filename: string,
    getItems: (
      items: { longitude: number; latitude: number; species: string }[],
    ) => void,
  ) {
    const dataWorker = await spawn(new Worker('../workers/DataWorker.ts'));

    dataWorker.stream().subscribe(getItems);

    yield dataWorker.load(filename);

    return await Thread.terminate(dataWorker);
  }

  async loadSpecies(filename: string) {
    const { mapStore } = this.rootStore;

    const loader = this.loadData(filename, (items) => {
      for (let item of items) {
        const pointFeature = createPointFeature(
          [item.longitude, item.latitude],
          { name: item.species },
        );

        this.pointCollection.features.push(pointFeature);

        this.binner.addFeature(pointFeature);

        if (mapStore.renderType === 'raw') {
          mapStore.renderPoint(pointFeature.geometry.coordinates);
        }
      }
    });

    await loader.next(); // Waits until streaming is done
    this.updatePointCollection();
    this.setLoaded(true);
  }
}
