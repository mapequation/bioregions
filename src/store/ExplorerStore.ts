// State of the GBIF/OBIS data explorer: the query being edited, debounced per-source
// previews, the decision ledger and bias checks, loading (plans, streams, cleaning), provenance,
// citation and the query library. Contract: spec section 4 of
// docs/superpowers/specs/2026-10-30-data-explorer-ui.md.
import { makeAutoObservable, observable, reaction, runInAction, toJS, when } from 'mobx';
import { RecordCleaner, toSpeciesName } from '../sources/clean';
import { DEDUPE_RULE } from '../sources/methods';
import { supportsGbif } from '../sources/gbif';
import {
  type GbifDownloadStatus,
  GbifDownloadError,
  describeDownloadScope,
  downloadScope,
  getGbifDownload,
  requestGbifDownload,
  scopeDifferences,
} from '../sources/gbif/download';
import { gbifDownloadPredicate } from '../sources/gbif/predicate';
import { type GbifZipSummary, downloadKeyFromName, importGbifZip } from '../sources/gbif/zip';
import type { Funnel, RecordBatch, StreamPlan } from '../sources/types';
import { exampleStudies } from './explorer/examples';
import { LOAD_RUNNING } from './DataStore';
import type { ExampleEntry } from './data/catalog';
import { EMPTY_MESSAGES, emptyReasonOf, ledgerShare, partialLoad, shortError } from './data/streamLoad';
import type { DataLoadJob, QueryLoadRequest, StartResult } from './data/types';
import {
  JOB_UPDATE_MS,
  type LoadStats,
  LoadTally,
  PauseGate,
  type TallyLabels,
  etaSeconds,
} from './explorer/job';
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
import {
  applyMinRecords,
  computeEstimate,
  planSource,
  planSpeciesNames,
} from './explorer/plan';
import { regionByBbox } from '../sources/regions';
import {
  type LoadProvenance,
  buildDatasetCsv,
  buildLedgerCsv,
  buildMethodsText,
  buildObisCitation,
  citingDownload,
} from './explorer/provenance';
import { resolveTaxonNames, unknownTaxonLabel } from './explorer/taxonNames';
import type { SourceProgress } from './explorer/types';
import { previewGbifImpact, previewGbifSummary } from '../sources/gbif/preview';
import { gbifTaxonCount, suggestGbifTaxa } from '../sources/gbif/taxa';
import { HttpError, isAbortError } from '../sources/http';
import { supportsObis } from '../sources/obis/params';
import { previewObisParts } from '../sources/obis/preview';
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
  Composition,
  CountStory,
  DownloadCredentials,
  EmptyReason,
  Estimate,
  GbifDownload,
  InsightsScope,
  Kpis,
  LedgerRow,
  LedgerRowId,
  LoadJob,
  PlanState,
  Preset,
  MapScope,
  QuerySection,
  RecentShare,
  SavedQuery,
  SourceState,
  Tab,
  TaxonSuggestion,
  ToggleableRowId,
  ZipImport,
} from './explorer/types';
import type RootStore from './RootStore';

export const SOURCE_IDS: SourceId[] = ['gbif', 'obis'];
/** Pause after the last query edit before previewing (number fields and brush drags settle first). */
export const PREVIEW_DEBOUNCE_MS = 250;
/** Attempts (including the first) before a rate-limited preview counts as an error. */
export const MAX_RATE_LIMIT_ATTEMPTS = 5;
export const DEFAULT_CAP = 500_000;
export const MAX_SUGGESTIONS = 10;

