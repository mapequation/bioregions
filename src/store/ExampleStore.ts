import type RootStore from './RootStore';
import examplesData from '../examples.json';

interface ExampleSettings {
  minCellSize?: number;
  maxCellSize?: number;
  minCellCapacity?: number;
  maxCellCapacity?: number;
  includeTree?: boolean;
}

export interface Example {
  name: string;
  speciesFile: string;
  treeFile?: string;
  size: string;
  settings: ExampleSettings;
}
export default class ExampleStore {
  rootStore: RootStore;
  examples: Example[] = this.initExamples();

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;

    // if (process.env.NODE_ENV === 'development') {
    //   setTimeout(() => {
    //     this.loadExample(this.examples[0]);
    //   }, 1000);
    // }
  }

  initExamples(): Example[] {
    return examplesData
      .filter((e) => !e.devOnly || process.env.NODE_ENV === 'development')
      .map((e) => ({
        name: e.name,
        speciesFile: `/bioregions/${e.speciesFile}`,
        treeFile: e.treeFile ? `/bioregions/${e.treeFile}` : undefined,
        size: e.size,
        settings: e.settings,
      }));
  }

  /** TODO(S6): this store is deleted; the Examples tab calls `dataStore.loadExample`. */
  loadExample(example: Example) {
    return this.rootStore.dataStore.loadExample({ ...example, id: example.name }, 'examples');
  }
}
