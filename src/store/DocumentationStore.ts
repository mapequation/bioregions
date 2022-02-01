import RootStore from './RootStore';
import { loadTree, prepareTree } from '../utils/tree';
import type { Node as PhyloTree } from '../utils/tree';
import { action } from 'mobx';

export default class DocumentationStore {
  rootStore: RootStore;
  demoStore = new RootStore(true);

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;

    this.loadData();
  }

  async loadData() {
    // const speciesFile = '/bioregions2/data/test.csv';
    const treeFile = '/bioregions2/data/test.nwk';
    await this.demoStore.treeStore.load(treeFile);
  }
}
