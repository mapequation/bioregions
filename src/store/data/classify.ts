// Sorts dropped files into an upload plan: one occurrence input (points, a shapefile or
// a GBIF download) and one tree. Pure apart from `inspectFiles`, which lists zip entries.
import { listZipEntries } from '../../utils/zipEntries';

export interface FileInfo {
  name: string;
  size: number;
  /** Entry names from `listZipEntries`; undefined for a zip that could not be read. */
  zipEntries?: string[];
}

export type UploadItem =
  | { kind: 'points'; format: 'csv' | 'tsv'; file: number } // index into files
  | { kind: 'shapefile'; files: number[] } // loose .shp + .dbf (+ .shx/.prj)
  | { kind: 'shapefile-zip'; file: number }
  | { kind: 'gbif-zip'; file: number; format: 'DWCA' | 'SIMPLE_CSV'; downloadKey?: string }
  | { kind: 'tree'; file: number };

export interface UploadPlan {
  occurrences: UploadItem | null;
  tree: UploadItem | null;
  ignored: { name: string; reason: string }[];
  errors: string[];
}

/** Accept list for the file input. */
export const UPLOAD_ACCEPT = '.csv,.tsv,.zip,.shp,.shx,.dbf,.prj,.nwk,.tre,.tree';

const TREE_EXTENSIONS = new Set(['nwk', 'tre', 'tree']);
const SHAPEFILE_PARTS = new Set(['shp', 'dbf', 'shx', 'prj']);
/** A GBIF download key, e.g. 0012345-241007104925546. */
const DOWNLOAD_KEY = /^(\d{7}-\d{15})$/;

export const UPLOAD_COPY = {
  noFiles: 'No files',
  noShp: 'A shapefile needs its .shp file (and the .dbf for species names)',
  noDbf: 'Add the .dbf file: species names are read from it',
  manyShapefiles: (n: number) => `This zip holds ${n} shapefiles; load one at a time`,
  notGbif:
    'This zip has no shapefile and is not a GBIF download (no occurrence.txt or <download key>.csv at its root)',
  unreadableZip: (name: string) => `${name}: could not read the zip file`,
  unsupported: (name: string, ext: string) =>
    `${name}: unsupported file type ${ext ? `.${ext}` : '(no extension)'} (see the supported formats)`,
  manyOccurrences: (names: string[]) => `Drop one occurrence file at a time (found ${names.join(', ')})`,
  manyTrees: 'Drop one tree at a time',
} as const;

function extension(name: string): string {
  const base = name.slice(name.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

function stem(name: string): string {
  const base = name.slice(name.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

/** Zip entries that are real files, not macOS resource forks. */
const realEntries = (entries: string[]) => entries.filter((e) => !e.startsWith('__MACOSX/') && !e.endsWith('/'));

/** Classifies one zip: a shapefile, a GBIF download, or an error message. */
function classifyZip(file: FileInfo, index: number): UploadItem | string {
  if (!file.zipEntries) {
    return UPLOAD_COPY.unreadableZip(file.name);
  }
  const entries = realEntries(file.zipEntries);
  const shp = entries.filter((e) => extension(e) === 'shp');
  if (shp.length === 1) {
    return { kind: 'shapefile-zip', file: index };
  }
  if (shp.length > 1) {
    return UPLOAD_COPY.manyShapefiles(shp.length);
  }
  if (entries.includes('occurrence.txt')) {
    const key = DOWNLOAD_KEY.exec(stem(file.name))?.[1];
    return { kind: 'gbif-zip', file: index, format: 'DWCA', ...(key ? { downloadKey: key } : {}) };
  }
  for (const entry of entries) {
    if (!entry.includes('/') && extension(entry) === 'csv') {
      const key = DOWNLOAD_KEY.exec(stem(entry))?.[1];
      if (key) {
        return { kind: 'gbif-zip', file: index, format: 'SIMPLE_CSV', downloadKey: key };
      }
    }
  }
  return UPLOAD_COPY.notGbif;
}

/**
 * The upload plan for a set of dropped files (extensions are case-insensitive). The
 * classifier is stricter than the GBIF zip reader: a zip counts as a GBIF download only
 * with `occurrence.txt` or `<download key>.csv` at its root.
 */
export function classifyFiles(files: FileInfo[]): UploadPlan {
  const plan: UploadPlan = { occurrences: null, tree: null, ignored: [], errors: [] };
  if (files.length === 0) {
    plan.errors.push(UPLOAD_COPY.noFiles);
    return plan;
  }

  const occurrences: { item: UploadItem; name: string }[] = [];
  const trees: UploadItem[] = [];
  const shapeParts: number[] = [];

  files.forEach((file, index) => {
    const ext = extension(file.name);
    if (ext === 'csv' || ext === 'tsv') {
      occurrences.push({ item: { kind: 'points', format: ext, file: index }, name: file.name });
    } else if (TREE_EXTENSIONS.has(ext)) {
      trees.push({ kind: 'tree', file: index });
    } else if (SHAPEFILE_PARTS.has(ext)) {
      shapeParts.push(index);
    } else if (ext === 'zip') {
      const result = classifyZip(file, index);
      if (typeof result === 'string') {
        plan.errors.push(result);
      } else {
        occurrences.push({ item: result, name: file.name });
      }
    } else {
      plan.ignored.push({ name: file.name, reason: UPLOAD_COPY.unsupported(file.name, ext) });
    }
  });

  if (shapeParts.length > 0) {
    const shp = shapeParts.filter((i) => extension(files[i].name) === 'shp');
    const dbf = shapeParts.filter((i) => extension(files[i].name) === 'dbf');
    if (shp.length === 0) {
      plan.errors.push(UPLOAD_COPY.noShp);
    } else if (dbf.length === 0) {
      plan.errors.push(UPLOAD_COPY.noDbf);
    } else {
      for (const i of shp) {
        occurrences.push({ item: { kind: 'shapefile', files: shapeParts }, name: files[i].name });
      }
    }
  }

  if (occurrences.length > 1) {
    plan.errors.push(UPLOAD_COPY.manyOccurrences(occurrences.map((o) => o.name)));
  } else if (occurrences.length === 1) {
    plan.occurrences = occurrences[0].item;
  }

  if (trees.length > 1) {
    plan.errors.push(UPLOAD_COPY.manyTrees);
  } else if (trees.length === 1) {
    plan.tree = trees[0];
  }

  return plan;
}

/** File metadata for `classifyFiles`, listing the entries of every zip (never inflated). */
export async function inspectFiles(files: File[]): Promise<FileInfo[]> {
  return Promise.all(
    files.map(async (file) => {
      const info: FileInfo = { name: file.name, size: file.size };
      if (extension(file.name) === 'zip') {
        try {
          info.zipEntries = await listZipEntries(file);
        } catch {
          // Left undefined: classifyFiles reports the zip as unreadable.
        }
      }
      return info;
    }),
  );
}
