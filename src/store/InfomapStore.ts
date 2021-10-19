import { makeObservable, observable } from 'mobx';
import Infomap from '@mapequation/infomap';
import type { Tree } from '@mapequation/infomap';
import type { BipartiteNetwork } from '@mapequation/infomap/network';
import type { Arguments } from '@mapequation/infomap/arguments';
import type RootStore from './RootStore';
import type { Node } from '../utils/QuadTreeGeoBinner';

export default class InfomapStore {
  rootStore: RootStore;
  loaded: boolean = false;
  args: Arguments = {
    silent: true,
    output: 'json',
    twoLevel: true,
    numTrials: 1,
    skipAdjustBipartiteFlow: true,
  };
  tree: Tree | null = null;

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;

    makeObservable(this, {
      loaded: observable,
    });
  }

  async runInfomap(cells: Node[]) {
    const network = networkFromCells(cells);
    try {
      const { json } = await new Infomap()
        .on('data', (output) => console.log(output))
        .runAsync({
          network,
          args: this.args,
        });

      if (json) {
        this.tree = json;
        setBioregionIds(json, cells);
      }
    } catch (err) {
      console.log(err);
    }
  }
}

function setBioregionIds(tree: Tree, cells: Node[]) {
  const bipartiteStartId = tree.bipartiteStartId!;
  tree.nodes.forEach((node) => {
    if (node.id < bipartiteStartId) return;

    const cellId = node.id - bipartiteStartId;
    cells[cellId].bioregionId = node.path[0];
  });
}

function networkFromCells(cells: Node[]): BipartiteNetwork {
  const network: Required<BipartiteNetwork> = {
    nodes: [],
    links: [],
    bipartiteStartId: 0,
  };

  const namesToGridCells = new Map<string, Set<string>>();

  cells.forEach((cell) => {
    cell.speciesTopList.forEach(({ name }) => {
      if (!namesToGridCells.has(name)) {
        namesToGridCells.set(name, new Set());
      }

      namesToGridCells.get(name)?.add(cell.id);
    });
  });

  let nodeId = 0;
  const nodeMap = new Map<string, number>();

  const addNode = (name: string) => {
    const id = nodeId++;
    nodeMap.set(name, id);
    network.nodes.push({ id, name });
  };

  for (let name of namesToGridCells.keys()) {
    addNode(name);
  }

  network.bipartiteStartId = nodeId;

  for (let { id: cellId } of cells) {
    addNode(cellId);
  }

  for (let [name, cells] of namesToGridCells.entries()) {
    const source = nodeMap.get(name)!;
    for (let cell of cells.values()) {
      network.links.push({ source, target: nodeMap.get(cell)! });
    }
  }

  return network;
}