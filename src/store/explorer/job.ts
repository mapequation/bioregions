// Pure pieces of a running load: merging source streams, seeded deduplication for
// "add" mode, per-source dataset tallies and the ETA.
import { isAbortError } from '../../sources/http';
import type {
  DedupeMode,
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
 * Drops records that duplicate data loaded before an "add" load. The cleaner
 * deduplicates within the load; this extends it to the existing points.
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

/** Accepted records per source dataset, plus species, years and record counts for the KPIs. */
export class LoadTally {
  readonly datasets: Partial<Record<SourceId, Map<string, number>>> = {};
  readonly species = new Set<string>();
  readonly bySource: Partial<Record<SourceId, number>> = {};
  records = 0;
  minYear = Number.POSITIVE_INFINITY;
  maxYear = Number.NEGATIVE_INFINITY;

  add(source: SourceId, records: OccurrenceRecord[]): void {
    let map = this.datasets[source];
    if (!map) {
      map = new Map();
      this.datasets[source] = map;
    }
    for (const r of records) {
      this.species.add(r.name);
      if (r.datasetKey) map.set(r.datasetKey, (map.get(r.datasetKey) ?? 0) + 1);
      if (r.year != null) {
        if (r.year < this.minYear) this.minYear = r.year;
        if (r.year > this.maxYear) this.maxYear = r.year;
      }
    }
    this.records += records.length;
    this.bySource[source] = (this.bySource[source] ?? 0) + records.length;
  }

  /** Dataset buckets per source, largest first; labels from `titles` when known. */
  datasetCounts(titles: Map<string, string> = new Map()): Partial<Record<SourceId, FacetBucket[]>> {
    const out: Partial<Record<SourceId, FacetBucket[]>> = {};
    for (const [source, map] of Object.entries(this.datasets) as [SourceId, Map<string, number>][]) {
      out[source] = [...map]
        .map(([key, count]) => ({ key, label: titles.get(key) ?? key, count }))
        .sort((a, b) => b.count - a.count || (a.key < b.key ? -1 : 1));
    }
    return out;
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

/** Seconds left at the average rate so far; null until there is a rate to go by. */
export function etaSeconds(fetched: number, expected: number, elapsedMs: number): number | null {
  if (fetched <= 0 || elapsedMs < 1000 || expected <= 0) return null;
  const left = Math.max(0, expected - fetched);
  return Math.round((left * elapsedMs) / fetched / 1000);
}
