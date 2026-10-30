// Bulk streaming of OBIS occurrences with cursor paging.
//
// `/occurrence` returns records sorted by id (lowercase UUIDs) and `after=<id>`
// continues after any string, existing id or not (verified live). Pages are at most
// 10 000 records (larger sizes are a 400). A cursor is sequential, so large streams
// are split into `concurrency` id ranges by leading hex digit ("", "4", "8", "c"),
// each paged by its own cursor; a range ends at the first id past its upper bound,
// so each range over-fetches at most one page. One sequential page is ~1300
// records/s, so four ranges stream ~5000 records/s.

import { abortError, fetchText } from '../http';
import type { OccurrenceQuery, RecordBatch, StreamOptions, StreamPlan } from '../types';
import { obisParams, supportsObis } from './params';
import { obisStatistics, obisUrl } from './preview';
import {
  OBIS_FIELDS,
  type ObisClientFilter,
  type ObisOccurrence,
  obisClientFilter,
  passesClientFilter,
  toOccurrenceRecord,
} from './records';
import { resolveQueryTaxa } from './taxa';

/** Records per request. */
export const OBIS_PAGE_SIZE = 5000;
/** Rough JSON size of one record with `OBIS_FIELDS` (measured: 2.85 MB / 10 000). */
export const OBIS_BYTES_PER_RECORD = 290;

export interface ObisPlanDetail {
  /** Server-side query string, without paging parameters. */
  params: string;
  taxonIds: number[];
  unresolvedTaxa: string[];
  clientFilter: ObisClientFilter;
  pageSize: number;
}

export async function planObis(
  query: OccurrenceQuery,
  { maxRecords = Number.POSITIVE_INFINITY }: { maxRecords?: number } = {},
  signal?: AbortSignal,
): Promise<StreamPlan> {
  const supported = supportsObis(query);
  if (!supported.ok) {
    throw new Error(supported.reason);
  }
  const taxa = await resolveQueryTaxa(query, signal);
  const params = obisParams(query, { taxonIds: taxa.ids });
  const stats = taxa.empty ? null : await obisStatistics(params, signal);
  const expectedRecords = stats?.records ?? 0;
  const fetchable = Math.min(expectedRecords, maxRecords);
  const detail: ObisPlanDetail = {
    params: params.toString(),
    taxonIds: taxa.ids,
    unresolvedTaxa: taxa.unresolved,
    clientFilter: obisClientFilter(query),
    pageSize: OBIS_PAGE_SIZE,
  };
  return {
    source: 'obis',
    query,
    expectedRecords,
    expectedSpecies: stats?.species ?? 0,
    requests: Math.ceil(fetchable / OBIS_PAGE_SIZE),
    estimatedBytes: Math.round(fetchable * OBIS_BYTES_PER_RECORD),
    detail,
  };
}

interface Page {
  rows: ObisOccurrence[];
  bytes: number;
}

async function fetchPage(
  detail: ObisPlanDetail,
  size: number,
  after: string | undefined,
  signal: AbortSignal,
): Promise<Page> {
  const params = new URLSearchParams(detail.params);
  params.set('size', String(size));
  params.set('fields', OBIS_FIELDS.join(','));
  if (after) {
    params.set('after', after);
  }
  const text = await fetchText(obisUrl('occurrence', params), { signal, timeoutMs: 60_000 });
  const { results } = JSON.parse(text) as { results?: ObisOccurrence[] };
  return { rows: results ?? [], bytes: text.length };
}

interface IdRange {
  /** Cursor start (exclusive lower bound), or undefined for the first range. */
  after?: string;
  /** Exclusive upper bound on ids, or undefined for the last range. */
  end?: string;
}

/** Split the UUID space into `n` (1-16) ranges by leading hex digit. */
export function idRanges(n: number): IdRange[] {
  const parts = Math.max(1, Math.min(16, Math.floor(n)));
  const bounds = Array.from({ length: parts + 1 }, (_, i) =>
    i === 0 || i === parts ? undefined : Math.floor((16 * i) / parts).toString(16),
  );
  return bounds.slice(0, parts).map((after, i) => ({ after, end: bounds[i + 1] }));
}

