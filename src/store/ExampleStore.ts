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

  async loadExample(example: Example) {
    const { speciesStore, treeStore, infomapStore, } = this.rootStore;

    this.rootStore.clearData();
    const { settings } = example;

    settings.minCellSize != null &&
      speciesStore.binner.setMinCellSizeLog2(settings.minCellSize);

    settings.maxCellSize != null &&
      speciesStore.binner.setMaxCellSizeLog2(settings.maxCellSize);

    settings.minCellCapacity != null &&
      speciesStore.binner.setMinCellCapacity(settings.minCellCapacity);

    settings.maxCellCapacity != null &&
      speciesStore.binner.setMaxCellCapacity(settings.maxCellCapacity);

    settings.includeTree != null &&
      infomapStore.setIncludeTree(settings.includeTree)

    if (example.treeFile) {
      await treeStore.load(example.treeFile);
    }
    await speciesStore.load(example.speciesFile);

    // mapStore.setRenderType('heatmap');
    // mapStore.render();

    // await infomapStore.run();

    // mapStore.setRenderType('bioregions');
    // mapStore.render();
  }
}
