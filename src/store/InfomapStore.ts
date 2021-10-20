import { action, makeObservable, observable } from 'mobx';
import Infomap from '@mapequation/infomap';
import type { Tree } from '@mapequation/infomap';
import type { BipartiteNetwork } from '@mapequation/infomap/network';
import type { Arguments } from '@mapequation/infomap/arguments';
import type RootStore from './RootStore';
import type { Node } from '../utils/QuadTreeGeoBinner';

const defaultArgs = {
  silent: true,
  output: 'json',
  skipAdjustBipartiteFlow: true,
} as const;

export default class InfomapStore {
  rootStore: RootStore;
  args: Arguments = {
    twoLevel: true,
    numTrials: 1,
    ...defaultArgs,
  };
  tree: Tree | null = null;
  isRunning: boolean = false;

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;

    makeObservable(this, {
      tree: observable.ref,
      isRunning: observable,
      setTree: action,
      setNeedUpdate: action,
      run: action,
    });
  }

  setTree(tree: Tree) {
    this.tree = tree;
  }

  setNeedUpdate() {
    this.tree = null;
  }

  async run() {
    this.isRunning = true;
    console.log(`Infomap run before: Needs update? tree: ${this.rootStore.speciesStore.binner.treeNeedUpdate} cells: ${this.rootStore.speciesStore.binner.cellsNeedUpdate}`)
    const { cells } = this.rootStore.speciesStore.binner;
    console.log(`Infomap run after get cells: Needs update? tree: ${this.rootStore.speciesStore.binner.treeNeedUpdate} cells: ${this.rootStore.speciesStore.binner.cellsNeedUpdate}`)
    const network = networkFromCells(cells);
    try {
      console.log('Running infomap...');
      const { json: tree } = await new Infomap()
        .on('data', (output) => console.log(output))
        .runAsync({
          network,
          args: this.args,
        });

      if (tree) {
        setBioregionIds(tree, cells);
        this.setTree(tree);
        console.log('Infomap done.');

        console.log(`Infomap done: Needs update? tree: ${this.rootStore.speciesStore.binner.treeNeedUpdate} cells: ${this.rootStore.speciesStore.binner.cellsNeedUpdate}`)
      }
      this.isRunning = false;
    } catch (err) {
      console.log(err);
    }
  }
}

export function setBioregionIds(tree: Tree, cells: Node[]) {
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
