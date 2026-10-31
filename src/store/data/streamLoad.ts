// Stream an explorer query into the occurrence slot (spec
// docs/superpowers/specs/2026-10-31-data-sources-and-portal.md §2.3, §3 paths 6, 7, 13 and 14,
// §4): plan, stream every enabled source through one cleaner, commit the source on the
// first accepted record, and settle it (provenance, stop reason, `completedAt`, resume
// state) at the finish. A Continue resumes the same plans from their cursors and merges
// its run into the loaded source.
import { runInAction } from 'mobx';
import { niceCapAbove } from '../../components/Explorer/load/loadMath';
import { RecordCleaner } from '../../sources/clean';
import { gbifDownloadPredicate } from '../../sources/gbif/predicate';
import { streamGbif } from '../../sources/gbif/stream';
import { HttpError, isAbortError } from '../../sources/http';
import { streamObis } from '../../sources/obis/stream';
import { queryTitle } from '../../sources/query';
import type { Funnel, OccurrenceQuery, RecordBatch, SourceId, StreamCursor, StreamPlan } from '../../sources/types';
import type DataStore from '../DataStore';
import {
  JOB_UPDATE_MS,
  LoadTally,
  PauseGate,
  SeededDedupe,
  type TallyLabels,
  etaSeconds,
  mergeBatches,
  mergeFunnels,
} from '../explorer/job';
import { type ObisExplorerDetail, missingPlannedSpecies, planSpeciesNames } from '../explorer/plan';
import { type LoadProvenance, partialCoverage, partialKind } from '../explorer/provenance';
import type { EmptyReason, Kpis, LedgerRow, PartialLoad, SourceProgress } from '../explorer/types';
import type {
  DataLoadJob,
  DataLoadState,
  JobOrigin,
  QueryLoadRequest,
  QueryOccurrences,
  ResumeState,
  StartResult,
  StopState,
} from './types';

