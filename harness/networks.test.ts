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

function createRoot(params: Record<string, unknown>, newick = NEWICK) {
  const root = createHeadlessRoot('test');
  Object.assign(root.speciesStore.binner, { minCellCapacity: 1, maxCellCapacity: 4 });
  setOccurrences(root, occurrences());
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
