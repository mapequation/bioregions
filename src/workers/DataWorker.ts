// import { expose } from 'threads/worker';
// import { Observable, Subject } from 'threads/observable';
import type { ParseResult } from 'papaparse';
import { loadFile, type ParseAsyncConfig } from '../utils/loader';
import { extension } from '../utils/filename';
import jszip from 'jszip';
import * as shapefile from 'shapefile';
import type { GeometryFeature } from '../store/SpeciesStore';
import { parseGeoJsonRanges, rangeFeatureSplitter } from './rangeFeatures';

// let dataStream = new Subject();

async function load(
  file: string | File,
  args: Omit<ParseAsyncConfig<unknown, File | string>, 'complete'> = {},
) {
  console.log('Loading...');

  return new Promise<string>((resolve, reject) => {
    loadFile(file, {
      error(error: Error) {
        reject(error);
      },
      complete() {
        // dataStream.complete();
        // dataStream = new Subject();
        postMessage({ type: "status", status: "complete" });
        resolve('Loading finished');
      },
      chunk(chunk: ParseResult<unknown>) {
        // dataStream.next(chunk.data);
        chunk.errors.forEach(e => {
          console.log(e)
        })
        postMessage({ type: "data", data: chunk.data });
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

  // A GeoJSON file takes the shapefile route: same features, same source and methods text.
  const name = typeof file === 'string' ? file : file.name;
  if (['geojson', 'json'].includes(extension(name).toLowerCase())) {
    return await loadGeoJson(file, nameKey);
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

  // Browsers report zips as 'application/zip', 'application/x-zip-compressed' or ''.
  if (extension(file.name).toLowerCase() !== 'zip' && file.type !== 'application/zip') {
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

async function loadGeoJson(file: string | File, nameKey?: string) {
  const text = typeof file === 'string' ? await fetch(file).then((res) => res.text()) : await file.text();
  const name = typeof file === 'string' ? file : file.name;
  const features = parseGeoJsonRanges(text, name, nameKey);
  for (let i = 0; i < features.length; i += 100) {
    postMessage({ type: "data", data: features.slice(i, i + 100) });
  }
  postMessage({ type: "status", status: "complete" });
}

async function loadShapefiles(files: File[], nameKey?: string) {
  const shpFile = files.find((file) => extension(file.name) === 'shp');
  if (!shpFile) {
    throw new Error('Error loading shapefile: No .shp file provided');
  }

  const dbfFile = files.find((file) => extension(file.name) === 'dbf');
  const shpStream = shpFile.stream() as unknown as ReadableStream;
  const dbfStream = dbfFile?.stream() as unknown as ReadableStream;

  const split = rangeFeatureSplitter('shapefile', nameKey);

  {
    const source = await shapefile.open(shpStream, dbfStream);
    console.log(`Loading shapefile with bbox '${source.bbox}'...`);

    let result = await source.read();

    let batch: GeometryFeature[] = [];
    const flush = () => {
      if (batch.length > 0) {
        postMessage({ type: "data", data: batch });
        batch = [];
      }
    };

    while (!result.done) {
      batch.push(...split(result.value));
      if (batch.length > 100) {
        flush();
      }

      result = await source.read();
    }
    // The last partial batch.
    flush();
  }

  // dataStream.complete();
  // dataStream = new Subject();
  postMessage({ type: "status", status: "complete" });

}

// async function cancelLoad() {
//   // TODO: Create and store an abort function for all load functions
// }

// expose({
//   load,
//   loadShapefile,
//   stream() {
// return Observable.from(dataStream);
//   },
//   cancelLoad,
// });


/** Every failure ends the load with an error status, which SpeciesStore turns into a rejection. */
function postError(error: unknown) {
  console.error("[DataWorker]: Error:", error);
  const message = error instanceof Error ? error.message : String(error);
  postMessage({ type: "status", status: "error", message });
}

self.onmessage = (event) => {
  const { type } = event.data;
  console.log("[DataWorker]: got message of type:", type);
  try {
    switch (type) {
      case "LOAD":
        load(event.data.file, event.data.args).catch(postError);
        break;
      case "LOAD_SHAPEFILE":
        loadShapefile(event.data.file, event.data.nameKey).catch(postError);
        break;
      default:
        postError(new Error(`Unrecognised message type: ${type}`));
    }
  } catch (err) {
    postError(err);
  }
};
