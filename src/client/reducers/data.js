import * as ActionTypes from "../constants/ActionTypes";
import QuadtreeGeoBinner from "../utils/QuadtreeGeoBinner";
import * as Binning from "../constants/Binning";
import _ from "lodash";
import colors from "../utils/colors";
import DataWorker from "worker!../workers/DataWorker";
import EventEmitter2 from "eventemitter2";
import geoTreeUtils from "../utils/phylogeny/geoTreeUtils";
import treeUtils from "../utils/treeUtils";
import { getSimilarCells, TREE_WEIGHT_MODELS } from "../utils/clustering";

const getInitialBinningState = () => {
  return {
    binnerType: Binning.QUAD_TREE,
    binnerTypes: [Binning.QUAD_TREE], //TODO: Support Binning.TRIANGLE_TREE, Binning.HEXAGON
    unit: Binning.DEGREE,
    binnerUnits: [Binning.DEGREE, Binning.MINUTE],
    minNodeSizeLog2: 0, // TODO: Sync these values with main data worker state
    maxNodeSizeLog2: 2,
    nodeCapacity: 100,
    lowerThreshold: 10,
    renderer: QuadtreeGeoBinner.renderer,
    binningLoading: false,
    patchSparseNodes: true,
  };
};

function binning(state = getInitialBinningState(), action) {
  switch (action.type) {
    case ActionTypes.BINNING_CHANGE_TYPE:
      return {
        ...state,
        binnerType: action.binnerType,
      };
    case ActionTypes.BINNING_CHANGE_UNIT:
      return {
        ...state,
        unit: action.unit,
      };
    case ActionTypes.BINNING_MIN_NODE_SIZE:
      return {
        ...state,
        minNodeSizeLog2: action.minNodeSizeLog2,
      };
    case ActionTypes.BINNING_MAX_NODE_SIZE:
      return {
        ...state,
        maxNodeSizeLog2: action.maxNodeSizeLog2,
      };
    case ActionTypes.BINNING_NODE_CAPACITY:
      return {
        ...state,
        nodeCapacity: action.nodeCapacity,
      };
    case ActionTypes.BINNING_LOWER_THRESHOLD:
      return {
        ...state,
        lowerThreshold: action.lowerThreshold,
      };
    case ActionTypes.BINNING_PATCH_SPARSE_NODES:
      return {
        ...state,
        patchSparseNodes: action.patchSparseNodes,
      };
    default:
      return state;
  }
}

var dataWorker = new DataWorker();
var dataWorkerInitiated = false;
var progressEmitter = new EventEmitter2({
  wildcard: false,
  delimiter: ".",
});

const getInitialState = () => {
  return {
    dataWorker,
    dataWorkerInitiated, // Init event listener in App.js
    progressEmitter,
    havePolygons: false,
    features: [], // GeoJSON features
    species: [], // features count by name, array of {name: string, count: number}
    speciesCount: {}, // {name -> count} generated from species
    binning: getInitialBinningState(),
    binningLoading: false,
    bins: [], // bins = binner.bins(features)
    speciesToBins: {}, // { name:String -> { speciesId: Int, bins: Set<binId:Int> }}
    network: null, // Pajek string
    clusterIds: [], // array<int> of cluster id:s, matching bins array in index
    isClustering: false,
    clusters: [], // array of {clusterId,numBins,numRecords,numSpecies,topCommonSpecies,topIndicatorSpecies}
    clustersPerSpecies: {}, // name -> {count, clusters: limitRest([{clusterId, count}, ...])}
    clusterColors: [], // array of chroma colors for each cluster
    phyloTree: null, // { name: "root", children: [{name, length}, {name, length, children}, ...] }
    phyloregions: {
      useTree: true,
    },
    treeWeightModels: TREE_WEIGHT_MODELS,
    treeWeightModelIndex: 0,
    clusterFractionLimit: 0.1, // For cluster pie charts //TODO: Not used in DataWorker
    infomap: {
      numTrials: 1,
      markovTime: 1.0,
    },
    selectedCell: null, // one of bins
    selectedClusterId: -1, // 0-{numberOfClusters-1} or -1 if not selected
  };
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
  if (clusterIds.length >= bins.length) {
    bins.forEach((bin, i) => {
      bin.clusterId = clusterIds[i];
    });
  }
  return bins;
}

// Generate state.speciesCount from state.species
function getSpeciesCount(species) {
  const speciesCount = {};
  _.forEach(species, ({ name, count }) => {
    speciesCount[name] = count;
  });
  return speciesCount;
}

function prepareTree(tree, state) {
  treeUtils.prepareTree(tree);
  geoTreeUtils.aggregateSpeciesCount(tree, state.speciesCount);
  geoTreeUtils.reconstructAncestralAreas(
    tree,
    state.clustersPerSpecies,
    state.clusterFractionLimit
  );
  return tree;
}

