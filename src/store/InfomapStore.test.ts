/**
 * Tests for turning an Infomap result into bioregions and their statistics.
 * Infomap itself is not run: each test hands `createBioregions` a small tree.
 */

import type { StateTree, Tree } from '@mapequation/infomap';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createHeadlessRoot,
  type HeadlessRoot,
  setOccurrences,
} from '../../harness/stubRoot';
import {
  type BioregionsMultilayerNetwork,
  type BioregionsNetwork,
  type BioregionsStateNetwork,
  compareIndicative,
} from './InfomapStore';
import {
  createPointFeature,
  type GeoFeature,
  type Species,
} from './SpeciesStore';

/** Point clusters `[name, lon, lat, records]`, giving five cells (see `CELLS`). */
const CLUSTERS: [string, number, number, number][] = [
  ['A', -100.5, -50.5, 3],
  ['B', -100.5, -50.5, 1],
  ['A', 100.5, -50.5, 2],
  ['C', 100.5, -50.5, 2],
  ['D', -100.5, 50.5, 3],
  ['E', -100.4, 50.4, 1],
  ['E', -101, 49, 1],
  ['B', 100.5, 50.5, 3],
  ['C', 100.5, 50.5, 1],
];

/** Cell ids in `binner.cells` order with their records; `2102310` is a patched parent of `21023103`. */
const CELLS: [string, Record<string, number>][] = [
  ['0320132', { A: 3, B: 1 }],
  ['1231023', { A: 2, C: 2 }],
  ['2102310', { D: 3, E: 1 }],
  ['21023103', { D: 3, E: 1 }],
  ['3013201', { B: 3, C: 1 }],
];

const TAXA = ['A', 'B', 'C', 'D', 'E'];

function setup(): HeadlessRoot {
  const root = createHeadlessRoot('test');
  Object.assign(root.speciesStore.binner, {
    minCellCapacity: 2,
    maxCellCapacity: 4,
  });
  const features: GeoFeature[] = [];
  for (const [name, x, y, n] of CLUSTERS) {
    for (let i = 0; i < n; ++i) {
      features.push(createPointFeature([x + 0.01 * i, y + 0.01 * i], { name }));
    }
  }
  setOccurrences(root, features);
  const speciesMap = new Map<string, Species>();
  for (const { properties } of features) {
    const species = speciesMap.get(properties.name) ?? {
      name: properties.name,
      count: 0,
      countPerRegion: new Map(),
    };
    ++species.count;
    speciesMap.set(properties.name, species);
  }
  Object.assign(root.speciesStore, { speciesMap, numRecords: features.length });
  expect(
    cells(root).map((cell) => [
      cell.id,
      Object.fromEntries(
        cell.speciesTopList.map(({ name, count }) => [name, count]),
      ),
    ]),
  ).toEqual(CELLS);
  return root;
}

function cells(root: HeadlessRoot) {
  return root.infomapStore.cells;
}

/** Taxon id in the bipartite network: cells come first. */
function taxonId(name: string) {
  return CELLS.length + TAXA.indexOf(name);
}

/** Bipartite network with a taxon -> cell link per species and cell, weighted by records. */
function bipartiteNetwork(root: HeadlessRoot, taxa = TAXA): BioregionsNetwork {
  const nodes = [
    ...cells(root).map((cell, id) => ({ id, name: cell.id })),
    ...TAXA.map((name) => ({ id: taxonId(name), name })),
  ];
  const links = cells(root).flatMap((cell, target) =>
    cell.speciesTopList
      .filter(({ name }) => taxa.includes(name))
      .map(({ name, count }) => ({
        source: taxonId(name),
        target,
        weight: count,
      })),
  );
  return {
    nodes,
    links,
    bipartiteStartId: cells(root).length,
  } as unknown as BioregionsNetwork;
}

/** Leaf nodes of an Infomap tree, from `[id, modules, flow]` per node. */
function bipartiteTree(
  root: HeadlessRoot,
  nodes: [number, number[], number][],
): Tree {
  const names = bipartiteNetwork(root).nodes.map((node) => node.name);
  return {
    bipartiteStartId: cells(root).length,
    numTopModules: Math.max(...nodes.map(([, modules]) => modules[0])),
    numLevels: nodes[0][1].length + 1,
    nodes: nodes.map(([id, modules, flow]) => ({
      id,
      name: names[id],
      flow,
      modules,
      path: [...modules, 1],
    })),
  } as unknown as Tree;
}

