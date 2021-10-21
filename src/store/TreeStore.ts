import { makeObservable, observable, action } from 'mobx';
import type RootStore from './RootStore';
import { loadTree } from '../utils/tree';
import { prepareTree } from '../utils/tree/treeUtils';
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


  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;

    makeObservable(this, {
      loaded: observable,
      tree: observable.ref,
      treeString: observable,
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

  async loadTree(file: File | string) {
    this.setTreeString(await loadText(file));

    const tree = await loadTree(file);
    // @ts-ignore
    this.setTree(prepareTree(tree));
    console.log(this.tree);
    this.loaded = true;
  }
}
