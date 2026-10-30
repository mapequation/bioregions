// Citable GBIF downloads: request one with the user's GBIF account, poll its status,
// and format the citation. The zip itself has no CORS, so the user downloads it in
// the browser and drops it back into the app (see zip.ts).

import { delay, fetchJson, fetchText, HttpError } from '../http';
import type { OccurrenceQuery } from '../types';
import { GBIF_API_URL } from './graphql';
import { gbifDownloadPredicate } from './predicate';

export const GBIF_DOWNLOAD_REQUEST_URL = `${GBIF_API_URL}/occurrence/download/request`;

export type GbifDownloadState =
  | 'PREPARING'
  | 'RUNNING'
  | 'SUSPENDED'
  | 'SUCCEEDED'
  | 'CANCELLED'
  | 'KILLED'
  | 'FAILED'
  | 'FILE_ERASED';

/** States after which the download no longer changes. */
export const TERMINAL_DOWNLOAD_STATES: ReadonlySet<string> = new Set([
  'SUCCEEDED',
  'CANCELLED',
  'KILLED',
  'FAILED',
  'FILE_ERASED',
]);

export interface GbifDownloadStatus {
  key: string;
  status: GbifDownloadState | string;
  /** Bare DOI, e.g. "10.15468/dl.gpysnc". */
  doi?: string;
  totalRecords?: number;
  /** Zip size in bytes. */
  size?: number;
  downloadLink?: string;
  numberDatasets?: number;
  license?: string;
  created?: string;
  modified?: string;
  eraseAfter?: string;
  /** The request as GBIF stored it (download API predicate dialect). */
  request?: { predicate?: unknown; format?: string; creator?: string };
}

export interface GbifDownloadRequest {
  username: string;
  password: string;
  /** Notification address; GBIF emails when the download is ready. */
  email?: string;
  query: OccurrenceQuery;
}

/** User-facing error for a failed download request. */
export class GbifDownloadError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'GbifDownloadError';
    this.status = status;
  }
}

