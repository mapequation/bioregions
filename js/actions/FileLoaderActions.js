import {LOAD_FILES, LOAD_SAMPLE_FILE, ERROR_MESSAGE, ADD_FEATURES} from '../constants/ActionTypes';
import d3 from 'd3';
import _ from 'lodash';

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

function setPendingFiles(filesList) {
  return {
    type: LOAD_FILES,
    filesList
  }
}

function setError(message) {
  return {
    type: ERROR_MESSAGE,
    message
  }
}

function addFeatures(features, havePolygons = false) {
  return {
    type: ADD_FEATURES,
    features,
    havePolygons
  }
}

export function loadFiles(filesList) {
  return (dispatch, getState) => {
    let file = filesList[0];
    let reader = new FileReader();
    reader.onload = (progressEvent) => {
        console.log("reader.result ready!");
    };

    try {
      reader.readAsText(file);
    }
    catch (e) {
      dispatch(setError(`Error loading file '${file.name}': ${e}`));
    }
  }
}

function validatePointFeature(feature) {
  // a >= a is a check for non-undefined and non-null?
  return (feature.properties.name >= feature.properties.name) &&
      (feature.geometry.coordinates[0] >= feature.geometry.coordinates[0]) &&
      (feature.geometry.coordinates[1] >= feature.geometry.coordinates[1]);
}

function loadSnakes() {
  return (dispatch) => {
    console.log("Load snakes...");
    d3.tsv('data/coordinates_snakes_south_america.txt', function(error, data) {
      if (error) {
          console.log("Error loading snakes:", error);
          return dispatch(setError(`Error loading snakes sample data: ${error}`));
      }
      let snakes = _.chain(data)
          // .map(function(snake) { return {name: snake.Taxon, lat: +snake.Lat, long: +snake.Long}; })
          .map((snake) => {
            return {
              type: 'Feature',
              geometry: {
                type: 'Point',
                coordinates: [+snake.Long, +snake.Lat]
              },
              properties: {
                name: snake.Taxon
              }
            };
          })
          //.filter(function(d) { return !isNaN(d.lat) && !isNaN(d.long); })
          .filter((d) => validatePointFeature(d))
          .value();
      console.log("Filtered", snakes.length, "snakes from", data.length, 'in the original data.');
      dispatch(addFeatures(snakes));
    });
  }
}

export function loadSampleFile(filename) {
  return dispatch => {
    return dispatch(loadSnakes());
  }
}