/** Toggleable ledger rows, in display order (the fixed rules follow them). */
export const LEDGER_IDS: ToggleableRowId[] = [
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
/** Legend text for each bias threshold. */
export const BIAS_THRESHOLD_LABELS: Record<BiasId, string> = {
  datasetDominance: 'flagged above 30 % of records',
  humanObservation: 'flagged above 60 % of records',
  temporalSkew: 'flagged above 60 % of dated records',
  countryConcentration: 'flagged above 50 % of records',
  lowCountSpecies: 'flagged above 20 % of species',
};
/** A triggered bias flag is a warning at this multiple of its threshold, else a note. */
export const BIAS_WARNING_FACTOR = 1.5;
/** A bias remedy that would remove more than this share of the scope is discouraged. */
export const BIAS_DISCOURAGE_SHARE = 0.8;
/** OBIS share of a scope from which human observations read as marine survey effort. */
export const MARINE_OBIS_SHARE = 0.2;
/** Why a merged GBIF + OBIS preview's bias values are approximate. */
export const OVERLAP_NOTE = 'may change after GBIF/OBIS overlap removal';
/** "Recent" for the temporal-skew check: the last 15 years, inclusive. */
export const RECENT_YEARS = 15;
/** Species with fewer records than this count as low-count. */
export const LOW_COUNT = 5;
/** Basis of record kept by "Compare: specimens only". */
/** Buckets in `composition.topDatasets` and `topSpecies` for a loaded scope. */
export const COMPOSITION_TOP = 10;

export const SPECIMEN_BASIS: BasisOfRecord[] = ['PRESERVED_SPECIMEN', 'MATERIAL_SAMPLE'];

type PreviewImpact = Pick<PreviewSummary, 'baseTotal' | 'filterImpact'>;

interface PreviewAdapter {
  supports(query: OccurrenceQuery): Supports;
  /**
   * Start a preview: `summary` drives the KPIs, map and insights as soon as it lands;
   * `impact` (ledger base and per-filter counts) fills the decision ledger after.
   */
  preview(
    query: OccurrenceQuery,
    signal?: AbortSignal,
  ): { summary: Promise<PreviewSummary>; impact: Promise<PreviewImpact> };
}

const ADAPTERS: Record<SourceId, PreviewAdapter> = {
  gbif: {
    supports: (q) => supportsGbif(q),
    preview: (q, s) => ({ summary: previewGbifSummary(q, s), impact: previewGbifImpact(q, s) }),
  },
  obis: { supports: (q) => supportsObis(q), preview: (q, s) => previewObisParts(q, s) },
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
    impact: null,
    impactState: 'idle',
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

/** Load-button reason when every source's preview matched no record. */
export const NO_MATCHES_REASON = 'No records match this query';

/**
 * @deprecated removed in U1: the shape `lastLoad` had (a load's provenance with its mode and
 * empty-load outcome), kept for the UI until it reads `loaded` and `dataStore.job.outcome`.
 */
export type LegacyLoad = LoadProvenance & { mode: 'replace' | 'add'; emptyReason?: EmptyReason; previousKept?: boolean };

/**
 * Previews of enabled sources that have a (possibly stale) result, with the ledger counts
 * of the impact request merged in when they have arrived (the summary's own `baseTotal`,
 * set when no filter is active, wins over an older impact's).
 */
export function contributingPreviews(sources: Record<SourceId, SourceState>): PreviewSummary[] {
  const out: PreviewSummary[] = [];
  for (const id of SOURCE_IDS) {
    const { preview: p, impact, enabled } = sources[id];
    if (!enabled || !p) continue;
    if (!impact) {
      out.push(p);
      continue;
    }
    const baseTotal = p.baseTotal ?? impact.baseTotal;
    out.push({
      ...p,
      ...(baseTotal != null && { baseTotal: Math.max(baseTotal, p.total) }),
      filterImpact: { ...impact.filterImpact, ...p.filterImpact },
    });
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

const fmtCount = (n: number) => n.toLocaleString('en-US');

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
    case 'speciesLevel':
      return true;
    case 'duplicates':
    case 'crossSource':
      return q.dedupe !== 'none';
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
    case 'speciesLevel':
      return 'Not identified to species';
    case 'duplicates':
      return q.dedupe === 'none' ? 'Duplicates (kept)' : `Duplicates (${DEDUPE_RULE[q.dedupe]})`;
    case 'crossSource':
      return CROSS_SOURCE_LABEL;
  }
}

/** Label of the fixed ledger row for records received from both GBIF and OBIS. */
export const CROSS_SOURCE_LABEL = 'Same record in GBIF and OBIS';

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
  /** Common denominator of every share (records matching taxa + area only); null when unknown. */
  base: number | null;
  /** Records not identified to species (preview totals minus plan totals); null before plans. */
  speciesLevel?: number | null;
  /** Same-source duplicates removed by the last load of this query; null before a load. */
  duplicates?: number | null;
  /** Records the last load of this query dropped as already received from the other source. */
  crossSource?: number | null;
}

/**
 * One row per filter (impacts summed over the sources that report them), then the
 * two fixed rules. Every share uses the same base, so shares are comparable.
 */
export function buildLedger({
  query,
  previews,
  memory,
  speciesCounts,
  loaded,
  base,
  speciesLevel = null,
  duplicates = null,
  crossSource = null,
}: LedgerInput): LedgerRow[] {
  const filterRows = LEDGER_IDS.map((id): LedgerRow => {
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
    return { id, label: ledgerLabel(query, id, memory), toggleable: true, active, impact, share: ledgerShare(impact, base) };
  });
  const dedupe = query.quality.dedupe !== 'none';
  const fixedRows: LedgerRow[] = (
    [
      ['speciesLevel', speciesLevel],
      ['duplicates', dedupe ? duplicates : 0],
      ['crossSource', dedupe ? crossSource : 0],
    ] as const
  ).map(([id, impact]) => ({
    id,
    label: ledgerLabel(query, id, memory),
    toggleable: false,
    active: isFilterActive(query, id),
    impact,
    share: ledgerShare(impact, base),
  }));
  const rows = [...filterRows, ...fixedRows];
  if (loaded) {
    for (const row of rows) row.loadedImpact = loaded.find((r) => r.id === row.id)?.impact ?? null;
  }
  return rows;
}

export interface BiasActions {
  excludeDataset(key: string): void;
  specimensOnly(): void;
  narrowYears(from: number): void;
  showCountries(): void;
  setMinRecords(n: number): void;
  /** Turn OBIS off (its datasets cannot be excluded on the server). */
  useGbifOnly(): void;
  /** Pin the current numbers as the "what if" baseline. */
  pinBaseline(label: string): void;
}

export interface BiasInput {
  query: OccurrenceQuery;
  previews: PreviewSummary[];
  speciesCounts: FacetBucket[] | null;
  currentYear: number;
  /**
   * Statistics of the loaded records: when given, every check, share and remedy cost
   * describes them instead of the query preview (the 'loaded' and 'partial' scopes).
   */
  stats?: LoadStats | null;
}

/** What the bias checks read, from the merged previews or from the loaded records. */
interface BiasData {
  total: number;
  datasets: (FacetBucket & { source: SourceId })[];
  basis: FacetBucket[];
  years: { year: number; count: number }[];
  countries: FacetBucket[];
  /** Records the country shares are taken of (loaded records with a country code). */
  countryTotal: number;
  speciesCounts: FacetBucket[] | null;
  /** Records per source in the scope (before overlap removal on a preview). */
  bySource: Partial<Record<SourceId, number>>;
  /** A query preview (the checks describe the query, not loaded records). */
  preview: boolean;
}

function biasData({ previews, speciesCounts, stats }: BiasInput): BiasData {
  if (stats) {
    const countryTotal = Object.values(stats.withCountry).reduce((a, b) => a + (b ?? 0), 0);
    return {
      total: stats.total,
      datasets: stats.datasets,
      basis: stats.basisOfRecord,
      years: stats.years,
      countries: stats.countries,
      countryTotal,
      speciesCounts: stats.species,
      bySource: { ...stats.bySource },
      preview: false,
    };
  }
  const total = previews.reduce((sum, p) => sum + p.total, 0);
  const bySource: Partial<Record<SourceId, number>> = {};
  for (const p of previews) bySource[p.source] = (bySource[p.source] ?? 0) + p.total;
  return {
    bySource,
    preview: true,
    total,
    datasets: previews.flatMap((p) => p.topDatasets.map((b) => ({ ...b, source: p.source }))),
    basis: mergeBuckets(previews.map((p) => p.basisOfRecord)),
    years: mergeYears(previews.map((p) => p.years)),
    countries: mergeBuckets(previews.map((p) => p.countries)),
    countryTotal: total,
    speciesCounts,
  };
}

/** The five sampling-bias checks on the merged preview or the loaded records (empty without records). */
export function computeBiasFlags(input: BiasInput, actions: BiasActions): BiasFlag[] {
  const { query, currentYear } = input;
  const data = biasData(input);
  const { total, speciesCounts } = data;
  if (total <= 0) return [];
  /** A remedy never removes more records than the scope holds. */
  const capped = (n: number) => Math.min(total, Math.max(0, n));
  const gbifRecords = data.bySource.gbif ?? 0;
  const obisRecords = data.bySource.obis ?? 0;
  // A preview counts records shared by GBIF and OBIS twice; loading removes the overlap.
  const approximate = data.preview && gbifRecords > 0 && obisRecords > 0;
  const flag = (
    id: BiasId,
    value: number,
    text: string,
    action?: BiasFlag['action'],
    secondaryAction?: BiasFlag['secondaryAction'],
  ): BiasFlag => {
    const threshold = BIAS_THRESHOLDS[id];
    const triggered = value > threshold;
    // A remedy that leaves under a fifth of the records is shown as a consequence, not offered.
    const discouraged = action?.cost != null && action.cost > BIAS_DISCOURAGE_SHARE * total;
    return {
      id,
      triggered,
      ...(triggered && { level: value >= threshold * BIAS_WARNING_FACTOR ? 'warning' : 'note' }),
      value,
      threshold,
      thresholdLabel: BIAS_THRESHOLD_LABELS[id],
      text,
      ...(approximate && { approximate: true, approximateNote: OVERLAP_NOTE }),
      ...(action && { action: discouraged ? { ...action, discouraged: true, leaves: total - (action.cost ?? 0) } : action }),
      ...(secondaryAction && !discouraged && { secondaryAction }),
    };
  };

  // Dataset dominance: the single largest dataset across sources.
  let top: (FacetBucket & { source: SourceId }) | null = null;
  for (const b of data.datasets) if (!top || b.count > top.count) top = b;
  const topShare = top ? top.count / total : 0;
  const topKey = top?.key ?? '';
  const datasetFlag = flag(
    'datasetDominance',
    topShare,
    top
      ? `${pctLabel(topShare)} of records come from one dataset (${top.label}). Its sampling design can shape your regions.`
      : 'No single dataset dominates.',
    top?.source === 'gbif'
      ? {
          label: 'Exclude this dataset',
          title: `Exclude ${top.label}`,
          cost: capped(top.count),
          run: () => actions.excludeDataset(topKey),
        }
      : // OBIS datasets cannot be excluded on the server: the remedy is leaving OBIS out.
        top?.source === 'obis' && query.sources.gbif
        ? {
            label: 'Use GBIF only',
            title: `Turn OBIS off: ${top.label} cannot be excluded on its own`,
            cost: capped(total - gbifRecords),
            run: () => actions.useGbifOnly(),
          }
        : undefined,
  );

  // Human observations.
  const basis = data.basis;
  const human = basis.find((b) => b.key === 'HUMAN_OBSERVATION')?.count ?? 0;
  const humanShare = human / total;
  // Marine human observations are mostly survey effort (ship, aerial), not citizen science:
  // OBIS holds a real share of the scope (not a few stray records), or the area is an ocean.
  const marine =
    obisRecords >= MARINE_OBIS_SHARE * total ||
    (query.area.kind === 'bbox' && regionByBbox(query.area.bbox)?.group === 'Ocean');
  const humanFlag = flag(
    'humanObservation',
    humanShare,
    marine
      ? `${pctLabel(humanShare)} are human observations, mostly survey and sighting effort; coverage follows survey tracks.`
      : `${pctLabel(humanShare)} are human observations, often citizen science: dense near people and roads.`,
    sameBasis(query.quality.basisOfRecord, SPECIMEN_BASIS)
      ? undefined
      : {
          label: 'Specimens only',
          title: 'Compare: preserved specimens and material samples only, after pinning a baseline',
          cost: capped(total - basis.reduce((sum, b) => sum + (SPECIMEN_BASIS.includes(b.key as BasisOfRecord) ? b.count : 0), 0)),
          run: () => actions.specimensOnly(),
        },
  );

  // Temporal skew: share of dated records from the last 15 years (one source with the year brush).
  const years = data.years;
  const { cutoffYear: cutoff, share } = recentShareOf(years, currentYear);
  const recentShare = share ?? 0;
  const recent = years.reduce((sum, y) => sum + (y.year >= cutoff ? y.count : 0), 0);
  const [fromYear, toYear] = query.years;
  const lastYear = toYear ?? (years.length > 0 ? years[years.length - 1].year : currentYear);
  const canNarrow = (fromYear == null || fromYear < cutoff) && lastYear >= cutoff;
  const recentRange = lastYear > cutoff ? `${cutoff}–${lastYear}` : `${cutoff}`;
  const temporalFlag = flag(
    'temporalSkew',
    recentShare,
    `${pctLabel(recentShare)} of records are from ${cutoff} or later; historical ranges may be missing.`,
    canNarrow
      ? {
          label: `Use recent records only (${recentRange})`,
          title: `Restrict to ${recentRange}: drops older and undated records, so historical ranges stay missing`,
          // Undated records go too, so the cost is everything outside the recent years.
          cost: capped(total - recent),
          run: () => actions.narrowYears(cutoff),
        }
      : undefined,
    canNarrow
      ? {
          label: 'Compare first: pin baseline, then restrict',
          run: () => {
            actions.pinBaseline(`Before: ${recentRange} only`);
            actions.narrowYears(cutoff);
          },
        }
      : undefined,
  );

  // Country concentration (not meaningful when the area is one country).
  const topCountry = data.countries[0];
  const oneCountry = query.area.kind === 'countries' && query.area.codes.length === 1;
  const countryShare = topCountry && !oneCountry && data.countryTotal > 0 ? topCountry.count / data.countryTotal : 0;
  const ofRecords = data.countryTotal < total ? 'of records with a country' : 'of records';
  const countryFlag = flag(
    'countryConcentration',
    countryShare,
    topCountry && !oneCountry
      ? `${pctLabel(countryShare)} ${ofRecords} are from ${topCountry.label}; effort differs between countries.`
      : 'Records are not concentrated in one country.',
    topCountry && !oneCountry ? { label: 'Show countries', run: () => actions.showCountries() } : undefined,
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
      (query.quality.minRecordsPerSpecies ?? 1) >= LOW_COUNT
        ? undefined
        : {
            label: `${LOW_COUNT}+ records per species`,
            title: `Set a minimum of ${LOW_COUNT} records per species`,
            cost: capped(speciesCounts.reduce((sum, b) => sum + (b.count < LOW_COUNT ? b.count : 0), 0)),
            run: () => actions.setMinRecords(LOW_COUNT),
          },
    );
  } else {
    lowFlag = flag('lowCountSpecies', 0, 'Records per species are known once the load is planned.');
  }

  return [datasetFlag, humanFlag, temporalFlag, countryFlag, lowFlag];
}

