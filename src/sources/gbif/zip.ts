// Stream records out of a GBIF download zip (SIMPLE_CSV or DWCA) without loading the
// whole file: the Blob is read chunk by chunk, inflated with fflate and split into
// tab-separated lines. GBIF writes both formats unquoted, and fields never contain
// tabs or newlines.

import { Unzip, UnzipInflate, type UnzipFile } from 'fflate';
import { normalizeSpeciesName } from '../../utils/names';
import { abortError } from '../http';
import type { OccurrenceRecord, RecordBatch } from '../types';
import { NON_NATIVE_DEGREE_OF_ESTABLISHMENT, NON_NATIVE_ESTABLISHMENT_MEANS } from './predicate';

export type GbifZipFormat = 'SIMPLE_CSV' | 'DWCA';

export interface GbifZipSummary {
  /** From the SIMPLE_CSV entry name or the DWCA metadata. */
  downloadKey?: string;
  /** Data rows read (including skipped rows). */
  rows: number;
  /** Rows skipped because occurrenceStatus is ABSENT. */
  absent: number;
  /** Rows skipped by `excludeIntroduced`. */
  introduced: number;
  format: GbifZipFormat;
  /** "GBIF.org (…) GBIF Occurrence Download https://doi.org/…", when the zip says. */
  citation?: string;
  /** Bare DOI, e.g. "10.15468/dl.gpysnc". */
  doi?: string;
}

export interface GbifZipOptions {
  signal?: AbortSignal;
  /** Records per yielded batch (default 5000). */
  batchSize?: number;
  /** Skip rows whose establishmentMeans or degreeOfEstablishment says non-native. */
  excludeIntroduced?: boolean;
}

const KEY_PATTERN = /\d{7}-\d{15}/;
const DOI_PATTERN = /10\.15468\/dl\.[a-z0-9]+/i;
const CITATION_PATTERN = /GBIF\.org \([^)]+\) GBIF Occurrence Download \S+/;

/** The GBIF download key in a file or zip entry name, e.g. "0012345-241007104925546.zip". */
export function downloadKeyFromName(name: string): string | undefined {
  return name.match(KEY_PATTERN)?.[0];
}

const COLUMNS = [
  'species',
  'decimalLatitude',
  'decimalLongitude',
  'year',
  'datasetKey',
  'basisOfRecord',
  'coordinateUncertaintyInMeters',
  'occurrenceStatus',
  'establishmentMeans',
  'degreeOfEstablishment',
] as const;
type Column = (typeof COLUMNS)[number];
const REQUIRED: Column[] = ['species', 'decimalLatitude', 'decimalLongitude'];

const NON_NATIVE = new Set(
  [...NON_NATIVE_ESTABLISHMENT_MEANS, ...NON_NATIVE_DEGREE_OF_ESTABLISHMENT].map((v) =>
    v.toLowerCase(),
  ),
);

/** The occurrence table of a zip entry name, if it is one. */
function dataFormat(name: string): GbifZipFormat | null {
  if (name.includes('/')) {
    return null;
  }
  if (name === 'occurrence.txt') {
    return 'DWCA';
  }
  return name.toLowerCase().endsWith('.csv') ? 'SIMPLE_CSV' : null;
}

/** Calls `onLine` for every complete line of a streamed entry. */
function lineReader(onLine: (line: string) => void) {
  const decoder = new TextDecoder('utf-8');
  let carry = '';
  return (chunk: Uint8Array, final: boolean) => {
    carry += decoder.decode(chunk, { stream: !final });
    const lines = carry.split('\n');
    carry = final ? '' : (lines.pop() ?? '');
    for (const line of lines) {
      const trimmed = line.endsWith('\r') ? line.slice(0, -1) : line;
      if (trimmed) {
        onLine(trimmed);
      }
    }
  };
}

const num = (s: string | undefined): number | undefined => {
  if (!s) {
    return undefined;
  }
  const x = Number(s);
  return Number.isFinite(x) ? x : undefined;
};

