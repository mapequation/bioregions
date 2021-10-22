import { action, makeObservable, observable } from 'mobx';
import { spawn, Thread, Worker } from 'threads';
import { ParseConfig } from 'papaparse';
import { QuadtreeGeoBinner } from '../utils/QuadTreeGeoBinner';
import type RootStore from './RootStore';
import type { Feature, FeatureCollection, Point, MultiPoint, GeometryCollection } from '../types/geojson';

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

export const createMultiPointGeometryCollection = (
  geometries: MultiPoint[] = [],
): GeometryCollection => ({
  type: 'GeometryCollection',
  geometries,
});

export default class SpeciesStore {
  rootStore: RootStore;
  loaded: boolean = false;
  pointCollection: PointFeatureCollection = createPointCollection();
  multiPointCollection: GeometryCollection = createMultiPointGeometryCollection();
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

  updatePointCollection(pointCollection = this.pointCollection) {
    this.setPointCollection(
      createPointCollection(pointCollection.features),
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
    clear = true,
  ) {
    if (clear) {
      this.binner.setTreeNeedUpdate();
      this.updatePointCollection(createPointCollection());
      this.rootStore.mapStore.render();
    }

    const { mapStore } = this.rootStore;
    const mapper = createMapper(nameColumn, longColumn, latColumn);

    performance.mark('start');

    const loader = this.loadData(file, (items) => {

      const multiPoint: MultiPoint = { type: 'MultiPoint', coordinates: [] };

      for (let item of items) {
        const mappedItem = mapper(item);
        const pointFeature = createPointFeature(
          [mappedItem.longitude, mappedItem.latitude],
          { name: mappedItem.name },
        );

        this.pointCollection.features.push(pointFeature);

        multiPoint.coordinates.push(pointFeature.geometry.coordinates);

        this.binner.addFeature(pointFeature);
      }
      this.multiPointCollection.geometries.push(multiPoint);

      mapStore.renderMultiPoint(multiPoint);
    });


    await loader.next();

    performance.mark('end');
    performance.measure('load', 'start', 'end');
    const entries = performance.getEntriesByType("measure");
    console.log('Loaded in', entries[0].duration);

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