import type RootStore from './RootStore';
import { loadTree, prepareTree } from '../utils/tree';
import type { Node as PhyloTree } from '../utils/tree';
import { action } from 'mobx';

export default class DocumentationStore {
  rootStore: RootStore;
  tree: PhyloTree | null = null;

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;

    this.loadData();
  }

  setTree = action((tree: PhyloTree) => {
    this.tree = tree;
  });

  async loadData() {
    // const speciesFile = '/bioregions2/data/test.csv';
    const treeFile = '/bioregions2/data/test.nwk';
    const tree = await loadTree(treeFile);
    this.setTree(prepareTree(tree));
  }
}
