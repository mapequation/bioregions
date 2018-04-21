import * as ActionTypes from '../constants/ActionTypes';
import * as Display from '../constants/Display';

const initialState = {
  infoBy: Display.BY_CELL,
  selectedCluster: -1, // clusterId if selected
  highlightedCell: null, // one of bins, highlighted on mouse over
  selectedSpecies: '',
};

export default function info(state = initialState, action) {
  switch (action.type) {
  case ActionTypes.SET_PANEL_INDEX:
    return {
      ...state,
      panelIndex: action.panelIndex,
    };
  case ActionTypes.SELECT_CLUSTER:
    return {
      ...state,
      selectedCluster: action.clusterId,
    };
  case ActionTypes.HIGHLIGHT_CELL:
    return {
      ...state,
      highlightedCell: action.cell,
    };
  case ActionTypes.SELECT_SPECIES:
    return {
      ...state,
      selectedSpecies: action.species,
    };
  default:
    return state;
  }
}
