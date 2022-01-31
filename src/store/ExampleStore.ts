import type RootStore from './RootStore';

interface ExampleSettings {
  minCellSize?: number;
  maxCellSize?: number;
  minCellCapacity?: number;
  maxCellCapacity?: number;
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

    if (process.env.NODE_ENV === 'development') {
      setTimeout(() => {
        this.loadExample(this.examples[0]);
      }, 1000);
    }
  }

  initExamples() {
    const examples = [];
    if (process.env.NODE_ENV === 'development') {
      examples.push({
        name: 'Demo',
        speciesFile: '/bioregions2/data/test.csv',
        treeFile: '/bioregions2/data/test.nwk',
        size: '140 b',
        settings: {
          minCellSize: 0,
          maxCellSize: 1,
          minCellCapacity: 0,
          maxCellCapacity: 100,
        },
      });

      examples.push({
        name: 'Sample',
        speciesFile: '/bioregions2/data/head.csv',
        treeFile: '/bioregions2/data/head.nwk',
        size: '370 b',
        settings: {
          minCellSize: 0,
          maxCellSize: 1,
          minCellCapacity: 0,
          maxCellCapacity: 100,
        },
      });
    }

    examples.push({
      name: 'Neotropical mammal occurrences',
      speciesFile: '/bioregions2/data/mammals_neotropics.csv',
      treeFile: '/bioregions2/data/mammals_neotropics.nwk',
      size: '2.8 Mb',
      settings: {},
    });

    examples.push({
      name: 'Global mammal occurrences',
      speciesFile: '/bioregions2/data/mammals_global.tsv',
      size: '56 Mb',
      settings: {},
    });

    return examples;
  }

  async loadExample(example: Example) {
    const { speciesStore, treeStore, infomapStore, mapStore } = this.rootStore;

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

    if (example.treeFile) {
      await treeStore.load(example.treeFile);
    }
    await speciesStore.load(example.speciesFile);
    await infomapStore.run();

    mapStore.setRenderType('bioregions');
    mapStore.render();
  }
}
