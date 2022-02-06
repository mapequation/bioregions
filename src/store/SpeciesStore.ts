import { action, makeObservable, observable, computed } from 'mobx';
import { spawn, Thread, Worker } from 'threads';
import { ParseConfig } from 'papaparse';
import { QuadtreeGeoBinner } from '../utils/QuadTreeGeoBinner';
import { csvParse } from 'd3';
import type RootStore from './RootStore';
import type {
  Feature,
  FeatureCollection,
  Point,
  MultiPoint,
  GeometryCollection,
} from '../types/geojson';
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

export type Species = {
  name: string;
  bioregionId?: number;
  count: number;
  countPerRegion: Map<number, number>;
};

export default class SpeciesStore {
  rootStore: RootStore;
  name: string = 'data';
  loaded: boolean = false;
  isLoading: boolean = false;
  pointCollection: PointFeatureCollection = createPointCollection();
  multiPointCollection: GeometryCollection =
    createMultiPointGeometryCollection();
  binner: QuadtreeGeoBinner = new QuadtreeGeoBinner(this);
  speciesMap = new Map<string, Species>();

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;

    makeObservable(this, {
      name: observable,
      loaded: observable,
      isLoading: observable,
      numPoints: computed,
      pointCollection: observable.ref,
      speciesMap: observable.ref,
      speciesTopList: computed,
      numSpecies: computed,
      numRecords: computed,
      setPointCollection: action,
      setLoaded: action,
      setIsLoading: action,
    });
  }

  clearData = action(() => {
    this.loaded = false;
    this.isLoading = false;
    this.pointCollection = createPointCollection();
    this.multiPointCollection = createMultiPointGeometryCollection();
    this.binner = new QuadtreeGeoBinner(this);
    this.speciesMap = new Map<string, Species>();
  });

  get numPoints() {
    return this.pointCollection.features.length;
  }

  get numRecords() {
    return this.numPoints;
  }

  get numSpecies() {
    return this.speciesMap.size;
  }

  get speciesTopList() {
    return Array.from(this.speciesMap.values()).sort(
      (a, b) => b.count - a.count,
    );
  }

  setLoaded(loaded: boolean) {
    this.loaded = loaded;
  }

  setIsLoading(isLoading: boolean = true) {
    this.isLoading = isLoading;
  }

  setPointCollection(pointCollection: PointFeatureCollection) {
    this.pointCollection = pointCollection;
    this.updateSpeciesMap();
  }

  updatePointCollection(pointCollection = this.pointCollection) {
    this.setPointCollection(createPointCollection(pointCollection.features));
  }

  updateSpeciesMap() {
    type Name = string;
    const speciesMap = new Map<Name, Species>();
    this.pointCollection.features.forEach((feature) => {
      const { name } = feature.properties;
      const species = speciesMap.get(name) ?? {
        name,
        count: 0,
        countPerRegion: new Map<number, number>(),
      };
      ++species.count;
      speciesMap.set(name, species);
    });
    this.speciesMap = speciesMap;
  }

  private async *loadData(
    file: string | File,
    getItems: (items: { [key: string]: string | number }[]) => void,
    args: ParseConfig = {},
  ) {
    const dataWorker = await spawn(new Worker('../workers/DataWorker.ts'));

    dataWorker.stream().subscribe(getItems);

    yield dataWorker.load(file, args);

    return await Thread.terminate(dataWorker);
  }

  loadString(
    data: string,
    {
      add,
      nameColumn = 'species',
      longColumn = 'longitude',
      latColumn = 'latitude',
    }: {
      add?: boolean;
      nameColumn?: string;
      longColumn?: string;
      latColumn?: string;
    } = {},
  ) {
    if (!add) {
      this.binner.setTreeNeedUpdate();
      this.updatePointCollection(createPointCollection());
      this.rootStore.mapStore.render();
    }

    const records = csvParse(data);

    const mapper = createMapper<string | undefined>(
      nameColumn,
      longColumn,
      latColumn,
    );

    for (let item of records) {
      const mappedItem = mapper(item);
      const pointFeature = createPointFeature(
        [mappedItem.longitude, mappedItem.latitude],
        { name: mappedItem.name },
      );

      this.pointCollection.features.push(pointFeature);
      this.binner.addFeature(pointFeature);
    }

    this.updatePointCollection();
    this.setLoaded(true);
    this.setIsLoading(false);
  }

  async load(
    file: string | File,
    nameColumn = 'species',
    longColumn = 'longitude',
    latColumn = 'latitude',
    clear = true,
  ) {
    this.setIsLoading();

    if (clear) {
      this.binner.setTreeNeedUpdate();
      this.updatePointCollection(createPointCollection());
      this.rootStore.mapStore.render();
    }

    this.name = getName(typeof file === 'string' ? file : file.name);

    const { mapStore } = this.rootStore;
    const mapper = createMapper(nameColumn, longColumn, latColumn);

    const nameHistogram: { [key: string]: number } = {};
    const countName = (name: string) => {
      if (!(name in nameHistogram)) {
        nameHistogram[name] = 0;
      }

      nameHistogram[name]++;
    };

    console.time('load');

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
    console.timeEnd('load');

    this.updatePointCollection();
    this.setLoaded(true);
    this.setIsLoading(false);
  }
}

function createMapper<ItemType = string | number>(
  nameColumn: string,
  longColumn: string,
  latColumn: string,
) {
  return (item: { [key: string]: ItemType }) => ({
    name: `${item[nameColumn]}`,
    longitude: +item[longColumn]!,
    latitude: +item[latColumn]!,
  });
}
