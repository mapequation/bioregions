import RootStore from './RootStore';
import { loadTree, prepareTree } from '../utils/tree';
import type { Node as PhyloTree } from '../utils/tree';
import { action } from 'mobx';

export default class DocumentationStore {
  rootStore: RootStore;
  demoStore = new RootStore(true);

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;

    const { infomapStore, speciesStore } = this.demoStore;

    infomapStore.setIntegrationTime(0.6);
    infomapStore.setSegregationTime(0.2);
    speciesStore.binner.setCellCapacity(0, 100);

    this.loadData();
  }

  async loadData() {
    const speciesFile = '/bioregions2/data/demo.csv';
    const treeFile = '/bioregions2/data/demo.nwk';
    await this.demoStore.treeStore.load(treeFile);
    await this.demoStore.speciesStore.load(speciesFile);
  }
}
