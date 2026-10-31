// The one owner of loaded data (spec docs/superpowers/specs/2026-10-31-data-sources-and-portal.md).
// It holds an occurrence slot and a tree slot, and every load and clear of SpeciesStore
// and TreeStore goes through it: a load replaces only its own slot, and only when it
// commits (the first feature, or a validated tree).
import { action, computed, makeObservable, observable, runInAction, toJS, when } from 'mobx';
import type RootStore from './RootStore';
import { RecordCleaner } from '../sources/clean';
import { extension, getName } from '../utils/filename';
import { loadText } from '../utils/loader';
import { citations, methodsText, type CitationItem } from './data/methods';
import { EXAMPLE_CITATION_PLACEHOLDER, type ExampleEntry } from './data/catalog';
import type { UploadPlan } from './data/classify';
import { type ActiveLoad, continueCap, runContinueLoad, runQueryLoad } from './data/streamLoad';
import { type ZipLoadOptions, runZipLoad } from './data/zipLoad';
import type { LoadProvenance } from './explorer/provenance';
import type {
  DataLoadJob,
  ExampleOccurrences,
  ExampleTreeSource,
  FileOccurrences,
  FileTreeSource,
  JobOrigin,
  LoadedSource,
  OccurrenceFileInput,
  OccurrenceSource,
  OpenTreeSource,
  QueryLoadRequest,
  ResumeState,
  StartResult,
  TreeJob,
  TreeLoadInput,
  TreeLoadOptions,
  TreeSource,
  ZipOccurrences,
} from './data/types';

export const LOAD_RUNNING = 'A load is running';
export const NO_COLUMNS = 'Choose the species, latitude and longitude columns';
export const NOT_RESUMABLE = 'The loaded data cannot be continued';
export const NOTHING_TO_RELOAD = 'No query load to repeat';
export const NOTHING_TO_RETRY = 'No failed or stopped load to retry';

/** Citations of the same data that `patchOccurrence` may add (an absent key is kept, `undefined` clears). */
export type OccurrencePatch = Partial<Pick<LoadProvenance, 'derivedDoi' | 'gbifDownloadKey' | 'gbifDownloadDoi'>>;

/** The inline dataset of the documentation demo. */
export interface InlineData {
  label: string;
  csv: string;
  newick?: string;
}

/** A tree source before the commit gives it an id, its tip count and its time. */
type OmitEach<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type UncommittedTree = OmitEach<TreeSource, 'id' | 'tips' | 'retrievedAt'>;

/** Fields of an occurrence source that the commit fills in. */
type Uncommitted<T> = Omit<T, 'id' | 'status' | 'retrievedAt' | 'completedAt'>;

const nowIso = () => new Date().toISOString();
/** A job's sequence number (`job-N`). */
const jobNumber = (job: DataLoadJob) => Number(job.id.slice(4));
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
const fileInfo = (file: File | string) =>
  typeof file === 'string' ? { name: file.split('/').pop() ?? file, size: 0 } : { name: file.name, size: file.size };

