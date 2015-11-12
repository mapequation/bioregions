import * as ActionTypes from '../constants/ActionTypes';
import QuadtreeGeoBinner from '../utils/QuadtreeGeoBinner';
import * as Binning from '../constants/Binning';
import * as Display from '../constants/Display';
import R from 'ramda';
import crossfilter from 'crossfilter';
import d3 from 'd3';
import * as S from '../utils/statistics';

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
  species: [], // features count by name, array of {name: string, count: number}
  binning: initialBinningState,
  bins: [], // bins = binner.bins(features)
  clusterIds: [], // array<int> of cluster id:s, matching bins array in index
  isClustering: false,
  clusters: [], // features grouped by cluster
  groupBy: Display.BY_NAME, // name or cluster when clusters ready
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

function getClusterStatistics(clusterIds, bins, maxGlobalCount, speciesCountMap) {
  if (bins.length === 0)
    return [];
  if (bins[0].clusterId < 0)
    mergeClustersToBins(clusterIds, bins);
  return d3.nest()
    .key((bin) => bin.clusterId)
    .rollup((bins) => {
      // rollup features grouped on bins
      let features = [];
      bins.forEach((bin) => {
        // Skip patched aggregation of points on non-leaf level
        if (bin.isLeaf) {
          bin.points.forEach((point) => {
            features.push(point);
          });
        }
      });
      const topCommonSpecies = S.topSortedCountBy(feature => feature.properties.name, 10, features);
      const numSpecies = features.length;
      return {
        numBins: bins.length,
        numSpecies,
        topCommonSpecies,
        topIndicatorSpecies: S.topIndicatorItems("name", speciesCountMap, maxGlobalCount, topCommonSpecies[0].count, 10, topCommonSpecies)
      }
    })
    .entries(bins)
}

export default function data(state = initialState, action) {
  switch (action.type) {
    case ActionTypes.ADD_FEATURES:
    const species = S.sortedCountBy(feature => feature.properties.name, action.features);
      return {
        ...state,
        havePolygons: action.havePolygons,
        features: action.features,
        species,
        speciesCountMap: new Map(species.map(({name, count}) => [name, count])),
        bins: getBins(state.binning, action.features)
      };
    case ActionTypes.REQUEST_CLUSTERS:
      return {
        ...state,
        isClustering: true
      };
    case ActionTypes.ADD_CLUSTERS:
      let bins = mergeClustersToBins(action.clusterIds, state.bins);
      let clusters = getClusterStatistics(action.clusterIds, state.bins, state.species[0].count, state.speciesCountMap);
      return {
        ...state,
        isClustering: false,
        bins,
        clusterIds: action.clusterIds,
        clusters,
        groupBy: Display.BY_CLUSTER,
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
        clusterIds: [] // Reset clusters on changed binning
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
