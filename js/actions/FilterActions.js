import {
  SELECT_CLUSTER,
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
