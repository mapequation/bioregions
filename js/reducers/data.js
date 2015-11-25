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
import EventEmitter2 from 'eventemitter2';

const initialBinningState = {
  binnerType: Binning.QUAD_TREE,
  binnerTypes: [Binning.QUAD_TREE], //TODO: Support Binning.TRIANGLE_TREE, Binning.HEXAGON
  minNodeSizeLog2: 0, // TODO: Sync these values with main data worker state
  maxNodeSizeLog2: 2,
  nodeCapacity: 100,
  lowerThreshold: 10,
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
        minNodeSizeLog2: action.minNodeSizeLog2
      }
    case ActionTypes.BINNING_MAX_NODE_SIZE:
      return {
        ...state,
        maxNodeSizeLog2: action.maxNodeSizeLog2
      }
    case ActionTypes.BINNING_NODE_CAPACITY:
      return {
        ...state,
        nodeCapacity: action.nodeCapacity
      }
    case ActionTypes.BINNING_LOWER_THRESHOLD:
      return {
        ...state,
        lowerThreshold: action.lowerThreshold
      }
    default:
      return state;
  }
}

var dataWorker = new DataWorker();
var progressEmitter = new EventEmitter2({
  wildcard: false,
  delimiter: '.',
});

const initialState = {
  dataWorker,
  progressEmitter,
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
   .minNodeSizeLog2(binning.minNodeSizeLog2)
   .maxNodeSizeLog2(binning.maxNodeSizeLog2)
   .nodeCapacity(binning.nodeCapacity);
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
      // Forward to data worker
      state.dataWorker.postMessage(action);
      return initialState;
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
    case ActionTypes.CALCULATE_CLUSTERS: // From worker as it couldn't spawn sub worker if not Firefox
      console.log("Got CALCULATE_CLUSTERS in main thread reducer...");
      return state;
    case ActionTypes.ADD_CLUSTERS:
      // Forward to data worker
      state.dataWorker.postMessage(action);
      return state;
    case ActionTypes.ADD_CLUSTERS_AND_STATISTICS:
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
    case ActionTypes.BINNING_NODE_CAPACITY:
    case ActionTypes.BINNING_LOWER_THRESHOLD:
      let nextBinning = binning(state.binning, action)
      dataWorker.postMessage(action);
      return {
        ...state,
        clusterIds: [],
        clusters: [],
        binning: nextBinning,
        binningLoading: state.species.length > 0,
        groupBy: Display.BY_NAME,
      }
    case ActionTypes.CHANGE_GROUP_BY:
      return {
        ...state,
        groupBy: action.groupBy
      }
    case ActionTypes.SET_CLUSTER_COLORS:
      return {
        ...state,
        clusterColors: action.clusterColors
      };
    default:
      return state;
  }
}
