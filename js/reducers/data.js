import * as ActionTypes from '../constants/ActionTypes';
import QuadtreeGeoBinner from '../utils/QuadtreeGeoBinner';
import * as Binning from '../constants/Binning';
import R from 'ramda';
import crossfilter from 'crossfilter';

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
};

function accumulateSpecies(features) {
  // let speciesMap = new Map();
  // features.forEach(feature => {
  //   let name = feature.properties.name;
  //   let currentCount = speciesMap.get[name];
  //   if (currentCount === undefined)
  //     speciesMap.set(name, 1);
  //   else
  //     speciesMap.set(name, currentCount + 1);
  // });
  // let speciesCounts = [];
  // speciesMap.forEach((name, count) => {
  //   speciesCounts.push({name, count});
  // });
  var heapselectByCount = crossfilter.heapselect.by(d => d.count);
  var getSpeciesCounts = R.pipe(
    R.countBy(feature => feature.properties.name),
    R.toPairs,
    R.map(pair => { return {name: pair[0], count: pair[1]}; })
  );
  var speciesCounts = getSpeciesCounts(features);
  // var topSpecies = heapselectByCount(speciesCounts, 0, speciesCounts.length, 2)
  //   .sort((a, b) => b.count - a.count);
  // return topSpecies;
  return speciesCounts.sort((a, b) => b.count - a.count);
}

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

function getClusterStatistics(clusterIds, bins) {
  // TODO: Don't repeat, order of execution in object literal guaranteed?
  if (clusterIds.length === bins.length) {
    bins.forEach((bin, i) => {
      bin.clusterId = clusterIds[i];
    });
  }
  // let clusters = R.groupBy
  return [];
}

export default function data(state = initialState, action) {
  switch (action.type) {
    case ActionTypes.ADD_FEATURES:
    let species = accumulateSpecies(action.features);
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
      return {
        ...state,
        isClustering: false,
        bins: mergeClustersToBins(action.clusterIds, state.bins),
        clusterIds: action.clusterIds,
        clusters: getClusterStatistics(action.clusterIds, state.bins),
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
    default:
      return state;
  }
}
