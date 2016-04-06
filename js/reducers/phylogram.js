import * as ActionTypes from '../constants/ActionTypes';

const initialState = {
  width: 500,
  fontSize: 12,
};

export default function phylogram(state = initialState, action) {
  switch (action.type) {
    case ActionTypes.ADD_PHYLO_TREE:
      return state;
    default:
      return state;
  }
}
