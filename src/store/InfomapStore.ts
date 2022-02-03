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
import {
  getIntersectingBranches,
  visitTreeDepthFirstPostOrder,
} from '../utils/tree';

interface BioregionsNetwork extends Required<BipartiteNetwork> {
  nodeIdMap: { [name: string]: number };
  numTreeNodes: number;
  numTreeLinks: number;
  sumLinkWeight: number;
}

type RequiredArgs = Required<Readonly<Pick<Arguments, 'silent' | 'output'>>>;

const defaultArgs: RequiredArgs = {
  silent: false,
  output: ['json', 'tree'],
};

export type Bioregion = {
  flow: number;
  bioregionId: number;
  numGridCells: number;
  numRecords: number;
  species: string[];
  mostCommon: {
    name: string;
    count: number;
  }[];
  mostIndicative: {
    name: string;
    score: number;
  }[];
};

export default class InfomapStore {
  rootStore: RootStore;
  args: RequiredArgs & Arguments = {
    twoLevel: true,
    numTrials: process.env.NODE_ENV === 'production' ? 5 : 1,
    regularized: false,
    regularizationStrength: 1,
    entropyCorrected: true,
    entropyCorrectionStrength: 1,
    skipAdjustBipartiteFlow: true,
    ...defaultArgs,
  };
  network: BioregionsNetwork | null = null;
  tree: Tree | null = null;
  treeString: string | null = null;
  includeTreeInNetwork: boolean = true;
  isRunning: boolean = false;
  currentTrial: number = 0;
  infomap: Infomap = new Infomap();
  infomapId: number | null = null;
  bioregions: Bioregion[] = [];

