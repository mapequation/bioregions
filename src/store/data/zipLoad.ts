// Load a GBIF download zip into the occurrence slot (spec
// docs/superpowers/specs/2026-10-31-data-sources-and-portal.md §2.2, §3 paths 3 and 9): read
// the zip's records through one cleaner, commit a `gbif-zip` source on the first accepted
// record, and settle its download summary (and, for a Cite-tab "Replace", the loaded query's
// provenance) at the finish.
import { runInAction } from 'mobx';
import { RecordCleaner } from '../../sources/clean';
import { gbifDownloadPredicate } from '../../sources/gbif/predicate';
import { type GbifZipSummary, downloadKeyFromName, importGbifZip } from '../../sources/gbif/zip';
import type { OccurrenceQuery, OccurrenceRecord } from '../../sources/types';
import type DataStore from '../DataStore';
import { JOB_UPDATE_MS, LoadTally, PauseGate, type TallyLabels, etaSeconds } from '../explorer/job';
import type { LoadProvenance } from '../explorer/provenance';
import type { LedgerRow, SourceProgress } from '../explorer/types';
import { type ActiveLoad, EMPTY_MESSAGES, emptyReasonOf, partialLoad, shortError } from './streamLoad';
import type { DataLoadState, JobOrigin, StartResult, ZipOccurrences } from './types';

export interface ZipLoadOptions {
  /** The tab [Open] returns to (default 'upload'). */
  origin?: JobOrigin;
  /**
   * A Cite-tab "Replace": the loaded query this download matches. Its cleaning (dedupe,
   * area, introduced records) applies and the source gets the query's provenance at the
   * finish. Without it the zip loads as it is (`dedupe: 'none'`) and has no provenance.
   */
  query?: OccurrenceQuery;
  /** What the Cite tab already read from the zip (key and DOI resolved against GBIF). */
  download?: GbifZipSummary;
  /** With `query`: the frozen ledger and the facet labels of the provenance. */
  ledger?: LedgerRow[];
  labels?: TallyLabels;
}

const nowIso = () => new Date().toISOString();

const fileName = (file: Blob) => ('name' in file && typeof file.name === 'string' ? file.name : '');

/**
 * Run one zip load into `store`'s occurrence slot. Nothing changes until the first accepted
 * record commits a `status: 'loading'` source with `download: null` and `provenance: null`
 * (I2); an empty or failed load, or a discard before the commit, leaves both slots and both
 * stores untouched (I6), and a discard after the commit removes what it committed.
 */