/**
 * State network as the app builds it: a state per taxon, then a state per cell
 * and taxon in it (memory = taxon), with a taxon -> cell link per cell state.
 */
function stateNetwork(root: HeadlessRoot) {
  const states = TAXA.map((name, stateId) => ({
    stateId,
    id: taxonId(name),
    name,
  }));
  const links: { source: number; target: number; weight: number }[] = [];
  cells(root).forEach((cell, id) => {
    for (const { name, count } of cell.speciesTopList) {
      const stateId = states.length;
      states.push({ stateId, id, name: `${cell.id}_${name}` });
      links.push({
        source: TAXA.indexOf(name),
        target: stateId,
        weight: count,
      });
    }
  });
  const nodes = bipartiteNetwork(root).nodes;
  return { nodes, states, links } as unknown as BioregionsStateNetwork;
}

/** State id of the state network's state `name` (a taxon, or `<cellId>_<taxon>`). */
function stateIdOf(network: BioregionsStateNetwork, name: string) {
  const state = network.states.find((s) => s.name === name);
  if (state == null) throw new Error(`no state ${name}`);
  return state.stateId;
}

/** State tree from `[state name, modules, flow]` per state node, in output order. */
function stateTree(
  network: BioregionsStateNetwork,
  nodes: [string, number[], number][],
): StateTree {
  return {
    args: '',
    numTopModules: Math.max(...nodes.map(([, modules]) => modules[0])),
    numLevels: nodes[0][1].length + 1,
    nodes: nodes.map(([name, modules, flow]) => {
      const { stateId, id } = network.states[stateIdOf(network, name)];
      return { stateId, id, name, flow, modules, path: [...modules, 1] };
    }),
  } as unknown as StateTree;
}

/** Multilayer tree from `[node id, layer id, modules, flow]` per state node. */
function multilayerTree(
  nodes: [number, number, number[], number][],
): StateTree {
  return {
    args: '--multilayer-relax-limit 1',
    numTopModules: Math.max(...nodes.map(([, , modules]) => modules[0])),
    numLevels: nodes[0][2].length + 1,
    nodes: nodes.map(([id, layerId, modules, flow], stateId) => ({
      stateId,
      id,
      layerId,
      name: `${id}`,
      flow,
      modules,
      path: [...modules, 1],
    })),
  } as unknown as StateTree;
}

/** Every state of the state network in module 1, except those named in `modules`. */
function stateNodes(
  network: BioregionsStateNetwork,
  modules: Record<string, number> = {},
) {
  return network.states.map(({ name = '' }): [string, number[], number] => [
    name,
    [modules[name] ?? 1],
    0.01,
  ]);
}

beforeEach(() => {
  for (const method of ['log', 'time', 'timeEnd', 'warn'] as const) {
    vi.spyOn(console, method).mockImplementation(() => {});
  }
});

/** Replace the Infomap worker with one that records the network it is given. */
function captureInfomapInput(root: HeadlessRoot, network: unknown) {
  const inputs: unknown[] = [];
  const infomap = {
    on: () => infomap,
    run: (options: { network: unknown }) => {
      inputs.push(options.network);
      return 1;
    },
  };
  Object.assign(root.infomapStore, { infomap, updateNetwork: () => network });
  void root.infomapStore.run();
  return inputs;
}

