// Shared contract for online occurrence sources (GBIF, OBIS) and the data explorer.
// The explorer edits one source-agnostic `OccurrenceQuery`; each source adapter
// translates it (GBIF: download-predicate JSON, OBIS: query params).

export type SourceId = 'gbif' | 'obis';
export type RecordSource = SourceId | 'file';

export interface TaxonRef {
  /** Canonical scientific name without authorship, e.g. "Felidae". */
  name: string;
  /** Upper-case rank, e.g. 'FAMILY', 'SPECIES'. */
  rank: string;
  /** GBIF backbone usage key (the `taxonKey` predicate). */
  gbifKey?: number;
  /** WoRMS AphiaID used by OBIS (`taxonid`). */
  obisId?: number;
  vernacularName?: string;
  /** Higher classification for display, e.g. "Animalia › Chordata › Mammalia". */
  path?: string;
}

export type BBox = [west: number, south: number, east: number, north: number];

export type AreaFilter =
  | { kind: 'world' }
  | { kind: 'bbox'; bbox: BBox; label?: string }
  /** ISO 3166-1 alpha-2 codes. */
  | { kind: 'countries'; codes: string[] }
  /** Counter-clockwise WKT POLYGON / MULTIPOLYGON in lon/lat. */
  | { kind: 'wkt'; wkt: string; label?: string };

export type BasisOfRecord =
  | 'PRESERVED_SPECIMEN'
  | 'HUMAN_OBSERVATION'
  | 'MACHINE_OBSERVATION'
  | 'OCCURRENCE'
  | 'MATERIAL_SAMPLE'
  | 'MATERIAL_CITATION'
  | 'OBSERVATION'
  | 'LIVING_SPECIMEN'
  | 'FOSSIL_SPECIMEN';

/**
 * Client-side thinning applied while streaming, across all sources:
 * - `none`: keep every record.
 * - `exact`: one record per species and coordinate rounded to 4 decimals (~11 m).
 * - `cell`: one record per species and 0.01° cell (~1 km).
 */
export type DedupeMode = 'none' | 'exact' | 'cell';

export interface QualityFilters {
  /** Allowed basis of record values. Empty means all. */
  basisOfRecord: BasisOfRecord[];
  /** Maximum coordinate uncertainty in meters, or null for no limit. */
  maxUncertaintyMeters: number | null;
  /** Keep records that do not report a coordinate uncertainty. */
  keepMissingUncertainty: boolean;
  /** GBIF `hasGeospatialIssue = false`; OBIS excludes ON_LAND/DEPTH_EXCEEDS_BATH-type flags. */
  excludeGeospatialIssues: boolean;
  /** Exclude establishmentMeans INTRODUCED, MANAGED, INVASIVE, NATURALISED. */
  excludeIntroduced: boolean;
  /** Only occurrenceStatus PRESENT (drop recorded absences). */
  presentOnly: boolean;
  dedupe: DedupeMode;
  /** GBIF dataset keys to leave out (GBIF only). */
  excludeDatasets?: string[];
  /** Drop species with fewer records than this at plan time (1 or unset = off). */
  minRecordsPerSpecies?: number;
}

export interface OccurrenceQuery {
  /** Union (OR) of taxa. Empty means no taxon filter (only allowed with a narrow area). */
  taxa: TaxonRef[];
  area: AreaFilter;
  /** Inclusive year range; null ends are open. */
  years: [from: number | null, to: number | null];
  /** Optional depth range in meters (marine data). */
  depth: [min: number | null, max: number | null];
  quality: QualityFilters;
  sources: Record<SourceId, boolean>;
}

/** One cleaned point record, ready for SpeciesStore. */
export interface OccurrenceRecord {
  /** Canonical species binomial, normalized with `normalizeSpeciesName`. */
  name: string;
  lon: number;
  lat: number;
  year?: number;
  source: RecordSource;
  datasetKey?: string;
  basisOfRecord?: string;
  uncertainty?: number;
}

export interface StreamProgress {
  /** Raw records received so far (before cleaning). */
  fetched: number;
  /** Planned number of records (estimate from counts). */
  expected: number;
  requestsDone: number;
  /** May grow while partitions are split. */
  requestsTotal: number;
  speciesDone?: number;
  speciesTotal?: number;
  /** Bytes received so far. */
  bytes?: number;
  /** Epoch ms of the next retry while backing off after throttling. */
  retryAt?: number;
  /** Species whose records were capped at a partition limit. */
  truncated?: { name: string; kept: number; total: number }[];
}

