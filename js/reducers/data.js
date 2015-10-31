import * as ActionTypes from '../constants/ActionTypes';
import QuadtreeBinner from '../utils/QuadtreeBinner'

const initialState = {
  havePolygons: false,
  features: [], // GeoJSON features
  binner: new QuadtreeBinner()
    .x((point) => point.geometry.coordinates[0])
    .y((point) => point.geometry.coordinates[1])
    .extent([[-180, -90], [180, 90]])
    .minNodeSize(1),
  bins: [], // bins = binner.bins(features)
};

export default function data(state = initialState, action) {
  switch (action.type) {
    case ActionTypes.ADD_FEATURES:
      return {
        ...state,
        havePolygons: action.havePolygons,
        features: action.features,
        bins: state.binner.bins(action.features)
      };
    default:
      return state;
  }
}
