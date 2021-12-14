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
  includeTreeInNetwork: boolean = false;
  weightParameter: number = 0.5; // Domain [0,1] for tree weight

  focusTime: number = 0.5;
  setFocusTime(value: number) {
    this.focusTime = value;
  }
  focusWidth: number = 0.1;
  setFocusWidth(value: number) {
    this.focusWidth = value;
  }

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;

    makeObservable(this, {
      loaded: observable,
      tree: observable.ref,
      treeString: observable,
      includeTreeInNetwork: observable,
      weightParameter: observable,
      focusTime: observable,
      setFocusTime: action,
      focusWidth: observable,
      setFocusWidth: action,
      weightFunction: computed,
      weightCurve: computed,
      numNodesInTree: computed,
      numLeafNodesInTree: computed,
      setLoaded: action,
      setIncludeTree: action,
      setWeightParameter: action,
      setTree: action,
      setTreeString: action,
    });
  }

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

  setWeightParameter(value: number, updateNetwork: boolean = false) {
    console.log('Set weight parameter:', value);
    this.weightParameter = value;
    if (updateNetwork) {
      this.rootStore.infomapStore.updateNetwork();
    }
  }

  get weightFunction() {
    // const w = this.weightParameter;
    // return (t: number) => interpolateExp(t, 200 * w + 1);
    const tMid = this.weightParameter;
    return (t: number) => (Math.abs(t - tMid) <= this.focusWidth ? 1 : 0);
  }

  get weightCurve() {
    const x = range(0, 1, 0.001);
    const f = this.weightFunction;
    const y = map(x, f);
    const data = zip(x, y) as [number, number][];
    const domain = extent(x) as [number, number];
    return { data, domain };
  }

  async load(file: File | string) {
    const tree = await loadText(file);
    this.setTreeString(tree);
    // @ts-ignore
    this.setTree(prepareTree(parseTree(tree)));
    this.setLoaded();
  }
}
