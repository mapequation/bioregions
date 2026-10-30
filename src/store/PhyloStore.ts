// Phylogeny tab state: match dataset species to Open Tree, find the clade (MRCA) and
// candidate trees, and load a pruned tree into TreeStore. Contract: spec section 4 of
// docs/superpowers/specs/2026-10-30-data-explorer-ui.md. Pure logic lives in
// src/store/phylo/ (matching, candidates, treeBuild).
import { makeAutoObservable, reaction, runInAction } from 'mobx';
import {
  fetchStudyTips,
  fetchStudyTree,
  findStudyTrees,
  inducedSubtree,
  matchNames as matchOtolNames,
  mrca,
  type StudyTree,
  type StudyTreeTips,
  synthesisInfo,
} from '@/phylo/otol';
import { isAbortError, queryKey } from '@/sources';
import type { Clade, MatchStatus, NameMatchRow, ReqState, TreeSelection } from './explorer/types';
import {
  arrangeRows,
  bestDatedCandidate,
  COVERAGE_CONCURRENCY,
  FEW_STUDY_TREES,
  initialOrder,
  MAX_COVERAGE_CHECKS,
  mapLimit,
  type PhyloCandidate,
  SYNTHETIC_ID,
  studyCandidates,
  syntheticCandidate,
  treeCitationText,
} from './phylo/candidates';
import {
  joinableRows,
  largestGenera,
  matchCounts,
  nameToDatasetMap,
  namesWithStatus,
  ottToDatasetMap,
  toMatchRows,
  uniqueNames,
} from './phylo/matching';
import { dropUnknownIds } from './phylo/dropUnknown';
import {
  buildDatasetTree,
  coverageOf,
  coverageOfTips,
  type DatasetTree,
  datasetNewick,
  type TipJoin,
  tipDisplayName,
} from './phylo/treeBuild';
import type RootStore from './RootStore';

/** A single coverage check (one study download) gives up after this long. */
export const COVERAGE_TIMEOUT_MS = 20_000;

class TimeoutError extends Error {
  override name = 'TimeoutError';
}

/** Run `task` with its own signal, aborted with `signal` or after `ms` (then rejects with TimeoutError). */
function withDeadline<T>(ms: number, signal: AbortSignal, task: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const inner = new AbortController();
  const onAbort = () => inner.abort();
  signal.addEventListener('abort', onAbort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new TimeoutError(`Timed out after ${Math.round(ms / 1000)} s`));
      inner.abort();
    }, ms);
  });
  return Promise.race([task(inner.signal), deadline]).finally(() => {
    clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
  });
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 120 ? `${message.slice(0, 119)}…` : message;
}

export default class PhyloStore {
  rootStore: RootStore;

  /** Where the species list comes from: the loaded data or the current query. */
  speciesSource: 'loaded' | 'query' | null = null;
  /** Name-matching progress, or null when not running. */
  matchProgress: { done: number; total: number } | null = null;
  /** One row per dataset species. */
  matches: NameMatchRow[] = [];
  /** Most recent common ancestor of the matched taxa. */
  clade: Clade | null = null;
  /** Synthetic tree plus study trees for the clade. */
  candidates: PhyloCandidate[] = [];
  /** Status of the candidate search. */
  candidatesState: ReqState = 'idle';
  /** Candidate table sort order. */
  sort: 'coverage' | 'year' = 'coverage';
  /** Show dated (time-calibrated) trees only. */
  datedOnly = false;
  /** Selected candidate id. */
  selectedId: string | null = null;
  /** Kept, absent and pruned counts for the selected candidate. */
  selection: TreeSelection | null = null;
  /** Status of loading the selected tree. */
  loadState: 'idle' | 'loading' | 'done' | 'error' = 'idle';
  /** The tree that was loaded into TreeStore. */
  loadedTree: { candidateId: string; tips: number; citation: string } | null = null;

  // --- Additive state (not in the spec table) -------------------------------------