/**
 * Yields one batch per page. Records failing the client-side filters are left out
 * of the batch but counted in `progress.fetched`. Stops after `maxRecords` raw
 * records, at the end of the data, or on abort (throws AbortError). Batches from
 * parallel id ranges arrive in completion order.
 */
export async function* streamObis(
  plan: StreamPlan,
  { maxRecords, signal, concurrency = 4 }: StreamOptions,
): AsyncGenerator<RecordBatch> {
  const detail = plan.detail as ObisPlanDetail;
  const limit = Math.min(maxRecords, plan.expectedRecords);
  if (limit <= 0) {
    return;
  }
  // Own controller so pending requests are cancelled when the consumer stops early.
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  if (signal?.aborted) controller.abort();

  const ranges = idRanges(limit > 2 * detail.pageSize ? concurrency : 1);
  const progress = {
    fetched: 0,
    expected: limit,
    requestsDone: 0,
    requestsTotal: Math.ceil(limit / detail.pageSize) + ranges.length - 1,
    bytes: 0,
  };
  const queue: RecordBatch[] = [];
  let wake: (() => void) | null = null;
  let drained: (() => void)[] = [];
  let failure: unknown = null;
  let active = ranges.length;
  let reserved = 0;
  const notify = () => {
    wake?.();
    wake = null;
  };

  const runRange = async ({ after: start, end }: IdRange, close: () => void) => {
    let after = start;
    while (!controller.signal.aborted) {
      const size = Math.min(detail.pageSize, maxRecords - progress.fetched - reserved);
      if (size <= 0) {
        return;
      }
      reserved += size;
      let page: Page;
      try {
        page = await fetchPage(detail, size, after, controller.signal);
      } finally {
        reserved -= size;
      }
      progress.requestsDone++;
      progress.bytes += page.bytes;
      const inRange = end ? page.rows.filter((r) => r.id < end) : page.rows;
      const rows = inRange.slice(0, Math.max(0, maxRecords - progress.fetched));
      progress.fetched += rows.length;
      after = page.rows[page.rows.length - 1]?.id;
      const more =
        page.rows.length >= size &&
        inRange.length === page.rows.length &&
        progress.fetched < maxRecords &&
        !!after;
      const records = rows
        .map(toOccurrenceRecord)
        .filter((r) => passesClientFilter(r, detail.clientFilter));
      // Counts drift between plan and stream; never report fewer requests than made.
      progress.requestsTotal = Math.max(
        progress.requestsTotal,
        progress.requestsDone + active - (more ? 0 : 1),
      );
      if (!more) {
        close(); // Before pushing, so the consumer can tell the last batch.
      }
      queue.push({ source: 'obis', records, progress: { ...progress } });
      notify();
      if (!more) {
        return;
      }
      // Backpressure: do not run far ahead of the consumer.
      while (queue.length >= 2 * ranges.length && !controller.signal.aborted) {
        await new Promise<void>((resolve) => drained.push(resolve));
      }
    }
  };

  for (const range of ranges) {
    let closed = false;
    const close = () => {
      if (!closed) {
        closed = true;
        active--;
      }
    };
    runRange(range, close)
      .catch((error) => {
        failure ??= error;
        controller.abort();
      })
      .finally(() => {
        close();
        notify();
      });
  }

  const final = () => ({
    ...progress,
    // The stream is done: the plan's estimates become exact.
    expected: progress.fetched,
    requestsTotal: progress.requestsDone,
  });
  let finalSent = false;
  try {
    for (;;) {
      if (signal?.aborted) {
        throw abortError();
      }
      if (failure) {
        throw failure;
      }
      const batch = queue.shift();
      if (batch) {
        const waiting = drained;
        drained = [];
        for (const resolve of waiting) resolve();
        if (active === 0 && queue.length === 0) {
          batch.progress = final();
          finalSent = true;
        }
        yield batch;
        continue;
      }
      if (active === 0) {
        if (!finalSent) {
          yield { source: 'obis', records: [], progress: final() };
        }
        return;
      }
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
    }
  } finally {
    signal?.removeEventListener('abort', onAbort);
    controller.abort();
    for (const resolve of drained) resolve();
  }
}
