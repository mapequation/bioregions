import {
  SHOW_FILE_UI,
  LOAD_FILES,
  FETCH_FILES,
  FETCH_TREE,
  LOAD_TREE,
  LOAD_SAMPLE_FILE,
  CANCEL_FILE_ACTIONS,
  FILE_ERROR,
  REQUEST_DSV_COLUMN_MAPPING,
  REQUEST_GEOJSON_NAME_FIELD,
  SET_FIELDS_TO_COLUMNS_MAPPING,
  SET_FEATURE_NAME_FIELD,
  ADD_SPECIES_AND_BINS,
  ADD_PHYLO_TREE,
  REMOVE_PHYLO_TREE,
  REMOVE_SPECIES,
} from '../constants/ActionTypes';
import axios from 'axios'

let exampleGeoJson = {
  type: "FeatureCollection",
  features: [
    {
      geometry: {
        bbox: [
          -49.25399999999996,
          -19.004471974999944,
          -47.92972222199996,
          -13.499999999999943
        ],
        coordinates: [
          [
            [
              -48.31869687799997,
              -18.960895088999962
            ],
            [
              -48.361439693999955,
              -19.004471974999944
            ],
            [
              -48.407800917999964,
              -18.992518556999983
            ]
          ]
        ],
        type: "Polygon"
      },
      properties: {
        OBJECTID: 1,
        Taxon: "Apostolepis albicorallis"
      },
      type: "Feature"
    }
  ]
};
export function showFileUI(isShowingFileUI) {
  return {
    type: SHOW_FILE_UI,
    isShowingFileUI
  };
}

export function loadFiles(files) {
  return {
    type: LOAD_FILES,
    files
  };
}

export function fetchFiles(urls) {
  return {
    type: FETCH_FILES,
    urls
  };
}

export function fetchTree(url) {
  return {
    type: FETCH_TREE,
    url
  };
}

export function loadTree(file) {
  return {
    type: LOAD_TREE,
    file
  };
}

export function cancelFileActions() {
  return {
    type: CANCEL_FILE_ACTIONS
  }
}

/**
* Create error action
* @param error {Error|string}
*/
export function setFileError(error, subMessage = "") {
  return {
    type: FILE_ERROR,
    message: error.message? error.message : error.toString(),
    subMessage
  }
}

export function loadSampleFiles(urls) {
  // const file = new File(["name,lat,long\ntest,0,0\ntest2,0,0"], filename, {type: 'text/plain'});
  // return loadFiles([file]);
  return (dispatch, getState) => {
    dispatch(fetchFiles(urls));

    return axios.all(urls.map(url => axios.get('data/' + url, {
      responseType: 'blob'
    })))
      .then(responses => responses.map(response => response.data))
      // .then(blobs => blobs.map((blob,i) => new File([blob], urls[i]))) // File constructor not available in Safari
      .then(blobs => blobs.map((blob,i) => { blob.name = urls[i]; return blob; }))
      .then(files => dispatch(loadFiles(files)))
      .catch(response => {
        console.log(`Error loading files ${urls.join(', ')}, response: ${JSON.stringify(response)}`);
        const errorMessage = `Error loading files '${urls.join(', ')}': `;
        const subMessage = (response.status && response.statusText) ?
          `${response.status} ${response.statusText}` : (
          response.message || response.data || response
        );
        return dispatch(setFileError(errorMessage, subMessage));
      });
  }
}

export function loadSampleTreeFile(url) {
  return (dispatch, getState) => {
    dispatch(fetchTree(url));

    return axios.get('data/' + url, {
        responseType: 'blob'
      })
      .then(response => response.data)
      // .then(blobs => blobs.map((blob,i) => new File([blob], urls[i]))) // File constructor not available in Safari
      .then(blob => { blob.name = url; return blob; })
      .then(file => dispatch(loadTree(file)))
      .catch(response => {
        console.log(`Error loading tree file ${url}, response: ${JSON.stringify(response)}`);
        const errorMessage = `Error loading files '${urls.join(', ')}': `;
        const subMessage = (response.status && response.statusText) ?
          `${response.status} ${response.statusText}` : (
          response.message || response.data || response
        );
        return dispatch(setFileError(errorMessage, subMessage));
      });
  }
}

/**
* parsedHead is [[...columns], [...first row], [...second row], ...]
*/
export function requestDSVColumnMapping(parsedHead) {
  return {
    type: REQUEST_DSV_COLUMN_MAPPING,
    parsedHead
  }
}

export function requestGeoJSONNameField(parsedFeatureProperty) {
  return {
    type: REQUEST_GEOJSON_NAME_FIELD,
    parsedFeatureProperty
  }
}

export function setFieldsToColumnsMapping(fieldsToColumns) {
  return {
    type: SET_FIELDS_TO_COLUMNS_MAPPING,
    fieldsToColumns
  }
}

export function setFeatureNameField(featureNameField) {
  return {
    type: SET_FEATURE_NAME_FIELD,
    featureNameField
  }
}

export function addSpeciesAndBins(species, bins, speciesToBins) {
  return {
    type: ADD_SPECIES_AND_BINS,
    species,
    bins,
    speciesToBins,
  };
}

export function addPhyloTree(phyloTree) {
  return {
    type: ADD_PHYLO_TREE,
    phyloTree
  }
}

export function removePhyloTree() {
  return {
    type: REMOVE_PHYLO_TREE,
  }
}

export function removeSpecies() {
  return {
    type: REMOVE_SPECIES,
  }
}
