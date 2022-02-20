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
  loaded: boolean = false;
  tree: PhyloNode | null = null;
  treeString: string | null = null;
  weightParameter: number = 0.5; // Domain [0,1] for tree weight
  treeNodeMap = new Map<string, TreeNode>();

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;

    makeObservable(this, {
      loaded: observable,
      tree: observable.ref,
      treeNodeMap: observable.ref,
      treeString: observable,
      weightParameter: observable,
      numNodesInTree: computed,
      numLeafNodesInTree: computed,
      histogram: computed,
      timeFormatter: computed,
      setLoaded: action,
      setTree: action,
      setTreeString: action,
    });
  }

  clearData = action(() => {
    this.loaded = false;
    this.tree = null;
    this.treeString = null;
  });

  get numNodesInTree() {
    if (this.tree === null) {
      return 0;
    }

    let numNodes = 0;

    visitTreeDepthFirstPreOrder(this.tree, () => {
      ++numNodes;
    });

    return numNodes;
  }

  get numLeafNodesInTree() {
    if (this.tree === null) {
      return 0;
    }

    let numLeafs = 0;

    visitTreeDepthFirstPreOrder(this.tree, (node) => {
      if (node.isLeaf) {
        ++numLeafs;
      }
    });

    return numLeafs;
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

  setTree(tree: PhyloNode | null) {
    this.tree = tree;
    this.calculateTreeStats();
  }

  setTreeString(treeString: string) {
    this.treeString = treeString;
  }

  setLoaded(loaded: boolean = true) {
    this.loaded = loaded;
  }

  loadString(tree: string) {
    this.setTreeString(tree);
    this.setTree(prepareTree(parseTree(tree)));
    this.setLoaded();
  }

  async load(file: File | string) {
    const tree = await loadText(file);
    this.setTreeString(tree);
    // @ts-ignore
    this.setTree(prepareTree(parseTree(tree)));
    this.setLoaded();
  }

  clearBioregions() {
    this.treeNodeMap.forEach((node) => {
      node.bioregionId = undefined;
    });
  }

  calculateTreeStats() {
    if (!this.tree) {
      return;
    }
    visitTreeDepthFirstPreOrder(this.tree, (node) => {
      this.treeNodeMap.set(node.name, {
        data: node,
        bioregionId: undefined,
      });
    });
  }
}
