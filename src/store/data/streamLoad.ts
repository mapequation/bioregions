// Stream an explorer query into the occurrence slot (spec
// docs/superpowers/specs/2026-10-31-data-sources-and-portal.md §2.3, §3 paths 6, 7, 13 and 14,
// §4.1): plan, stream every enabled source through one cleaner, commit the source on the
// first accepted record, and settle it (provenance, `completedAt`, resume state) at the finish.
import { runInAction } from 'mobx';
import { RecordCleaner } from '../../sources/clean';
import { gbifDownloadPredicate } from '../../sources/gbif/predicate';
import { streamGbif } from '../../sources/gbif/stream';
import { HttpError, isAbortError } from '../../sources/http';
import { streamObis } from '../../sources/obis/stream';
import { queryTitle } from '../../sources/query';
import type { Funnel, RecordBatch, SourceId, StreamPlan } from '../../sources/types';
import type DataStore from '../DataStore';
import { JOB_UPDATE_MS, LoadTally, PauseGate, etaSeconds, mergeBatches } from '../explorer/job';
import { type ObisExplorerDetail, missingPlannedSpecies, planSpeciesNames } from '../explorer/plan';
import { type LoadProvenance, partialCoverage, partialKind } from '../explorer/provenance';
import type { EmptyReason, Kpis, PartialLoad, SourceProgress } from '../explorer/types';
import type { DataLoadJob, DataLoadState, QueryLoadRequest, QueryOccurrences, StartResult } from './types';

/** Job error text for a load that ended with no record. */
export const EMPTY_MESSAGES: Record<EmptyReason, string> = {
  noMatches: 'No records matched this query',
  allDropped: 'Cleaning removed every record',
  cancelledEarly: 'Stopped before any record arrived',
};

/** Why a load holds no record, from its funnel. */
export function emptyReasonOf(funnel: Funnel, cancelled: boolean): EmptyReason {
  if (cancelled) return 'cancelledEarly';
  return funnel.received > 0 ? 'allDropped' : 'noMatches';
}

/** Species the plans promise: the union of their species lists, else a lone plan's count. */
export function plannedSpecies(plans: StreamPlan[]): number | null {
  if (plans.length === 0) return null;
  if (plans.every((p) => p.speciesCounts)) return planSpeciesNames(plans).length;
  return plans.length === 1 ? plans[0].expectedSpecies : null;
}

/** Partial-load figures; `notReceived` counts planned records that were never fetched. */
export function partialLoad(p: {
  planned: number;
  accepted: number;
  speciesLoaded: number;
  speciesPlanned: number | null;
  fetched: number;
  /** Planned species with no loaded record, largest first (`missingPlannedSpecies`). */
  missingSpecies?: PartialLoad['missingSpecies'];
}): PartialLoad {
  const out = {
    kind: partialKind(p.speciesLoaded, p.speciesPlanned),
    planned: p.planned,
    accepted: p.accepted,
    speciesLoaded: p.speciesLoaded,
    speciesPlanned: p.speciesPlanned,
    notReceived: Math.max(0, p.planned - p.fetched),
  };
  return { ...out, coverage: partialCoverage(out), missingSpecies: p.speciesPlanned != null ? (p.missingSpecies ?? []) : [] };
}

/** A stopped load below this coverage keeps its records but does not run Infomap. */
export const MIN_BIOREGION_COVERAGE = 0.5;

/** Live species completeness of a load from the sources that report species, or null. */
export function speciesCoverage(perSource: { speciesDone?: number; speciesTotal?: number }[]): number | null {
  let done = 0;
  let total = 0;
  for (const p of perSource) {
    if (p.speciesTotal == null || p.speciesTotal <= 0) continue;
    done += Math.min(p.speciesDone ?? 0, p.speciesTotal);
    total += p.speciesTotal;
  }
  return total > 0 ? done / total : null;
}

/** Merge a stream's progress into the job's, never letting the request total shrink. */
export function mergeProgress<T extends { requestsTotal: number }>(into: T, update: Partial<T>): T {
  const requestsTotal = Math.max(into.requestsTotal, update.requestsTotal ?? 0);
  return Object.assign(into, update, { requestsTotal });
}

/** Share of the ledger base, or null when either is unknown. */
export function ledgerShare(impact: number | null, base: number | null): number | null {
  if (impact == null || base == null) return null;
  return base > 0 ? Math.min(1, impact / base) : 0;
}

/** A short, one-line error text. */
export function shortError(error: unknown): string {
  if (error instanceof HttpError) return `HTTP ${error.status}`;
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 80 ? `${message.slice(0, 79)}…` : message;
}