describe('vertices without links', () => {
  it('are left out of the bipartite network given to Infomap', () => {
    const root = setup();
    const network = bipartiteNetwork(root, ['A', 'B', 'C']);
    const [input] = captureInfomapInput(root, network) as BioregionsNetwork[];
    const linked = new Set(
      network.links.flatMap(({ source, target }) => [source, target]),
    );
    expect(input.nodes.map((node) => node.id)).toEqual(
      network.nodes.map((node) => node.id).filter((id) => linked.has(id)),
    );
    expect(input.nodes.length).toBeLessThan(network.nodes.length);
    expect(input.links).toBe(network.links);
    expect(network.nodes.length).toBe(10);
  });

  it('are left out of the state network given to Infomap', () => {
    const root = setup();
    const network = {
      nodes: [
        { id: 0, name: '0320132' },
        { id: 1, name: '1231023' },
        { id: 5, name: 'A' },
      ],
      states: [
        { stateId: 0, id: 5, name: 'A' },
        { stateId: 1, id: 0, name: '0320132_A' },
        { stateId: 2, id: 1, name: '1231023_A' },
      ],
      links: [{ source: 0, target: 1, weight: 1 }],
    } as unknown as BioregionsStateNetwork;
    const [input] = captureInfomapInput(
      root,
      network,
    ) as BioregionsStateNetwork[];
    expect(input.states.map((state) => state.stateId)).toEqual([0, 1]);
    expect(network.states).toHaveLength(3);
  });

  it('leave their cells without a bioregion', () => {
    const root = setup();
    const { infomapStore } = root;
    infomapStore.network = bipartiteNetwork(root, ['A', 'C']);
    infomapStore.createBioregions(
      bipartiteTree(root, [
        [0, [1], 0.25],
        [1, [1], 0.25],
        [taxonId('A'), [1], 0.25],
        [taxonId('C'), [1], 0.25],
      ]),
    );
    expect(cells(root).map((cell) => cell.bioregionId)).toEqual([
      1, 1, 0, 0, 0,
    ]);
    expect(infomapStore.bioregions).toHaveLength(1);
  });
});

/**
 * State result where cells `0320132` and `1231023` have states in modules 1 and 2;
 * module 1 holds most of their flow (a tie for `1231023`).
 */
function splitStateCells() {
  const root = setup();
  const network = stateNetwork(root);
  root.infomapStore.network = network;
  const rest = stateNodes(network, {
    B: 2,
    C: 2,
    '3013201_B': 2,
    '3013201_C': 2,
  }).filter(
    ([name]) =>
      !['0320132_A', '0320132_B', '1231023_A', '1231023_C'].includes(name),
  );
  root.infomapStore.createBioregions(
    stateTree(network, [
      ['0320132_A', [1], 0.3],
      ['1231023_A', [1], 0.1],
      ...rest,
      // the last state of each cell sits in module 2: the larger flow wins,
      // and a tie goes to the lower module id
      ['0320132_B', [2], 0.1],
      ['1231023_C', [2], 0.1],
    ]),
  );
  return root;
}

describe('state and multilayer cells', () => {
  it('belong to the bioregion holding most of their flow', () => {
    const root = splitStateCells();
    expect(cells(root).map((cell) => cell.bioregionId)).toEqual([
      1, 1, 1, 1, 2,
    ]);
  });

  it('belong to the multilayer bioregion holding most of their flow', () => {
    const root = setup();
    root.infomapStore.createBioregions(
      multilayerTree([
        [0, 1, [1], 0.3],
        [taxonId('A'), 1, [1], 0.3],
        [taxonId('B'), 2, [2], 0.3],
        [0, 2, [2], 0.1],
      ]),
    );
    expect(cells(root)[0].bioregionId).toBe(1);
  });

  it('count their records in their own bioregion only', () => {
    const root = splitStateCells();
    const [, second] = root.infomapStore.bioregions;
    expect([...second.cellMap.keys()]).toEqual(['3013201']);
    expect(second.numRecords).toBe(4);
    const numCells = root.infomapStore.bioregions.map(
      (bioregion) => bioregion.numGridCells,
    );
    expect(numCells).toEqual([4, 1]);
  });

  it('count their records in their own multilayer bioregion only', () => {
    const root = setup();
    root.infomapStore.createBioregions(
      multilayerTree([
        [0, 1, [1], 0.3],
        [taxonId('A'), 1, [1], 0.3],
        [taxonId('B'), 2, [2], 0.3],
        [0, 2, [2], 0.1],
      ]),
    );
    expect(root.infomapStore.bioregions[1].numGridCells).toBe(0);
  });
});

describe('multilayer bioregions', () => {
  it('follow the module level', () => {
    const root = setup();
    root.infomapStore.setModuleLevel(1);
    root.infomapStore.createBioregions(
      multilayerTree([
        [0, 1, [1, 1], 0.3],
        [taxonId('A'), 1, [1, 1], 0.3],
        [1, 1, [1, 2], 0.2],
        [taxonId('C'), 2, [1, 2], 0.2],
      ]),
    );
    expect(root.infomapStore.bioregions).toHaveLength(2);
    expect(cells(root).map((cell) => cell.bioregionId)).toEqual([
      1, 2, 0, 0, 0,
    ]);
  });
});