/**
 * Share of dated records from the last `RECENT_YEARS` years (inclusive) in a merged,
 * filtered year histogram: the temporal-skew check and the year brush both read it.
 */
export function recentShareOf(
  years: { year: number; count: number }[],
  currentYear: number,
  scope: RecentShare['scope'] = 'query',
): RecentShare {
  const cutoffYear = currentYear - (RECENT_YEARS - 1);
  let dated = 0;
  let recent = 0;
  for (const y of years) {
    dated += y.count;
    if (y.year >= cutoffYear) recent += y.count;
  }
  return { cutoffYear, share: dated > 0 ? recent / dated : null, scope };
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

/** Log preview request timings in development (`localStorage.explorerTimings = '1'` in production). */
function logTiming(source: SourceId, part: 'summary' | 'impact', started: number) {
  let on = (import.meta as { env?: { DEV?: boolean } }).env?.DEV ?? false;
  try {
    on ||= globalThis.localStorage?.getItem('explorerTimings') === '1';
  } catch {
    // Storage blocked: keep the default.
  }
  if (on) console.debug(`[explorer] ${source} ${part} ${Math.round(performance.now() - started)} ms`);
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

/** What a GBIF download was made for, compared with a query. */
export interface DownloadCheck {
  match: 'match' | 'mismatch' | 'unknown';
  /** Parts that differ ('taxa', 'area', 'years'); empty on a match. */
  differences: ('taxa' | 'area' | 'years')[];
  /** The download's own taxa, area and years in words. */
  text?: string;
  doi?: string;
  /** Why the check could not be made (offline, request failed, no predicate). */
  failure?: string;
}

/** Most taxon names looked up for a download's description. */
const MAX_NAME_LOOKUPS = 5;
/** Give up on the download's metadata after this long. */
const DOWNLOAD_CHECK_MS = 15_000;

/**
 * Fetch a download's metadata from GBIF and compare its taxa, area and years with the
 * query's own download predicate (order-independent). Never throws: without the
 * metadata the result is 'unknown'.
 */
export async function checkDownload(
  key: string,
  query: OccurrenceQuery,
  signal?: AbortSignal,
  fetchStatus: (key: string, signal?: AbortSignal) => Promise<GbifDownloadStatus> = getGbifDownload,
  taxonNames: (keys: string[], signal?: AbortSignal) => Promise<Map<string, string>> = resolveTaxonNames,
): Promise<DownloadCheck> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { match: 'unknown', differences: [], failure: 'offline' };
  }
  const signals = [signal, AbortSignal.timeout(DOWNLOAD_CHECK_MS)].filter((s): s is AbortSignal => s != null);
  const timed = AbortSignal.any(signals);
  let status: GbifDownloadStatus;
  try {
    status = await fetchStatus(key, timed);
  } catch (error) {
    return { match: 'unknown', differences: [], failure: shortError(error) };
  }
  const doi = status.doi?.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '') || undefined;
  const predicate = status.request?.predicate;
  if (!predicate) return { match: 'unknown', differences: [], doi, failure: 'no request in the metadata' };
  const theirs = downloadScope(predicate);
  const differences = scopeDifferences(theirs, downloadScope(gbifDownloadPredicate(query)));
  const names = new Map<string, string>();
  for (const t of query.taxa) if (t.gbifKey != null) names.set(String(t.gbifKey), t.name);
  const unknown = theirs.taxonKeys.filter((k) => !names.has(k));
  if (unknown.length > 0) {
    try {
      for (const [k, v] of await taxonNames(unknown.slice(0, MAX_NAME_LOOKUPS), timed)) names.set(k, v);
    } catch {
      // Names are cosmetic: unresolved keys get the fallback below.
    }
    // Never "GBIF taxon 935Y2": keys no service could name say so.
    for (const k of unknown) if (!names.has(k)) names.set(k, unknownTaxonLabel(k));
  }
  return {
    match: differences.length === 0 ? 'match' : 'mismatch',
    differences,
    text: describeDownloadScope(theirs, names),
    doi,
  };
}

