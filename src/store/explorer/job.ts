// Pure pieces of a running load: merging source streams, seeded deduplication across a
// Continue's resume boundary, merging funnels, per-source dataset tallies and the ETA.
import { isAbortError } from '../../sources/http';
import { BASIS_LABELS } from '../../sources/query';
import type {
  DedupeMode,
  DropReason,
  FacetBucket,
  Funnel,
  OccurrenceRecord,
  RecordBatch,
  RecordSource,
  SourceId,
} from '../../sources/types';

/** Minimum time between observable job updates (about five per second). */
export const JOB_UPDATE_MS = 200;

export interface SourceStream {
  source: SourceId;
  stream: AsyncIterator<RecordBatch, unknown>;
}

/**
 * Batches from several streams in completion order. A stream that throws is
 * reported through `onError` (aborts are not) and the others keep going; the
 * merged stream ends when every stream has ended.
 */
export async function* mergeBatches(
  streams: SourceStream[],
  onError: (source: SourceId, error: unknown) => void,
  onDone?: (source: SourceId) => void,
): AsyncGenerator<RecordBatch & { source: SourceId }> {
  type Step = { i: number; result?: IteratorResult<RecordBatch, unknown>; error?: unknown };
  const next = (i: number): Promise<Step> =>
    streams[i].stream.next().then(
      (result) => ({ i, result }),
      (error: unknown) => ({ i, error }),
    );
  const pending = new Map<number, Promise<Step>>(streams.map((_, i) => [i, next(i)]));
  try {
    while (pending.size > 0) {
      const step = await Promise.race(pending.values());
      const { source } = streams[step.i];
      if (step.error !== undefined || !step.result) {
        pending.delete(step.i);
        if (!isAbortError(step.error)) onError(source, step.error);
        continue;
      }
      if (step.result.done) {
        pending.delete(step.i);
        onDone?.(source);
        continue;
      }
      pending.set(step.i, next(step.i));
      yield { ...step.result.value, source };
    }
  } finally {
    // Stop streams that are still running when the consumer leaves early.
    for (const i of pending.keys()) void streams[i].stream.return?.(undefined)?.catch(() => {});
  }
}

/** The cleaner's dedupe key for a record (see `RecordCleaner.accept`). */
export function dedupeKey(mode: Exclude<DedupeMode, 'none'>, name: string, lon: number, lat: number): string {
  return mode === 'exact'
    ? `${name}|${Math.round(lon * 1e4)}|${Math.round(lat * 1e4)}`
    : `${name}|${Math.floor(lon * 100)}|${Math.floor(lat * 100)}`;
}

/**
 * Drops records that duplicate data loaded before a Continue (the run's own cleaner
 * deduplicates within the run; this extends it to the points already loaded).
 */
export class SeededDedupe {
  private readonly keys = new Set<string>();
  /** Records dropped as duplicates of existing data, per source. */
  readonly dropped: Partial<Record<RecordSource, number>> = {};
  total = 0;
  private readonly mode: DedupeMode;

  constructor(mode: DedupeMode, existing: Iterable<{ name: string; lon: number; lat: number }>) {
    this.mode = mode;
    if (mode === 'none') return;
    for (const p of existing) this.keys.add(dedupeKey(mode, p.name, p.lon, p.lat));
  }

  get size(): number {
    return this.keys.size;
  }

  filter(records: OccurrenceRecord[]): OccurrenceRecord[] {
    const mode = this.mode;
    if (mode === 'none' || this.keys.size === 0) return records;
    return records.filter((r) => {
      if (!this.keys.has(dedupeKey(mode, r.name, r.lon, r.lat))) return true;
      this.dropped[r.source] = (this.dropped[r.source] ?? 0) + 1;
      this.total++;
      return false;
    });
  }

  /** The cleaner's funnel with these drops counted as duplicates. */
  adjust(funnel: Funnel): Funnel {
    if (this.total === 0) return funnel;
    const bySource: Funnel['bySource'] = {};
    for (const [k, v] of Object.entries(funnel.bySource)) {
      if (v) bySource[k as RecordSource] = { ...v, accepted: v.accepted - (this.dropped[k as RecordSource] ?? 0) };
    }
    return {
      received: funnel.received,
      accepted: funnel.accepted - this.total,
      dropped: { ...funnel.dropped, duplicate: funnel.dropped.duplicate + this.total },
      bySource,
    };
  }
}

