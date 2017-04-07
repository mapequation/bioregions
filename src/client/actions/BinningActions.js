import {
  BINNING_CHANGE_TYPE,
  BINNING_MIN_NODE_SIZE,
  BINNING_MAX_NODE_SIZE,
  BINNING_NODE_CAPACITY,
  BINNING_LOWER_THRESHOLD,
  BINNING_PATCH_SPARSE_NODES,
} from '../constants/ActionTypes';

export function changeBinnerType(binnerType) {
  return {
    type: BINNING_CHANGE_TYPE,
    binnerType,
  };
}

export function changeMinBinSize(minNodeSizeLog2) {
  return {
    type: BINNING_MIN_NODE_SIZE,
    minNodeSizeLog2,
  };
}

export function changeMaxBinSize(maxNodeSizeLog2) {
  return {
    type: BINNING_MAX_NODE_SIZE,
    maxNodeSizeLog2,
  };
}

export function changeNodeCapacity(nodeCapacity) {
  return {
    type: BINNING_NODE_CAPACITY,
    nodeCapacity,
  };
}

export function changeLowerThreshold(lowerThreshold) {
  return {
    type: BINNING_LOWER_THRESHOLD,
    lowerThreshold,
  };
}

export function changePatchSparseNodes(patchSparseNodes) {
  return {
    type: BINNING_PATCH_SPARSE_NODES,
    patchSparseNodes,
  };
}
