/**
 * Tests for turning an Infomap result into bioregions and their statistics.
 * Infomap itself is not run: each test hands `createBioregions` a small tree.
 */

import type { Tree } from '@mapequation/infomap';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHeadlessRoot, type HeadlessRoot, setOccurrences } from '../../harness/stubRoot';
import type {
  BioregionsNetwork,
  BioregionsStateNetwork,
} from './InfomapStore';
import { createPointFeature, type GeoFeature, type Species } from './SpeciesStore';

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
  Object.assign(root.speciesStore.binner, { minCellCapacity: 2, maxCellCapacity: 4 });
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
  expect(cells(root).map((cell) => [cell.id, Object.fromEntries(
    cell.speciesTopList.map(({ name, count }) => [name, count]),
  )])).toEqual(CELLS);
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
      .map(({ name, count }) => ({ source: taxonId(name), target, weight: count })),
  );
  return { nodes, links, bipartiteStartId: cells(root).length } as unknown as BioregionsNetwork;
}

/** Leaf nodes of an Infomap tree, from `[id, modules, flow]` per node. */
function bipartiteTree(root: HeadlessRoot, nodes: [number, number[], number][]): Tree {
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
    const linked = new Set(network.links.flatMap(({ source, target }) => [source, target]));
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
    const [input] = captureInfomapInput(root, network) as BioregionsStateNetwork[];
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
    expect(cells(root).map((cell) => cell.bioregionId)).toEqual([1, 1, 0, 0, 0]);
    expect(infomapStore.bioregions).toHaveLength(1);
  });
});
