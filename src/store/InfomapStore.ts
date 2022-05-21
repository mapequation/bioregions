import { action, makeObservable, observable, computed } from 'mobx';
import Infomap from '@mapequation/infomap';
import type { Tree, StateTree, Result } from '@mapequation/infomap';
import type {
  BipartiteNetwork,
  StateNetwork,
  MultilayerIntraInterNetwork,
} from '@mapequation/infomap/network';
import type { Arguments } from '@mapequation/infomap/arguments';
import type RootStore from './RootStore';
import {
  getIntersectingBranches,
  visitTreeDepthFirstPreOrder,
  visitTreeDepthFirstPostOrder,
} from '../utils/tree';
import type { PhyloNode } from '../utils/tree';
import { isEqual } from '../utils/math';
import { range } from '../utils/range';

export interface BioregionsNetworkData {
  nodeIdMap: { [name: string]: number };
  numLeafTaxonNodes: number;
  numInternalTaxonNodes: number;
  numGridCellNodes: number;
  numLeafTaxonLinks: number;
  numInternalTaxonLinks: number;
  sumLeafTaxonLinkWeight: number;
  sumInternalTaxonLinkWeight: number;
  sumLinkWeight: number;
  isDirected: boolean;
  includeTree: boolean;
}

export interface BioregionsStateNetworkData extends BioregionsNetworkData {
  numStateGridCellNodes: number;
}

export interface BioregionsNetwork
  extends Required<BipartiteNetwork>,
    BioregionsNetworkData {}
export interface BioregionsStateNetwork
  extends Required<StateNetwork>,
    BioregionsStateNetworkData {}

export interface BioregionsMultilayerNetwork
  extends MultilayerIntraInterNetwork,
    BioregionsNetworkData {
  layers: { id: number; name: string }[];
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
    score: number;
  }[];
  mostIndicative: {
    name: string;
    count: number;
    score: number;
  }[];
};

export default class InfomapStore {
  rootStore: RootStore;
  args: RequiredArgs & Arguments = {
    twoLevel: false,
    numTrials: process.env.NODE_ENV === 'production' ? 5 : 1,
    regularized: false,
    regularizationStrength: 1,
    entropyCorrected: false,
    entropyCorrectionStrength: 1,
    skipAdjustBipartiteFlow: true,
    seed: 123,
    ...defaultArgs,
  };
  network: BioregionsNetwork | BioregionsStateNetwork | null = null;
  multilayerNetwork: BioregionsMultilayerNetwork | null = null;
  numLayers: number = 5;
  multilayerLogTime: boolean = false;
  tree: Tree | StateTree | null = null;
  haveStateNodes: boolean = false;
  treeString?: string;
  includeTreeInNetwork: boolean = true;
  alwaysUseStateNetwork: boolean = false;
  isRunning: boolean = false;
  currentTrial: number = 0;
  infomap: Infomap = new Infomap();
  infomapId: number | null = null;
  infomapOutput: string = '';
  bioregions: Bioregion[] = [];

  error?: string;
  //TODO: Show error in UI
  addError = action((message: string) => {
    this.error = message;
  });

  clearError = action(() => {
    this.error = undefined;
  });

  // The link weight balance from no tree (0) to only tree (1)
  treeWeightBalance: number = 0.5;
  setTreeWeightBalance = action((value: number, updateNetwork = false) => {
    this.treeWeightBalance = value;
    if (updateNetwork) {
      this.updateNetwork();
    }
  });

  diversityOrder: number = 0;
  setDiversityOrder = action(
    (value: number, updateNetwork: boolean = false) => {
      this.diversityOrder = value;
      if (updateNetwork) {
        this.updateNetwork();
      }
    },
  );

  uniformTreeLinks: boolean = true;
  setUniformTreeLinks = action(
    (value: boolean, updateNetwork: boolean = false) => {
      this.uniformTreeLinks = value;
      if (updateNetwork) {
        this.updateNetwork();
      }
    },
  );

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;

    makeObservable(this, {
      error: observable,
      network: observable.ref,
      multilayerNetwork: observable.ref,
      numLayers: observable,
      multilayerLogTime: observable,
      tree: observable.ref,
      treeString: observable,
      infomapOutput: observable,
      haveStateNodes: observable,
      args: observable,
      currentTrial: observable,
      isRunning: observable,
      bioregions: observable.ref,
      diversityOrder: observable,
      treeWeightBalance: observable,
      includeTreeInNetwork: observable,
      alwaysUseStateNetwork: observable,
      uniformTreeLinks: observable,
      integrationTime: observable,
      segregationTime: observable,
      haveStateNetwork: computed,
      numBioregions: computed,
      haveBioregions: computed,
      codelength: computed,
      numLevels: computed,
      relativeCodelengthSavings: computed,
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
    this.treeString = undefined;
    this.isRunning = false;
    this.currentTrial = 0;
    this.bioregions = [];
    this.clearBioregions();
  });

  clearBioregions = () => {};

  get haveStateNetwork() {
    return (
      this.rootStore.treeStore.tree &&
      (this.segregationTime > 0 || this.alwaysUseStateNetwork)
    );
  }

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

  setCurrentTrial = action((trial: number) => {
    this.currentTrial = trial;
  });

  setNumTrials = action((numTrials: number) => {
    this.args.numTrials = numTrials;
  });

  setSeed = action((seed: number) => {
    this.args.seed = seed;
  });

  setSkipAdjustBipartiteFlow = action((value: boolean = true) => {
    this.args.skipAdjustBipartiteFlow = value;
  });

  setTwoLevel = action((value: boolean = true) => {
    this.args.twoLevel = value;
  });

  setRegularized = action((value: boolean = true) => {
    this.args.regularized = value;
  });

  setRegularizationStrength = action((strength: number) => {
    this.args.regularizationStrength = strength;
  });

  setEntropyCorrected = action((value: boolean = true) => {
    this.args.entropyCorrected = value;
  });

  setEntropyCorrectionStrength = action((strength: number) => {
    this.args.entropyCorrectionStrength = strength;
  });

