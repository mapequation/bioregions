import { action, makeObservable, observable, computed } from 'mobx';
import { spawn, Thread, Worker } from 'threads';
import { ParseConfig } from 'papaparse';
import { QuadtreeGeoBinner } from '../utils/QuadTreeGeoBinner';
import type RootStore from './RootStore';
import type { Feature, FeatureCollection, Point, MultiPoint, GeometryCollection } from '../types/geojson';
import { getName } from '../utils/filename';

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
  name: string = "data";
  loaded: boolean = false;
  isLoading: boolean = false;
  pointCollection: PointFeatureCollection = createPointCollection();
  multiPointCollection: GeometryCollection = createMultiPointGeometryCollection();
  binner: QuadtreeGeoBinner = new QuadtreeGeoBinner(this);

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;

    makeObservable(this, {
      name: observable,
      loaded: observable,
      isLoading: observable,
      numPoints: computed,
      pointCollection: observable.ref,
      setPointCollection: action,
      setLoaded: action,
      setIsLoading: action,
    });
  }

  get numPoints() {
    return this.pointCollection.features.length;
  }

  setLoaded(loaded: boolean) {
    this.loaded = loaded;
  }

  setIsLoading(isLoading: boolean = true) {
    this.isLoading = isLoading;
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
    this.setIsLoading();

    if (clear) {
      this.binner.setTreeNeedUpdate();
      this.updatePointCollection(createPointCollection());
      this.rootStore.mapStore.render();
    }

    this.name = getName(typeof file === "string" ? file : file.name)

    const { mapStore } = this.rootStore;
    const mapper = createMapper(nameColumn, longColumn, latColumn);

    const nameHistogram: { [key: string]: number } = {}
    const countName = (name: string) => {
      if (!(name in nameHistogram)) {
        nameHistogram[name] = 0;
      }

      nameHistogram[name]++;
    }

    console.time("load");

    const loader = this.loadData(file, (items) => {

      const multiPoint: MultiPoint = { type: 'MultiPoint', coordinates: [] };

      for (let item of items) {
        const mappedItem = mapper(item);
        const pointFeature = createPointFeature(
          [mappedItem.longitude, mappedItem.latitude],
          { name: mappedItem.name },
        );

        countName(mappedItem.name);

        this.pointCollection.features.push(pointFeature);

        multiPoint.coordinates.push(pointFeature.geometry.coordinates);

        this.binner.addFeature(pointFeature);
      }
      this.multiPointCollection.geometries.push(multiPoint);

      mapStore.renderMultiPoint(multiPoint);
    });


    await loader.next();
    console.timeEnd("load");

    this.updatePointCollection();
    this.setLoaded(true);
    this.setIsLoading(false);
  }
}

function createMapper(nameColumn: string, longColumn: string, latColumn: string) {
  return (item: { [key: string]: string | number }) => ({
    name: item[nameColumn].toString(),
    longitude: +item[longColumn],
    latitude: +item[latColumn],
  });
}