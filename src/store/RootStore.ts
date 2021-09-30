import LandStore from './LandStore';
import SpeciesStore from './SpeciesStore';
import MapStore from './MapStore';

export default class Store {
  landStore = new LandStore(this);
  speciesStore = new SpeciesStore(this);
  mapStore = new MapStore(this);

  constructor() {
    console.log('Creating root store...');
  }
}
