import * as ActionTypes from '../constants/ActionTypes';
import d3 from 'd3';

const initialState = {
  width: 300,
  height: 300,
  // projection: d3.geo.mercator(),
  projection: d3.geo.equirectangular(),
  // projection: d3.geo.equirectangular.raw,
};

export default function worldmap(state = initialState, action) {
  switch (action.type) {
    case ActionTypes.CHANGE_PROJECTION:
      return {...state, projection: action.projection};
    default:
      return state;
  }
}
