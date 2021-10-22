import { makeObservable, observable, action, computed } from 'mobx';
import type RootStore from './RootStore';
import { prepareTree, parseTree } from '../utils/tree';
import { loadText } from '../utils/loader';
import { visitTreeDepthFirst } from '../utils/tree'
import type { Node as PhyloTree } from '../utils/tree'

export default class TreeStore {
  rootStore: RootStore;
  loaded: boolean = false;
  tree: PhyloTree | null = null;
  treeString: string | null = null;
  includeTreeInNetwork: boolean = false;

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;

    makeObservable(this, {
      loaded: observable,
      tree: observable.ref,
      treeString: observable,
      includeTreeInNetwork: observable,
      numNodesInTree: computed,
      numLeafNodesInTree: computed,
      toggleIncludeTree: action,
      setTree: action,
      setTreeString: action,
    });
  }

  get numNodesInTree() {
    if (this.tree === null) {
      return 0;
    }

    let numNodes = 0;

    visitTreeDepthFirst(this.tree, () => {
      ++numNodes;
    });

    return numNodes;
  }

  get numLeafNodesInTree() {
    if (this.tree === null) {
      return 0;
    }

    let numLeafs = 0;

    visitTreeDepthFirst(this.tree, (node) => {
      if (node.isLeaf) {
        ++numLeafs;
      }
    });

    return numLeafs;
  }

  setTree(tree: PhyloTree) {
    this.tree = tree;
  }

  setTreeString(treeString: string) {
    this.treeString = treeString;
  }

  setLoaded(loaded: boolean = true) {
    this.loaded = loaded;
  }

  toggleIncludeTree() {
    this.includeTreeInNetwork = !this.includeTreeInNetwork;
  }

  async load(file: File | string) {
    const tree = await loadText(file);
    this.setTreeString(tree);
    // @ts-ignore
    this.setTree(prepareTree(parseTree(tree)));
    this.setLoaded()
  }
}
