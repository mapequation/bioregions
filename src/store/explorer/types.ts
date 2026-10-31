// Types shared by ExplorerStore, PhyloStore and the Explorer UI (spec section 4 of
// docs/superpowers/specs/2026-10-30-data-explorer-ui.md).
import type {
  FacetBucket,
  FilterId,
  Funnel,
  OccurrenceQuery,
  PreviewSummary,
  SourceId,
  StreamPlan,
  StreamProgress,
  Supports,
  TaxonRef,
} from '../../sources/types';
import type { StopState } from '../data/types';

// --- ExplorerStore -----------------------------------------------------------------

export type Tab = 'occurrences' | 'phylogeny' | 'cite';
export type Preset = 'recommended' | 'permissive' | 'custom';
export type ReqState = 'idle' | 'loading' | 'ready' | 'error' | 'rateLimited';

export interface SourceState {
  enabled: boolean;
  supports: Supports;
  /** Query taxa this source does not know (OBIS: no AphiaID), shown as "GBIF only" chips. */
  gbifOnlyTaxa: string[];
  /** The fast part of the preview (KPIs, map, insights); `baseTotal`/`filterImpact` come from `impact`. */
  preview: PreviewSummary | null;
  state: ReqState;
  /** True while loading and `preview` still holds the previous result. */
  stale: boolean;
  /**
   * Ledger counts from the second preview request (base and per-filter impact). Kept from
   * the previous query until the new ones arrive, so the ledger does not blank out.
   */
  impact: Pick<PreviewSummary, 'baseTotal' | 'filterImpact'> | null;
  /** State of the ledger request; 'loading' while `impact` belongs to an older query. */
  impactState: 'idle' | 'loading' | 'ready' | 'error';
  error?: string;
  /** Epoch ms of the next automatic retry while rate-limited. */
  retryAt?: number;
  /** Retry attempt (1-based) while rate-limited, for "attempt 2/5". */
  attempt?: number;
}

export interface Kpis {
  records: number;
  /** More than one source contributes, so the merged total is an upper bound (overlap). */
  recordsUpperBound: boolean;
  species: number | null;
  datasets: number | null;
  yearRange: [number, number] | null;
  bySource: Partial<Record<SourceId, number>>;
}

/** Ledger rows the user can switch on and off (one per filter). */
export type ToggleableRowId = FilterId | 'minRecords';

/**
 * Every ledger row: the toggleable filters plus three fixed rules that always apply,
 * records not identified to species, duplicates removed while loading (same species
 * at one site within a source) and the same record received from both GBIF and OBIS.
 */
export type LedgerRowId = ToggleableRowId | 'speciesLevel' | 'duplicates' | 'crossSource';

export interface LedgerRow {
  id: LedgerRowId;
  label: string;
  /** Whether the user can switch this row (false for 'speciesLevel', 'duplicates' and 'crossSource'). */
  toggleable: boolean;
  /** Whether the rule restricts the current query (fixed rules are always active). */
  active: boolean;
  /** Records the rule removes, or null when unknown (not yet planned or loaded). */
  impact: number | null;
  /** impact / ledgerBase: one common denominator for every row. */
  share: number | null;
  loadedImpact?: number | null;
}

/**
 * How the record count shrinks from the query to the loaded dataset, each step
 * null until known: matching all filters (previews) -> identified to species
 * (plans; also after the minimum records per species) -> duplicates removed while
 * loading -> loaded (accepted records of the last load).
 */
export interface CountStory {
  matching: number | null;
  speciesLevel: number | null;
  /** Every duplicate removed while loading: same-source duplicates plus `crossSource`. */
  duplicates: number | null;
  /** The part of `duplicates` that was the same record in GBIF and OBIS. */
  crossSource?: number | null;
  loaded: number | null;
}

/** What the insights column describes: the previewed query, or the query of the data loaded. */
export interface InsightsScope {
  /** 'query' while previewing; 'loaded' once the query on screen was loaded; 'partial' for a stopped load. */
  kind: 'query' | 'loaded' | 'partial';
  /** Records the scope covers (matching the query, or loaded). */
  records: number;
  /** e.g. "For the query · 24,341 matching records". */
  label: string;
}

/**
 * What the data is made of, in the insights scope: the query preview while previewing,
 * the accepted records once the query on screen is loaded (or partly loaded).
 */
export interface Composition {
  basisOfRecord: FacetBucket[];
  topDatasets: FacetBucket[];
  topSpecies: FacetBucket[];
  /** ISO 3166-1 alpha-2 keys; in a loaded scope only records with a country code count. */
  countries: FacetBucket[];
  /** GBIF interpretation issues; empty in a loaded scope (not streamed, see `notes.issues`). */
  issues: FacetBucket[];
  uncertainty: { min: number; max: number; avg: number } | null;
  /** Records the scope covers (matching the query, or loaded). */
  total: number;
  scopeKind: InsightsScope['kind'];
  /** Caveats of a loaded scope, one sentence each. */
  notes?: {
    /** e.g. "Countries are known for 9,812 of 12,094 loaded records (OBIS often gives none)." */
    countries?: string;
    issues?: string;
  };
}

