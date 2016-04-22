import {FILE_PROGRESS, BINNING_PROGRESS, CLUSTERING_PROGRESS} from '../constants/ActionTypes';

// Modes
export const INDETERMINATE = 'INDETERMINATE';
export const PERCENT = 'PERCENT';
export const COUNT = 'COUNT';
export const COUNT_WITH_TOTAL = 'COUNT_WITH_TOTAL';

/**
* Create progress action
* @param activity {string} describing what currently happens
* @param mode {string} one of above
* @param amount {number} 0-100 if PERCENT mode, otherwise a count
* @param meta {object} meta data like {total: number} for COUNT mode and {done: true}
*/
function setProgress(type, activity, mode = INDETERMINATE, amount = undefined, meta = {}) {
  return {
    isProgress: true,
    type,
    activity,
    mode,
    amount,
    meta,
  }
}

export function setFileProgress(activity, mode, amount, meta) {
  return setProgress(FILE_PROGRESS, activity, mode, amount, meta);
}

export function setBinningProgress(activity, mode, amount, meta) {
  return setProgress(BINNING_PROGRESS, activity, mode, amount, meta);
}

export function setClusteringProgress(activity, mode, amount, meta) {
  return setProgress(CLUSTERING_PROGRESS, activity, mode, amount, meta);
}
