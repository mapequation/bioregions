/**
 * Regression tests for the network builders, run headlessly through the stub root.
 * Fixtures are built in code so the tests do not depend on the fetched example data.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BioregionsNetwork, BioregionsStateNetwork } from '../src/store/InfomapStore';
import type { GeoFeature } from '../src/store/SpeciesStore';
import { createPointFeature } from '../src/store/SpeciesStore';
import { parseTree, prepareTree } from '../src/utils/tree';
import { buildTreeNodeMap, createHeadlessRoot, setOccurrences } from './stubRoot';

const NEWICK = '((A: 0.6, B: 0.6): 0.2, ((C: 0.2, D: 0.2): 0.2, (E: 0.1, F: 0.1): 0.3): 0.4);';

/** Overlapping lon/lat boxes, one occurrence every 2 degrees. `G` has no tip in the tree. */
const RANGES: Record<string, [number, number, number, number]> = {
  A: [-40, -10, -20, 10],
  B: [-30, 0, -10, 20],
  C: [0, -10, 20, 10],
  D: [10, 0, 30, 20],
  E: [-10, 20, 10, 40],
  F: [0, 30, 20, 50],
  G: [-20, -20, 20, 0],
};

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

function createRoot(params: Record<string, unknown>, newick = NEWICK, features = occurrences()) {
  const root = createHeadlessRoot('test');
  Object.assign(root.speciesStore.binner, { minCellCapacity: 1, maxCellCapacity: 4 });
  setOccurrences(root, features);
  const tree = prepareTree(parseTree(newick));
  root.treeStore.tree = tree;
  root.treeStore.treeNodeMap = buildTreeNodeMap(tree);
  Object.assign(root.infomapStore, params);
  return root;
}

function buildNetwork(params: Record<string, unknown>, newick = NEWICK) {
  return createRoot(params, newick).infomapStore.createNetwork();
}

function buildStateNetwork(params: Record<string, unknown>, newick = NEWICK) {
  const network = buildNetwork({ segregationTime: 0.5, ...params }, newick);
  if (!('states' in network)) {
    throw new Error('expected a state network');
  }
  return network;
}

/** Links by name: taxon, the target cell and, in state networks, the target state. */
function namedLinks(network: BioregionsNetwork | BioregionsStateNetwork) {
  return network.links.map(({ source, target, weight = 1 }) => {
    if ('states' in network) {
      const state = network.states[target];
      return {
        taxon: network.states[source].name ?? '',
        cell: network.nodes[state.id].name ?? '',
        state: state.name ?? '',
        weight,
      };
    }
    const cell = network.nodes[target].name ?? '';
    return { taxon: network.nodes[source].name ?? '', cell, state: cell, weight };
  });
}

function sumByTaxon(network: BioregionsNetwork | BioregionsStateNetwork) {
  const sums = new Map<string, number>();
  for (const { taxon, weight } of namedLinks(network)) {
    sums.set(taxon, (sums.get(taxon) ?? 0) + weight);
  }
  return sums;
}

beforeEach(() => {
  // The builders log progress and dump whole networks.
  for (const method of ['log', 'time', 'timeEnd', 'warn'] as const) {
    vi.spyOn(console, method).mockImplementation(() => { });
  }
});

describe('state network link threshold (#85)', () => {
  it.each([
    // treeWeightBalance = 0 takes the early-return path with no ancestral nodes.
    { segregationTime: 0.5, treeWeightBalance: 0 },
    { segregationTime: 0.5, treeWeightBalance: 0.5, useWholeTree: true },
  ])('skips only the sub-threshold links with %o', (params) => {
    const full = buildNetwork({ ...params, linkWeightThresholdExponent: -100 });
    expect(full.numLinksBelowThreshold).toBe(0);

    // Threshold halfway between two middle distinct weights, so some links fall
    // on each side and none sits on the threshold.
    const weights = full.links.map((link) => link.weight ?? 1);
    const distinct = [...new Set(weights)].sort((a, b) => a - b);
    expect(distinct.length).toBeGreaterThan(2);
    const k = Math.floor(distinct.length / 2);
    const threshold = (Math.max(...distinct.slice(0, k)) + Math.min(...distinct.slice(k))) / 2;

    const pruned = buildNetwork({
      ...params,
      linkWeightThresholdExponent: Math.log10(threshold),
    });
    const below = weights.filter((w) => w < threshold).length;
    const linksPerEntry = full.isDirected ? 2 : 1;

    expect(pruned.links.length).toBe(weights.length - below);
    expect(pruned.numLinksBelowThreshold).toBe(below / linksPerEntry);
  });
});

describe('species without a tip in the tree (#85)', () => {
  it('counts them when treeWeightBalance = 1 leaves them out', () => {
    const network = buildNetwork({ useWholeTree: true, treeWeightBalance: 1 });
    expect(network.numSpeciesExcluded).toBe(1);
    expect(network.nodeIdMap).not.toHaveProperty('G');
  });

  it('does not report them when species are still linked', () => {
    const network = buildNetwork({ useWholeTree: true, treeWeightBalance: 0.5 });
    expect(network.numSpeciesExcluded).toBeUndefined();
    expect(network.nodeIdMap).toHaveProperty('G');
  });
});