export interface RecordBatch {
  source: RecordSource;
  records: OccurrenceRecord[];
  /** Cumulative progress of the producing stream after this batch. */
  progress: StreamProgress;
}

export interface FacetBucket {
  key: string;
  label: string;
  count: number;
}

/** Quality/scope filters whose impact the preview can quantify. */
export type FilterId =
  | 'basisOfRecord'
  | 'uncertainty'
  | 'geospatialIssues'
  | 'introduced'
  | 'presentOnly'
  | 'years'
  | 'depth'
  | 'datasets';

export interface PreviewSummary {
  source: SourceId;
  /** Records matching the full query. */
  total: number;
  /**
   * Records matching the taxa and area with every ledger filter omitted (years, depth,
   * basis of record, uncertainty, geospatial issues, introduced, presence, datasets).
   * The common denominator of the filter ledger; missing when unknown.
   */
  baseTotal?: number;
  /** Distinct species (null when the source cannot tell). */
  species: number | null;
  datasets: number | null;
  yearRange: [number, number] | null;
  /** Ascending, one bin per year (empty years omitted). */
  years: { year: number; count: number }[];
  /** Per-year histogram ignoring the year filter, for the year brush. */
  yearsAll?: { year: number; count: number }[];
  basisOfRecord: FacetBucket[];
  topSpecies: FacetBucket[];
  topDatasets: FacetBucket[];
  countries: FacetBucket[];
  /** GBIF interpretation issues (empty for OBIS). */
  issues: FacetBucket[];
  uncertainty: { min: number; max: number; avg: number } | null;
  /**
   * Extra records each active filter removes, i.e. count(query without that filter) - total.
   * Missing keys mean the filter is inactive or the impact is unknown.
   */
  filterImpact: Partial<Record<FilterId, number>>;
}

export interface StreamPlan {
  source: SourceId;
  query: OccurrenceQuery;
  expectedRecords: number;
  expectedSpecies: number | null;
  /** Estimated number of HTTP requests. */
  requests: number;
  /** Estimated transfer size, for the UI. */
  estimatedBytes: number;
  /** Records per species (GBIF species facet / OBIS checklist), when known. */
  speciesCounts?: FacetBucket[];
  /** Source-specific payload consumed by `stream`. */
  detail: unknown;
}

export interface StreamOptions {
  /** Stop after this many raw records. */
  maxRecords: number;
  signal?: AbortSignal;
  concurrency?: number;
}

export type Supports = { ok: true } | { ok: false; reason: string };

export interface DataSource {
  id: SourceId;
  label: string;
  /** Whether the source can run this query (e.g. a taxon lacks an id for this source). */
  supports(query: OccurrenceQuery): Supports;
  preview(query: OccurrenceQuery, signal?: AbortSignal): Promise<PreviewSummary>;
  plan(query: OccurrenceQuery, signal?: AbortSignal): Promise<StreamPlan>;
  stream(plan: StreamPlan, opts: StreamOptions): AsyncGenerator<RecordBatch>;
  suggestTaxa(q: string, signal?: AbortSignal): Promise<TaxonRef[]>;
}

export type DropReason =
  | 'noSpecies'
  | 'invalidCoordinates'
  | 'zeroCoordinates'
  | 'outsideArea'
  /** Same species at the same site (or ~1 km cell) as a record first seen from the same source. */
  | 'duplicate'
  /** The same record (species and site) already received from another source (GBIF and OBIS). */
  | 'crossSource'
  /** Species below `minRecordsPerSpecies` (OBIS records; GBIF drops them at plan time). */
  | 'lowCount';

export interface Funnel {
  received: number;
  accepted: number;
  dropped: Record<DropReason, number>;
  bySource: Partial<Record<RecordSource, { received: number; accepted: number }>>;
}

/** Where one part of the loaded dataset came from; drives citations and the methods text. */
export interface ProvenanceEntry {
  id: string;
  source: RecordSource;
  /** e.g. "GBIF occurrence API", "OBIS API", "GBIF download 0012345-…", a file name. */
  label: string;
  /** ISO 8601 timestamp of retrieval. */
  retrievedAt: string;
  query?: OccurrenceQuery;
  /** Exact request sent: GBIF predicate JSON or OBIS query params. */
  request?: unknown;
  doi?: string;
  downloadKey?: string;
  /** Raw records received and records accepted after cleaning. */
  fetched: number;
  accepted: number;
  /** Records per source dataset (GBIF datasetKey / OBIS dataset id). */
  datasets: { key: string; title?: string; count: number }[];
  /** Records left out because a stream hit the cap or a partition was truncated. */
  truncated?: number;
}
