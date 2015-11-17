import {
  LOAD_FILES,
  LOAD_SAMPLE_FILE,
  CANCEL_FILE_ACTIONS,
  FILE_ERROR,
  REQUEST_DSV_COLUMN_MAPPING,
  REQUEST_GEOJSON_NAME_FIELD,
  SET_FIELDS_TO_COLUMNS_MAPPING,
  SET_FEATURE_NAME_FIELD,
  ADD_SPECIES_AND_BINS,
} from '../constants/ActionTypes';

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

export function loadFiles(files) {
  return {
    type: LOAD_FILES,
    files
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

export function loadSampleFile(filename) {
  console.log("loadSampleFile not implemented");
  return {
    type: LOAD_SAMPLE_FILE,
    filename
  }
  // return dispatch => {
  //   return dispatch(loadSnakes());
  // }
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

export function addSpeciesAndBins(species, bins) {
  return {
    type: ADD_SPECIES_AND_BINS,
    species,
    bins
  }
}
