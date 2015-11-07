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

export function changeMinBinSize(minNodeSize) {
  return {
    type: BINNING_MIN_NODE_SIZE,
    minNodeSize
  }
}

export function changeMaxBinSize(maxNodeSize) {
  return {
    type: BINNING_MAX_NODE_SIZE,
    maxNodeSize
  }
}

export function changeDensityThreshold(densityThreshold) {
  return {
    type: BINNING_DENSITY_THRESHOLD,
    densityThreshold
  }
}
