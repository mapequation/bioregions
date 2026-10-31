// The one owner of loaded data (spec docs/superpowers/specs/2026-10-31-data-sources-and-portal.md).
// It holds an occurrence slot and a tree slot, and every load and clear of SpeciesStore
// and TreeStore goes through it: a load replaces only its own slot, and only when it
// commits (the first feature, or a validated tree).
import { action, computed, makeObservable, observable, runInAction } from 'mobx';
import type RootStore from './RootStore';
import { RecordCleaner } from '../sources/clean';
import { extension, getName } from '../utils/filename';
import { loadText } from '../utils/loader';
import { citations, methodsText, type CitationItem } from './data/methods';
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
  StartResult,
  TreeJob,
  TreeLoadInput,
  TreeLoadOptions,
  TreeSource,
} from './data/types';

export const LOAD_RUNNING = 'A load is running';

/** Binner and network settings an example applies before it loads. */
export interface ExampleSettings {
  minCellSize?: number;
  maxCellSize?: number;
  minCellCapacity?: number;
  maxCellCapacity?: number;
  includeTree?: boolean;
}

/**
 * A bundled example with its files.
 * TODO(S6): replaced by the catalog's `ExampleEntry` (src/store/data/catalog.ts).
 */
export interface ExampleFiles {
  id: string;
  name: string;
  speciesFile: string;
  treeFile?: string;
  citation?: string;
  treeCitation?: string;
  settings: ExampleSettings;
}

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
  private nextSourceId = 1;
  private nextJobId = 1;

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;
    makeObservable<DataStore, 'setSlot'>(this, {
      sources: observable.ref,
      job: observable,
      treeJob: observable,
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
    const state = this.job?.state;
    return state === 'planning' || state === 'streaming' || state === 'finishing';
  }

  get methodsText(): string {
    const { speciesStore } = this.rootStore;
    return methodsText(this.sources, {
      records: speciesStore.numRecords,
      species: speciesStore.numSpecies,
      polygons: speciesStore.numPolygonsDebounced,
    });
  }

  get citations(): CitationItem[] {
    return citations(this.sources);
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

  private mintSourceId() {
    return `src-${this.nextSourceId++}`;
  }

  /** Put `source` in its role's slot (or empty `role`'s slot), keeping occurrences first. */
  private setSlot(role: LoadedSource['role'], source: LoadedSource | null) {
    const others = this.sources.filter((s) => s.role !== role);
    const next = source ? [...others, source] : others;
    this.sources = next.sort((a, b) => (a.role === b.role ? 0 : a.role === 'occurrences' ? -1 : 1));
  }

  private replaceSource(id: string, patch: Partial<LoadedSource>) {
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
    speciesStore.clearData();
    infomapStore.clearData();
    // TODO(S2a): SpeciesStore.name becomes a computed over `occurrence.exportName`.
    speciesStore.name = source.exportName;
    this.setSlot('occurrences', source);
    if (this.job) this.job.committed = true;
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

  private startJob(kind: DataLoadJob['kind'], origin: JobOrigin, label: string): DataLoadJob {
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
    };
    runInAction(() => {
      this.job = job;
    });
    // The observable copy, so later writes notify observers.
    return this.job as DataLoadJob;
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
    // During an occurrence load, its postLoad runs Infomap with the new tree.
    if (opts.rerun !== false && speciesStore.loaded && !this.isLoading) {
      await this.rerunInfomap();
    }
    return { started: true, committed: true };
  }

  private async rerunInfomap() {
    const { infomapStore, mapStore } = this.rootStore;
    await infomapStore.run();
    mapStore.setRenderType('bioregions');
    mapStore.render();
  }

  // --- examples and the documentation demo ---------------------------------------------

  /**
   * Load a bundled example: its binner settings, its tree (if any) without a rerun, then
   * its occurrences, whose `postLoad` runs Infomap once.
   * TODO(S6): the catalog entry, the `query` kind and `includeTree` handling.
   */
  async loadExample(example: ExampleFiles, origin: JobOrigin = 'examples'): Promise<StartResult> {
    if (this.isLoading) return { started: false, reason: LOAD_RUNNING };
    const { speciesStore, infomapStore } = this.rootStore;
    const { settings } = example;
    if (settings.minCellSize != null) speciesStore.binner.setMinCellSizeLog2(settings.minCellSize);
    if (settings.maxCellSize != null) speciesStore.binner.setMaxCellSizeLog2(settings.maxCellSize);
    if (settings.minCellCapacity != null) speciesStore.binner.setMinCellCapacity(settings.minCellCapacity);
    if (settings.maxCellCapacity != null) speciesStore.binner.setMaxCellCapacity(settings.maxCellCapacity);
    if (settings.includeTree != null) infomapStore.setIncludeTree(settings.includeTree);

    if (example.treeFile) {
      await this.loadTree(
        {
          kind: 'example',
          url: example.treeFile,
          exampleId: example.id,
          label: example.name,
          ...(example.treeCitation ? { citation: example.treeCitation } : {}),
        },
        { rerun: false, includeTree: settings.includeTree ?? true },
      );
    }
    const isShapefile = extension(example.speciesFile).toLowerCase() === 'zip';
    const input: OccurrenceFileInput = isShapefile
      ? { format: 'shapefile', files: example.speciesFile }
      : {
          format: extension(example.speciesFile).toLowerCase() === 'tsv' ? 'tsv' : 'csv',
          file: example.speciesFile,
          columns: { name: 'species', lat: 'latitude', long: 'longitude' },
        };
    return this.runFileLoad(input, 'example', origin, example.name, {
      role: 'occurrences',
      kind: 'example',
      label: example.name,
      exportName: getName(example.speciesFile) || example.name,
      exampleId: example.id,
      ...(example.citation ? { citation: example.citation } : {}),
    });
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
    runInAction(() => {
      infomapStore.clearData();
      speciesStore.clearData();
      treeStore.reset();
      this.sources = [];
      this.treeJob = null;
    });
    return true;
  }
}
