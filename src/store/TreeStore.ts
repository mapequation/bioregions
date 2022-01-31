import { makeObservable, observable, action, computed } from 'mobx';
import type RootStore from './RootStore';
import { prepareTree, parseTree } from '../utils/tree';
import { loadText } from '../utils/loader';
import { visitTreeDepthFirstPreOrder } from '../utils/tree';
import type { Node as PhyloTree } from '../utils/tree';
import { extent, range, map, zip } from 'd3';
import { interpolateExp } from '../utils/math';

export default class TreeStore {
  rootStore: RootStore;
  loaded: boolean = false;
  tree: PhyloTree | null = null;
  treeString: string | null = null;
  includeTreeInNetwork: boolean = true;
  weightParameter: number = 0.5; // Domain [0,1] for tree weight

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

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;

    makeObservable(this, {
      loaded: observable,
      tree: observable.ref,
      treeString: observable,
      includeTreeInNetwork: observable,
      weightParameter: observable,
      integrationTime: observable,
      segregationTime: observable,
      numNodesInTree: computed,
      numLeafNodesInTree: computed,
      setLoaded: action,
      setIncludeTree: action,
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

  setTree(tree: PhyloTree | null) {
    this.tree = tree;
    // this.calculateTreeStats();
  }

  setTreeString(treeString: string) {
    this.treeString = treeString;
  }

  setLoaded(loaded: boolean = true) {
    this.loaded = loaded;
  }

  setIncludeTree(value: boolean = true) {
    this.includeTreeInNetwork = value;
    this.rootStore.infomapStore.updateNetwork();
  }

  async load(file: File | string) {
    const tree = await loadText(file);
    this.setTreeString(tree);
    // @ts-ignore
    this.setTree(prepareTree(parseTree(tree)));
    this.setLoaded();
  }
}