  setAlwaysUseStateNetwork = action(
    (value: boolean, updateNetwork: boolean = true) => {
      this.alwaysUseStateNetwork = value;
      if (updateNetwork) {
        this.updateNetwork();
      }
    },
  );

  setTree = action((tree: Tree | StateTree | null) => {
    this.tree = tree;
  });

  setTreeString = action((treeString?: string) => {
    this.treeString = treeString;
  });

  setNetwork = action(
    (network: BioregionsNetwork | BioregionsStateNetwork | null) => {
      this.network = network;
    },
  );

  setMultilayerNetwork = action(
    (network: BioregionsMultilayerNetwork | null) => {
      this.multilayerNetwork = network;
    },
  );

  setNumLayers = action((numLayers: number) => {
    this.numLayers = numLayers;
  });

  setMultilayerLogTime = action((multilayerLogTime: boolean) => {
    this.multilayerLogTime = multilayerLogTime;
  });

  setBioregions = action((bioregions: Bioregion[]) => {
    this.bioregions = bioregions;
  });

  setStateBioregions = action((bioregions: Bioregion[]) => {
    this.bioregions = bioregions;
  });

  setIsRunning = action((isRunning: boolean = true) => {
    this.isRunning = isRunning;
  });

  setIncludeTree = action((value: boolean = true) => {
    this.includeTreeInNetwork = value;
    this.updateNetwork();
  });

  integrationTime: number = 1;
  setIntegrationTime = action((value: number, updateNetwork = false) => {
    this.integrationTime = value;
    if (updateNetwork) {
      this.updateNetwork();
    }
  });
  segregationTime: number = 0;
  setSegregationTime = action((value: number, updateNetwork = false) => {
    this.segregationTime = value;
    if (updateNetwork) {
      this.updateNetwork();
    }
  });

  get cells() {
    return this.rootStore.speciesStore.binner.cells;
  }

  onInfomapFinished = action((result: Result, id: number) => {
    const {
      json: tree,
      json_states: statesTree,
      tree: treeString,
      tree_states: treeStatesString,
    } = result;

    this.clearBioregions();

    const haveStates = statesTree != null;
    this.haveStateNodes = haveStates;
    const infomapResult = haveStates ? statesTree : tree;

    if (infomapResult) {
      this.createBioregions(infomapResult, haveStates);
      this.setTree(infomapResult);
      this.setTreeString(haveStates ? treeStatesString : treeString);
    }

    console.timeEnd('infomap');
    this.setIsRunning(false);
    this.infomapId = null;
  });

  onInfomapError = (error: string, id: number) => {
    this.infomapId = null;
    console.error(error);
    console.timeEnd('infomap');
    this.setIsRunning(false);
  };

  onInfomapOutput = action((output: string, id: number) => {
    this.infomapOutput += output + '\n';
    this.parseOutput(output);
  });

  async run() {
    if (this.infomapId !== null) {
      await this.abort();
    }
    const { cells } = this;

    if (cells.length === 0) {
      console.error('No cells in binner!');
      return;
    }

    this.setIsRunning();
    this.setCurrentTrial(0);

    const network = this.updateNetwork();

    const args = { ...this.args };
    // const isStateNetwork = 'states' in network;
    if (network.isDirected) {
      args.directed = true;
      // args.regularized = true;
    }

    console.time('infomap');

    return new Promise<void>((resolve, reject) => {
      this.infomapId = this.infomap
        .on('finished', (result, id) => {
          this.onInfomapFinished(result, id);
          resolve();
        })
        .on('error', (err, id) => {
          this.onInfomapError(err, id);
          //reject();
        })
        .run({
          network,
          args,
        });
    });
  }

  async runMultilayer() {
    if (this.infomapId !== null) {
      await this.abort();
    }
    const { cells } = this;

    if (cells.length === 0) {
      console.error('No cells in binner!');
      return;
    }

    this.setIsRunning();
    this.setCurrentTrial(0);

    const network = this.createMultilayerNetwork();
    this.setMultilayerNetwork(network);

    const args = {
      ...this.args,
      multilayerRelaxLimit: 1,
      multilayerRelaxRate: 0.15,
    };
    if (network.isDirected) {
      args.directed = true;
    }

    console.time('infomap');

    return new Promise<void>((resolve, reject) => {
      this.infomapId = this.infomap
        .on('finished', (result, id) => {
          this.onInfomapFinished(result, id);
          resolve();
        })
        .on('error', (err, id) => {
          this.onInfomapError(err, id);
          //reject();
        })
        .run({
          network,
          args,
        });
    });
  }

