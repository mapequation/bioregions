import {
  LOAD_FILES,
  LOAD_SAMPLE_FILE,
  PARSE_TEXT_DATA,
  ADD_FEATURES,
  CANCEL_FILE_ACTIONS
} from '../constants/ActionTypes';
import {setError} from './ErrorActions';
import d3 from 'd3';
import _ from 'lodash';
import io from '../utils/io';
import shp from 'shpjs';

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

function parseTextData(data, filename) {
  return {
    type: PARSE_TEXT_DATA,
    payload: {
      data,
      filename
    }
  }
}

export function addFeatures(features, havePolygons = false) {
  return {
    type: ADD_FEATURES,
    features,
    havePolygons
  }
}

export function loadFiles(filesList) {
  return (dispatch, getState) => {
    let numFiles = filesList.length;
    let file = filesList[0];

    let fileArray = Array.from(filesList);

    // Shapefile needs multiple files
    // let isShapefile = /shp$|prj$|dbf$|zip$/.test(filename);
    // let isShapefile = /shp$|prj$|dbf$/.test(filename);
    let isShapefile = _.any(fileArray, file => /shp$/.test(file.name));

    if (isShapefile) {
      console.log("Found a .shp file");
      // Keep buffers here
      let shapefiles = new Map();

      for (let i = 0; i < numFiles; ++i) {
        let file = filesList[i];
        // Only keep .shp, .prj and .dbf files
        if (/shp$|prj$|dbf$/.test(file.name))
          shapefiles.set(file.name.slice(-3), file);
      }
      if (!shapefiles.has('dbf'))
        return dispatch(setError(`Can't use a .shp file without a .dbf file.`));

      let filePromises = [];
      shapefiles.forEach(file => {
        console.log(`Add promise for file ${file.name}...`);
        filePromises.push(io.readFile(file, /prj$/.test(file.name) ? 'text' : 'buffer'));
      });

      Promise.all(filePromises)
        .then(result => {
          result.forEach(file => { shapefiles.set(file.name.slice(-3), file.data); });
          let shpBuffer = shapefiles.get('shp');
          let prjString = shapefiles.get('prj');
          let dbfBuffer = shapefiles.get('dbf');
          console.log("Combine shapefiles...");
          let geoJson = shp.combine([shp.parseShp(shpBuffer, prjString), shp.parseDbf(dbfBuffer)]);
          console.log("Parse shapefiles...");
          parseGeoJson(geoJson);
        })
        .catch(err => {
          return dispatch(setError(`Error loading shapefiles: ${err}`));
        });
    }
    else {
      let reader = new FileReader();
      reader.onload = (progressEvent) => {
        return dispatch(parseTextData(reader.result, file.name));
      };

      try {
        reader.readAsText(file);
      }
      catch (e) {
        return dispatch(setError(`Error loading file '${file.name}': ${e}`));
      }
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
      return dispatch(addFeatures(snakes));
    });
  }
}

export function cancelFileActions() {
  return {
    type: CANCEL_FILE_ACTIONS
  }
}

export function loadSampleFile(filename) {
  return dispatch => {
    return dispatch(loadSnakes());
  }
}
