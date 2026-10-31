# Data sources and the Data portal (PR #110 review fixes)

Status: implementation spec, 2026-10-31, branch `feat/gbif-explorer` (@ 33eb696). It implements the
owner's decisions on the PR #110 review. Line anchors were checked against 33eb696. The stream
contract it consumes is on `feat/explorer-streams` (1401f82, `src/sources/**` only, so no anchor
outside `src/sources` moves when it merges).

## 0. Scope and superseded sections

**In scope:** one owner for loaded data; the Data portal (the explorer dialog grown into it); Continue loading and Load again; Close only (no minimize); the bugs in the sidebar "Load data…" path; tooltips for the Cap field and the Load button; the empty-map overlay; accessibility of the new UI.

**Not in this spec:**

- The preview-map draw and clear-area fixes. They landed on `feat/explorer-map-ui` (a7f3db9) and own `src/components/Explorer/preview/mapView.ts`, `preview/mapView.test.ts`, `preview/PreviewMap.tsx` and `query/AreaPicker.tsx`. No step here owns those files, with one exception: U1 renames `lastLoad` → `loaded` at PreviewMap.tsx:480-484, after `feat/explorer-map-ui` has been merged (§7, wave 3 precondition).
- The sources-layer stream contract (`src/sources/**`), consumed as implemented (§4.1).
- Dependency upgrades.

This spec **supersedes** these sections of the older specs:

| Old spec section | Replaced by |
|---|---|
| `2026-10-30-data-explorer-design.md`, "Integration with existing stores" (107-128): `loadRecords({name, clear})`, and "the explorer can call `rootStore.clearData()` to discard" | §2, §3 |
| `2026-10-30-data-explorer-ui.md` §2.B line 85 `[Minimize ▾]`; §6 "Esc while streaming" (365) | §5.7 |
| ui.md §2.E Entry points (124-136) | §5.5, §5.6 |
| ui.md §3 rows ExplorerDialog (145), `load/LoadDock.tsx` "Replace/Add" (177), `load/LoadProgress.tsx` "Minimize" (178) | §5.1, §5.8 |
| ui.md §4 store contract: `Provenance.mode` (231), `minimized` (245), `loadMode` (251), `lastLoad` (253), `setMinimized` (281) | §2 |
| ui.md §7 microcopy: Load button "Add 12,300 records to current data" (385), "Partial (methods)" (389) | §4.4, §5.8 |

### Review point → where it is addressed

| Review point | Where | Acceptance |
|---|---|---|
| No horizontal padding on "Explore GBIF & OBIS" | §5.6 (overlay redesign) | U7 driver: `scrollWidth <= clientWidth` for the overlay buttons, the sidebar `Data…` button and every card button |
| Draw area cut off / cannot zoom out | `feat/explorer-map-ui` a7f3db9 | The whole world is visible while drawing (its `mapView.test.ts`) |
| No easy way to cancel a selected area | `feat/explorer-map-ui` a7f3db9 | A visible "Clear area" control resets the area to the world (AreaPicker.tsx) |
| No hover info on Cap, Replace, Add | §5.8 (Replace/Add removed; Cap and Load tooltips; visible "Replaces …" line) | U2 |
| Minimize and close do the same thing | §5.7 | U1 |
| "Loaded 40,033 records (partial) · Edit the query to load again" is contradictory; wants retry/continue | §4 | S4, U2 |
| Add dataset replaces the provenance (Canis then Vulpes) | §1 (Add removed; one query holds several taxa), §5.8 hint | S2a, U2 |
| No tree item in the sidebar | §5.5 tree card | U5 |
| Load data / Load examples need a rethink (formats, tree badge, metadata) | §5.1-§5.3 | U3, U4 |
| GBIF card survives an example load | §1, §3 (impossible by construction) | S2a test 1 |

## 1. Decisions and invariants

Owner decisions (fixed; not reopened here):

- **D1, one owner.** A new store owns everything that is loaded. It has an occurrence slot and a tree slot, typed as a list of sources so that a real "Add" can return later. Every load path goes through it, and a load replaces only its own slot. "Add" mode is removed: several taxa, and GBIF + OBIS together, are combined inside one query, which also gives one GBIF download DOI.
- **D2, Data portal.** The explorer dialog becomes the Data portal, with the tabs **Search GBIF & OBIS** · **Phylogeny** (Open Tree, or upload a Newick tree) · **Upload** · **Examples** · **Cite**. The sidebar shows one "Data…" entry, plus one card per loaded source. Load logic lives in the new store, not in ExplorerStore.
- **D3, partial loads.** The stream is failure-tolerant. A partial load shows why it stopped. **Continue loading** resumes from the stream cursors into the *same* source. **Load again** reruns the whole load.
- **D4, Close only.** Close hides the portal, keeps the workspace, and lets a running load continue. There is one open flag. Plan and preview fetching stops while the portal is hidden (download polling and a running load continue, §5.7).

Invariants:

| # | Invariant |
|---|---|
| I1 | `dataStore.sources` holds at most one source per role (`'occurrences'`, `'tree'`). |
| I2 | `dataStore.occurrence != null` ⇔ SpeciesStore holds data or is receiving it for that source. The slot swap and SpeciesStore's clear happen in **one MobX action**, at the first accepted record or feature, for every kind of load (stream, zip and file). |
| I3 | `dataStore.tree != null` ⇔ `treeStore.tree != null`, changed in one action, after the Newick text has been validated. |
| I4 | Every card, citation, methods sentence, "loaded" scope in the explorer, and loaded-species note in Phylogeny is *derived* from `dataStore.sources`. No other store keeps provenance of loaded data. |
| I5 | Only `src/store/DataStore.ts` and `src/store/data/**` call SpeciesStore `load` / `loadString` / `loadShapefile` / `loadRecords` / `clearData` and TreeStore `loadString` / `clearData` / `reset`. |
| I6 | A load that commits nothing leaves both slots and both stores untouched. This covers an empty load, a file with no usable rows, a failure before the first record (including one where every request failed), and a discard before the first record. |
| I7 | Continue keeps the source's `id`, `query`, `retrievedAt`, label and status `'done'`. Only the provenance numbers, the stop state and `completedAt` change, at its finish. |
| I8 | Loading occurrences never touches the tree slot, and loading a tree never touches the occurrence slot. The one exception is an example or upload that ships a tree, which fills both slots (§3, path 5). |
| I9 | At most one occurrence load runs at a time. Every occurrence entry point returns `{ started: false, reason: 'A load is running' }` while `dataStore.isLoading`. |

How each invariant is enforced **by construction**:

