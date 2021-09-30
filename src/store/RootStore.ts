import LandStore from './LandStore';
import SpeciesStore from './SpeciesStore';

export default class Store {
  landStore = new LandStore(this);
  speciesStore = new SpeciesStore(this);

  constructor() {
    console.log('Creating root store...');
  }
}
