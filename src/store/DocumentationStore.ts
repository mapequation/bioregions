import RootStore from './RootStore';
import { loadTree, prepareTree } from '../utils/tree';
import type { Node as PhyloTree } from '../utils/tree';
import { action } from 'mobx';

const demoRecords = `species,longitude,latitude
A,0.9,9.8
A,0.7,9.5
A,0.3,8.9
B,0.3,9.2
B,0.8,8.4
B,0.6,7.9
C,0.7,7.3
C,0.5,6.8
C,0.8,5.6
D,0.4,4.5
D,0.6,4.4
E,0.5,3.3
E,0.4,2.8
E,0.3,2.1
F,0.2,0.8
F,0.1,0.4
`;

const demoTree = `((A:0.6,B:0.6)n2:0.2,((C:0.2,D:0.2)n4:0.2,(E:0.1,F:0.1)n5:0.3)n3:0.4)n1;`;
export default class DocumentationStore {
  rootStore: RootStore;
  demoStore = new RootStore(true);

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;
    this.init();
  }

  async init() {
    const { infomapStore, speciesStore } = this.demoStore;

    speciesStore.binner.setCellSizeLog2(0, 1);
    speciesStore.binner.setCellCapacity(0, 100);
    infomapStore.setIntegrationTime(1);
    infomapStore.setSegregationTime(0);
    infomapStore.setNumTrials(5);

    await this.loadData();

    await infomapStore.run();
  }

  async loadData() {
    // const speciesFile = '/bioregions2/data/demo.csv';
    // const treeFile = '/bioregions2/data/demo.nwk';
    // await this.demoStore.speciesStore.load(speciesFile);
    await this.demoStore.treeStore.loadString(demoTree);
    await this.demoStore.speciesStore.loadString(demoRecords);
  }
}
