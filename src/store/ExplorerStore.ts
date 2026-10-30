// State of the GBIF/OBIS data explorer: the query being edited, debounced per-source
// previews, the decision ledger and bias checks, loading (plans, streams, cleaning), provenance,
// citation and the query library. Contract: spec section 4 of
// docs/superpowers/specs/2026-10-30-data-explorer-ui.md.
import { makeAutoObservable, observable, reaction, runInAction, toJS } from 'mobx';
import { RecordCleaner } from '../sources/clean';
import { supportsGbif } from '../sources/gbif';
import { GbifDownloadError, getGbifDownload, requestGbifDownload } from '../sources/gbif/download';
import { gbifDownloadPredicate } from '../sources/gbif/predicate';
import { streamGbif } from '../sources/gbif/stream';
import { type GbifZipSummary, importGbifZip } from '../sources/gbif/zip';
import { streamObis } from '../sources/obis/stream';
import type { Funnel, RecordBatch, StreamPlan } from '../sources/types';
import { exampleStudies } from './explorer/examples';
import { JOB_UPDATE_MS, LoadTally, SeededDedupe, etaSeconds, mergeBatches } from './explorer/job';
import {
  STORAGE_KEYS,
  type StoredDownload,
  isDownloadList,
  libraryId,
  loadSavedList,
  parseQueryText,
  pushRecent,
  readStorage,
  writeStorage,
} from './explorer/library';
import { type ObisExplorerDetail, applyMinRecords, computeEstimate, planSource, planSpeciesNames } from './explorer/plan';
import {
  type LoadProvenance,
  buildDatasetCsv,
  buildLedgerCsv,
  buildMethodsText,
  buildObisCitation,
  citingDownload,
} from './explorer/provenance';
import type { SourceProgress } from './explorer/types';
import { previewGbif } from '../sources/gbif/preview';
import { gbifTaxonCount, suggestGbifTaxa } from '../sources/gbif/taxa';
import { HttpError, isAbortError } from '../sources/http';
import { supportsObis } from '../sources/obis/params';
import { previewObis } from '../sources/obis/preview';
import { resolveQueryTaxa, suggestObisTaxa } from '../sources/obis/taxa';
import {
  ALL_BASIS,
  DEFAULT_BASIS,
  basisLabel,
  defaultQuery,
  isQueryRunnable,
  matchPreset,
  presetQuality,
  queryKey,
  queryTitle,
  yearsLabel,
} from '../sources/query';
import type {
  AreaFilter,
  BasisOfRecord,
  FacetBucket,
  OccurrenceQuery,
  PreviewSummary,
  QualityFilters,
  SourceId,
  Supports,
  TaxonRef,
} from '../sources/types';
import type {
  Baseline,
  BiasFlag,
  BiasId,
  DownloadCredentials,
  Estimate,
  GbifDownload,
  Kpis,
  LedgerRow,
  LedgerRowId,
  LoadJob,
  PlanState,
  Preset,
  Provenance,
  QuerySection,
  SavedQuery,
  SourceState,
  Tab,
  TaxonSuggestion,
  ZipImport,
} from './explorer/types';
import type RootStore from './RootStore';

export const SOURCE_IDS: SourceId[] = ['gbif', 'obis'];
export const PREVIEW_DEBOUNCE_MS = 400;
/** Attempts (including the first) before a rate-limited preview counts as an error. */
export const MAX_RATE_LIMIT_ATTEMPTS = 5;
export const DEFAULT_CAP = 500_000;
export const MAX_SUGGESTIONS = 10;

/** Ledger rows, in display order. */
export const LEDGER_IDS: LedgerRowId[] = [
  'basisOfRecord',
  'uncertainty',
  'geospatialIssues',
  'introduced',
  'presentOnly',
  'years',
  'depth',
  'datasets',
  'minRecords',
];

/** Bias-check thresholds (spec section 7): a check triggers when its share exceeds this. */
export const BIAS_THRESHOLDS: Record<BiasId, number> = {
  datasetDominance: 0.3,
  humanObservation: 0.6,
  temporalSkew: 0.6,
  countryConcentration: 0.5,
  lowCountSpecies: 0.2,
};
/** "Recent" for the temporal-skew check: the last 15 years, inclusive. */
export const RECENT_YEARS = 15;
/** Species with fewer records than this count as low-count. */
export const LOW_COUNT = 5;
/** Basis of record kept by "Compare: specimens only". */
export const SPECIMEN_BASIS: BasisOfRecord[] = ['PRESERVED_SPECIMEN', 'MATERIAL_SAMPLE'];

interface PreviewAdapter {
  supports(query: OccurrenceQuery): Supports;
  preview(query: OccurrenceQuery, signal?: AbortSignal): Promise<PreviewSummary>;
}

const ADAPTERS: Record<SourceId, PreviewAdapter> = {
  gbif: { supports: (q) => supportsGbif(q), preview: (q, s) => previewGbif(q, s) },
  obis: { supports: (q) => supportsObis(q), preview: (q, s) => previewObis(q, s) },
};

/** Values a filter returns to when toggled back on. */
export interface ToggleMemory {
  years: OccurrenceQuery['years'] | null;
  depth: OccurrenceQuery['depth'] | null;
  uncertainty: number;
  datasets: string[];
  minRecords: number;
}

const defaultMemory = (): ToggleMemory => ({
  years: null,
  depth: null,
  uncertainty: 10000,
  datasets: [],
  minRecords: LOW_COUNT,
});

// --- Pure helpers (exported for tests) ---------------------------------------------

export function emptySourceState(enabled: boolean): SourceState {
  return {
    enabled,
    supports: { ok: true },
    gbifOnlyTaxa: [],
    preview: null,
    state: 'idle',
    stale: false,
  };
}

/** The explorer's starting query: the default query with both sources on. */
export function explorerDefaultQuery(): OccurrenceQuery {
  return { ...defaultQuery(), sources: { gbif: true, obis: true } };
}

/** Cache key of what the preview depends on (dedupe and minimum records do not change it). */
export function previewKey(query: OccurrenceQuery): string {
  return queryKey({
    ...query,
    quality: { ...query.quality, dedupe: 'none', minRecordsPerSpecies: undefined },
  });
}

/** Previews of enabled sources that have a (possibly stale) result. */
export function contributingPreviews(sources: Record<SourceId, SourceState>): PreviewSummary[] {
  const out: PreviewSummary[] = [];
  for (const id of SOURCE_IDS) {
    const p = sources[id].preview;
    if (sources[id].enabled && p) out.push(p);
  }
  return out;
}

/** Headline numbers merged over sources: records add up, species take the max (no union). */
export function mergeKpis(previews: PreviewSummary[]): Kpis | null {
  if (previews.length === 0) return null;
  let records = 0;
  let species: number | null = null;
  let datasets: number | null = null;
  let yearRange: [number, number] | null = null;
  let contributing = 0;
  const bySource: Kpis['bySource'] = {};
  for (const p of previews) {
    records += p.total;
    bySource[p.source] = p.total;
    if (p.total > 0) contributing++;
    if (p.species != null) species = Math.max(species ?? 0, p.species);
    if (p.datasets != null) datasets = (datasets ?? 0) + p.datasets;
    if (p.yearRange) {
      yearRange = yearRange
        ? [Math.min(yearRange[0], p.yearRange[0]), Math.max(yearRange[1], p.yearRange[1])]
        : [p.yearRange[0], p.yearRange[1]];
    }
  }
  return { records, recordsUpperBound: contributing > 1, species, datasets, yearRange, bySource };
}

/** Facet buckets summed by key over sources, largest first. */
export function mergeBuckets(lists: FacetBucket[][]): FacetBucket[] {
  const byKey = new Map<string, FacetBucket>();
  for (const list of lists) {
    for (const b of list) {
      const prev = byKey.get(b.key);
      byKey.set(b.key, prev ? { ...prev, count: prev.count + b.count } : { ...b });
    }
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count);
}

/** Year histograms summed over sources, ascending. */
export function mergeYears(lists: { year: number; count: number }[][]): { year: number; count: number }[] {
  const byYear = new Map<number, number>();
  for (const list of lists) {
    for (const { year, count } of list) byYear.set(year, (byYear.get(year) ?? 0) + count);
  }
  return [...byYear]
    .map(([year, count]) => ({ year, count }))
    .sort((a, b) => a.year - b.year);
}

/** "1 km", "10 km", "500 m". */
export function metersLabel(m: number): string {
  return m >= 1000 ? `${Math.round(m / 100) / 10} km` : `${m} m`;
}

