import * as ActionTypes from '../constants/ActionTypes';
import QuadtreeGeoBinner from '../utils/QuadtreeGeoBinner';
import * as Binning from '../constants/Binning';

const initialBinningState = {
  binnerType: Binning.QUAD_TREE,
  binnerTypes: [Binning.QUAD_TREE], //TODO: Support Binning.TRIANGLE_TREE, Binning.HEXAGON
  minNodeSize: 1,
  maxNodeSize: 8,
  densityThreshold: 100,
  renderer: QuadtreeGeoBinner.renderer,
};

function binning(state = initialBinningState, action) {
  switch (action.type) {
    case ActionTypes.BINNING_CHANGE_TYPE:
      return {
        ...state,
        binnerType: action.binnerType
      }
    case ActionTypes.BINNING_MIN_NODE_SIZE:
      return {
        ...state,
        minNodeSize: action.minNodeSize
      }
    case ActionTypes.BINNING_MAX_NODE_SIZE:
      return {
        ...state,
        maxNodeSize: action.maxNodeSize
      }
    case ActionTypes.BINNING_DENSITY_THRESHOLD:
      return {
        ...state,
        densityThreshold: action.densityThreshold
      }
    default:
      return state;
  }
}

const initialState = {
  havePolygons: false,
  features: [], // GeoJSON features
  binning: initialBinningState,
  bins: [], // bins = binner.bins(features)
  clusters: [],
};

function getBins(binning, features) {
  let binner = new QuadtreeGeoBinner()
   .minNodeSize(binning.minNodeSize)
   .maxNodeSize(binning.maxNodeSize)
   .densityThreshold(binning.densityThreshold);
  return binner.bins(features);
}

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
        bins: getBins(state.binning, action.features)
      };
    case ActionTypes.ADD_CLUSTERS:
      return {
        ...state,
        bins: mergeClustersToBins(action.clusters, state.bins),
        clusters: action.clusters
      };
    case ActionTypes.BINNING_CHANGE_TYPE:
    case ActionTypes.BINNING_MIN_NODE_SIZE:
    case ActionTypes.BINNING_MAX_NODE_SIZE:
    case ActionTypes.BINNING_DENSITY_THRESHOLD:
      let nextBinning = binning(state.binning, action)
      return {
        ...state,
        binning: nextBinning,
        bins: getBins(nextBinning, state.features),
        clusters: [] // Reset clusters on changed binning
      }
    default:
      return state;
  }
}
