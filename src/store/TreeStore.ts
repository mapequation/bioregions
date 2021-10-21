import { makeObservable, observable, action } from 'mobx';
import type RootStore from './RootStore';
import { prepareTree, parseTree } from '../utils/tree';
import { loadText } from '../utils/loader';

type Tree = {
  parent: Tree | null;
  children: Tree[];
  name: string;
  uid: number;
  originalChildIndex: number;
  isLeaf: boolean;
  depth: number;
  branchLength: number;
  leafCount: number;
  maxLength: number;
  rootDist: number;
}
export default class TreeStore {
  rootStore: RootStore;
  loaded: boolean = false;
  tree: Tree | null = null;
  treeString: string | null = null;
  includeTreeInNetwork: boolean = false;

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;

    makeObservable(this, {
      loaded: observable,
      tree: observable.ref,
      treeString: observable,
      includeTreeInNetwork: observable,
      toggleIncludeTree: action,
      setTree: action,
      setTreeString: action,
    });
  }

  setTree(tree: Tree) {
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
