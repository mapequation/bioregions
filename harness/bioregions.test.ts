/**
 * Pins the Infomap tree -> bioregions conversion (`InfomapStore.createBioregions`) on
 * hand-built `json` / `json_states` trees, so an Infomap upgrade that changes the
 * output shape or its types cannot silently change which cells and species end up in
 * which bioregion. Networks come from the production builders via the stub root.
 */

import type { Module, StateTree, Tree } from '@mapequation/infomap';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GeoFeature } from '../src/store/SpeciesStore';
import { createPointFeature } from '../src/store/SpeciesStore';
import type { BioregionsNetwork, BioregionsStateNetwork } from '../src/store/InfomapStore';
import { Bioregion } from '../src/store/InfomapStore';
import { parseTree, prepareTree } from '../src/utils/tree';
import { buildTreeNodeMap, createHeadlessRoot, setOccurrences } from './stubRoot';

const NEWICK = '((A: 0.6, B: 0.6): 0.2, ((C: 0.2, D: 0.2): 0.2, (E: 0.1, F: 0.1): 0.3): 0.4);';

/** West species A, B live at lon < 0, east species C, D at lon > 0. */
const RANGES: Record<string, [number, number, number, number]> = {
  A: [-40, -10, -20, 10],
  B: [-30, 0, -10, 20],
  C: [10, -10, 30, 10],
  D: [20, 0, 40, 20],
};
const SPECIES_MODULE: Record<string, number> = { A: 1, B: 1, C: 2, D: 2 };

function occurrences(): GeoFeature[] {
  const features: GeoFeature[] = [];
  for (const [name, [x1, y1, x2, y2]] of Object.entries(RANGES)) {
    for (let x = x1 + 0.5; x < x2; x += 2) {
      for (let y = y1 + 0.5; y < y2; y += 2) {
        features.push(createPointFeature([x, y], { name }));
      }
    }
  }
  return features;
}

function setup(params: Record<string, unknown>, withPhyloTree: boolean) {
  const root = createHeadlessRoot('test');
  Object.assign(root.speciesStore.binner, { minCellCapacity: 1, maxCellCapacity: 4 });
  setOccurrences(root, occurrences());
  if (withPhyloTree) {
    const tree = prepareTree(parseTree(NEWICK));
    root.treeStore.tree = tree;
    root.treeStore.treeNodeMap = buildTreeNodeMap(tree);
  }
  for (const name of Object.keys(RANGES)) {
    root.speciesStore.speciesMap.set(name, { name, bioregionId: 0 });
  }
  const store = root.infomapStore;
  Object.assign(store, params);
  const network = store.createNetwork();
  store.setNetwork(network);
  return { root, store, network, cells: root.speciesStore.binner.cells };
}

function header(numTopModules: number, args = ''): Omit<Tree, 'nodes'> {
  return {
    version: '2.16.0',
    args,
    startedAt: '',
    completedIn: 0,
    codelength: 1,
    numLevels: 3,
    numTopModules,
    relativeCodelengthSavings: 0,
    directed: false,
    flowModel: 'undirected',
    higherOrder: false,
    modules: [] as Module[],
  };
}

/** Top module 1 = west (cell x1 < 0), 2 = east; the second level splits each by latitude. */
function cellModules(cell: { x1: number; y1: number }): [number, number] {
  const top = cell.x1 < 0 ? 1 : 2;
  return [top, 2 * (top - 1) + (cell.y1 < 0 ? 1 : 2)];
}

beforeEach(() => {
  vi.restoreAllMocks();
  for (const method of ['log', 'time', 'timeEnd', 'warn'] as const) {
    vi.spyOn(console, method).mockImplementation(() => { });
  }
  // Statistics need full Species records; this suite pins only the assignment.
  vi.spyOn(Bioregion.prototype, 'calcStats').mockImplementation(() => { });
});

