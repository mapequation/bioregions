import {
  CHANGE_STATISTICS_BY,
  CHANGE_MAP_BY,
  CHANGE_OPACITY_BY_RECORDS,
  SET_CLUSTER_COLORS,
  SET_PANEL_INDEX,
} from "../constants/ActionTypes";

export function selectPanel(panelIndex) {
  return {
    type: SET_PANEL_INDEX,
    panelIndex,
  };
}

export function changeStatisticsBy(statisticsBy) {
  return {
    type: CHANGE_STATISTICS_BY,
    statisticsBy,
  };
}

export function changeMapBy(mapBy) {
  return {
    type: CHANGE_MAP_BY,
    mapBy,
  };
}

export function changeOpacityByRecords(opacityByRecords) {
  return {
    type: CHANGE_OPACITY_BY_RECORDS,
    opacityByRecords,
  };
}

export function setClusterColors(clusterColors) {
  return {
    type: SET_CLUSTER_COLORS,
    clusterColors,
  };
}
