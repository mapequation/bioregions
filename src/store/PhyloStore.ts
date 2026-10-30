// Phylogeny tab state: match dataset species to Open Tree, find the clade (MRCA) and
// candidate trees, and load a pruned tree into TreeStore. Contract: spec section 4 of
// docs/superpowers/specs/2026-10-30-data-explorer-ui.md. Pure logic lives in
// src/store/phylo/ (matching, candidates, treeBuild).
import { makeAutoObservable, reaction, runInAction } from 'mobx';
import {
  fetchStudyTree,
  findStudyTrees,
  inducedSubtree,
  matchNames as matchOtolNames,
  mrca,
  type StudyTree,
  synthesisInfo,
} from '@/phylo/otol';
import { isAbortError, queryKey } from '@/sources';
import type { Clade, MatchStatus, NameMatchRow, ReqState, TreeCandidate, TreeSelection } from './explorer/types';
import {
  COVERAGE_CONCURRENCY,
  FEW_STUDY_TREES,
  MAX_COVERAGE_CHECKS,
  mapLimit,
  SYNTHETIC_ID,
  sortCandidates,
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
import { buildDatasetTree, coverageOf, type DatasetTree, datasetNewick, type TipJoin } from './phylo/treeBuild';
import type RootStore from './RootStore';

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
  candidates: TreeCandidate[] = [];
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

  private controller: AbortController | null = null;
  private lastKey: unknown = null;
  private inducedBroken: Record<string, string> = {};
  private newicks = new Map<string, Promise<string>>();
  private built = new Map<string, DatasetTree>();
  private disposers: (() => void)[] = [];

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;
    makeAutoObservable<
      this,
      'controller' | 'lastKey' | 'inducedBroken' | 'newicks' | 'built' | 'disposers'
    >(
      this,
      {
        rootStore: false,
        controller: false,
        lastKey: false,
        inducedBroken: false,
        newicks: false,
        built: false,
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

  /** Candidates after the Dated only filter; synthetic first, then by coverage (or year), then dated. */
  get visibleCandidates(): TreeCandidate[] {
    return sortCandidates(this.candidates, this.sort, this.datedOnly);
  }

  get selectedCandidate(): TreeCandidate | null {
    return this.candidates.find((c) => c.id === this.selectedId) ?? null;
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
    this.selection = null;
    this.error = null;
    this.datasetNames = [];
    this.brokenTaxa = [];
    this.studyTreesFound = 0;
    this.inducedBroken = {};
    this.newicks = new Map();
    this.built = new Map();
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
    runInAction(() => {
      this.brokenTaxa = this.built.get(SYNTHETIC_ID)?.broken ?? [];
      this.studyTreesFound = allStudies.length;
      this.candidates = [synthetic, ...studies];
      this.candidatesState = 'ready';
    });
    if (this.selectedId === null) {
      this.select(synthetic.coverageState === 'ready' ? SYNTHETIC_ID : (studies[0]?.id ?? SYNTHETIC_ID));
    }

    // Exact coverage runs in the background; rows show "checking…" until it is done.
    void this.checkCoverage(studies, signal);
  }

  /** Fetch study trees (COVERAGE_CONCURRENCY at a time) and count dataset species among their tips. */
  private async checkCoverage(studies: TreeCandidate[], signal: AbortSignal) {
    const join = this.tipJoin;
    await mapLimit(studies, COVERAGE_CONCURRENCY, async (candidate) => {
      if (signal.aborted) return;
      try {
        const newick = await this.newick(candidate, signal);
        const { matched, hasBranchLengths } = coverageOf(newick, join);
        this.updateCandidate(candidate.id, { matched, hasBranchLengths });
      } catch (error) {
        if (isAbortError(error) || signal.aborted) return;
        this.updateCandidate(candidate.id, null);
      }
    });
  }

  /** Record exact coverage (null: failed) and the actual branch lengths of a study tree. */
  private updateCandidate(id: string, result: { matched: number; hasBranchLengths: boolean } | null) {
    const candidate = this.candidates.find((c) => c.id === id);
    if (!candidate) return;
    if (!result) {
      candidate.coverageState = 'error';
      return;
    }
    candidate.coverage = { matched: result.matched, total: this.datasetNames.length };
    candidate.coverageState = 'ready';
    if (!result.hasBranchLengths) candidate.branchLengths = 'none';
    else if (candidate.branchLengths === 'none') candidate.branchLengths = 'other';
  }

  /** Newick of a candidate, fetched once (synthetic: from the induced subtree). */
  private newick(candidate: TreeCandidate, signal: AbortSignal): Promise<string> {
    const cached = this.newicks.get(candidate.id);
    if (cached) return cached;
    if (candidate.kind !== 'study' || !candidate.studyId || !candidate.treeId) {
      return Promise.reject(new Error('The synthetic tree is not available'));
    }
    const promise = fetchStudyTree(candidate.studyId, candidate.treeId, signal);
    this.newicks.set(candidate.id, promise);
    promise.catch(() => {
      if (this.newicks.get(candidate.id) === promise) this.newicks.delete(candidate.id);
    });
    return promise;
  }

  private buildTree(candidate: TreeCandidate, newick: string): DatasetTree {
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

  private async datasetTree(candidate: TreeCandidate): Promise<DatasetTree> {
    const signal = this.controller?.signal ?? new AbortController().signal;
    return this.buildTree(candidate, await this.newick(candidate, signal));
  }

  /** Select a candidate tree and compute its kept, absent and pruned counts. */
  select(id: string) {
    const candidate = this.candidates.find((c) => c.id === id);
    if (!candidate) return;
    this.selectedId = id;
    this.selection = null;
    this.datasetTree(candidate).then(
      (built) =>
        runInAction(() => {
          if (this.selectedId !== id) return;
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

  /** Set the candidate sort order. */
  setSort(sort: 'coverage' | 'year') {
    this.sort = sort;
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