  // The link weight balance from no tree (0) to only tree (1)
  treeWeightBalance: number = 0.5;
  setTreeWeightBalance(value: number, updateNetwork = false) {
    this.treeWeightBalance = value;
    if (updateNetwork) {
      this.rootStore.infomapStore.updateNetwork();
    }
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
      includeTreeInNetwork: observable,
      integrationTime: observable,
      segregationTime: observable,
      setTreeWeightBalance: action,
      numBioregions: computed,
      haveBioregions: computed,
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

  clearData = action(() => {
    this.network = null;
    this.tree = null;
    this.treeString = null;
    this.isRunning = false;
    this.currentTrial = 0;
    this.bioregions = [];
  });

  get haveBioregions() {
    return this.numBioregions > 0;
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

  setSkipAdjustBipartiteFlow(value: boolean = true) {
    this.args.skipAdjustBipartiteFlow = value;
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

  setIncludeTree = action((value: boolean = true) => {
    this.includeTreeInNetwork = value;
    this.rootStore.infomapStore.updateNetwork();
  });

  integrationTime: number = 1;
  setIntegrationTime = action((value: number, updateNetwork = false) => {
    this.integrationTime = value;
    if (updateNetwork) {
      this.rootStore.infomapStore.updateNetwork();
    }
  });
  segregationTime: number = 0;
  setSegregationTime = action((value: number, updateNetwork = false) => {
    this.segregationTime = value;
    if (updateNetwork) {
      this.rootStore.infomapStore.updateNetwork();
    }
  });

  get cells() {
    return this.rootStore.speciesStore.binner.cells;
  }

  onInfomapFinished = (result: Result, id: number) => {
    const { json: tree, tree: treeString } = result;

    if (tree) {
      const bioregions = this.createBioregions(tree);
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
      this.rootStore.treeStore.loaded && this.includeTreeInNetwork
        ? this.createNetworkWithTree()
        : this.createNetwork();

    console.timeEnd('createNetwork');
    return network;
  }

  public createNetwork(): BioregionsNetwork {
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

    const { diversityOrder, treeWeightBalance } = this;
    for (let [name, cells] of Object.entries(nameToCellIds)) {
      const source = network.nodeIdMap[name]!;
      for (let cell of cells.values()) {
        const weight = (1 - treeWeightBalance) / cells.size ** diversityOrder;
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

  public createNetworkWithTree(): BioregionsNetwork {
    /*
    Starts with cells as nodes up until the bipartiteStartId.
    Then the feature nodes are added (as in createNetwork).
    First species (leaf) nodes, then the internal tree nodes.
    */
    const network = this.createNetwork();
    const tree = this.rootStore.treeStore.tree!;
    const { integrationTime } = this;
    const { nameToCellIds } = this.rootStore.speciesStore.binner;

    let nodeId = network.nodes.length;
    const numSpecies = network.nodes.length;

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
        if (node.children.some((child) => child.time > integrationTime)) {
          node.children.forEach((child) => {
            if (child.speciesSet) {
              for (const each of child.speciesSet) {
                node.speciesSet?.add(each);
              }
            }
          });
        }
      }
    });

    const integratingBranches = getIntersectingBranches(tree, integrationTime);

    const nodeIdToName = new Map<number, string>();

    integratingBranches.forEach(({ parent, child, childWeight }) => {
      // TODO: Interpolate between node and parent links.
      // const outLinks = new Map<number, number>();
      // console.log(
      //   `Branch parent: ${parent.name}, child: ${child.name}, childWeight: ${childWeight}`,
      // );
      for (const node of [child, parent]) {
        const weight = node === parent ? 1 - childWeight : childWeight;
        // TODO: Make sure internal tree nodes don't have same name as leaf nodes
        const source = node.isLeaf
          ? network.nodeIdMap[node.name] ?? nodeId++
          : nodeId++;
        if (!node.isLeaf) {
          network.nodeIdMap[node.name] = source;
          nodeIdToName.set(source, node.name);
        }

        if (!links.has(source)) {
          links.set(source, new Map<number, number>());
        }
        const outLinks = links.get(source)!;

        // console.log(
        //   `${node === parent ? 'parent:' : 'child:'}, time: ${
        //     node.time
        //   }, speciesSet: ${node.speciesSet?.size}`,
        // );

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
      }
    });

    const { treeWeightBalance } = this;
    const unscaledNonTreeStrength = network.links.length;
    const totalTreeStrength = treeWeightBalance * unscaledNonTreeStrength;

    // sumTreeLinkWeight * scale = totalTreeStrength
    const scale = totalTreeStrength / sumTreeLinkWeight;
    console.log(
      `Sum non-tree link weight: ${
        unscaledNonTreeStrength * (1 - treeWeightBalance)
      }, tree link weight: ${sumTreeLinkWeight} -> ${
        sumTreeLinkWeight * scale
      }`,
    );

    const treeNodes = new Set<number>();

    for (const [source, outLinks] of links.entries()) {
      if (outLinks.size !== 0) {
        treeNodes.add(source);
      }

      for (const [target, weight] of outLinks.entries()) {
        network.links.push({ source, target, weight: weight * scale });
        network.numTreeLinks++;
      }
    }

    for (const id of treeNodes) {
      if (id >= numSpecies) {
        network.nodes.push({ id, name: nodeIdToName.get(id) });
        network.numTreeNodes++;
      }
    }

    console.log('Nodes missing in network', Array.from(missing));
    console.log('Tree:', network);

    return network;
  }

  createBioregions(tree: Tree) {
    type Species = string;
    type BioregionId = number;

    const { speciesStore, treeStore } = this.rootStore;
    const { cells } = this;

    // Tree nodes are sorted on flow, loop through all to find grid cell nodes
    tree.nodes.forEach((node) => {
      if (node.id >= tree.bipartiteStartId!) {
        const species = speciesStore.speciesMap.get(node.name);
        if (species) {
          species.bioregionId = node.modules[0];
        }
        const treeNode = treeStore.treeNodeMap.get(node.name);
        if (treeNode) {
          treeNode.bioregionId = node.modules[0];
        }
        return;
      }

      const cell = cells[node.id];

      // set the bioregion id to the top mulitlevel module of the node
      // different from the node path!
      cell.bioregionId = node.modules[0];
    });

    const bioregions: Bioregion[] = Array.from(
      { length: tree.numTopModules },
      () => ({
        flow: 0,
        bioregionId: 0,
        numGridCells: 0,
        numRecords: 0,
        species: [],
        mostCommon: [],
        mostIndicative: [],
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

    const bioregionSpeciesCount = new Map<BioregionId, Map<Species, number>>();

    for (const cell of cells) {
      const bioregion = bioregions[cell.bioregionId - 1];

      if (!bioregionSpeciesCount.has(bioregion.bioregionId)) {
        bioregionSpeciesCount.set(bioregion.bioregionId, new Map());
      }
      const speciesCount = bioregionSpeciesCount.get(bioregion.bioregionId)!;

      for (const species of cell.speciesTopList) {
        bioregion.numRecords += species.count;
        speciesCount.set(
          species.name,
          (speciesCount.get(species.name) ?? 0) + species.count,
        );
      }
    }

    // Update speciesStore.speciesMap with regions for each species
    const speciesBioregionMap = new Map<Species, Map<BioregionId, number>>();

    for (const [bioregionId, speciesCount] of bioregionSpeciesCount.entries()) {
      const bioregion = bioregions[bioregionId - 1];
      for (const [name, count] of speciesCount.entries()) {
        bioregion.mostCommon.push({ name, count });

        // Most indicative
        const tf = count / bioregion.numRecords;
        const idf =
          (speciesStore.speciesMap.get(name)?.count ?? 0) /
          speciesStore.numRecords;
        const score = tf / idf;
        bioregion.mostIndicative.push({ name, score });

        const species = speciesStore.speciesMap.get(name)!;
        species.countPerRegion.set(
          bioregionId,
          (species.countPerRegion.get(bioregionId) ?? 0) + count,
        );
      }

      bioregion.mostCommon.sort((a, b) => b.count - a.count);
      bioregion.mostIndicative.sort((a, b) => b.score - a.score);
    }

    return bioregions;
  }
}
