import {
  SELECT_CLUSTER,
  SELECT_SPECIES,
} from '../constants/ActionTypes';

export function selectCluster(clusterId) {
  return {
    type: SELECT_CLUSTER,
    clusterId
  }
}

export function unselectCluster(clusterId) {
  return selectCluster(undefined);
}

export function selectSpecies(species) {
  return {
    type: SELECT_SPECIES,
    species
  }
}

export function unselectSpecies(species) {
  return selectSpecies("");
}