/** "31 %", "<1 %". */
export function pctLabel(fraction: number): string {
  if (fraction > 0 && fraction < 0.005) return '<1 %';
  return `${Math.round(fraction * 100)} %`;
}

const allBasis = (basis: readonly BasisOfRecord[]) => basis.length === 0 || ALL_BASIS.every((b) => basis.includes(b));
const sameBasis = (a: readonly BasisOfRecord[], b: readonly BasisOfRecord[]) =>
  a.length === b.length && a.every((x) => b.includes(x));

/** Whether a ledger row's filter currently restricts the query. */
export function isFilterActive(query: OccurrenceQuery, id: LedgerRowId): boolean {
  const q = query.quality;
  switch (id) {
    case 'basisOfRecord':
      return !allBasis(q.basisOfRecord);
    case 'uncertainty':
      return q.maxUncertaintyMeters != null;
    case 'geospatialIssues':
      return q.excludeGeospatialIssues;
    case 'introduced':
      return q.excludeIntroduced;
    case 'presentOnly':
      return q.presentOnly;
    case 'years':
      return query.years[0] != null || query.years[1] != null;
    case 'depth':
      return query.depth[0] != null || query.depth[1] != null;
    case 'datasets':
      return (q.excludeDatasets?.length ?? 0) > 0;
    case 'minRecords':
      return (q.minRecordsPerSpecies ?? 1) > 1;
  }
}

function depthRowLabel([min, max]: OccurrenceQuery['depth']): string {
  if (min == null && max == null) return 'Depth (any)';
  if (max == null) return `Depth below ${min} m`;
  return `Depth ${min ?? 0}–${max} m`;
}

/** User-facing ledger label; inactive rows describe what turning them on would do. */
export function ledgerLabel(query: OccurrenceQuery, id: LedgerRowId, memory: ToggleMemory): string {
  const q = query.quality;
  const active = isFilterActive(query, id);
  switch (id) {
    case 'basisOfRecord':
      if (!active || sameBasis(q.basisOfRecord, DEFAULT_BASIS)) return 'No fossil/living specimens';
      return basisLabel(q.basisOfRecord) ?? 'All basis of record';
    case 'uncertainty':
      return `Uncertainty ≤ ${metersLabel(q.maxUncertaintyMeters ?? memory.uncertainty)}`;
    case 'geospatialIssues':
      return 'No geospatial issues';
    case 'introduced':
      return 'Native/wild only';
    case 'presentOnly':
      return 'Presence only';
    case 'years': {
      const years = active ? query.years : memory.years;
      return years ? `Years ${yearsLabel(years)}` : 'Years (all)';
    }
    case 'depth':
      return depthRowLabel(active ? query.depth : (memory.depth ?? [0, 200]));
    case 'datasets':
      return `Excluded datasets (${q.excludeDatasets?.length ?? 0})`;
    case 'minRecords':
      return `Min. ${active ? q.minRecordsPerSpecies : memory.minRecords} records per species`;
  }
}

/** Records the minimum-records filter drops, from per-species counts. */
export function minRecordsImpact(speciesCounts: FacetBucket[] | null, min: number): number | null {
  if (!speciesCounts) return null;
  return speciesCounts.reduce((sum, b) => sum + (b.count < min ? b.count : 0), 0);
}

export interface LedgerInput {
  query: OccurrenceQuery;
  previews: PreviewSummary[];
  memory: ToggleMemory;
  /** Per-species record counts (from plans), for the minimum-records row. */
  speciesCounts: FacetBucket[] | null;
  /** Ledger frozen at the last load, for ghost ticks. */
  loaded?: LedgerRow[] | null;
}

/** One row per filter; impacts summed over the sources that report them. */
export function buildLedger({ query, previews, memory, speciesCounts, loaded }: LedgerInput): LedgerRow[] {
  const total = previews.reduce((sum, p) => sum + p.total, 0);
  return LEDGER_IDS.map((id) => {
    const active = isFilterActive(query, id);
    let impact: number | null = null;
    if (id === 'minRecords') {
      impact = active ? minRecordsImpact(speciesCounts, query.quality.minRecordsPerSpecies ?? 1) : null;
    } else {
      for (const p of previews) {
        const v = p.filterImpact[id];
        if (typeof v === 'number') impact = (impact ?? 0) + v;
      }
    }
    const share = impact == null ? null : total + impact > 0 ? impact / (total + impact) : 0;
    const row: LedgerRow = { id, label: ledgerLabel(query, id, memory), active, impact, share };
    if (loaded) row.loadedImpact = loaded.find((r) => r.id === id)?.impact ?? null;
    return row;
  });
}

export interface BiasActions {
  excludeDataset(key: string): void;
  specimensOnly(): void;
  narrowYears(from: number): void;
  showCountries(): void;
  setMinRecords(n: number): void;
}

export interface BiasInput {
  query: OccurrenceQuery;
  previews: PreviewSummary[];
  speciesCounts: FacetBucket[] | null;
  currentYear: number;
}

/** The five sampling-bias checks on the merged preview (empty without records). */
export function computeBiasFlags(
  { query, previews, speciesCounts, currentYear }: BiasInput,
  actions: BiasActions,
): BiasFlag[] {
  const total = previews.reduce((sum, p) => sum + p.total, 0);
  if (total <= 0) return [];
  const flag = (id: BiasId, value: number, text: string, action?: BiasFlag['action']): BiasFlag => ({
    id,
    triggered: value > BIAS_THRESHOLDS[id],
    value,
    threshold: BIAS_THRESHOLDS[id],
    text,
    action,
  });

  // Dataset dominance: the single largest dataset across sources.
  let top: (FacetBucket & { source: SourceId }) | null = null;
  for (const p of previews) {
    for (const b of p.topDatasets) if (!top || b.count > top.count) top = { ...b, source: p.source };
  }
  const topShare = top ? top.count / total : 0;
  const topKey = top?.key ?? '';
  const datasetFlag = flag(
    'datasetDominance',
    topShare,
    top
      ? `${pctLabel(topShare)} of records come from one dataset (${top.label}). Its sampling design can shape your regions.`
      : 'No single dataset dominates.',
    top?.source === 'gbif' ? { label: 'Exclude dataset', run: () => actions.excludeDataset(topKey) } : undefined,
  );

  // Human observations.
  const basis = mergeBuckets(previews.map((p) => p.basisOfRecord));
  const human = basis.find((b) => b.key === 'HUMAN_OBSERVATION')?.count ?? 0;
  const humanShare = human / total;
  const humanFlag = flag(
    'humanObservation',
    humanShare,
    `${pctLabel(humanShare)} are human observations, often citizen science: dense near people and roads.`,
    { label: 'Compare: specimens only', run: () => actions.specimensOnly() },
  );

  // Temporal skew: share of dated records from the last 15 years.
  const years = mergeYears(previews.map((p) => p.years));
  const cutoff = currentYear - (RECENT_YEARS - 1);
  const dated = years.reduce((sum, y) => sum + y.count, 0);
  const recent = years.reduce((sum, y) => sum + (y.year >= cutoff ? y.count : 0), 0);
  const recentShare = dated > 0 ? recent / dated : 0;
  const temporalFlag = flag(
    'temporalSkew',
    recentShare,
    `${pctLabel(recentShare)} of records are from ${cutoff} or later; historical ranges may be missing.`,
    { label: 'Narrow years', run: () => actions.narrowYears(cutoff) },
  );

  // Country concentration (not meaningful when the area is one country).
  const countries = mergeBuckets(previews.map((p) => p.countries));
  const topCountry = countries[0];
  const oneCountry = query.area.kind === 'countries' && query.area.codes.length === 1;
  const countryShare = topCountry && !oneCountry ? topCountry.count / total : 0;
  const countryFlag = flag(
    'countryConcentration',
    countryShare,
    topCountry && !oneCountry
      ? `${pctLabel(countryShare)} of records are from ${topCountry.label}; effort differs between countries.`
      : 'Records are not concentrated in one country.',
    { label: 'Show countries', run: () => actions.showCountries() },
  );

  // Low-count species (needs per-species counts from the plan).
  let lowFlag: BiasFlag;
  if (speciesCounts && speciesCounts.length > 0) {
    const low = speciesCounts.filter((b) => b.count < LOW_COUNT).length;
    const lowShare = low / speciesCounts.length;
    lowFlag = flag(
      'lowCountSpecies',
      lowShare,
      `${low.toLocaleString('en-US')} species (${pctLabel(lowShare)}) have fewer than ${LOW_COUNT} records and can form spurious regions.`,
      { label: `Set minimum ${LOW_COUNT} records`, run: () => actions.setMinRecords(LOW_COUNT) },
    );
  } else {
    lowFlag = flag('lowCountSpecies', 0, 'Records per species are known once the load is planned.');
  }

  return [datasetFlag, humanFlag, temporalFlag, countryFlag, lowFlag];
}