| Mechanism | Detail |
|---|---|
| One entry point | Load and clear exist only as DataStore actions. SpeciesStore and TreeStore loaders stop clearing on their own: the `clear` parameters of `load`, `loadString` and `loadRecords` are removed, and DataStore clears by committing. |
| Atomic commit | `commitOccurrence(src)` runs `speciesStore.clearData()`, `infomapStore.clearData()` and the slot swap in one `runInAction`. It is passed as `onFirstRecord` to `loadRecords` (stream, zip) and to `load` / `loadShapefile` (files), which call it in the same action as the first feature, followed by `setIsLoading()` (this replaces the lazy `clearData(); setIsLoading()` pair at SpeciesStore.ts:490-497 and the eager clear at 369-371). `commitTree` validates the Newick first, then swaps the tree and the slot in one action. |
| Derived readers | These become computeds over DataStore: `ExplorerStore.loaded` (replaces the `lastLoad` field), the tree citation (replaces `PhyloStore.citationText` / `loadedTree` / `loadedGrafen`), `PhyloStore.cladeNote`'s taxa, and `SpeciesStore.name`. |
| Removed writers | Removed: the fields `ExplorerStore.lastLoad`, `loadMode`, `minimized` and `PhyloStore.loadedTree` / `loadedGrafen`; `RootStore.clearData()` (RootStore.ts:45-49); and `ExampleStore` (whole file). |
| Guard test | `src/store/data/ownership.test.ts` reads every `src/**/*.{ts,tsx}` file (tests excluded) and fails, naming file:line, on any match outside the allowlist (`src/store/DataStore.ts`, `src/store/data/**`, `SpeciesStore.ts`, `TreeStore.ts`). Patterns: `/(speciesStore\|treeStore)\??\.(load\|loadString\|loadShapefile\|loadRecords\|clearData\|reset)\(/`; `/\.(loadRecords\|loadShapefile)\(/` and `/(?<!this)\.clearData\(/` on **any** receiver except `this` (catches aliases such as `const species = rootStore.speciesStore`, ExplorerStore.ts:265-267); `/rootStore\.clearData\(/`; `/\.(lastLoad\|loadedTree)\s*=[^=]/` (not `===`). Comment lines (`//`, `*`) are skipped. Temporary allowlist lines carry a TODO naming the step that removes them. |
| Concurrency guard | `isLoading` = `job?.state` is `'planning' \| 'streaming' \| 'finishing'` (a paused job is `'streaming'` with `paused: true`; a stream load is `'finishing'` from the end of its stream until SpeciesStore's `postLoad` (binning, Infomap) returns, so no other load starts meanwhile). Checked first in every occurrence action (I9). The UI disables Load, Upload, Examples Load and the card actions with the tooltip "A load is running". `loadTree` during an occurrence load commits the tree but skips its Infomap rerun, since `postLoad` runs with the new tree. |

## 2. Data model

**Store:** `DataStore` in `src/store/DataStore.ts`, exposed as `rootStore.dataStore`, constructed in `RootStore` (RootStore.ts:29-42) right after `treeStore`. Helpers live in `src/store/data/`.

**Type name:** `LoadedSource` (the "DataSource union" of D1). `DataSource` is already the GBIF/OBIS adapter interface (src/sources/types.ts:200).

### 2.1 Types (`src/store/data/types.ts`)

```ts
export type SlotRole = 'occurrences' | 'tree';
interface SourceBase {
  id: string;        // 'src-1', 'src-2'…; Continue keeps it, every other load mints a new one
  role: SlotRole;
  label: string;     // card title
  status: 'loading' | 'done'; // 'loading' from commit to finish; Continue does not change it
  retrievedAt: string;        // ISO time of the commit
  completedAt: string | null; // ISO time of the finish (and of the last Continue)
}
// --- occurrences ---------------------------------------------------------------
// Counts are NOT stored: cards and methods read records/species/polygons live from
// SpeciesStore, which holds exactly this slot's data (I2).
interface OccurrenceBase extends SourceBase {
  role: 'occurrences';
  exportName: string;        // SpeciesStore.name: file stem or queryTitle(query)
}
export interface FileOccurrences extends OccurrenceBase {
  kind: 'file';
  format: 'csv' | 'tsv' | 'shapefile';
  files: { name: string; size: number }[];
  columns?: { name: string; lat: string; long: string }; // CSV/TSV mapping used
}
export interface ExampleOccurrences extends OccurrenceBase { kind: 'example'; exampleId: string; citation?: string } // citation frozen at load (methods stays pure); none → §9.3 placeholder
export interface QueryOccurrences extends OccurrenceBase {
  kind: 'explorer-query';
  query: OccurrenceQuery;           // frozen at load start (needed while provenance is null)
  cap: number;
  exampleId?: string;               // started from an Examples card
  provenance: LoadProvenance | null; // null until finish (§2.3)
  resumable: boolean;               // provenance.stop != null && a ResumeState exists (§4.1)
}
export interface ZipOccurrences extends OccurrenceBase {
  kind: 'gbif-zip';
  file: { name: string; size: number };
  download: { key?: string; doi?: string; citation?: string; format: GbifZipFormat; rows: number; absent: number } | null; // null until finish
  provenance: LoadProvenance | null; // only for a Cite-tab "Replace" against the loaded query, set at finish
}
export type OccurrenceSource = FileOccurrences | ExampleOccurrences | QueryOccurrences | ZipOccurrences;
// --- tree ------------------------------------------------------------------------
interface TreeBase extends SourceBase { role: 'tree'; tips: number }
export interface OpenTreeSource extends TreeBase {
  kind: 'opentree';
  candidate: Pick<TreeCandidate, 'id' | 'kind' | 'title' | 'citation' | 'year' | 'synthVersion' | 'doi' | 'studyId' | 'treeId'>;
  grafen: boolean;                 // topology only; Grafen branch lengths (was PhyloStore.loadedGrafen)
  selection: TreeSelection;        // kept / absent / pruned / broken at load time
  matchedFrom: 'loaded' | 'query'; // PhyloStore.speciesSource at load time
  citation: string;                // treeCitationText(...) frozen at load (was PhyloStore.citationText)
}
export interface FileTreeSource extends TreeBase { kind: 'file'; file: { name: string; size: number } }
export interface ExampleTreeSource extends TreeBase { kind: 'example'; exampleId: string; citation?: string }
export type TreeSource = OpenTreeSource | FileTreeSource | ExampleTreeSource;
export type LoadedSource = OccurrenceSource | TreeSource;
// --- stop and resume (§4) --------------------------------------------------------------
export type StopReason = 'cancelled' | 'errors' | 'cap';
export interface StopState {
  reason: StopReason;
  lastError?: string;      // first progress.lastError, else shortError(thrown)
  failedParts: number;     // Σ progress.failedParts of the last run
  stoppedEarly: boolean;   // a source reported progress.stoppedEarly === 'errors'
  sources: SourceId[];     // sources that failed or hit the cap
}
export interface ResumeState {    // per QueryOccurrences id, in a non-observable Map
  plans: StreamPlan[];      // the exact plans of the first run (a cursor is only valid for its plan)
  cursors: Partial<Record<SourceId, StreamCursor>>; // last cursor whose records reached SpeciesStore
  tally: LoadTally;         // kpis, datasetCounts and stats keep accumulating
  labels: TallyLabels; ledger: LedgerRow[]; ledgerBase: number | null; // unfrozen, for rebuilding rows
}
// --- loads in progress ---------------------------------------------------------------
export type JobOrigin = 'search' | 'upload' | 'examples' | 'phylogeny' | 'sidebar';
export type DataLoadState = LoadJob['state'] | 'finishing'; // pausing is LoadJob's `paused` flag, not a state
export interface DataLoadJob extends Omit<LoadJob, 'state'> { // LoadJob as in explorer/types.ts:212-237
  state: DataLoadState;
  id: string;
  kind: 'query' | 'continue' | 'zip' | 'file' | 'example';
  origin: JobOrigin;        // the tab [Open] returns to (§5.5)
  targetId: string | null;  // source being replaced (null: empty slot) or continued
  committed: boolean;       // the slot already holds this load's source
  request?: QueryLoadRequest; // for retry() (§4.3)
  run?: { cursors: Partial<Record<SourceId, StreamCursor>>; tally: LoadTally }; // job-local until finish
  outcome?: { emptyReason: EmptyReason; previousKept: boolean; stop?: StopState }; // ended without committing
}
export interface TreeJob { state: 'loading' | 'error'; label: string; error?: string }
// --- inputs ----------------------------------------------------------------------
export type OccurrenceFileInput =
  | { format: 'csv' | 'tsv'; file: File | string; columns: { name: string; lat: string; long: string } }
  | { format: 'shapefile'; files: File | File[] | string; nameKey?: string };
export type TreeLoadInput =
  | { kind: 'file'; file: File }
  | { kind: 'example'; url: string; exampleId: string; label: string; citation?: string }
  | ({ kind: 'opentree'; newick: string } & Pick<OpenTreeSource, 'candidate' | 'grafen' | 'selection' | 'matchedFrom' | 'citation' | 'label'>);
export interface TreeLoadOptions { includeTree?: boolean; rerun?: boolean } // defaults true, true
export interface QueryLoadRequest {
  query: OccurrenceQuery; cap: number; exampleId?: string; origin: JobOrigin;
  plan: (signal: AbortSignal) => Promise<StreamPlan[]>; // ExplorerStore.planQuery(query, cap, signal)
  labels: TallyLabels; ledger: LedgerRow[]; ledgerBase: number | null;
}
export type StartResult = { started: true; committed: boolean } | { started: false; reason: string };
```

`EmptyReason` (explorer/types.ts:239) gains `'failed'` (S4).

### 2.2 DataStore API

| Member | Kind | Behaviour |
|---|---|---|
| `sources: LoadedSource[]` | observable | Ordered: occurrences first, then tree. Satisfies I1. |
| `job: DataLoadJob \| null` | observable | The current occurrence load, or the last finished one. Kept until the next load, for DoneRow and EmptyPanel. |
| `treeJob: TreeJob \| null` | observable | The current tree load, or the last tree error. |
| `occurrence`, `tree`, `isLoading` | computed | The slot getters, and whether an occurrence load runs (I9). |
| `methodsText: string` | computed | Empty exactly when `sources` is empty (§2.4). A `'loading'` source gives "Loading {label}…". |
| `citations: CitationItem[]` | computed | `{ id, sourceId, kind: 'gbif'\|'gbif-download'\|'obis'\|'example'\|'opentree', text, doi? }`, each citation once. Empty for a `'loading'` source. |
| `treeOverlap` | computed | `{ tips, inTree, datasetSpecies } \| null`: species in `speciesStore.speciesMap` that are also in `treeStore.treeNodeMap`. |
| `loadQuery(req)` | action | Plans, then streams (§4). Commits on the first accepted record. Returns `StartResult`. |
| `continueLoad()` / `loadAgain()` / `retry()` | action | §4.2, §4.3. |
| `loadGbifZip(file, opts?: ZipLoadOptions)` | action | The moved `loadZip` (ExplorerStore.ts:2721-2855), in `data/zipLoad.ts`. `ZipLoadOptions` is `{ origin?, query?, download?: GbifZipSummary, ledger?, labels? }`: with `query` (a Cite-tab "Replace") the zip is cleaned like that query and the source gets its provenance at the finish; without it the records load as they are (`dedupe: 'none'`). Commits on the first record; `download` is filled from the reader's own summary at the finish (else from `opts.download`; null when stopped before the reader's summary). |
| `loadOccurrenceFile(input, origin)` | action | Creates a `file` job, calls `speciesStore.load` / `loadShapefile` with `onFirstRecord: commit`. Zero features → `job.state='error'`, `job.error = 'No usable rows (check the species column)'` (or the shapefile equivalent), slots untouched. A parse error before the first feature → `job.error`, slots untouched. An error after the commit keeps what arrived (status `'done'`, card warns). |
| `loadTree(input, opts?: TreeLoadOptions)` | action | Reads the text, `commitTree` (validate, `treeStore.loadString`, slot swap, one action). Then `infomapStore.setIncludeTree(opts.includeTree ?? true)` and, when `opts.rerun !== false`, occurrences are loaded and no occurrence load runs: `infomapStore.run()` and a re-render (moved from PhyloStore.ts:746-756). An invalid tree sets `treeJob.error` and changes nothing. |
| `loadExample(entry, origin)` | action | `files` kind: apply the binner settings (ExampleStore.ts:49-63), `loadTree(tree, { rerun: false, includeTree: entry.settings.includeTree ?? true })` if the example has a tree, then `loadOccurrenceFile`, whose `postLoad` runs Infomap once. `query` kind: delegates to `explorerStore.loadExampleQuery(entry)` (§5.3). |
| `loadUpload(plan, columns?)` | action | The output of `classifyFiles` (§5.2). Tree first with `{ rerun: false }`, then occurrences; with a tree alone, `rerun` defaults to true. |
| `loadInline({ label, csv, newick? })` | action | The documentation demo (DocumentationStore.ts:58-60). Creates `example` sources with `exampleId: 'docs-demo'`. |
| `cancel('keep' \| 'discard')`, `pause()`, `resume()` | action | Moved from ExplorerStore.ts:2466-2512. `discard` before commit only aborts (I6). `discard` after commit calls `removeOccurrences()`. A `continue` job offers `keep` only. For file loads, `cancel` calls `speciesStore.cancelLoad()` (both modes keep what arrived). |
| `runBioregionsAnyway()` | action | Moved from ExplorerStore.ts:2458-2464. |
| `patchOccurrence(id, p)` | action | `p` sets `derivedDoi`, `gbifDownloadKey` or `gbifDownloadDoi` only (citations of the *same* data). Replaces `setDerivedDoi` (2517-2521) and `applyZip('keepStreamCiteDoi')` (2704-2713). Returns false unless `id` is the loaded, finished query or zip source. A zip without a query patches `download.key`/`download.doi` and refuses `derivedDoi`. |
| `removeOccurrences()`, `removeTree()`, `clear()` | action | `removeOccurrences` clears SpeciesStore, Infomap results and the slot together; the tree stays. `removeTree` calls `treeStore.reset()` (below) and empties the slot, then reruns Infomap if occurrences are loaded. `clear` empties both (replaces `RootStore.clearData`). All refuse while `isLoading`. |

The source cards are **not** a DataStore member: `sourceCards(...)` in `src/components/ControlPanel/cards.ts` is pure and called by `SourceCards.tsx` (owned wholly by U5).

### 2.3 What moves, and what stays

