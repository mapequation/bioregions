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
  Geometry,
  GeoJsonProperties,
} from '../types/geojson';
import { getName, extension } from '../utils/filename';
import jszip from 'jszip';
import * as shapefile from 'shapefile';

// export type FeatureProperties = GeoJsonProperties & {
//   name: string;
// };
export interface FeatureProperties {
  name: string;
  [key: string]: any;
}

export type PointFeature = Feature<Point, FeatureProperties>;
export type ShapeFeature = Feature<Geometry, FeatureProperties>;
export type PointFeatureCollection = FeatureCollection<
  Point,
  FeatureProperties
>;
export type ShapeFeatureCollection = FeatureCollection<
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

export const createPointCollection = (
  features: PointFeature[] = [],
): PointFeatureCollection => ({
  type: 'FeatureCollection',
  features,
});

export const createShapeFeatureCollection = (
  features: ShapeFeature[] = [],
): ShapeFeatureCollection => ({
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
  shapes: ShapeFeatureCollection = createShapeFeatureCollection();
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

  clearBioregions = () => {
    this.binner.cells.forEach((cell) => {
      cell.bioregionId = 0;
      cell.overlappingBioregions.clear();
    });
    this.speciesMap.forEach((species) => {
      species.bioregionId = undefined;
    });
  };

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

    const { mapStore } = this.rootStore;

    const dbfFile = files.find((file) => extension(file.name) === 'dbf');
    const shpStream = shpFile.stream() as unknown as ReadableStream;
    const dbfStream = dbfFile?.stream() as unknown as ReadableStream;

    const getNameKey = (properties: any): string => {
      const keys = Object.keys(properties ?? {});
      const keysToTest = ['binomial', 'species', 'name', 'id'];
      return keysToTest.find((key) => keys.includes(key)) ?? '';
    };

    try {
      const source = await shapefile.open(shpStream, dbfStream);
      console.log(`Loading shapefile with bbox '${source.bbox}'...`);

      let result = await source.read();
      while (!result.done) {
        console.log('Got shape:', result.value);
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
        this.shapes.features.push(shp as ShapeFeature);
        mapStore.renderShape(shp as ShapeFeature);

        result = await source.read();
      }
    } catch (error: any) {
      console.error('!! shp error:', error);
    }
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