export async function runZipLoad(store: DataStore, file: Blob, opts: ZipLoadOptions = {}): Promise<StartResult> {
  const { query } = opts;
  const name = fileName(file);
  const key = opts.download?.downloadKey ?? downloadKeyFromName(name);
  const label = key ? `GBIF download ${key}` : 'GBIF download';
  const expected = opts.download?.rows ?? null;
  const job = store.startJob('zip', opts.origin ?? 'upload', label, { speciesLoaded: 0, speciesPlanned: null });
  const controller = new AbortController();
  const gate = new PauseGate();
  const active: ActiveLoad = { job, controller, gate, cancelMode: null, flush: () => {} };
  store.active = active;

  const cleaner = new RecordCleaner(query ? { dedupe: query.quality.dedupe, area: query.area } : { dedupe: 'none' });
  const tally = new LoadTally();
  const progress: SourceProgress = {
    source: 'gbif',
    state: 'streaming',
    fetched: 0,
    expected: expected ?? 0,
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
      job.etaSeconds = gate.paused || expected == null ? null : etaSeconds(progress.fetched, expected, now - job.startedAt);
    });
  };
  active.flush = () => flush(true);

  // The commit: the source exists from the first accepted record on (I2).
  let sourceId: string | null = null;
  let committedAt = '';
  const onFirstRecord = () => {
    sourceId = store.mintSourceId();
    committedAt = nowIso();
    const source: ZipOccurrences = {
      id: sourceId,
      role: 'occurrences',
      kind: 'gbif-zip',
      label,
      exportName: label,
      status: 'loading',
      retrievedAt: committedAt,
      completedAt: null,
      file: { name: name || label, size: file.size },
      download: null,
      provenance: null,
    };
    store.commitOccurrence(source);
  };

  /** The zip reader's own summary, once it has read the whole table. */
  let summary: GbifZipSummary | null = null;
  let readError: unknown = null;
  let finished = false;
  /** The job state once SpeciesStore is done ('finishing' until then). */
  let finalState: DataLoadState = 'done';
  const finish = () => {
    if (finished) return;
    finished = true;
    gate.open();
    if (store.active === active) store.active = null;
    flush(true);
    runInAction(() => {
      const funnel = cleaner.funnel;
      const cancelled = active.cancelMode ?? (controller.signal.aborted ? 'keep' : null);
      job.paused = false;
      job.etaSeconds = cancelled ? null : 0;
      job.state = 'finishing';
      if (readError != null && !cancelled) job.error = shortError(readError);
      if (!job.committed || sourceId == null) {
        // Nothing reached SpeciesStore: the slots and the stores are untouched (I6).
        if (readError != null && !cancelled) {
          finalState = 'error';
          return;
        }
        const empty = emptyReasonOf(funnel, cancelled != null);
        finalState = cancelled ? 'cancelled' : 'error';
        if (!cancelled) job.error = EMPTY_MESSAGES[empty];
        job.outcome = { emptyReason: empty, previousKept: job.targetId != null };
        return;
      }
      finalState = cancelled ? 'cancelled' : 'done';
      // A discard after the commit removes the source once SpeciesStore is done.
      if (cancelled === 'discard') return;
      const completedAt = nowIso();
      const read = summary ?? opts.download ?? null;
      const download: ZipOccurrences['download'] = read && {
        key: read.downloadKey ?? key,
        doi: read.doi ?? opts.download?.doi,
        citation: read.citation ?? opts.download?.citation,
        format: read.format,
        rows: read.rows,
        absent: read.absent,
      };
      const provenance: LoadProvenance | null = query
        ? {
            query,
            retrievedAt: committedAt,
            funnel,
            ledger: opts.ledger ?? [],
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
                  planned: expected ?? progress.fetched,
                  accepted: funnel.accepted,
                  speciesLoaded: tally.species.size,
                  speciesPlanned: null,
                  fetched: progress.fetched,
                })
              : null,
            datasetCounts: tally.datasetCounts(opts.labels?.datasets),
            stats: tally.stats(opts.labels ?? {}),
            requests: { gbif: gbifDownloadPredicate(query) },
            gbifDownloadKey: download?.key ?? key,
            gbifDownloadDoi: download?.doi,
            fromZip: true,
            completedAt,
          }
        : null;
      store.replaceSource(sourceId, { status: 'done', completedAt, download, provenance } as Partial<ZipOccurrences>);
    });
  };

  async function* accepted(): AsyncGenerator<OccurrenceRecord[]> {
    try {
      const reader = importGbifZip(file, {
        signal: controller.signal,
        excludeIntroduced: query?.quality.excludeIntroduced ?? false,
      });
      for (;;) {
        const step = await reader.next();
        if (step.done) {
          summary = step.value;
          progress.state = 'done';
          break;
        }
        // Paused: hold this batch uncounted until resumed; a cancel drops it.
        await gate.wait();
        if (controller.signal.aborted) {
          await reader.return?.(undefined as never);
          break;
        }
        progress.fetched += step.value.records.length;
        const records = cleaner.accept(step.value.records);
        tally.add('gbif', records);
        flush(false);
        if (records.length > 0) yield records;
      }
    } catch (error) {
      if (!controller.signal.aborted) readError = error;
    } finally {
      finish();
    }
  }

  let failure: unknown = null;
  try {
    await store.rootStore.speciesStore.loadRecords(accepted(), { controller, onFirstRecord });
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
