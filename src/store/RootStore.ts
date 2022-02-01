import MapStore from './MapStore';
import LandStore from './LandStore';
import SpeciesStore from './SpeciesStore';
import TreeStore from './TreeStore';
import InfomapStore from './InfomapStore';
import ColorStore from './ColorStore';
import SettingsStore from './SettingsStore';
import ExampleStore from './ExampleStore';
import DocumentationStore from './DocumentationStore';

export default class Store {
  mapStore = new MapStore(this);
  landStore = new LandStore(this);
  infomapStore = new InfomapStore(this);
  speciesStore = new SpeciesStore(this);
  treeStore = new TreeStore(this);
  colorStore = new ColorStore(this);
  settingsStore = new SettingsStore(this);
  exampleStore = new ExampleStore(this);
  documentationStore = new DocumentationStore(this);

  clearData() {
    this.infomapStore.clearData();
    this.speciesStore.clearData();
    this.treeStore.clearData();
  }
}
