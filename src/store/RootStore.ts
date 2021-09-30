import LandStore from './LandStore';
import SpeciesStore from './SpeciesStore';
import ProjectionStore from './ProjectionStore';

export default class Store {
  landStore = new LandStore(this);
  speciesStore = new SpeciesStore(this);
  projectionStore = new ProjectionStore(this);

  constructor() {
    console.log('Creating root store...');
  }
}