  /** Status of the whole match -> clade -> candidates pipeline. */
  matchState: ReqState = 'idle';
  /** Last error (matching, candidates, selection or load), for the UI. */
  error: string | null = null;
  /** Dataset species the list was matched from (deduplicated, input order). */
  datasetNames: string[] = [];
  /** Dataset species that are not monophyletic in the synthetic tree, placed at their MRCA. */
  brokenTaxa: string[] = [];
  /** Study trees Open Tree found for the clade, before capping to MAX_COVERAGE_CHECKS rows. */
  studyTreesFound = 0;
  /** The loaded tree got Grafen branch lengths (it had none). */
  loadedGrafen = false;
  /**
   * Table row order (candidate ids). Fixed while coverage checks run so rows never
   * move under the cursor; re-sorted once when the checks finish and on a sort change.
   */
  rowOrder: string[] = [];
  /** Checked study trees with no dataset species, shown in a collapsed group. */
  noOverlapIds: string[] = [];
  /**
   * Why the current tree is selected: automatically ('default': the synthesis or first
   * tree; 'dated': the best dated tree once coverage is known) or by the user (a row
   * click or a load). Automatic picks are re-run when coverage checks finish.
   */
  selectionReason: 'default' | 'dated' | 'user' | null = null;
  /** Tips of the selected tree that are not in the dataset (readable names), or null while unknown. */
  selectionNotInData: string[] | null = null;