export default function data(state = getInitialState(), action) {
  switch (action.type) {
    case ActionTypes.SELECT_CELL:
      if (state.selectedCell) {
        delete state.selectedCell.links;
      }
      if (action.cell && !action.cell.links) {
        action.cell.links = getSimilarCells(
          action.cell,
          state.species,
          state.speciesToBins
        );
      }
      return {
        ...state,
        selectedCell: action.cell,
        selectedClusterId: action.cell ? action.cell.clusterId : -1,
      };
    case ActionTypes.SELECT_CLUSTER:
      return {
        ...state,
        selectedCell: null,
        selectedClusterId: action.clusterId,
      };
    case ActionTypes.LOAD_FILES:
      // Forward to data worker
      state.dataWorker.postMessage(action);
      return {
        ...getInitialState(),
        // Keep some state
        binning: state.binning,
        phyloTree: state.phyloTree,
      };
    case ActionTypes.LOAD_TREE:
      state.dataWorker.postMessage(action);
      return state;
    case ActionTypes.SET_FIELDS_TO_COLUMNS_MAPPING:
    case ActionTypes.SET_FEATURE_NAME_FIELD:
      // Forward to data worker
      state.dataWorker.postMessage(action);
      return state;
    case ActionTypes.ADD_PHYLO_TREE:
      return {
        ...state,
        phyloTree: prepareTree(action.phyloTree, state),
      };
    case ActionTypes.REMOVE_PHYLO_TREE:
      return {
        ...state,
        phyloTree: null,
      };
    case ActionTypes.ADD_SPECIES_AND_BINS:
      const speciesCount = getSpeciesCount(action.species);
      return {
        ...getInitialState(),
        species: action.species,
        speciesCount,
        bins: action.bins,
        binningLoading: false,
        speciesToBins: action.speciesToBins,
        // Save network
        // network: action.network,
        // Keep some state
        binning: state.binning,
        // Reset possibly stored clusters on the tree
        phyloTree: state.phyloTree
          ? Object.assign(
              {},
              geoTreeUtils.aggregateSpeciesCount(
                geoTreeUtils.resetClusters(state.phyloTree),
                speciesCount
              )
            )
          : state.phyloTree,
      };
    case ActionTypes.PHYLOREGIONS_USE:
      return {
        ...state,
        phyloregions: {
          ...state.phyloregions,
          useTree: action.checked,
        },
      };
    case ActionTypes.CHANGE_TREE_WEIGHT_MODEL:
      state.dataWorker.postMessage(action);
      return {
        ...state,
        treeWeightModelIndex: action.treeWeightModelIndex,
      };
    case ActionTypes.GET_CLUSTERS:
      // Forward to data worker
      console.log("\n\n!!!!!! GET_CLUSTERS:", {
        ...action,
        ...state.phyloregions,
      });
      state.dataWorker.postMessage({ ...action, ...state.phyloregions });
      return {
        ...state,
        isClustering: true,
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
      const { clusters, clustersPerSpecies } = action.clusterStatistics;
      let geoPhyloTree = state.phyloTree;
      if (geoPhyloTree) {
        geoPhyloTree = geoTreeUtils.reconstructAncestralAreas(
          state.phyloTree,
          clustersPerSpecies,
          state.clusterFractionLimit
        );
        // Create new tree object to get behind shouldComponentUpdate
        geoPhyloTree = Object.assign({}, geoPhyloTree);
      }
      return {
        ...state,
        isClustering: false,
        bins,
        clusterIds: action.clusterIds,
        clusters,
        clustersPerSpecies,
        clusterColors: colors.categoryColors(clusters.length),
        phyloTree: geoPhyloTree,
      };
    case ActionTypes.BINNING_CHANGE_TYPE:
    case ActionTypes.BINNING_CHANGE_UNIT:
    case ActionTypes.BINNING_MIN_NODE_SIZE:
    case ActionTypes.BINNING_MAX_NODE_SIZE:
    case ActionTypes.BINNING_NODE_CAPACITY:
    case ActionTypes.BINNING_LOWER_THRESHOLD:
    case ActionTypes.BINNING_PATCH_SPARSE_NODES:
      const nextBinning = binning(state.binning, action);
      dataWorker.postMessage(action);
      return {
        ...state,
        clusterIds: [],
        clusters: [],
        binning: nextBinning,
        binningLoading: state.species.length > 0,
      };
    case ActionTypes.SET_CLUSTER_COLORS:
      return {
        ...state,
        clusterColors: action.clusterColors,
      };
    case ActionTypes.INFOMAP_NUM_TRIALS:
      return {
        ...state,
        infomap: {
          ...state.infomap,
          numTrials: action.numTrials,
        },
      };
    case ActionTypes.INFOMAP_MARKOV_TIME:
      return {
        ...state,
        infomap: {
          ...state.infomap,
          markovTime: action.markovTime,
        },
      };
    case ActionTypes.REMOVE_SPECIES:
      state.dataWorker.postMessage(action);
      return {
        ...getInitialState(),
        phyloTree: state.phyloTree,
      };
    case ActionTypes.DATA_WORKER_INITIATED:
      dataWorkerInitiated = true;
      return {
        ...state,
        dataWorkerInitiated: true,
      };
    case ActionTypes.CANCEL_FILE_ACTIONS:
      // state.dataWorker.postMessage(action);
      console.log("\n\nTERMINATE WORKER -> NEW WORKER");
      state.dataWorker.terminate();
      dataWorker = new DataWorker();
      dataWorkerInitiated = false;
      return {
        ...getInitialState(),
      };
    default:
      return state;
  }
}
