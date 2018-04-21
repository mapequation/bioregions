import {
  SELECT_CLUSTER,
  SELECT_SPECIES,
  SELECT_CELL,
  HIGHLIGHT_CELL,
} from '../constants/ActionTypes';

export function selectCluster(clusterId) {
  return {
    type: SELECT_CLUSTER,
    clusterId,
  };
}

export function unselectCluster() {
  return selectCluster(undefined);
}

export function selectCell(cell) {
  return {
    type: SELECT_CELL,
    cell,
  };
}

export function unselectCell() {
  return selectCell(undefined);
}

export function highlightCell(cell) {
  return {
    type: HIGHLIGHT_CELL,
    cell,
  };
}

export function unhighlightCell() {
  return highlightCell(undefined);
}

export function selectSpecies(species) {
  return {
    type: SELECT_SPECIES,
    species,
  };
}

export function unselectSpecies() {
  return selectSpecies('');
}
