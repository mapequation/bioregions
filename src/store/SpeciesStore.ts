import { action, makeObservable, observable, computed } from 'mobx';
import { spawn, Thread, Worker } from 'threads';
import { ParseConfig } from 'papaparse';
import QuadtreeGeoBinner from '../utils/QuadTree';
import { csvParse } from 'd3';
import type RootStore from './RootStore';
import type {
  Feature,
  FeatureCollection,
  Point,
  MultiPoint,
  GeometryCollection,
  Geometry,
  Polygon,
} from '../types/geojson';
import { getName } from '../utils/filename';
import { Timer } from '../utils/time';
import throttle from 'lodash/throttle';
import { normalizeSpeciesName } from '../utils/names';

// export type FeatureProperties = GeoJsonProperties & {
//   name: string;
// };
export interface FeatureProperties {
  name: string;
  [key: string]: any;
}

export type PointFeature = Feature<Point, FeatureProperties>;
export type GeometryFeature = Feature<Geometry, FeatureProperties>;
export type PolygonFeature = Feature<Polygon, FeatureProperties>;
export type GeoFeature = PointFeature | GeometryFeature;
export type PointFeatureCollection = FeatureCollection<
  Point,
  FeatureProperties
>;
export type GeometryFeatureCollection = FeatureCollection<
  Geometry,
  FeatureProperties
>;

export const createPointFeature = (
  coordinates: [longitude: number, latitude: number],
  properties: FeatureProperties,
): PointFeature => ({
  type: 'Feature',
  geometry: {
    type: 'Point',
    coordinates,
  },
  properties,
});

