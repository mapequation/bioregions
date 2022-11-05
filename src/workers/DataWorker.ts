import { expose } from 'threads/worker';
import { Observable, Subject } from 'threads/observable';
import { ParseResult } from 'papaparse';
import { loadFile, ParseAsyncConfig } from '../utils/loader';
import { extension } from '../utils/filename';
import jszip from 'jszip';
import * as shapefile from 'shapefile';
import * as turf from '@turf/turf';
import type {
  PointFeature,
  PolygonFeature,
  GeometryFeature,
} from '../store/SpeciesStore';
import { normalizeSpeciesName } from '../utils/names';

let dataStream = new Subject();

function load(
  file: string | File,
  args: Omit<ParseAsyncConfig<any, File | string>, 'complete'> = {},
) {
  console.log('Loading...');

  return new Promise<string>((resolve) => {
    loadFile(file, {
      complete() {
        dataStream.complete();
        dataStream = new Subject();
        resolve('Loading finished');
      },
      chunk(chunk: ParseResult<any>) {
        dataStream.next(chunk.data);
      },
      // chunkSize: 1024 * 100,
      ...args,
    });
  });
}

async function loadShapefile(file: string | File | File[], nameKey?: string) {
  console.log('Load shapefile:', file);
  if (Array.isArray(file)) {
    return await loadShapefiles(file, nameKey);
  }

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
  const extensions = ['shp', 'dbf'];
  const files: File[] = [];

  const zipFile = await jszip.loadAsync(file);
  for (const [name, compressedFile] of Object.entries(zipFile.files)) {
    const ext = extension(name);
    if (!extensions.includes(ext)) {
      continue;
    }

    const uncompressedFile = await compressedFile.async('blob');
    const file = new File([uncompressedFile], name);
    console.log(name, file);
    files.push(file);
  }

  return await loadShapefiles(files, nameKey);
}

async function loadShapefiles(files: File[], nameKey?: string) {
  const shpFile = files.find((file) => extension(file.name) === 'shp');
  if (!shpFile) {
    throw new Error('Error loading shapefile: No .shp file provided');
  }

  const dbfFile = files.find((file) => extension(file.name) === 'dbf');
  const shpStream = shpFile.stream() as unknown as ReadableStream;
  const dbfStream = dbfFile?.stream() as unknown as ReadableStream;

  const getNameKey = (() => {
    const keysToTest = ['binomial', 'species', 'name', 'id'] as const;
    let nameKey: string | undefined;
    return (properties: any) => {
      if (nameKey != null) return nameKey;
      const keys = Object.keys(properties ?? {});
      nameKey = keysToTest.find((key) => keys.includes(key));
      return nameKey;
    };
  })();

  try {
    const source = await shapefile.open(shpStream, dbfStream);
    console.log(`Loading shapefile with bbox '${source.bbox}'...`);

    let result = await source.read();

    const addFeature = (() => {
      let batch: GeometryFeature[] = [];
      return (feature: GeometryFeature) => {
        batch.push(feature);
        if (batch.length > 100) {
          dataStream.next(batch);
          batch = [];
        }
      };
    })();

    while (!result.done) {
      const shp = result.value;

      if (nameKey == null) {
        nameKey = getNameKey(shp.properties);
      }

      if (!shp.properties || !nameKey) {
        throw new Error(
          `Can't deduce name key in shapefile from properties: ${JSON.stringify(
            shp.properties,
          )}`,
        );
      }

      Object.assign(shp.properties, {
        name: normalizeSpeciesName(shp.properties[nameKey]),
      });

      if (shp.geometry.type === 'MultiPolygon') {
        shp.geometry.coordinates.forEach((coords) =>
          addFeature(turf.polygon(coords, shp.properties) as PolygonFeature),
        );
      } else if (shp.geometry.type === 'MultiPoint') {
        shp.geometry.coordinates.forEach((coords) =>
          addFeature(turf.point(coords, shp.properties) as PointFeature),
        );
      } else if (
        shp.geometry.type === 'Polygon' ||
        shp.geometry.type === 'Point'
      ) {
        addFeature(shp as GeometryFeature);
      } else {
        throw new Error(`Unsupported geometry: '${shp.geometry.type}'`);
      }

      result = await source.read();
    }
  } catch (error: any) {
    console.error('!! shp error:', error);
  }

  dataStream.complete();
  dataStream = new Subject();
}

async function cancelLoad() {
  // TODO: Create and store an abort function for all load functions
}

expose({
  load,
  loadShapefile,
  stream() {
    return Observable.from(dataStream);
  },
  cancelLoad,
});