const SECTION_KEYS: Record<QuerySection, (q: OccurrenceQuery) => string> = {
  taxa: (q) => JSON.stringify(q.taxa.map((t) => t.name).sort()),
  area: (q) => JSON.stringify(q.area),
  years: (q) => JSON.stringify(q.years),
  depth: (q) => JSON.stringify(q.depth),
  quality: (q) =>
    JSON.stringify({
      ...q.quality,
      basisOfRecord: [...q.quality.basisOfRecord].sort(),
      excludeDatasets: [...(q.quality.excludeDatasets ?? [])].sort(),
      minRecordsPerSpecies: q.quality.minRecordsPerSpecies ?? 1,
    }),
  sources: (q) => JSON.stringify(q.sources),
};

/** Query sections that differ between two queries. */
export function dirtySections(a: OccurrenceQuery, b: OccurrenceQuery): Set<QuerySection> {
  const out = new Set<QuerySection>();
  for (const s of Object.keys(SECTION_KEYS) as QuerySection[]) {
    if (SECTION_KEYS[s](a) !== SECTION_KEYS[s](b)) out.add(s);
  }
  return out;
}

/** Backoff before retrying a rate-limited preview: 2, 4, 8, 16 s (capped at 30 s). */
export function rateLimitBackoff(attempt: number): number {
  return Math.min(30_000, 1000 * 2 ** attempt);
}

/** How often running GBIF downloads are polled. */
export const DOWNLOAD_POLL_MS = 30_000;

const ACTIVE_DOWNLOAD = new Set<GbifDownload['status']>(['PREPARING', 'RUNNING']);

/** GBIF's download status in the explorer's vocabulary (SUSPENDED waits, FILE_ERASED keeps its DOI). */
export function downloadState(status: string): GbifDownload['status'] {
  switch (status) {
    case 'PREPARING':
    case 'RUNNING':
    case 'SUCCEEDED':
    case 'FAILED':
    case 'KILLED':
    case 'CANCELLED':
      return status;
    case 'SUSPENDED':
      return 'RUNNING';
    case 'FILE_ERASED':
      return 'SUCCEEDED';
    default:
      return 'RUNNING';
  }
}

export function emptyFunnel(): Funnel {
  return new RecordCleaner({ dedupe: 'none' }).funnel;
}

/** Points already loaded, for deduplicating an "add" load against them. */
function* loadedPoints(rootStore: RootStore): Generator<{ name: string; lon: number; lat: number }> {
  for (const f of rootStore.speciesStore?.collection.features ?? []) {
    if (f.geometry.type !== 'Point') continue;
    const [lon, lat] = f.geometry.coordinates;
    yield { name: f.properties.name, lon, lat };
  }
}

function shortError(error: unknown): string {
  if (error instanceof HttpError) return `HTTP ${error.status}`;
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 80 ? `${message.slice(0, 79)}…` : message;
}

// --- Store -------------------------------------------------------------------------

export default class ExplorerStore {
  rootStore: RootStore;

  /** Whether the full-screen explorer is shown. */
  isOpen = false;
  /** Active header tab. */
  tab: Tab = 'occurrences';
  /** Dialog hidden while a load keeps running (progress shows in the Data section). */
  minimized = false;
  /** Browser connectivity; previews pause and loading is disabled while offline. */
  online = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
  /** The query being edited. */
  query: OccurrenceQuery = explorerDefaultQuery();
  /** Per-source preview state. */
  sources: Record<SourceId, SourceState> = {
    gbif: emptySourceState(true),
    obis: emptySourceState(true),
  };
  /** Pinned "what if" reference numbers. */
  baseline: Baseline | null = null;
  /** Maximum raw records a load may fetch. */
  cap = DEFAULT_CAP;
  /** Replace the loaded data or add to it. */
  loadMode: 'replace' | 'add' = 'replace';
  /** Running or last finished load. */
  job: LoadJob | null = null;
  /** Provenance of the last completed load (a `LoadProvenance`, with the exact requests). */
  lastLoad: Provenance | null = null;
  /** Stream plans for the current query, with `minRecordsPerSpecies` applied. */
  plans: PlanState = { state: 'idle', plans: {} };
  /** GBIF download requests, persisted. */
  downloads: GbifDownload[] = [];
  /** State of the last "Request citable DOI" call; `error` is the message for the dialog. */
  downloadRequest: { state: 'idle' | 'requesting' | 'done' | 'error'; key?: string; error?: string } = {
    state: 'idle',
  };
  /** Parsing state of a dropped GBIF download zip. */
  zipImport: ZipImport | null = null;
  /** Key, DOI and row counts of the parsed zip, once ready. */
  zipSummary: GbifZipSummary | null = null;
  /** Recently loaded queries (10). */
  recent: SavedQuery[] = [];
  /** Queries saved to the library. */
  saved: SavedQuery[] = [];
  /** Static example studies. */
  examples: SavedQuery[] = exampleStudies();
  /** Whether the methods strip is expanded. */
  methodsExpanded = false;
  /** Insights section a bias-flag action asked the UI to reveal. */
  insightFocus: 'countries' | null = null;

