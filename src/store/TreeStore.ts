import { makeObservable, observable, action, computed } from 'mobx';
import type RootStore from './RootStore';
import { prepareTree, parseTree, getTreeHistogram } from '../utils/tree';
import { loadText } from '../utils/loader';
import { visitTreeDepthFirstPreOrder } from '../utils/tree';
import type { PhyloNode } from '../utils/tree';
import { format } from 'd3-format';
import { scaleLinear } from 'd3-scale';

export type TreeNode = {
  data: PhyloNode;
  bioregionId?: number;
  // count: number;
  // countPerRegion: Map<number, number>;
};

export default class TreeStore {
  rootStore: RootStore;
  isLoading: boolean = false;
  isLoaded: boolean = false;
  tree: PhyloNode | null = null;
  treeString: string | null = null;
  numLeafNodes: number = 0;
  weightParameter: number = 0.5; // Domain [0,1] for tree weight
  treeNodeMap = new Map<string, TreeNode>();

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;

    makeObservable(this, {
      isLoading: observable,
      isLoaded: observable,
      tree: observable.ref,
      treeNodeMap: observable.ref,
      treeString: observable,
      weightParameter: observable,
      numLeafNodes: observable,
      numNodes: computed,
      histogram: computed,
      timeFormatter: computed,
    });
  }

  clearData = action(() => {
    this.isLoaded = false;
    this.tree = null;
    this.treeString = null;
  });

  get numNodes() {
    return this.treeNodeMap.size;
  }

  get histogram() {
    if (this.tree === null) {
      return [];
    }
    return getTreeHistogram(this.tree);
  }

  /**
   * Return a function that takes a value from the `time` variable and outputs an
   * SI-formatted time before youngest leaf based on the branch lengths in the tree.
   */
  get timeFormatter() {
    if (!this.tree) {
      return (t: number) => format('.1s')(1 - t);
    }
    const scale = scaleLinear().range([this.tree.maxLeafDistance, 0]);
    const f = format('.2s');
    return (time: number) => (time === 1 ? '0' : f(scale(time)));
  }

  setTree = action((tree: PhyloNode | null) => {
    this.tree = tree;
    this.calculateTreeStats();
  });

  setTreeString = action((treeString: string) => {
    this.treeString = treeString;
  });

  setIsLoading = action((isLoading: boolean = true) => {
    this.isLoading = isLoading;
  });

  setIsLoaded = action((isLoaded: boolean = true) => {
    this.isLoading = false;
    this.isLoaded = isLoaded;
  });

  loadString(tree: string) {
    this.setIsLoading();
    this.setTreeString(tree);
    this.setTree(prepareTree(parseTree(tree)));
    this.setIsLoaded();
  }

  async load(file: File | string) {
    this.setIsLoading();
    const tree = await loadText(file);
    this.setTreeString(tree);
    // @ts-ignore
    this.setTree(prepareTree(parseTree(tree)));
    this.setIsLoaded();
  }

  clearBioregions() {
    this.treeNodeMap.forEach((node) => {
      node.bioregionId = undefined;
    });
  }

  calculateTreeStats = action(() => {
    if (!this.tree) {
      return;
    }
    const treeNodeMap = new Map<string, TreeNode>();
    let numLeafNodes: number = 0;
    visitTreeDepthFirstPreOrder(this.tree, (node) => {
      treeNodeMap.set(node.name, {
        data: node,
        bioregionId: undefined,
      });
      if (node.isLeaf) {
        ++numLeafNodes;
      }
    });
    this.treeNodeMap = treeNodeMap;
    this.numLeafNodes = numLeafNodes;
  });
}
