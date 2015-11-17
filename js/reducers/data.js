import * as ActionTypes from '../constants/ActionTypes';
import QuadtreeGeoBinner from '../utils/QuadtreeGeoBinner';
import * as Binning from '../constants/Binning';
import * as Display from '../constants/Display';
import R from 'ramda';
import crossfilter from 'crossfilter';
import d3 from 'd3';
import * as S from '../utils/statistics';
import * as colors from '../utils/colors';
import DataWorker from 'worker!../workers/DataWorker';

const initialBinningState = {
  binnerType: Binning.QUAD_TREE,
  binnerTypes: [Binning.QUAD_TREE], //TODO: Support Binning.TRIANGLE_TREE, Binning.HEXAGON
  minNodeSize: 1,
  maxNodeSize: 4,
  densityThreshold: 100,
  renderer: QuadtreeGeoBinner.renderer,
  binningLoading: false,
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

var dataWorker = new DataWorker();

const initialState = {
  dataWorker,
  havePolygons: false,
  features: [], // GeoJSON features
  species: [], // features count by name, array of {name: string, count: number}
  binning: initialBinningState,
  binningLoading: false,
  bins: [], // bins = binner.bins(features)
  clusterIds: [], // array<int> of cluster id:s, matching bins array in index
  isClustering: false,
  clusters: [], // features grouped by cluster
  groupBy: Display.BY_NAME, // name or cluster when clusters ready
  clusterColors: [], // array of chroma colors for each cluster
};

function getBins(binning, features) {
  let binner = new QuadtreeGeoBinner()
   .minNodeSize(binning.minNodeSize)
   .maxNodeSize(binning.maxNodeSize)
   .densityThreshold(binning.densityThreshold);
  return binner.bins(features);
}

function mergeClustersToBins(clusterIds, bins) {
  // return bins.map((bin, i) => Object.assign(bin, {clusterId: clusterIds[i]}));
  if (clusterIds.length === bins.length) {
    bins.forEach((bin, i) => {
      bin.clusterId = clusterIds[i];
    });
  }
  return bins;
}

export default function data(state = initialState, action) {
  switch (action.type) {
    case ActionTypes.LOAD_FILES:
    case ActionTypes.SET_FIELDS_TO_COLUMNS_MAPPING:
    case ActionTypes.SET_FEATURE_NAME_FIELD:
      // Forward to data worker
      state.dataWorker.postMessage(action);
      return state;
    case ActionTypes.ADD_SPECIES_AND_BINS:
      return {
        ...state,
        species: action.species,
        bins: action.bins,
        binningLoading: false,
      };
    case ActionTypes.GET_CLUSTERS:
      // Forward to data worker
      state.dataWorker.postMessage(action);
      return {
        ...state,
        isClustering: true
      };
    case ActionTypes.ADD_CLUSTERS:
      const bins = mergeClustersToBins(action.clusterIds, state.bins);
      const clusters = action.clusterStatistics;
      return {
        ...state,
        isClustering: false,
        bins,
        clusterIds: action.clusterIds,
        clusters,
        groupBy: Display.BY_CLUSTER,
        clusterColors: colors.categoryColors(clusters.length),
      };
    case ActionTypes.BINNING_CHANGE_TYPE:
    case ActionTypes.BINNING_MIN_NODE_SIZE:
    case ActionTypes.BINNING_MAX_NODE_SIZE:
    case ActionTypes.BINNING_DENSITY_THRESHOLD:
      let nextBinning = binning(state.binning, action)
      dataWorker.postMessage(action);
      return {
        ...state,
        binning: nextBinning,
        binningLoading: state.species.length > 0,
        groupBy: Display.BY_NAME,
      }
    case ActionTypes.CHANGE_GROUP_BY:
      return {
        ...state,
        groupBy: action.groupBy
      }
    default:
      return state;
  }
}
