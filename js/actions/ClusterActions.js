import {GET_CLUSTERS, ADD_CLUSTERS} from '../constants/ActionTypes';

/**
* Add the bioregions clusters
* @param clusterIds An array of cluster indexes for the corresponding spatial bins array
*/
export function addClusters(clusterIds, clusterStatistics) {
  return {
    type: ADD_CLUSTERS,
    clusterIds,
    clusterStatistics
  }
}

export function getClusters(infomapArgs = "-v") {
  return {
    type: GET_CLUSTERS,
    infomapArgs
  }
}
