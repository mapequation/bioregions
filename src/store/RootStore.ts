import MapStore from './MapStore';
import LandStore from './LandStore';
import SpeciesStore from './SpeciesStore';
import TreeStore from './TreeStore';
import DataStore from './DataStore';
import InfomapStore from './InfomapStore';
import ColorStore from './ColorStore';
import SettingsStore from './SettingsStore';
import DocumentationStore from './DocumentationStore';
import ExplorerStore from './ExplorerStore';
import PhyloStore from './PhyloStore';
import SelectionStore from './SelectionStore';

export interface StoreOptions {
  noLand?: boolean;
}
export default class RootStore {
  mapStore: MapStore;
  landStore: LandStore;
  infomapStore: InfomapStore;
  speciesStore: SpeciesStore;
  treeStore: TreeStore;
  dataStore: DataStore;
  colorStore: ColorStore;
  settingsStore: SettingsStore;
  selectionStore: SelectionStore;
  documentationStore?: DocumentationStore;
  explorerStore: ExplorerStore;
  phyloStore: PhyloStore;

  constructor(demo = false) {
    this.mapStore = new MapStore(this);
    this.landStore = new LandStore(this, { skipLoad: demo });
    this.infomapStore = new InfomapStore(this);
    this.speciesStore = new SpeciesStore(this);
    this.treeStore = new TreeStore(this);
    this.dataStore = new DataStore(this);
    this.colorStore = new ColorStore(this);
    this.settingsStore = new SettingsStore(this);
    this.selectionStore = new SelectionStore(this);
    if (!demo) {
      this.documentationStore = new DocumentationStore(this);
    }
    this.explorerStore = new ExplorerStore(this);
    this.phyloStore = new PhyloStore(this);
  }

  clearBioregions() {
    // Bioregion ids are renumbered by every run/level change, so a selection can't carry over.
    this.selectionStore.clear();
    this.infomapStore.clearBioregions();
    this.treeStore.clearBioregions();
    this.speciesStore.clearBioregions();
  }
}