/** Base64 of a UTF-8 string (`btoa` alone rejects characters above U+00FF). */
export function base64Utf8(text: string): string {
  let binary = '';
  for (const byte of new TextEncoder().encode(text)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/** JSON body of `POST /occurrence/download/request`. */
export function gbifDownloadBody({ username, email, query }: Omit<GbifDownloadRequest, 'password'>) {
  return {
    creator: username,
    notificationAddresses: email ? [email] : [],
    sendNotification: !!email,
    format: 'SIMPLE_CSV',
    predicate: gbifDownloadPredicate(query),
  };
}

function downloadErrorMessage(error: HttpError): string {
  switch (error.status) {
    case 401:
    case 403:
      return 'GBIF rejected the login: wrong username or password.';
    case 409:
    case 420:
    case 429:
      return 'Too many downloads are running for this GBIF account (GBIF allows only a few at a time). Wait for one to finish and try again.';
    case 400:
      return `GBIF could not run this query${error.body ? `: ${error.body.slice(0, 300)}` : '.'}`;
    default:
      return `GBIF download request failed (HTTP ${error.status}).`;
  }
}

/**
 * Request a SIMPLE_CSV download for the query; resolves to the download key.
 * Credentials are sent only to api.gbif.org.
 */
export async function requestGbifDownload(
  request: GbifDownloadRequest,
  signal?: AbortSignal,
): Promise<string> {
  try {
    const key = await fetchText(GBIF_DOWNLOAD_REQUEST_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${base64Utf8(`${request.username}:${request.password}`)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(gbifDownloadBody(request)),
      signal,
      // Never repeat a POST that may already have started a download.
      retries: 0,
      timeoutMs: 60_000,
    });
    return key.trim();
  } catch (error) {
    if (error instanceof HttpError) {
      throw new GbifDownloadError(downloadErrorMessage(error), error.status);
    }
    throw error;
  }
}

/** Current status of a download. */
export async function getGbifDownload(key: string, signal?: AbortSignal): Promise<GbifDownloadStatus> {
  return fetchJson<GbifDownloadStatus>(
    `${GBIF_API_URL}/occurrence/download/${encodeURIComponent(key)}`,
    { signal },
  );
}

/** Poll until the download reaches a terminal state; `onUpdate` sees every status. */
export async function pollGbifDownload(
  key: string,
  {
    onUpdate,
    signal,
    intervalMs = 10_000,
  }: { onUpdate?: (status: GbifDownloadStatus) => void; signal?: AbortSignal; intervalMs?: number } = {},
): Promise<GbifDownloadStatus> {
  while (true) {
    const status = await getGbifDownload(key, signal);
    onUpdate?.(status);
    if (TERMINAL_DOWNLOAD_STATES.has(status.status)) {
      return status;
    }
    await delay(intervalMs, signal);
  }
}

/** "30 October 2026" in UTC. */
function citationDate(iso: string | undefined): string {
  const date = iso ? new Date(iso) : new Date();
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(Number.isNaN(date.getTime()) ? new Date() : date);
}

/** GBIF's recommended citation, e.g. "GBIF.org (30 October 2026) GBIF Occurrence Download https://doi.org/10.15468/dl.gpysnc". */
export function gbifDownloadCitation(status: Pick<GbifDownloadStatus, 'doi' | 'created' | 'key'>): string {
  const ref = status.doi ? `https://doi.org/${status.doi.replace(/^https?:\/\/doi\.org\//, '')}` : status.key;
  return `GBIF.org (${citationDate(status.created)}) GBIF Occurrence Download ${ref}`;
}

// --- What a download contains -----------------------------------------------------

/**
 * The parts of a download predicate that decide which records it holds: taxa, area
 * (geometry or countries) and years. Order-independent, so two predicates built in
 * different orders (or by gbif.org) compare equal.
 */
export interface DownloadScope {
  /** TAXON_KEY values, sorted. */
  taxonKeys: string[];
  /** Each `within` geometry as its sorted, de-duplicated vertices ("lon lat", 4 decimals). */
  geometries: string[][];
  /** COUNTRY codes, upper case, sorted. */
  countries: string[];
  /** Inclusive year range; null ends are open. [null, null] without a year filter. */
  years: [number | null, number | null];
}

type Pred = Record<string, unknown>;

const isPred = (v: unknown): v is Pred => typeof v === 'object' && v !== null && !Array.isArray(v);

function predValues(p: Pred): string[] {
  if (p.type === 'equals' && p.value != null) return [String(p.value)];
  if (p.type === 'in' && Array.isArray(p.values)) return p.values.map(String);
  return [];
}

function predKey(p: Pred): string | null {
  return typeof p.key === 'string' ? p.key.toUpperCase() : null;
}

/** Vertices of a WKT geometry, rounded and sorted, so ring order and closing points do not matter. */
export function wktVertices(wkt: string): string[] {
  const nums = wkt.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/gi) ?? [];
  const out = new Set<string>();
  for (let i = 0; i + 1 < nums.length; i += 2) {
    out.add(`${Number(nums[i]).toFixed(4)} ${Number(nums[i + 1]).toFixed(4)}`);
  }
  return [...out].sort();
}

function yearValue(v: string): number | null {
  const n = Number(v.trim());
  return v.trim() === '*' || v.trim() === '' || !Number.isFinite(n) ? null : n;
}

/** Taxa, area and years of a download-API predicate (GBIF's own or `gbifDownloadPredicate`). */
export function downloadScope(predicate: unknown): DownloadScope {
  const taxa = new Set<string>();
  const countries = new Set<string>();
  const geometries: string[][] = [];
  let lo: number | null = null;
  let hi: number | null = null;
  const raiseLo = (n: number | null) => {
    if (n != null) lo = lo == null ? n : Math.max(lo, n);
  };
  const lowerHi = (n: number | null) => {
    if (n != null) hi = hi == null ? n : Math.min(hi, n);
  };
  const visit = (p: unknown) => {
    if (!isPred(p)) return;
    const type = p.type;
    if (type === 'and' && Array.isArray(p.predicates)) {
      for (const c of p.predicates) visit(c);
      return;
    }
    if (type === 'or' && Array.isArray(p.predicates)) {
      // An OR of taxon clauses is a taxon list (gbif.org writes them this way).
      const children = p.predicates.filter(isPred);
      if (children.length > 0 && children.every((c) => predKey(c) === 'TAXON_KEY')) {
        for (const c of children) for (const v of predValues(c)) taxa.add(v);
      }
      return;
    }
    if (type === 'within' && typeof p.geometry === 'string') {
      geometries.push(wktVertices(p.geometry));
      return;
    }
    const key = predKey(p);
    if (key === 'TAXON_KEY') for (const v of predValues(p)) taxa.add(v);
    else if (key === 'COUNTRY') for (const v of predValues(p)) countries.add(v.toUpperCase());
    else if (key === 'GEOMETRY') for (const v of predValues(p)) geometries.push(wktVertices(v));
    else if (key === 'YEAR' && typeof p.value === 'string') {
      const v = p.value;
      if (type === 'equals') {
        const [a, b = a] = v.split(',');
        raiseLo(yearValue(a));
        lowerHi(yearValue(b));
      } else if (type === 'greaterThanOrEquals') raiseLo(yearValue(v));
      else if (type === 'greaterThan') raiseLo((yearValue(v) ?? Number.NaN) + 1 || null);
      else if (type === 'lessThanOrEquals') lowerHi(yearValue(v));
      else if (type === 'lessThan') lowerHi((yearValue(v) ?? Number.NaN) - 1 || null);
    }
  };
  visit(predicate);
  return {
    taxonKeys: [...taxa].sort(),
    geometries: geometries.sort((a, b) => (a.join() < b.join() ? -1 : 1)),
    countries: [...countries].sort(),
    years: [lo, hi],
  };
}

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Which of taxa, area and years differ between two scopes (empty: same records asked for). */
export function scopeDifferences(a: DownloadScope, b: DownloadScope): ('taxa' | 'area' | 'years')[] {
  const out: ('taxa' | 'area' | 'years')[] = [];
  if (!sameList(a.taxonKeys, b.taxonKeys)) out.push('taxa');
  const sameGeometry =
    a.geometries.length === b.geometries.length && a.geometries.every((g, i) => sameList(g, b.geometries[i]));
  if (!sameGeometry || !sameList(a.countries, b.countries)) out.push('area');
  if (a.years[0] !== b.years[0] || a.years[1] !== b.years[1]) out.push('years');
  return out;
}

function geometryText(vertices: string[]): string {
  const pts = vertices.map((v) => v.split(' ').map(Number));
  if (pts.length === 0) return 'a drawn area';
  const lons = pts.map((p) => p[0]);
  const lats = pts.map((p) => p[1]);
  const r = (n: number) => String(Math.round(n));
  return `lon ${r(Math.min(...lons))} to ${r(Math.max(...lons))}, lat ${r(Math.min(...lats))} to ${r(Math.max(...lats))}`;
}

/**
 * A scope in words, e.g. "Callitrichidae · lon -118 to -34, lat -56 to 33 · 1970–2025".
 * `names` maps taxon keys to names (keys without one read "GBIF taxon 123").
 */
export function describeDownloadScope(scope: DownloadScope, names: ReadonlyMap<string, string> = new Map()): string {
  const taxa = scope.taxonKeys.map((k) => names.get(k) ?? `GBIF taxon ${k}`);
  const taxaText =
    taxa.length === 0 ? 'All taxa' : taxa.length <= 3 ? taxa.join(', ') : `${taxa.slice(0, 2).join(', ')} and ${taxa.length - 2} more`;
  const area = [
    ...scope.geometries.map(geometryText),
    ...(scope.countries.length > 0 ? [`countries ${scope.countries.join(', ')}`] : []),
  ];
  const [lo, hi] = scope.years;
  const years =
    lo == null && hi == null ? 'all years' : lo == null ? `up to ${hi}` : hi == null ? `${lo} onwards` : lo === hi ? `${lo}` : `${lo}–${hi}`;
  return [taxaText, area.length > 0 ? area.join('; ') : 'worldwide', years].join(' · ');
}

/** Scientific names of GBIF taxon keys (best effort: keys that fail are left out). */
export async function gbifTaxonNames(keys: string[], signal?: AbortSignal): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const results = await Promise.allSettled(
    keys.map((k) =>
      fetchJson<{ canonicalName?: string; scientificName?: string }>(`${GBIF_API_URL}/species/${encodeURIComponent(k)}`, {
        signal,
        retries: 0,
        timeoutMs: 10_000,
      }),
    ),
  );
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      const name = r.value.canonicalName ?? r.value.scientificName;
      if (name) out.set(keys[i], name);
    }
  });
  return out;
}
