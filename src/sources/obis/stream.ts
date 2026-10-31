// Bulk streaming of OBIS occurrences with cursor paging.
//
// `/occurrence` returns records sorted by id (lowercase UUIDs) and `after=<id>`
// continues after any string, existing id or not (verified live). Pages are at most
// 10 000 records (larger sizes are a 400). A cursor is sequential, so large streams
// are split into `concurrency` id ranges by leading hex digit ("", "4", "8", "c"),
// each paged by its own cursor; a range ends at the first id past its upper bound,
// so each range over-fetches at most one page. One sequential page is ~1300
// records/s, so four ranges stream ~5000 records/s.

import {
  abortError,
  BULK_RETRIES,
  describeRequestError,
  fetchText,
  MAX_CONSECUTIVE_FAILURES,
} from '../http';
import type {
  ObisRangeCursor,
  ObisStreamCursor,
  OccurrenceQuery,
  RecordBatch,
  StreamOptions,
  StreamPlan,
  StreamProgress,
} from '../types';
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
  const text = await fetchText(obisUrl('occurrence', params), {
    signal,
    timeoutMs: 60_000,
    retries: BULK_RETRIES,
  });
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

type Event =
  | {
      kind: 'batch';
      batch: RecordBatch;
      /** Range index and its paging state once this batch is delivered. */
      range: number;
      state: ObisRangeCursor;
    }
  | { kind: 'failure'; error: unknown };

/**
 * Yields one batch per page, each with a resume `cursor`; pass a cursor as
 * `resume` to continue an earlier run of the same plan (its id ranges are reused).
 * Records failing the client-side filters are left out of the batch but counted in
 * `progress.fetched`. Stops after `maxRecords` raw records over the whole load, at
 * the end of the data, or on abort (throws AbortError). Batches from parallel id
 * ranges arrive in completion order. A page that still fails after its retries ends
 * its range (the cursor keeps the range's position, so a resume retries it), is
 * counted in `progress.failedParts` and sets `progress.stoppedEarly`; the other
 * ranges go on, until `MAX_CONSECUTIVE_FAILURES` pages in a row have failed.
 */
export async function* streamObis(
  plan: StreamPlan,
  { maxRecords, signal, concurrency = 4, resume }: StreamOptions,
): AsyncGenerator<RecordBatch> {
  const detail = plan.detail as ObisPlanDetail | undefined;
  if (plan.source !== 'obis' || typeof detail?.params !== 'string' || !(detail.pageSize > 0)) {
    throw new Error('Invalid OBIS stream plan');
  }
  if (resume && (resume.source !== 'obis' || !Array.isArray(resume.ranges))) {
    throw new Error(`Cannot resume an OBIS stream from a ${resume.source} cursor`);
  }
  const limit = Math.min(maxRecords, plan.expectedRecords);
  const base = { fetched: resume?.fetched ?? 0, requestsDone: resume?.requestsDone ?? 0 };
  if (limit <= 0 || base.fetched >= maxRecords) {
    return;
  }
  if (signal?.aborted) {
    throw abortError();
  }
  // Own controller so pending requests are cancelled when the consumer stops early.
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });

  /** Paging state per range as of the last yielded batch (the cursor). */
  const yielded: ObisRangeCursor[] = resume
    ? resume.ranges.map((r) => ({ ...r }))
    : idRanges(limit > 2 * detail.pageSize ? concurrency : 1).map((r) => ({ ...r, done: false }));
  const ranges = yielded.map((r, i) => ({ ...r, index: i })).filter((r) => !r.done);
  const progress: StreamProgress & { bytes: number } = {
    fetched: base.fetched,
    expected: limit,
    requestsDone: base.requestsDone,
    requestsTotal:
      base.requestsDone +
      Math.ceil(Math.max(0, limit - base.fetched) / detail.pageSize) +
      Math.max(0, ranges.length - 1),
    bytes: 0,
    failedParts: 0,
  };
  const queue: Event[] = [];
  let wake: (() => void) | null = null;
  let drained: (() => void)[] = [];
  let active = ranges.length;
  let reserved = 0;
  let consecutiveFailures = 0;
  /** A range ended unfinished because a page failed. */
  let stoppedEarly: 'errors' | undefined;
  const notify = () => {
    wake?.();
    wake = null;
  };

  const runRange = async ({ after: start, end, index }: (typeof ranges)[number], close: () => void) => {
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
      } catch (error) {
        if (controller.signal.aborted) return;
        // The cursor cannot skip a page: the range ends here, to be resumed later.
        stoppedEarly = 'errors';
        queue.push({ kind: 'failure', error });
        if (++consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          controller.abort();
        }
        return;
      } finally {
        reserved -= size;
      }
      consecutiveFailures = 0;
      progress.requestsDone++;
      progress.bytes += page.bytes;
      const inRange = end ? page.rows.filter((r) => r.id < end) : page.rows;
      const rows = inRange.slice(0, Math.max(0, maxRecords - progress.fetched));
      progress.fetched += rows.length;
      // Resume after the last row delivered; the range is done when its ids ran out.
      const exhausted = page.rows.length < size || inRange.length < page.rows.length || !page.rows.length;
      after = rows[rows.length - 1]?.id ?? after;
      const more = !exhausted && rows.length === inRange.length && progress.fetched < maxRecords;
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
      queue.push({
        kind: 'batch',
        batch: { source: 'obis', records, progress: { ...progress } },
        range: index,
        state: { ...(after !== undefined && { after }), ...(end !== undefined && { end }), done: exhausted && rows.length === inRange.length },
      });
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
        // Not a page failure (those are handled in `runRange`): report it and stop.
        if (!controller.signal.aborted) {
          stoppedEarly = 'errors';
          queue.push({ kind: 'failure', error });
        }
      })
      .finally(() => {
        close();
        notify();
      });
  }

  let failedParts = 0;
  let lastError: string | undefined;
  const cursor = (fetched: number, requestsDone: number): ObisStreamCursor => ({
    source: 'obis',
    ranges: yielded.map((r) => ({ ...r })),
    fetched,
    requestsDone,
  });
  const failureFields = () => ({
    failedParts,
    ...(lastError !== undefined && { lastError }),
    ...(failedParts > 0 && stoppedEarly && { stoppedEarly }),
  });
  const final = (): StreamProgress => ({
    ...progress,
    // The stream is done: without failures the plan's estimates become exact.
    ...(failedParts === 0 && { expected: progress.fetched, requestsTotal: progress.requestsDone }),
    ...failureFields(),
  });
  let finalSent = false;
  let last = { fetched: base.fetched, requestsDone: base.requestsDone };
  try {
    for (;;) {
      if (signal?.aborted) {
        throw abortError();
      }
      const event = queue.shift();
      if (event) {
        const waiting = drained;
        drained = [];
        for (const resolve of waiting) resolve();
        if (event.kind === 'failure') {
          failedParts++;
          lastError = describeRequestError(event.error, 'OBIS');
          continue;
        }
        const { batch } = event;
        yielded[event.range] = event.state;
        last = { fetched: batch.progress.fetched, requestsDone: batch.progress.requestsDone };
        if (active === 0 && queue.length === 0) {
          batch.progress = final();
          finalSent = true;
        } else {
          batch.progress = { ...batch.progress, ...failureFields() };
        }
        batch.cursor = cursor(last.fetched, last.requestsDone);
        yield batch;
        continue;
      }
      if (active === 0) {
        if (!finalSent) {
          yield {
            source: 'obis',
            records: [],
            progress: final(),
            cursor: cursor(last.fetched, last.requestsDone),
          };
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