  private toggleMemory: ToggleMemory = defaultMemory();
  private previewController: AbortController | null = null;
  private previewTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimers: Partial<Record<SourceId, ReturnType<typeof setTimeout>>> = {};
  private gbifCountCache = new Map<number, number>();
  private disposers: (() => void)[] = [];
  /** Unfiltered plans and the preview key they were made for. */
  private rawPlans: { key: string; plans: Partial<Record<SourceId, StreamPlan>> } | null = null;
  private planController: AbortController | null = null;
  private loadController: AbortController | null = null;
  private cancelMode: 'keep' | 'discard' | null = null;
  private downloadController: AbortController | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private zipController: AbortController | null = null;
  private zipFile: Blob | null = null;

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;
    this.recent = loadSavedList(STORAGE_KEYS.recent);
    this.saved = loadSavedList(STORAGE_KEYS.saved);
    this.downloads = readStorage<StoredDownload[]>(STORAGE_KEYS.downloads, [], isDownloadList);
    makeAutoObservable<
      this,
      | 'previewController'
      | 'previewTimer'
      | 'retryTimers'
      | 'gbifCountCache'
      | 'disposers'
      | 'rawPlans'
      | 'planController'
      | 'loadController'
      | 'cancelMode'
      | 'downloadController'
      | 'pollTimer'
      | 'zipController'
      | 'zipFile'
    >(
      this,
      {
        rootStore: false,
        previewController: false,
        previewTimer: false,
        retryTimers: false,
        gbifCountCache: false,
        disposers: false,
        rawPlans: observable.ref,
        planController: false,
        loadController: false,
        cancelMode: false,
        downloadController: false,
        pollTimer: false,
        zipController: false,
        zipFile: false,
        examples: observable.ref,
        zipSummary: observable.ref,
      },
      { autoBind: true },
    );
    this.disposers.push(
      reaction(
        () => previewKey(this.query),
        () => this.schedulePreview(),
      ),
      // Plans belong to one preview key: drop them when the query changes.
      reaction(
        () => previewKey(this.query),
        (key) => {
          if (this.rawPlans?.key === key) return;
          this.planController?.abort();
          this.planController = null;
          this.plans = { state: 'idle', plans: {} };
        },
      ),
      // Fetch plans once the preview settles and the query is small enough to load.
      reaction(
        () => this.planWanted,
        (key) => {
          if (key && this.rawPlans?.key !== key) void this.fetchPlans();
        },
      ),
      // Re-apply the minimum records per species without refetching.
      reaction(
        () => this.query.quality.minRecordsPerSpecies,
        () => this.applyPlanFilter(),
      ),
      // Poll GBIF downloads every 30 s while any is preparing or running.
      reaction(
        () => this.downloads.some((d) => ACTIVE_DOWNLOAD.has(d.status)),
        (active) => this.setPolling(active),
        { fireImmediately: true },
      ),
    );
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline);
      window.addEventListener('offline', this.handleOffline);
      this.disposers.push(() => {
        window.removeEventListener('online', this.handleOnline);
        window.removeEventListener('offline', this.handleOffline);
      });
    }
  }

  /** Stop reactions, listeners, timers and in-flight requests. */
  dispose() {
    for (const d of this.disposers) d();
    this.disposers = [];
    this.abortPreview();
    this.planController?.abort();
    this.downloadController?.abort();
    this.zipController?.abort();
    this.setPolling(false);
  }

  // --- Workspace --------------------------------------------------------------------

  /** Show the explorer, optionally on a tab. */
  open(tab?: Tab) {
    this.isOpen = true;
    this.minimized = false;
    if (tab) this.tab = tab;
    const idle = SOURCE_IDS.every((id) => !this.query.sources[id] || this.sources[id].state === 'idle');
    if (idle && isQueryRunnable(this.query).ok) this.schedulePreview();
  }

  /** Hide the explorer. */
  close() {
    this.isOpen = false;
    this.minimized = false;
  }

  /** Switch header tab. */
  setTab(tab: Tab) {
    this.tab = tab;
  }

  /** Hide or show the dialog while keeping the workspace alive. */
  setMinimized(minimized: boolean) {
    this.minimized = minimized;
  }

  /** Ask the insights column to reveal a section (null clears). */
  setInsightFocus(focus: 'countries' | null) {
    this.insightFocus = focus;
  }

  private handleOnline() {
    this.online = true;
    this.schedulePreview();
  }

  private handleOffline() {
    this.online = false;
  }

  // --- Query ------------------------------------------------------------------------

  /** Add a taxon (ignored when one with the same name is already selected). */
  addTaxon(t: TaxonRef) {
    const name = t.name.toLowerCase();
    if (this.query.taxa.some((x) => x.name.toLowerCase() === name)) return;
    this.query.taxa = [...this.query.taxa, { ...t }];
  }

  /** Remove a taxon by name. */
  removeTaxon(name: string) {
    this.query.taxa = this.query.taxa.filter((t) => t.name !== name);
  }

  /** Set the area filter. */
  setArea(a: AreaFilter) {
    this.query.area = a;
  }

  /** Set the inclusive year range (null ends are open). */
  setYears(r: OccurrenceQuery['years']) {
    this.query.years = [r[0], r[1]];
    if (r[0] != null || r[1] != null) this.toggleMemory.years = [r[0], r[1]];
  }

  /** Set the depth range in meters (null ends are open). */
  setDepth(r: OccurrenceQuery['depth']) {
    this.query.depth = [r[0], r[1]];
    if (r[0] != null || r[1] != null) this.toggleMemory.depth = [r[0], r[1]];
  }

  /** Merge a patch into the quality filters. */
  setQuality(patch: Partial<QualityFilters>) {
    this.query.quality = { ...toJS(this.query.quality), ...patch };
    const m = this.toggleMemory;
    if (patch.maxUncertaintyMeters != null) m.uncertainty = patch.maxUncertaintyMeters;
    if (patch.excludeDatasets && patch.excludeDatasets.length > 0) m.datasets = [...patch.excludeDatasets];
    if (patch.minRecordsPerSpecies != null && patch.minRecordsPerSpecies > 1) {
      m.minRecords = patch.minRecordsPerSpecies;
    }
  }

  /** Flip one ledger filter between its recommended (or last) value and off. */
  toggleFilter(id: LedgerRowId) {
    const q = this.query.quality;
    const m = this.toggleMemory;
    const on = isFilterActive(this.query, id);
    switch (id) {
      case 'basisOfRecord':
        this.setQuality({ basisOfRecord: on ? [] : [...DEFAULT_BASIS] });
        break;
      case 'uncertainty':
        this.setQuality({ maxUncertaintyMeters: on ? null : m.uncertainty });
        break;
      case 'geospatialIssues':
        this.setQuality({ excludeGeospatialIssues: !q.excludeGeospatialIssues });
        break;
      case 'introduced':
        this.setQuality({ excludeIntroduced: !q.excludeIntroduced });
        break;
      case 'presentOnly':
        this.setQuality({ presentOnly: !q.presentOnly });
        break;
      case 'years':
        if (on) this.query.years = [null, null];
        else if (m.years) this.query.years = [m.years[0], m.years[1]];
        break;
      case 'depth':
        if (on) this.query.depth = [null, null];
        else this.setDepth(m.depth ?? [0, 200]);
        break;
      case 'datasets':
        if (on) this.setQuality({ excludeDatasets: [] });
        else if (m.datasets.length > 0) this.setQuality({ excludeDatasets: [...m.datasets] });
        break;
      case 'minRecords':
        this.setQuality({ minRecordsPerSpecies: on ? 1 : m.minRecords });
        break;
    }
  }

  /** Replace the quality filters with a preset (keeps dataset exclusions and minimum records). */
  applyPreset(p: Preset) {
    if (p === 'custom') return;
    const q = this.query.quality;
    this.query.quality = {
      ...presetQuality(p),
      excludeDatasets: [...(q.excludeDatasets ?? [])],
      minRecordsPerSpecies: q.minRecordsPerSpecies,
    };
  }

  /** Turn a source on or off. */
  setSourceEnabled(id: SourceId, on: boolean) {
    this.query.sources = { ...this.query.sources, [id]: on };
    this.sources[id].enabled = on;
  }

  /** Leave a GBIF dataset out. */
  excludeDataset(key: string) {
    const current = this.query.quality.excludeDatasets ?? [];
    if (current.includes(key)) return;
    this.setQuality({ excludeDatasets: [...current, key] });
  }

  /** Remove one basis of record from the allowed set. */
  excludeBasis(b: BasisOfRecord) {
    const current = this.query.quality.basisOfRecord.length > 0 ? this.query.quality.basisOfRecord : ALL_BASIS;
    this.setQuality({ basisOfRecord: current.filter((x) => x !== b) });
  }

  // --- Preview pipeline -------------------------------------------------------------

  private abortPreview() {
    this.previewController?.abort();
    this.previewController = null;
    if (this.previewTimer) clearTimeout(this.previewTimer);
    this.previewTimer = null;
    for (const id of SOURCE_IDS) {
      const t = this.retryTimers[id];
      if (t) clearTimeout(t);
    }
    this.retryTimers = {};
  }

  /** Abort the in-flight preview, mark results stale and start a new one after the debounce. */
  private schedulePreview() {
    this.abortPreview();
    const query = this.query;
    for (const id of SOURCE_IDS) {
      this.sources[id].enabled = query.sources[id];
      this.sources[id].supports = ADAPTERS[id].supports(query);
    }
    if (!isQueryRunnable(query).ok) {
      for (const id of SOURCE_IDS) {
        Object.assign(this.sources[id], {
          preview: null,
          state: 'idle',
          stale: false,
          error: undefined,
          retryAt: undefined,
          attempt: undefined,
          gbifOnlyTaxa: [],
        });
      }
      return;
    }
    if (!this.online) return;
    for (const id of SOURCE_IDS) {
      const s = this.sources[id];
      if (!s.enabled || !s.supports.ok) {
        Object.assign(s, { preview: null, state: 'idle', stale: false, error: undefined, retryAt: undefined });
        continue;
      }
      s.state = 'loading';
      s.stale = s.preview != null;
      s.error = undefined;
      s.retryAt = undefined;
      s.attempt = undefined;
    }
    this.previewTimer = setTimeout(() => this.runPreview(), PREVIEW_DEBOUNCE_MS);
  }

  private runPreview() {
    this.previewTimer = null;
    const controller = new AbortController();
    this.previewController = controller;
    const query = toJS(this.query);
    for (const id of SOURCE_IDS) {
      const s = this.sources[id];
      if (s.enabled && s.supports.ok) void this.fetchSource(id, query, controller, 1);
    }
  }

  private async fetchSource(id: SourceId, query: OccurrenceQuery, controller: AbortController, attempt: number) {
    const { signal } = controller;
    const s = this.sources[id];
    runInAction(() => {
      s.state = 'loading';
      s.stale = s.preview != null;
      s.retryAt = undefined;
    });
    try {
      if (id === 'obis') {
        const resolved = await resolveQueryTaxa(query, signal);
        if (signal.aborted) return;
        runInAction(() => {
          s.gbifOnlyTaxa = resolved.unresolved;
        });
      } else {
        runInAction(() => {
          s.gbifOnlyTaxa = [];
        });
      }
      const preview = await ADAPTERS[id].preview(query, signal);
      if (signal.aborted) return;
      runInAction(() => {
        s.preview = preview;
        s.state = 'ready';
        s.stale = false;
        s.error = undefined;
        s.retryAt = undefined;
        s.attempt = undefined;
      });
    } catch (error) {
      if (signal.aborted || isAbortError(error)) return;
      if (error instanceof HttpError && error.status === 429 && attempt < MAX_RATE_LIMIT_ATTEMPTS) {
        const wait = rateLimitBackoff(attempt);
        runInAction(() => {
          s.state = 'rateLimited';
          s.retryAt = Date.now() + wait;
          s.attempt = attempt + 1;
        });
        this.retryTimers[id] = setTimeout(() => {
          delete this.retryTimers[id];
          if (!signal.aborted) void this.fetchSource(id, query, controller, attempt + 1);
        }, wait);
        return;
      }
      runInAction(() => {
        s.state = 'error';
        s.preview = null;
        s.stale = false;
        s.retryAt = undefined;
        s.attempt = undefined;
        s.error = shortError(error);
      });
    }
  }

  /** Re-run one source's preview now (after an error or during a rate-limit wait). */
  retrySource(id: SourceId) {
    if (!isQueryRunnable(this.query).ok || !this.query.sources[id]) return;
    if (!ADAPTERS[id].supports(this.query).ok) return;
    const t = this.retryTimers[id];
    if (t) clearTimeout(t);
    delete this.retryTimers[id];
    let controller = this.previewController;
    if (!controller || controller.signal.aborted) {
      controller = new AbortController();
      this.previewController = controller;
    }
    void this.fetchSource(id, toJS(this.query), controller, 1);
  }

  /** Taxon suggestions from GBIF and OBIS, merged by name, with GBIF occurrence counts. */
  async suggestTaxa(q: string, signal?: AbortSignal): Promise<TaxonSuggestion[]> {
    const [gbif, obis] = await Promise.allSettled([suggestGbifTaxa(q, signal), suggestObisTaxa(q, signal)]);
    if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
    if (gbif.status === 'rejected' && obis.status === 'rejected') throw gbif.reason;
    const byName = new Map<string, TaxonSuggestion>();
    for (const t of gbif.status === 'fulfilled' ? gbif.value : []) {
      const key = t.name.toLowerCase();
      if (!byName.has(key)) byName.set(key, { ...t, inGbif: true, inObis: t.obisId != null });
    }
    for (const t of obis.status === 'fulfilled' ? obis.value : []) {
      const key = t.name.toLowerCase();
      const prev = byName.get(key);
      if (prev) {
        prev.inObis = true;
        prev.obisId ??= t.obisId;
        prev.gbifKey ??= t.gbifKey;
        prev.vernacularName ??= t.vernacularName;
        prev.path ??= t.path;
      } else {
        byName.set(key, { ...t, inGbif: t.gbifKey != null, inObis: true });
      }
    }
    const out = [...byName.values()].slice(0, MAX_SUGGESTIONS);
    await Promise.all(
      out.map(async (s) => {
        if (s.gbifKey == null) return;
        const cached = this.gbifCountCache.get(s.gbifKey);
        if (cached != null) {
          s.gbifCount = cached;
          return;
        }
        try {
          const n = await gbifTaxonCount(s.gbifKey, signal);
          this.gbifCountCache.set(s.gbifKey, n);
          s.gbifCount = n;
        } catch {
          // Counts are decoration; a failed count leaves the suggestion without one.
        }
      }),
    );
    if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
    return out;
  }

  /** Pin the current numbers as the "what if" reference. */
  pinBaseline(label?: string) {
    const kpis = this.kpis;
    if (!kpis) return;
    this.baseline = { kpis: toJS(kpis), total: this.ledgerTotal, label: label ?? this.querySummary };
  }

  /** Remove the pinned baseline. */
  clearBaseline() {
    this.baseline = null;
  }

  // --- Computeds --------------------------------------------------------------------

  /** Quality preset the filters match. */
  get preset(): Preset {
    const m = matchPreset(this.query.quality);
    return m === 'recommended' || m === 'permissive' ? m : 'custom';
  }

  /** Previews of enabled sources with a result. */
  get previews(): PreviewSummary[] {
    return contributingPreviews(this.sources);
  }

  /** Merged headline numbers, or null before the first preview. */
  get kpis(): Kpis | null {
    return mergeKpis(this.previews);
  }

  /** Overall preview status for skeletons and the "updating" veil. */
  get previewState(): 'empty' | 'first' | 'stale' | 'ready' | 'error' {
    if (!isQueryRunnable(this.query).ok) return 'empty';
    const enabled = SOURCE_IDS.filter((id) => this.query.sources[id]).map((id) => this.sources[id]);
    const busy = enabled.some((s) => s.state === 'loading' || s.state === 'rateLimited');
    const kpis = this.kpis;
    if (busy) return kpis ? 'stale' : 'first';
    if (kpis) return 'ready';
    if (enabled.some((s) => s.state === 'error')) return 'error';
    return 'empty';
  }

  /**
   * Per-species record counts from the plans, when known, before the minimum
   * records per species is applied (the ledger needs the species it removes).
   */
  get speciesCounts(): FacetBucket[] | null {
    const raw = this.currentRawPlans;
    if (!raw) return null;
    const lists = SOURCE_IDS.filter((id) => this.query.sources[id])
      .map((id) => raw[id]?.speciesCounts)
      .filter((l): l is FacetBucket[] => Array.isArray(l));
    return lists.length > 0 ? mergeBuckets(lists) : null;
  }

  /** Per-species counts of the species a load would keep (minimum records applied). */
  get keptSpeciesCounts(): FacetBucket[] | null {
    if (this.plans.state !== 'ready' || !this.currentRawPlans) return null;
    const lists = SOURCE_IDS.filter((id) => this.query.sources[id])
      .map((id) => this.plans.plans[id]?.speciesCounts)
      .filter((l): l is FacetBucket[] => Array.isArray(l));
    return lists.length > 0 ? mergeBuckets(lists) : null;
  }

  /** Unfiltered plans when they match the current query. */
  private get currentRawPlans(): Partial<Record<SourceId, StreamPlan>> | null {
    const raw = this.rawPlans;
    return raw && raw.key === previewKey(this.query) ? raw.plans : null;
  }

  /** Preview key for which plans should be fetched now, or null. */
  get planWanted(): string | null {
    if (!this.isOpen || this.previewState !== 'ready') return null;
    if (this.ledgerTotal > 2 * this.cap) return null;
    return previewKey(this.query);
  }

  /** One row per filter, impacts summed over sources. */
  get ledger(): LedgerRow[] {
    return buildLedger({
      query: this.query,
      previews: this.previews,
      memory: this.toggleMemory,
      speciesCounts: this.speciesCounts,
      loaded: this.lastLoad?.ledger ?? null,
    });
  }

  /** Records matching all filters, summed over sources. */
  get ledgerTotal(): number {
    return this.previews.reduce((sum, p) => sum + p.total, 0);
  }

  /** Year histogram without the year filter, summed over sources. */
  get mergedYearsAll(): { year: number; count: number }[] {
    return mergeYears(this.previews.map((p) => p.yearsAll ?? p.years));
  }

  /** Share of dated records (ignoring the year filter) from year `y` onwards. */
  yearShareAfter(y: number): number {
    let all = 0;
    let after = 0;
    for (const b of this.mergedYearsAll) {
      all += b.count;
      if (b.year >= y) after += b.count;
    }
    return all > 0 ? after / all : 0;
  }

  /** The five sampling-bias checks. */
  get biasFlags(): BiasFlag[] {
    return computeBiasFlags(
      {
        query: this.query,
        previews: this.previews,
        speciesCounts: this.keptSpeciesCounts,
        currentYear: new Date().getFullYear(),
      },
      {
        excludeDataset: (key) => this.excludeDataset(key),
        specimensOnly: () => {
          this.pinBaseline('Before: specimens only');
          this.setQuality({ basisOfRecord: [...SPECIMEN_BASIS] });
        },
        narrowYears: (from) => this.setYears([from, this.query.years[1]]),
        showCountries: () => this.setInsightFocus('countries'),
        setMinRecords: (n) => this.setQuality({ minRecordsPerSpecies: n }),
      },
    );
  }

  /** The active filter that removes the most records, with a one-step relax. */
  get biggestRestriction(): { row: LedgerRow; relax(): void; relaxLabel: string } | null {
    let row: LedgerRow | null = null;
    for (const r of this.ledger) {
      if (r.active && r.impact != null && r.impact > 0 && (!row || r.impact > (row.impact ?? 0))) row = r;
    }
    if (!row) return null;
    const id = row.id;
    if (id === 'uncertainty') {
      const m = this.query.quality.maxUncertaintyMeters ?? 0;
      return m < 10000
        ? { row, relaxLabel: 'Relax to 10 km', relax: () => this.setQuality({ maxUncertaintyMeters: 10000 }) }
        : { row, relaxLabel: 'Remove the uncertainty limit', relax: () => this.toggleFilter('uncertainty') };
    }
    const labels: Record<Exclude<LedgerRowId, 'uncertainty'>, string> = {
      basisOfRecord: 'Allow every basis of record',
      geospatialIssues: 'Keep records with geospatial issues',
      introduced: 'Include introduced populations',
      presentOnly: 'Include recorded absences',
      years: 'Use all years',
      depth: 'Use all depths',
      datasets: 'Include excluded datasets',
      minRecords: 'Keep all species',
    };
    return { row, relaxLabel: labels[id], relax: () => this.toggleFilter(id) };
  }

  /** Load size: exact from the plans when ready, else approximate from the previews. */
  get estimate(): Estimate | null {
    const enabled = SOURCE_IDS.filter((id) => this.query.sources[id] && this.sources[id].supports.ok);
    let plans: StreamPlan[] | null = null;
    if (this.plans.state === 'ready' && this.currentRawPlans) {
      plans = enabled.map((id) => this.plans.plans[id]).filter((p): p is StreamPlan => p != null);
    }
    return computeEstimate({ cap: this.cap, plans, previews: this.previews });
  }

  /** Whether Load is enabled, with a user-facing reason when not. */
  get canLoad(): Supports {
    const q = this.query;
    const run = isQueryRunnable(q);
    if (!run.ok) {
      return q.taxa.length === 0 && q.area.kind === 'world'
        ? { ok: false, reason: 'Add a taxon or narrow the area to a region' }
        : run;
    }
    if (!this.online) return { ok: false, reason: "You're offline" };
    const enabled = SOURCE_IDS.filter((id) => q.sources[id]);
    const support = enabled.map((id) => ADAPTERS[id].supports(q));
    if (!support.some((s) => s.ok)) {
      const first = support.find((s): s is { ok: false; reason: string } => !s.ok);
      return { ok: false, reason: first?.reason ?? 'No source can run this query' };
    }
    if (this.job && (this.job.state === 'planning' || this.job.state === 'streaming')) {
      return { ok: false, reason: 'A load is already running' };
    }
    if (this.estimate?.overCap) return { ok: false, reason: 'Over the cap' };
    return { ok: true };
  }

  /** Query sections changed since the last load. */
  get dirty(): Set<QuerySection> {
    const last = this.lastLoad?.query;
    return last ? dirtySections(toJS(this.query), last) : new Set();
  }

  /** The download whose DOI cites the loaded (or, before a load, the current) query. */
  get citingDownload(): GbifDownload | null {
    const load = this.lastLoad;
    return citingDownload(load, this.downloads, queryKey(load?.query ?? this.query));
  }

  /** Methods paragraph for the loaded dataset, or a draft for the current query before a load. */
  get methodsText(): string {
    const load = this.lastLoad as LoadProvenance | null;
    return buildMethodsText({
      load,
      query: this.query,
      downloadDoi: load?.gbifDownloadDoi ?? this.citingDownload?.doi,
      treeCitation: this.rootStore.phyloStore?.citationText,
    });
  }

  /** OBIS citation with dataset ids. */
  get obisCitation(): string {
    return buildObisCitation(this.lastLoad);
  }

  /** GBIF derived-dataset CSV (datasetKey,count). */
  get datasetCsv(): string {
    return buildDatasetCsv(this.lastLoad);
  }

  /** Decision ledger as CSV: filter impact (frozen at load), then the cleaning funnel. */
  get ledgerCsv(): string {
    const load = this.lastLoad;
    return buildLedgerCsv(load?.ledger ?? this.ledger, load?.funnel ?? null);
  }

  /** Short title, e.g. "Felidae · Neotropic · 1970–2025". */
  get querySummary(): string {
    return queryTitle(this.query);
  }

  // --- Plans ------------------------------------------------------------------------

  /** Fetch unfiltered plans for the current query; true when they are in place. */
  private async fetchPlans(signal?: AbortSignal): Promise<boolean> {
    this.planController?.abort();
    const controller = new AbortController();
    this.planController = controller;
    const onOuterAbort = () => controller.abort();
    signal?.addEventListener('abort', onOuterAbort, { once: true });
    const query = toJS(this.query);
    const key = previewKey(query);
    const ids = SOURCE_IDS.filter((id) => query.sources[id] && ADAPTERS[id].supports(query).ok);
    this.plans = { state: 'loading', plans: {} };
    const results = await Promise.allSettled(ids.map((id) => planSource(id, query, this.cap, controller.signal)));
    signal?.removeEventListener('abort', onOuterAbort);
    if (controller.signal.aborted) return false;
    const plans: Partial<Record<SourceId, StreamPlan>> = {};
    const errors: string[] = [];
    let rateLimited = false;
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        if (r.value) plans[ids[i]] = r.value;
      } else {
        if (r.reason instanceof HttpError && r.reason.status === 429) rateLimited = true;
        errors.push(`${ids[i].toUpperCase()}: ${shortError(r.reason)}`);
      }
    });
    runInAction(() => {
      if (this.planController === controller) this.planController = null;
      if (errors.length > 0) {
        this.plans = { state: rateLimited ? 'rateLimited' : 'error', plans, error: errors.join('; ') };
        return;
      }
      this.rawPlans = { key, plans };
      this.applyPlanFilter();
    });
    return errors.length === 0;
  }

  /** Recompute `plans` from the unfiltered plans with the current minimum records per species. */
  private applyPlanFilter() {
    const raw = this.currentRawPlans;
    if (!raw) return;
    const min = this.query.quality.minRecordsPerSpecies;
    const plans: Partial<Record<SourceId, StreamPlan>> = {};
    for (const id of SOURCE_IDS) {
      const p = raw[id];
      if (p) plans[id] = applyMinRecords(p, min);
    }
    this.plans = { state: 'ready', plans };
  }

  /** Species names the current query would load (minimum records applied), for the phylogeny tab. */
  async querySpecies(signal?: AbortSignal): Promise<string[]> {
    if (!(this.plans.state === 'ready' && this.currentRawPlans)) {
      if (!isQueryRunnable(this.query).ok) return [];
      const ok = await this.fetchPlans(signal);
      if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
      if (!ok) throw new Error(this.plans.error ?? 'Could not list the species for this query');
    }
    const ids = SOURCE_IDS.filter((id) => this.query.sources[id]);
    return planSpeciesNames(ids.map((id) => this.plans.plans[id]));
  }

  // --- Load -------------------------------------------------------------------------

  /** Set the record cap (whole records, at least 1). */
  setCap(n: number) {
    if (!Number.isFinite(n)) return;
    this.cap = Math.max(1, Math.round(n));
  }

  /** Replace or add on load. */
  setLoadMode(m: 'replace' | 'add') {
    this.loadMode = m;
  }

  /** Whether a load is planning or streaming. */
  get isLoading(): boolean {
    return this.job?.state === 'planning' || this.job?.state === 'streaming';
  }

  /** Plan, stream every enabled source, clean and hand the records to SpeciesStore. */
  async load(): Promise<void> {
    if (!this.canLoad.ok) return;
    const query = toJS(this.query);
    const mode = this.loadMode;
    const cap = this.cap;
    const controller = new AbortController();
    this.loadController = controller;
    this.cancelMode = null;
    const startedAt = Date.now();
    const ledger = this.ledger.map(({ loadedImpact: _, ...row }) => ({ ...row }));
    const titles = new Map<string, string>();
    for (const p of this.previews) for (const d of p.topDatasets) titles.set(d.key, d.label);
    this.job = {
      state: 'planning',
      label: queryTitle(query),
      startedAt,
      etaSeconds: null,
      perSource: [],
      funnel: emptyFunnel(),
      truncated: [],
    };
    const job = this.job;

    // Plan (reuse the plans fetched for this query).
    let plans: StreamPlan[];
    try {
      if (!(this.plans.state === 'ready' && this.currentRawPlans)) {
        const ok = await this.fetchPlans(controller.signal);
        if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
        if (!ok) throw new Error(this.plans.error ?? 'Planning failed');
      }
      const ids = SOURCE_IDS.filter((id) => query.sources[id]);
      plans = ids.map((id) => this.plans.plans[id]).filter((p): p is StreamPlan => p != null);
      if (plans.length === 0) throw new Error('No source can run this query');
    } catch (error) {
      runInAction(() => {
        const aborted = controller.signal.aborted || isAbortError(error);
        job.state = aborted ? 'cancelled' : 'error';
        if (!aborted) job.error = shortError(error);
        if (this.loadController === controller) this.loadController = null;
      });
      return;
    }

    // Clean: one cleaner for every source; "add" also drops duplicates of loaded points.
    const obisDetail = plans.find((p) => p.source === 'obis')?.detail as ObisExplorerDetail | undefined;
    const cleaner = new RecordCleaner({
      dedupe: query.quality.dedupe,
      area: query.area,
      lowCount: { obis: new Set(obisDetail?.lowCountNames ?? []) },
    });
    const seeded = new SeededDedupe(
      mode === 'add' ? query.quality.dedupe : 'none',
      mode === 'add' ? loadedPoints(this.rootStore) : [],
    );
    const tally = new LoadTally();
    const progress = new Map<SourceId, SourceProgress>(
      plans.map((p) => [
        p.source,
        {
          source: p.source,
          state: 'streaming',
          fetched: 0,
          expected: Math.min(p.expectedRecords, cap),
          requestsDone: 0,
          requestsTotal: p.requests,
          bytes: 0,
        },
      ]),
    );
    const planned = [...progress.values()].reduce((s, p) => s + p.expected, 0);
    const errors: string[] = [];
    const streams = plans.map((p) => ({
      source: p.source,
      stream: (p.source === 'gbif' ? streamGbif : streamObis)(p, { maxRecords: cap, signal: controller.signal }),
    }));

    let lastFlush = 0;
    const flush = (force: boolean) => {
      const now = Date.now();
      if (!force && now - lastFlush < JOB_UPDATE_MS) return;
      lastFlush = now;
      runInAction(() => {
        const perSource = [...progress.values()].map((p) => ({ ...p, truncated: p.truncated && [...p.truncated] }));
        job.perSource = perSource;
        job.funnel = seeded.adjust(cleaner.funnel);
        job.truncated = perSource.flatMap((p) => p.truncated ?? []);
        const fetched = perSource.reduce((s, p) => s + p.fetched, 0);
        job.etaSeconds = etaSeconds(fetched, planned, now - startedAt);
      });
    };
    const onError = (source: SourceId, error: unknown) => {
      const p = progress.get(source);
      if (p) p.state = 'error';
      errors.push(`${source.toUpperCase()}: ${shortError(error)}`);
    };
    const onDone = (source: SourceId) => {
      const p = progress.get(source);
      if (p) p.state = 'done';
    };

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      flush(true);
      this.finishLoad({ job, query, mode, controller, cleaner, seeded, tally, titles, ledger, planned, errors, plans });
    };

    async function* accepted(): AsyncGenerator<RecordBatch['records']> {
      try {
        for await (const batch of mergeBatches(streams, onError, onDone)) {
          if (controller.signal.aborted) break;
          const p = progress.get(batch.source);
          if (p) {
            Object.assign(p, batch.progress);
            p.state = batch.progress.retryAt && batch.progress.retryAt > Date.now() ? 'rateLimited' : 'streaming';
          }
          const records = seeded.filter(cleaner.accept(batch.records));
          tally.add(batch.source, records);
          flush(false);
          if (records.length > 0) yield records;
        }
      } finally {
        finish();
      }
    }

    runInAction(() => {
      job.state = 'streaming';
      job.perSource = [...progress.values()].map((p) => ({ ...p }));
    });
    const { speciesStore } = this.rootStore;
    try {
      await speciesStore.loadRecords(accepted(), {
        name: queryTitle(query),
        clear: mode === 'replace',
        controller,
      });
    } catch (error) {
      runInAction(() => {
        if (job.state === 'streaming' || job.state === 'done') {
          job.state = 'error';
          job.error = shortError(error);
        }
      });
    } finally {
      finish();
      runInAction(() => {
        if (this.loadController === controller) this.loadController = null;
      });
      if (this.cancelMode === 'discard' && this.job === job) {
        // loadRecords finishes (and runs Infomap) on what arrived; discard it again.
        this.rootStore.clearData();
      }
    }
  }

  /** Record the outcome of a load: job state, provenance and the recent list. */
  private finishLoad(ctx: {
    job: LoadJob;
    query: OccurrenceQuery;
    mode: 'replace' | 'add';
    controller: AbortController;
    cleaner: RecordCleaner;
    seeded: SeededDedupe;
    tally: LoadTally;
    titles: Map<string, string>;
    ledger: LedgerRow[];
    planned: number;
    errors: string[];
    plans: StreamPlan[];
  }) {
    const { job, query, controller, tally, errors, plans } = ctx;
    const funnel = ctx.seeded.adjust(ctx.cleaner.funnel);
    const cancelled = this.cancelMode ?? (controller.signal.aborted ? 'keep' : null);
    job.funnel = funnel;
    job.etaSeconds = cancelled ? null : 0;
    if (errors.length > 0) job.error = errors.join('; ');
    if (cancelled) job.state = 'cancelled';
    else if (errors.length >= plans.length && funnel.accepted === 0) job.state = 'error';
    else job.state = 'done';
    if (cancelled === 'discard' || job.state === 'error') return;

    const requests: Partial<Record<SourceId, unknown>> = {};
    for (const p of plans) {
      requests[p.source] = p.source === 'gbif' ? gbifDownloadPredicate(query) : (p.detail as ObisExplorerDetail).params;
    }
    const kpis: Kpis = {
      records: funnel.accepted,
      recordsUpperBound: false,
      species: tally.species.size,
      datasets: tally.datasetTotal,
      yearRange: tally.yearRange,
      bySource: { ...tally.bySource },
    };
    const load: LoadProvenance = {
      query,
      retrievedAt: new Date().toISOString(),
      mode: ctx.mode,
      funnel,
      ledger: ctx.ledger,
      kpis,
      partial: cancelled || errors.length > 0 ? { planned: ctx.planned, accepted: funnel.accepted } : null,
      datasetCounts: tally.datasetCounts(ctx.titles),
      requests,
    };
    this.lastLoad = load;
    this.recent = pushRecent(
      this.recent,
      { id: libraryId('recent'), name: queryTitle(query), query, savedAt: load.retrievedAt, kpis },
      queryKey,
    );
    writeStorage(STORAGE_KEYS.recent, this.recent);
  }

  /** Stop a running load: keep what arrived (Infomap runs on it) or discard it. */
  cancel(mode: 'keep' | 'discard') {
    const controller = this.loadController;
    if (!controller || !this.isLoading) return;
    this.cancelMode = mode;
    controller.abort();
    if (this.job?.state === 'planning') this.job.state = 'cancelled';
    if (mode === 'discard') this.rootStore.clearData();
  }

  // --- Citation ---------------------------------------------------------------------

  /** Store the DOI of a registered derived dataset (empty clears it). */
  setDerivedDoi(doi: string) {
    if (!this.lastLoad) return;
    const bare = doi.trim();
    this.lastLoad = { ...this.lastLoad, derivedDoi: bare || undefined };
  }

  /** Request a citable GBIF download for the loaded query; the password is used once and never stored. */
  async requestDownload({ user, password, email }: DownloadCredentials): Promise<void> {
    this.downloadController?.abort();
    const controller = new AbortController();
    this.downloadController = controller;
    const query = toJS(this.lastLoad?.query ?? this.query);
    this.downloadRequest = { state: 'requesting' };
    try {
      const key = await requestGbifDownload(
        { username: user.trim(), password, email: email.trim() || undefined, query },
        controller.signal,
      );
      runInAction(() => {
        const entry: StoredDownload = {
          key,
          status: 'PREPARING',
          createdAt: new Date().toISOString(),
          queryKey: queryKey(query),
        };
        this.downloads = [entry, ...this.downloads.filter((d) => d.key !== key)];
        this.downloadRequest = { state: 'done', key };
        writeStorage(STORAGE_KEYS.downloads, this.downloads);
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      runInAction(() => {
        this.downloadRequest = {
          state: 'error',
          error: error instanceof GbifDownloadError ? error.message : `GBIF download request failed: ${shortError(error)}`,
        };
      });
    } finally {
      if (this.downloadController === controller) this.downloadController = null;
    }
  }

  /** Refresh PREPARING/RUNNING downloads (runs every 30 s while any is active). */
  async pollDownloads(): Promise<void> {
    const active = this.downloads.filter((d) => ACTIVE_DOWNLOAD.has(d.status));
    if (active.length === 0) return;
    const controller = new AbortController();
    const results = await Promise.allSettled(active.map((d) => getGbifDownload(d.key, controller.signal)));
    const checkedAt = new Date().toISOString();
    runInAction(() => {
      results.forEach((r, i) => {
        if (r.status !== 'fulfilled') return;
        const s = r.value;
        this.downloads = this.downloads.map((d) =>
          d.key === active[i].key
            ? {
                ...d,
                status: downloadState(s.status),
                doi: s.doi ?? d.doi,
                totalRecords: s.totalRecords ?? d.totalRecords,
                size: s.size ?? d.size,
                downloadLink: s.status === 'FILE_ERASED' ? undefined : (s.downloadLink ?? d.downloadLink),
                checkedAt,
              }
            : d,
        );
      });
      writeStorage(STORAGE_KEYS.downloads, this.downloads);
    });
  }

  private setPolling(active: boolean) {
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = null;
    if (!active) return;
    const tick = async () => {
      try {
        await this.pollDownloads();
      } finally {
        if (this.pollTimer) this.pollTimer = setTimeout(tick, DOWNLOAD_POLL_MS);
      }
    };
    this.pollTimer = setTimeout(tick, DOWNLOAD_POLL_MS);
  }

  /** Parse a dropped GBIF download zip into a staging cleaner (the loaded data is not touched). */
  async importZip(file: File): Promise<void> {
    this.zipController?.abort();
    const controller = new AbortController();
    this.zipController = controller;
    this.zipFile = null;
    this.zipSummary = null;
    this.zipImport = { state: 'parsing', fileName: file.name };
    const query = toJS(this.lastLoad?.query ?? this.query);
    const cleaner = new RecordCleaner({ dedupe: query.quality.dedupe, area: query.area });
    let last = 0;
    try {
      const gen = importGbifZip(file, { signal: controller.signal, excludeIntroduced: query.quality.excludeIntroduced });
      let step = await gen.next();
      while (!step.done) {
        cleaner.accept(step.value.records);
        const now = Date.now();
        if (now - last > JOB_UPDATE_MS) {
          last = now;
          const funnel = cleaner.funnel;
          runInAction(() => {
            if (this.zipController === controller) this.zipImport = { state: 'parsing', fileName: file.name, funnel };
          });
        }
        step = await gen.next();
      }
      const summary = step.value;
      runInAction(() => {
        if (this.zipController !== controller) return;
        this.zipFile = file;
        this.zipSummary = summary;
        this.zipImport = { state: 'ready', fileName: file.name, funnel: cleaner.funnel };
      });
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) return;
      runInAction(() => {
        this.zipImport = {
          state: 'error',
          fileName: file.name,
          error: error instanceof Error ? error.message : String(error),
        };
      });
    } finally {
      if (this.zipController === controller) this.zipController = null;
    }
  }

  /** Load the parsed zip in place of the data, or keep the streamed data and cite the zip's DOI. */
  applyZip(choice: 'replace' | 'keepStreamCiteDoi') {
    const summary = this.zipSummary;
    if (this.zipImport?.state !== 'ready' || !summary) return;
    if (choice === 'keepStreamCiteDoi') {
      if (!this.lastLoad) return;
      const load: LoadProvenance = {
        ...(this.lastLoad as LoadProvenance),
        gbifDownloadKey: summary.downloadKey,
        gbifDownloadDoi: summary.doi,
      };
      this.lastLoad = load;
      return;
    }
    const file = this.zipFile;
    if (!file || this.isLoading) return;
    void this.loadZip(file, summary);
  }

  private async loadZip(file: Blob, summary: GbifZipSummary) {
    const previous = this.lastLoad as LoadProvenance | null;
    const query = toJS(previous?.query ?? this.query);
    const controller = new AbortController();
    this.loadController = controller;
    this.cancelMode = null;
    const label = summary.downloadKey ? `GBIF download ${summary.downloadKey}` : 'GBIF download';
    const job: LoadJob = {
      state: 'streaming',
      label,
      startedAt: Date.now(),
      etaSeconds: null,
      perSource: [],
      funnel: emptyFunnel(),
      truncated: [],
    };
    this.job = job;
    const cleaner = new RecordCleaner({ dedupe: query.quality.dedupe, area: query.area });
    const tally = new LoadTally();
    const expected = this.zipImport?.funnel?.received ?? summary.rows;
    const progress: SourceProgress = {
      source: 'gbif',
      state: 'streaming',
      fetched: 0,
      expected,
      requestsDone: 0,
      requestsTotal: 0,
    };
    let lastFlush = 0;
    const flush = (force: boolean) => {
      const now = Date.now();
      if (!force && now - lastFlush < JOB_UPDATE_MS) return;
      lastFlush = now;
      runInAction(() => {
        job.perSource = [{ ...progress }];
        job.funnel = cleaner.funnel;
        job.etaSeconds = etaSeconds(progress.fetched, expected, now - job.startedAt);
      });
    };
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      flush(true);
      runInAction(() => {
        const funnel = cleaner.funnel;
        const cancelled = this.cancelMode ?? (controller.signal.aborted ? 'keep' : null);
        job.state = cancelled ? 'cancelled' : job.state === 'error' ? 'error' : 'done';
        job.etaSeconds = null;
        if (cancelled === 'discard' || job.state === 'error') return;
        const load: LoadProvenance = {
          query,
          retrievedAt: new Date().toISOString(),
          mode: 'replace',
          funnel,
          ledger: previous?.ledger ?? this.ledger.map(({ loadedImpact: _, ...row }) => ({ ...row })),
          kpis: {
            records: funnel.accepted,
            recordsUpperBound: false,
            species: tally.species.size,
            datasets: tally.datasetTotal,
            yearRange: tally.yearRange,
            bySource: { ...tally.bySource },
          },
          partial: cancelled ? { planned: expected, accepted: funnel.accepted } : null,
          datasetCounts: tally.datasetCounts(),
          requests: { gbif: gbifDownloadPredicate(query) },
          gbifDownloadKey: summary.downloadKey,
          gbifDownloadDoi: summary.doi,
          fromZip: true,
        };
        this.lastLoad = load;
      });
    };
    async function* records(): AsyncGenerator<RecordBatch['records']> {
      try {
        for await (const batch of importGbifZip(file, {
          signal: controller.signal,
          excludeIntroduced: query.quality.excludeIntroduced,
        })) {
          if (controller.signal.aborted) break;
          progress.fetched += batch.records.length;
          const accepted = cleaner.accept(batch.records);
          tally.add('gbif', accepted);
          flush(false);
          if (accepted.length > 0) yield accepted;
        }
        progress.state = 'done';
      } finally {
        finish();
      }
    }
    try {
      await this.rootStore.speciesStore.loadRecords(records(), { name: label, clear: true, controller });
    } catch (error) {
      runInAction(() => {
        job.state = 'error';
        job.error = shortError(error);
      });
    } finally {
      finish();
      runInAction(() => {
        if (this.loadController === controller) this.loadController = null;
      });
      if (this.cancelMode === 'discard' && this.job === job) this.rootStore.clearData();
    }
  }

  // --- Library ----------------------------------------------------------------------

  /** Save the current query to the library. */
  saveQuery(name: string) {
    const kpis = this.kpis;
    const entry: SavedQuery = {
      id: libraryId('saved'),
      name: name.trim() || this.querySummary,
      query: toJS(this.query),
      savedAt: new Date().toISOString(),
      ...(kpis && { kpis: toJS(kpis) }),
    };
    this.saved = [entry, ...this.saved];
    writeStorage(STORAGE_KEYS.saved, this.saved);
  }

  /** Restore a saved, recent or example query (re-previews, never loads). */
  restore(id: string) {
    const entry = [...this.saved, ...this.recent, ...this.examples].find((s) => s.id === id);
    if (!entry) return;
    this.setQuery(entry.query);
  }

  /** Delete a saved (or recent) query. */
  deleteSaved(id: string) {
    if (this.saved.some((s) => s.id === id)) {
      this.saved = this.saved.filter((s) => s.id !== id);
      writeStorage(STORAGE_KEYS.saved, this.saved);
    } else if (this.recent.some((s) => s.id === id)) {
      this.recent = this.recent.filter((s) => s.id !== id);
      writeStorage(STORAGE_KEYS.recent, this.recent);
    }
  }

  /** Replace the query from JSON text (a query object, `{v: 1, q}` or a share string). */
  importQueryJson(text: string): Supports {
    const parsed = parseQueryText(text);
    if (!parsed.ok) return { ok: false, reason: parsed.reason };
    this.setQuery(parsed.query);
    return { ok: true };
  }

  /** The current query as JSON text. */
  exportQueryJson(): string {
    return JSON.stringify(toJS(this.query), null, 2);
  }

  /** Go back to editing the loaded query on the Occurrences tab (Load replaces). */
  editAndReload() {
    if (this.lastLoad) this.setQuery(this.lastLoad.query);
    this.loadMode = 'replace';
    this.tab = 'occurrences';
    this.minimized = false;
  }

  /** Replace the whole query (a deep copy); previews follow through the query reaction. */
  private setQuery(query: OccurrenceQuery) {
    const q = structuredClone(toJS(query));
    this.query = q;
    for (const id of SOURCE_IDS) this.sources[id].enabled = q.sources[id];
    this.tab = 'occurrences';
  }

  /** Expand or collapse the methods strip. */
  setMethodsExpanded(expanded: boolean) {
    this.methodsExpanded = expanded;
  }
}