  async abort() {
    if (this.infomapId === null) {
      return false;
    }

    try {
      await this.infomap.terminate(this.infomapId, 0);
    } catch (e: any) {
      console.error('Worker error', e);
    }
    this.infomapId = null;
    this.setIsRunning(false);
    this.setTree(null);
    this.setTreeString(undefined);
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

  updateNetwork = action(() => {
    console.time('createNetwork');
    const network = this.createNetwork();
    console.timeEnd('createNetwork');
    this.setNetwork(network);
    return network;
  });

  public createNetwork(): BioregionsNetwork | BioregionsStateNetwork {
    if (this.haveStateNetwork) {
      return this.createStateNetwork();
    }
    return this.createStandardNetwork();
  }

  public createStandardNetwork(_integrationTime?: number): BioregionsNetwork {
    const { tree } = this.rootStore.treeStore;
    const includeTree =
      this.includeTreeInNetwork &&
      tree !== null &&
      this.treeWeightBalance !== 0;

    /*
    Starts with cells as nodes up until the bipartiteStartId.
    Then the feature nodes are added.
    */
    const network: BioregionsNetwork = {
      nodes: [],
      links: [],
      bipartiteStartId: 0,
      nodeIdMap: {},
      numLeafTaxonNodes: 0,
      numInternalTaxonNodes: 0,
      numGridCellNodes: 0,
      numLeafTaxonLinks: 0,
      numInternalTaxonLinks: 0,
      sumLeafTaxonLinkWeight: 0,
      sumInternalTaxonLinkWeight: 0,
      sumLinkWeight: 0,
      isDirected: false,
      includeTree,
    };
    const { cells, nameToCellIds } = this.rootStore.speciesStore.binner;

    let nodeId = 0;

    const addNode = (name: string, isGridCell: boolean) => {
      let id = network.nodeIdMap[name];
      if (id != null) {
        return id;
      }
      id = nodeId++;
      network.nodeIdMap[name] = id;
      network.nodes.push({ id, name });
      if (!isGridCell) {
        const treeNode = this.rootStore.treeStore.treeNodeMap.get(name);
        if (treeNode && !treeNode.data.isLeaf) {
          ++network.numInternalTaxonNodes;
        } else {
          ++network.numLeafTaxonNodes;
        }
      } else {
        ++network.numGridCellNodes;
      }
      return id;
    };

    const addLink = (
      sourceName: string,
      targetName: string,
      weight: number,
    ) => {
      const source = addNode(sourceName, false);
      const target = addNode(targetName, true);
      network.links.push({ source, target, weight });
      const treeNode = this.rootStore.treeStore.treeNodeMap.get(sourceName);
      if (treeNode && !treeNode.data.isLeaf) {
        ++network.numInternalTaxonLinks;
        network.sumInternalTaxonLinkWeight += weight;
      } else {
        ++network.numLeafTaxonLinks;
        network.sumLeafTaxonLinkWeight += weight;
      }
    };

    // Add all cells first
    for (let { id: cellId } of cells) {
      addNode(cellId, true);
    }

    network.bipartiteStartId = nodeId;

    // for (let name of Object.keys(nameToCellIds)) {
    //   addNode(name);
    // }

    type NodeId = string;
    type CellId = string;
    type Weight = number;

    const linkMap = new Map<NodeId, Map<CellId, Weight>>();

    const { diversityOrder, treeWeightBalance } = this;
    if (treeWeightBalance < 1) {
      for (let [name, cells] of Object.entries(nameToCellIds)) {
        for (let cellId of cells.values()) {
          const weight =
            (includeTree ? 1 - treeWeightBalance : 1) /
            cells.size ** diversityOrder;
          network.sumLinkWeight += weight;
          // TODO: No need to use the map here if not include tree, will not aggregate on species level
          const outLinks = linkMap.has(name)
            ? linkMap.get(name)!
            : linkMap.set(name, new Map()).get(name)!;
          // if (!outLinks.has(cellId)) {
          //   ++network.numNonTreeLinks;
          // }
          outLinks.set(cellId, (outLinks.get(cellId) ?? 0) + weight);
        }
      }
    }

    // network.numNonTreeNodes = linkMap.size;

    if (!includeTree) {
      for (const [source, outLinks] of linkMap.entries()) {
        for (const [target, weight] of outLinks.entries()) {
          addLink(source, target, weight);
        }
      }

      // If not including tree, we are done.
      return network;
    }

    /*
    Starts with cells as nodes up until the bipartiteStartId.
    Then the feature nodes are added (as in createNetwork).
    First species (leaf) nodes, then the internal tree nodes.
    */

    const integrationTime = _integrationTime ?? this.integrationTime;

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
    const treeLinks = new Map<NodeId, Map<CellId, Weight>>();

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

    const getLinksFromTreeNode = (node: PhyloNode) => {
      const links = new Map<CellId, Weight>();
      let numLinks = 0;

      for (const species of node.speciesSet!) {
        if (!nameToCellIds[species]) {
          missing.add(species);
          continue;
        }

        for (const cellId of nameToCellIds[species]) {
          const currentCount = links.get(cellId) ?? 0;

          if (currentCount === 0 || !this.uniformTreeLinks) {
            links.set(cellId, currentCount + 1);
            ++numLinks;
          }
        }
      }

      return { links, numLinks };
    };

    const addLinks = (
      node: PhyloNode,
      links: Map<CellId, Weight>,
      interpolationWeight: number,
    ) => {
      // TODO: Make sure internal tree nodes don't have same name as leaf nodes

      const outLinks = treeLinks.has(node.name)
        ? treeLinks.get(node.name)!
        : treeLinks.set(node.name, new Map()).get(node.name)!;

      for (const [cellId, count] of links.entries()) {
        const weight = count * interpolationWeight;
        // Aggregate weight
        const currentWeight = outLinks.get(cellId) ?? 0;
        outLinks.set(cellId, currentWeight + weight);
        sumTreeLinkWeight += weight;
      }
    };

    integratingBranches.forEach(({ parent, child, childWeight }) => {
      if (isEqual(childWeight, 1)) {
        return addLinks(child, getLinksFromTreeNode(child).links, 1);
      }
      if (isEqual(childWeight, 0)) {
        return addLinks(parent, getLinksFromTreeNode(parent).links, 1);
      }
      const parentLinks = getLinksFromTreeNode(parent);
      const childLinks = getLinksFromTreeNode(child);

      if (childLinks.numLinks === 0) {
        // console.warn('No links from child', child.name);
        // Happens when integration time is more than leaf time
        // TODO: Adjust tree times to reach 1.0 at leafs if close?
        return addLinks(parent, parentLinks.links, 1);
      }

      const degreeRatio = parentLinks.numLinks / childLinks.numLinks;
      const relativeDegreeDifference = degreeRatio - 1;
      const adjustedChildWeight =
        parentLinks.numLinks === 0
          ? 1
          : (childWeight * degreeRatio) /
            (1 + childWeight * relativeDegreeDifference);
      const adjustedParentWeight = 1 - adjustedChildWeight;

      addLinks(parent, parentLinks.links, adjustedParentWeight);
      addLinks(child, childLinks.links, adjustedChildWeight);
    });

    // treeStrength / (treeStrength + speciesStrength) = treeWeightBalance
    // => treeStrength * (1 - treeWeightBalance) = speciesStrength * treeWeightBalance
    // => treeStrength / treeWeightBalance = speciesStrength / (1 - treeWeightBalance)
    const totalTreeStrength = isEqual(treeWeightBalance, 1)
      ? sumTreeLinkWeight
      : (treeWeightBalance * network.sumLinkWeight) / (1 - treeWeightBalance);

    // sumTreeLinkWeight * scale = totalTreeStrength
    const scale = totalTreeStrength / sumTreeLinkWeight;
    console.log(
      `Sum non-tree link weight: ${
        network.sumLinkWeight
      }, tree link weight: ${sumTreeLinkWeight} -> ${
        sumTreeLinkWeight * scale
      } => balance: ${
        (sumTreeLinkWeight * scale) /
        (sumTreeLinkWeight * scale + network.sumLinkWeight)
      }`,
    );

    for (const [treeNodeName, treeOutLinks] of treeLinks.entries()) {
      // Aggregate to link map
      const outLinks = linkMap.get(treeNodeName) ?? new Map<string, number>();
      if (outLinks.size === 0) {
        // network.numTreeNodes++;
        linkMap.set(treeNodeName, outLinks);
      }

      // Aggregate links from tree (overlaps on tree leaf nodes)
      for (const [cellId, weight] of treeOutLinks.entries()) {
        if (outLinks.size === 0) {
          // network.numTreeLinks++;
        }
        outLinks.set(cellId, (outLinks.get(cellId) ?? 0) + weight * scale);
      }
    }

    // Add links to network
    for (const [treeNodeName, treeOutLinks] of linkMap.entries()) {
      for (const [cellId, weight] of treeOutLinks.entries()) {
        addLink(treeNodeName, cellId, weight);
      }
    }

    console.log('Nodes missing in network', Array.from(missing));
    console.log('Network:', network);

    return network;
  }

  public createMultilayerNetwork(): BioregionsMultilayerNetwork {
    console.log('Generate multilayer network...');
    console.time('createMultilayerNetwork');

    const { numLayers } = this;
    const layerIds = Array.from(range(numLayers));
    // const integrationTimes = layerIds.map(
    //   (n) => (n + 1) / numLayers,
    // );
    const integrationTimes: number[] = [];
    if (this.multilayerLogTime) {
      let t = 0;
      let dt = 0.5;
      layerIds.forEach(() => {
        t += dt;
        dt /= 2;
        integrationTimes.push(t);
      });
    } else {
      let t = 0;
      let dt = 1 / numLayers;
      layerIds.forEach(() => {
        t += dt;
        integrationTimes.push(t);
      });
    }
    const { timeFormatter } = this.rootStore.treeStore;
    const layers = integrationTimes.map((t, id) => ({
      id,
      name: timeFormatter(t),
    }));

    const multilayerNetwork: BioregionsMultilayerNetwork = {
      nodes: [],
      intra: [],
      nodeIdMap: {}, // name -> id
      numLeafTaxonNodes: 0,
      numInternalTaxonNodes: 0,
      numGridCellNodes: 0,
      numLeafTaxonLinks: 0,
      numInternalTaxonLinks: 0,
      sumLeafTaxonLinkWeight: 0,
      sumInternalTaxonLinkWeight: 0,
      sumLinkWeight: 0,
      isDirected: false,
      includeTree: true,
      layers,
    };

    // const integrationTimes = [0.5, 0.7, 0.8, 0.9, 1];
    console.log('Multilayer integration times:', integrationTimes);
    let nodeIdCounter = 0;

    integrationTimes.forEach((t, layerId) => {
      const network = this.createStandardNetwork(t);
      network.nodes.forEach((node) => {
        if (multilayerNetwork.nodeIdMap[node.name!] === undefined) {
          const id = nodeIdCounter++;
          multilayerNetwork.nodeIdMap[node.name!] = id;
          multilayerNetwork.nodes!.push({ id, name: node.name! });
        }
      });
      network.links.forEach((link) => {
        const sourceName = network.nodes[link.source].name!;
        const targetName = network.nodes[link.target].name!;
        multilayerNetwork.intra.push({
          layerId,
          source: multilayerNetwork.nodeIdMap[sourceName],
          target: multilayerNetwork.nodeIdMap[targetName],
          weight: link.weight!,
        });
      });
      multilayerNetwork.numLeafTaxonNodes += network.numLeafTaxonNodes;
      multilayerNetwork.numInternalTaxonNodes += network.numInternalTaxonNodes;
      multilayerNetwork.numGridCellNodes += network.numGridCellNodes;
      multilayerNetwork.numLeafTaxonLinks += network.numLeafTaxonLinks;
      multilayerNetwork.numInternalTaxonLinks += network.numInternalTaxonLinks;
      multilayerNetwork.sumLeafTaxonLinkWeight +=
        network.sumLeafTaxonLinkWeight;
      multilayerNetwork.sumInternalTaxonLinkWeight +=
        network.sumInternalTaxonLinkWeight;
      multilayerNetwork.sumLinkWeight += network.sumLinkWeight;
    });

    console.timeEnd('createMultilayerNetwork');
    console.log('Multilayer network:', multilayerNetwork);
    return multilayerNetwork;
  }

  public createStateNetwork(): BioregionsStateNetwork {
    const isDirected = false;
    /*
    Starts with cells as nodes up until the bipartiteStartId.
    Then the feature nodes are added.
    */
    const network: BioregionsStateNetwork = {
      nodes: [],
      links: [],
      states: [],
      nodeIdMap: {}, // name -> id
      numLeafTaxonNodes: 0,
      numInternalTaxonNodes: 0,
      numGridCellNodes: 0,
      numLeafTaxonLinks: 0,
      numInternalTaxonLinks: 0,
      sumLeafTaxonLinkWeight: 0,
      sumInternalTaxonLinkWeight: 0,
      sumLinkWeight: 0,
      isDirected: false,
      includeTree: true,
      numStateGridCellNodes: 0,
    };
    const { cells, nameToCellIds } = this.rootStore.speciesStore.binner;
    const { tree } = this.rootStore.treeStore;

    if (!tree) {
      throw new Error("Can't create state network without a tree");
    }
    if (!this.includeTreeInNetwork) {
      throw new Error("Can't create state network without including the tree");
    }

    console.log('Create state network!');

    // Clear existing memory
    visitTreeDepthFirstPreOrder(tree, (node) => {
      node.memory = undefined;
    });

    const segregationBranches = getIntersectingBranches(
      tree,
      this.segregationTime,
    );
    for (const branch of segregationBranches) {
      visitTreeDepthFirstPreOrder(branch.child, (node) => {
        node.memory = branch;
      });
    }

    let physicalId = 0;
    const nameToPhysicalId = new Map<string, number>();

    // const addPhysicalCellNode = (cellId: string) => {
    //   let id = nameToPhysicalId.get(cellId);
    //   if (id === undefined) {
    //     id = physicalId++;
    //     nameToPhysicalId.set(cellId, id);
    //     network.nodes.push({ id, name: cellId });
    //     ++network.numGridCellNodes;
    //   }
    //   return id;
    // }
    // TODO: If only tree, some grid cells may be empty, better to not add them to network?
    // Create physical cell nodes
    for (const cell of cells) {
      const id = physicalId++;
      nameToPhysicalId.set(cell.id, id);
      network.nodes.push({ id, name: cell.id });
      ++network.numGridCellNodes;
    }

    const { treeWeightBalance, diversityOrder } = this;
    const { treeNodeMap } = this.rootStore.treeStore;

    type StateNode = typeof network.states[number];
    const cellStateNodes = new Map<string, StateNode>(); // stateName -> stateNode
    const phyloStateNodes = new Map<string, StateNode>(); // name -> stateNode

    const getCellStateName = (cellId: string, memTaxonName: string) =>
      `${cellId}_${memTaxonName}`;

    let stateIdCounter = 0;
    const addCellStateNode = (cellId: string, memTaxonName: string) => {
      const cellPhysId = nameToPhysicalId.get(cellId)!;
      const stateName = getCellStateName(cellId, memTaxonName);
      let stateNode = cellStateNodes.get(stateName);
      if (stateNode == null) {
        const stateId = stateIdCounter++;
        stateNode = { id: cellPhysId, name: stateName, stateId };
        cellStateNodes.set(stateName, stateNode);
        network.nodeIdMap[stateName] = stateId;
        network.states.push(stateNode);
        ++network.numStateGridCellNodes;
      }
      return stateNode;
    };

    const isInternalTaxonNode = (taxonName: string) => {
      const treeNode = this.rootStore.treeStore.treeNodeMap.get(taxonName);
      return treeNode && !treeNode.data.isLeaf;
    };

    const addTaxonNode = (taxonName: string) => {
      // Add physical node
      let taxonId = nameToPhysicalId.get(taxonName);
      if (taxonId == null) {
        taxonId = physicalId++;
        nameToPhysicalId.set(taxonName, taxonId);
        network.nodes.push({ id: taxonId, name: taxonName });
        if (isInternalTaxonNode(taxonName)) {
          ++network.numInternalTaxonNodes;
        } else {
          ++network.numLeafTaxonNodes;
        }
      }
      // Add state node
      let stateNode = phyloStateNodes.get(taxonName);
      if (stateNode == null) {
        const stateId = stateIdCounter++;
        stateNode = { id: taxonId, name: taxonName, stateId };
        phyloStateNodes.set(taxonName, stateNode);
        network.nodeIdMap[taxonName] = stateId;
        network.states.push(stateNode);
      }
      return stateNode;
    };

    type CellId = string;
    type Weight = number;
    type StateCellName = string;
    type TaxonName = string;
    type StateCellOutLinks = Map<StateCellName, Weight>;
    type StateLinkMap = Map<TaxonName, StateCellOutLinks>;

    const linkMap = new Map<TaxonName, StateCellOutLinks>();

    const addStateLink = (
      taxonName: string,
      cellId: string,
      memTaxonName: string,
      weight: number,
      linkMap: StateLinkMap,
    ) => {
      const cellStateNode = addCellStateNode(cellId, memTaxonName);
      const taxonNode = addTaxonNode(taxonName);

      const outLinks =
        linkMap.get(taxonNode.name!) ??
        linkMap.set(taxonNode.name!, new Map()).get(taxonNode.name!)!;
      outLinks.set(
        cellStateNode.name!,
        (outLinks.get(cellStateNode.name!) ?? 0) + weight,
      );
    };

    const addLinksToNetwork = () => {
      for (const [taxonName, outLinks] of linkMap.entries()) {
        for (const [stateCellName, weight] of outLinks) {
          const taxonNode = phyloStateNodes.get(taxonName)!;
          const cellStateNode = cellStateNodes.get(stateCellName)!;

          network.links.push({
            source: taxonNode.stateId,
            target: cellStateNode.stateId,
            weight,
          });
          if (isDirected) {
            // TODO: Uniform link weight back?
            network.links.push({
              target: taxonNode.stateId,
              source: cellStateNode.stateId,
              weight,
            });
          }
          const totWeight = (isDirected ? 2 : 1) * weight;
          network.sumLinkWeight += totWeight;

          if (isInternalTaxonNode(taxonName)) {
            ++network.numInternalTaxonLinks;
            network.sumInternalTaxonLinkWeight += totWeight;
          } else {
            ++network.numLeafTaxonLinks;
            network.sumLeafTaxonLinkWeight += totWeight;
          }
        }
      }
    };

    let unscaledNonTreeStrength = 0;

    if (treeWeightBalance < 1) {
      // Create physical species nodes
      for (let [name, cells] of Object.entries(nameToCellIds)) {
        // Create state cell nodes and links from species
        const treeNode = treeNodeMap.get(name);
        if (!treeNode) {
          // Use root node as memory if species not part of tree
          const unscaledWeight = 1 / cells.size ** diversityOrder;
          const weight = (1 - treeWeightBalance) * unscaledWeight;
          unscaledNonTreeStrength += unscaledWeight * cells.size;

          for (const cellId of cells.values()) {
            addStateLink(name, cellId, tree.name, weight, linkMap);
          }
          continue;
        }
        const memBranch = treeNode.data.memory!;

        const unscaledWeight = 1 / cells.size ** diversityOrder;
        const weight = (1 - treeWeightBalance) * unscaledWeight;
        unscaledNonTreeStrength += unscaledWeight * cells.size;

        for (const cellId of cells.values()) {
          if (!isEqual(1 - memBranch.childWeight, 0)) {
            addStateLink(
              name,
              cellId,
              memBranch.parent.name,
              weight * (1 - memBranch.childWeight),
              linkMap,
            );
          }
          if (!isEqual(memBranch.childWeight, 0)) {
            addStateLink(
              name,
              cellId,
              memBranch.child.name,
              weight * memBranch.childWeight,
              linkMap,
            );
          }
        }
      }
    }

    if (treeWeightBalance === 0) {
      addLinksToNetwork();
      return network;
    }

    const { integrationTime } = this;

    // Add internal nodes
    const missing = new Set<string>();

    const treeLinks = new Map<TaxonName, Map<StateCellName, Weight>>();

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

    const getMemLinksFromTreeNode = (node: PhyloNode) => {
      const links = new Map<TaxonName, Map<CellId, Weight>>();
      let sumWeight = 0;

      for (const speciesName of node.speciesSet!) {
        if (!nameToCellIds[speciesName]) {
          missing.add(speciesName);
          continue;
        }
        const memBranch = treeNodeMap.get(speciesName)?.data.memory!;
        for (const memNode of [memBranch.parent, memBranch.child]) {
          const memTaxonName = memNode.name;
          const memWeight =
            memNode === memBranch.child
              ? memBranch.childWeight
              : 1 - memBranch.childWeight;
          if (isEqual(memWeight, 0)) {
            continue;
          }
          const memLinks = links.get(memTaxonName) ?? new Map();
          if (memLinks.size === 0) {
            links.set(memTaxonName, memLinks);
          }

          for (const cellId of nameToCellIds[speciesName]) {
            const currentWeight = memLinks.get(cellId) ?? 0;

            if (currentWeight === 0 || !this.uniformTreeLinks) {
              memLinks.set(cellId, currentWeight + memWeight);
              sumWeight += memWeight;
            }
          }
        }
      }

      return { links, sumWeight };
    };

    const addLinks = (
      treeNode: PhyloNode,
      links: Map<TaxonName, Map<CellId, Weight>>,
      interpolationWeight: number,
    ) => {
      // TODO: Make sure internal tree nodes don't have same name as leaf nodes
      const taxonName = treeNode.name;

      for (const [memTaxonName, memLinks] of links.entries()) {
        for (const [cellId, memWeight] of memLinks.entries()) {
          const weight =
            (memWeight * interpolationWeight) / links.size ** diversityOrder;
          sumTreeLinkWeight += weight;
          addStateLink(taxonName, cellId, memTaxonName, weight, treeLinks);
        }
      }
    };

    integratingBranches.forEach(({ parent, child, childWeight }) => {
      if (isEqual(childWeight, 1)) {
        return addLinks(child, getMemLinksFromTreeNode(child).links, 1);
      }
      if (isEqual(childWeight, 0)) {
        return addLinks(parent, getMemLinksFromTreeNode(parent).links, 1);
      }
      const parentLinks = getMemLinksFromTreeNode(parent);
      const childLinks = getMemLinksFromTreeNode(child);

      if (isEqual(childLinks.sumWeight, 0)) {
        // console.warn('No links from child', child.name);
        // Happens when integration time is more than leaf time
        // TODO: Adjust tree times to reach 1.0 at leafs if close?
        return addLinks(parent, parentLinks.links, 1);
      }

      const degreeRatio = isEqual(parentLinks.sumWeight, 0)
        ? 1
        : parentLinks.sumWeight / childLinks.sumWeight;
      const relativeDegreeDifference = degreeRatio - 1;
      const adjustedChildWeight =
        (childWeight * degreeRatio) /
        (1 + childWeight * relativeDegreeDifference);
      const adjustedParentWeight = 1 - adjustedChildWeight;

      addLinks(parent, parentLinks.links, adjustedParentWeight);
      addLinks(child, childLinks.links, adjustedChildWeight);
    });

    // treeStrength / (treeStrength + speciesStrength) = treeWeightBalance
    // => treeStrength * (1 - treeWeightBalance) = speciesStrength * treeWeightBalance
    // => treeStrength / treeWeightBalance = speciesStrength / (1 - treeWeightBalance)
    // const totalTreeStrength = isEqual(treeWeightBalance, 1)
    //   ? sumTreeLinkWeight
    //   : (treeWeightBalance * sumNonTreeStrength) / (1 - treeWeightBalance);
    const totalTreeStrength = isEqual(treeWeightBalance, 1)
      ? sumTreeLinkWeight
      : treeWeightBalance * unscaledNonTreeStrength;

    const scale = totalTreeStrength / sumTreeLinkWeight;

    console.log(
      `Sum non-tree link weight: ${
        unscaledNonTreeStrength * (1 - treeWeightBalance)
      }, tree link weight: ${sumTreeLinkWeight} -> ${
        sumTreeLinkWeight * scale
      } => balance: ${
        (sumTreeLinkWeight * scale) /
        (sumTreeLinkWeight * scale +
          unscaledNonTreeStrength * (1 - treeWeightBalance))
      }`,
    );

    for (const [treeNodeName, treeOutLinks] of treeLinks.entries()) {
      // Aggregate to link map
      const outLinks = linkMap.get(treeNodeName) ?? new Map<string, number>();
      if (outLinks.size === 0) {
        // network.numTreeNodes++;
        linkMap.set(treeNodeName, outLinks);
      }

      // Aggregate links from tree (overlaps on tree leaf nodes)
      for (const [stateCellName, weight] of treeOutLinks.entries()) {
        if (outLinks.size === 0) {
          // network.numTreeLinks++;
        }
        outLinks.set(
          stateCellName,
          (outLinks.get(stateCellName) ?? 0) + weight * scale,
        );
      }
    }

    addLinksToNetwork();

    console.log('Nodes missing in network', Array.from(missing));
    console.log('Network:', network);

    return network;
  }

  serializeNetwork(
    network?: BioregionsNetwork | BioregionsStateNetwork | null,
  ): string | undefined {
    if (!network) {
      network = this.network;
    }
    if (!network) {
      return;
    }
    const lines = ['*vertices'];
    for (const node of network.nodes) {
      lines.push(`${node.id} "${node.name}"`);
    }
    if ('states' in network) {
      lines.push('*states');
      for (const node of network.states) {
        lines.push(`${node.stateId} ${node.id} "${node.name}"`);
      }
    }
    lines.push('*links');
    for (const link of network.links) {
      lines.push(`${link.source} ${link.target} ${link.weight}`);
    }
    return lines.join('\n');
  }

  serializeMultilayerNetwork(
    network?: BioregionsMultilayerNetwork | null,
  ): string | undefined {
    if (!network) {
      network = this.multilayerNetwork;
    }
    if (!network) {
      return;
    }
    const lines = ['*vertices'];
    for (const node of network.nodes!) {
      lines.push(`${node.id} "${node.name}"`);
    }
    lines.push('*intra');
    for (const link of network.intra) {
      lines.push(
        `${link.layerId} ${link.source} ${link.target} ${link.weight}`,
      );
    }
    return lines.join('\n');
  }

  createBioregions(tree: Tree | StateTree, haveStates: boolean) {
    if (haveStates) {
      this.createStateBioregions(tree as StateTree);
    } else {
      this.createNonStateBioregions(tree as Tree);
    }
  }

  createNonStateBioregions(tree: Tree) {
    const { speciesStore, treeStore } = this.rootStore;
    const { cells } = this;
    this.rootStore.clearBioregions();

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

    if (!tree.nodes) {
      console.error('No nodes!');
      console.log(tree);
      this.addError(`Infomap output error, please report.`);
      return;
    }
    // Tree nodes are sorted on flow, loop through all to find grid cell nodes
    tree.nodes.forEach((node) => {
      const bioregionId = node.path[0];
      const bioregion = bioregions[bioregionId - 1];
      bioregion.bioregionId = bioregionId;
      bioregion.flow += node.flow;

      if (node.id >= tree.bipartiteStartId!) {
        bioregion.species.push(node.name);
        const species = speciesStore.speciesMap.get(node.name);
        if (species) {
          species.bioregionId = bioregionId;
        }
        const treeNode = treeStore.treeNodeMap.get(node.name);
        if (treeNode) {
          treeNode.bioregionId = bioregionId;
        }
        return;
      }

      ++bioregion.numGridCells;
      const cell = cells[node.id];
      if (!cell) {
        console.warn(`Can't find cell for node ${node.id}`, node);
      }

      // set the bioregion id to the top mulitlevel module of the node
      // different from the node path!
      cell.bioregionId = bioregionId;
    });

    type Species = string;
    type BioregionId = number;
    const bioregionSpeciesCount = new Map<BioregionId, Map<Species, number>>();

    for (const cell of cells) {
      if (!cell.isLeaf) {
        // Don't include patched cells to statistics as all records are on leaf cells
        continue;
      }
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
    for (const [bioregionId, speciesCount] of bioregionSpeciesCount.entries()) {
      const bioregion = bioregions[bioregionId - 1];
      for (const [name, count] of speciesCount.entries()) {
        // Most indicative
        const tf = count / bioregion.numRecords;
        const idf =
          (speciesStore.speciesMap.get(name)?.count ?? 0) /
          speciesStore.numRecords;
        const score = tf / idf;
        bioregion.mostIndicative.push({ name, score, count });
        bioregion.mostCommon.push({ name, score, count });

        const species = speciesStore.speciesMap.get(name)!;
        species.countPerRegion.set(
          bioregionId,
          (species.countPerRegion.get(bioregionId) ?? 0) + count,
        );
      }

      bioregion.mostCommon.sort((a, b) => b.count - a.count);
      bioregion.mostIndicative.sort((a, b) =>
        isEqual(a.score, b.score) ? b.count - a.count : b.score - a.score,
      );
    }

    this.setBioregions(bioregions);
  }

  createStateBioregions(tree: StateTree) {
    if (tree.args.includes('multilayer-relax-limit')) {
      this.createMultilayerBioregions(tree);
      return;
    }
    const { speciesStore, treeStore } = this.rootStore;
    const { cells } = this;
    this.rootStore.clearBioregions();
    console.log(tree);

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

    if (!tree.nodes) {
      console.error('No nodes!');
      console.log(tree);
      this.addError(`Infomap output error, please report.`);
      return;
    }
    // Tree nodes are sorted on flow, loop through all to find grid cell nodes
    tree.nodes.forEach((node) => {
      // TODO: FIX!! node.modules[0] is 1 for all taxon nodes, but path[0] is not!
      // const bioregionId = node.modules[0];
      const bioregionId = node.path[0];
      const bioregion = bioregions[bioregionId - 1];
      bioregion.bioregionId = bioregionId;
      bioregion.flow += node.flow;

      // Physical cell nodes are first
      const isTaxon = node.id >= cells.length;
      if (isTaxon) {
        bioregion.species.push(node.name);
        const species = speciesStore.speciesMap.get(node.name);
        if (species) {
          species.bioregionId = bioregionId;
        }
        const treeNode = treeStore.treeNodeMap.get(node.name);
        if (treeNode) {
          treeNode.bioregionId = bioregionId;
        }
        return;
      }

      ++bioregion.numGridCells;
      const cell = cells[node.id];
      // TODO: Add state name to Infomap output?
      const stateName = (this.network as BioregionsStateNetwork).states[
        node.stateId
      ].name!;
      node.name = stateName;
      const memTaxonName = stateName.split('_')[1]!;

      cell.bioregionId = bioregionId;
      cell.overlappingBioregions.addStateNode(
        bioregionId,
        node.flow,
        memTaxonName,
      );
    });
    for (const cell of cells) {
      cell.overlappingBioregions.calcTopBioregions();
    }

    type Species = string;
    type BioregionId = number;
    const bioregionSpeciesCount = new Map<BioregionId, Map<Species, number>>();

    let numSpeciesWithoutBioregions = 0;
    for (const cell of cells) {
      if (!cell.isLeaf) {
        // Don't include patched cells to statistics as all records are on leaf cells
        continue;
      }
      for (const { count, name } of cell.speciesTopList) {
        const species = speciesStore.speciesMap.get(name)!;

        const bioregionId = species.bioregionId!;
        if (!bioregionId) {
          // console.warn(`No bioregion id for species ${name}: ${bioregionId}`);
          ++numSpeciesWithoutBioregions;
          continue;
        }
        const bioregion = bioregions[bioregionId - 1];
        // if (!bioregion) {
        //   console.warn(`No bioregion ${bioregionId} for species ${name}`);
        //   continue;
        // }

        if (!bioregionSpeciesCount.has(bioregionId)) {
          bioregionSpeciesCount.set(bioregionId, new Map());
        }
        const speciesCount = bioregionSpeciesCount.get(bioregionId)!;

        bioregion.numRecords += count;
        speciesCount.set(name, (speciesCount.get(name) ?? 0) + count);
      }
    }
    if (numSpeciesWithoutBioregions > 0) {
      // May happen if 100% tree weight
      console.log(`${numSpeciesWithoutBioregions} species without bioregions.`);
    }

    // Update speciesStore.speciesMap with regions for each species
    for (const [bioregionId, speciesCount] of bioregionSpeciesCount.entries()) {
      const bioregion = bioregions[bioregionId - 1];
      for (const [name, count] of speciesCount.entries()) {
        // Most indicative
        const tf = count / bioregion.numRecords;
        const idf =
          (speciesStore.speciesMap.get(name)?.count ?? 0) /
          speciesStore.numRecords;
        const score = tf / idf;
        bioregion.mostIndicative.push({ name, score, count });
        bioregion.mostCommon.push({ name, score, count });

        const species = speciesStore.speciesMap.get(name)!;
        species.countPerRegion.set(
          bioregionId,
          (species.countPerRegion.get(bioregionId) ?? 0) + count,
        );
      }

      bioregion.mostCommon.sort((a, b) => b.count - a.count);
      bioregion.mostIndicative.sort((a, b) => b.score - a.score);
    }

    this.setStateBioregions(bioregions);
  }

  createMultilayerBioregions(tree: StateTree) {
    const { speciesStore, treeStore } = this.rootStore;
    const { cells } = this;
    this.rootStore.clearBioregions();
    console.log(
      'Create multilayer bioregions... network:',
      this.multilayerNetwork,
    );
    // @ts-ignore
    tree.layers = this.multilayerNetwork!.layers;
    console.log(tree);

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

    if (!tree.nodes) {
      console.error('No nodes!');
      console.log(tree);
      this.addError(`Infomap output error, please report.`);
      return;
    }
    // Tree nodes are sorted on flow, loop through all to find grid cell nodes
    tree.nodes.forEach((node) => {
      // TODO: FIX!! node.modules[0] is 1 for all taxon nodes, but path[0] is not!
      // const bioregionId = node.modules[0];
      const bioregionId = node.path[0];
      const bioregion = bioregions[bioregionId - 1];
      bioregion.bioregionId = bioregionId;
      bioregion.flow += node.flow;

      // Physical cell nodes are first
      const isTaxon = node.id >= cells.length;
      if (isTaxon) {
        bioregion.species.push(node.name);
        const species = speciesStore.speciesMap.get(node.name);
        if (species) {
          species.bioregionId = bioregionId;
        }
        const treeNode = treeStore.treeNodeMap.get(node.name);
        if (treeNode) {
          treeNode.bioregionId = bioregionId;
        }
        return;
      }

      ++bioregion.numGridCells;
      const cell = cells[node.id];
      const memTaxonName = `layer-${node.layerId}`;

      cell.bioregionId = bioregionId;
      cell.overlappingBioregions.addStateNode(
        bioregionId,
        node.flow,
        memTaxonName,
      );
    });
    for (const cell of cells) {
      cell.overlappingBioregions.calcTopBioregions();
    }

    type Species = string;
    type BioregionId = number;
    const bioregionSpeciesCount = new Map<BioregionId, Map<Species, number>>();

    let numSpeciesWithoutBioregions = 0;
    for (const cell of cells) {
      if (!cell.isLeaf) {
        // Don't include patched cells to statistics as all records are on leaf cells
        continue;
      }
      for (const { count, name } of cell.speciesTopList) {
        const species = speciesStore.speciesMap.get(name)!;

        const bioregionId = species.bioregionId!;
        if (!bioregionId) {
          // console.warn(`No bioregion id for species ${name}: ${bioregionId}`);
          ++numSpeciesWithoutBioregions;
          continue;
        }
        const bioregion = bioregions[bioregionId - 1];
        // if (!bioregion) {
        //   console.warn(`No bioregion ${bioregionId} for species ${name}`);
        //   continue;
        // }

        if (!bioregionSpeciesCount.has(bioregionId)) {
          bioregionSpeciesCount.set(bioregionId, new Map());
        }
        const speciesCount = bioregionSpeciesCount.get(bioregionId)!;

        bioregion.numRecords += count;
        speciesCount.set(name, (speciesCount.get(name) ?? 0) + count);
      }
    }
    if (numSpeciesWithoutBioregions > 0) {
      // May happen if 100% tree weight
      console.log(`${numSpeciesWithoutBioregions} species without bioregions.`);
    }

    // Update speciesStore.speciesMap with regions for each species
    for (const [bioregionId, speciesCount] of bioregionSpeciesCount.entries()) {
      const bioregion = bioregions[bioregionId - 1];
      for (const [name, count] of speciesCount.entries()) {
        // Most indicative
        const tf = count / bioregion.numRecords;
        const idf =
          (speciesStore.speciesMap.get(name)?.count ?? 0) /
          speciesStore.numRecords;
        const score = tf / idf;
        bioregion.mostIndicative.push({ name, score, count });
        bioregion.mostCommon.push({ name, score, count });

        const species = speciesStore.speciesMap.get(name)!;
        species.countPerRegion.set(
          bioregionId,
          (species.countPerRegion.get(bioregionId) ?? 0) + count,
        );
      }

      bioregion.mostCommon.sort((a, b) => b.count - a.count);
      bioregion.mostIndicative.sort((a, b) => b.score - a.score);
    }

    this.setStateBioregions(bioregions);
  }
}
