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
  clusters: [],
};

function mergeClustersToBins(clusters, bins) {
  // return bins.map((bin, i) => Object.assign(bin, {clusterId: clusters[i]}));
  if (clusters.length === bins.length) {
    bins.forEach((bin, i) => {
      bin.clusterId = clusters[i];
    });
  }
  return bins;
}

export default function data(state = initialState, action) {
  switch (action.type) {
    case ActionTypes.ADD_FEATURES:
      return {
        ...state,
        havePolygons: action.havePolygons,
        features: action.features,
        bins: state.binner.bins(action.features)
      };
    case ActionTypes.ADD_CLUSTERS:
      return {
        ...state,
        bins: mergeClustersToBins(action.clusters, state.bins),
        clusters: action.clusters
      };
    default:
      return state;
  }
}
