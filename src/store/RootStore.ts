import MapStore from './MapStore';
import LandStore from './LandStore';
import SpeciesStore from './SpeciesStore';
import TreeStore from './TreeStore';
import InfomapStore from './InfomapStore';
import ColorStore from './ColorStore';
import SettingsStore from './SettingsStore';
import ExampleStore from './ExampleStore';
import DocumentationStore from './DocumentationStore';

export interface StoreOptions {
  noLand?: boolean;
}
export default class RootStore {
  mapStore: MapStore;
  landStore: LandStore;
  infomapStore: InfomapStore;
  speciesStore: SpeciesStore;
  treeStore: TreeStore;
  colorStore: ColorStore;
  settingsStore: SettingsStore;
  exampleStore: ExampleStore;
  documentationStore?: DocumentationStore;

  constructor(demo = false) {
    this.mapStore = new MapStore(this);
    this.landStore = new LandStore(this, { skipLoad: demo });
    this.infomapStore = new InfomapStore(this);
    this.speciesStore = new SpeciesStore(this);
    this.treeStore = new TreeStore(this);
    this.colorStore = new ColorStore(this);
    this.settingsStore = new SettingsStore(this);
    this.exampleStore = new ExampleStore(this);
    if (!demo) {
      this.documentationStore = new DocumentationStore(this);
    }
  }

  clearData() {
    this.infomapStore.clearData();
    this.speciesStore.clearData();
    this.treeStore.clearData();
  }
}
