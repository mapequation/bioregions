import { observable, when } from 'mobx';
import { describe, expect, it, vi } from 'vitest';
import * as otol from '@/phylo/otol';
import { defaultQuery } from '@/sources';
import PhyloStore from '../PhyloStore';
import type RootStore from '../RootStore';

vi.mock('@/phylo/otol', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/phylo/otol')>();
  return {
    ...actual,
    matchNames: vi.fn(),
    mrca: vi.fn(),
    inducedSubtree: vi.fn(),
    findStudyTrees: vi.fn(),
    fetchStudyTree: vi.fn(),
    fetchStudyTips: vi.fn(),
    synthesisInfo: vi.fn(),
  };
});

const names = ['Callithrix jacchus', 'Callithrix penicillata', 'Mico argentatus', 'Saguinus oedipus', 'Fakeus name'];
const ott: Record<string, number> = {
  'Callithrix jacchus': 1,
  'Callithrix penicillata': 2,
  'Mico argentatus': 3,
  'Saguinus oedipus': 4,
};

function mockOtol() {
  vi.mocked(otol.matchNames).mockImplementation(async (input, opts) => {
    opts?.onProgress?.(input.length, input.length);
    return input.map((name) => ({
      input: name,
      ottId: ott[name],
      ottName: name === 'Mico argentatus' ? 'Callithrix argentata' : ott[name] ? name : undefined,
      isSynonym: name === 'Mico argentatus',
      isApproximate: false,
    }));
  });
  vi.mocked(otol.mrca).mockResolvedValue({ name: 'Callitrichidae', ottId: 99, rank: 'family', numTips: 60, isTaxon: true });
  vi.mocked(otol.synthesisInfo).mockResolvedValue({ synthId: 'opentree15.1', citation: 'OTOL citation.' });
  vi.mocked(otol.inducedSubtree).mockResolvedValue({
    newick: '((ott1,ott2)mrcaott1ott2,ott4)ott99;',
    broken: { ott3: 'mrcaott1ott2' },
    missing: [],
  });
  vi.mocked(otol.findStudyTrees).mockImplementation(async ({ taxonName }) =>
    taxonName === 'Callitrichidae'
      ? [
          {
            studyId: 'ot_1',
            treeId: 'tree1',
            reference: 'Perelman, P., et al. (2011). A molecular phylogeny of living primates.',
            year: 2011,
            isDated: true,
            branchLengthMode: 'ot:time',
          },
        ]
      : [],
  );
  vi.mocked(otol.fetchStudyTree).mockResolvedValue('((1:2,4:2):1,(77:1,3:1):2);');
  // No phylesystem file: coverage falls back to the API Newick.
  vi.mocked(otol.fetchStudyTips).mockRejectedValue(new Error('no study file'));
}

function fakeRoot() {
  const explorerStore = observable(
    { isOpen: false, tab: 'occurrences', query: defaultQuery(), querySpecies: vi.fn(async () => names) },
    { querySpecies: false },
  );
  const speciesStore = observable({ loaded: false, speciesMap: new Map<string, unknown>() }, { speciesMap: observable.ref });
  const root = {
    explorerStore,
    speciesStore,
    treeStore: { loadString: vi.fn() },
    infomapStore: { setIncludeTree: vi.fn(), run: vi.fn(async () => {}) },
    mapStore: { setRenderType: vi.fn(), render: vi.fn() },
  };
  return root;
}