/** Job error text for a load that ended with no record. */
export const EMPTY_MESSAGES: Record<EmptyReason, string> = {
  noMatches: 'No records matched this query',
  allDropped: 'Cleaning removed every record',
  cancelledEarly: 'Stopped before any record arrived',
  failed: 'Every request failed',
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

/**
 * Merge a stream's progress into the job's, never letting the request total shrink. It
 * copies the failure fields as they come (`failedParts`, `lastError`, `stoppedEarly`).
 */
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

/**
 * Why a run stopped early, from its per-source progress, or null when it completed
 * (spec §4.1): `'cancelled'` when the user stopped it; else `'errors'` when parts failed
 * after their retries or a source threw; else `'cap'` when a source fetched its
 * `maxRecords` (the estimate was low). `sources` names the failed and capped sources.
 */
export function stopStateOf(p: {
  cancelled: boolean;
  progress: SourceProgress[];
  thrown: { source: SourceId; error: unknown }[];
  cap: number;
  plans: StreamPlan[];
}): StopState | null {
  const failedParts = p.progress.reduce((n, x) => n + (x.failedParts ?? 0), 0);
  const stoppedEarly = p.progress.some((x) => x.stoppedEarly === 'errors');
  const failing = new Set<SourceId>(p.thrown.map((t) => t.source));
  for (const x of p.progress) if ((x.failedParts ?? 0) > 0 || x.stoppedEarly) failing.add(x.source);
  const capped = p.progress.filter((x) => x.fetched >= p.cap).map((x) => x.source);
  const reason = p.cancelled ? 'cancelled' : failing.size > 0 ? 'errors' : capped.length > 0 ? 'cap' : null;
  if (reason == null) return null;
  const named = new Set(reason === 'cap' ? capped : [...failing, ...capped]);
  const sources = p.plans.map((x) => x.source).filter((id) => named.has(id));
  const lastError = p.progress.find((x) => x.lastError)?.lastError ?? (p.thrown[0] && shortError(p.thrown[0].error));
  const estimated = sources.length > 0 ? p.plans.filter((x) => named.has(x.source)) : p.plans;
  return {
    reason,
    ...(lastError ? { lastError } : {}),
    failedParts,
    stoppedEarly,
    sources,
    requests: p.progress.reduce((n, x) => n + x.requestsTotal, 0),
    requestsDone: p.progress.reduce((n, x) => n + x.requestsDone, 0),
    estimate: estimated.reduce((n, x) => n + x.expectedRecords, 0),
  };
}

/**
 * The cap a Continue of `provenance` runs with (spec §4.2, §9.1): the load's own cap,
 * except after a cap stop, where it is raised to a round number strictly above both the
 * estimate and what was fetched.
 */
export function continueCap(provenance: LoadProvenance, run: ResumeState | undefined): number {
  const cap = provenance.cap ?? 0;
  if (provenance.stop?.reason !== 'cap') return cap;
  const planned = (run?.plans ?? []).reduce((n, p) => n + p.expectedRecords, 0);
  const fetched = Math.max(cap, ...Object.values(run?.fetched ?? {}).map((n) => n ?? 0));
  return niceCapAbove(Math.max(planned, fetched) + 1);
}

/** The frozen ledger with the duplicates the load removed (rebuilt from the whole funnel). */
function settleLedger(ledger: LedgerRow[], funnel: Funnel, base: number | null): LedgerRow[] {
  return ledger.map((r) => {
    if (!r.active || (r.id !== 'duplicates' && r.id !== 'crossSource')) return r;
    const n = (r.id === 'duplicates' ? funnel.dropped.duplicate : funnel.dropped.crossSource) ?? 0;
    return { ...r, impact: n, share: ledgerShare(n, base) };
  });
}

/** Points already loaded, so a Continue drops records that duplicate them. */
function* loadedPoints(store: DataStore): Generator<{ name: string; lon: number; lat: number }> {
  for (const f of store.rootStore.speciesStore.collection.features) {
    if (f.geometry?.type !== 'Point') continue;
    const [lon, lat] = f.geometry.coordinates;
    yield { name: f.properties.name, lon, lat };
  }
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

/** One stream run: a first load of a query, or a Continue of a loaded query source. */
interface StreamRun {
  kind: 'query' | 'continue';
  label: string;
  origin: JobOrigin;
  query: OccurrenceQuery;
  cap: number;
  plan: (signal: AbortSignal) => Promise<StreamPlan[]>;
  labels: TallyLabels;
  ledger: LedgerRow[];
  ledgerBase: number | null;
  exampleId?: string;
  /** A first load keeps its request for `retry()`. */
  request?: QueryLoadRequest;
  /** A Continue: the loaded source and its resume state. */
  target?: { source: QueryOccurrences; provenance: LoadProvenance; run: ResumeState };
}

/**
 * Run one query load into `store`'s occurrence slot. Nothing changes until the first
 * accepted record commits a `status: 'loading'` source with `provenance: null` (I2); at
 * the finish the source becomes `'done'` with its provenance, and its resume state is kept.
 * An empty or failed load, or one discarded before the commit, leaves both slots and both
 * stores untouched (I6); a discard after the commit removes what it committed.
 */
export function runQueryLoad(store: DataStore, req: QueryLoadRequest): Promise<StartResult> {
  return runStream(store, {
    kind: 'query',
    label: queryTitle(req.query),
    origin: req.origin,
    query: req.query,
    cap: req.cap,
    plan: req.plan,
    labels: req.labels,
    ledger: req.ledger,
    ledgerBase: req.ledgerBase,
    ...(req.exampleId ? { exampleId: req.exampleId } : {}),
    request: req,
  });
}

/**
 * Continue a stopped query load in place (spec §4.2): the same plans resume from the
 * cursors whose records reached SpeciesStore, the records are appended (deduplicated
 * against the loaded points), and at the finish the run is merged into the same source.
 * The source stays `'done'` with its old provenance until then (I7). After a cap stop the
 * cap is raised (`continueCap`).
 */
export function runContinueLoad(
  store: DataStore,
  source: QueryOccurrences,
  run: ResumeState,
  origin: JobOrigin,
): Promise<StartResult> {
  const provenance = source.provenance as LoadProvenance;
  return runStream(store, {
    kind: 'continue',
    label: `Continuing ${source.label}`,
    origin,
    query: provenance.query,
    cap: continueCap(provenance, run),
    plan: async () => run.plans,
    labels: run.labels,
    ledger: run.ledger,
    ledgerBase: run.ledgerBase,
    target: { source, provenance, run },
  });
}

async function runStream(store: DataStore, spec: StreamRun): Promise<StartResult> {
  const { query, cap, target } = spec;
  const job = store.startJob(spec.kind, spec.origin, spec.label, {
    state: target ? 'streaming' : 'planning',
    ...(spec.request ? { request: spec.request } : {}),
    ...(target ? { targetId: target.source.id, committed: true } : {}),
    speciesLoaded: target ? target.run.tally.species.size : 0,
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

  // Plan (ExplorerStore.planQuery reuses the workspace's plans for the same query); a
  // Continue reuses the first run's plans, since a cursor is only valid for its plan.
  let plans: StreamPlan[];
  try {
    plans = await spec.plan(controller.signal);
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
        job.outcome = { emptyReason: 'failed', previousKept: job.targetId != null };
      }
    });
    return { started: true, committed: false };
  }

  // Clean: one cleaner for every source; a Continue also drops records already loaded.
  const obisDetail = plans.find((p) => p.source === 'obis')?.detail as ObisExplorerDetail | undefined;
  const cleaner = new RecordCleaner({
    dedupe: query.quality.dedupe,
    area: query.area,
    lowCount: { obis: new Set(obisDetail?.lowCountNames ?? []) },
  });
  const seeded = target ? new SeededDedupe(query.quality.dedupe, loadedPoints(store)) : null;
  /** This run's funnel (a Continue's counts the seeded duplicates too). */
  const runFunnel = () => (seeded ? seeded.adjust(cleaner.funnel) : cleaner.funnel);
  const tally = target ? target.run.tally : new LoadTally();
  // The cursors whose records reached SpeciesStore; a Continue starts from the last ones.
  const cursors: Partial<Record<SourceId, StreamCursor>> = { ...target?.run.cursors };
  const progress = new Map<SourceId, SourceProgress>(
    plans.map((p) => [
      p.source,
      {
        source: p.source,
        state: 'streaming',
        // Cumulative over all runs, as the resumed stream reports it.
        fetched: target?.run.fetched[p.source] ?? 0,
        expected: Math.min(p.expectedRecords, cap),
        requestsDone: 0,
        requestsTotal: p.requests,
        bytes: 0,
      },
    ]),
  );
  const planned = [...progress.values()].reduce((s, p) => s + p.expected, 0);
  const fetchedBefore = [...progress.values()].reduce((s, p) => s + p.fetched, 0);
  const thrown: { source: SourceId; error: unknown }[] = [];
  const streams = plans.map((p) => {
    const resume = cursors[p.source];
    const opts = { maxRecords: cap, signal: controller.signal, ...(resume ? { resume } : {}) };
    return { source: p.source, stream: (p.source === 'gbif' ? streamGbif : streamObis)(p, opts) };
  });
  const speciesPlanned = plannedSpecies(plans);
  runInAction(() => {
    job.speciesPlanned = speciesPlanned;
    // Job-local until the finish: no source id exists before the commit (§4.1).
    job.run = { cursors: { ...cursors }, tally };
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
      job.funnel = runFunnel();
      job.truncated = perSource.flatMap((p) => p.truncated ?? []);
      job.speciesCoverage = speciesCoverage(perSource);
      job.speciesLoaded = tally.species.size;
      const fetched = perSource.reduce((s, p) => s + p.fetched, 0) - fetchedBefore;
      job.etaSeconds = gate.paused ? null : etaSeconds(fetched, planned - fetchedBefore, now - job.startedAt);
    });
  };
  active.flush = () => flush(true);
  const onError = (source: SourceId, error: unknown) => {
    const p = progress.get(source);
    if (p) p.state = 'error';
    thrown.push({ source, error });
  };
  const onDone = (source: SourceId) => {
    const p = progress.get(source);
    if (p) p.state = 'done';
  };
  /** Records of `source` up to this cursor reached SpeciesStore (or none were accepted). */
  const advance = (source: SourceId, cursor: StreamCursor | undefined) => {
    if (!cursor) return;
    cursors[source] = cursor;
    runInAction(() => {
      if (job.run) job.run.cursors[source] = cursor;
    });
  };

  // The commit: the source exists from the first accepted record on (I2). A Continue
  // appends to the committed source and never commits.
  let sourceId: string | null = target?.source.id ?? null;
  let committedAt = '';
  const onFirstRecord = () => {
    sourceId = store.mintSourceId();
    committedAt = nowIso();
    const source: QueryOccurrences = {
      id: sourceId,
      role: 'occurrences',
      kind: 'explorer-query',
      label: spec.label,
      exportName: spec.label,
      status: 'loading',
      retrievedAt: committedAt,
      completedAt: null,
      query,
      cap,
      ...(spec.exampleId ? { exampleId: spec.exampleId } : {}),
      provenance: null,
      resumable: false,
    };
    store.commitOccurrence(source);
  };

  let finished = false;
  /** Records handed to SpeciesStore in this run. */
  let appended = 0;
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
      const funnel = runFunnel();
      const cancelled = active.cancelMode ?? (controller.signal.aborted ? 'keep' : null);
      const perSource = [...progress.values()];
      const stop = stopStateOf({ cancelled: cancelled != null, progress: perSource, thrown, cap, plans });
      const failed = perSource.some((p) => (p.failedParts ?? 0) > 0) || thrown.length > 0;
      job.funnel = funnel;
      job.speciesLoaded = tally.species.size;
      job.paused = false;
      job.etaSeconds = cancelled ? null : 0;
      if (thrown.length > 0) job.error = thrown.map((t) => `${t.source.toUpperCase()}: ${shortError(t.error)}`).join('; ');
      job.state = 'finishing';
      if (!job.committed || sourceId == null) {
        // Nothing reached SpeciesStore: the slots and the stores are untouched (I6).
        const previousKept = job.targetId != null;
        if (failed) {
          finalState = 'error';
          job.error = stop?.lastError ?? EMPTY_MESSAGES.failed;
          job.outcome = { emptyReason: 'failed', previousKept, ...(stop ? { stop } : {}) };
          return;
        }
        const empty = emptyReasonOf(funnel, cancelled != null);
        finalState = cancelled ? 'cancelled' : 'error';
        if (!cancelled) job.error = EMPTY_MESSAGES[empty];
        job.outcome = { emptyReason: empty, previousKept };
        return;
      }
      finalState = cancelled ? 'cancelled' : 'done';
      // A discard after the commit removes the source once SpeciesStore is done.
      if (cancelled === 'discard') return;

      const fetched: Partial<Record<SourceId, number>> = {};
      for (const p of perSource) fetched[p.source] = p.fetched;
      const resume: ResumeState = {
        plans,
        cursors: { ...cursors },
        fetched,
        tally,
        labels: spec.labels,
        ledger: spec.ledger,
        ledgerBase: spec.ledgerBase,
      };
      if (target && funnel.received === 0 && stop) {
        // A Continue that got nothing new: only the stop (its error and failed parts) changes.
        store.replaceSource(sourceId, { provenance: { ...target.provenance, stop }, resumable: true });
        store.runs.set(sourceId, resume);
        return;
      }

      const total = target ? mergeFunnels(target.provenance.funnel, funnel) : funnel;
      const requests: Partial<Record<SourceId, unknown>> = target?.provenance.requests ?? {};
      if (!target) {
        for (const p of plans) {
          requests[p.source] = p.source === 'gbif' ? gbifDownloadPredicate(query) : (p.detail as ObisExplorerDetail).params;
        }
      }
      const kpis: Kpis = {
        records: total.accepted,
        recordsUpperBound: false,
        species: tally.species.size,
        datasets: tally.datasetTotal,
        yearRange: tally.yearRange,
        bySource: { ...tally.bySource },
      };
      const partial = stop
        ? partialLoad({
            planned,
            accepted: total.accepted,
            speciesLoaded: tally.species.size,
            speciesPlanned,
            fetched: perSource.reduce((s, p) => s + p.fetched, 0),
            missingSpecies: missingPlannedSpecies(plans, tally.species.keys()),
          })
        : null;
      // Stopped with too few species: keep the records, leave bioregions to the user.
      skipBioregions = cancelled === 'keep' && partial != null && partial.coverage < MIN_BIOREGION_COVERAGE;
      // SpeciesStore runs nothing for a run that appended no record: a skip stays skipped.
      const skipped = skipBioregions || (target?.provenance.bioregionsSkipped === true && appended === 0);
      const completedAt = nowIso();
      const { bioregionsSkipped: _, ...kept } = target?.provenance ?? ({} as Partial<LoadProvenance>);
      const provenance: LoadProvenance = {
        // A Continue keeps the first run's query, retrieval time, requests and citations.
        ...kept,
        query,
        retrievedAt: target?.provenance.retrievedAt ?? committedAt,
        funnel: total,
        ledger: settleLedger(spec.ledger, total, spec.ledgerBase),
        kpis,
        accepted: total.accepted,
        partial,
        ...(skipped && { bioregionsSkipped: true }),
        datasetCounts: tally.datasetCounts(spec.labels.datasets),
        stats: tally.stats(spec.labels),
        requests,
        cap,
        stop,
        completedAt,
      };
      store.replaceSource(sourceId, {
        status: 'done',
        completedAt,
        cap,
        provenance,
        resumable: provenance.stop != null,
      } as Partial<QueryOccurrences>);
      store.runs.set(sourceId, resume);
    });
  };

  async function* accepted(): AsyncGenerator<RecordBatch['records']> {
    try {
      for await (const batch of mergeBatches(streams, onError, onDone)) {
        // Paused: hold this batch uncounted until resumed; a cancel drops it (and its cursor).
        await gate.wait();
        if (controller.signal.aborted) break;
        const p = progress.get(batch.source);
        if (p) {
          mergeProgress(p, batch.progress);
          p.state = batch.progress.retryAt && batch.progress.retryAt > Date.now() ? 'rateLimited' : 'streaming';
        }
        const kept = cleaner.accept(batch.records);
        const records = seeded ? seeded.filter(kept) : kept;
        tally.add(batch.source, records);
        flush(false);
        // The generator resumes only once SpeciesStore took the batch, so a batch dropped
        // by an abort or a `break` never advances its cursor (§4.1).
        if (records.length > 0) {
          yield records;
          appended += records.length;
        }
        advance(batch.source, batch.cursor);
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
      ...(target ? {} : { onFirstRecord }),
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
  if (active.cancelMode === 'discard' && job.committed && !target) store.removeOccurrences();
  return { started: true, committed: job.committed };
}