export default class DataStore {
  rootStore: RootStore;
  /** Occurrences first, then the tree; at most one source per role (I1). */
  sources: LoadedSource[] = [];
  /** The current occurrence load, or the last finished one. */
  job: DataLoadJob | null = null;
  /** The current tree load, or the last tree error. */
  treeJob: TreeJob | null = null;
  /** The running stream load's controls (not observable; data/streamLoad.ts sets it). */
  active: ActiveLoad | null = null;
  /** Resume state per finished query source (§4.1); deleted when its source leaves the slot. */
  readonly runs = new Map<string, ResumeState>();
  private nextSourceId = 1;
  private nextJobId = 1;
  /** An example, upload or query example holds the guard before its job starts (I9). */
  reserved = false;
  /** Bumped by every Infomap rerun and by every swap of the occurrence data. */
  private rerunGen = 0;
  /** A tree committed during an occurrence load, rerun once the load ends unless it used it. */
  private treeDuringLoad: { treeId: string; built: boolean; minJob: number } | null = null;

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;
    makeObservable<DataStore, 'setSlot'>(this, {
      sources: observable.ref,
      job: observable,
      treeJob: observable,
      reserved: observable,
      occurrence: computed,
      tree: computed,
      isLoading: computed,
      methodsText: computed,
      citations: computed,
      treeOverlap: computed,
      setSlot: action,
    });
  }

  get occurrence(): OccurrenceSource | null {
    return (this.sources.find((s) => s.role === 'occurrences') as OccurrenceSource | undefined) ?? null;
  }

  get tree(): TreeSource | null {
    return (this.sources.find((s) => s.role === 'tree') as TreeSource | undefined) ?? null;
  }

  /** An occurrence load runs (I9). Pausing is a flag on a 'streaming' job. */
  get isLoading(): boolean {
    if (this.reserved) return true;
    const state = this.job?.state;
    return state === 'planning' || state === 'streaming' || state === 'finishing';
  }

  get methodsText(): string {
    const { speciesStore } = this.rootStore;
    return methodsText(
      this.sources,
      {
        records: speciesStore.numRecords,
        species: speciesStore.numSpecies,
        polygons: speciesStore.numPolygonsDebounced,
      },
      { downloads: this.rootStore.explorerStore?.downloads },
    );
  }

  get citations(): CitationItem[] {
    return citations(this.sources, { downloads: this.rootStore.explorerStore?.downloads });
  }

  /** Loaded species that are also tips of the loaded tree. */
  get treeOverlap(): { tips: number; inTree: number; datasetSpecies: number } | null {
    const tree = this.tree;
    if (!tree) return null;
    const { speciesStore, treeStore } = this.rootStore;
    let inTree = 0;
    for (const name of speciesStore.speciesMap.keys()) {
      if (treeStore.treeNodeMap.has(name)) ++inTree;
    }
    return { tips: tree.tips, inTree, datasetSpecies: speciesStore.speciesMap.size };
  }

  // --- slots ------------------------------------------------------------------------

  /** Internal to `src/store/data/**`. */
  mintSourceId() {
    return `src-${this.nextSourceId++}`;
  }

  /** Put `source` in its role's slot (or empty `role`'s slot), keeping occurrences first. */
  private setSlot(role: LoadedSource['role'], source: LoadedSource | null) {
    for (const s of this.sources) if (s.role === role && s.id !== source?.id) this.runs.delete(s.id);
    const others = this.sources.filter((s) => s.role !== role);
    const next = source ? [...others, source] : others;
    this.sources = next.sort((a, b) => (a.role === b.role ? 0 : a.role === 'occurrences' ? -1 : 1));
  }

  /** Replace a source with a patched copy (sources are immutable). Internal to `src/store/data/**`. */
  replaceSource(id: string, patch: Partial<LoadedSource>) {
    runInAction(() => {
      this.sources = this.sources.map((s) => (s.id === id ? ({ ...s, ...patch } as LoadedSource) : s));
    });
  }

  /**
   * Clear the species and Infomap results and swap the occurrence slot, in one action
   * (I2). Passed as `onFirstRecord` to the SpeciesStore loaders.
   */
  commitOccurrence = action((source: OccurrenceSource) => {
    const { speciesStore, infomapStore } = this.rootStore;
    this.stopInfomap();
    speciesStore.clearData();
    infomapStore.clearData();
    this.setSlot('occurrences', source);
    if (this.job && this.isLoading) this.job.committed = true;
  });

  /**
   * Validate the Newick text, then swap the tree and the tree slot in one action (I3).
   * Throws (changing nothing) when the text is not a valid tree.
   */
  private commitTree(text: string, source: UncommittedTree): TreeSource {
    const { treeStore } = this.rootStore;
    return runInAction(() => {
      treeStore.loadString(text);
      const committed = {
        ...source,
        id: this.mintSourceId(),
        tips: treeStore.numLeafNodes,
        retrievedAt: nowIso(),
      } as TreeSource;
      this.setSlot('tree', committed);
      return committed;
    });
  }

  // --- occurrence loads -----------------------------------------------------------------

  /** Start an occurrence load job (`extra` overrides the defaults). Internal to `src/store/data/**`. */
  startJob(kind: DataLoadJob['kind'], origin: JobOrigin, label: string, extra: Partial<DataLoadJob> = {}): DataLoadJob {
    const job: DataLoadJob = {
      id: `job-${this.nextJobId++}`,
      kind,
      origin,
      targetId: this.occurrence?.id ?? null,
      committed: false,
      state: 'streaming',
      label,
      startedAt: Date.now(),
      etaSeconds: null,
      perSource: [],
      funnel: new RecordCleaner({ dedupe: 'none' }).funnel,
      truncated: [],
      speciesCoverage: null,
      paused: false,
      ...extra,
    };
    runInAction(() => {
      this.job = job;
    });
    // The observable copy, so later writes notify observers.
    return this.job as DataLoadJob;
  }

  /**
   * Hold the single-load guard (I9) across an async phase that runs before a job exists:
   * an example's or upload's tree, a query example's plans. Null when a load runs.
   * `handOff(start)` releases the guard and starts the job in one batch, so no other load
   * and no `!isLoading` reaction sees a gap; `release()` (idempotent) frees it on any exit.
   */
  reserve(): { handOff: <T>(start: () => T) => T; release: () => void } | null {
    if (this.isLoading) return null;
    runInAction(() => {
      this.reserved = true;
    });
    let held = true;
    const release = () => {
      if (!held) return;
      held = false;
      runInAction(() => {
        this.reserved = false;
      });
    };
    const handOff = <T>(start: () => T): T =>
      runInAction(() => {
        release();
        return start();
      });
    return { release, handOff };
  }

  /**
   * Run one file-backed occurrence load (CSV/TSV or shapefile) into the occurrence slot.
   * It commits on the first feature; 0 features or a failure before it leave both slots
   * and SpeciesStore untouched (I6) and set `job.error`.
   */
  private async runFileLoad(
    input: OccurrenceFileInput,
    kind: 'file' | 'example',
    origin: JobOrigin,
    label: string,
    source: Uncommitted<FileOccurrences> | Uncommitted<ExampleOccurrences>,
  ): Promise<StartResult> {
    if (this.isLoading) return { started: false, reason: LOAD_RUNNING };
    const { speciesStore } = this.rootStore;
    const job = this.startJob(kind, origin, label);
    let id: string | null = null;
    const onFirstRecord = () => {
      id = this.mintSourceId();
      this.commitOccurrence({ ...source, id, status: 'loading', retrievedAt: nowIso(), completedAt: null } as OccurrenceSource);
    };
    let failure: unknown = null;
    try {
      // A load cancelled before the first feature resolves with nothing committed.
      if (input.format === 'shapefile') {
        await speciesStore.loadShapefile(input.files, { nameKey: input.nameKey, onFirstRecord });
      } else {
        await speciesStore.load(input.file, {
          nameColumn: input.columns.name,
          latColumn: input.columns.lat,
          longColumn: input.columns.long,
          onFirstRecord,
        });
      }
    } catch (error) {
      failure = error;
    }
    if (id) this.replaceSource(id, { status: 'done', completedAt: nowIso() });
    runInAction(() => {
      if (failure) {
        // After the commit, what arrived is kept and the job reports the error.
        job.state = 'error';
        job.error = errorText(failure);
      } else if (!job.committed) {
        job.state = 'cancelled';
        job.outcome = { emptyReason: 'cancelledEarly', previousKept: job.targetId != null };
      } else {
        job.state = 'done';
      }
    });
    return { started: true, committed: job.committed };
  }

  /** Load an occurrence file (CSV/TSV with a column mapping, or a shapefile). */
  loadOccurrenceFile(input: OccurrenceFileInput, origin: JobOrigin = 'upload'): Promise<StartResult> {
    const files =
      input.format === 'shapefile'
        ? (Array.isArray(input.files) ? input.files : [input.files]).map(fileInfo)
        : [fileInfo(input.file)];
    const main =
      files.find((f) => ['shp', 'zip'].includes(extension(f.name).toLowerCase())) ?? files[0];
    const label = main?.name ?? 'Occurrence file';
    return this.runFileLoad(input, 'file', origin, label, {
      role: 'occurrences',
      kind: 'file',
      label,
      exportName: getName(label) || label,
      format: input.format,
      files,
      ...(input.format === 'shapefile' ? {} : { columns: input.columns }),
    });
  }

  // --- stream loads ------------------------------------------------------------------

  /** Plan and stream an explorer query into the occurrence slot; commits on the first accepted record. */
  async loadQuery(req: QueryLoadRequest): Promise<StartResult> {
    if (this.isLoading) return { started: false, reason: LOAD_RUNNING };
    return runQueryLoad(this, req);
  }

  /**
   * The cap the next `continueLoad()` runs with ("Continue up to …"): the load's cap, raised
   * after a cap stop (§4.2, §9.1). Null when the loaded data cannot be continued.
   */
  get continueCap(): number | null {
    const source = this.occurrence;
    if (source?.kind !== 'explorer-query' || !source.resumable || !source.provenance) return null;
    return continueCap(source.provenance, this.runs.get(source.id));
  }

  /**
   * Continue the loaded query where it stopped (§4.2): the same plans resume from their
   * cursors, the new records are appended, and the source keeps its id, query and
   * `retrievedAt`. The source stays `'done'` with its old provenance until the finish (I7).
   * Only a stopped (`resumable`) query load, and only while no load runs.
   */
  async continueLoad(origin: JobOrigin = 'search'): Promise<StartResult> {
    if (this.isLoading) return { started: false, reason: LOAD_RUNNING };
    const source = this.occurrence;
    const run = source ? this.runs.get(source.id) : undefined;
    if (source?.kind !== 'explorer-query' || source.status !== 'done' || !source.resumable || !source.provenance || !run) {
      return { started: false, reason: NOT_RESUMABLE };
    }
    return runContinueLoad(this, source, run, origin);
  }

  /**
   * Load the loaded query again from scratch (§4.3): fresh plans of `source.query` with its
   * cap, a new source on the first record, the old one kept on an empty or failed result
   * (I6). The workspace query, plans and plan controller are not touched.
   */
  async loadAgain(origin: JobOrigin = 'search'): Promise<StartResult> {
    if (this.isLoading) return { started: false, reason: LOAD_RUNNING };
    const source = this.occurrence;
    if (source?.kind !== 'explorer-query' || source.status !== 'done') return { started: false, reason: NOTHING_TO_RELOAD };
    const run = this.runs.get(source.id);
    const { query, cap } = source;
    const explorer = this.rootStore.explorerStore;
    return runQueryLoad(this, {
      query,
      cap,
      ...(source.exampleId ? { exampleId: source.exampleId } : {}),
      origin,
      plan: (signal) => explorer.planQuery(query, cap, signal),
      labels: run?.labels ?? {},
      ledger: run?.ledger ?? source.provenance?.ledger ?? [],
      ledgerBase: run?.ledgerBase ?? null,
    });
  }

  /** "Try again": rerun the last job's request when it ended `failed` or `cancelledEarly` (§4.3). */
  async retry(): Promise<StartResult> {
    if (this.isLoading) return { started: false, reason: LOAD_RUNNING };
    const job = this.job;
    const reason = job?.outcome?.emptyReason;
    if (!job?.request || (reason !== 'failed' && reason !== 'cancelledEarly')) {
      return { started: false, reason: NOTHING_TO_RETRY };
    }
    // The job holds an observable copy: rerun with plain data and the original planner.
    const { plan } = job.request;
    return runQueryLoad(this, { ...toJS(job.request), plan });
  }

  /**
   * Load a GBIF download zip into the occurrence slot; commits on the first record. With
   * `opts.query` (a Cite-tab "Replace") the zip is cleaned like that query and the source
   * gets its provenance at the finish; without it the records load as they are.
   */
  async loadGbifZip(file: Blob, opts: ZipLoadOptions = {}): Promise<StartResult> {
    if (this.isLoading) return { started: false, reason: LOAD_RUNNING };
    return runZipLoad(this, file, opts);
  }

  /**
   * Add citations of the *same* data to a loaded occurrence source: a derived-dataset DOI,
   * or a GBIF download key and DOI. Returns false when `id` is not the loaded query or zip
   * source, or the source is still loading. A zip without a query keeps the key and DOI
   * in its `download` summary (it has no derived-dataset DOI).
   */
  patchOccurrence(id: string, patch: OccurrencePatch): boolean {
    const source = this.occurrence;
    if (!source || source.id !== id || source.status !== 'done') return false;
    if (source.kind !== 'explorer-query' && source.kind !== 'gbif-zip') return false;
    if (source.provenance) {
      this.replaceSource(id, { provenance: { ...source.provenance, ...patch } });
      return true;
    }
    if (source.kind !== 'gbif-zip' || !source.download || 'derivedDoi' in patch) return false;
    const download = { ...source.download };
    if ('gbifDownloadKey' in patch) download.key = patch.gbifDownloadKey;
    if ('gbifDownloadDoi' in patch) download.doi = patch.gbifDownloadDoi;
    this.replaceSource(id, { download } as Partial<ZipOccurrences>);
    return true;
  }

  /**
   * Stop the running load: keep what arrived or discard it. `discard` before the commit
   * only aborts (I6); after it, the committed source is removed once the load has ended.
   * Kept records run Infomap only when at least half the planned species arrived (else
   * `provenance.bioregionsSkipped`). A `continue` job keeps; a file load stops reading.
   */
  cancel(mode: 'keep' | 'discard'): void {
    const job = this.job;
    if (!job || (job.state !== 'planning' && job.state !== 'streaming')) return;
    if (job.kind === 'file' || job.kind === 'example') {
      this.rootStore.speciesStore.cancelLoad();
      return;
    }
    const active = this.active;
    if (!active || active.job !== job) return;
    active.cancelMode = job.kind === 'continue' ? 'keep' : mode;
    // SpeciesStore.loadRecords reads the reason: 'discard' skips binning and Infomap.
    active.controller.abort(active.cancelMode);
    runInAction(() => {
      job.paused = false;
      if (job.state === 'planning') {
        job.state = 'cancelled';
        job.outcome = { emptyReason: 'cancelledEarly', previousKept: job.targetId != null };
      }
    });
    // Release a paused load after the abort, so the held batch is dropped, not counted.
    active.gate.open();
  }

  /**
   * Hold the running stream load (e.g. while the cancel menu is open): no further batch is
   * counted or reaches SpeciesStore, so `job.funnel` and `job.speciesLoaded` are exactly
   * what `cancel('keep')` keeps. `resume()` continues.
   */
  pause(): void {
    const active = this.active;
    const job = this.job;
    if (!active || !job || active.job !== job || job.state !== 'streaming' || active.gate.paused) return;
    active.gate.close();
    active.flush();
    runInAction(() => {
      job.paused = true;
      job.etaSeconds = null;
    });
  }

  /** Continue a load held by `pause()`. */
  resume(): void {
    const active = this.active;
    if (!active?.gate.paused) return;
    runInAction(() => {
      active.job.paused = false;
    });
    active.gate.open();
  }

  /** Run Infomap on a stopped load that skipped it (`provenance.bioregionsSkipped`). */
  async runBioregionsAnyway(): Promise<void> {
    const source = this.occurrence;
    if (this.isLoading || !source || (source.kind !== 'explorer-query' && source.kind !== 'gbif-zip')) return;
    const provenance = source.provenance;
    if (!provenance?.bioregionsSkipped) return;
    const { bioregionsSkipped: _, ...rest } = provenance;
    this.replaceSource(source.id, { provenance: rest });
    await this.rootStore.speciesStore.runBioregions();
  }

  // --- tree loads -------------------------------------------------------------------

  /**
   * Load a tree into the tree slot (validated first; an invalid tree sets `treeJob.error`
   * and changes nothing). Then sets "include tree" and, with `rerun` (default) and
   * occurrences loaded and no occurrence load running, reruns Infomap.
   */
  async loadTree(input: TreeLoadInput, opts: TreeLoadOptions = {}): Promise<StartResult> {
    const label = input.kind === 'file' ? input.file.name : input.label;
    runInAction(() => {
      this.treeJob = { state: 'loading', label };
    });
    try {
      const text =
        input.kind === 'file' ? await input.file.text() : input.kind === 'example' ? await loadText(input.url) : input.newick;
      const base = { role: 'tree' as const, label, status: 'done' as const, completedAt: nowIso() };
      if (input.kind === 'file') {
        this.commitTree(text, { ...base, kind: 'file', file: fileInfo(input.file) } satisfies Omit<FileTreeSource, 'id' | 'tips' | 'retrievedAt'>);
      } else if (input.kind === 'example') {
        this.commitTree(text, {
          ...base,
          kind: 'example',
          exampleId: input.exampleId,
          ...(input.citation ? { citation: input.citation } : {}),
        } satisfies Omit<ExampleTreeSource, 'id' | 'tips' | 'retrievedAt'>);
      } else {
        const { newick: _newick, kind, ...rest } = input;
        this.commitTree(text, { ...base, ...rest, kind } satisfies Omit<OpenTreeSource, 'id' | 'tips' | 'retrievedAt'>);
      }
    } catch (error) {
      runInAction(() => {
        this.treeJob = { state: 'error', label, error: errorText(error) };
      });
      return { started: true, committed: false };
    }
    runInAction(() => {
      this.treeJob = null;
    });
    const { infomapStore, speciesStore } = this.rootStore;
    infomapStore.setIncludeTree(opts.includeTree ?? true);
    if (opts.rerun !== false) {
      // During an occurrence load, rerun once it ends unless its postLoad used the new tree.
      if (this.isLoading) this.rerunAfterLoad();
      else if (speciesStore.loaded) await this.rerunInfomap();
    }
    return { started: true, committed: true };
  }

  /**
   * Run Infomap on the loaded data and show the bioregions. DataStore owns this run: a
   * later rerun, an occurrence commit, remove or clear aborts it, and a superseded run
   * renders nothing.
   */
  private async rerunInfomap() {
    const { infomapStore, mapStore, speciesStore } = this.rootStore;
    const gen = ++this.rerunGen;
    await infomapStore.run();
    if (gen !== this.rerunGen || !speciesStore.loaded) return;
    mapStore.setRenderType('bioregions');
    mapStore.render();
  }

  /** Abort an Infomap run on the data that is being replaced or removed. */
  private stopInfomap() {
    this.rerunGen++;
    void this.rootStore.infomapStore.abort();
  }

  /**
   * Note a tree committed while an occurrence load runs. The load's Infomap uses it only
   * when the network is built after the commit: not when Infomap already ran or runs on
   * the committed data, and not when the load commits nothing.
   */
  private rerunAfterLoad() {
    const treeId = this.tree?.id;
    if (!treeId) return;
    const { infomapStore } = this.rootStore;
    const job = this.job;
    const running = job != null && (job.state === 'planning' || job.state === 'streaming' || job.state === 'finishing');
    const built = running && job.committed && (infomapStore.isRunning || infomapStore.tree != null);
    const first = this.treeDuringLoad == null;
    this.treeDuringLoad = { treeId, built, minJob: running ? jobNumber(job) : this.nextJobId };
    if (first) void this.settleTreeDuringLoad();
  }

  private async settleTreeDuringLoad() {
    // A handOff starts the job right after the guard is released: check again after it.
    while (this.isLoading) await when(() => !this.isLoading);
    const pending = this.treeDuringLoad;
    this.treeDuringLoad = null;
    const source = this.occurrence;
    if (!pending || this.tree?.id !== pending.treeId || !source || !this.rootStore.speciesStore.loaded) return;
    if ('provenance' in source && source.provenance?.bioregionsSkipped) return;
    const job = this.job;
    const used = job?.committed === true && jobNumber(job) >= pending.minJob && !pending.built;
    if (!used) await this.rerunInfomap();
  }

  // --- examples and the documentation demo ---------------------------------------------

  /**
   * Load a catalog example (§5.3). A `files` entry applies its binner settings, loads its
   * tree (if any) without a rerun and with `includeTree` from its settings, then its
   * occurrences, whose `postLoad` runs Infomap once. An example without a tree keeps a
   * leftover tree (§9.2). A `query` entry delegates to `explorerStore.loadExampleQuery`
   * (restore, Search tab, the Load gate, then load).
   */
  async loadExample(entry: ExampleEntry, origin: JobOrigin = 'examples'): Promise<StartResult> {
    if (this.isLoading) return { started: false, reason: LOAD_RUNNING };
    if (entry.kind === 'query') return this.rootStore.explorerStore.loadExampleQuery(entry);
    if (!entry.files) return { started: false, reason: `The example "${entry.title}" has no files` };
    // The tree phase runs before the job: hold the guard so no other load mixes in (I8, I9).
    const guard = this.reserve();
    if (!guard) return { started: false, reason: LOAD_RUNNING };
    try {
      return await this.loadExampleFiles(entry, entry.files, origin, guard.handOff);
    } finally {
      guard.release();
    }
  }

  private async loadExampleFiles(
    entry: ExampleEntry,
    files: NonNullable<ExampleEntry['files']>,
    origin: JobOrigin,
    handOff: <T>(start: () => T) => T,
  ): Promise<StartResult> {
    const { speciesStore } = this.rootStore;
    const { species, tree, settings } = files;
    if (settings.minCellSize != null) speciesStore.binner.setMinCellSizeLog2(settings.minCellSize);
    if (settings.maxCellSize != null) speciesStore.binner.setMaxCellSizeLog2(settings.maxCellSize);
    if (settings.minCellCapacity != null) speciesStore.binner.setMinCellCapacity(settings.minCellCapacity);
    if (settings.maxCellCapacity != null) speciesStore.binner.setMaxCellCapacity(settings.maxCellCapacity);

    let treeCommitted = false;
    if (tree) {
      const result = await this.loadTree(
        {
          kind: 'example',
          url: tree,
          exampleId: entry.id,
          label: entry.title,
          ...(entry.tree.citation ? { citation: entry.tree.citation } : {}),
        },
        { rerun: false, includeTree: settings.includeTree ?? true },
      );
      treeCommitted = result.started && result.committed;
    }
    const ext = extension(species).toLowerCase();
    const input: OccurrenceFileInput =
      ext === 'zip'
        ? { format: 'shapefile', files: species }
        : {
            format: ext === 'tsv' ? 'tsv' : 'csv',
            file: species,
            columns: { name: 'species', lat: 'latitude', long: 'longitude' },
          };
    // The placeholder is not frozen: methods.ts adds it for an example with no citation (§9.3).
    const citation = entry.citation && entry.citation !== EXAMPLE_CITATION_PLACEHOLDER ? entry.citation : undefined;
    const result = await handOff(() =>
      this.runFileLoad(input, 'example', origin, entry.title, {
        role: 'occurrences',
        kind: 'example',
        label: entry.title,
        exportName: getName(species) || entry.title,
        exampleId: entry.id,
        ...(citation ? { citation } : {}),
      }),
    );
    return this.rerunIfOnlyTreeCommitted(treeCommitted, result);
  }

  /**
   * Load what the Upload tab classified (§5.2): the tree first without a rerun, then the
   * occurrences, whose `postLoad` runs Infomap once. A tree alone reruns Infomap when
   * occurrences are loaded. `files` are the files `plan` indexes; `columns` is required
   * for CSV/TSV points. A plan with errors, or an invalid tree, loads nothing more.
   */
  async loadUpload(
    files: File[],
    plan: UploadPlan,
    columns?: { name: string; lat: string; long: string },
  ): Promise<StartResult> {
    if (this.isLoading) return { started: false, reason: LOAD_RUNNING };
    if (plan.errors.length > 0) return { started: false, reason: plan.errors[0] };
    const occ = plan.occurrences;
    if (!occ && !plan.tree) return { started: false, reason: 'No files' };
    if (occ?.kind === 'points' && !columns) return { started: false, reason: NO_COLUMNS };
    const fileAt = (i: number) => {
      const file = files[i];
      if (!file) throw new Error(`Upload plan refers to a missing file (${i})`);
      return file;
    };

    // The tree phase runs before the job: hold the guard so no other load mixes in (I8, I9).
    const guard = this.reserve();
    if (!guard) return { started: false, reason: LOAD_RUNNING };
    try {
      return await this.loadUploadPlan(plan, occ, fileAt, columns, guard);
    } finally {
      guard.release();
    }
  }

  private async loadUploadPlan(
    plan: UploadPlan,
    occ: UploadPlan['occurrences'],
    fileAt: (i: number) => File,
    columns: { name: string; lat: string; long: string } | undefined,
    guard: NonNullable<ReturnType<DataStore['reserve']>>,
  ): Promise<StartResult> {
    let treeCommitted = false;
    if (plan.tree?.kind === 'tree') {
      if (!occ) guard.release(); // A tree alone reruns Infomap itself, as no load runs.
      const result = await this.loadTree({ kind: 'file', file: fileAt(plan.tree.file) }, { rerun: !occ });
      treeCommitted = result.started && result.committed;
      if (!treeCommitted || !occ) return result;
    }
    if (!occ) return { started: false, reason: 'No files' };

    let result: StartResult;
    const { handOff } = guard;
    switch (occ.kind) {
      case 'points': {
        if (!columns) return { started: false, reason: NO_COLUMNS };
        const file = fileAt(occ.file);
        result = await handOff(() => this.loadOccurrenceFile({ format: occ.format, file, columns }));
        break;
      }
      case 'shapefile': {
        const files = occ.files.map(fileAt);
        result = await handOff(() => this.loadOccurrenceFile({ format: 'shapefile', files }));
        break;
      }
      case 'shapefile-zip': {
        const file = fileAt(occ.file);
        result = await handOff(() => this.loadOccurrenceFile({ format: 'shapefile', files: file }));
        break;
      }
      case 'gbif-zip': {
        const file = fileAt(occ.file);
        result = await handOff(() => this.loadGbifZip(file));
        break;
      }
      default:
        return { started: false, reason: 'Unsupported occurrence input' };
    }
    return this.rerunIfOnlyTreeCommitted(treeCommitted, result);
  }

  /**
   * After a tree committed with `rerun: false`, the occurrence load's `postLoad` runs
   * Infomap. When that load committed nothing, the kept occurrences still need a rerun
   * with the new tree.
   */
  async rerunIfOnlyTreeCommitted(treeCommitted: boolean, result: StartResult): Promise<StartResult> {
    const committed = result.started && result.committed;
    if (treeCommitted && !committed && this.rootStore.speciesStore.loaded && !this.isLoading) {
      await this.rerunInfomap();
    }
    return result;
  }

  /** The documentation demo: inline CSV (and Newick) as `docs-demo` example sources. */
  async loadInline({ label, csv, newick }: InlineData): Promise<StartResult> {
    if (this.isLoading) return { started: false, reason: LOAD_RUNNING };
    if (newick) {
      try {
        this.commitTree(newick, { role: 'tree', kind: 'example', exampleId: 'docs-demo', label, status: 'done', completedAt: nowIso() });
      } catch (error) {
        runInAction(() => {
          this.treeJob = { state: 'error', label, error: errorText(error) };
        });
      }
    }
    const { speciesStore } = this.rootStore;
    const job = this.startJob('example', 'examples', label);
    let id: string | null = null;
    try {
      await speciesStore.loadString(csv, {
        onFirstRecord: () => {
          id = this.mintSourceId();
          this.commitOccurrence({
            id,
            role: 'occurrences',
            kind: 'example',
            exampleId: 'docs-demo',
            label,
            exportName: label,
            status: 'loading',
            retrievedAt: nowIso(),
            completedAt: null,
          });
        },
      });
      runInAction(() => {
        job.state = 'done';
      });
    } catch (error) {
      runInAction(() => {
        job.state = 'error';
        job.error = errorText(error);
      });
    }
    if (id) this.replaceSource(id, { status: 'done', completedAt: nowIso() });
    return { started: true, committed: job.committed };
  }

  // --- remove and clear -----------------------------------------------------------------

  /** Clear the occurrences, Infomap results and the occurrence slot together; the tree stays. */
  removeOccurrences(): boolean {
    if (this.isLoading) return false;
    const { speciesStore, infomapStore } = this.rootStore;
    this.stopInfomap();
    runInAction(() => {
      speciesStore.clearData();
      infomapStore.clearData();
      this.setSlot('occurrences', null);
    });
    return true;
  }

  /** Remove the tree and empty its slot; rerun Infomap when occurrences are loaded. */
  async removeTree(): Promise<boolean> {
    if (this.isLoading) return false;
    const { treeStore, speciesStore } = this.rootStore;
    runInAction(() => {
      treeStore.reset();
      this.setSlot('tree', null);
      this.treeJob = null;
    });
    if (speciesStore.loaded) await this.rerunInfomap();
    return true;
  }

  /** Empty both slots (replaces `RootStore.clearData`). */
  clear(): boolean {
    if (this.isLoading) return false;
    const { speciesStore, infomapStore, treeStore } = this.rootStore;
    this.stopInfomap();
    runInAction(() => {
      infomapStore.clearData();
      speciesStore.clearData();
      treeStore.reset();
      this.sources = [];
      this.runs.clear();
      this.treeJob = null;
    });
    return true;
  }
}