/** Labels for bucket keys the tally cannot name itself (from the preview facets). */
/**
 * The funnel of a load and a later run of it (a Continue) as one funnel: every count,
 * drop reason and source is summed.
 */
export function mergeFunnels(a: Funnel, b: Funnel): Funnel {
  const dropped = { ...a.dropped };
  for (const [reason, n] of Object.entries(b.dropped) as [DropReason, number][]) {
    dropped[reason] = (dropped[reason] ?? 0) + n;
  }
  const bySource: Funnel['bySource'] = {};
  for (const id of new Set([...Object.keys(a.bySource), ...Object.keys(b.bySource)]) as Set<RecordSource>) {
    const x = a.bySource[id];
    const y = b.bySource[id];
    bySource[id] = { received: (x?.received ?? 0) + (y?.received ?? 0), accepted: (x?.accepted ?? 0) + (y?.accepted ?? 0) };
  }
  return { received: a.received + b.received, accepted: a.accepted + b.accepted, dropped, bySource };
}

export interface TallyLabels {
  datasets?: ReadonlyMap<string, string>;
  basisOfRecord?: ReadonlyMap<string, string>;
  countries?: ReadonlyMap<string, string>;
}

const byCount = (a: FacetBucket, b: FacetBucket) => b.count - a.count || (a.key < b.key ? -1 : 1);

function buckets(map: ReadonlyMap<string, number>, label: (key: string) => string): FacetBucket[] {
  return [...map].map(([key, count]) => ({ key, label: label(key), count })).sort(byCount);
}

let regionNames: Intl.DisplayNames | null | undefined;
/** English country name of an ISO 3166-1 alpha-2 code (the code when unknown). */
export function countryName(code: string): string {
  if (regionNames === undefined) {
    try {
      regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
    } catch {
      regionNames = null;
    }
  }
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
}