/** Share of dated records from `cutoffYear` on (the temporal-skew check and the year brush). */
export interface RecentShare {
  cutoffYear: number;
  /** null without dated records. */
  share: number | null;
  /**
   * What the share describes, following `insightsScope`: the query preview, or the
   * loaded records ('loaded' also for a partial load).
   */
  scope: 'query' | 'loaded';
}

/** What the map shows: the query's preview density, or the loaded records. */
export type MapScope = 'query' | 'loaded';

export type BiasId =
  | 'datasetDominance'
  | 'humanObservation'
  | 'temporalSkew'
  | 'countryConcentration'
  | 'lowCountSpecies';

export interface BiasFlag {
  id: BiasId;
  /** Above the threshold (a note or a warning). */
  triggered: boolean;
  /**
   * Severity of a triggered flag: 'warning' at 1.5 x the threshold or more, else 'note'.
   * Absent when the check passes.
   */
  level?: 'note' | 'warning';
  value: number;
  threshold: number;
  /** Legend text for the threshold, e.g. "warns above 50 %". */
  thresholdLabel?: string;
  text: string;
  /**
   * The value may change once the data is loaded: set on a query preview to which GBIF
   * and OBIS both contribute, since their overlap is removed only while loading.
   */
  approximate?: boolean;
  /** Why the value is approximate, e.g. "may change after GBIF/OBIS overlap removal". */
  approximateNote?: string;
  action?: {
    /** Short button label, e.g. "Exclude this dataset". */
    label: string;
    /** Full description for the tooltip and accessible name, e.g. "Exclude eBird". */
    title?: string;
    /** Records the remedy would remove from the scope's total (never more than it), when known. */
    cost?: number;
    /**
     * The remedy would remove more than `BIAS_DISCOURAGE_SHARE` (80 %) of the scope:
     * show it as text ("Specimens only would leave 143 records"), not as a button.
     */
    discouraged?: boolean;
    /** Records left if the remedy is applied (set with `discouraged`). */
    leaves?: number;
    run(): void;
  };
  /** A second remedy, e.g. "Compare first: pin baseline, then restrict". */
  secondaryAction?: {
    label: string;
    run(): void;
  };
}

export interface Estimate {
  records: number;
  species: number | null;
  bytes: number;
  seconds: number;
  requests: number;
  /** From plans, else ≈ from preview. */
  exact: boolean;
  overCap: boolean;
}

export interface SourceProgress extends StreamProgress {
  source: SourceId;
  state: 'streaming' | 'done' | 'error' | 'rateLimited';
}

export interface LoadJob {
  state: 'planning' | 'streaming' | 'done' | 'cancelled' | 'error';
  label: string;
  startedAt: number;
  etaSeconds: number | null;
  perSource: SourceProgress[];
  funnel: Funnel;
  truncated: { name: string; kept: number; total: number }[];
  /** Live species completeness (0..1) from the sources' speciesDone/speciesTotal; null when unknown. */
  speciesCoverage: number | null;
  /**
   * Held by `pauseLoad()` (the cancel menu is open): no batch is counted or handed to
   * SpeciesStore, so `funnel`, `speciesLoaded` and `perSource` stay frozen and
   * `cancel('keep')` keeps exactly those records.
   */
  paused: boolean;
  /** Species with at least one accepted record so far (what a stop would keep). */
  speciesLoaded?: number;
  /** Species the plans promise, null when unknown (the denominator of `speciesLoaded`). */
  speciesPlanned?: number | null;
  error?: string;
}

/**
 * Why a load holds no records: nothing matched, cleaning dropped everything, or the
 * load was cancelled before the first record arrived.
 */
export type EmptyReason = 'noMatches' | 'allDropped' | 'cancelledEarly';

/** How much of a load arrived when it stopped early. */
export interface PartialLoad {
  /**
   * 'speciesMissing' when fewer species arrived than planned (whole species absent);
   * 'recordsTruncated' when every planned species is present (or the species are
   * unknown) but later records were not received.
   */
  kind: 'speciesMissing' | 'recordsTruncated';
  /** Records the plans promised (capped). */
  planned: number;
  /** Records loaded. */
  accepted: number;
  /** Species with at least one loaded record. */
  speciesLoaded: number;
  /** Species the plans promised, null when unknown. */
  speciesPlanned: number | null;
  /** Planned records never fetched because the load stopped. */
  notReceived: number;
  /**
   * speciesLoaded / speciesPlanned (0..1); the record share when the planned species
   * are unknown. Below 0.5 a stopped load skips Infomap (see `Provenance.bioregionsSkipped`).
   */
  coverage: number;
  /**
   * Planned species with no loaded record, largest first: `expected` is the records the
   * plans promised for it (summed over sources). At most `MISSING_SPECIES_LIMIT` (100)
   * entries; `speciesPlanned - speciesLoaded` is the full count. Empty when the planned
   * species are unknown. Optional for provenance saved before it existed.
   */
  missingSpecies?: { name: string; expected: number }[];
}

