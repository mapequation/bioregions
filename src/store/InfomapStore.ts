import {
  action,
  makeObservable,
  observable,
  computed,
  runInAction,
} from 'mobx';
import Infomap from '@mapequation/infomap';
import type { Tree, Result } from '@mapequation/infomap';
import type { BipartiteNetwork } from '@mapequation/infomap/network';
import type { Arguments } from '@mapequation/infomap/arguments';
import type RootStore from './RootStore';
import type { Node } from '../utils/QuadTreeGeoBinner';
import { visitTreeDepthFirstPostOrder } from '../utils/tree';

interface BioregionsNetwork extends Required<BipartiteNetwork> {
  nodeIdMap: { [name: string]: number };
  numTreeNodes: number;
  numTreeLinks: number;
  sumLinkWeight: number;
}

type RequiredArgs = Required<
  Readonly<Pick<Arguments, 'silent' | 'output' | 'skipAdjustBipartiteFlow'>>
>;

const defaultArgs: RequiredArgs = {
  silent: false,
  output: ['json', 'tree'],
  skipAdjustBipartiteFlow: true,
};

type Bioregion = {
  flow: number;
  bioregionId: number;
  numGridCells: number;
  species: string[];
};

export default class InfomapStore {
  rootStore: RootStore;
  args: RequiredArgs & Arguments = {
    twoLevel: true,
    numTrials: 1,
    regularized: false,
    regularizationStrength: 1,
    entropyCorrected: false,
    entropyCorrectionStrength: 1,
    ...defaultArgs,
  };
  network: BioregionsNetwork | null = null;
  tree: Tree | null = null;
  treeString: string | null = null;
  isRunning: boolean = false;
  currentTrial: number = 0;
  infomap: Infomap = new Infomap();
  infomapId: number | null = null;
  bioregions: Bioregion[] = [];

  // The link weight balance from no tree (0) to only tree (1)
  treeWeightBalance: number = 0.5;
  setTreeWeightBalance(value: number) {
    this.treeWeightBalance = value;
  }

  diversityOrder: number = 0;
  setDiversityOrder(value: number, updateNetwork: boolean = false) {
    this.diversityOrder = value;
    if (updateNetwork) {
      this.rootStore.infomapStore.updateNetwork();
    }
  }

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;

    makeObservable(this, {
      network: observable.ref,
      tree: observable.ref,
      treeString: observable,
      args: observable,
      currentTrial: observable,
      isRunning: observable,
      bioregions: observable.ref,
      diversityOrder: observable,
      setDiversityOrder: action,
      treeWeightBalance: observable,
      setTreeWeightBalance: action,
      numBioregions: computed,
      setTree: action,
      setTreeString: action,
      updateNetwork: action,
      setNetwork: action,
      setIsRunning: action,
      setNumTrials: action,
      setCurrentTrial: action,
      run: action,
    });

