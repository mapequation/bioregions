// The exported `query.json`: the query itself plus what a scripted pipeline needs to
// reproduce the load (the exact source requests, the citing GBIF download, the app
// version). The query fields stay at the top level, so the file imports unchanged.
// Format: docs/query-json.md.
import { supportsGbif } from '../../sources/gbif';
import { type DownloadPredicate, gbifDownloadPredicate } from '../../sources/gbif/predicate';
import { obisParams, supportsObis } from '../../sources/obis/params';
import type { OccurrenceQuery, SourceId } from '../../sources/types';
import type { GbifDownload } from './types';

export const APP_NAME = 'infomap-bioregions';

/** The requests a load sends, per source. */
export interface QueryRequests {
  /** Predicate for GBIF's `POST /v1/occurrence/download/request`. */
  gbif?: DownloadPredicate;
  /** Query parameters for OBIS `GET /v3/occurrence`, without paging keys. */
  obis?: Record<string, string>;
}

export interface QueryExport extends OccurrenceQuery {
  requests: QueryRequests;
  gbifDownload?: { key?: string; doi?: string };
  app: { name: typeof APP_NAME; version: string };
}

/** OBIS paging keys, left out of the exported parameters. */
const OBIS_PAGING = ['size', 'after', 'skip'];

/** OBIS parameters (a query string, `URLSearchParams` or flat object) as a flat object of strings. */
export function obisParamsObject(params: unknown): Record<string, string> | undefined {
  let entries: [string, string][];
  if (typeof params === 'string') entries = [...new URLSearchParams(params)];
  else if (params instanceof URLSearchParams) entries = [...params];
  else if (params !== null && typeof params === 'object' && !Array.isArray(params)) {
    entries = Object.entries(params).map(([k, v]) => [k, String(v)]);
  } else return undefined;
  return Object.fromEntries(entries.filter(([k]) => !OBIS_PAGING.includes(k)));
}

/**
 * The requests a load of `query` would send. OBIS is left out while a query taxon has no
 * AphiaID (it is resolved through WoRMS only when the load is planned).
 */
export function queryRequests(query: OccurrenceQuery): QueryRequests {
  const out: QueryRequests = {};
  if (query.sources.gbif && supportsGbif(query).ok) out.gbif = gbifDownloadPredicate(query);
  if (query.sources.obis && supportsObis(query).ok && query.taxa.every((t) => t.obisId != null)) {
    out.obis = obisParamsObject(obisParams(query));
  }
  return out;
}

/** The requests a finished load recorded (`LoadProvenance.requests`), in export shape. */
export function loadRequests(requests: Partial<Record<SourceId, unknown>>): QueryRequests {
  const out: QueryRequests = {};
  const gbif = requests.gbif;
  if (gbif !== null && typeof gbif === 'object') out.gbif = gbif as DownloadPredicate;
  const obis = requests.obis != null ? obisParamsObject(requests.obis) : undefined;
  if (obis) out.obis = obis;
  return out;
}

export interface QueryExportOptions {
  /** Requests recorded by the load this export describes; computed from the query when absent. */
  requests?: Partial<Record<SourceId, unknown>>;
  download?: Partial<Pick<GbifDownload, 'key' | 'doi'>> | null;
  version?: string;
}

// Injected by Vite (`define`); declared here too for the headless harness project.
declare const __APP_VERSION__: string | undefined;

/** The app version (package.json), injected by Vite. */
export const appVersion = (): string => (typeof __APP_VERSION__ === 'string' && __APP_VERSION__) || 'unknown';

export function buildQueryExport(query: OccurrenceQuery, opts: QueryExportOptions = {}): QueryExport {
  const out: QueryExport = {
    ...query,
    requests: opts.requests ? loadRequests(opts.requests) : queryRequests(query),
    app: { name: APP_NAME, version: opts.version ?? appVersion() },
  };
  const dl: { key?: string; doi?: string } = {};
  if (opts.download?.key) dl.key = opts.download.key;
  if (opts.download?.doi) dl.doi = opts.download.doi;
  if (dl.key || dl.doi) out.gbifDownload = dl;
  return out;
}
