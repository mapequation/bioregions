import * as ActionTypes from '../constants/ActionTypes';

const initialState = {
  havePolygons: false,
  features: [],
};

export default function data(state = initialState, action) {
  switch (action.type) {
    case ActionTypes.ADD_FEATURES:
      return {havePolygons: action.havePolygons, features: action.features};
    default:
      return state;
  }
}
