import {
  BINNING_CHANGE_TYPE,
  BINNING_MIN_NODE_SIZE,
  BINNING_MAX_NODE_SIZE,
  BINNING_DENSITY_THRESHOLD
} from '../constants/ActionTypes';

export function changeBinnerType(binnerType) {
  return {
    type: BINNING_CHANGE_TYPE,
    binnerType
  }
}

export function changeMinBinSize(minNodeSizeLog2) {
  return {
    type: BINNING_MIN_NODE_SIZE,
    minNodeSizeLog2
  }
}

export function changeMaxBinSize(maxNodeSizeLog2) {
  return {
    type: BINNING_MAX_NODE_SIZE,
    maxNodeSizeLog2
  }
}

export function changeDensityThreshold(densityThreshold) {
  return {
    type: BINNING_DENSITY_THRESHOLD,
    densityThreshold
  }
}
