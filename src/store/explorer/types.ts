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

// --- ExplorerStore -----------------------------------------------------------------

export type Tab = 'occurrences' | 'phylogeny' | 'cite';
export type Preset = 'recommended' | 'permissive' | 'custom';
export type ReqState = 'idle' | 'loading' | 'ready' | 'error' | 'rateLimited';

export interface SourceState {
  enabled: boolean;
  supports: Supports;
  /** Query taxa this source does not know (OBIS: no AphiaID), shown as "GBIF only" chips. */
  gbifOnlyTaxa: string[];
  preview: PreviewSummary | null;
  state: ReqState;
  /** True while loading and `preview` still holds the previous result. */
  stale: boolean;
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
 * Every ledger row: the toggleable filters plus two fixed rules that always apply,
 * records not identified to species and duplicates removed while loading.
 */
export type LedgerRowId = ToggleableRowId | 'speciesLevel' | 'duplicates';

export interface LedgerRow {
  id: LedgerRowId;
  label: string;
  /** Whether the user can switch this row (false for 'speciesLevel' and 'duplicates'). */
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
  duplicates: number | null;
  loaded: number | null;
}

export type BiasId =
  | 'datasetDominance'
  | 'humanObservation'
  | 'temporalSkew'
  | 'countryConcentration'
  | 'lowCountSpecies';

export interface BiasFlag {
  id: BiasId;
  triggered: boolean;
  value: number;
  threshold: number;
  /** Legend text for the threshold, e.g. "warns above 50 %". */
  thresholdLabel?: string;
  text: string;
  action?: { label: string; run(): void };
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
  error?: string;
}

export interface Provenance {
  query: OccurrenceQuery;
  retrievedAt: string;
  mode: 'replace' | 'add';
  funnel: Funnel;
  ledger: LedgerRow[];
  kpis: Kpis;
  partial: { planned: number; accepted: number } | null;
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