describe('connected bioregions', () => {
  it('are filled for state networks', () => {
    const root = splitStateCells();
    const [cell] = cells(root);
    // `0320132` links to A (3 records, bioregion 1) and B (1 record, bioregion 2)
    expect(cell.bioregionId).toBe(1);
    expect(cell.connectedBioregions.ownProportion).toBe(0.75);
    expect(cell.bioregionMetrics.overlap).toBe(0.5);
  });

  it('are filled for multilayer networks', () => {
    const root = setup();
    root.infomapStore.multilayerNetwork = {
      intra: [
        { layerId: 1, source: taxonId('A'), target: 0, weight: 3 },
        { layerId: 1, source: taxonId('B'), target: 0, weight: 1 },
      ],
    } as unknown as BioregionsMultilayerNetwork;
    root.infomapStore.createBioregions(
      multilayerTree([
        [0, 1, [1], 0.3],
        [taxonId('A'), 1, [1], 0.3],
        [taxonId('B'), 1, [2], 0.1],
      ]),
    );
    expect(cells(root)[0].connectedBioregions.ownProportion).toBe(0.75);
  });
});

describe('bioregion statistics', () => {
  function oneBioregion() {
    const root = setup();
    root.infomapStore.network = bipartiteNetwork(root);
    const nodes = bipartiteNetwork(root).nodes.map(
      ({ id }): [number, number[], number] => [id, [1], 0.1],
    );
    root.infomapStore.createBioregions(bipartiteTree(root, nodes));
    return root;
  }

  it('include patched cells', () => {
    const root = oneBioregion();
    const patched = cells(root)[2];
    expect(patched.isLeaf).toBe(false);
    expect(root.infomapStore.bioregions[0].numRecords).toBe(20);
    expect(patched.bioregionMetrics.endemicity).toBe(1);
  });

  it('score indicative species against the records of the network species', () => {
    const root = setup();
    // E is not in the network
    root.infomapStore.network = bipartiteNetwork(root, ['A', 'B', 'C', 'D']);
    root.infomapStore.createBioregions(
      bipartiteTree(root, [
        [0, [1], 0.1],
        [1, [1], 0.1],
        [taxonId('A'), [1], 0.1],
        [taxonId('C'), [1], 0.1],
        [2, [2], 0.1],
        [3, [2], 0.1],
        [4, [2], 0.1],
        [taxonId('B'), [2], 0.1],
        [taxonId('D'), [2], 0.1],
      ]),
    );
    const scores = Object.fromEntries(
      root.infomapStore.bioregions[0].mostIndicative.map(({ name, score }) => [
        name,
        score,
      ]),
    );
    // A: 5 of the 8 records in bioregion 1, and 5 of the 18 network-species records
    expect(scores.A).toBeCloseTo(5 / 8 / (5 / 18), 12);
    expect(scores.C).toBeCloseTo(2 / 8 / (3 / 18), 12);
  });
});

describe('most indicative species', () => {
  it('are ordered the same whatever the input order', () => {
    // within 1e-6, the old comparator ranked a < b and b < c by count, but c < a by score
    const a = { name: 'a', count: 3, score: 1 };
    const b = { name: 'b', count: 2, score: 1 + 0.6e-6 };
    const c = { name: 'c', count: 1, score: 1 + 1.2e-6 };
    for (const order of [
      [a, b, c],
      [a, c, b],
      [b, a, c],
      [b, c, a],
      [c, a, b],
      [c, b, a],
    ]) {
      expect(order.sort(compareIndicative)).toEqual([c, b, a]);
    }
  });

  it('break ties by count, then name', () => {
    const items = [
      { name: 'z', count: 2, score: 2 },
      { name: 'y', count: 2, score: 2 },
      { name: 'x', count: 3, score: 2 },
      { name: 'w', count: 1, score: 3 },
    ];
    expect(items.sort(compareIndicative).map(({ name }) => name)).toEqual([
      'w',
      'x',
      'y',
      'z',
    ]);
  });
});