    this.initInfomap();
  }

  initInfomap() {
    this.infomap
      .on('data', this.onInfomapOutput)
      .on('error', this.onInfomapError)
      .on('finished', this.onInfomapFinished);
  }

  get numBioregions() {
    return this.bioregions.length;
  }

  setCurrentTrial(trial: number) {
    this.currentTrial = trial;
  }

  setNumTrials(numTrials: number) {
    this.args.numTrials = numTrials;
  }

  setRegularized(value: boolean = true) {
    this.args.regularized = value;
  }

  setRegularizationStrength(strength: number) {
    this.args.regularizationStrength = strength;
  }

  setEntropyCorrected(value: boolean = true) {
    this.args.entropyCorrected = value;
  }

  setEntropyCorrectionStrength(strength: number) {
    this.args.entropyCorrectionStrength = strength;
  }

  setTree(tree: Tree | null) {
    this.tree = tree;
  }

  setTreeString(treeString: string | null) {
    this.treeString = treeString;
  }

  setNetwork(network: BioregionsNetwork | null) {
    this.network = network;
  }

  setIsRunning(isRunning: boolean = true) {
    this.isRunning = isRunning;
  }

  get cells() {
    return this.rootStore.speciesStore.binner.cells;
  }

  onInfomapFinished = (result: Result, id: number) => {
    const { json: tree, tree: treeString } = result;

    if (tree) {
      setBioregionIds(tree, this.cells);
      this.setTree(tree);
      console.log(tree);
      const bioregions: Bioregion[] = Array.from(
        { length: tree.numTopModules },
        () => ({
          flow: 0,
          bioregionId: 0,
          numGridCells: 0,
          species: [],
        }),
      );
      tree.nodes.forEach((node) => {
        const bioregionId = node.modules[0];
        const bioregion = bioregions[bioregionId - 1];
        bioregion.bioregionId = bioregionId;
        bioregion.flow += node.flow;
        if (node.id >= tree.bipartiteStartId!) {
          bioregion.species.push(node.name);
        } else {
          ++bioregion.numGridCells;
        }
      });
      console.log(
        'Bioregions:',
        bioregions,
        bioregions.map((r) => r.flow),
      );
      runInAction(() => {
        this.bioregions = bioregions;
      });
    }

    if (treeString) {
      this.setTreeString(treeString);
    }

    console.timeEnd('infomap');
    this.setIsRunning(false);
    this.infomapId = null;
  };

  onInfomapError = (error: string, id: number) => {
    console.error(error);
    console.timeEnd('infomap');
    this.setIsRunning(false);
  };

  onInfomapOutput = (output: string, id: number) => {
    this.parseOutput(output);
  };

  async run() {
    if (this.infomapId !== null) {
      this.abort();
    }
    const { cells } = this;

    if (cells.length === 0) {
      console.error('No cells in binner!');
      return;
    }

    this.setIsRunning();
    this.setCurrentTrial(0);

    const network = this.updateNetwork();

    console.time('infomap');

    return new Promise<void>((resolve, reject) => {
      this.infomapId = this.infomap
        .on('finished', (result, id) => {
          this.onInfomapFinished(result, id);
          resolve();
        })
        .on('error', (err, id) => {
          this.onInfomapError(err, id);
          reject();
        })
        .run({
          network,
          args: this.args,
        });
    });
  }

  abort() {
    if (this.infomapId === null) {
      return false;
    }

    this.infomap.terminate(this.infomapId, 0);
    this.infomapId = null;
    this.setIsRunning(false);
    this.setTree(null);
    this.setTreeString(null);
    this.setCurrentTrial(0);

    return true;
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
  };

  updateNetwork() {
    const network = this._createNetwork();
    this.setNetwork(network);
    return network;
  }

  private _createNetwork(): BioregionsNetwork {
    console.time('createNetwork');
    const network =
      this.rootStore.treeStore.loaded &&
      this.rootStore.treeStore.includeTreeInNetwork
        ? this.createNetworkWithTree()
        : this.createNetwork();

    console.timeEnd('createNetwork');
    return network;
  }

  private createNetwork(): BioregionsNetwork {
    /*
    Starts with cells as nodes up until the bipartiteStartId.
    Then the feature nodes are added.
    */
    const network: BioregionsNetwork = {
      nodes: [],
      links: [],
      bipartiteStartId: 0,
      nodeIdMap: {},
      numTreeNodes: 0,
      numTreeLinks: 0,
      sumLinkWeight: 0,
    };
    const { cells, nameToCellIds } = this.rootStore.speciesStore.binner;

    let nodeId = 0;

    const addNode = (name: string) => {
      const id = nodeId++;
      network.nodeIdMap[name] = id;
      network.nodes.push({ id, name });
    };

    for (let { id: cellId } of cells) {
      addNode(cellId);
    }

    network.bipartiteStartId = nodeId;

    for (let name of Object.keys(nameToCellIds)) {
      addNode(name);
    }

    const { diversityOrder } = this;
    for (let [name, cells] of Object.entries(nameToCellIds)) {
      const source = network.nodeIdMap[name]!;
      for (let cell of cells.values()) {
        const weight = 1 / cells.size ** diversityOrder;
        network.sumLinkWeight += weight;
        network.links.push({
          source,
          target: network.nodeIdMap[cell]!,
          weight,
        });
      }
    }

    return network;
  }

  private createNetworkWithTree(): BioregionsNetwork {
    /*
    Starts with cells as nodes up until the bipartiteStartId.
    Then the feature nodes are added (as in createNetwork).
    First species (leaf) nodes, then the internal tree nodes.
    */
    const network = this.createNetwork();
    const tree = this.rootStore.treeStore.tree!;
    const { weightFunction } = this.rootStore.treeStore;
    const { nameToCellIds } = this.rootStore.speciesStore.binner;

    let nodeId = network.nodes.length;

    const sumNonTreeLinkWeights = network.sumLinkWeight;

    /**
     * 1. Depth first search post order (from leafs):
     * 2. If leaf node
     *    - create set with the species as only element
     * 3. If non-leaf
     *    - create set with union from children sets from (2)
     *    - add links from node to grid cells
     */

    const missing = new Set<string>();

    // source (tree node) -> target (grid cell) -> weight
    const links = new Map<number, Map<number, number>>();

    let sumTreeLinkWeight = 0;

    // Include internal tree nodes into network
    visitTreeDepthFirstPostOrder(tree, (node) => {
      if (node.isLeaf) {
        node.speciesSet = new Set([node.name]);
        return;
      }

      node.speciesSet = new Set();

      node.children.forEach((child) => {
        if (child.speciesSet) {
          for (const each of child.speciesSet) {
            node.speciesSet?.add(each);
          }
        }
      });

      // const numSpecies = node.speciesSet.size;

      const weight = weightFunction(node.rootDistance / tree.maxLeafDistance);

      if (weight < 1e-4) {
        //TODO: Test this threshold, should depend on network size or other properties?
        return;
      }

      // const outLinks = new Map<number, number>();

      const source = nodeId++;
      if (!links.has(source)) {
        links.set(source, new Map<number, number>());
      }
      const outLinks = links.get(source)!;

      for (const species of node.speciesSet!) {
        if (!nameToCellIds[species]) {
          missing.add(species);
          continue;
        }

        for (const cellId of nameToCellIds[species]) {
          const target = network.nodeIdMap[cellId];

          // Aggregate weight
          const currentWeight = outLinks.get(target) ?? 0;
          outLinks.set(target, currentWeight + weight);
          ++sumTreeLinkWeight;
        }
      }

      // const source = nodeId++;
      // if (!links.has(source)) {
      //   links.set(source, outLinks);
      // } else {
      //   console.warn('Ancestor already got out links!', source, links);
      // }
    });

    const { treeWeightBalance } = this;

    // s * t = n

    // st / (n + st) = b
    // st = bn + bst
    // s(t - bt) = bn
    // s = bn / (t - bt) = bn/(t(1-b))
    const s =
      sumTreeLinkWeight > 0
        ? (treeWeightBalance * sumNonTreeLinkWeights) /
          (sumTreeLinkWeight * (1 - treeWeightBalance))
        : 0;
    console.log(
      `Sum non-tree link weight: ${sumNonTreeLinkWeights}, tree link weight: ${sumTreeLinkWeight}, -> s: ${s}`,
    );

    const treeNodes = new Set<number>();

    for (const [source, outLinks] of links.entries()) {
      if (outLinks.size !== 0) {
        treeNodes.add(source);
      }

      for (const [target, weight] of outLinks.entries()) {
        network.links.push({ source, target, weight: weight * s });
        network.numTreeLinks++;
      }
    }

    for (const id of treeNodes) {
      network.nodes.push({ id, name: id.toString() });
      network.numTreeNodes++;
    }

    console.log('Nodes missing in network', Array.from(missing));

    return network;
  }
}

function setBioregionIds(tree: Tree, cells: Node[]) {
  const bipartiteStartId = tree.bipartiteStartId!;

  // Tree nodes are sorted on flow, loop through all to find grid cell nodes
  tree.nodes.forEach((node) => {
    if (node.id >= bipartiteStartId) return;

    cells[node.id].bioregionId = node.path[0];
  });
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
