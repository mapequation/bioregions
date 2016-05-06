import * as ActionTypes from '../constants/ActionTypes';

const initialState = {
  width: 500,
  fontSize: 12,
  showClusteredNodes: true,
};

export default function reducer(state = initialState, action) {
  switch (action.type) {
    case ActionTypes.ADD_PHYLO_TREE:
      return initialState;
    case ActionTypes.SHOW_CLUSTERED_NODES:
      return {
        ...state,
        showClusteredNodes: action.payload,
      }
    default:
      return state;
  }
}
