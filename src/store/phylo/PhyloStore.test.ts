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

    await when(() => store.selection !== null);
    expect(store.selectedId).toBe('synthetic');
    expect(store.selection).toEqual({ kept: 4, absentFromTree: ['Fakeus name'], pruned: 0, broken: ['Mico argentatus'] });

    store.setDatedOnly(true);
    expect(store.visibleCandidates.map((c) => c.id)).toEqual(['ot_1@tree1']);
    store.select('ot_1@tree1');
    await when(() => store.selection !== null);
    expect(store.selection?.pruned).toBe(1);

    root.speciesStore.loaded = false;
    await store.loadSelected();
    expect(store.loadState).toBe('done');
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
    await when(() => store.speciesSource === 'loaded' && store.matchState === 'ready' && store.selection !== null);
    expect(store.matches).toHaveLength(4);
    await store.loadSelected();
    expect(root.infomapStore.run).toHaveBeenCalled();
    expect(root.mapStore.setRenderType).toHaveBeenCalledWith('bioregions');
    expect(store.citationText).toMatch(/Grafen/);
    store.dispose();
  });
});