/** Stream occurrence records from a GBIF download zip; returns a summary when done. */
export async function* importGbifZip(
  file: Blob,
  { signal, batchSize = 5000, excludeIntroduced = false }: GbifZipOptions = {},
): AsyncGenerator<RecordBatch, GbifZipSummary> {
  const pending: OccurrenceRecord[] = [];
  let failure: unknown = null;
  let format: GbifZipFormat | null = null;
  let downloadKey: string | undefined;
  let metadata = '';
  let citations = '';
  let index: Partial<Record<Column, number>> | null = null;
  let rows = 0;
  let absent = 0;
  let introduced = 0;
  let bytesRead = 0;

  const onRow = (line: string) => {
    const fields = line.split('\t');
    if (!index) {
      // Header; DWCA headers may be bare term names or full term URIs.
      const names = fields.map((f) => f.trim().replace(/^.*[/:#]/, ''));
      index = Object.fromEntries(
        COLUMNS.filter((c) => names.includes(c)).map((c) => [c, names.indexOf(c)]),
      );
      const missing = REQUIRED.filter((c) => index?.[c] == null);
      if (missing.length > 0) {
        throw new Error(`Not a GBIF occurrence table: missing ${missing.join(', ')}`);
      }
      return;
    }
    rows++;
    const get = (c: Column) => {
      const i = index?.[c];
      return i == null ? undefined : fields[i];
    };
    if (get('occurrenceStatus')?.toUpperCase() === 'ABSENT') {
      absent++;
      return;
    }
    if (
      excludeIntroduced &&
      [get('establishmentMeans'), get('degreeOfEstablishment')].some(
        (v) => v && NON_NATIVE.has(v.toLowerCase()),
      )
    ) {
      introduced++;
      return;
    }
    const year = num(get('year'));
    const uncertainty = num(get('coordinateUncertaintyInMeters'));
    const datasetKey = get('datasetKey');
    const basisOfRecord = get('basisOfRecord');
    pending.push({
      name: normalizeSpeciesName(get('species')?.trim() ?? ''),
      lon: num(get('decimalLongitude')) ?? Number.NaN,
      lat: num(get('decimalLatitude')) ?? Number.NaN,
      ...(year != null && { year: Math.trunc(year) }),
      source: 'gbif',
      ...(datasetKey && { datasetKey }),
      ...(basisOfRecord && { basisOfRecord }),
      ...(uncertainty != null && { uncertainty }),
    });
  };

  const readText = (entry: UnzipFile, append: (text: string) => void) => {
    const decoder = new TextDecoder('utf-8');
    entry.ondata = (error, chunk, final) => {
      if (error) {
        failure ??= error;
        return;
      }
      append(decoder.decode(chunk, { stream: !final }));
    };
    entry.start();
  };

  const unzip = new Unzip((entry) => {
    const entryFormat = dataFormat(entry.name);
    if (entryFormat && !format) {
      format = entryFormat;
      downloadKey ??= entry.name.match(KEY_PATTERN)?.[0];
      const read = lineReader(onRow);
      entry.ondata = (error, chunk, final) => {
        if (failure) {
          return;
        }
        if (error) {
          failure = error;
          return;
        }
        try {
          read(chunk, final);
        } catch (e) {
          failure = e;
        }
      };
      entry.start();
    } else if (entry.name === 'metadata.xml') {
      readText(entry, (text) => {
        metadata += text;
      });
    } else if (entry.name === 'citations.txt') {
      readText(entry, (text) => {
        citations += text;
      });
    }
    // Other entries are skipped without inflating them.
  });
  unzip.register(UnzipInflate);

  const progress = () => ({
    fetched: rows,
    // Extrapolated from the compressed bytes read so far.
    expected: bytesRead > 0 ? Math.max(rows, Math.round((rows * file.size) / bytesRead)) : 0,
    requestsDone: 0,
    requestsTotal: 0,
    bytes: bytesRead,
  });

  const reader = file.stream().getReader();
  try {
    while (true) {
      if (signal?.aborted) {
        throw abortError();
      }
      const { done, value } = await reader.read();
      bytesRead += value?.length ?? 0;
      unzip.push(value ?? new Uint8Array(0), done);
      if (failure) {
        throw failure;
      }
      while (pending.length >= batchSize) {
        yield { source: 'gbif', records: pending.splice(0, batchSize), progress: progress() };
      }
      if (done) {
        break;
      }
    }
    if (pending.length > 0) {
      yield { source: 'gbif', records: pending.splice(0), progress: progress() };
    }
  } finally {
    reader.cancel().catch(() => {});
  }

  if (!format) {
    throw new Error('No GBIF occurrence table (<key>.csv or occurrence.txt) found in this zip');
  }
  downloadKey ??= metadata.match(KEY_PATTERN)?.[0] ?? citations.match(KEY_PATTERN)?.[0];
  const doi = (citations.match(DOI_PATTERN) ?? metadata.match(DOI_PATTERN))?.[0];
  const citation =
    citations.match(CITATION_PATTERN)?.[0] ??
    (doi ? `GBIF.org GBIF Occurrence Download https://doi.org/${doi}` : undefined);
  return {
    ...(downloadKey && { downloadKey }),
    rows,
    absent,
    introduced,
    format,
    ...(citation && { citation }),
    ...(doi && { doi }),
  };
}
