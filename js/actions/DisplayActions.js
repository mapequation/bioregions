import {
  CHANGE_GROUP_BY,
  SET_CLUSTER_COLORS
} from '../constants/ActionTypes';

export function changeGroupBy(groupBy) {
  return {
    type: CHANGE_GROUP_BY,
    groupBy
  }
}

export function setClusterColors(clusterColors) {
  return {
    type: SET_CLUSTER_COLORS,
    clusterColors
  }
}