/** The controls of the running stream load, used by `DataStore.cancel`, `pause` and `resume`. */
export interface ActiveLoad {
  job: DataLoadJob;
  controller: AbortController;
  gate: PauseGate;
  cancelMode: 'keep' | 'discard' | null;
  /** Publish the counts now: a pause freezes exactly what `cancel('keep')` keeps. */
  flush: () => void;
}

const nowIso = () => new Date().toISOString();

/**
 * Run one query load into `store`'s occurrence slot. Nothing changes until the first
 * accepted record commits a `status: 'loading'` source with `provenance: null` (I2); at
 * the finish the source becomes `'done'` with its provenance, and its resume state is kept.
 * An empty or failed load, or one discarded before the commit, leaves both slots and both
 * stores untouched (I6); a discard after the commit removes what it committed.
 */
export async function runQueryLoad(store: DataStore, req: QueryLoadRequest): Promise<StartResult> {
  const { query, cap } = req;
  const label = queryTitle(query);
  const job = store.startJob('query', req.origin, label, {
    state: 'planning',
    request: req,
    speciesLoaded: 0,
    speciesPlanned: null,
  });
  const controller = new AbortController();
  const gate = new PauseGate();
  const active: ActiveLoad = { job, controller, gate, cancelMode: null, flush: () => {} };
  store.active = active;
  /** The load ended or was cancelled: open the pause gate and drop the controls. */
  const release = () => {
    gate.open();
    if (store.active === active) store.active = null;
  };

  // Plan (ExplorerStore.planQuery reuses the workspace's plans for the same query).
  let plans: StreamPlan[];
  try {
    plans = await req.plan(controller.signal);
    if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (plans.length === 0) throw new Error('No source can run this query');
  } catch (error) {
    release();
    runInAction(() => {
      job.paused = false;
      if (controller.signal.aborted || isAbortError(error)) {
        job.state = 'cancelled';
        job.outcome = { emptyReason: 'cancelledEarly', previousKept: job.targetId != null };
      } else {
        job.state = 'error';
        job.error = shortError(error);
      }
    });
    return { started: true, committed: false };
  }

  // Clean: one cleaner for every source.
  const obisDetail = plans.find((p) => p.source === 'obis')?.detail as ObisExplorerDetail | undefined;
  const cleaner = new RecordCleaner({
    dedupe: query.quality.dedupe,
    area: query.area,
    lowCount: { obis: new Set(obisDetail?.lowCountNames ?? []) },
  });
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
  const speciesPlanned = plannedSpecies(plans);
  runInAction(() => {
    job.speciesPlanned = speciesPlanned;
    // Job-local until the finish: no source id exists before the commit (§4.1).
    job.run = { cursors: {}, tally };
    job.state = 'streaming';
    job.perSource = [...progress.values()].map((p) => ({ ...p }));
  });

  let lastFlush = 0;
  const flush = (force: boolean) => {
    const now = Date.now();
    if (!force && now - lastFlush < JOB_UPDATE_MS) return;
    lastFlush = now;
    runInAction(() => {
      const perSource = [...progress.values()].map((p) => ({ ...p, truncated: p.truncated && [...p.truncated] }));
      job.perSource = perSource;
      job.funnel = cleaner.funnel;
      job.truncated = perSource.flatMap((p) => p.truncated ?? []);
      job.speciesCoverage = speciesCoverage(perSource);
      job.speciesLoaded = tally.species.size;
      const fetched = perSource.reduce((s, p) => s + p.fetched, 0);
      job.etaSeconds = gate.paused ? null : etaSeconds(fetched, planned, now - job.startedAt);
    });
  };
  active.flush = () => flush(true);
  const onError = (source: SourceId, error: unknown) => {
    const p = progress.get(source);
    if (p) p.state = 'error';
    errors.push(`${source.toUpperCase()}: ${shortError(error)}`);
  };
  const onDone = (source: SourceId) => {
    const p = progress.get(source);
    if (p) p.state = 'done';
  };

  // The commit: the source exists from the first accepted record on (I2).
  let sourceId: string | null = null;
  let committedAt = '';
  const onFirstRecord = () => {
    sourceId = store.mintSourceId();
    committedAt = nowIso();
    const source: QueryOccurrences = {
      id: sourceId,
      role: 'occurrences',
      kind: 'explorer-query',
      label,
      exportName: label,
      status: 'loading',
      retrievedAt: committedAt,
      completedAt: null,
      query,
      cap,
      ...(req.exampleId ? { exampleId: req.exampleId } : {}),
      provenance: null,
      resumable: false,
    };
    store.commitOccurrence(source);
  };

  let finished = false;
  /** A stopped load too incomplete for bioregions (Infomap is skipped). */
  let skipBioregions = false;
  /** The job state once SpeciesStore is done ('finishing' until then). */
  let finalState: DataLoadState = 'done';
  const finish = () => {
    if (finished) return;
    finished = true;
    release();
    flush(true);
    runInAction(() => {
      const funnel = cleaner.funnel;
      const cancelled = active.cancelMode ?? (controller.signal.aborted ? 'keep' : null);
      job.funnel = funnel;
      job.speciesLoaded = tally.species.size;
      job.paused = false;
      job.etaSeconds = cancelled ? null : 0;
      if (errors.length > 0) job.error = errors.join('; ');
      job.state = 'finishing';
      if (!job.committed || sourceId == null) {
        // Nothing reached SpeciesStore: the slots and the stores are untouched (I6).
        const failed = !cancelled && errors.length >= plans.length;
        if (failed) {
          finalState = 'error';
          return;
        }
        const empty = emptyReasonOf(funnel, cancelled != null);
        finalState = cancelled ? 'cancelled' : 'error';
        if (!cancelled) job.error = [EMPTY_MESSAGES[empty], ...errors].join('; ');
        job.outcome = { emptyReason: empty, previousKept: job.targetId != null };
        return;
      }
      finalState = cancelled ? 'cancelled' : 'done';
      // A discard after the commit removes the source once SpeciesStore is done.
      if (cancelled === 'discard') return;

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
      const partial =
        cancelled || errors.length > 0
          ? partialLoad({
              planned,
              accepted: funnel.accepted,
              speciesLoaded: tally.species.size,
              speciesPlanned,
              fetched: [...progress.values()].reduce((s, p) => s + p.fetched, 0),
              missingSpecies: missingPlannedSpecies(plans, tally.species.keys()),
            })
          : null;
      // Stopped with too few species: keep the records, leave bioregions to the user.
      skipBioregions = cancelled === 'keep' && partial != null && partial.coverage < MIN_BIOREGION_COVERAGE;
      const completedAt = nowIso();
      const provenance: LoadProvenance = {
        query,
        retrievedAt: committedAt,
        funnel,
        // The frozen ledger learns the duplicates the load removed.
        ledger: req.ledger.map((r) => {
          if (!r.active || (r.id !== 'duplicates' && r.id !== 'crossSource')) return r;
          const n = (r.id === 'duplicates' ? funnel.dropped.duplicate : funnel.dropped.crossSource) ?? 0;
          return { ...r, impact: n, share: ledgerShare(n, req.ledgerBase) };
        }),
        kpis,
        accepted: funnel.accepted,
        partial,
        ...(skipBioregions && { bioregionsSkipped: true }),
        datasetCounts: tally.datasetCounts(req.labels.datasets),
        stats: tally.stats(req.labels),
        requests,
        cap,
        // TODO(S4): the stop state (cancelled, errors, cap).
        stop: null,
        completedAt,
      };
      store.replaceSource(sourceId, { status: 'done', completedAt, provenance, resumable: provenance.stop != null });
      store.runs.set(sourceId, {
        plans,
        cursors: { ...job.run?.cursors },
        tally,
        labels: req.labels,
        ledger: req.ledger,
        ledgerBase: req.ledgerBase,
      });
    });
  };

  async function* accepted(): AsyncGenerator<RecordBatch['records']> {
    try {
      for await (const batch of mergeBatches(streams, onError, onDone)) {
        // Paused: hold this batch uncounted until resumed; a cancel drops it.
        await gate.wait();
        if (controller.signal.aborted) break;
        const p = progress.get(batch.source);
        if (p) {
          mergeProgress(p, batch.progress);
          p.state = batch.progress.retryAt && batch.progress.retryAt > Date.now() ? 'rateLimited' : 'streaming';
        }
        const records = cleaner.accept(batch.records);
        tally.add(batch.source, records);
        flush(false);
        if (records.length > 0) yield records;
      }
    } finally {
      finish();
    }
  }

  let failure: unknown = null;
  try {
    await store.rootStore.speciesStore.loadRecords(accepted(), {
      controller,
      skipBioregions: () => skipBioregions,
      onFirstRecord,
    });
  } catch (error) {
    failure = error;
  }
  finish();
  runInAction(() => {
    if (failure != null && finalState === 'done') {
      finalState = 'error';
      job.error = shortError(failure);
    }
    job.state = finalState;
  });
  if (active.cancelMode === 'discard' && job.committed) store.removeOccurrences();
  return { started: true, committed: job.committed };
}