  private controller: AbortController | null = null;
  private lastKey: unknown = null;
  private inducedBroken: Record<string, string> = {};
  private newicks = new Map<string, Promise<string>>();
  private built = new Map<string, DatasetTree>();
  /** Tips of study trees read by the coverage check, by candidate id. */
  private tips = new Map<string, StudyTreeTips>();
  private disposers: (() => void)[] = [];

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;
    makeAutoObservable<
      this,
      'controller' | 'lastKey' | 'inducedBroken' | 'newicks' | 'built' | 'tips' | 'disposers'
    >(
      this,
      {
        rootStore: false,
        controller: false,
        lastKey: false,
        inducedBroken: false,
        newicks: false,
        built: false,
        tips: false,
        disposers: false,
      },
      { autoBind: true },
    );
    this.disposers.push(
      reaction(
        () => [this.tabActive, this.speciesKey] as const,
        ([active, key]) => {
          if (active && key !== this.lastKey) {
            this.lastKey = key;
            void this.matchNames();
          }
        },
        { fireImmediately: true, equals: (a, b) => a[0] === b[0] && a[1] === b[1] },
      ),
    );
  }

  dispose() {
    this.controller?.abort();
    for (const d of this.disposers) d();
    this.disposers = [];
  }

  /** The explorer is open on the Phylogeny tab. */
  get tabActive(): boolean {
    const explorer = this.rootStore.explorerStore;
    return explorer.isOpen && explorer.tab === 'phylogeny';
  }

  /** Occurrence data is loaded, so its species are matched (else the query's). */
  get hasLoadedSpecies(): boolean {
    const { speciesStore } = this.rootStore;
    return speciesStore.loaded && speciesStore.speciesMap.size > 0;
  }

  /** Changes when the species list to match changes (loaded map identity or query key). */
  private get speciesKey(): unknown {
    const { speciesStore, explorerStore } = this.rootStore;
    return this.hasLoadedSpecies ? speciesStore.speciesMap : `query:${queryKey(explorerStore.query)}`;
  }

  /** Matched, synonym and unmatched (incl. ambiguous) name counts. */
  get counts(): { matched: number; synonym: number; unmatched: number } {
    return matchCounts(this.matches);
  }

  private rowsOf(ids: string[]): PhyloCandidate[] {
    const byId = new Map(this.candidates.map((c) => [c.id, c]));
    return ids
      .map((id) => byId.get(id))
      .filter((c): c is PhyloCandidate => c !== undefined && (!this.datedOnly || c.branchLengths === 'time'));
  }

  /** Selectable table rows in display order (see rowOrder), after the Dated only filter. */
  get visibleCandidates(): PhyloCandidate[] {
    const grouped = new Set(this.noOverlapIds);
    return this.rowsOf(this.rowOrder.filter((id) => !grouped.has(id)));
  }

  /** Checked study trees with no overlap, after the Dated only filter (not selectable). */
  get noOverlapCandidates(): PhyloCandidate[] {
    return this.rowsOf(this.noOverlapIds);
  }

  get selectedCandidate(): PhyloCandidate | null {
    return this.candidates.find((c) => c.id === this.selectedId) ?? null;
  }

  get syntheticTree(): PhyloCandidate | null {
    return this.candidates.find((c) => c.kind === 'synthetic') ?? null;
  }

  /** Study trees whose coverage is checked (ready or failed) out of all study trees. */
  get coverageProgress(): { done: number; total: number } {
    const studies = this.candidates.filter((c) => c.kind === 'study');
    return { done: studies.filter((c) => c.coverageState !== 'pending').length, total: studies.length };
  }

  /** Coverage checks are still running. */
  get checkingCoverage(): boolean {
    const { done, total } = this.coverageProgress;
    return done < total;
  }

  /**
   * The current pick is automatic and coverage checks are still running, so a dated
   * tree may still replace it: loading now is offered as a secondary action.
   */
  get awaitingBestTree(): boolean {
    return this.checkingCoverage && this.selectionReason !== 'user';
  }

  /** The dated tree with the best coverage, when it covers at least 60 % of the dataset species. */
  get bestDated(): PhyloCandidate | null {
    if (this.checkingCoverage) return null;
    return bestDatedCandidate(this.candidates, this.datasetNames.length);
  }

  /**
   * The selected tree's absent dataset species, split into names Open Tree could not
   * match (or matched ambiguously) and matched species this tree does not contain.
   */
  get absentBreakdown(): { unmatched: string[]; notInTree: string[] } | null {
    if (!this.selection) return null;
    const status = new Map(this.matches.map((row) => [row.datasetName, row.status]));
    const unmatched: string[] = [];
    const notInTree: string[] = [];
    for (const name of this.selection.absentFromTree) {
      const s = status.get(name);
      if (s === 'unmatched' || s === 'ambiguous' || s === undefined) unmatched.push(name);
      else notInTree.push(name);
    }
    return { unmatched, notInTree };
  }

  /** Citation of the loaded tree, for the methods text. */
  get citationText(): string {
    const loaded = this.loadedTree;
    if (!loaded) return '';
    const kind = loaded.candidateId === SYNTHETIC_ID ? 'synthetic' : 'study';
    return treeCitationText({ kind, citation: loaded.citation }, loaded.tips, this.loadedGrafen);
  }

  /** Tree tip -> dataset species lookups from the current matches. */
  get tipJoin(): TipJoin {
    return { ottToDataset: ottToDatasetMap(this.matches), nameToDataset: nameToDatasetMap(this.matches) };
  }

  /**
   * Match the species list to Open Tree (TNRS, batches of 250), then find the clade
   * and the candidate trees and select the synthetic tree. Restarting aborts a run.
   */
  async matchNames(): Promise<void> {
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    const { signal } = controller;
    const current = () => this.controller === controller && !signal.aborted;
    this.resetResults();
    this.matchState = 'loading';

    try {
      const { speciesStore, explorerStore } = this.rootStore;
      const loaded = this.hasLoadedSpecies;
      const names = uniqueNames(loaded ? speciesStore.speciesMap.keys() : await explorerStore.querySpecies(signal));
      if (!current()) return;
      runInAction(() => {
        this.speciesSource = loaded ? 'loaded' : 'query';
        this.datasetNames = names;
        this.matchProgress = names.length > 0 ? { done: 0, total: names.length } : null;
      });
      if (names.length === 0) {
        runInAction(() => {
          this.matchState = 'ready';
        });
        return;
      }

      const results = await matchOtolNames(names, {
        signal,
        onProgress: (done, total) => {
          if (current()) runInAction(() => (this.matchProgress = { done, total }));
        },
      });
      if (!current()) return;
      const rows = toMatchRows(names, results);
      runInAction(() => {
        this.matches = rows;
        this.matchProgress = null;
      });

      await this.findCandidates(rows, signal);
      if (!current()) return;
      runInAction(() => {
        this.matchState = 'ready';
      });
    } catch (error) {
      if (!current() || isAbortError(error)) return;
      runInAction(() => {
        this.matchState = 'error';
        this.matchProgress = null;
        if (this.candidatesState === 'loading') this.candidatesState = 'error';
        this.error = errorMessage(error);
      });
    }
  }

  private resetResults() {
    this.matchProgress = null;
    this.matches = [];
    this.clade = null;
    this.candidates = [];
    this.candidatesState = 'idle';
    this.selectedId = null;
    this.selectionReason = null;
    this.selection = null;
    this.selectionNotInData = null;
    this.error = null;
    this.rowOrder = [];
    this.noOverlapIds = [];
    this.datasetNames = [];
    this.brokenTaxa = [];
    this.studyTreesFound = 0;
    this.inducedBroken = {};
    this.newicks = new Map();
    this.built = new Map();
    this.tips = new Map();
  }

  /** MRCA, synthetic induced subtree and study trees, then exact coverage per row. */
  private async findCandidates(rows: NameMatchRow[], signal: AbortSignal) {
    const ids = joinableRows(rows).map((row) => row.ottId);
    if (ids.length === 0) {
      runInAction(() => {
        this.candidatesState = 'ready';
      });
      return;
    }
    runInAction(() => {
      this.candidatesState = 'loading';
    });

    // mrca rejects the whole request when an id is not in the synthetic tree.
    const { result: ancestor } = await dropUnknownIds(ids, (keep) => mrca(keep, signal));
    const clade: Clade = {
      name: ancestor.name,
      rank: ancestor.rank || 'no rank',
      ottId: ancestor.ottId ?? 0,
      numTips: ancestor.numTips ?? 0,
    };
    runInAction(() => {
      this.clade = clade;
    });

    const soft = <T>(promise: Promise<T>, fallback: T): Promise<T> =>
      promise.catch((error) => {
        if (isAbortError(error) || signal.aborted) throw error;
        return fallback;
      });
    const [info, induced, cladeTrees] = await Promise.all([
      soft(synthesisInfo(signal), null),
      inducedSubtree(ids, signal).catch((error: unknown) => {
        if (isAbortError(error) || signal.aborted) throw error;
        return error instanceof Error ? error : new Error(String(error));
      }),
      soft(findStudyTrees({ ottId: ancestor.ottId, taxonName: ancestor.name }, signal), [] as StudyTree[]),
    ]);
    const lists: StudyTree[][] = [cladeTrees];
    if (cladeTrees.length < FEW_STUDY_TREES) {
      const genera = largestGenera(rows).filter((genus) => genus !== clade.name);
      lists.push(
        ...(await Promise.all(genera.map((genus) => soft(findStudyTrees({ taxonName: genus }, signal), [])))),
      );
    }

    const synthetic = syntheticCandidate(info);
    if (induced instanceof Error) {
      synthetic.coverageState = 'error';
    } else {
      this.newicks.set(SYNTHETIC_ID, Promise.resolve(induced.newick));
      this.inducedBroken = induced.broken;
      const built = this.buildTree(synthetic, induced.newick);
      synthetic.coverage = { matched: built.kept, total: rows.length };
      synthetic.coverageState = 'ready';
    }
    const allStudies = studyCandidates(lists);
    const studies = allStudies.slice(0, MAX_COVERAGE_CHECKS);
    const order = initialOrder([synthetic, ...studies]);
    runInAction(() => {
      this.brokenTaxa = this.built.get(SYNTHETIC_ID)?.broken ?? [];
      this.studyTreesFound = allStudies.length;
      this.candidates = [synthetic, ...studies];
      this.rowOrder = order;
      this.noOverlapIds = [];
      this.candidatesState = 'ready';
    });
    if (this.selectedId === null) {
      this.select(synthetic.coverageState === 'ready' ? SYNTHETIC_ID : (studies[0]?.id ?? SYNTHETIC_ID), 'default');
    }

    // Exact coverage runs in the background, in table order (dated trees first);
    // rows show "checking…" until it is done.
    const byId = new Map(studies.map((c) => [c.id, c]));
    const queue = order.map((id) => byId.get(id)).filter((c): c is PhyloCandidate => c !== undefined);
    void this.checkCoverage(queue, signal);
  }

  /**
   * Count dataset species among the tips of each study tree, one download per study
   * (COVERAGE_CONCURRENCY studies at a time, in table order: dated and newest first).
   * When all are checked, sort the table once and pre-select the best dated tree.
   */
  private async checkCoverage(studies: PhyloCandidate[], signal: AbortSignal) {
    const byStudy = new Map<string, PhyloCandidate[]>();
    for (const c of studies) {
      if (!c.studyId) continue;
      byStudy.set(c.studyId, [...(byStudy.get(c.studyId) ?? []), c]);
    }
    await mapLimit([...byStudy.entries()], COVERAGE_CONCURRENCY, ([studyId, trees]) =>
      this.checkStudy(studyId, trees, signal),
    );
    if (signal.aborted) return;
    this.finishCoverage();
  }

  /**
   * Coverage of one study's trees: from the study's tips (fast, parallel, cached), else
   * from each tree's Newick via the API. Each download times out after COVERAGE_TIMEOUT_MS.
   */
  private async checkStudy(studyId: string, trees: PhyloCandidate[], signal: AbortSignal) {
    const join = this.tipJoin;
    let tips: Record<string, StudyTreeTips> | null = null;
    try {
      tips = await withDeadline(COVERAGE_TIMEOUT_MS, signal, (s) => fetchStudyTips(studyId, s, COVERAGE_TIMEOUT_MS));
    } catch (error) {
      if (isAbortError(error) || signal.aborted) return;
      if (error instanceof TimeoutError) {
        for (const c of trees) this.updateCandidate(c.id, 'timeout');
        return;
      }
    }
    for (const candidate of trees) {
      if (signal.aborted) return;
      const treeTips = candidate.treeId ? tips?.[candidate.treeId] : undefined;
      if (treeTips) {
        const { kept, hasBranchLengths } = coverageOfTips(treeTips, join);
        const matched = kept.size;
        this.tips.set(candidate.id, treeTips);
        this.updateCandidate(candidate.id, { matched, hasBranchLengths });
        continue;
      }
      try {
        const newick = await withDeadline(COVERAGE_TIMEOUT_MS, signal, (s) => this.newick(candidate, s));
        const { matched, hasBranchLengths } = coverageOf(newick, join);
        this.updateCandidate(candidate.id, { matched, hasBranchLengths });
      } catch (error) {
        if (isAbortError(error) || signal.aborted) return;
        this.updateCandidate(candidate.id, error instanceof TimeoutError ? 'timeout' : 'failed');
      }
    }
  }

  /** Check a study tree's coverage again after it failed or timed out. */
  async retryCoverage(id: string): Promise<void> {
    const candidate = this.candidates.find((c) => c.id === id);
    const signal = this.controller?.signal;
    if (!candidate?.studyId || candidate.coverageState === 'pending' || !signal || signal.aborted) return;
    candidate.coverageState = 'pending';
    candidate.coverageError = undefined;
    await this.checkStudy(candidate.studyId, [candidate], signal);
    if (signal.aborted || this.checkingCoverage) return;
    this.finishCoverage();
  }

  /** All coverage checks are done: re-sort once, keeping a user's pick in place, and pre-select. */
  private finishCoverage() {
    const userPick = this.selectionReason === 'user' ? this.selectedId : null;
    this.arrange(userPick);
    if (this.selectionReason !== 'user') {
      const best = this.bestDated;
      if (best && best.id !== this.selectedId) this.select(best.id, 'dated');
    }
  }

  /** Lay out the rows for the current sort; `pinId` keeps its visible position. */
  private arrange(pinId: string | null) {
    const previous = this.visibleCandidates.map((c) => c.id);
    const datedOnly = this.datedOnly;
    const byId = new Map(this.candidates.map((c) => [c.id, c]));
    const layout = arrangeRows(
      this.candidates,
      this.sort,
      pinId
        ? { id: pinId, previous, visible: (id) => !datedOnly || byId.get(id)?.branchLengths === 'time' }
        : null,
    );
    this.rowOrder = layout.order;
    this.noOverlapIds = layout.noOverlap;
  }

  /** Record exact coverage (or why it failed) and the actual branch lengths of a study tree. */
  private updateCandidate(
    id: string,
    result: { matched: number; hasBranchLengths: boolean } | 'timeout' | 'failed',
  ) {
    // Row order is not touched here: rows keep their place until all checks finish.
    const candidate = this.candidates.find((c) => c.id === id);
    if (!candidate) return;
    if (typeof result === 'string') {
      candidate.coverageState = 'error';
      candidate.coverageError = result;
      return;
    }
    candidate.coverageError = undefined;
    candidate.coverage = { matched: result.matched, total: this.datasetNames.length };
    candidate.coverageState = 'ready';
    if (!result.hasBranchLengths) candidate.branchLengths = 'none';
    else if (candidate.branchLengths === 'none') candidate.branchLengths = 'other';
  }

  /** Newick of a candidate, fetched once (synthetic: from the induced subtree). */
  private newick(candidate: PhyloCandidate, signal: AbortSignal): Promise<string> {
    const cached = this.newicks.get(candidate.id);
    if (cached) return cached;
    if (candidate.kind !== 'study' || !candidate.studyId || !candidate.treeId) {
      return Promise.reject(new Error('The synthetic tree is not available'));
    }
    const promise = fetchStudyTree(candidate.studyId, candidate.treeId, signal, 'ot:ottId', {
      timeoutMs: COVERAGE_TIMEOUT_MS,
      retries: 1,
    });
    this.newicks.set(candidate.id, promise);
    promise.catch(() => {
      if (this.newicks.get(candidate.id) === promise) this.newicks.delete(candidate.id);
    });
    return promise;
  }

  private buildTree(candidate: PhyloCandidate, newick: string): DatasetTree {
    const cached = this.built.get(candidate.id);
    if (cached) return cached;
    const built = buildDatasetTree(
      newick,
      this.tipJoin,
      this.datasetNames,
      candidate.kind === 'synthetic' ? this.inducedBroken : {},
    );
    this.built.set(candidate.id, built);
    return built;
  }

  private async datasetTree(candidate: PhyloCandidate): Promise<DatasetTree> {
    const signal = this.controller?.signal ?? new AbortController().signal;
    return this.buildTree(candidate, await this.newick(candidate, signal));
  }

  /**
   * Select a candidate tree and compute its kept, absent and pruned counts. A user's
   * pick ('user', the default) is never replaced by the automatic dated pre-selection.
   */
  select(id: string, reason: 'default' | 'dated' | 'user' = 'user') {
    const candidate = this.candidates.find((c) => c.id === id);
    if (!candidate) return;
    this.selectionReason = reason;
    if (id === this.selectedId && this.selection) return;
    this.selectedId = id;
    this.selection = null;
    this.selectionNotInData = null;

    // A study tree read by the coverage check is summarised from its tips right away;
    // its Newick (needed to load it) is fetched in the background.
    const tips = this.tips.get(id);
    if (tips) {
      const { kept, notInData } = coverageOfTips(tips, this.tipJoin);
      this.selection = {
        kept: kept.size,
        absentFromTree: this.datasetNames.filter((name) => !kept.has(name)),
        pruned: notInData.length,
        broken: [],
      };
      this.selectionNotInData = notInData;
      this.datasetTree(candidate).catch(() => undefined);
      return;
    }

    this.datasetTree(candidate).then(
      (built) =>
        runInAction(() => {
          if (this.selectedId !== id) return;
          this.selectionNotInData = built.notInData.map(tipDisplayName);
          this.selection = {
            kept: built.kept,
            absentFromTree: built.absentFromTree,
            pruned: built.pruned,
            broken: built.broken,
          };
        }),
      (error: unknown) => {
        if (isAbortError(error)) return;
        runInAction(() => {
          if (this.selectedId === id) this.error = errorMessage(error);
        });
      },
    );
  }

  /** Set the candidate sort order and re-sort the rows (an explicit change may move rows). */
  setSort(sort: 'coverage' | 'year') {
    this.sort = sort;
    this.arrange(null);
  }

  /** Show only dated trees. */
  setDatedOnly(datedOnly: boolean) {
    this.datedOnly = datedOnly;
  }

  /**
   * Newline-separated dataset names with a status, for copying. 'unmatched'
   * includes ambiguous names (as the Unmatched count does).
   */
  copyList(status: MatchStatus): string {
    return namesWithStatus(this.matches, status);
  }

  /** Relabel, prune and load the selected tree, then re-run Infomap. */
  async loadSelected(): Promise<void> {
    const candidate = this.selectedCandidate;
    if (!candidate) return;
    // Loading is the user's choice: finishing coverage checks no longer changes the pick.
    this.selectionReason = 'user';
    this.loadState = 'loading';
    this.error = null;
    try {
      const built = await this.datasetTree(candidate);
      const { newick, grafen } = datasetNewick(built);
      const { treeStore, infomapStore, speciesStore, mapStore } = this.rootStore;
      treeStore.loadString(newick);
      infomapStore.setIncludeTree(true);
      runInAction(() => {
        this.loadedTree = { candidateId: candidate.id, tips: built.kept, citation: candidate.citation };
        this.loadedGrafen = grafen;
      });
      if (speciesStore.loaded) {
        await infomapStore.run();
        mapStore.setRenderType('bioregions');
        mapStore.render();
      }
      runInAction(() => {
        this.loadState = 'done';
      });
    } catch (error) {
      runInAction(() => {
        this.loadState = 'error';
        this.error = errorMessage(error);
      });
    }
  }
}