/**
 * The finished payload of a loaded query (or zip) source, built at the finish. Why a load
 * came back empty lives on `dataStore.job.outcome`, not here.
 */
export interface Provenance {
  query: OccurrenceQuery;
  /** The source's commit time. */
  retrievedAt: string;
  /** ISO time of the finish (S4: and of the last Continue). Optional until the zip path sets it (S2b). */
  completedAt?: string;
  /** The record cap the load ran with. */
  cap?: number;
  /** Why the load stopped early, null when complete. TODO(S4): set by the stop reasons. */
  stop?: StopState | null;
  funnel: Funnel;
  ledger: LedgerRow[];
  kpis: Kpis;
  /** Records loaded (the funnel's accepted count). */
  accepted: number;
  /** Set when the load stopped early (cancelled) or a source failed. */
  partial: PartialLoad | null;
  /**
   * Infomap was not run because the load was stopped with too few species (coverage
   * below 0.5); the map shows the records. `runBioregionsAnyway()` runs it and clears this.
   */
  bioregionsSkipped?: boolean;
  datasetCounts: Partial<Record<SourceId, FacetBucket[]>>;
  derivedDoi?: string;
  gbifDownloadKey?: string;
}

export interface GbifDownload {
  key: string;
  status: 'PREPARING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'KILLED' | 'CANCELLED';
  doi?: string;
  totalRecords?: number;
  size?: number;
  downloadLink?: string;
  createdAt: string;
  checkedAt?: string;
}

export interface ZipImport {
  state: 'parsing' | 'ready' | 'error';
  fileName: string;
  funnel?: Funnel;
  error?: string;
  /** From the zip entry or file name. */
  downloadKey?: string;
  /** Bare DOI from the zip or the download's metadata. */
  doi?: string;
  /**
   * Whether the download was made for the query of the data on screen (taxa, area and
   * years compared with the download's own request): 'unknown' without the download's
   * metadata (offline, no key) and while parsing.
   */
  queryMatch: 'match' | 'mismatch' | 'unknown';
  /** The download's own taxa, area and years in words, e.g. "Callitrichidae · Brazil · 2000–2020". */
  downloadQueryText?: string;
  /** GBIF records loaded on screen (same as `streamGbifLoaded`; kept for older callers). */
  streamGbifRecords: number;
  /** Raw GBIF records the load on screen received from the API (before cleaning). */
  streamGbifReceived: number;
  /**
   * GBIF records loaded on screen after cleaning and deduplication: the figure the zip's
   * cleaned records are compared with (the "GBIF" part of the loaded count).
   */
  streamGbifLoaded: number;
  /** Replacing the data with the zip makes sense: same query and at least one record accepted. */
  canReplace: boolean;
  /** The download's DOI may cite the data on screen (same query). */
  canCiteDoi: boolean;
  /** One sentence explaining the comparison, for the dialog. */
  note?: string;
}

export interface SavedQuery {
  id: string;
  name: string;
  query: OccurrenceQuery;
  savedAt: string;
  kpis?: Kpis;
}

export interface TaxonSuggestion extends TaxonRef {
  gbifCount?: number;
  inGbif: boolean;
  inObis: boolean;
}

export interface PlanState {
  state: ReqState;
  plans: Partial<Record<SourceId, StreamPlan>>;
  error?: string;
}

export interface Baseline {
  kpis: Kpis;
  total: number;
  label: string;
}

export type QuerySection = 'taxa' | 'area' | 'years' | 'depth' | 'quality' | 'sources';

export interface DownloadCredentials {
  user: string;
  /** Used once for the request and never stored. */
  password: string;
  email: string;
}

// --- PhyloStore --------------------------------------------------------------------

export type MatchStatus = 'matched' | 'synonym' | 'unmatched' | 'ambiguous';

/** One dataset species name and its Open Tree match (src/phylo/otol.ts has its own NameMatch). */
export interface NameMatchRow {
  datasetName: string;
  status: MatchStatus;
  ottId?: number;
  ottName?: string;
}

export interface Clade {
  name: string;
  rank: string;
  ottId: number;
  numTips: number;
}

export interface TreeCandidate {
  id: string;
  kind: 'synthetic' | 'study';
  title: string;
  citation: string;
  year: number | null;
  synthVersion?: string;
  doi?: string;
  studyId?: string;
  treeId?: string;
  branchLengths: 'time' | 'other' | 'none';
  timeUnit?: string;
  coverage: { matched: number; total: number } | null;
  coverageState: 'pending' | 'ready' | 'error';
}

export interface TreeSelection {
  kept: number;
  absentFromTree: string[];
  pruned: number;
  broken: string[];
}
