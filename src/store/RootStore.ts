import MapStore from './MapStore';
import LandStore from './LandStore';
import SpeciesStore from './SpeciesStore';
import InfomapStore from './InfomapStore';

export default class Store {
  mapStore = new MapStore(this);
  landStore = new LandStore(this);
  infomapStore = new InfomapStore(this);
  speciesStore = new SpeciesStore(this);
}
