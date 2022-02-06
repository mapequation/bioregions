import {
  action,
  makeObservable,
  observable,
  computed,
  runInAction,
} from 'mobx';
import Infomap from '@mapequation/infomap';
import type { Tree, StateTree, Result } from '@mapequation/infomap';
import type {
  BipartiteNetwork,
  StateNetwork,
} from '@mapequation/infomap/network';
import type { Arguments } from '@mapequation/infomap/arguments';
import type RootStore from './RootStore';
import {
  getIntersectingBranches,
  visitTreeDepthFirstPreOrder,
  visitTreeDepthFirstPostOrder,
} from '../utils/tree';
import type { PhyloNode } from '../utils/tree';

interface BioregionsNetwork extends Required<BipartiteNetwork> {
  nodeIdMap: { [name: string]: number };
  numTreeNodes: number;
  numTreeLinks: number;
  numNonTreeLinks: number;
  numNonTreeNodes: number;
  sumLinkWeight: number;
  isDirected: boolean;
}

interface BioregionsStateNetwork extends Required<StateNetwork> {
  nodeIdMap: { [name: string]: number };
  numTreeNodes: number;
  numTreeLinks: number;
  numNonTreeLinks: number;
  numNonTreeNodes: number;
  sumLinkWeight: number;
  isDirected: boolean;
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
    entropyCorrected: false,
    entropyCorrectionStrength: 1,
    skipAdjustBipartiteFlow: true,
    ...defaultArgs,
  };
  network: BioregionsNetwork | BioregionsStateNetwork | null = null;
  tree: Tree | StateTree | null = null;
  haveStateNodes: boolean = false;
  treeString?: string;
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

  uniformTreeLinks: boolean = true;
  setUniformTreeLinks(value: boolean, updateNetwork: boolean = false) {
    this.uniformTreeLinks = value;
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
      haveStateNodes: observable,
      args: observable,
      currentTrial: observable,
      isRunning: observable,
      bioregions: observable.ref,
      diversityOrder: observable,
      setDiversityOrder: action,
      treeWeightBalance: observable,
      includeTreeInNetwork: observable,
      uniformTreeLinks: observable,
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
    this.treeString = undefined;
    this.isRunning = false;
    this.currentTrial = 0;
    this.bioregions = [];
    this.clearBioregions();
  });

  clearBioregions = () => {
    this.cells.forEach((cell) => {
      cell.overlappingBioregions.clear();
    });
  };

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

  setTree(tree: Tree | StateTree | null) {
    this.tree = tree;
  }

  setTreeString(treeString?: string) {
    this.treeString = treeString;
  }

  setNetwork(network: BioregionsNetwork | BioregionsStateNetwork | null) {
    this.network = network;
  }

  setBioregions = action((bioregions: Bioregion[]) => {
    this.bioregions = bioregions;
  });

  setStateBioregions = action((bioregions: Bioregion[]) => {
    this.bioregions = bioregions;
  });

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

    const args = { ...this.args };
    // const isStateNetwork = 'states' in network;
    if (network.isDirected) {
      args.directed = true;
      args.regularized = true;
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
          reject();
        })
        .run({
          network,
          args,
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

  updateNetwork() {
    console.time('createNetwork');
    const network = this.createNetwork();
    console.timeEnd('createNetwork');
    this.setNetwork(network);
    return network;
  }

  public createNetwork(): BioregionsNetwork | BioregionsStateNetwork {
    if (this.segregationTime > 0 && this.rootStore.treeStore.tree) {
      return this.createStateNetwork();
    }
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
      numNonTreeLinks: 0,
      numNonTreeNodes: 0,
      isDirected: false,
    };
    const { cells, nameToCellIds } = this.rootStore.speciesStore.binner;

    let nodeId = 0;

    const addNode = (name: string) => {
      let id = network.nodeIdMap[name];
      if (id != null) {
        return id;
      }
      id = nodeId++;
      network.nodeIdMap[name] = id;
      network.nodes.push({ id, name });
      return id;
    };

    const addLink = (
      sourceName: string,
      targetName: string,
      weight: number,
    ) => {
      const source = addNode(sourceName);
      const target = addNode(targetName);
      network.links.push({ source, target, weight });
    };

    // Add all cells first
    for (let { id: cellId } of cells) {
      addNode(cellId);
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
    for (let [name, cells] of Object.entries(nameToCellIds)) {
      for (let cellId of cells.values()) {
        const weight = (1 - treeWeightBalance) / cells.size ** diversityOrder;
        network.sumLinkWeight += weight;
        // TODO: No need to use the map here if not include tree, will not aggregate on species level
        const outLinks = linkMap.has(name)
          ? linkMap.get(name)!
          : linkMap.set(name, new Map()).get(name)!;
        if (!outLinks.has(cellId)) {
          ++network.numNonTreeLinks;
        }
        outLinks.set(cellId, (outLinks.get(cellId) ?? 0) + weight);
      }
    }

    network.numNonTreeNodes = network.nodes.length;

    const { tree } = this.rootStore.treeStore;
    const includeTree =
      this.includeTreeInNetwork &&
      tree &&
      this.integrationTime !== 1 &&
      this.treeWeightBalance !== 0;

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

    const { integrationTime } = this;

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

    integratingBranches.forEach(({ parent, child, childWeight }) => {
      const parentLinks = getLinksFromTreeNode(parent);
      const childLinks = getLinksFromTreeNode(child);

      if (childLinks.numLinks === 0) {
        console.warn('No links from child', child.name);
      }

      const degreeRatio = parentLinks.numLinks / childLinks.numLinks;
      const relativeDegreeDifference = degreeRatio - 1;
      const adjustedChildWeight =
        (childWeight * degreeRatio) /
        (1 + childWeight * relativeDegreeDifference);
      const adjustedParentWeight = 1 - adjustedChildWeight;

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

      addLinks(parent, parentLinks.links, adjustedParentWeight);
      addLinks(child, childLinks.links, adjustedChildWeight);
    });

    const unscaledNonTreeStrength = network.numNonTreeLinks;
    const totalTreeStrength = treeWeightBalance * unscaledNonTreeStrength;

    // sumTreeLinkWeight * scale = totalTreeStrength
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
        network.numTreeNodes++;
        linkMap.set(treeNodeName, outLinks);
      }

      // Aggregate links from tree (overlaps on tree leaf nodes)
      for (const [cellId, weight] of treeOutLinks.entries()) {
        if (outLinks.size === 0) {
          network.numTreeLinks++;
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
      numTreeNodes: 0,
      numTreeLinks: 0,
      sumLinkWeight: 0,
      numNonTreeLinks: 0,
      numNonTreeNodes: 0,
      isDirected,
    };
    const { cells, nameToCellIds } = this.rootStore.speciesStore.binner;
    const { tree } = this.rootStore.treeStore;

    if (!tree) {
      throw new Error("Can't create state network without a tree");
    }

    console.log('Create state network!');

    // Clear existing memory
    visitTreeDepthFirstPreOrder(tree, (node) => {
      node.memory = [];
    });

    const segregationBranches = getIntersectingBranches(
      tree,
      this.segregationTime,
    );
    for (const branch of segregationBranches) {
      visitTreeDepthFirstPreOrder(branch.child, (node) => {
        node.memory?.push(branch);
      });
      if (this.integrationTime < this.segregationTime) {
        // Nodes earlier than segregation nodes should use
        // all descendant segregation nodes as memory
        let parent: PhyloNode | null = branch.parent;
        while (parent) {
          parent.memory?.push(branch);
          parent = parent.parent;
        }
      }
    }
    // let nodeId = 0;
    // let stateNodeId = 0;

    let physicalId = 0;
    const nameToPhysicalId = new Map<string, number>();

    // Create physical cell nodes
    for (const cell of cells) {
      const id = physicalId++;
      nameToPhysicalId.set(cell.id, id);
      network.nodes.push({ id, name: cell.id });
    }

    const { treeWeightBalance, diversityOrder } = this;
    const { treeNodeMap } = this.rootStore.treeStore;

    type StateNode = typeof network.states[number];
    const cellStateNodes = new Map<string, StateNode>(); // stateName -> stateNode
    const phyloStateNodes = new Map<string, StateNode>(); // name -> stateNode

    const getCellStateName = (cellId: string, phyloNode: PhyloNode) =>
      `${cellId}_${phyloNode.name}`;

    let stateIdCounter = 0;
    const addCellStateNode = (cellId: string, phyloNode: PhyloNode) => {
      const cellPhysId = nameToPhysicalId.get(cellId)!;
      const stateName = getCellStateName(cellId, phyloNode);
      let stateNode = cellStateNodes.get(stateName);
      if (stateNode == null) {
        const stateId = stateIdCounter++;
        stateNode = { id: cellPhysId, name: stateName, stateId };
        cellStateNodes.set(stateName, stateNode);
        network.nodeIdMap[stateName] = stateId;
        network.states.push(stateNode);
      }
      return stateNode;
    };

    const addTaxonNode = (taxonName: string) => {
      // Add physical node
      let taxonId = nameToPhysicalId.get(taxonName);
      if (taxonId == null) {
        taxonId = physicalId++;
        nameToPhysicalId.set(taxonName, taxonId);
        network.nodes.push({ id: taxonId, name: taxonName });
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
      memoryNode: PhyloNode,
      weight: number,
      linkMap: StateLinkMap,
    ) => {
      const cellStateNode = addCellStateNode(cellId, memoryNode);
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
          network.sumLinkWeight += weight;
          if (isDirected) {
            // TODO: Uniform link weight back?
            network.links.push({
              target: taxonNode.stateId,
              source: cellStateNode.stateId,
              weight,
            });
            network.sumLinkWeight += weight;
          }
        }
      }
    };

    let unscaledNonTreeStrength = 0;

    for (let [name, cells] of Object.entries(nameToCellIds)) {
      // Create physical species nodes
      const id = physicalId++;
      nameToPhysicalId.set(name, id);
      network.nodes.push({ id, name });

      // Create state cell nodes and links from species
      const treeNode = treeNodeMap.get(name);
      if (!treeNode) {
        // TODO: Use root node as memory if species not part of tree?
        continue;
      }
      const memory = treeNode.data.memory!;
      console.log(
        `Species ${name} -> memory: ${memory
          .map((b) => `(${b.parent.name},${b.child.name})`)
          .join(', ')}`,
      );

      const unscaledWeight = 1 / cells.size ** diversityOrder;
      const weight = (1 - treeWeightBalance) * unscaledWeight;
      unscaledNonTreeStrength += unscaledWeight;

      for (const cellId of cells.values()) {
        for (const stateBranch of memory) {
          addStateLink(
            name,
            cellId,
            stateBranch.parent,
            weight * (1 - stateBranch.childWeight),
            linkMap,
          );
          addStateLink(
            name,
            cellId,
            stateBranch.child,
            weight * stateBranch.childWeight,
            linkMap,
          );
        }
      }
    }

    const { integrationTime } = this;
    if (integrationTime === 1) {
      addLinksToNetwork();
      return network;
    }

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

    integratingBranches.forEach(({ parent, child, childWeight }) => {
      const parentLinks = getLinksFromTreeNode(parent);
      const childLinks = getLinksFromTreeNode(child);

      if (childLinks.numLinks === 0) {
        console.warn('No links from child', child.name);
      }

      const degreeRatio = parentLinks.numLinks / childLinks.numLinks;
      const relativeDegreeDifference = degreeRatio - 1;
      const adjustedChildWeight =
        (childWeight * degreeRatio) /
        (1 + childWeight * relativeDegreeDifference);
      const adjustedParentWeight = 1 - adjustedChildWeight;

      const addLinks = (
        treeNode: PhyloNode,
        links: Map<CellId, Weight>,
        interpolationWeight: number,
      ) => {
        // TODO: Make sure internal tree nodes don't have same name as leaf nodes
        const taxonName = treeNode.name;

        for (const [cellId, count] of links.entries()) {
          const memory = treeNode.memory!;
          console.log(
            `Taxon ${taxonName} -> memory: ${memory
              .map((b) => `(${b.parent.name},${b.child.name})`)
              .join(', ')}`,
          );

          const weight =
            (count * interpolationWeight * treeWeightBalance) /
            links.size ** diversityOrder;
          sumTreeLinkWeight += weight;

          for (const stateBranch of memory) {
            addStateLink(
              taxonName,
              cellId,
              stateBranch.parent,
              weight * (1 - stateBranch.childWeight),
              treeLinks,
            );
            addStateLink(
              taxonName,
              cellId,
              stateBranch.child,
              weight * stateBranch.childWeight,
              treeLinks,
            );
          }
        }
      };

      addLinks(parent, parentLinks.links, adjustedParentWeight);
      addLinks(child, childLinks.links, adjustedChildWeight);
    });

    const totalTreeStrength = treeWeightBalance * unscaledNonTreeStrength;

    // sumTreeLinkWeight * scale = totalTreeStrength
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
        network.numTreeNodes++;
        linkMap.set(treeNodeName, outLinks);
      }

      // Aggregate links from tree (overlaps on tree leaf nodes)
      for (const [stateCellName, weight] of treeOutLinks.entries()) {
        if (outLinks.size === 0) {
          network.numTreeLinks++;
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
    treeStore.clearBioregions();

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

    // Tree nodes are sorted on flow, loop through all to find grid cell nodes
    tree.nodes.forEach((node) => {
      const bioregionId = node.modules[0];
      const bioregion = bioregions[bioregionId - 1];
      bioregion.bioregionId = bioregionId;
      bioregion.flow += node.flow;

      if (node.id >= tree.bipartiteStartId!) {
        bioregion.species.push(node.name);
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

      ++bioregion.numGridCells;
      const cell = cells[node.id];

      // set the bioregion id to the top mulitlevel module of the node
      // different from the node path!
      cell.bioregionId = node.modules[0];
    });

    type Species = string;
    type BioregionId = number;
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

    this.setBioregions(bioregions);
  }

  createStateBioregions(tree: StateTree) {
    const { speciesStore, treeStore } = this.rootStore;
    const { cells } = this;
    treeStore.clearBioregions();
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
        const species = speciesStore.speciesMap.get(node.name);
        bioregion.species.push(node.name);
        if (species) {
          species.bioregionId = bioregionId;
        }
        const treeNode = treeStore.treeNodeMap.get(node.name);
        if (treeNode) {
          treeNode.bioregionId = bioregionId;
        }
        console.log(node.name, bioregionId, species, treeNode);
        return;
      }

      ++bioregion.numGridCells;
      const cell = cells[node.id];
      // TODO: Add state name to Infomap output?
      const stateName = (this.network as BioregionsStateNetwork).states[
        node.stateId
      ].name!;
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

    for (const cell of cells) {
      for (const { count, name } of cell.speciesTopList) {
        const species = speciesStore.speciesMap.get(name)!;

        const bioregionId = species.bioregionId!;
        const bioregion = bioregions[bioregionId - 1];

        if (!bioregionSpeciesCount.has(bioregionId)) {
          bioregionSpeciesCount.set(bioregionId, new Map());
        }
        const speciesCount = bioregionSpeciesCount.get(bioregionId)!;

        bioregion.numRecords += count;
        speciesCount.set(name, (speciesCount.get(name) ?? 0) + count);
      }
    }

    // Update speciesStore.speciesMap with regions for each species
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

    this.setStateBioregions(bioregions);
  }
}