export const createFeatureCollection = (
  features: GeometryFeature[] = [],
): GeometryFeatureCollection => ({
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
  numPoints: number = 0;
  numPointsDebounced: number = 0;
  numPolygons: number = 0;
  numPolygonsDebounced: number = 0;
  multiPointCollection: GeometryCollection =
    createMultiPointGeometryCollection();
  collection: GeometryFeatureCollection = createFeatureCollection();
  binner: QuadtreeGeoBinner = new QuadtreeGeoBinner(this);
  speciesMap = new Map<string, Species>();
  timer = new Timer();
  speed: number = 0;
  seconds: number = 0;
  dataWorker: any = null;

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;

    makeObservable(this, {
      name: observable,
      loaded: observable,
      isLoading: observable,
      numPointsDebounced: observable,
      numPolygonsDebounced: observable,
      speed: observable,
      seconds: observable,
      collection: observable.ref,
      speciesMap: observable.ref,
      havePolygons: computed,
      speciesTopList: computed,
      numSpecies: computed,
      numRecords: computed,
      setCollection: action,
      setIsLoaded: action,
      setIsLoading: action,
    });
  }

  clearData = action(() => {
    this.loaded = false;
    this.isLoading = false;
    this.multiPointCollection = createMultiPointGeometryCollection();
    this.updateCollection(createFeatureCollection());
    this.binner.setTreeNeedUpdate();
    this.speciesMap = new Map<string, Species>();
    this.rootStore.mapStore.render();
  });

  clearBioregions = () => {
    this.binner.cells.forEach((cell) => {
      cell.bioregionId = 0;
      cell.overlappingBioregions.clear();
    });
    this.speciesMap.forEach((species) => {
      species.bioregionId = undefined;
    });
  };

  setNumPointsDebounced = throttle(
    action((value: number) => {
      this.numPointsDebounced = value;
    }),
    200,
    { leading: true, trailing: true },
  );

  setNumPolygonsDebounced = throttle(
    action((value: number) => {
      this.numPolygonsDebounced = value;
    }),
    200,
    { leading: true, trailing: true },
  );

  setSpeed = throttle(
    action((value: number) => {
      this.speed = value;
    }),
    200,
    { leading: true, trailing: true },
  );

  setSeconds = throttle(
    action((value: number) => {
      this.seconds = value;
    }),
    200,
    { leading: true, trailing: true },
  );

  get havePolygons() {
    return this.numPolygons > 0;
  }

  get numRecords() {
    return this.numPointsDebounced + this.numPolygonsDebounced;
  }

  get numSpecies() {
    return this.speciesMap.size;
  }

  get speciesTopList() {
    return Array.from(this.speciesMap.values()).sort(
      (a, b) => b.count - a.count,
    );
  }

  setIsLoaded(loaded: boolean = true) {
    this.isLoading = false;
    this.loaded = loaded;
  }

  setIsLoading(isLoading: boolean = true) {
    this.isLoading = isLoading;
  }

  setCollection(collection: GeometryFeatureCollection) {
    this.collection = collection;
    this.updateSpeciesMap();
  }

  updateCollection(collection = this.collection) {
    this.setCollection(collection);
  }

  updateSpeciesMap() {
    type Name = string;
    const speciesMap = new Map<Name, Species>();
    this.collection.features.forEach((feature) => {
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

  addFeature = action((feature: GeometryFeature) => {
    this.collection.features.push(feature);
    if (feature.geometry.type === 'Point') {
      this.binner.addFeature(feature);
      ++this.numPoints;
      this.setNumPointsDebounced(this.numPoints);
      this.setSpeed(this.timer.speed(this.numPoints));
    } else {
      this.rootStore.mapStore.renderShape(feature);
      ++this.numPolygons;
      this.setNumPolygonsDebounced(this.numPolygons);
      this.setSpeed(this.timer.speed(this.numPolygons));
    }

    this.setSeconds(this.timer.elapsedSecondsTotal);
    // const { elapsed } = this.timer;
    // if (elapsed > 1000 / 60) {
    //   await nextAnimationFrame();
    //   this.timer.lap();
    // }
  });

  private async *loadData(
    file: string | File,
    getItems: (items: { [key: string]: string | number }[]) => void,
    args: ParseConfig = {},
  ) {
    const dataWorker = await spawn(
      new Worker(
        //@ts-ignore
        new URL('../workers/DataWorker.ts', import.meta.url),
      ),
    );
    this.dataWorker = dataWorker;

    dataWorker.stream().subscribe(getItems);

    yield dataWorker.load(file, args);

    const res = await Thread.terminate(dataWorker);
    this.dataWorker = null;
    return res;
  }

  private async *loadShapefileInWorker(
    file: string | File | File[],
    onFeatures: (features: GeometryFeature[]) => void,
    nameKey?: string,
  ) {
    const dataWorker = await spawn(
      new Worker(
        //@ts-ignore
        new URL('../workers/DataWorker.ts', import.meta.url),
      ),
    );

    dataWorker.stream().subscribe(onFeatures);

    yield dataWorker.loadShapefile(file, nameKey);

    return await Thread.terminate(dataWorker);
  }

  loadStart = action(() => {
    console.time('load');
    this.timer.start();
  });

  loadEnd = action(() => {
    console.timeEnd('load');
  });

  async loadString(
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
      this.clearData();
    }

    this.preLoad();

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
        { name: normalizeSpeciesName(mappedItem.name) },
      );

      this.addFeature(pointFeature);
    }

    this.postLoad();
  }

  async load(
    file: string | File,
    nameColumn = 'species',
    longColumn = 'longitude',
    latColumn = 'latitude',
    clear = true,
  ) {
    if (clear) {
      this.clearData();
    }

    const filename = typeof file === 'string' ? file : file.name;
    this.name = getName(filename);

    if (filename.endsWith('.zip')) {
      return this.loadShapefile(file);
    }

    this.preLoad();

    const { mapStore } = this.rootStore;
    const mapper = createMapper(nameColumn, longColumn, latColumn);

    const nameHistogram: { [key: string]: number } = {};
    const countName = (name: string) => {
      if (!(name in nameHistogram)) {
        nameHistogram[name] = 0;
      }

      nameHistogram[name]++;
    };

    const ignoredRows: any[] = [];

    const loader = this.loadData(file, (items) => {
      const multiPoint: MultiPoint = { type: 'MultiPoint', coordinates: [] };

      for (let item of items) {
        const mappedItem = mapper(item);
        const name = normalizeSpeciesName(mappedItem.name);
        if (!name || name === 'NA') {
          ignoredRows.push(item);
          continue;
        }
        const pointFeature = createPointFeature(
          [mappedItem.longitude, mappedItem.latitude],
          { name },
        );

        countName(mappedItem.name);

        this.addFeature(pointFeature);

        multiPoint.coordinates.push(pointFeature.geometry.coordinates);
      }
      this.multiPointCollection.geometries.push(multiPoint);

      mapStore.renderMultiPoint(multiPoint);
    });

    await loader.next();
    this.loadEnd();
    console.log(
      `Ignored ${ignoredRows.length} rows due to no name:`,
      ignoredRows,
    );

    await this.postLoad();
  }

  onFeatures = action((features: GeometryFeature[]) => {
    features.forEach(this.addFeature);
  });

  async loadShapefile(file: string | File | File[], nameKey?: string) {
    this.preLoad();

    const loader = this.loadShapefileInWorker(file, this.onFeatures, nameKey);

    await loader.next();

    await this.postLoad();
  }

  cancelLoad = action(async () => {
    if (this.dataWorker) {
      await Thread.terminate(this.dataWorker);
      this.dataWorker = null;
    }
    await this.postLoad();
  });

  preLoad = action(() => {
    this.setIsLoading();
    this.loadStart();
  });

  postLoad = action(async () => {
    this.loadEnd();
    this.updateCollection();
    this.setIsLoaded();

    const { mapStore, infomapStore } = this.rootStore;
    mapStore.setRenderType('heatmap');
    mapStore.render();
    await infomapStore.run();
    mapStore.setRenderType('bioregions');
    mapStore.render();
  });
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
