// Types of the data owner (`DataStore`): the loaded sources in their two slots, the
// load jobs, and the load inputs. See docs/superpowers/specs/2026-10-31-data-sources-and-portal.md §2.1.
import type { OccurrenceQuery, SourceId, StreamCursor, StreamPlan } from '../../sources/types';
import type { GbifZipFormat } from '../../sources/gbif/zip';
import type { EmptyReason, LedgerRow, LoadJob, TreeCandidate, TreeSelection } from '../explorer/types';
import type { LoadProvenance } from '../explorer/provenance';
import type { LoadTally, TallyLabels } from '../explorer/job';

export type SlotRole = 'occurrences' | 'tree';

interface SourceBase {
  /** 'src-1', 'src-2'…; Continue keeps it, every other load mints a new one. */
  id: string;
  role: SlotRole;
  /** Card title. */
  label: string;
  /** 'loading' from commit to finish; Continue does not change it. */
  status: 'loading' | 'done';
  /** ISO time of the commit. */
  retrievedAt: string;
  /** ISO time of the finish (and of the last Continue). */
  completedAt: string | null;
}

// --- occurrences ---------------------------------------------------------------
// Counts are NOT stored: cards and methods read records/species/polygons live from
// SpeciesStore, which holds exactly this slot's data (I2).
interface OccurrenceBase extends SourceBase {
  role: 'occurrences';
  /** SpeciesStore.name: file stem or queryTitle(query). */
  exportName: string;
}

export interface FileOccurrences extends OccurrenceBase {
  kind: 'file';
  format: 'csv' | 'tsv' | 'shapefile';
  files: { name: string; size: number }[];
  /** CSV/TSV mapping used. */
  columns?: { name: string; lat: string; long: string };
}

export interface ExampleOccurrences extends OccurrenceBase {
  kind: 'example';
  exampleId: string;
  /** The example's citation, frozen at load; none gives the §9.3 placeholder. */
  citation?: string;
}

export interface QueryOccurrences extends OccurrenceBase {
  kind: 'explorer-query';
  /** Frozen at load start (needed while provenance is null). */
  query: OccurrenceQuery;
  cap: number;
  /** Started from an Examples card. */
  exampleId?: string;
  /** Null until finish (§2.3). */
  provenance: LoadProvenance | null;
  /** provenance.stop != null && a ResumeState exists (§4.1). */
  resumable: boolean;
}

export interface ZipOccurrences extends OccurrenceBase {
  kind: 'gbif-zip';
  file: { name: string; size: number };
  /** Null until finish. */
  download: {
    key?: string;
    doi?: string;
    citation?: string;
    format: GbifZipFormat;
    rows: number;
    absent: number;
  } | null;
  /** Only for a Cite-tab "Replace" against the loaded query, set at finish. */
  provenance: LoadProvenance | null;
}

export type OccurrenceSource = FileOccurrences | ExampleOccurrences | QueryOccurrences | ZipOccurrences;

// --- tree ------------------------------------------------------------------------
interface TreeBase extends SourceBase {
  role: 'tree';
  tips: number;
}

export interface OpenTreeSource extends TreeBase {
  kind: 'opentree';
  candidate: Pick<
    TreeCandidate,
    'id' | 'kind' | 'title' | 'citation' | 'year' | 'synthVersion' | 'doi' | 'studyId' | 'treeId'
  >;
  /** Topology only; Grafen branch lengths (was PhyloStore.loadedGrafen). */
  grafen: boolean;
  /** Kept / absent / pruned / broken at load time. */
  selection: TreeSelection;
  /** PhyloStore.speciesSource at load time. */
  matchedFrom: 'loaded' | 'query';
  /** treeCitationText(...) frozen at load. */
  citation: string;
}

export interface FileTreeSource extends TreeBase {
  kind: 'file';
  file: { name: string; size: number };
}

export interface ExampleTreeSource extends TreeBase {
  kind: 'example';
  exampleId: string;
  citation?: string;
}

export type TreeSource = OpenTreeSource | FileTreeSource | ExampleTreeSource;
export type LoadedSource = OccurrenceSource | TreeSource;

