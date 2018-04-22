import * as ActionTypes from '../constants/ActionTypes';

const initialState = {
  highlightedCell: null, // one of bins, highlighted on mouse over
  selectedSpecies: '',
};

export default function info(state = initialState, action) {
  switch (action.type) {
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