/** "PRESERVED_SPECIMEN" -> its display label ("Preserved specimen" for unknown keys). */
export function basisKeyLabel(key: string): string {
  const known = (BASIS_LABELS as Record<string, string | undefined>)[key];
  if (known) return known;
  const s = key.toLowerCase().replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Statistics of the records a load accepted (after cleaning and deduplication): what the
 * insights and bias checks describe once the query on screen is loaded.
 */
export interface LoadStats {
  /** Accepted records the statistics cover. */
  total: number;
  bySource: Partial<Record<SourceId, number>>;
  basisOfRecord: FacetBucket[];
  /** Every dataset with its source, largest first. */
  datasets: (FacetBucket & { source: SourceId })[];
  /** Ascending, one bin per year (undated records are left out). */
  years: { year: number; count: number }[];
  /** Records per species, largest first. */
  species: FacetBucket[];
  /** Records per country (ISO 3166-1 alpha-2 keys), largest first; only records with a country. */
  countries: FacetBucket[];
  /** Records carrying a country code, per source (the denominator of `countries`). */
  withCountry: Partial<Record<SourceId, number>>;
  uncertainty: { min: number; max: number; avg: number } | null;
}

/** Accepted records per source dataset, plus species, years, basis, countries and uncertainty. */
export class LoadTally {
  readonly datasets: Partial<Record<SourceId, Map<string, number>>> = {};
  /** Records per species (`.size` is the species count). */
  readonly species = new Map<string, number>();
  readonly bySource: Partial<Record<SourceId, number>> = {};
  readonly basis = new Map<string, number>();
  readonly years = new Map<number, number>();
  readonly countries = new Map<string, number>();
  readonly withCountry: Partial<Record<SourceId, number>> = {};
  records = 0;
  minYear = Number.POSITIVE_INFINITY;
  maxYear = Number.NEGATIVE_INFINITY;
  private uncertaintyMin = Number.POSITIVE_INFINITY;
  private uncertaintyMax = Number.NEGATIVE_INFINITY;
  private uncertaintySum = 0;
  private uncertaintyN = 0;

  add(source: SourceId, records: OccurrenceRecord[]): void {
    let map = this.datasets[source];
    if (!map) {
      map = new Map();
      this.datasets[source] = map;
    }
    let withCountry = 0;
    for (const r of records) {
      this.species.set(r.name, (this.species.get(r.name) ?? 0) + 1);
      if (r.datasetKey) map.set(r.datasetKey, (map.get(r.datasetKey) ?? 0) + 1);
      if (r.basisOfRecord) this.basis.set(r.basisOfRecord, (this.basis.get(r.basisOfRecord) ?? 0) + 1);
      if (r.country) {
        this.countries.set(r.country, (this.countries.get(r.country) ?? 0) + 1);
        withCountry++;
      }
      if (r.year != null) {
        this.years.set(r.year, (this.years.get(r.year) ?? 0) + 1);
        if (r.year < this.minYear) this.minYear = r.year;
        if (r.year > this.maxYear) this.maxYear = r.year;
      }
      if (r.uncertainty != null && Number.isFinite(r.uncertainty)) {
        if (r.uncertainty < this.uncertaintyMin) this.uncertaintyMin = r.uncertainty;
        if (r.uncertainty > this.uncertaintyMax) this.uncertaintyMax = r.uncertainty;
        this.uncertaintySum += r.uncertainty;
        this.uncertaintyN++;
      }
    }
    this.records += records.length;
    this.bySource[source] = (this.bySource[source] ?? 0) + records.length;
    if (withCountry > 0) this.withCountry[source] = (this.withCountry[source] ?? 0) + withCountry;
  }

  /** Dataset buckets per source, largest first; labels from `titles` when known. */
  datasetCounts(titles: ReadonlyMap<string, string> = new Map()): Partial<Record<SourceId, FacetBucket[]>> {
    const out: Partial<Record<SourceId, FacetBucket[]>> = {};
    for (const [source, map] of Object.entries(this.datasets) as [SourceId, Map<string, number>][]) {
      out[source] = buckets(map, (key) => titles.get(key) ?? key);
    }
    return out;
  }

  /** A plain snapshot for the provenance (labels from the preview facets when known). */
  stats(labels: TallyLabels = {}): LoadStats {
    const datasets: LoadStats['datasets'] = [];
    for (const [source, list] of Object.entries(this.datasetCounts(labels.datasets)) as [SourceId, FacetBucket[]][]) {
      for (const b of list) datasets.push({ ...b, source });
    }
    datasets.sort(byCount);
    return {
      total: this.records,
      bySource: { ...this.bySource },
      basisOfRecord: buckets(this.basis, (k) => labels.basisOfRecord?.get(k) ?? basisKeyLabel(k)),
      datasets,
      years: [...this.years].map(([year, count]) => ({ year, count })).sort((a, b) => a.year - b.year),
      species: buckets(this.species, (k) => k),
      countries: buckets(this.countries, (k) => labels.countries?.get(k) ?? countryName(k)),
      withCountry: { ...this.withCountry },
      uncertainty:
        this.uncertaintyN > 0
          ? { min: this.uncertaintyMin, max: this.uncertaintyMax, avg: this.uncertaintySum / this.uncertaintyN }
          : null,
    };
  }

  get datasetTotal(): number {
    let n = 0;
    for (const map of Object.values(this.datasets)) n += map?.size ?? 0;
    return n;
  }

  get yearRange(): [number, number] | null {
    return Number.isFinite(this.minYear) ? [this.minYear, this.maxYear] : null;
  }
}

/**
 * Holds a running load between batches: while closed, `wait()` does not resolve, so
 * no batch is counted or handed on. `open()` (resume or cancel) releases the waiters.
 */
export class PauseGate {
  private waiting: Promise<void> | null = null;
  private release: (() => void) | null = null;

  get paused(): boolean {
    return this.waiting != null;
  }

  close(): void {
    if (this.waiting) return;
    this.waiting = new Promise<void>((resolve) => {
      this.release = resolve;
    });
  }

  open(): void {
    const release = this.release;
    this.waiting = null;
    this.release = null;
    release?.();
  }

  /** Resolves at once when open, else when the gate opens. */
  wait(): Promise<void> | null {
    return this.waiting;
  }
}

/** Seconds left at the average rate so far; null until there is a rate to go by. */
export function etaSeconds(fetched: number, expected: number, elapsedMs: number): number | null {
  if (fetched <= 0 || elapsedMs < 1000 || expected <= 0) return null;
  const left = Math.max(0, expected - fetched);
  return Math.round((left * elapsedMs) / fetched / 1000);
}
