import { action, makeObservable, observable } from 'mobx';
import { spawn, Thread, Worker } from 'threads';
import { ParseConfig } from 'papaparse';
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
  coordinates: [longitude: number, latitude: number],
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
    file: string | File,
    getItems: (
      items: { [key: string]: string | number }[],
    ) => void,
    args: ParseConfig = {},
  ) {
    const dataWorker = await spawn(new Worker('../workers/DataWorker.ts'));

    dataWorker.stream().subscribe(getItems);

    yield dataWorker.load(file, args);

    return await Thread.terminate(dataWorker);
  }

  async load(
    file: string | File,
    nameColumn = "species",
    longColumn = "longitude",
    latColumn = "latitude",
  ) {
    const { mapStore } = this.rootStore;
    const mapper = createMapper(nameColumn, longColumn, latColumn);

    const loader = this.loadData(file, (items) => {
      for (let item of items) {
        const mappedItem = mapper(item);
        const pointFeature = createPointFeature(
          [mappedItem.longitude, mappedItem.latitude],
          { name: mappedItem.name },
        );

        this.pointCollection.features.push(pointFeature);

        this.binner.addFeature(pointFeature);

        if (mapStore.renderType === 'raw') {
          mapStore.renderPoint(pointFeature);
        }
      }
    });

    await loader.next();
    this.updatePointCollection();
    this.setLoaded(true);
  }
}

function createMapper(nameColumn: string, longColumn: string, latColumn: string) {
  return (item: { [key: string]: string | number }) => ({
    name: item[nameColumn].toString(),
    longitude: +item[longColumn],
    latitude: +item[latColumn],
  });
}