describe('createBioregions from a first-order json tree', () => {
  function buildTree(network: BioregionsNetwork, cells: { x1: number; y1: number }[]) {
    const flow = 1 / network.nodes.length;
    const nodes: Tree['nodes'] = network.nodes.map((node) => {
      const isCell = node.id < network.bipartiteStartId;
      const modules: [number, number] = isCell
        ? cellModules(cells[node.id])
        : [SPECIES_MODULE[node.name ?? ''], 2 * SPECIES_MODULE[node.name ?? ''] - 1];
      return { id: node.id, path: [modules[0], 1], modules, name: node.name, flow, mec: 0 };
    });
    return { ...header(2), bipartiteStartId: network.bipartiteStartId, nodes };
  }

  it.each([
    { moduleLevel: 0, numBioregions: 2 },
    { moduleLevel: 1, numBioregions: 4 },
  ])('assigns cells and species on module level $moduleLevel', ({ moduleLevel, numBioregions }) => {
    const { root, store, network, cells } = setup({ includeTreeInNetwork: false }, false);
    const bipartite = network as BioregionsNetwork;
    expect(bipartite.bipartiteStartId).toBe(cells.length);
    store.moduleLevel = moduleLevel;

    store.createBioregions(buildTree(bipartite, cells));

    expect(store.error).toBeUndefined();
    expect(store.bioregions).toHaveLength(numBioregions);
    expect(store.bioregions.map((b) => b.bioregionId)).toEqual(
      Array.from({ length: numBioregions }, (_, i) => i + 1),
    );
    for (const cell of cells) {
      expect(cell.bioregionId).toBe(cellModules(cell)[moduleLevel]);
    }
    const numCells = store.bioregions.reduce((sum, b) => sum + b.numGridCells, 0);
    expect(numCells).toBe(cells.length);
    const totalFlow = store.bioregions.reduce((sum, b) => sum + b.flow, 0);
    expect(totalFlow).toBeCloseTo(1, 12);

    if (moduleLevel === 0) {
      expect(store.bioregions[0].species.sort()).toEqual(['A', 'B']);
      expect(store.bioregions[1].species.sort()).toEqual(['C', 'D']);
      for (const [name, module] of Object.entries(SPECIES_MODULE)) {
        expect(root.speciesStore.speciesMap.get(name)).toMatchObject({ bioregionId: module });
      }
    }
  });

  it('reports an error instead of guessing when nodes have no modules', () => {
    const { store, network, cells } = setup({ includeTreeInNetwork: false }, false);
    const tree = buildTree(network as BioregionsNetwork, cells);
    tree.nodes = tree.nodes.map(({ modules: _modules, ...node }) => node);

    store.createBioregions(tree);

    expect(store.error).toMatch(/no node modules/);
    expect(store.bioregions).toHaveLength(0);
  });
});

describe('createBioregions from a json_states tree', () => {
  it('assigns state nodes to the bioregions of their cells', () => {
    const { store, network, cells } = setup(
      { segregationTime: 0.5, treeWeightBalance: 0 },
      true,
    );
    const stateNetwork = network as BioregionsStateNetwork;
    expect(stateNetwork.states.length).toBeGreaterThan(0);

    const flow = 1 / stateNetwork.states.length;
    const nodes: StateTree['nodes'] = stateNetwork.states.map((state) => {
      const isCell = state.id < cells.length;
      const top = isCell ? cellModules(cells[state.id])[0] : 1;
      return {
        id: state.id,
        stateId: state.stateId,
        path: [top, 1],
        modules: [top],
        // Infomap writes the physical name; the store replaces it with the state name.
        name: `physical-${state.id}`,
        flow,
        mec: 0,
      };
    });

    store.createBioregions({ ...header(2), nodes });

    expect(store.error).toBeUndefined();
    expect(store.bioregions).toHaveLength(2);
    const occupied = cells.filter((cell) => cell.bioregionId !== 0);
    expect(occupied.length).toBeGreaterThan(0);
    for (const cell of occupied) {
      expect(cell.bioregionId).toBe(cellModules(cell)[0]);
    }
    const cellNodes = nodes.filter((node) => node.id < cells.length);
    for (const node of cellNodes) {
      expect(node.name).toBe(stateNetwork.states[node.stateId].name);
    }
    const totalFlow = store.bioregions.reduce((sum, b) => sum + b.flow, 0);
    expect(totalFlow).toBeCloseTo(1, 12);
  });
});
