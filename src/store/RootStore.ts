import MapStore from './MapStore';
import LandStore from './LandStore';
import SpeciesStore from './SpeciesStore';
import InfomapStore from './InfomapStore';

export default class Store {
  mapStore = new MapStore(this);
  landStore = new LandStore(this);
  speciesStore = new SpeciesStore(this);
  infomapStore = new InfomapStore(this);
}
