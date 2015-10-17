import {LOAD_FILES, LOAD_SAMPLE_FILE} from '../constants/ActionTypes';

export function loadFiles(filesList) {
  return {
    type: LOAD_FILES,
    filesList
  }
}

export function loadSampleFile(filename) {
  return {
    type: LOAD_SAMPLE_FILE,
    filename
  }
}
