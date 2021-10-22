import { action, makeObservable, observable } from 'mobx';
import Infomap from '@mapequation/infomap';
import type { Tree } from '@mapequation/infomap';
import type { BipartiteNetwork } from '@mapequation/infomap/network';
import type { Arguments } from '@mapequation/infomap/arguments';
import type RootStore from './RootStore';
import type { Node } from '../utils/QuadTreeGeoBinner';
import type { PhyloTree } from '../store/TreeStore';
import { visitTreeDepthFirst } from '../utils/tree'

const defaultArgs = {
  silent: false,
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
  currentTrial: number = 0;

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;

    makeObservable(this, {
      tree: observable.ref,
      args: observable,
      currentTrial: observable,
      isRunning: observable,
      setTree: action,
      setIsRunning: action,
      setNumTrials: action,
      setCurrentTrial: action,
      run: action,
    });
  }

  setCurrentTrial(trial: number) {
    this.currentTrial = trial;
  }

  setNumTrials(numTrials: number) {
    this.args.numTrials = numTrials;
  }

  setTree(tree: Tree | null) {
    this.tree = tree;
  }

  setIsRunning(isRunning: boolean = true) {
    this.isRunning = isRunning;
  }

  parseOutput = (output: string) => {
    const trial = output.match(/^Trial (\d+)\//);
    if (trial) {
      this.setCurrentTrial(+trial[1]);
      return;
    }

    const summary = output.match(/^Summary after/);
    if (summary) {
      this.setCurrentTrial(this.currentTrial + 1);
    }
  }

  async run() {
    const { cells } = this.rootStore.speciesStore.binner;
    if (cells.length === 0) {
      console.error("No cells in binner!")
      return;
    }
    this.setIsRunning();

    const network = this.rootStore.treeStore.loaded && this.rootStore.treeStore.includeTreeInNetwork
      ? networkFromCellsWithTree(cells, this.rootStore.treeStore.tree!)
      : networkFromCells(cells);

    try {
      console.log('Running Infomap...');
      const { json: tree } = await new Infomap()
        .on('data', this.parseOutput)
        .runAsync({
          network,
          args: this.args,
        });

      if (tree) {
        setBioregionIds(tree, cells);
        this.setTree(tree);
        console.log('Infomap done.');
      }
    } catch (err) {
      console.log(err);
    }

    this.setCurrentTrial(0);
    this.setIsRunning(false);
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

function networkFromCellsWithTree(cells: Node[], tree: PhyloTree): BipartiteNetwork {
  /*
  Starts with cells as nodes up until the bipartiteStartId.
  Then the feature nodes are added. First species (leaf) nodes,
  then the internal tree nodes.
  */

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




/*

export function getBipartitePhyloNetwork({
  species,
  bins,
  speciesToBins,
  tree,
  treeWeightModelIndex,
}) {
  console.log("Generating bipartite network using phylogenetic tree...");
  // console.log('\n\n!! getBipartitePhyloNetwork, tree:', tree, '\nbins:', bins, 'speciesToBins:', speciesToBins);

  const weightModel = TREE_WEIGHT_MODELS[treeWeightModelIndex];
  console.log("Weight model:", weightModel);

  const numBins = bins.length;
  const bipartiteOffset = (lastBipartiteOffset = numBins);
  // Map names to index
  const speciesNameToIndex = new Map();
  let speciesCounter = 0;
  species.forEach(({ name }) => {
    speciesNameToIndex.set(name, speciesCounter);
    ++speciesCounter;
  });

  // treeUtils.expandAll(tree);
  treeUtils.visitTreeDepthFirst({ postOrder: true }, tree, (node) => {
    if (node.children) {
      speciesNameToIndex.set(node.uid, speciesCounter);
      ++speciesCounter;
    }
  });

  // console.log('==================\nSpecies name to index:');
  // console.log(Array.from(speciesNameToIndex.entries()).join('\n'));

  // Create network with links from species to bins
  const network = [];
  network.push("# speciesId binId weight");
  // bins.forEach((bin) => {
  //   bin.features.forEach((feature) => {
  //     const { name } = feature.properties;
  //     console.log(`!!! add bipartite link from ${speciesNameToIndex.get(name)} (${name}) to bin ${bin.binId}. Feature:`, feature);
  //     const weight = 1.0;// / speciesToBins[name].bins.size;
  //     if (useNewBipartiteFormat) {
  //       network.push(`${speciesNameToIndex.get(name) + bipartiteOffset} ${bin.binId} ${weight}`);
  //     } else {
  //       network.push(`f${speciesNameToIndex.get(name)} n${bin.binId + 1} ${weight}`);
  //     }
  //   });
  // });
  species.forEach(({ name }) => {
    const { bins } = speciesToBins[name];
    bins.forEach((binId) => {
      // console.log(`!!! add bipartite link from ${speciesNameToIndex.get(name)} (${name}) to bin ${binId}`);
      const weight = weightModel.degreeWeighted === 1 ? 1.0 / bins.size : 1.0;
      if (useNewBipartiteFormat) {
        network.push(
          `${speciesNameToIndex.get(name) + bipartiteOffset} ${binId} ${weight}`
        );
      } else {
        network.push(
          `f${speciesNameToIndex.get(name)} n${binId + 1} ${weight}`
        );
      }
    });
  });

  const T = tree.maxLength;
  const p = 3; // -> break weight at 10^(-p)
  const k = (p / T) * Math.LN10;
  const minWeight = Math.pow(10, -p);
  console.log(`T: ${T}, k: ${k}, minWeight: ${minWeight}`);

  treeUtils.visitTreeDepthFirst({ postOrder: true }, tree, (node) => {
    if (!node.children) {
      // leaf nodes
      node.links = new Map();
      const spToBins = speciesToBins[node.name];
      node.linkWeight = 1.0;
      node.binIds = new Set();
      if (spToBins) {
        node.linkWeight = weightModel.degreeWeighted
          ? 1.0 / spToBins.bins.size
          : 1.0;
        node.binIds = spToBins.bins;
        // const weight = 1.0;
        // spToBins.bins.forEach(binId => {
        //   node.links.set(binId, (node.links.get(binId) || 0.0) + weight);
        // });
      }
      // console.log(`Leaf node ${speciesNameToIndex.get(node.name)}, weight: ${node.linkWeight}, binSize: ${node.binIds.size}, node:`, node);
    } else if (node.parent) {
      // ancestor nodes except root
      // node.links = new Map();
      node.linkWeight = 0.0;
      node.binIds = new Set();
      const l = tree.maxLength - node.rootDist;
      let weight = 1.0;
      switch (weightModel.time) {
        case "linear":
          weight = node.rootDist / tree.maxLength;
          // console.log(`weight = ${node.rootDist} / ${tree.maxLength} = ${weight}`);
          break;
        case "exponential":
          weight = Math.exp(-1 * k * l);
          break;
        default:
          weight = 1.0;
      }
      if (weight > minWeight) {
        node.linkWeight = weight;
        _.forEach(node.children, (child) => {
          // Aggregate links from children but with different weight
          // child.links.forEach((childWeight, binId) => {
          //   // node.links.set(binId, (node.links.get(binId) || 0.0) + weight);
          //   node.links.set(binId, weight);
          // });
          child.binIds.forEach((binId) => {
            node.binIds.add(binId);
          });
        });
        if (weightModel.degreeWeighted) {
          node.linkWeight /= node.binIds.size;
        }
      }
      // console.log(`Node ${speciesNameToIndex.get(node.uid)}, weight: ${node.linkWeight}, binSize: ${node.binIds? node.binIds.size : -1}, node:`, node);
    }
  });
  // Add ancestor nodes...
  treeUtils.visitTreeDepthFirst({ postOrder: true }, tree, (node) => {
    if (node.children && node.parent) {
      // node.links.forEach((weight, binId) => {
      //   if (useNewBipartiteFormat) {
      //     console.log(`Link ${speciesNameToIndex.get(node.uid) + bipartiteOffset} ${binId}, weight: ${weight} / ${node.links.size} = ${weight / node.links.size}`)
      //     network.push(`${speciesNameToIndex.get(node.uid) + bipartiteOffset} ${binId} ${weightModel.degreeWeighted ? weight / node.links.size : weight}`);
      //   } else {
      //     network.push(`f${speciesNameToIndex.get(node.uid)} n${binId + 1} ${weightModel.degreeWeighted ? weight / node.links.size : weight}`);
      //   }
      // });
      node.binIds.forEach((binId) => {
        if (useNewBipartiteFormat) {
          network.push(
            `${speciesNameToIndex.get(node.uid) + bipartiteOffset} ${binId} ${node.linkWeight
            }`
          );
        } else {
          network.push(
            `f${speciesNameToIndex.get(node.uid)} n${binId + 1} ${node.linkWeight
            }`
          );
        }
      });
    }
  });

  console.log("First 20 links:", network.slice(0, 20));
  // console.log('========== WHOLE NETWORK =========');
  // console.log(network);
  return network.join("\n");
}
*/