describe('state network species links (S3)', () => {
  it('use the information weight, as bipartite species links do', () => {
    const params = {
      treeWeightBalance: 0,
      useWeightedSpeciesLinks: true,
      useWeightedTreeNodeLinksIfTimeSlice: false,
    };
    const bipartite = sumByTaxon(buildNetwork(params));
    const state = sumByTaxon(buildStateNetwork(params));
    expect([...state.keys()].sort()).toEqual([...bipartite.keys()].sort());
    for (const [taxon, weight] of bipartite) {
      expect(state.get(taxon)).toBeCloseTo(weight, 10);
    }
  });
});

describe('time slice cut at a parent node (B4)', () => {
  it("files the parent's links under the parent, not under its children", () => {
    const root = createRoot({ treeWeightBalance: 1, useWholeTree: false, segregationTime: 0 });
    const tree = root.treeStore.tree;
    const parent = tree?.children
      .flatMap((child) => child.children)
      .find((node) => node.children.some((child) => child.name === 'C'));
    if (!parent) {
      throw new Error('expected the (C, D) node');
    }
    root.infomapStore.integrationTime = parent.time;
    const links = namedLinks(root.infomapStore.createNetwork());
    const taxa = new Set(links.map(({ taxon }) => taxon));
    expect(taxa).toContain(parent.name);
    expect(taxa).not.toContain('C');
    expect(taxa).not.toContain('D');
  });
});

describe('NaN weights (B5)', () => {
  it('gives the information weight 1 with a single grid cell', () => {
    const root = createHeadlessRoot('test');
    root.infomapStore.useWeightedSpeciesLinks = true;
    expect(root.infomapStore.getTaxonLinkWeight(1, 1)).toBe(1);
  });

  it.each([
    { segregationTime: 0 },
    { segregationTime: 0.5 },
  ])('skips the tree scaling when there are no tree links, with %o', (params) => {
    // No tip matches an occurrence species, so the tree adds no links.
    const network = buildNetwork({ ...params, treeWeightBalance: 0.5 }, '(X: 1, Y: 1);');
    expect(network.sumTreeLinkWeight).toBe(0);
    expect(network.links.length).toBeGreaterThan(0);
    for (const { weight } of network.links) {
      expect(Number.isFinite(weight)).toBe(true);
    }
  });
});

describe('time slice species sets (B9)', () => {
  // (A, B) ends before the cut at 0.5, so only C reaches it below X.
  const NON_ULTRAMETRIC = '(((A: 0.1, B: 0.1)Z: 0.1, C: 0.8)X: 0.2, D: 1)R;';

  it.each([
    { segregationTime: 0 },
    { segregationTime: 0.1 },
  ])('link a node to the cells of all its descendant species, with %o', (params) => {
    const root = createRoot(
      { ...params, treeWeightBalance: 1, useWholeTree: false, integrationTime: 0.5 },
      NON_ULTRAMETRIC,
    );
    const { nameToCellIds } = root.speciesStore.binner;
    const expected = new Set(['A', 'B', 'C'].flatMap((name) => [...nameToCellIds[name]]));
    const cells = namedLinks(root.infomapStore.createNetwork())
      .filter(({ taxon }) => taxon === 'X')
      .map(({ cell }) => cell);
    expect(new Set(cells)).toEqual(expected);
  });
});

describe('state network nodes (B10)', () => {
  it('creates taxa and states only for links above the threshold', () => {
    const params = { treeWeightBalance: 0.5, useWholeTree: true };
    const weights = buildStateNetwork(params)
      .links.map(({ weight = 1 }) => weight)
      .sort((a, b) => a - b);
    const median = weights[Math.floor(weights.length / 2)];
    const network = buildStateNetwork({
      ...params,
      linkWeightThresholdExponent: Math.log10(median),
    });
    expect(network.numLinksBelowThreshold).toBeGreaterThan(0);

    const linked = new Set(network.links.flatMap(({ source, target }) => [source, target]));
    expect(network.states.filter(({ stateId }) => !linked.has(stateId))).toEqual([]);
    const taxa = new Set(network.links.map(({ source }) => source));
    expect(network.numLeafTaxonNodes + network.numInternalTaxonNodes).toBe(taxa.size);
    expect(network.nodes.length).toBe(network.numGridCellNodes + taxa.size);
  });
});

describe('uniform tree links in state networks (B11)', () => {
  it('do not depend on the order of children in the tree', () => {
    // A and B share cells but have different memory weights under P at the cut.
    const params = { treeWeightBalance: 1, useWholeTree: true, uniformTreeLinks: true };
    const sorted = (newick: string) =>
      namedLinks(buildStateNetwork(params, newick))
        .map(({ taxon, state, weight }) => `${taxon} ${state} ${weight.toFixed(12)}`)
        .sort();
    expect(sorted('((B: 1, A: 0.5)P: 0.5, C: 1.5)R;')).toEqual(
      sorted('((A: 0.5, B: 1)P: 0.5, C: 1.5)R;'),
    );
  });
});

