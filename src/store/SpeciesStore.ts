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
import { getName, extension } from '../utils/filename';
import jszip from 'jszip';
import * as shapefile from 'shapefile';
import * as turf from '@turf/turf';

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
  havePolygons: boolean = false;
  multiPointCollection: GeometryCollection =
    createMultiPointGeometryCollection();
  collection: GeometryFeatureCollection = createFeatureCollection();
  binner: QuadtreeGeoBinner = new QuadtreeGeoBinner(this);
  speciesMap = new Map<string, Species>();

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;

    makeObservable(this, {
      name: observable,
      loaded: observable,
      isLoading: observable,
      numPoints: observable,
      havePolygons: observable,
      collection: observable.ref,
      speciesMap: observable.ref,
      speciesTopList: computed,
      numSpecies: computed,
      numRecords: computed,
      setCollection: action,
      setLoaded: action,
      setIsLoading: action,
    });
  }

  clearData = action(() => {
    this.loaded = false;
    this.isLoading = false;
    this.multiPointCollection = createMultiPointGeometryCollection();
    this.collection = createFeatureCollection();
    this.binner = new QuadtreeGeoBinner(this);
    this.speciesMap = new Map<string, Species>();
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

  get numRecords() {
    return this.collection.features.length;
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
      this.updateCollection(createFeatureCollection());
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

      this.collection.features.push(pointFeature);
      ++this.numPoints;
      this.binner.addFeature(pointFeature);
    }

    this.updateCollection();
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
      this.updateCollection(createFeatureCollection());
      this.rootStore.mapStore.render();
    }

    const filename = typeof file === 'string' ? file : file.name;
    this.name = getName(filename);

    if (filename.endsWith('.zip')) {
      return this.loadShapefile(file);
    }

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

        // this.pointCollection.features.push(pointFeature);
        this.collection.features.push(pointFeature);
        ++this.numPoints;

        multiPoint.coordinates.push(pointFeature.geometry.coordinates);

        this.binner.addFeature(pointFeature);
      }
      this.multiPointCollection.geometries.push(multiPoint);

      mapStore.renderMultiPoint(multiPoint);
    });

    await loader.next();
    console.timeEnd('load');

    this.updateCollection();
    this.setLoaded(true);
    this.setIsLoading(false);
  }

  async loadShapefile(file: string | File) {
    console.log('Load shapefile:', file);
    if (typeof file === 'string') {
      if (!file.endsWith('.zip')) {
        throw new Error(
          `Error trying to load shapefile from string path, but not a .zip filename: '${file}'`,
        );
      }
      const blob = await fetch(file).then((res) => res.blob());
      file = new File([blob], file, { type: 'application/zip' });
    }

    if (file.type !== 'application/zip') {
      throw new Error(
        `Error trying to load shapefile, but not a .zip file: '${file.name}'`,
      );
    }

    // const shpExtensions: string[] = ['shp', 'shx', 'dbf', 'prj'];
    // TODO: shapefile doesn't support prj, load separately?
    const shpExtensions: string[] = ['shp', 'dbf'];
    const shpFiles: File[] = [];

    const zipFile = await jszip.loadAsync(file);
    for (const [name, compressedFile] of Object.entries(zipFile.files)) {
      const ext = extension(name);
      if (!shpExtensions.includes(ext)) {
        continue;
      }

      const uncompressedFile = await compressedFile.async('blob');
      const file = new File([uncompressedFile], name);
      console.log(name, file);
      shpFiles.push(file);
    }

    return await this.loadShapeFiles(shpFiles);
  }

  async loadShapeFiles(files: File[], nameKey?: string) {
    const shpFile = files.find((file) => extension(file.name) === 'shp');
    if (!shpFile) {
      throw new Error('Error loading shapefile: No .shp file provided');
    }

    console.time('load');

    const { mapStore } = this.rootStore;

    const dbfFile = files.find((file) => extension(file.name) === 'dbf');
    const shpStream = shpFile.stream() as unknown as ReadableStream;
    const dbfStream = dbfFile?.stream() as unknown as ReadableStream;

    const getNameKey = (properties: any) => {
      const keys = Object.keys(properties ?? {});
      const keysToTest = ['binomial', 'species', 'name', 'id'] as const;
      return keysToTest.find((key) => keys.includes(key));
    };

    try {
      const source = await shapefile.open(shpStream, dbfStream);
      console.log(`Loading shapefile with bbox '${source.bbox}'...`);

      let result = await source.read();
      while (!result.done) {
        const shp = result.value;

        const key = nameKey ?? getNameKey(shp.properties);

        if (!shp.properties || !key) {
          throw new Error(
            `Can't deduce name key in shapefile from properties: ${JSON.stringify(
              shp.properties,
            )}`,
          );
        }

        Object.assign(shp.properties, { name: shp.properties![key] });
        mapStore.renderShape(shp as GeometryFeature);

        if (shp.geometry.type === 'Polygon') {
          this.havePolygons = true;
          const polygon = shp as PolygonFeature;
          this.collection.features.push(polygon);
          this.binner.addFeature(polygon);
        } else if (shp.geometry.type === 'MultiPolygon') {
          this.havePolygons = true;
          shp.geometry.coordinates.forEach((coords) => {
            const polygon = turf.polygon(
              coords,
              shp.properties,
            ) as PolygonFeature;
            this.collection.features.push(polygon);
            this.binner.addFeature(polygon);
          });
        } else if (shp.geometry.type === 'Point') {
          const point = shp as PointFeature;
          this.collection.features.push(point);
          this.binner.addFeature(point);
        } else if (shp.geometry.type === 'MultiPoint') {
          shp.geometry.coordinates.forEach((coords) => {
            const point = turf.point(coords, shp.properties) as PointFeature;
            this.collection.features.push(point);
            this.binner.addFeature(point);
          });
        } else {
          throw new Error(`Unsupported geometry: '${shp.geometry.type}'`);
        }

        result = await source.read();
      }
    } catch (error: any) {
      console.error('!! shp error:', error);
    }

    console.timeEnd('load');

    this.updateCollection();
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
