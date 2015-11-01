import * as ActionTypes from '../constants/ActionTypes';
import * as DataFetching from '../constants/DataFetching';
import d3 from 'd3';

const initialState = {
  world: {},
  worldStatus: DataFetching.DATA_NOT_FETCHED,
  width: 300,
  height: 300,
  // projection: d3.geo.mercator(),
  projection: d3.geo.equirectangular(),
  // projection: d3.geo.equirectangular.raw,
};

export default function worldmap(state = initialState, action) {
  switch (action.type) {
    case ActionTypes.LOAD_WORLD:
      console.log("worldmap reducer, got LOAD_WORLD");
      return {
        ...state,
        worldStatus: DataFetching.DATA_FETCHING
      };
    case ActionTypes.ADD_WORLD:
      return {
        ...state,
        worldStatus: DataFetching.DATA_SUCCEEDED,
        world: action.world
      };
    case ActionTypes.CHANGE_PROJECTION:
      return {
        ...state,
        projection: action.projection
      };
    default:
      return state;
  }
}
