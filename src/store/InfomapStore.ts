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

export type Bioregion = {
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
    entropyCorrected: true,
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
      codelength: computed,
      numLevels: computed,
      relativeCodelengthSavings: computed,
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

  get codelength() {
    return this.tree?.codelength ?? 0;
  }

  get numLevels() {
    return this.tree?.numLevels ?? 0;
  }

  get relativeCodelengthSavings() {
    return this.tree?.relativeCodelengthSavings ?? 0;
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
      const bioregions = createBioregions(tree, this.cells);
      this.setTree(tree);
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
    const { integrationTime } = this.rootStore.treeStore;
    const { nameToCellIds } = this.rootStore.speciesStore.binner;

    let nodeId = network.nodes.length;

    const sumNonTreeLinkWeights = network.sumLinkWeight;

    /**
     * 1. Depth first search post order (from leafs):
     * 2. If leaf node
     *    - create set with the species as only element
     * 3. If non-leaf
     *    - create set with union from children sets from (2)
     *    - if younger than integrationTime and parent is older,
     *      add links from this and parent node to grid cells
     *      weighted on closeness to integration time
     */

    const missing = new Set<string>();

    // source (tree node) -> target (grid cell) -> weight
    const links = new Map<number, Map<number, number>>();

    let sumTreeLinkWeight = 0;

    // Include internal tree nodes into network
    visitTreeDepthFirstPostOrder(tree, (node) => {
      if (node.isLeaf) {
        node.speciesSet = new Set([node.name]);
      } else {
        node.speciesSet = new Set();
        node.children.forEach((child) => {
          if (child.speciesSet) {
            for (const each of child.speciesSet) {
              node.speciesSet?.add(each);
            }
          }
        });
      }

      // const numSpecies = node.speciesSet.size;

      const weight = 1; //weightFunction(node.rootDistance / tree.maxLeafDistance);
      const parentIsOlder = node.parent && node.parent.time < integrationTime;
      const nodeIsYounger = node.time >= integrationTime || node.isLeaf; // TODO: Fix normalize time to 1, now 0.9998

      if (!parentIsOlder || !nodeIsYounger) {
        // Not on branch crossing integration time
        return;
      }

      // TODO: Interpolate between node and parent links.
      // const outLinks = new Map<number, number>();

      const source = node.isLeaf
        ? network.nodeIdMap[node.name] ?? nodeId++
        : nodeId++;

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

function createBioregions(tree: Tree, cells: Node[]) {
  const bipartiteStartId = tree.bipartiteStartId!;

  // Tree nodes are sorted on flow, loop through all to find grid cell nodes
  tree.nodes.forEach((node) => {
    if (node.id >= bipartiteStartId) return;

    cells[node.id].bioregionId = node.path[0];
  });

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
  console.log('Bioregions:', bioregions);
  return bioregions;
}