describe('whole-tree state network coefficients', () => {
  it('drop tree contributions with negative weight instead of subtracting them', () => {
    // Without uniform tree links, X's strength counts every (species, cell) pair
    // and exceeds the number of cells, so its information weight is negative.
    const newick = '((A: 1, B: 1, C: 1, D: 1, E: 1, F: 1)X: 1, G: 2)R;';
    const params = {
      treeWeightBalance: 1,
      useWholeTree: true,
      uniformTreeLinks: false,
      linkWeightThresholdExponent: -100,
    };
    const root = createRoot({ segregationTime: 0.5, ...params }, newick);
    const { nameToCellIds } = root.speciesStore.binner;
    const strength = ['A', 'B', 'C', 'D', 'E', 'F'].reduce(
      (sum, name) => sum + nameToCellIds[name].size,
      0,
    );
    const network = root.infomapStore.createNetwork();
    expect(strength).toBeGreaterThan(network.numGridCellNodes);

    const sumLinkWeight = network.links.reduce((sum, { weight = 1 }) => sum + weight, 0);
    expect(network.sumTreeLinkWeight).toBeCloseTo(sumLinkWeight, 10);
    expect(Math.min(...network.links.map(({ weight = 1 }) => weight))).toBeGreaterThan(0);
  });
});

describe('tree weight balance just below 1', () => {
  it('keeps the species links and does not report excluded species', () => {
    const network = buildNetwork({
      useWholeTree: true,
      treeWeightBalance: 1 - 1e-7,
      linkWeightThresholdExponent: -100,
    });
    expect(network.numSpeciesExcluded).toBeUndefined();
    expect(network.nodeIdMap).toHaveProperty('G');
  });
});

describe('species without a tip in state networks', () => {
  it('counts them when treeWeightBalance = 1 leaves them out', () => {
    const network = buildStateNetwork({ useWholeTree: true, treeWeightBalance: 1 });
    expect(network.numSpeciesExcluded).toBe(1);
    expect(network.nodeIdMap).not.toHaveProperty('G');
  });

  it('does not report them when species are still linked', () => {
    const network = buildStateNetwork({ useWholeTree: true, treeWeightBalance: 0.5 });
    expect(network.numSpeciesExcluded).toBeUndefined();
    expect(network.nodeIdMap).toHaveProperty('G');
  });
});

describe('multilayer layer times', () => {
  it('are k / L for linear time', () => {
    const numLayers = 10;
    const { infomapStore } = createRoot({ numLayers, multilayerLogTime: false });
    const createStandardNetwork = vi.spyOn(infomapStore, 'createStandardNetwork');
    infomapStore.createMultilayerNetwork();
    const times = createStandardNetwork.mock.calls.map(([t]) => t);
    expect(times).toEqual(Array.from({ length: numLayers }, (_, k) => (k + 1) / numLayers));
  });
});

describe('taxa named like a cell id', () => {
  // Cell ids are digit strings, as are numeric species keys in occurrence data.
  // Names do not affect the binning, so find a cell id first, then use it as a name.
  const withSpecies = (name: string) => [
    ...occurrences(),
    createPointFeature([-39.5, -9.5], { name }),
  ];
  const cellId = createRoot({}, NEWICK, withSpecies('X')).speciesStore.binner.cells[0].id;
  const params = { treeWeightBalance: 0.5, useWholeTree: true };
  const build = (extra: Record<string, unknown>) =>
    createRoot({ ...params, ...extra }, NEWICK, withSpecies(cellId));

  it('get their own node in bipartite networks', () => {
    const network = build({ segregationTime: 0 }).infomapStore.createNetwork();
    if (!('bipartiteStartId' in network)) {
      throw new Error('expected a bipartite network');
    }
    expect(network.links.every(({ source }) => source >= network.bipartiteStartId)).toBe(true);
    expect(network.nodes.length).toBe(
      network.numGridCellNodes + network.numLeafTaxonNodes + network.numInternalTaxonNodes,
    );
  });

  it('get their own node in state networks', () => {
    const network = build({ segregationTime: 0.5 }).infomapStore.createNetwork();
    if (!('states' in network)) {
      throw new Error('expected a state network');
    }
    const taxonStates = network.links.map(({ source }) => network.states[source]);
    expect(taxonStates.every(({ id }) => id >= network.numGridCellNodes)).toBe(true);
  });

  it('get their own node in multilayer networks', () => {
    const { infomapStore, speciesStore } = build({});
    const network = infomapStore.createMultilayerNetwork();
    const numCells = speciesStore.binner.cells.length;
    expect(network.intra.every(({ source }) => source >= numCells)).toBe(true);
  });
});