describe('PhyloStore', () => {
  it('matches, finds candidates and loads a pruned tree', async () => {
    mockOtol();
    const root = fakeRoot();
    const store = new PhyloStore(root as unknown as RootStore);
    expect(store.matchState).toBe('idle');

    // Opening the Phylogeny tab matches the query species automatically.
    root.explorerStore.isOpen = true;
    root.explorerStore.tab = 'phylogeny';
    await when(() => store.candidates.every((c) => c.coverageState !== 'pending') && store.matchState === 'ready');

    expect(store.speciesSource).toBe('query');
    expect(store.counts).toEqual({ matched: 3, synonym: 1, unmatched: 1 });
    expect(store.copyList('unmatched')).toBe('Fakeus name');
    expect(store.clade).toEqual({ name: 'Callitrichidae', rank: 'family', ottId: 99, numTips: 60 });
    expect(store.brokenTaxa).toEqual(['Mico argentatus']);
    expect(store.visibleCandidates.map((c) => [c.id, c.coverage?.matched])).toEqual([
      ['synthetic', 4],
      ['ot_1@tree1', 3],
    ]);
    expect(store.candidates[0].synthVersion).toBe('v15.1');

    // The dated tree covers 3 of 5 species (>= 60 %), so it replaces the synthesis default.
    await when(() => store.selection !== null && store.selectedId === 'ot_1@tree1');
    expect(store.selectionReason).toBe('dated');
    expect(store.preselectedDated).toBe(true);
    expect(store.coverageProgress).toEqual({ done: 1, total: 1 });
    expect(store.checkingCoverage).toBe(false);

    store.select('synthetic');
    expect(store.selectionReason).toBe('user');
    expect(store.preselectedDated).toBe(false);
    await when(() => store.selection !== null);
    expect(store.selection).toEqual({ kept: 4, absentFromTree: ['Fakeus name'], pruned: 0, broken: ['Mico argentatus'] });
    expect(store.absentBreakdown).toEqual({ unmatched: ['Fakeus name'], notInTree: [] });

    store.setDatedOnly(true);
    expect(store.visibleCandidates.map((c) => c.id)).toEqual(['ot_1@tree1']);
    store.select('ot_1@tree1', 'dated');
    await when(() => store.selection !== null);
    expect(store.selection?.pruned).toBe(1);

    root.speciesStore.loaded = false;
    await store.loadSelected();
    expect(store.loadState).toBe('done');
    // Loading makes the pick the user's, but it is still shown as the best dated match.
    expect(store.selectionReason).toBe('user');
    expect(store.preselectedDated).toBe(true);
    const newick = root.treeStore.loadString.mock.calls[0][0] as string;
    expect(newick).toContain('Mico_argentatus:');
    expect(newick).not.toContain("'");
    expect(root.infomapStore.setIncludeTree).toHaveBeenCalledWith(true);
    expect(root.infomapStore.run).not.toHaveBeenCalled();
    expect(store.loadedTree).toMatchObject({ candidateId: 'ot_1@tree1', tips: 3 });
    expect(store.citationText).toMatch(/Perelman/);
    expect(store.citationText).not.toMatch(/Grafen/);
    expect(vi.mocked(otol.fetchStudyTree)).toHaveBeenCalledTimes(1);
  });

  it('re-matches loaded species and runs Infomap after loading the synthetic tree', async () => {
    mockOtol();
    const root = fakeRoot();
    root.explorerStore.isOpen = true;
    root.explorerStore.tab = 'phylogeny';
    const store = new PhyloStore(root as unknown as RootStore);
    await when(() => store.matchState === 'ready');
    root.speciesStore.speciesMap = new Map(names.slice(0, 4).map((n) => [n, {}]));
    root.speciesStore.loaded = true;
    await when(
      () => store.speciesSource === 'loaded' && store.matchState === 'ready' && store.selectionReason === 'dated',
    );
    expect(store.matches).toHaveLength(4);
    store.select('synthetic');
    await when(() => store.selection !== null);
    await store.loadSelected();
    expect(root.infomapStore.run).toHaveBeenCalled();
    expect(root.mapStore.setRenderType).toHaveBeenCalledWith('bioregions');
    expect(store.citationText).toMatch(/Grafen/);
    store.dispose();
  });

  it('keeps row order while coverage is checked and never replaces a user pick', async () => {
    mockOtol();
    const studies = [
      { studyId: 'ot_1', treeId: 'tree1', reference: 'Perelman, P., et al. (2011). Primates.', year: 2011, isDated: true, branchLengthMode: 'ot:time' },
      { studyId: 'ot_2', treeId: 'tree2', reference: 'Upham, N., et al. (2019). Mammals.', year: 2019, isDated: true, branchLengthMode: 'ot:time' },
      { studyId: 'ot_3', treeId: 'tree3', reference: 'Del Risco, A., et al. (2024). Bats.', year: 2024, isDated: false },
    ];
    vi.mocked(otol.findStudyTrees).mockImplementation(async ({ taxonName }) => (taxonName === 'Callitrichidae' ? studies : []));
    const gates: Record<string, () => void> = {};
    const trees: Record<string, string> = {
      tree1: '((1:2,4:2):1,(77:1,3:1):2);',
      tree2: '((1:1,2:1):1,(4:1,3:1):1);',
      tree3: '((70:1,71:1):1,72:2);',
    };
    vi.mocked(otol.fetchStudyTree).mockImplementation(
      (_study, treeId) => new Promise((resolve) => (gates[treeId] = () => resolve(trees[treeId]))),
    );
    const root = fakeRoot();
    root.explorerStore.isOpen = true;
    root.explorerStore.tab = 'phylogeny';
    const store = new PhyloStore(root as unknown as RootStore);
    await vi.waitFor(() => expect(Object.keys(gates)).toHaveLength(3));

    // Before coverage is known: synthesis, dated trees newest first, then the rest.
    const initial = ['synthetic', 'ot_2@tree2', 'ot_1@tree1', 'ot_3@tree3'];
    expect(store.visibleCandidates.map((c) => c.id)).toEqual(initial);
    expect(store.visibleCandidates[1].title).toBe('Upham et al. 2019');
    expect(store.coverageProgress).toEqual({ done: 0, total: 3 });

    store.select('ot_1@tree1');
    gates.tree3();
    gates.tree1();
    await when(() => store.coverageProgress.done === 2);
    expect(store.visibleCandidates.map((c) => c.id)).toEqual(initial);

    gates.tree2();
    await when(() => !store.checkingCoverage && store.noOverlapIds.length === 1);
    // Sorted once by coverage; the user's pick keeps its row and selection.
    expect(store.visibleCandidates.map((c) => c.id)).toEqual(['synthetic', 'ot_2@tree2', 'ot_1@tree1']);
    expect(store.noOverlapCandidates.map((c) => c.id)).toEqual(['ot_3@tree3']);
    expect(store.selectedId).toBe('ot_1@tree1');
    expect(store.selectionReason).toBe('user');
    expect(store.bestDated?.id).toBe('ot_2@tree2');
    store.dispose();
  });

  it('counts coverage from study tips, waits for checks before preferring a load, and retries failures', async () => {
    mockOtol();
    vi.mocked(otol.fetchStudyTips).mockClear();
    const studies = [
      { studyId: 'ot_1', treeId: 'tree1', reference: 'Perelman, P., et al. (2011). Primates.', year: 2011, isDated: true, branchLengthMode: 'ot:time' },
      { studyId: 'ot_1', treeId: 'tree2', reference: 'Perelman, P., et al. (2011). Primates.', year: 2011, isDated: false },
      { studyId: 'ot_2', treeId: 'tree9', reference: 'Upham, N., et al. (2019). Mammals.', year: 2019, isDated: true, branchLengthMode: 'ot:time' },
    ];
    vi.mocked(otol.findStudyTrees).mockImplementation(async ({ taxonName }) => (taxonName === 'Callitrichidae' ? studies : []));
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    vi.mocked(otol.fetchStudyTips).mockImplementation(async (studyId) => {
      if (studyId === 'ot_2') throw new Error('offline');
      await gate;
      return {
        tree1: { labels: ['1', '4', '77', '3'], names: ['Callithrix jacchus', 'Saguinus oedipus', 'Homo sapiens', 'Callithrix argentata'], hasBranchLengths: true },
        tree2: { labels: ['1', '2'], names: ['Callithrix jacchus', 'Callithrix penicillata'], hasBranchLengths: false },
      };
    });
    vi.mocked(otol.fetchStudyTree).mockImplementation(async (_study, treeId) => {
      if (treeId === 'tree9') throw new Error('HTTP 500');
      return '((1:2,4:2):1,(77:1,3:1):2);';
    });
    const root = fakeRoot();
    root.explorerStore.isOpen = true;
    root.explorerStore.tab = 'phylogeny';
    const store = new PhyloStore(root as unknown as RootStore);
    await when(() => store.candidatesState === 'ready' && store.selection !== null);

    // One download per study; the synthesis is pre-selected but may still be replaced.
    expect(vi.mocked(otol.fetchStudyTips)).toHaveBeenCalledTimes(2);
    expect(store.selectedId).toBe('synthetic');
    expect(store.awaitingBestTree).toBe(true);

    release();
    await when(() => !store.checkingCoverage);
    expect(store.candidates.find((c) => c.id === 'ot_1@tree1')?.coverage?.matched).toBe(3);
    expect(store.candidates.find((c) => c.id === 'ot_1@tree2')?.branchLengths).toBe('none');
    const failed = store.candidates.find((c) => c.id === 'ot_2@tree9');
    expect(failed).toMatchObject({ coverageState: 'error', coverageError: 'failed' });
    expect(store.awaitingBestTree).toBe(false);
    // The study tree with 3 of 5 species is dated and pre-selected after the checks.
    await when(() => store.selectedId === 'ot_1@tree1' && store.selectionNotInData !== null);
    expect(store.selectionReason).toBe('dated');
    expect(store.selectionNotInData).toEqual(['Homo sapiens']);

    // A retry runs the check again for that row only.
    vi.mocked(otol.fetchStudyTips).mockResolvedValue({
      tree9: { labels: ['1', '2', '3', '4'], names: ['a', 'b', 'c', 'd'], hasBranchLengths: true },
    });
    await store.retryCoverage('ot_2@tree9');
    expect(store.candidates.find((c) => c.id === 'ot_2@tree9')).toMatchObject({ coverageState: 'ready', coverage: { matched: 4 } });
    // Still automatic, so the better dated tree replaces the pick.
    expect(store.selectedId).toBe('ot_2@tree9');

    // Loading counts as the user's choice.
    store.select('synthetic', 'default');
    root.speciesStore.loaded = false;
    vi.mocked(otol.fetchStudyTree).mockResolvedValue('((1:2,4:2):1,(77:1,3:1):2);');
    await store.loadSelected();
    expect(store.selectionReason).toBe('user');
    store.dispose();
  });

  it('shows the synthesis row and offers it as soon as the clade is known, while trees are searched', async () => {
    mockOtol();
    let release: (trees: otol.StudyTree[]) => void = () => undefined;
    vi.mocked(otol.findStudyTrees).mockImplementation(({ taxonName }) =>
      taxonName === 'Callitrichidae'
        ? new Promise<otol.StudyTree[]>((resolve) => (release = resolve))
        : Promise.resolve([]),
    );
    const root = fakeRoot();
    const store = new PhyloStore(root as unknown as RootStore);
    root.explorerStore.isOpen = true;
    root.explorerStore.tab = 'phylogeny';
    await when(() => store.selection != null);

    expect(store.candidatesState).toBe('loading');
    expect(store.searchingTrees).toBe(true);
    expect(store.awaitingBestTree).toBe(true);
    expect(store.rowGroups.map((g) => g.lead.id)).toEqual(['synthetic']);
    expect(store.selectedId).toBe('synthetic');
    expect(store.syntheticTree?.synthVersion).toBe('v15.1');

    release([]);
    await when(() => store.matchState === 'ready');
    expect(store.searchingTrees).toBe(false);
    expect(store.checkingCoverage).toBe(false);
  });
});