| Store | Moves out (to) / changes | Stays |
|---|---|---|
| ExplorerStore | `load` (2161-2356), `finishLoad` (2362-2455), `emptyReasonOf` (259-262), `runBioregionsAnyway`, `pauseLoad`, `resumeLoad`, `releasePause` (2458-2495), `cancel` (2501-2512), `hasLoadedData` (265), `mergeProgress` (314), `loadedPoints` (896) → `data/streamLoad.ts` (S2a; as built, `hasLoadedData` and `loadedPoints` are deleted because nothing uses them once Add is gone, and `partialLoad`, `plannedSpecies`, `speciesCoverage`, `MIN_BIOREGION_COVERAGE`, `ledgerShare`, `shortError` and `EMPTY_MESSAGES` move there too). `loadZip` (2721-2855) → `data/zipLoad.ts` (S2b). `job` (1052) → `dataStore.job`. `lastLoad` (1054) → computed `loaded`. `setDerivedDoi` → `patchOccurrence`. **Deleted:** `loadMode`/`setLoadMode` (1050, 2138-2140); `editAndReload` (2904-2909), replaced by `resetToLoaded()`; `minimized`/`setMinimized` (1035, 1227-1229); `shownLoad` (2012-2014) with the `shownLoad()`/`keptLoad()` helpers (ExplorerStore.ts:320-330, not explorer/); the draft branch of `methodsText` (2023-2032). | Query editing, previews, plans, estimate, ledger, insights, the library, GBIF download/DOI requests and polling, zip verification (`importZip`, `zipImport`, `zipSummary`, `clearZip`), `isOpen`, `tab`. |
| ExplorerStore, new members | `get loaded(): LoadProvenance \| null`: the provenance of `dataStore.occurrence` when it is `status 'done'` and `explorer-query` (or `gbif-zip` with provenance); otherwise null, so during streaming it is null and every reader (LoadedPanel, DecisionLedger, PreviewMap, the mapScope reaction 1171, `loadedMatchesQuery` 1744) sees "nothing loaded". `planQuery(query, cap, signal)`: **side-effect free**. If `queryKey(query) === queryKey(this.query)`, `cap === this.cap` and `this.plans` is ready, it returns them; otherwise `planSource` per enabled source with a private `AbortController` linked to `signal`, then `applyMinRecords(query.quality.minRecordsPerSpecies)`. It never writes `plans`, `rawPlans` or `planController` (unlike `fetchPlans`, 2068-2101). `load(opts?: { exampleId?: string })` builds a `QueryLoadRequest` from the workspace (labels from `facetLabels` 2143, ledger 1690-1693), awaits `dataStore.loadQuery`, and calls `pushRecent` when it committed. `loadExampleQuery(entry)`: `restoreQuery(entry.query)`, `open('search')`, await the plans and estimate, then `load({ exampleId })` if `canLoad.ok`; otherwise the dock shows why (e.g. OverCapRow). `resetToLoaded()`: restores `loaded.query` (or the source's `query`) into the workspace. `applyZip` calls `dataStore.loadGbifZip` or `patchOccurrence`. | — |
| `LoadProvenance` / `Provenance` (explorer/provenance.ts:9-23, explorer/types.ts:273-296) | Becomes the finished payload of `QueryOccurrences` / `ZipOccurrences`, built at finish. **Dropped:** `mode`, `previous`, `previousKept`, `emptyReason` (→ `job.outcome`). **Added:** `cap`, `stop: StopState \| null`, `completedAt` (optional fields until every path sets them; S2a sets all three on stream loads, with `stop: null` until S4). `retrievedAt` = the source's commit time. | `query`, `funnel`, `ledger`, `kpis`, `accepted`, `partial`, `bioregionsSkipped`, `datasetCounts`, `stats`, `requests`, the DOIs, `fromZip` |
| SpeciesStore | `name` (86, observable at 108) becomes `get name() { return this.rootStore.dataStore?.occurrence?.exportName ?? 'data' }`; writes at 374, 495-497 removed (S2a). `clear` of `load` (362) and `loadString` (322) removed; `load(file, { nameColumn, longColumn, latColumn, onFirstRecord })`, `loadString(csv, opts)` and `loadShapefile(files, { nameKey, onFirstRecord })` take an options object and resolve `{ received }` (S1): a worker error or 0 features rejects (`NO_USABLE_ROWS` / `NO_SHAPEFILE_FEATURES`), a cancel before the first feature resolves `{ received: 0 }` and DataStore marks the job `'cancelled'` (`outcome.emptyReason: 'cancelledEarly'`). Until S2a, `commitOccurrence` writes the observable `name` from `exportName`. `clear`/`name` of `loadRecords` (460-545) removed; it gains `onFirstRecord` (S2a). **Discard fix (S2a):** when the reason is `'discard'` and `received === 0`, take the no-records path (`setIsLoaded(wasLoaded)`, `loadController = null`), because the old `clearData()` in the discard branch (518-525) was what reset `isLoading` (127-129) after `preLoad` (476) set it; after the commit, DataStore's `removeOccurrences` clears. | Features, the binner, counters, `postLoad`, `finishWithoutBioregions`, `runBioregions`, `cancelLoad` |
| TreeStore | `loadString` (307-312) **validates before any state change** (S1): the Newick reader (utils/tree/newick.ts:86-222) never throws, so `validateNewick(text)` (exported from TreeStore.ts; returns the prepared tree so `loadString` parses once) requires balanced parentheses, a terminating `;` or end of input after the root, and ≥ 2 leaves after `prepareTree`, else throws `Not a valid Newick tree: {why}`. New action `reset()`: `setTree(null)` (288-292, which also updates the network), clears `treeNodeMap` and stats, `isLoaded = false` (`clearData`, 234-238, only nulls `tree`/`treeString`). `load(file)` (314-320) is deleted; DataStore reads the text. | Everything else |
| PhyloStore | `loadedTree` (114), `loadedGrafen` (129), `citationText` (316-321) → `OpenTreeSource`. `loadSelected` (735-766) keeps `datasetTree`/`datasetNewick` and calls `dataStore.loadTree({ kind: 'opentree', … })` with `label` = the candidate title, `selection` from the built tree and `citation` = `treeCitationText(candidate, built.kept, grafen)`; a refused or uncommitted load sets `loadState: 'error'` with `treeJob.error`. `cladeNote` (221-226) reads taxa from `dataStore.occurrence.query` when its kind is `explorer-query` (from `explorerStore.query` while matching the query, as before); otherwise null. | Matching, candidates, selection, `loadState`/`error`, `tabActive` |
| ExampleStore | Deleted. Its list → `src/store/data/catalog.ts`; `loadExample` → `DataStore.loadExample`. | — |
| RootStore | `clearData()` deleted (→ `dataStore.clear()`), `exampleStore` removed | `clearBioregions()` |
| InfomapStore, harness | No change. `parameterName` (InfomapStore.ts:406-417) reads `speciesStore.name`, now a computed. `harness/stubRoot.ts` (34-35, 81-82) keeps a plain `name`. Acceptance: `pnpm build` (tsconfig.harness.json) and `harness/networks.test.ts`. | — |

### 2.4 Methods text and citations (`src/store/data/methods.ts`, pure)

Inputs: the sources, plus live counts `{ records, species, polygons }` from SpeciesStore.

| Slot and kind | Methods sentence | Citation item | Step |
|---|---|---|---|
| any, `status 'loading'` | "Loading {label}…" | none | S1 |
| `file` | "Occurrence data were loaded from the file {name} ({records} records of {species} species)." | None; the card says to cite the file's original source. | S1 |
| `example` | "Occurrence data: the Infomap Bioregions example "{title}" ({records} records of {species} species)." | `entry.citation`, if any | S1 |
| `opentree` tree | `citation` (frozen `treeCitationText`, phylo/candidates.ts:459-478) | The Open Tree synthesis or study citation | S1 |
| `file` / `example` tree | "Phylogeny: user-provided Newick tree {name} ({tips} tips)." or "Phylogeny: {citation \| example tree}." | The example's tree citation, if any | S1 |
| `explorer-query` | `buildMethodsText({ load: provenance, … })` (provenance.ts:160-196); `partialSentence` takes `stop` (§4.4). If `completedAt` is on a later date than `retrievedAt`: "retrieved between {d1} and {d2}" | GBIF (download DOI via `citingDownload`, provenance.ts:33-46), OBIS (`buildObisCitation`) | S2a (S4: stop/dates) |
| `gbif-zip` without a query | "Occurrence records were taken from GBIF download {key} ({SIMPLE_CSV\|DwC-A}; {rows} rows, {absent} absence records skipped; {records} records of {species} species kept)." Stopped before the reader's summary (`download: null`): "Occurrence records were taken from {label} (stopped before the end of the file; {records} records of {species} species kept)." | `download.citation`, else "GBIF.org GBIF Occurrence Download https://doi.org/{doi}" | S2b |

The draft methods text for an *unloaded* query is removed (it would violate I4). A DOI request is offered only for a loaded `explorer-query` source (it used `lastLoad?.query ?? query`, ExplorerStore.ts:2528).

## 3. Load paths

| # | Path | Current entry point | New route | Clears | Sets |
|---|---|---|---|---|---|
| 1 | Sidebar file: CSV/TSV | Load.tsx:143 → `speciesStore.load` (clears first, SpeciesStore.ts:369-371) | Upload tab → `classifyFiles` → column mapping → `loadUpload` → `loadOccurrenceFile` | Occurrence slot, species, Infomap results, on the first feature | `FileOccurrences` |
| 2 | Sidebar file: shapefile | Load.tsx:122 → `loadShapefile`. **Never clears**, so it merges (SpeciesStore.ts:436-441) | Same route, `{ format: 'shapefile' }` | Same as 1 | `FileOccurrences` |
| 3 | GBIF download zip on Load data | Load.tsx:93-96, 122 → shapefile loader, which fails (DataWorker.ts:91) | Upload → `gbif-zip` → `loadGbifZip(file)` | On the first record | `ZipOccurrences { provenance: null }` |
| 4 | Newick file | Load.tsx:99 → `treeStore.load` (`.tree` missing from accept at 154) | Upload, or Phylogeny's Newick upload → `loadTree({ kind: 'file' })` | Tree slot, after validation | `FileTreeSource`; Infomap reruns |
| 5 | Legacy examples | Load.tsx:249 → `ExampleStore.loadExample` (45-70); `rootStore.clearData()` at 48 leaves `lastLoad`/`loadedTree` stale | Examples tab → `loadExample(entry)` (`files`) | Occurrence slot on the first feature; tree slot **only if the example has a tree** (I8) | `ExampleOccurrences` (+ `ExampleTreeSource`) |
| 6 | Explorer stream load | `ExplorerStore.load` (2161) → `finishLoad` (`lastLoad = load`, 2446); dock Load, Mod+Enter, "Try again", EmptyPanel "Load again" | `ExplorerStore.load()` → `dataStore.loadQuery(req)` → `data/streamLoad.ts` | On the first accepted record | `QueryOccurrences` |
| 7 | Explorer example studies | `examples.ts:42-101`; `restore()` (2873-2877) sets the query only | Examples card **Load** → `explorerStore.loadExampleQuery(entry)` (restore, Search tab, canLoad gate, `load({ exampleId })`). **Open in Search** → `restoreQuery` only. The Search tab's empty-state ExampleCards offer the same two actions | As 6 | `QueryOccurrences { exampleId }` |
| 8 | Library: recent and saved | `restore()` | Unchanged (sets the query only) | — | — |
| 9 | Cite tab zip, "Replace" | ZipDropzone.tsx:277 → `applyZip('replace')` → `loadZip` (2818) | `loadGbifZip(file, { query: loaded.query, download })` | As 3 | `ZipOccurrences` with provenance |
| 10 | Cite tab zip, "keep the stream, cite the DOI" | ZipDropzone.tsx:291 → `applyZip` (2704-2713) | `patchOccurrence(id, { gbifDownloadKey, gbifDownloadDoi })` | — | DOIs on the same source |
| 11 | Derived-dataset DOI | `setDerivedDoi` (2517-2521) | `patchOccurrence(id, { derivedDoi })` | — | `derivedDoi` |
| 12 | Open Tree | `PhyloStore.loadSelected` (735-766), from TreeSelectionSummary.tsx:389, 410, 434 | `loadTree({ kind: 'opentree', … })` | Tree slot | `OpenTreeSource`; Infomap reruns (unless an occurrence load runs) |
| 13 | Discard a running load | `cancel` (2511) + `rootStore.clearData()` at 2353 and 2852, which wipe the previous data **even before any record** | `dataStore.cancel('discard')`: before commit only aborts; after, `removeOccurrences()` | Only what this load committed | — |
| 14 | Run bioregions anyway | ExplorerStore.ts:2458 | `dataStore.runBioregionsAnyway()` | — | Clears `provenance.bioregionsSkipped` |
| 15 | Documentation demo | DocumentationStore.ts:58-60 | `demoStore.dataStore.loadInline(…)` | The demo root only | `docs-demo` sources |
| 16 | Dev-only examples | `src/examples.json` (`devOnly`) | As 5 | As 5 | As 5 |
| 17 | Remove or clear | None | Card **Remove** → `removeOccurrences()` / `removeTree()`; `dataStore.clear()` | Its slot only | — |
| 18 | URL or state restore | None (`library.ts:6` keeps recent, saved, downloads) | No change; after a reload both slots are empty | — | — |
| 19 | Headless harness | `harness/stubRoot.ts` | No change (§2.3) | — | — |

Bugs in the "Load data…" path:

| Bug | Anchor | Fix |
|---|---|---|
| A GBIF zip goes to the shapefile loader. The worker runs loaders un-awaited in `onmessage`, so a throw before the loader's `try` is an unhandled rejection and no status is posted; DataWorker.ts:165-171 swallows shapefile errors and posts 'complete' with 0 features | Load.tsx:93-96, 122; DataWorker.ts:88-92, 165-171, 189-206 | S5 classifies by zip entries. S1: the worker posts `{ type: 'status', status: 'error', message }` for every failure, SpeciesStore rejects, and 0 features is an error (I6) |
| `.tree` handled (89) but missing from `accept` | Load.tsx:89, 154 | U3: accept follows the format table |
| No-occurrence-file branch is `// error`, no UI | Load.tsx:117-118 | U3: `classifyFiles` errors in the Upload tab |
| Debug `console.log` on every render and column | Load.tsx:34, 72 | S1 removes; U5 deletes the file |
| `infomapStore.setTree(null)` on every accept clears the Infomap result tree (InfomapStore.ts:504), even if the mapping is cancelled | Load.tsx:77 | S1: Infomap results are cleared only on commit |
| With several CSVs the first one wins silently | Load.tsx:84-88 | S5: error "Drop one occurrence file at a time" |
| Shapefile loads append to the current data | SpeciesStore.ts:436-441 | S1: the commit clears |
| Shapefile zip rejected unless MIME is exactly `application/zip` | DataWorker.ts:~60-64 | S1: check the extension |
| A broken or non-Newick file (a CSV named `.tree`, truncated text) silently becomes an empty tree; `loadString` also sets `isLoading`/`treeString` before parsing | newick.ts:86-222 (no throw); TreeStore.ts:307-312 | S1: `validateNewick` before any state change |

## 4. Continue loading and Load again (store)

### 4.1 Consuming the stream contract (`feat/explorer-streams`, `src/sources/types.ts`)

As implemented (all additive):

- `StreamOptions.resume?: StreamCursor`: a cursor from an earlier run of the **same plan**; a cursor whose `source` differs makes the stream throw. `maxRecords` caps the whole load including resumed runs; if `cursor.fetched >= maxRecords` the stream yields nothing.
- `RecordBatch.cursor?: StreamCursor`: set on every batch by `streamGbif` and `streamObis`, **not** by the zip reader (`importGbifZip`, so the batch fixtures and the zip path need no change). It covers exactly the work whose records were yielded up to and including that batch. JSON-safe.
- `StreamCursor = GbifStreamCursor { source: 'gbif'; done: string[]; fetched; requestsDone } | ObisStreamCursor { source: 'obis'; ranges: { after?, end?, done }[]; fetched; requestsDone }`. `fetched` and `requestsDone` are cumulative over all runs, and a resumed run's progress starts from them. DataStore treats cursors as opaque.
- `StreamProgress.failedParts?` (this run only; resets on resume; 0 when nothing failed), `lastError?` (e.g. "GBIF returned HTTP 503 Service Unavailable", "Could not reach OBIS (network error)", "OBIS did not respond in time"), `stoppedEarly?: 'errors'` (GBIF after 5 consecutive failed requests; OBIS whenever a range stopped at a failed page, or after 5 consecutive failures).
- End state: when failures happened, the final batch carries them; if no real batch followed, a final `records: []` batch (with a cursor) is emitted. GBIF may emit a final empty batch on resume to lower `requestsTotal`. OBIS sets final `expected = fetched` only when nothing failed.
- Errors: failed parts end the stream **normally**. A stream throws only an AbortError (outer signal) or an Error for an invalid plan or wrong-source cursor. `mergeBatches` is unchanged (a throw goes to `onError`; the batch spread keeps `cursor`).
- Also available (not needed by DataStore): `http.ts` `describeRequestError`, `BULK_RETRIES`, `MAX_CONSECUTIVE_FAILURES`, `retryTiming`; `gbifGraphql` retries GraphQL `errors`.

What the store does:

- **Commit-time vs finish-time state.** At the commit, the source is created with `status: 'loading'`, `retrievedAt = now`, `query`, `cap`, and `provenance: null` (`download: null` for a zip). Cursors and the tally live on `job.run` (job-local, keyed by `SourceId`) because no source id exists before the commit and none ever exists for an empty load. At finish, if the load committed, `runs.set(source.id, { plans, cursors, tally, labels, ledger, ledgerBase })` and the source becomes `status 'done'` with its provenance (or download summary) and `completedAt`. Continue writes into the existing run.
- **Cursor bookkeeping** in `accepted()` (moved from ExplorerStore.ts:2306-2325), after the pause gate and abort check: a batch with accepted records is `yield`ed first and only **then** `job.run.cursors[batch.source] = batch.cursor` (the generator resumes only after `loadRecords` added the batch, so a batch dropped by an abort or `break` never advances the cursor). A batch with no accepted records (including the final empty one) sets the cursor immediately. `mergeProgress` also copies `failedParts`, `lastError`, `stoppedEarly`, and DataStore keeps the last `progress.fetched` per source.
- **Outcome at finish** (replacing `cancelled || errors.length > 0` at ExplorerStore.ts:2412 and the `failed` test at 2388-2395, which can no longer fire because failed parts do not throw):
  - **Nothing committed:** if Σ`failedParts` > 0 or a source threw → `job.state = 'error'`, `job.error = lastError`, `outcome = { emptyReason: 'failed', previousKept, stop }`. Else the existing `noMatches` / `allDropped` / `cancelledEarly`. The slots are untouched (I6).
  - **Committed, stop reason:** `'cancelled'` if `cancelMode === 'keep'` or the signal aborted; else `'errors'` if Σ`failedParts` > 0 or a source threw (`lastError` = first `progress.lastError`, else `shortError(thrown)`); else `'cap'` if some source's last `progress.fetched >= cap` (the `maxRecords` it was given; the planned sum is ≤ cap because Load is blocked when `estimate.overCap`, plan.ts:242, so a cap stop means the estimate was low); else `null` (complete). `partial = stop ? partialLoad({ … }) : null`.
- **ResumeState** in `private runs = new Map<sourceId, ResumeState>()` (not observable), for every finished `QueryOccurrences`, so Load again has its labels and ledger. Deleted when its source is replaced or removed. `source.resumable = provenance.stop != null && runs.has(id)`.

### 4.2 `continueLoad()`

- **Precondition:** `occurrence.kind === 'explorer-query'`, `status 'done'`, `resumable`, not `isLoading`.
- **Job:** `{ kind: 'continue', targetId: source.id, committed: true, label: 'Continuing ' + label, origin }`. The source stays `status 'done'` with its old provenance until the finish (I7), so `ex.loaded` and the cards stay valid; progress shows on the job.
- **Streams:** `run.plans.map(p => stream(p, { maxRecords: cap', signal, resume: run.cursors[p.source] }))`, `cap' = stop.reason === 'cap' ? niceCapAbove(max(planned, fetched) + 1) : provenance.cap` (strictly above the old cap; `niceCapAbove` in load/loadMath.ts, `niceCapAbove(500_000) = 500_000`).
- **Cleaning:** a new `RecordCleaner` from `provenance.query` (as at 2219-2224, `lowCount` from the OBIS plan detail). Dedupe across the resume boundary reuses the Add seeding: `new SeededDedupe(query.quality.dedupe, loadedPoints(speciesStore))` (job.ts:74-110). `run.tally` keeps counting. Known approximation: a GBIF/OBIS duplicate spanning the boundary counts as `duplicate`, not `crossSource`.
- **Append:** `speciesStore.loadRecords(batches, { controller, skipBioregions })` with **no** `onFirstRecord`, so nothing is cleared. `postLoad` bins all features and runs Infomap.
- **Merge at finish (same id):** `funnel = mergeFunnels(prev.funnel, seeded.adjust(cleaner.funnel))` (new in job.ts; sums every count, reason and source). The ledger's duplicates and crossSource rows are **rebuilt from the merged funnel** using `run.ledger`/`ledgerBase`. `kpis`, `datasetCounts`, `stats` from `run.tally`. `partial`, `stop` and `bioregionsSkipped` are recomputed over the merged load with the same rules as a first load. `completedAt = now`, `cap = cap'`. `query`, `retrievedAt`, `requests`, `label` and `exampleId` stay.
- **Stop while continuing:** `keep` only; advanced cursors make the next Continue start from there. If the Continue run gets 0 new records, the source is unchanged except `stop` (refreshed `lastError`/`failedParts`).

### 4.3 `loadAgain()` and `retry()`

- `loadAgain()` = `loadQuery({ query: source.query, cap: source.cap, plan: s => explorerStore.planQuery(source.query, source.cap, s), labels/ledger/ledgerBase from run, exampleId })`: fresh plans, no cursors, a **new** source id on the first record, the old source kept on an empty or failed result (I6). It does not change the workspace query, `ex.plans`, `rawPlans` or `planController`.
- `retry()` reruns `job.request` (the request of the last job, when it ended `failed` or `cancelledEarly`). It is the "Try again" action.

### 4.4 Copy

The "Edit the query to load again" text is removed.

**DoneRow** (dock; shown while `loaded` matches the query; LoadDock.tsx:145-208, 331-337; keeps `role="status"`):

| State | Left (status) | Buttons |
|---|---|---|
| complete | ✓ **Loaded 412,380 records** · 1,203 species | `Load again` (ghost, xs) |
| partial, cancelled | ⚠ **Loaded 40,033 of ~412,380 records** · partial · you stopped the load | `Continue loading` (primary), `Load again` |
| partial, errors | ⚠ **Loaded 40,033 of ~412,380 records** · partial · {lastError} | `Continue loading`, `Load again` |
| partial, cap | ⚠ **Loaded 500,000 records** · GBIF stopped at the cap; the estimate was ~430,000, so more may exist | `Continue up to 1,000,000`, `Load again` |
| empty, `failed` (`job.outcome`; shown for the job's query) | ⓘ **Nothing loaded** · {lastError} · previous data unchanged | `Try again` (primary; `retry()`) |
| empty, `cancelledEarly` | ⓘ **Nothing loaded** · stopped before any record arrived · previous data unchanged | `Load again` (`retry()`) |
| empty, `noMatches` / `allDropped` | ⓘ **Nothing loaded** · {EMPTY_REASON_SHORT} · previous data unchanged | none; the text "Change the query to load records" (the same query gives the same result) |

EmptyPanel uses the same rows. `EMPTY_REASON_SHORT` (preview/cleaningSteps.ts) gains `failed`.

**Partial banner** (LoadedPanel.tsx:248-258). Title: "Loaded 40,033 of ~412,380 records · 38 of 40 species (partial)". Body:

1. Why it stopped:

   | Stop | Sentence |
   |---|---|
   | cancelled | "You stopped the load before every record arrived." |
   | errors, `stoppedEarly` | "Loading stopped after repeated errors from {GBIF}: {lastError}. {n} requests did not complete." |
   | errors, some parts failed | "{n} requests to {GBIF} still failed after retries ({lastError}); everything else loaded." |
   | cap | "{GBIF} stopped at the cap of 500,000 records; the estimate was ~430,000, so more records may exist." |

2. What is missing, by reason:
   - cancelled / cap: `partialExplanation` (partialText.ts:31-46) by `partialKind`, reworded so it does not assume the user cancelled ("An incomplete load under-represents…").
   - errors: "The failed requests each covered some species in some areas or years, so those records are missing and the data may have gaps in some regions."
3. "Continue loading fetches only what is missing and adds it to this dataset. Load again starts over." For a cap stop: "Continue raises the cap to 1,000,000 and fetches the rest."

The buttons are `Continue loading` (or `Continue up to …`, primary) and `Load again`. The bioregions-skipped row at 285 is unchanged.

**Methods sentence** (`partialSentence`, provenance.ts:104-120):

| Reason | Sentence |
|---|---|
| cancelled | "Loading was stopped early: …" (current body) |
| errors | "Loading ended early after request errors: {n} of {m} requests failed, so records for some species, areas or years may be missing." |
| cap | "Loading stopped at the record cap of {cap}: …" |

No partial sentence after a Continue that completes.

**Sidebar card status** (orange; wraps to two lines, never truncated to a tooltip):

| Stop | Status line |
|---|---|
| cancelled | "Partial · you stopped the load" |
| errors | "Partial · {lastError}" |
| cap | "Partial · stopped at the cap" |

Below it a full-width `Continue loading` button. While continuing: "Continuing · 40,033 + 1,200 records" and a progress bar.

## 5. Data portal UI

### 5.1 Shell, tabs and component map

- **Tabs:** `Tab = 'search' | 'phylogeny' | 'upload' | 'examples' | 'cite'` (explorer/types.ts:18); labels "Search GBIF & OBIS", "Phylogeny", "Upload", "Examples", "Cite". `open(tab?)` opens on the last tab; initial `'search'`.
- **Dialog:** `ExplorerDialog.tsx` → `git mv` to `src/components/Explorer/DataPortal.tsx`; `TABS` (17-21) updated; title "Data"; `SourceChips` and `LibraryMenu` only on `search`. The folder keeps its name.

| Component | Status | Notes |
|---|---|---|
| `DataPortal.tsx` (was ExplorerDialog.tsx) | moved | Tabs, Close only (§5.7) |
| `OccurrencesTab.tsx` (the `search` tab) | reused | Unchanged apart from the dock (§5.8) |
| `upload/UploadTab.tsx`, `upload/FormatTable.tsx`, `upload/ColumnMapping.tsx` | new | §5.2; mapping rebuilt from `Load.tsx:178-236` using `data/columns.ts` |
| `examples/ExamplesTab.tsx`, `examples/ExampleCard.tsx` | new | §5.3 |
| `library/ExampleCards.tsx` | edited | Empty-state cards from the catalog's `query` entries, with Load and Open in Search |
| `library/LibraryMenu.tsx` | edited | Its Examples tab (13, 138) removed |
| `phylo/PhyloTab.tsx` + `phylo/NewickUpload.tsx` | edited, new | §5.4 |
| `cite/CiteTab.tsx`, `ZipDropzone.tsx`, `DerivedDatasetCard.tsx`, `DownloadRequestDialog.tsx`, `DownloadStatus.tsx` | edited | Read `dataStore` and `ex.loaded`. CiteTab:316 "Edit and reload" → "Edit query" (`resetToLoaded()` + `setTab('search')`) |
| `load/LoadDock.tsx`, `LoadedPanel.tsx`, `LoadProgress.tsx`, `MethodsStrip.tsx`, `partialText.ts` | edited | §4.4, §5.8 |
| `ControlPanel/Data.tsx` + `ControlPanel/SourceCards.tsx` + `ControlPanel/cards.ts` | rewritten, new | §5.5 |
| `ControlPanel/Load.tsx` | deleted | Replaced by Upload and Examples |

### 5.2 Upload tab: `classifyFiles` (`src/store/data/classify.ts`, pure)

```ts
export interface FileInfo { name: string; size: number; zipEntries?: string[] } // from listZipEntries
export type UploadItem =
  | { kind: 'points'; format: 'csv' | 'tsv'; file: number }          // index into files
  | { kind: 'shapefile'; files: number[] }                            // loose .shp + .dbf (+ .shx/.prj)
  | { kind: 'shapefile-zip'; file: number }
  | { kind: 'gbif-zip'; file: number; format: 'DWCA' | 'SIMPLE_CSV'; downloadKey?: string }
  | { kind: 'tree'; file: number };
export interface UploadPlan { occurrences: UploadItem | null; tree: UploadItem | null;
  ignored: { name: string; reason: string }[]; errors: string[] }
export function classifyFiles(files: FileInfo[]): UploadPlan;
export async function inspectFiles(files: File[]): Promise<FileInfo[]>; // the I/O wrapper
```

`listZipEntries(blob)` (`src/utils/zipEntries.ts`) reads only the central directory (EOCD in the last 65,557 bytes, plus the ZIP64 locator) and never inflates, so large GBIF zips stay cheap.

Detection rules (case-insensitive extensions):

| Input | Classified as | Error copy |
|---|---|---|
| `.csv`, `.tsv` | `points` | — |
| `.nwk`, `.tre`, `.tree` | `tree` | — |
| `.shp` with its `.dbf` (`.shx`, `.prj` optional, ignored) | `shapefile` | No `.shp`: "A shapefile needs its .shp file (and the .dbf for species names)". No `.dbf`: "Add the .dbf file: species names are read from it" |
| `.zip` with exactly one `.shp` entry (any folder) | `shapefile-zip` | More than one: "This zip holds {n} shapefiles; load one at a time" |
| `.zip` with `occurrence.txt` at its root | `gbif-zip` (DWCA) | — |
| `.zip` with `<key>.csv` at its root, key matching `\d{7}-\d{15}` | `gbif-zip` (SIMPLE_CSV) | Any other zip: "This zip has no shapefile and is not a GBIF download (no occurrence.txt or <download key>.csv at its root)" |
| Any other extension | ignored | "{name}: unsupported file type .{ext} (see the supported formats)" |
| More than one occurrence input | error | "Drop one occurrence file at a time (found {a}, {b})" |
| More than one tree | error | "Drop one tree at a time" |
| No files | error | "No files" |

The classifier is stricter than the zip reader's `dataFormat` (sources/gbif/zip.ts:~85-93), which accepts any root `.csv`; a user's own zipped CSV is not parsed as a tab-separated GBIF download.

**Format table**, always visible next to the drop zone, a `<table>` with a `<caption>`:

| Data | Files | Requirements |
|---|---|---|
| Point occurrences | `.csv`, `.tsv` | A header row and one row per record. You pick the species, latitude and longitude columns next; they are guessed from names containing species/binomial/name, lat, and lng/long. Decimal degrees (WGS84). Delimiter detected automatically. Rows with an empty or "NA" species are skipped. |
| Range polygons (or points) | Shapefile: a `.zip` with one `.shp` and its `.dbf`, or the loose `.shp` + `.dbf` | Polygon/MultiPolygon or Point/MultiPoint. Coordinates must be longitude/latitude (`.prj` is not read). The species name comes from the first of `binomial`, `species`, `name`, `id` (DataWorker.ts:99-160). |
| GBIF download | A `.zip` from gbif.org: Simple CSV or Darwin Core Archive | Needs `species`, `decimalLatitude`, `decimalLongitude`. ABSENT rows are skipped. The download key and DOI are kept for citation (zip.ts:60, 140). Loaded as downloaded. |
| Phylogenetic tree | `.nwk`, `.tre`, `.tree` (Newick) | Tip labels are matched to species names after underscores become spaces and the first letter is capitalised (treeUtilsJS.js:4-6). In the occurrence file, dots also become spaces (names.ts:5), so write tips with underscores, not dots. |

**Flow:**

1. Drop, or press the visible **Choose files** button (keyboard path). Accepts `.csv,.tsv,.zip,.shp,.shx,.dbf,.prj,.nwk,.tre,.tree`.
2. `inspectFiles` + `classifyFiles`.
3. A plan list: "Point occurrences · birds.csv", "Tree · birds.nwk", each with "replaces {label}" when that slot is filled. Errors inline in red.
4. For CSV/TSV, the column mapping: a 5-row preview (`loadPreview`, utils/loader.ts:61) and three labelled selects.
5. The primary button ("Load", "Load occurrences and tree", "Load tree") calls `dataStore.loadUpload(plan, columns)`, then closes the portal. Disabled with "A load is running" while `isLoading`.

**Standalone GBIF zips** load as downloaded: `dedupe: 'none'`, the world area, `excludeIntroduced: false`; only unusable rows are dropped. The card says "as downloaded".

### 5.3 Examples tab (`src/store/data/catalog.ts`)

```ts
export interface ExampleEntry {
  id: string; title: string; kind: 'files' | 'query';
  why: string; icon: 'paw' | 'cat' | 'bird' | 'oak' | 'waves' | 'shell' | 'map';
  taxon: string; rank?: string; region: string;
  source: string;                                   // 'GBIF', 'GBIF + OBIS', or the dataset origin
  records: { n: number; approx: boolean }; species: { n: number; approx: boolean } | null;
  size: string;                                      // '2.8 MB download' | 'Streams live from GBIF · ~6 MB' (no time: nothing to base it on)
  asOf?: string;                                     // date of the approximate counts (query kind)
  citation?: string;
  tree: { included: boolean; usedByDefault: boolean; citation?: string };
  devOnly?: boolean;
  files?: { species: string; tree?: string; settings: ExampleSettings }; // examples.json payload
  query?: OccurrenceQuery;                           // exampleStudies() payload
}
```

- **Sources:** `src/examples.json` gains `id`, `taxon`, `region`, `source`, `records`, `species`, `citation`, `treeCitation`, `why`, `icon`. `exampleStudies()` (examples.ts:42-101) is kept; `EXAMPLE_NOTES` (ExampleCards.tsx:10-19) moves into the catalog (S5 added the catalog copy with string icon ids; the UI step that rewrites ExampleCards deletes the component copy). Counts: files computed once from `public/data` with a throwaway script; queries approximate from one `plan()` run per source (records summed over sources, the larger species count, bytes summed), rounded, with `asOf`. API: `exampleCatalog(dev = NODE_ENV === 'development')` returns files entries then query entries, `devOnly` dropped unless `dev`; `files.species`/`files.tree` are `/bioregions/...` URLs like ExampleStore's; `citation` falls back to `EXAMPLE_CITATION_PLACEHOLDER`. A zip whose entries could not be listed (`zipEntries` undefined) is an error "{name}: could not read the zip file"; copy strings live in `UPLOAD_COPY` (classify.ts).
- **A card shows:** icon, title, "why"; taxon (rank) · region; source badges; "~40,000 records · 38 species" ("live count may differ" when approximate); the size; the citation in a "Cite" disclosure; a **tree badge**: "Includes a tree", "Includes a tree · not used by default" (`usedByDefault: false`, e.g. Global mammals `includeTree: false`), or "No tree · find one in Phylogeny".
- **Buttons:** `Load`: a `files` example calls `dataStore.loadExample(entry, 'examples')` and closes the portal (progress on the sidebar card); a `query` example calls `explorerStore.loadExampleQuery(entry)` (Search tab, canLoad gate, cap, workspace labels and ledger). `Open in Search` (`query` only). Disabled while `isLoading`.
- **Hidden:** `devOnly` entries in production (ExampleStore.ts:35).

### 5.4 Phylogeny tab

- **Before matching**, the StartCard (PhyloTab.tsx:26-48) gets "Or upload your own tree (.nwk, .tre, .tree)" via `NewickUpload` (same classifier, `tree` only; a visible Choose file button).
- **After matching**, the aside (122-128) shows a compact `NewickUpload` row above `NameMatchSummary`.
- **With a tree source loaded**: "Loaded: birds.nwk · 140 tips · 132 of 140 dataset species in tree", with `Remove`.
- **TreeSelectionSummary** (389, 410, 434) shows "Loaded" when `dataStore.tree?.kind === 'opentree'` and `candidate.id` matches (S3). "Replaces the tree loaded now." shows whenever `dataStore.tree` is set (any kind), since a file or example tree is replaced too.

### 5.5 Sidebar (`Data.tsx`, `SourceCards.tsx`, `cards.ts`)

`LoadData`, `LoadExample`, the Explore button, `ExplorerLoadStatus` and `ExplorerLoadedSummary` (Data.tsx:7-114) are replaced by:

- `[🗄 Data…]`: full-width, sm, solid, `data-testid="data-open"`, tooltip "Search GBIF & OBIS, upload files, examples and phylogeny"; `explorerStore.open()`.
- The cards from `sourceCards(sources, job, treeJob, overlap, counts, includeTree)`: occurrence card, then tree card.
- The stats (Data.tsx:130-145) stay; "Species in tree" moves onto the tree card.

**SourceCardModel** (pure, tested):

```ts
{ role, title, kindLabel, stats, status?: { tone, text }, progress?, primary: CardAction[], menu: CardAction[] }
// CardAction: { id: 'edit'|'cite'|'remove'|'continue'|'loadAgain'|'replace'|'examples'|'change'|'open'|'stop', label, tooltip, disabled?: string }
```

Visible actions are text buttons (`primary`, at most two plus Continue); the rest are text items in a `⋯` Menu (`aria-label="More actions for {title}"`).

| Kind | Title / kind label | Stats line | Primary | Menu |
|---|---|---|---|---|
| `explorer-query` | `queryTitle(query)` / "GBIF + OBIS query" ("Example" with `exampleId`) | "{records} records · {species} species" | **Edit query** (`open('search')` + `resetToLoaded` offered in the dock), **Cite** (`open('cite')`); **Continue loading** full-width when resumable | Load again, Remove |
| `gbif-zip` | "GBIF download {key}" / "GBIF download" | "… · as downloaded" | Cite | Remove (+ Edit query with provenance) |
| `file` | file name / "File" | "{records} records · {species} species" (+ "· {polygons} polygons") | Replace (`open('upload')`) | Remove. No Cite; line "Cite the original source of this file" |
| `example` | example title / "Example" | as `file` | Examples (`open('examples')`), Cite if it has a citation | Remove |

- **While loading** (`job`, `committed: false`): a job row (`role="status"`) above the old card or alone: "Loading {label}", a progress bar (`aria-valuenow`/`aria-valuemax`), "GBIF + OBIS 241k / 412k", `[Open]` (`open(job.origin)`; hidden when `origin` is `'sidebar'` or the job is a file load) and `[Stop ▾]`: "Stop and keep {n} records", plus "Cancel; keep the previous data" before the commit or "Discard the {n} records loaded so far" after it. After the commit the progress moves onto the new card (`status 'loading'`).
- **Remove** opens a popover "Remove {n} records? [Remove]"; focus moves to its confirm button and returns to the trigger on close.

Tree card:

- **Title:** Open Tree: "Open Tree synthetic tree v15.1" or the study title and year; a file: the file name; an example: "{example} tree".
- **Stats:** "{tips} tips · {inTree} of {datasetSpecies} dataset species in tree" (live, `treeOverlap`); "Topology only" badge when `grafen` ("Branch lengths were set with Grafen's method"); orange "Few dataset species are in this tree" when `inTree / datasetSpecies < 0.5`; "Not used in the analysis (Include tree is off)" when `includeTreeInNetwork` is false.
- **Actions:** primary **Change** (`open('phylogeny')`), **Cite** (`opentree`, or an example with a citation); menu **Remove** ("Remove the tree; bioregions are recomputed without it").

### 5.6 Empty-map overlay (WorldMap.tsx:76-112)

- **Cause of the missing padding:** two `flex="1"` buttons share a 340 px card with `p=5`, ~146 px each for a ~185 px label; Chakra's `minW` overrides the flex minimum and `nowrap` overflows the padding.
- **Redesign:** a `VStack` of full-width buttons under "No data yet" / "Search GBIF and OBIS, upload your own files, or start from an example.": `[⌕ Search GBIF & OBIS]` (`primaryButtonProps`; `open('search')`), `[⤒ Upload files]` (`secondaryButtonProps`; `open('upload')`), link-style `Try an example →` (`open('examples')`).
- **Framing reaction** (146-152) keys on `explorerStore.isOpen` and `dataStore.occurrence?.id`.

### 5.7 Close only

- **Removed:** `minimized`/`setMinimized` (ExplorerStore.ts:1035, 1227-1229), the minimize button (ExplorerDialog.tsx:193-201), `closeOrMinimize` (103-106, 127, 210), `minimizedIdle` (Data.tsx:103-107), references in `useExplorerShortcuts.ts`/`explorerUi.ts`. One open flag: `isOpen`, with `tab`.
- **Close (✕), Esc, `onOpenChange`** all call `close()`, even while streaming. Esc no longer opens the cancel menu; stopping is on the dock, card and LoadProgress.
- **✕ tooltip:** "Close (Esc): loading continues; progress shows in the Data panel" while loading, else "Close (Esc)".
- **No plan/preview fetching while hidden:** `close()` calls `abortPreview()` (1358-1368, also clears the debounce and `retryTimers`) and sets `previewStale = true`. `schedulePreview` (1372) returns early when `!isOpen`. `open()` (1207-1213) calls `schedulePreview()` when `previewStale` or the previewed key ≠ `previewKey(query)` (not only when every source is idle). `planWanted` (1683-1687) is already null when closed; `PhyloStore.tabActive` (200-203) already depends on `isOpen`. **Download polling (`setPolling`, 1200) and a running load continue while closed.**

### 5.8 Dock tooltips and copy

- **Removed:** `MODE_ITEMS` (LoadDock.tsx:16-19), the SegmentGroup (378-389; its `aria-label="Load mode"` goes with it), "Add records", "Added" (LoadDock.tsx:197, LoadedPanel.tsx:225).
- **Cap** (`CapField`, 209-240): tooltip on label and input, `openDelay` 300: "Most records each source may download. Loading is blocked while the estimated total is above the cap: raise it or narrow the query." (plan.ts:219-242: `overCap = Σ plannedRecords > cap`; `canLoad` 1984; `maxRecords: cap` per stream 2248).
- **Load button** (395-399): tooltip "Fetch every matching record from the enabled sources (up to the cap) and clean it with the filters above. {SHORTCUT}", plus " It replaces the loaded occurrences; the tree stays." only when a source is loaded. Disabled: the reason replaces it.
- **Visible replace line** under Load when an occurrence source is loaded and differs from the query: "Replaces {label} ({n} records). To combine taxa, add them to this query."
- **Taxon hint** (query/TaxonPicker.tsx), when exactly one taxon is selected and an occurrence source is loaded: "Add more taxa here to load them together."
- **MethodsStrip, before any load:** "Methods text appears once data is loaded."

### 5.9 Accessibility

- Every icon-only button has an `aria-label` equal to its tooltip title; card actions are text buttons or text menu items (§5.5).
- Information never lives only in a tooltip: the stop reason wraps on the card; the replace consequence is a visible line (§5.8). A disabled button that needs a tooltip is wrapped in a span.
- Job row and DoneRow: `role="status"`; progress bars expose `aria-valuenow`/`aria-valuemax`.
- Upload: a visible Choose files button; the format table is a real `<table>` with a `<caption>`; the column selects have labels.
- Remove popover moves focus to its confirm button and back to the trigger.
- U7 checks every button in the portal and sidebar has an accessible name.

## 6. Test plan (vitest; pure or fake-root tests; no DOM)

| Step | Test file | Cases |
|---|---|---|
| S1 | `src/store/DataStore.test.ts` (fake root: species, tree, infomap, map stubs that record call order) | 1. A file load commits on the first feature and sets one `file` source; `clear()` empties both slots. 2. **A failed parse, and a 0-feature file, keep the previous source and data and set `job.error`.** 3. A tree load after an occurrence load keeps the occurrence source, and the reverse (I8). 4. `removeTree()` calls `treeStore.reset()` and reruns Infomap only with occurrences loaded. 5. `removeOccurrences()` keeps the tree. 6. `commitOccurrence` clears species and Infomap and swaps the slot in **one** action. 7. `methodsText`/`citations` for `file`, `example` and every tree kind (incl. `opentree` from a frozen `citation`); empty when nothing is loaded; "Loading …" for a loading source. 8. `loadInline` creates two `example` sources. 9. While a file load runs, `loadOccurrenceFile` returns `{ started: false }`, and `loadTree` commits the tree without calling `infomapStore.run`. 10. `loadTree(…, { rerun: false, includeTree: false })` leaves `includeTreeInNetwork` false and does not run Infomap. |
| S1 | `src/store/TreeStore.test.ts` | A CSV string, `'((a,b'`, `'hello'` and `''` throw `Not a valid Newick tree` and leave `tree`, `treeString`, `isLoading` unchanged; `reset()` clears `treeNodeMap` and `isLoaded`. |
| S1 | `src/store/data/ownership.test.ts` | No load or clear call outside the allowlist (incl. the alias patterns). Temporary lines: ExplorerStore.ts (TODO S2b) and PhyloStore.ts (TODO S3). S1 reroutes Load.tsx, ExampleStore.ts and DocumentationStore.ts, so they need none. |
| S2a | `src/store/data/streamLoad.test.ts` (adapts `setup()`/`batches()` from explorer/store.test.ts:60-141; stream-load tests 143-568 move here) | 1. **GBIF query load, then an example load, leaves only the example card; no GBIF citation in `methodsText`/`citations`.** 2. An empty load keeps the previous source (`job.outcome.previousKept`); `ex.loaded` unchanged. 3. `cancel('discard')` before the first record keeps the previous source and data; after it, removes both. 4. `cancel('keep')` gives a partial provenance. 5. `speciesStore.name` follows the source. 6. `ex.dirty`/`loadedMatchesQuery` read `ex.loaded`. 7. **During streaming, after the commit, the source is `status 'loading'` with `provenance: null`, `ex.loaded` is null, and `methodsText`, `lastLoad` compat and `loadedMatchesQuery` do not throw.** 8. `close()` during streaming leaves the job streaming. 9. `loadQuery` while loading returns `{ started: false }`. 10. `planQuery(otherQuery, cap, s)` leaves `ex.plans`, `rawPlans`, `planController` unchanged. 11. No `loadMode`, `setLoadMode`, `minimized` setter semantics remain (type-level `@ts-expect-error`). Rewrite ExplorerStore.test.ts:280 against `job.outcome`. |
| S2a | `src/store/SpeciesStore.test.ts` | Existing cases (39-147) rewritten for `onFirstRecord` (no `name`/`clear`). New: **discard before the first record leaves `isLoading === false` and the old data loaded.** |
| S2b | `src/store/data/zipLoad.test.ts` | A zip "Replace" sets a `gbif-zip` source with provenance at finish (`download: null` while loading); "keep stream, cite DOI" only patches the DOIs; a standalone zip loads with `dedupe: 'none'`; `loadGbifZip` while loading returns `{ started: false }`. |
| S3 | `src/store/phylo/PhyloStore.test.ts` | 1. `loadSelected` creates an `opentree` source with `candidate`, `grafen`, `tips`, `citation`. 2. **An Open Tree tree replaced by a file tree leaves the source `file`, and the Open Tree citation is gone from `methodsText`/`citations`.** 3. `cladeNote` is null for file and example occurrences. |
| S4 | `streamLoad.test.ts` (+ `job.test.ts` for `mergeFunnels`) | 1. **Continue appends and keeps provenance:** a load ending with `failedParts: 1`, `lastError` → `continueLoad()` → same id, query, `retrievedAt`; records summed; funnel merged; ledger duplicates row rebuilt; `stop` null when the rest succeeds; streams called with `resume` = the last cursors. 2. A batch dropped by an abort does not advance the cursor. 3. A source whose `fetched >= cap` gives `reason 'cap'`; Continue runs with `cap' > cap`. 4. `stoppedEarly` gives the "repeated errors" copy. 5. **Every part fails (0 records, `failedParts > 0`): no commit, `job.state 'error'`, `job.error === lastError`, `outcome.emptyReason === 'failed'`, old source kept.** 6. **`loadAgain()` after editing the workspace query plans `source.query`; `ex.plans` unchanged;** a new id. 7. `retry()` reruns `job.request`. 8. `partialSentence` by reason. |
| S6 | `DataStore.test.ts` (extended) | **Global mammals (`includeTree: false`) leaves `includeTreeInNetwork` false and `infomapStore.run` is called exactly once;** a `files` example with a tree fills both slots tree-first; `loadUpload` (csv + nwk) loads the tree first with one Infomap run; a `query` example delegates to `explorerStore.loadExampleQuery`. |
| S5 | `classify.test.ts`, `zipEntries.test.ts` (fixtures via fflate `zipSync`), `columns.test.ts`, `catalog.test.ts` | `classifyFiles`: csv/tsv → points; nwk/tre/tree → tree; .shp + .dbf (+ .shx/.prj) → shapefile; .shp alone, .dbf alone → errors; `occurrence.txt` zip → DWCA; `0012345-241007104925546.csv` zip → SIMPLE_CSV; `data.csv` zip → error; nested .shp → shapefile-zip; 2 .shp → error; csv + nwk → both; 2 csv → error; .xlsx → ignored; [] → error. `guessColumnNames` on GBIF SIMPLE_CSV headers and on `scientificName`-only headers (falls back to 0/1/2). Catalog: every non-dev entry has taxon, region, source, records and `tree.included === Boolean(files?.tree)`; unique ids. |
| U2 | `partialText.test.ts` | Copy per stop reason; the errors copy mentions gaps in areas/years and never "you stopped". |
| U5 | `src/components/ControlPanel/cards.test.ts` | Actions per kind (no Cite on `file`; Continue only when resumable; Stop menu labels before/after commit; `[Open]` hidden for file loads; tree warning below 50 %; "Not used in the analysis" when includeTree is off). |
| U7 | full suite, `pnpm build`, `pnpm lint`, one browser driver script | Loads a GBIF query, then an example: one occurrence card. Loads a tree: tree card. `scrollWidth <= clientWidth` for the overlay buttons, `data-open` and every card button. With the portal closed and no load running: no occurrence-search or plan request (preview/plan endpoints only). Every button has an accessible name. Prints compact JSON. |

## 7. Implementation steps

Steps in one phase run in parallel and own disjoint files; each phase starts after the previous one is committed in the worktree. Every step ends with `pnpm vitest run <its tests>`, `pnpm exec tsc -b`, and one local Conventional Commit (no push). Effort: high for every step, **max for S2a** (the one hard piece). Size each step for ≤ 50 tool calls; hand off with a summary if it runs over.

**No step owns** `src/components/Explorer/preview/mapView.ts`, `preview/mapView.test.ts`, `query/AreaPicker.tsx` or `src/sources/**`. `preview/PreviewMap.tsx` is touched only by U1 (480-484 rename), after `feat/explorer-map-ui` is merged.

### Wave 2: store and data model

Phases: **2.1** S1 ‖ S5 → **2.2** S2a ‖ S3 → **2.3** S2b → **2.4** S4 (after the streams merge) → **2.5** S6.

**S1: DataStore foundation** (≈45 calls)

- **Goal:** the owner store with both slots; file, tree, inline loads committing on the first feature; single-writer SpeciesStore file loaders and TreeStore. The app keeps working.
- **Owns:** new `src/store/data/types.ts` (all of §2.1), `src/store/DataStore.ts`, `src/store/data/methods.ts` (file, example, loading, and all three tree kinds), `src/store/DataStore.test.ts`, `src/store/TreeStore.test.ts`, `src/store/data/ownership.test.ts`. Edited: `RootStore.ts` (add `dataStore` after `treeStore`; `clearData()` delegates to `dataStore.clear()` until S2b); `SpeciesStore.ts` (`load` 362-376, `loadString` 322-336, `loadShapefile` 436-441: drop internal clears, add `onFirstRecord`, reject on worker error and on 0 features; **not** `loadRecords`); `TreeStore.ts` (`validateNewick`, `loadString` 307-312 atomic, `reset()`, delete `load` 314-320); `src/workers/DataWorker.ts` (error status for every failure 45-92, 165-171, 189-206; extension check ~60-64); `DocumentationStore.ts` (58-60 → `loadInline`); `ExampleStore.ts` (`loadExample` 45-70 delegates to `dataStore.loadExample`); `ControlPanel/Load.tsx` (reroute 99, 122, 143; delete 34, 72, 77).
- **Must not touch:** ExplorerStore.ts, PhyloStore.ts, `loadRecords`, `SpeciesStore.test.ts`, `explorer/*`, `examples.json`, any `src/components/Explorer/**`.
- **Accept:** S1 tests (§6); `harness/networks.test.ts`; `pnpm build`.

**S5: Pure modules** (≈35 calls; parallel with S1)

- **Goal:** the classifier, zip lister, column guesser and example catalog, with no store or UI wiring.
- **Owns:** new `src/store/data/classify.ts`, `src/utils/zipEntries.ts`, `src/store/data/columns.ts` (`guessColumnNames` from Load.tsx:24-57, no logging), `src/store/data/catalog.ts`, each with its test; edited `src/examples.json` (new fields; counts from a throwaway script over `public/data`; unknown citations get the §9.3 placeholder "Source: Infomap Bioregions example data" and are listed in the commit body).
- **Must not touch:** DataStore.ts, `data/types.ts` (S5 defines its own `UploadPlan`/`ExampleEntry`), any UI.
- **Accept:** S5 tests.

**S2a: Stream load into DataStore; Add removed** (≈45 calls; max effort)

- **Goal:** §2.3's ExplorerStore and SpeciesStore rows except the zip; paths 6, 7 (store side), 13, 14; the commit-time/finish-time source lifecycle (§4.1, first bullet).
- **Owns:** new `src/store/data/streamLoad.ts`, `src/store/data/streamLoad.test.ts`. Edited: `DataStore.ts` (`loadQuery`, `cancel`, `pause`, `resume`, `runBioregionsAnyway`, `job.request`, `job.run`, `runs` creation at finish, `loadExample` query-kind delegation); `data/methods.ts` (`explorer-query` kind only); `ExplorerStore.ts` (delete the moved code, §2.3 ranges except `loadZip`; add `loaded`, side-effect-free `planQuery`, `resetToLoaded`, `loadExampleQuery`, thin `load(opts)`; `canLoad`'s job check 1979-1980 reads `dataStore.isLoading`; remove `minimized` and `loadMode` behind compat); `explorer/types.ts` (`Provenance` fields); `explorer/provenance.ts` (drop `shownLoad`, `keptLoad`, the draft branch); `explorer/job.ts` (move only); `SpeciesStore.ts` (`loadRecords` 460-545: `onFirstRecord`, no `clear`/`name`, the discard fix; `name` computed); `SpeciesStore.test.ts`; `explorer/store.test.ts` and `ExplorerStore.test.ts` (move/rewrite the stream-load tests).
- **Transitional compat** on ExplorerStore, each `/** @deprecated removed in U1 */`, so the UI compiles unchanged: `get lastLoad()` (= `loaded` with `mode: 'replace'` and the empty-outcome fields from `dataStore.job.outcome`); `loadMode` (`'replace'`), `setLoadMode` (no-op); `minimized` (false), `setMinimized(true)` (→ `close()`); `editAndReload` (→ `resetToLoaded` + `setTab`); `get job()`, `cancel`, `pauseLoad`, `resumeLoad`, `runBioregionsAnyway` (→ `dataStore`).
- **Must not touch:** any component, PhyloStore.ts, `loadZip`/`applyZip`/`setDerivedDoi`, `RootStore.ts`, `ownership.test.ts`, `src/sources/**`.
- **As built:** dropping `loadRecords`' `name`/`clear` and the `job`/`lastLoad` fields forced minimal interim edits in the zip path: `loadZip` commits a `gbif-zip` source through `onFirstRecord` and settles its provenance with `dataStore.replaceSource` (`download` stays null until S2b), and writes the observable `zipJob` copy (its writes used to go to a plain object the UI never saw); `applyZip('keepStreamCiteDoi')` and `setDerivedDoi` patch the loaded source through a private `patchLoaded`; `importZip`/`applyZip`/`loadZip` read `loaded`. The zip controls stay in ExplorerStore until S2b. `loadExampleQuery` opens the `'occurrences'` tab (the `'search'` id comes with U1) and awaits `fetchPlans()` before the Load gate.
- **Accept:** S2a tests (§6, both files); the existing explorer tests; `pnpm build`.

**S3: Phylogeny tree source** (≈25 calls; parallel with S2a)

- **Goal:** Open Tree loads go through `dataStore.loadTree`; PhyloStore keeps no provenance.
- **Owns:** `src/store/PhyloStore.ts` (114, 129, 221-226, 316-321, 735-766), `src/store/phylo/PhyloStore.test.ts`, `src/components/Explorer/phylo/TreeSelectionSummary.tsx` (the "Loaded" check only), `ownership.test.ts` (delete the PhyloStore allowlist line only).
- **Compat:** `citationText` stays as a deprecated getter derived from `dataStore.tree`, for CiteTab:253, until U6.
- **Must not touch:** DataStore.ts, `data/methods.ts` (S1 already handles `opentree`), ExplorerStore.ts, SpeciesStore.ts.
- **Accept:** S3 tests; `tsc -b`.

**S2b: Zip load, DOI patches** (≈30 calls; after S2a)

- **Goal:** paths 3 (store side), 9, 10, 11; delete `RootStore.clearData`. Also delete S2a's interim zip machinery in ExplorerStore: `zipJob`, `loadController`, `cancelMode`, `pauseGate`, `pauseFlush`, `releasePause`, `cancelZip`, `patchLoaded`, and the zip branches of the compat `job`, `cancel`, `pauseLoad`, `resumeLoad` and of `isLoading`/`canLoad`.
- **Owns:** new `src/store/data/zipLoad.ts`, `src/store/data/zipLoad.test.ts`. Edited: `DataStore.ts` (`loadGbifZip`, `patchOccurrence`); `data/methods.ts` (`gbif-zip` kind); `ExplorerStore.ts` (delete `loadZip` 2721-2855, `setDerivedDoi`; `applyZip` 2704-2713 → `loadGbifZip`/`patchOccurrence`; compat `setDerivedDoi` → `patchOccurrence`, deprecated); `RootStore.ts` (delete `clearData`); `ownership.test.ts` (delete the ExplorerStore allowlist line only); zip tests in `explorer/store.test.ts`, if any, move to `zipLoad.test.ts`.
- **Must not touch:** components, PhyloStore.ts, SpeciesStore.ts.
- **Accept:** S2b tests; ownership test without the ExplorerStore line; `pnpm build`.
- **As built:** the compat `ExplorerStore.job` now returns `'zip'` data-store jobs too, so the dock keeps showing a Cite-tab "Replace"; `cancel`, `pauseLoad` and `resumeLoad` delegate to DataStore. A zip discard now goes through `removeOccurrences` and keeps the tree (it used to call `RootStore.clearData`, which also dropped it). `applyZip('replace')` passes `origin: 'search'`, the frozen ledger and the facet labels. `ExplorerStore.methodsText` reads the tree citation from `dataStore.tree` (not `phyloStore.citationText`). `streamLoad.test.ts`'s fake root lost `clearData`: its "no wipe" checks now assert `treeStore.reset` was not called.

**S4: Continue loading, Load again, stop reasons** (≈40 calls)

- **Precondition:** `feat/explorer-streams` (1401f82) is merged into `feat/gbif-explorer` and the full suite passes. `RecordBatch.cursor` is optional there and the zip reader sets none, so the zip path and batch fixtures need no change.
- **Goal:** §4.1 (cursor bookkeeping, outcome at finish incl. `failed` and `cap`), §4.2, §4.3.
- **Owns:** `DataStore.ts` (`continueLoad`, `loadAgain`, `retry`, `resumable`), `data/streamLoad.ts` (cursors, stop state, `mergeProgress` fields, failed outcome), `data/types.ts`, `explorer/types.ts` (`EmptyReason` + `'failed'` only), `explorer/provenance.ts` (`partialSentence` by reason, "retrieved between"), `data/methods.ts` (stop and date wording), `explorer/job.ts` (`mergeFunnels`), `streamLoad.test.ts`, `job.test.ts`.
- **Must not touch:** UI, ExplorerStore.ts, `src/sources/**`.
- **Accept:** S4 tests.

**S6: Catalog loads and upload orchestration** (≈25 calls)

- **Goal:** `loadExample` (files kind, with `includeTree` and a single Infomap run) and `loadUpload`; ExampleStore deleted.
- **From S1:** `DataStore.loadExample` takes an interim `ExampleFiles` (`id`, `name`, `speciesFile`, `treeFile?`, `citation?`, `treeCitation?`, `settings`) that ExampleStore fills with `id: example.name`; S6 swaps it for the catalog's `ExampleEntry` and drops `ExampleFiles`.
- **Owns:** `DataStore.ts` (`loadExample` files kind, `loadUpload(plan, columns?)`); deletes `src/store/ExampleStore.ts`; `RootStore.ts` (remove `exampleStore`); `ControlPanel/Load.tsx` `LoadExample` (238-291) fed from the catalog until U5 deletes the file; `DataStore.test.ts`.
- **Must not touch:** ExplorerStore.ts, any `src/components/Explorer/**`.
- **Accept:** S6 tests; `grep -rn exampleStore src` is empty.

### Wave 3: portal UI, sidebar cards and polish

**Precondition:** `feat/explorer-map-ui` (a7f3db9) is merged into `feat/gbif-explorer`.

Phases: **3.1** U1 alone → **3.2** U2 ‖ U3 ‖ U4 ‖ U5 ‖ U6 (at most 2-3 at once) → **3.3** U7. A U step touches no file owned by another U step and no store file it does not list; a needed store change is reported, not made.

**U1: Portal shell and compat removal** (≈45 calls)

- **Goal:** §5.1 shell and §5.7; delete every S2a/S2b/S3 compat member except `citationText`; point all readers at `dataStore` and `ex.loaded`.
- **Owns:** `explorer/types.ts` (`Tab`); `ExplorerStore.ts` (delete compat; `close()`/`open()`/`schedulePreview` per §5.7; `open`/`setTab` call sites); `ExplorerDialog.tsx` → `DataPortal.tsx` (git mv) and `index.ts`; `useExplorerShortcuts.ts`, `explorerUi.ts`; `PhyloTab.tsx` ("Go to Occurrences" → `search` only); `library/LibraryMenu.tsx:107` and `library/ExampleCards.tsx:27` (`'occurrences'` → `'search'` only); placeholders `upload/UploadTab.tsx`, `examples/ExamplesTab.tsx`; mechanical reader edits in `LoadDock.tsx` (delete the SegmentGroup), `LoadedPanel.tsx`, `LoadProgress.tsx`, `MethodsStrip.tsx`, `CiteTab.tsx`, `ZipDropzone.tsx`, `DerivedDatasetCard.tsx`, `DownloadRequestDialog.tsx`, `DownloadStatus.tsx`, `PreviewColumn.tsx`, `DecisionLedger.tsx`, `Data.tsx`, `WorldMap.tsx`; `preview/PreviewMap.tsx` 480-484 (`lastLoad` → `loaded` only).
- **Must not touch:** `mapView.ts`, `mapView.test.ts`, `AreaPicker.tsx`, any store besides ExplorerStore and explorer/types.ts.
- **Accept:** `tsc -b`; full vitest run; `grep -rn "'occurrences'" src` finds no `Tab` use; the dialog opens on every tab; no minimize button; a closed portal schedules no preview.

**U2: Dock, partial banner, Continue UI** (≈35 calls)

- **Goal:** §4.4 and §5.8 copy; Continue, Load again and Try again buttons; Cap and Load tooltips; replace line and taxon hint; §5.9 for these files.
- **Owns:** `load/LoadDock.tsx`, `load/LoadedPanel.tsx`, `load/LoadProgress.tsx`, `load/MethodsStrip.tsx`, `load/partialText.ts` + test, `preview/cleaningSteps.ts` (`EMPTY_REASON_SHORT.failed` only), `query/TaxonPicker.tsx` (hint only).
- **Must not touch:** stores, other U files.
- **Accept:** U2 test; `tsc -b`.

**U3: Upload tab** (≈40 calls)

- **Goal:** §5.2 with §5.9 (Choose files, table caption, labelled selects).
- **Owns:** `upload/UploadTab.tsx`, `upload/FormatTable.tsx`, `upload/ColumnMapping.tsx`. The old modal: `git show HEAD:src/components/ControlPanel/Load.tsx`.
- **Must not touch:** stores, `ControlPanel/*`.
- **Accept:** `tsc -b`; the format table matches §5.2.

**U4: Examples tab** (≈35 calls)

- **Goal:** §5.3; one catalog, same Load/Open in Search actions everywhere.
- **Owns:** `examples/ExamplesTab.tsx`, `examples/ExampleCard.tsx`, `library/ExampleCards.tsx`, `library/LibraryMenu.tsx` (drop its Examples tab).
- **Must not touch:** stores, `catalog.ts`.
- **Accept:** `tsc -b`; tree badges render the three states.

**U5: Sidebar and overlay** (≈40 calls)

- **Goal:** §5.5, §5.6, §5.9 for the sidebar.
- **Owns:** `ControlPanel/Data.tsx` (rewrite), new `ControlPanel/SourceCards.tsx`, new `ControlPanel/cards.ts` + `cards.test.ts`, `WorldMap.tsx` (§5.6); deletes `ControlPanel/Load.tsx`.
- **Must not touch:** stores, Explorer components.
- **Accept:** U5 test; `tsc -b`.

**U6: Phylogeny upload and Cite tab** (≈35 calls)

- **Goal:** §5.4 and the Cite tab reading DataStore.
- **Owns:** `phylo/PhyloTab.tsx`, new `phylo/NewickUpload.tsx`, `cite/CiteTab.tsx` (reads `dataStore.methodsText`/`citations`; empty state "Load data to get a methods paragraph and citations"; "Edit query"; DOI request only for a loaded query), `cite/ZipDropzone.tsx`, and PhyloStore's deprecated `citationText` (delete it; the only PhyloStore.ts edit in wave 3).
- **Must not touch:** other stores, other U files.
- **Accept:** `tsc -b`; `grep -rn citationText src` is empty.

**U7: Verification and polish** (≈25 calls)

- **Work:** full `pnpm test`, `pnpm build`, `pnpm lint`; the browser driver script (§6 U7); update the `.changeset/` entry text; a "Superseded by" pointer at the top of each of the two old specs.

## 8. Out of scope and deferred

- **A real multi-source "Add".** The list typing keeps the door open. It needs a `sourceId` on every feature (so Remove can re-bin), a cross-source dedup report, and one citation per source. Concatenating several CSVs is the same feature.
- Persisting sources and cursors across reloads (cursors are JSON-safe).
- Rebuilding an explorer query from a standalone GBIF zip's predicate (so it could get "Edit query").
- GeoJSON input (no parser in DataWorker).
- Prebuilt snapshots of the query examples, so examples do not hit live GBIF.
- Removing only the records a Continue run added (Discard during Continue).
- Unifying the tip and species-name normalisers (dots, §5.2); documented in the format table instead.

## 9. Owner decisions on the open questions (2026-10-31)

1. **The cap is a gate on the estimate, not a limit during a load.** The cap applies only to explorer queries, where Load is blocked while the estimate is over it. Own data (uploaded files, bundled examples) has no cap: the user stops a load whenever they like, and "Stop and keep" keeps what arrived. A cap stop on an explorer query can happen only when the estimate was low. That rare case keeps (a): "Continue up to {niceCapAbove(max(planned, fetched) + 1)}" raises the cap and resumes. No step may add a cap to file or example loads.
2. **A leftover tree is kept (a).** The tree card shows the live overlap with the loaded species, warns below 50 %, and offers Change and Remove.
3. **Example citations: fill what exists, otherwise use a placeholder.** S5 fills `citation` in `examples.json` from what the repo and `mapequation/bioregions-data` (README, source notes) document. Where nothing is found, the card and methods text say "Source: Infomap Bioregions example data". The owner completes the rest later.
