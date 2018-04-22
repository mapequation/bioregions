import * as ActionTypes from '../constants/ActionTypes';
import * as Display from '../constants/Display';

const initialState = {
  panelIndex: 0, // control panel
  statisticsBy: Display.BY_SPECIES,
  mapBy: Display.BY_CELL,
  infoBy: Display.BY_CELL,
  isShowingInfomapUI: false,
};

export default function display(state = initialState, action) {
  switch (action.type) {
  case ActionTypes.SELECT_CELL:
    if (!action.cell) {
      return state;
    }
    return {
      ...state,
      panelIndex: Display.PANEL_INFO,
    };
  case ActionTypes.SET_PANEL_INDEX:
    return {
      ...state,
      panelIndex: action.panelIndex,
    };
  case ActionTypes.ADD_SPECIES_AND_BINS:
    return {
      ...state,
      mapBy: Display.BY_CELL,
      infoBy: Display.BY_CELL,
    };
  case ActionTypes.ADD_CLUSTERS_AND_STATISTICS:
    return {
      ...state,
      statisticsBy: Display.BY_CLUSTER,
      mapBy: Display.BY_CLUSTER,
      infoBy: Display.BY_CLUSTER,
      panelIndex: Display.PANEL_INFO,
      isShowingInfomapUI: false,
    };
  case ActionTypes.BINNING_CHANGE_TYPE:
  case ActionTypes.BINNING_MIN_NODE_SIZE:
  case ActionTypes.BINNING_MAX_NODE_SIZE:
  case ActionTypes.BINNING_NODE_CAPACITY:
  case ActionTypes.BINNING_LOWER_THRESHOLD:
  case ActionTypes.BINNING_PATCH_SPARSE_NODES:
    return {
      ...state,
      statisticsBy: Display.BY_SPECIES,
      mapBy: Display.BY_CELL,
    };
  case ActionTypes.CHANGE_MAP_BY:
    return {
      ...state,
      mapBy: action.mapBy,
    };
  case ActionTypes.CHANGE_INFO_BY:
    return {
      ...state,
      infoBy: action.infoBy,
    };
  case ActionTypes.CHANGE_STATISTICS_BY:
    return {
      ...state,
      statisticsBy: action.statisticsBy,
    };
  case ActionTypes.SHOW_INFOMAP_UI:
    return {
      ...state,
      isShowingInfomapUI: action.isShowingInfomapUI,
    };
  default:
    return state;
  }
}