/**
 * The verdict on a parsed download zip: whether it may replace the data on screen or
 * cite it, and a sentence saying why. Counts are compared with the GBIF records on screen.
 */
export function zipVerdict(p: {
  key: string | undefined;
  doi: string | undefined;
  check: DownloadCheck | null;
  accepted: number;
  received: number;
  streamGbifRecords: number;
  hasData: boolean;
}): Pick<ZipImport, 'downloadKey' | 'doi' | 'queryMatch' | 'downloadQueryText' | 'canReplace' | 'canCiteDoi' | 'note'> {
  const queryMatch = p.check?.match ?? 'unknown';
  const out = {
    ...(p.key && { downloadKey: p.key }),
    ...(p.doi && { doi: p.doi }),
    queryMatch,
    ...(p.check?.text && { downloadQueryText: p.check.text }),
    canReplace: queryMatch === 'match' && p.accepted > 0,
    canCiteDoi: queryMatch === 'match' && p.hasData && !!p.doi,
  };
  const n = fmtCount;
  let note: string;
  if (queryMatch === 'unknown') {
    note = !p.key
      ? 'No GBIF download key in the file name or the zip, so what it was made for cannot be checked. It is not used to replace or cite your data.'
      : `Could not read download ${p.key} from GBIF (${p.check?.failure ?? 'no response'}), so what it was made for cannot be checked. Try again online before replacing or citing.`;
  } else if (queryMatch === 'mismatch') {
    const what = p.check?.differences.length ? listWords(p.check.differences) : 'query';
    const none = p.accepted === 0 && p.received > 0 ? ` None of its ${n(p.received)} records pass your query's area and cleaning.` : '';
    note = `This download was made for a different query (its ${what} differ${p.check?.differences.length === 1 ? 's' : ''}), so its DOI cannot cite the data on screen and it cannot replace it.${none}`;
  } else if (p.accepted === 0) {
    note = `Made for this query, but none of its ${n(p.received)} records pass the area and cleaning, so there is nothing to load.`;
  } else if (!p.hasData || p.streamGbifRecords === 0) {
    note = `Made for this query: ${n(p.accepted)} of its ${n(p.received)} records pass cleaning.`;
  } else if (p.accepted === p.streamGbifRecords) {
    note = `Made for this query: its ${n(p.accepted)} records after cleaning equal the ${n(p.streamGbifRecords)} GBIF records loaded on screen.`;
  } else {
    note = `Made for this query; GBIF changed between the two snapshots: ${n(p.accepted)} records after cleaning here, ${n(p.streamGbifRecords)} GBIF records loaded on screen.`;
  }
  if (queryMatch === 'match' && p.hasData && !p.doi) note += ' The zip carries no DOI to cite.';
  return { ...out, note };
}

