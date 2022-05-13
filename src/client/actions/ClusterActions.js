import {
  GET_CLUSTERS,
  CALCULATE_CLUSTERS,
  ADD_CLUSTERS,
  ADD_CLUSTERS_AND_STATISTICS,
  SHOW_INFOMAP_UI,
  INFOMAP_NUM_TRIALS,
  INFOMAP_MARKOV_TIME,
  PHYLOREGIONS_USE,
  CHANGE_TREE_WEIGHT_MODEL,
  CHANGE_WEIGHT_ON_ABUNDANCE,
} from "../constants/ActionTypes";

/**
 * Add the bioregions clusters
 * @param clusterIds An array of cluster indexes for the corresponding spatial bins array
 */
export function addClusters(clusterIds) {
  return {
    type: ADD_CLUSTERS,
    clusterIds,
  };
}

/**
 * Add the bioregions clusters
 * @param clusterIds An array of cluster indexes for the corresponding spatial bins array
 */
export function addClustersAndStatistics(clusterIds, clusterStatistics) {
  return {
    type: ADD_CLUSTERS_AND_STATISTICS,
    clusterIds,
    clusterStatistics,
  };
}

export function getClusters(infomapArgs = "-v", networkData = null) {
  return {
    type: GET_CLUSTERS,
    infomapArgs,
    networkData,
  };
}

export function calculateClusters(networkData, infomapArgs = "-v") {
  return {
    type: CALCULATE_CLUSTERS,
    payload: {
      networkData, // Nest big payload to not have the big string rendered in redux state monitor
    },
    infomapArgs,
  };
}

export function showInfomapUI(isShowingInfomapUI) {
  return {
    type: SHOW_INFOMAP_UI,
    isShowingInfomapUI,
  };
}

export function setInfomapNumTrials(numTrials) {
  return {
    type: INFOMAP_NUM_TRIALS,
    numTrials,
  };
}

export function setInfomapMarkovTime(markovTime) {
  return {
    type: INFOMAP_MARKOV_TIME,
    markovTime,
  };
}

export function useTreeForClustering(checked) {
  return {
    type: PHYLOREGIONS_USE,
    checked,
  };
}

export function setTreeWeightModel(treeWeightModelIndex) {
  return {
    type: CHANGE_TREE_WEIGHT_MODEL,
    treeWeightModelIndex,
  };
}

export function setWeightOnAbundance(weightOnAbundance) {
  return {
    type: CHANGE_WEIGHT_ON_ABUNDANCE,
    weightOnAbundance,
  };
}