// --- stop and resume (§4) --------------------------------------------------------------
export type StopReason = 'cancelled' | 'errors' | 'cap';

export interface StopState {
  reason: StopReason;
  /** First progress.lastError, else shortError(thrown). */
  lastError?: string;
  /** Σ progress.failedParts of the last run. */
  failedParts: number;
  /** A source reported progress.stoppedEarly === 'errors'. */
  stoppedEarly: boolean;
  /** Sources that failed or hit the cap. */
  sources: SourceId[];
  /** Σ progress.requestsTotal and Σ progress.requestsDone of the last run, for the copy (§4.4). */
  requests?: number;
  requestsDone?: number;
  /** Records the plans estimated for `sources` (all plans when none), uncapped, for the cap copy. */
  estimate?: number;
}

/** Per QueryOccurrences id, in a non-observable Map. */
export interface ResumeState {
  /** The exact plans of the first run (a cursor is only valid for its plan). */
  plans: StreamPlan[];
  /** Last cursor whose records reached SpeciesStore. */
  cursors: Partial<Record<SourceId, StreamCursor>>;
  /** Last progress.fetched per source (cumulative over all runs), for the Continue cap. */
  fetched: Partial<Record<SourceId, number>>;
  /** kpis, datasetCounts and stats keep accumulating. */
  tally: LoadTally;
  /** Unfrozen, for rebuilding rows. */
  labels: TallyLabels;
  ledger: LedgerRow[];
  ledgerBase: number | null;
}

// --- loads in progress ---------------------------------------------------------------
export type JobOrigin = 'search' | 'upload' | 'examples' | 'phylogeny' | 'sidebar';

/**
 * The state of an occurrence load. `LoadJob` (explorer/types.ts) plus 'finishing'
 * (records are in, the load is binning and running Infomap). Pausing is the `paused`
 * flag on a 'streaming' job, not a state.
 */
export type DataLoadState = LoadJob['state'] | 'finishing';

export interface DataLoadJob extends Omit<LoadJob, 'state'> {
  state: DataLoadState;
  id: string;
  kind: 'query' | 'continue' | 'zip' | 'file' | 'example';
  /** The tab [Open] returns to (§5.5). */
  origin: JobOrigin;
  /** Source being replaced (null: empty slot) or continued. */
  targetId: string | null;
  /** The slot already holds this load's source. */
  committed: boolean;
  /** For retry() (§4.3). */
  request?: QueryLoadRequest;
  /** Job-local until finish. */
  run?: { cursors: Partial<Record<SourceId, StreamCursor>>; tally: LoadTally };
  /** Ended without committing. */
  outcome?: { emptyReason: EmptyReason; previousKept: boolean; stop?: StopState };
}

export interface TreeJob {
  state: 'loading' | 'error';
  label: string;
  error?: string;
}

// --- inputs ----------------------------------------------------------------------
export type OccurrenceFileInput =
  | { format: 'csv' | 'tsv'; file: File | string; columns: { name: string; lat: string; long: string } }
  | { format: 'shapefile'; files: File | File[] | string; nameKey?: string };

export type TreeLoadInput =
  | { kind: 'file'; file: File }
  | { kind: 'example'; url: string; exampleId: string; label: string; citation?: string }
  | ({ kind: 'opentree'; newick: string } & Pick<
      OpenTreeSource,
      'candidate' | 'grafen' | 'selection' | 'matchedFrom' | 'citation' | 'label'
    >);

/** Both default to true. */
export interface TreeLoadOptions {
  includeTree?: boolean;
  rerun?: boolean;
}

export interface QueryLoadRequest {
  query: OccurrenceQuery;
  cap: number;
  exampleId?: string;
  origin: JobOrigin;
  /** ExplorerStore.planQuery(query, cap, signal). */
  plan: (signal: AbortSignal) => Promise<StreamPlan[]>;
  labels: TallyLabels;
  ledger: LedgerRow[];
  ledgerBase: number | null;
}

export type StartResult = { started: true; committed: boolean } | { started: false; reason: string };