/** "taxa", "taxa and area", "taxa, area and years". */
function listWords(items: string[]): string {
  return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

// --- Store -------------------------------------------------------------------------

export default class ExplorerStore {
  rootStore: RootStore;

  /** Whether the full-screen explorer is shown. */
  isOpen = false;
  /** Active header tab. */
  tab: Tab = 'occurrences';
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
  /** The running or last zip load. TODO(S2b): zip loads become data-store jobs. */
  private zipJob: LoadJob | null = null;
  /** The user's map scope while a load matches the query; null = the default (`mapScope`). */
  mapScopeChoice: MapScope | null = null;
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
  /** Holds the running load's batches while paused (`pauseLoad`). */
  private pauseGate: PauseGate | null = null;
  /** Pushes the running load's exact counts to `job` (set while a load streams). */
  private pauseFlush: (() => void) | null = null;

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
      // The map scope returns to its default when the load stops matching or a new one lands.
      reaction(
        () => [this.mapLoadedAvailable, this.loaded?.retrievedAt] as const,
        () => {
          this.mapScopeChoice = null;
        },
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
    if (tab) this.tab = tab;
    const idle = SOURCE_IDS.every((id) => !this.query.sources[id] || this.sources[id].state === 'idle');
    if (idle && isQueryRunnable(this.query).ok) this.schedulePreview();
  }

  /** Hide the explorer. */
  close() {
    this.isOpen = false;
  }

  /** Switch header tab. */
  setTab(tab: Tab) {
    this.tab = tab;
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
    if (id === 'speciesLevel' || id === 'duplicates') return;
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
          impact: null,
          impactState: 'idle',
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
        Object.assign(s, {
          preview: null,
          impact: null,
          impactState: 'idle',
          state: 'idle',
          stale: false,
          error: undefined,
          retryAt: undefined,
        });
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
      const started = performance.now();
      const { summary, impact } = ADAPTERS[id].preview(query, signal);
      runInAction(() => {
        s.impactState = 'loading';
      });
      void impact.then(
        (value) => {
          if (signal.aborted) return;
          logTiming(id, 'impact', started);
          runInAction(() => {
            s.impact = value;
            s.impactState = 'ready';
          });
        },
        (error) => {
          if (signal.aborted || isAbortError(error)) return;
          runInAction(() => {
            s.impact = { filterImpact: {} };
            s.impactState = 'error';
          });
        },
      );
      const preview = await summary;
      if (signal.aborted) return;
      logTiming(id, 'summary', started);
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
        s.impact = null;
        s.impactState = 'idle';
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

  /**
   * Merged headline numbers, or null before the first preview. Once the plans are in,
   * `species` counts the distinct species names a load would bring (what the phylogeny
   * tab lists): GBIF can hold two species keys with one name (e.g. Callithrix geoffroyi).
   */
  get kpis(): Kpis | null {
    const kpis = mergeKpis(this.previews);
    const names = this.planNames;
    return kpis && names ? { ...kpis, species: names.length } : kpis;
  }

  /** Distinct species names of the current plans (minimum records applied), or null before plans. */
  private get planNames(): string[] | null {
    if (this.plans.state !== 'ready' || !this.currentRawPlans) return null;
    const ids = SOURCE_IDS.filter((id) => this.query.sources[id] && this.sources[id].supports.ok);
    const plans = ids.map((id) => this.plans.plans[id]);
    if (plans.length === 0 || plans.some((p) => !p?.speciesCounts)) return null;
    return planSpeciesNames(plans);
  }

  /**
   * Plan species entries (minimum records applied) whose name is not a usable species
   * binomial: their records are dropped as "not identified to species", and the
   * phylogeny tab cannot list them. 0 before plans.
   */
  get speciesWithoutName(): number {
    if (this.plans.state !== 'ready' || !this.currentRawPlans) return 0;
    let n = 0;
    for (const id of SOURCE_IDS) {
      if (!this.query.sources[id]) continue;
      for (const b of this.plans.plans[id]?.speciesCounts ?? []) if (!toSpeciesName(b.label)) n++;
    }
    return n;
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
   * True while a source's ledger counts (base and per-filter impact) are still being
   * fetched after its summary arrived; the ledger shows the previous counts dimmed.
   */
  get impactPending(): boolean {
    return SOURCE_IDS.some((id) => {
      const s = this.sources[id];
      return this.query.sources[id] && s.supports.ok && s.impactState === 'loading';
    });
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
      loaded: this.loaded?.ledger ?? null,
      base: this.ledgerBase,
      speciesLevel: this.speciesLevelImpact,
      duplicates: this.loadedForQuery?.funnel.dropped.duplicate ?? null,
      crossSource: this.loadedForQuery?.funnel.dropped.crossSource ?? null,
    });
  }

  /** The dedupe rule in words for the current mode, e.g. "same species within ~11 m". */
  get dedupeLabel(): string {
    return DEDUPE_RULE[this.query.quality.dedupe];
  }

  /** Records matching the taxa and area with no ledger filter, summed over contributing sources. */
  get ledgerBase(): number | null {
    const previews = this.previews;
    if (previews.length === 0) return null;
    let base = 0;
    for (const p of previews) {
      if (p.baseTotal == null) return null;
      base += Math.max(p.baseTotal, p.total);
    }
    return base;
  }

  /**
   * Records matching every filter that are not identified to species: preview totals
   * minus the unfiltered plan totals (per source, never negative); null before plans.
   */
  get speciesLevelImpact(): number | null {
    const raw = this.currentRawPlans;
    if (this.plans.state !== 'ready' || !raw) return null;
    let impact = 0;
    for (const p of this.previews) {
      const plan = raw[p.source];
      if (plan && this.sources[p.source].supports.ok) impact += Math.max(0, p.total - plan.expectedRecords);
    }
    return impact;
  }

  /** The last load when it was made with the current query, else null. */
  private get loadedForQuery(): LoadProvenance | null {
    const load = this.loaded;
    return load && this.dirty.size === 0 ? load : null;
  }

  /** Whether the loaded dataset is exactly what the current query describes. */
  get loadedMatchesQuery(): boolean {
    return this.loaded != null && this.dirty.size === 0 && !this.isLoading;
  }

  /** One derivation chain from matching records to the loaded dataset. */
  get countStory(): CountStory {
    const est = this.estimate;
    const load = this.loadedForQuery;
    const dropped = load?.funnel.dropped;
    return {
      matching: this.kpis ? this.ledgerTotal : null,
      speciesLevel: est?.exact ? est.records : null,
      duplicates: dropped ? (dropped.duplicate ?? 0) + (dropped.crossSource ?? 0) : null,
      crossSource: dropped ? (dropped.crossSource ?? 0) : null,
      loaded: load ? load.funnel.accepted : null,
    };
  }

  /**
   * What the insights describe: the previewed query; once that query is loaded, the
   * query you loaded; after a stopped load, the partial dataset.
   */
  get insightsScope(): InsightsScope {
    const load = this.loadedMatchesQuery ? this.loaded : null;
    if (load && load.accepted > 0 && load.partial) {
      const p = load.partial;
      const species =
        p.speciesPlanned != null && p.speciesPlanned > 0 ? ` (${fmtCount(p.speciesLoaded)} of ${fmtCount(p.speciesPlanned)} species)` : '';
      return {
        kind: 'partial',
        records: load.accepted,
        label: `For the partial load · ${fmtCount(load.accepted)} of ~${fmtCount(p.planned)} records loaded${species}`,
      };
    }
    if (load && load.accepted > 0) {
      return { kind: 'loaded', records: load.accepted, label: `For the query you loaded · ${fmtCount(load.accepted)} records loaded` };
    }
    const records = this.ledgerTotal;
    return { kind: 'query', records, label: `For the query · ${fmtCount(records)} matching records` };
  }

  /**
   * Share of dated records in the last 15 years, in the insights scope: the merged,
   * filtered preview histogram, or the loaded records' years ('loaded', also for a
   * partial load).
   */
  get recentShare(): RecentShare {
    const year = new Date().getFullYear();
    const stats = this.scopeStats;
    if (stats) return recentShareOf(stats.years, year, 'loaded');
    return recentShareOf(mergeYears(this.previews.map((p) => p.years)), year);
  }

  /** Whether the map can show loaded records that match the query on screen. */
  get mapLoadedAvailable(): boolean {
    return this.loadedMatchesQuery && (this.loaded?.accepted ?? 0) > 0;
  }

  /**
   * What the map shows: 'loaded' by default once a load matches the query (not dirty,
   * not loading), else 'query'. `setMapScope` overrides the default until the query
   * diverges from the load or a new load lands.
   */
  get mapScope(): MapScope {
    if (!this.mapLoadedAvailable) return 'query';
    return this.mapScopeChoice ?? 'loaded';
  }

  setMapScope(scope: MapScope) {
    this.mapScopeChoice = scope;
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

  /**
   * Statistics of the loaded records when the insights describe a load ('loaded' or
   * 'partial' scope); null while previewing.
   */
  get scopeStats(): LoadStats | null {
    if (this.insightsScope.kind === 'query') return null;
    return this.loaded?.stats ?? null;
  }

  /** What the data is made of, in the insights scope (`insightsScope.kind`). */
  get composition(): Composition {
    const scope = this.insightsScope;
    const stats = this.scopeStats;
    if (stats) {
      const withCountry = Object.values(stats.withCountry).reduce((a, b) => a + (b ?? 0), 0);
      const loaded = scope.kind === 'partial' ? 'records loaded so far' : 'loaded records';
      const notes: NonNullable<Composition['notes']> = {
        issues: 'GBIF interpretation issues are counted for the query preview only, not for loaded records.',
      };
      if (withCountry < stats.total) {
        const obisOnly = (stats.bySource.obis ?? 0) > 0;
        notes.countries = `Countries are known for ${fmtCount(withCountry)} of ${fmtCount(stats.total)} ${loaded}${
          obisOnly ? ' (OBIS records often carry no country code)' : ''
        }.`;
      }
      return {
        basisOfRecord: stats.basisOfRecord,
        topDatasets: stats.datasets.slice(0, COMPOSITION_TOP).map(({ source: _, ...b }) => b),
        topSpecies: stats.species.slice(0, COMPOSITION_TOP),
        countries: stats.countries,
        issues: [],
        uncertainty: stats.uncertainty,
        total: stats.total,
        scopeKind: scope.kind,
        notes,
      };
    }
    const previews = this.previews;
    let uncertainty: Composition['uncertainty'] = null;
    let weighted = 0;
    let weight = 0;
    for (const p of previews) {
      const u = p.uncertainty;
      if (!u) continue;
      uncertainty = uncertainty
        ? { min: Math.min(uncertainty.min, u.min), max: Math.max(uncertainty.max, u.max), avg: 0 }
        : { ...u, avg: 0 };
      const w = Math.max(1, p.total);
      weighted += u.avg * w;
      weight += w;
    }
    if (uncertainty) uncertainty.avg = weighted / weight;
    return {
      basisOfRecord: mergeBuckets(previews.map((p) => p.basisOfRecord)),
      topDatasets: mergeBuckets(previews.map((p) => p.topDatasets)),
      topSpecies: mergeBuckets(previews.map((p) => p.topSpecies)),
      countries: mergeBuckets(previews.map((p) => p.countries)),
      issues: mergeBuckets(previews.map((p) => p.issues)),
      uncertainty,
      total: this.ledgerTotal,
      // A load whose statistics are missing (older provenance) is described by the preview.
      scopeKind: 'query',
    };
  }

  /** The five sampling-bias checks, on the same scope as `composition`. */
  get biasFlags(): BiasFlag[] {
    return computeBiasFlags(
      {
        query: this.query,
        previews: this.previews,
        speciesCounts: this.keptSpeciesCounts,
        currentYear: new Date().getFullYear(),
        stats: this.scopeStats,
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
        useGbifOnly: () => this.setSourceEnabled('obis', false),
        pinBaseline: (label) => this.pinBaseline(label),
      },
    );
  }

  /** The active filter that removes the most records, with a one-step relax. */
  get biggestRestriction(): { row: LedgerRow; relax(): void; relaxLabel: string } | null {
    let row: LedgerRow | null = null;
    for (const r of this.ledger) {
      if (r.toggleable && r.active && r.impact != null && r.impact > 0 && (!row || r.impact > (row.impact ?? 0))) row = r;
    }
    if (!row) return null;
    const id = row.id;
    if (id === 'speciesLevel' || id === 'duplicates' || id === 'crossSource') return null;
    if (id === 'uncertainty') {
      const m = this.query.quality.maxUncertaintyMeters ?? 0;
      return m < 10000
        ? { row, relaxLabel: 'Relax to 10 km', relax: () => this.setQuality({ maxUncertaintyMeters: 10000 }) }
        : { row, relaxLabel: 'Remove the uncertainty limit', relax: () => this.toggleFilter('uncertainty') };
    }
    const labels: Record<Exclude<ToggleableRowId, 'uncertainty'>, string> = {
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
    // One occurrence load at a time (I9), whichever entry point started it.
    if (this.rootStore.dataStore?.isLoading || this.isLoading) {
      return { ok: false, reason: 'A load is already running' };
    }
    if (this.previewsAllZero) return { ok: false, reason: NO_MATCHES_REASON };
    if (this.estimate?.overCap) return { ok: false, reason: 'Over the cap' };
    return { ok: true };
  }

  /**
   * True when every enabled source that supports the query has a settled preview of 0
   * records: loading would fetch nothing. False while any of those previews is pending.
   */
  get previewsAllZero(): boolean {
    const q = this.query;
    const ids = SOURCE_IDS.filter((id) => q.sources[id] && ADAPTERS[id].supports(q).ok);
    if (ids.length === 0) return false;
    return ids.every((id) => {
      const s = this.sources[id];
      return s.state === 'ready' && !s.stale && s.preview != null && s.preview.total === 0;
    });
  }

  /** Query sections changed since the last load. */
  get dirty(): Set<QuerySection> {
    const last = this.loaded?.query;
    return last ? dirtySections(toJS(this.query), last) : new Set();
  }

  /** The download whose DOI cites the loaded (or, before a load, the current) query. */
  get citingDownload(): GbifDownload | null {
    const load = this.loaded;
    return citingDownload(load, this.downloads, queryKey(load?.query ?? this.query));
  }

  /** Methods paragraph for the loaded query; empty before a load (no draft, I4). */
  get methodsText(): string {
    const load = this.loaded;
    if (!load) return '';
    return buildMethodsText({
      load,
      downloadDoi: load.gbifDownloadDoi ?? this.citingDownload?.doi,
      treeCitation: this.rootStore.phyloStore?.citationText,
    });
  }

  /** OBIS citation with dataset ids. */
  get obisCitation(): string {
    return buildObisCitation(this.loaded);
  }

  /** GBIF derived-dataset CSV (datasetKey,count). */
  get datasetCsv(): string {
    return buildDatasetCsv(this.loaded);
  }

  /** Decision ledger as CSV: filter impact (frozen at load), then the cleaning funnel. */
  get ledgerCsv(): string {
    const load = this.loaded;
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

  /** Names of dataset, basis and country keys from the preview facets, for load statistics. */
  private get facetLabels(): TallyLabels {
    const datasets = new Map<string, string>();
    const basisOfRecord = new Map<string, string>();
    const countries = new Map<string, string>();
    for (const p of this.previews) {
      for (const d of p.topDatasets) datasets.set(d.key, d.label);
      for (const b of p.basisOfRecord) basisOfRecord.set(b.key, b.label);
      for (const c of p.countries) countries.set(c.key, c.label);
    }
    return { datasets, basisOfRecord, countries };
  }

  /** Whether an explorer load (a query, or a zip until S2b) is planning or streaming. */
  get isLoading(): boolean {
    const state = this.job?.state;
    return state === 'planning' || state === 'streaming';
  }

  /**
   * Provenance of the loaded query source (or of a zip "Replace") once it has finished; null
   * while it streams and whenever the occurrence slot holds anything else, so every reader
   * sees "nothing loaded" then (I4).
   */
  get loaded(): LoadProvenance | null {
    const source = this.rootStore.dataStore?.occurrence;
    if (source?.status !== 'done') return null;
    return source.kind === 'explorer-query' || source.kind === 'gbif-zip' ? source.provenance : null;
  }

  /**
   * Plans for `query` with `cap`, without side effects: the workspace's own plans when they
   * are for the same query and cap, else fresh ones, which are never written to `plans`,
   * `rawPlans` or `planController`. Rejects when a source fails to plan.
   */
  async planQuery(query: OccurrenceQuery, cap: number, signal: AbortSignal): Promise<StreamPlan[]> {
    const ids = SOURCE_IDS.filter((id) => query.sources[id]);
    if (queryKey(query) === queryKey(this.query) && cap === this.cap && this.plans.state === 'ready' && this.currentRawPlans) {
      return ids.map((id) => this.plans.plans[id]).filter((p): p is StreamPlan => p != null);
    }
    const runnable = ids.filter((id) => ADAPTERS[id].supports(query).ok);
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
    try {
      const results = await Promise.allSettled(runnable.map((id) => planSource(id, query, cap, controller.signal)));
      if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      const plans: StreamPlan[] = [];
      const errors: string[] = [];
      results.forEach((r, i) => {
        if (r.status === 'rejected') errors.push(`${runnable[i].toUpperCase()}: ${shortError(r.reason)}`);
        else if (r.value) plans.push(applyMinRecords(r.value, query.quality.minRecordsPerSpecies));
      });
      if (errors.length > 0) throw new Error(errors.join('; '));
      return plans;
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
  }

  /**
   * Load the workspace query through `dataStore.loadQuery` (labels from the preview facets,
   * the ledger frozen now), and add it to the recent list when it committed.
   */
  async load(opts: { exampleId?: string } = {}): Promise<StartResult> {
    const can = this.canLoad;
    if (!can.ok) return { started: false, reason: can.reason };
    const query = toJS(this.query);
    const cap = this.cap;
    // TODO(S2b): zip loads become data-store jobs.
    this.zipJob = null;
    const request: QueryLoadRequest = {
      query,
      cap,
      ...(opts.exampleId ? { exampleId: opts.exampleId } : {}),
      origin: opts.exampleId ? 'examples' : 'search',
      plan: (signal) => this.planQuery(query, cap, signal),
      labels: this.facetLabels,
      ledger: this.ledger.map(({ loadedImpact: _, ...row }) => ({ ...row })),
      ledgerBase: this.ledgerBase,
    };
    const result = await this.rootStore.dataStore.loadQuery(request);
    const load = this.loaded;
    if (result.started && result.committed && load) {
      runInAction(() => {
        this.recent = pushRecent(
          this.recent,
          { id: libraryId('recent'), name: queryTitle(query), query, savedAt: load.retrievedAt, kpis: load.kpis },
          queryKey,
        );
      });
      writeStorage(STORAGE_KEYS.recent, this.recent);
    }
    return result;
  }

  /**
   * Load a query example: restore its query, show the search tab, await the plans, then
   * load when the Load gate allows; otherwise the dock shows why (e.g. over the cap).
   */
  async loadExampleQuery(entry: Pick<ExampleEntry, 'id' | 'query'>): Promise<StartResult> {
    if (!entry.query) return { started: false, reason: 'This example has no query' };
    if (this.rootStore.dataStore.isLoading) return { started: false, reason: LOAD_RUNNING };
    this.restoreQuery(entry.query);
    this.open('occurrences');
    // The preview pipeline may replace this plan request with its own: then wait for that one.
    const ok = await this.fetchPlans();
    if (!ok && this.plans.state === 'loading') await when(() => this.plans.state !== 'loading');
    const can = this.canLoad;
    if (!can.ok) return { started: false, reason: can.reason };
    return this.load({ exampleId: entry.id });
  }

  /** Replace the workspace query (e.g. an example's "Open in Search"); never loads. */
  restoreQuery(query: OccurrenceQuery) {
    this.setQuery(query);
  }

  /** Put the loaded query (or the query of the source still loading) back into the workspace. */
  resetToLoaded() {
    const source = this.rootStore.dataStore.occurrence;
    const query = this.loaded?.query ?? (source?.kind === 'explorer-query' ? source.query : null);
    if (query) this.setQuery(query);
  }

  // --- Compat for the UI until U1 ---------------------------------------------------------

  /** @deprecated removed in U1: read `loaded` and `dataStore.job.outcome`. */
  get lastLoad(): LegacyLoad | null {
    const load = this.loaded;
    if (!load) return null;
    const job = this.job;
    const outcome = job && 'outcome' in job ? job.outcome : undefined;
    return {
      ...load,
      mode: 'replace',
      ...(outcome && { emptyReason: outcome.emptyReason, previousKept: outcome.previousKept }),
    };
  }

  /** @deprecated removed in U1: `dataStore.job` (here only query loads, and zip loads until S2b). */
  get job(): DataLoadJob | LoadJob | null {
    if (this.zipJob) return this.zipJob;
    const job = this.rootStore.dataStore?.job;
    return job && (job.kind === 'query' || job.kind === 'continue') ? job : null;
  }

  /** @deprecated removed in U1: "Add" is gone and every load replaces. */
  get loadMode(): 'replace' | 'add' {
    return 'replace';
  }

  /** @deprecated removed in U1: a no-op, since "Add" is gone. */
  setLoadMode(_mode: 'replace' | 'add') {
    // Every load replaces its slot (D1).
  }

  /** @deprecated removed in U1: the portal is open or closed (D4). */
  get minimized(): boolean {
    return false;
  }

  /** @deprecated removed in U1: minimizing closes the portal; a running load continues. */
  setMinimized(minimized: boolean) {
    if (minimized) this.close();
  }

  /** @deprecated removed in U1: `resetToLoaded()`, then the search tab. */
  editAndReload() {
    this.resetToLoaded();
    this.setTab('occurrences');
  }

  /** @deprecated removed in U1: `dataStore.cancel`. */
  cancel(mode: 'keep' | 'discard') {
    if (this.zipJob?.state === 'streaming') this.cancelZip(mode);
    else this.rootStore.dataStore.cancel(mode);
  }

  /** @deprecated removed in U1: `dataStore.pause`. */
  pauseLoad() {
    const gate = this.pauseGate;
    const zip = this.zipJob;
    if (gate && zip?.state === 'streaming') {
      if (gate.paused) return;
      gate.close();
      this.pauseFlush?.();
      zip.paused = true;
      zip.etaSeconds = null;
      return;
    }
    this.rootStore.dataStore.pause();
  }

  /** @deprecated removed in U1: `dataStore.resume`. */
  resumeLoad() {
    const gate = this.pauseGate;
    if (gate?.paused) {
      if (this.zipJob) this.zipJob.paused = false;
      gate.open();
      return;
    }
    this.rootStore.dataStore.resume();
  }

  /** @deprecated removed in U1: `dataStore.runBioregionsAnyway`. */
  runBioregionsAnyway(): Promise<void> {
    return this.rootStore.dataStore.runBioregionsAnyway();
  }

  // --- Zip load controls. TODO(S2b): they move to data/zipLoad.ts with `loadZip`. ------------

  /** Stop the running zip load: keep what arrived or discard it. */
  private cancelZip(mode: 'keep' | 'discard') {
    const controller = this.loadController;
    if (!controller) return;
    this.cancelMode = mode;
    // SpeciesStore.loadRecords reads the reason: 'discard' skips binning and Infomap.
    controller.abort(mode);
    // Release a paused load after the abort, so the held batch is dropped, not counted.
    if (this.zipJob) this.zipJob.paused = false;
    this.pauseGate?.open();
    if (mode === 'discard') this.rootStore.clearData();
  }

  /** Open and forget a load's pause gate (the load ended or was cancelled). */
  private releasePause(gate: PauseGate) {
    gate.open();
    if (this.pauseGate === gate) {
      this.pauseGate = null;
      this.pauseFlush = null;
    }
  }

  // --- Citation ---------------------------------------------------------------------

  /** Store the DOI of a registered derived dataset (empty clears it). */
  setDerivedDoi(doi: string) {
    if (!this.loaded) return;
    const bare = doi.trim();
    this.patchLoaded({ derivedDoi: bare || undefined });
  }

  /** Patch the loaded query (or zip) source's provenance. TODO(S2b): `dataStore.patchOccurrence`. */
  private patchLoaded(patch: Partial<LoadProvenance>) {
    const { dataStore } = this.rootStore;
    const source = dataStore.occurrence;
    if (!source || (source.kind !== 'explorer-query' && source.kind !== 'gbif-zip') || !source.provenance) return;
    dataStore.replaceSource(source.id, { provenance: { ...source.provenance, ...patch } });
  }

  /** Request a citable GBIF download for the loaded query; the password is used once and never stored. */
  async requestDownload({ user, password, email }: DownloadCredentials): Promise<void> {
    this.downloadController?.abort();
    const controller = new AbortController();
    this.downloadController = controller;
    const query = toJS(this.loaded?.query ?? this.query);
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

  /**
   * Parse a dropped GBIF download zip into a staging cleaner (the loaded data is not
   * touched) and check, from the download's own request at GBIF, whether it was made
   * for the query of the data on screen.
   */
  async importZip(file: File): Promise<void> {
    this.zipController?.abort();
    const controller = new AbortController();
    this.zipController = controller;
    this.zipFile = null;
    this.zipSummary = null;
    const shown = this.loaded;
    const query = toJS(shown?.query ?? this.query);
    const nameKey = downloadKeyFromName(file.name);
    const gbifLoaded = shown?.funnel.bySource.gbif?.accepted ?? 0;
    const base = {
      fileName: file.name,
      ...(nameKey && { downloadKey: nameKey }),
      queryMatch: 'unknown' as const,
      // Only the GBIF part of the data on screen can be compared with a GBIF download.
      streamGbifRecords: gbifLoaded,
      streamGbifReceived: shown?.funnel.bySource.gbif?.received ?? 0,
      streamGbifLoaded: gbifLoaded,
      canReplace: false,
      canCiteDoi: false,
    };
    this.zipImport = { state: 'parsing', ...base };
    const cleaner = new RecordCleaner({ dedupe: query.quality.dedupe, area: query.area });
    // Start the metadata request while the zip is read (the key is usually in the file name).
    let check = nameKey ? checkDownload(nameKey, query, controller.signal) : null;
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
            if (this.zipController === controller) this.zipImport = { state: 'parsing', ...base, funnel };
          });
        }
        step = await gen.next();
      }
      const summary = step.value;
      const key = summary.downloadKey ?? nameKey;
      if (key && key !== nameKey) check = checkDownload(key, query, controller.signal);
      const result = check ? await check : null;
      if (controller.signal.aborted) return;
      runInAction(() => {
        if (this.zipController !== controller) return;
        this.zipFile = file;
        this.zipSummary = summary;
        const funnel = cleaner.funnel;
        this.zipImport = {
          state: 'ready',
          ...base,
          funnel,
          ...zipVerdict({
            key,
            doi: summary.doi ?? result?.doi,
            check: result,
            accepted: funnel.accepted,
            received: funnel.received,
            streamGbifRecords: base.streamGbifRecords,
            hasData: shown != null && shown.accepted > 0,
          }),
        };
      });
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) return;
      runInAction(() => {
        this.zipImport = {
          state: 'error',
          ...base,
          error: error instanceof Error ? error.message : String(error),
        };
      });
    } finally {
      if (this.zipController === controller) this.zipController = null;
    }
  }

  /** Close the zip dialog: stop parsing and forget the dropped file. */
  clearZip() {
    this.zipController?.abort();
    this.zipController = null;
    this.zipImport = null;
    this.zipFile = null;
    this.zipSummary = null;
  }

  /**
   * Load the parsed zip in place of the data, or keep the streamed data and cite the
   * zip's DOI; each only when the download matches the query (`canReplace`, `canCiteDoi`).
   */
  applyZip(choice: 'replace' | 'keepStreamCiteDoi') {
    const summary = this.zipSummary;
    const zip = this.zipImport;
    if (zip?.state !== 'ready' || !summary) return;
    if (choice === 'keepStreamCiteDoi') {
      if (!zip.canCiteDoi || !this.loaded) return;
      this.patchLoaded({ gbifDownloadKey: zip.downloadKey ?? summary.downloadKey, gbifDownloadDoi: zip.doi ?? summary.doi });
      return;
    }
    const file = this.zipFile;
    if (!zip.canReplace || !file || this.isLoading) return;
    void this.loadZip(file, { ...summary, downloadKey: zip.downloadKey ?? summary.downloadKey, doi: zip.doi ?? summary.doi });
  }

  private async loadZip(file: Blob, summary: GbifZipSummary) {
    const previous = this.loaded;
    const query = toJS(previous?.query ?? this.query);
    const controller = new AbortController();
    this.loadController = controller;
    this.cancelMode = null;
    const label = summary.downloadKey ? `GBIF download ${summary.downloadKey}` : 'GBIF download';
    const labels = this.facetLabels;
    const gate = new PauseGate();
    this.pauseGate = gate;
    this.zipJob = {
      state: 'streaming',
      label,
      startedAt: Date.now(),
      etaSeconds: null,
      perSource: [],
      funnel: emptyFunnel(),
      truncated: [],
      speciesCoverage: null,
      paused: false,
      speciesLoaded: 0,
      speciesPlanned: null,
    };
    // The observable copy, so the writes below reach the UI.
    const job = this.zipJob;
    const { dataStore } = this.rootStore;
    let zipSourceId: string | null = null;
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
        job.speciesLoaded = tally.species.size;
        job.etaSeconds = gate.paused ? null : etaSeconds(progress.fetched, expected, now - job.startedAt);
      });
    };
    this.pauseFlush = () => flush(true);
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      this.releasePause(gate);
      flush(true);
      runInAction(() => {
        job.paused = false;
        const funnel = cleaner.funnel;
        const cancelled = this.cancelMode ?? (controller.signal.aborted ? 'keep' : null);
        const failed = !cancelled && job.state === 'error';
        const empty = funnel.accepted === 0 && !failed ? emptyReasonOf(funnel, cancelled != null) : undefined;
        job.state = cancelled ? 'cancelled' : failed || empty ? 'error' : 'done';
        if (empty && !cancelled) job.error = EMPTY_MESSAGES[empty];
        job.etaSeconds = null;
        if (cancelled === 'discard' || failed) return;
        const load: LoadProvenance = {
          query,
          retrievedAt: new Date().toISOString(),
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
          accepted: funnel.accepted,
          partial: cancelled
            ? partialLoad({
                planned: expected,
                accepted: funnel.accepted,
                speciesLoaded: tally.species.size,
                speciesPlanned: null,
                fetched: progress.fetched,
              })
            : null,
          datasetCounts: tally.datasetCounts(labels.datasets),
          stats: tally.stats(labels),
          requests: { gbif: gbifDownloadPredicate(query) },
          gbifDownloadKey: summary.downloadKey,
          gbifDownloadDoi: summary.doi,
          fromZip: true,
        };
        // Nothing committed (an empty zip): the previous source stays as it was (I6).
        if (zipSourceId) dataStore.replaceSource(zipSourceId, { status: 'done', completedAt: load.retrievedAt, provenance: load });
      });
    };
    async function* records(): AsyncGenerator<RecordBatch['records']> {
      try {
        for await (const batch of importGbifZip(file, {
          signal: controller.signal,
          excludeIntroduced: query.quality.excludeIntroduced,
        })) {
          await gate.wait();
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
      await this.rootStore.speciesStore.loadRecords(records(), {
        controller,
        // The commit (I2). TODO(S2b): `dataStore.loadGbifZip` with the download summary.
        onFirstRecord: () => {
          zipSourceId = dataStore.mintSourceId();
          dataStore.commitOccurrence({
            id: zipSourceId,
            role: 'occurrences',
            kind: 'gbif-zip',
            label,
            exportName: label,
            status: 'loading',
            retrievedAt: new Date().toISOString(),
            completedAt: null,
            file: { name: 'name' in file && typeof file.name === 'string' ? file.name : label, size: file.size },
            download: null,
            provenance: null,
          });
        },
      });
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
      if (this.cancelMode === 'discard' && this.zipJob === job) this.rootStore.clearData();
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
