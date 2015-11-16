import d3 from 'd3';
import _ from 'lodash';
import {LOAD_FILES, SET_FIELDS_TO_COLUMNS_MAPPING, SET_FEATURE_NAME_FIELD} from '../constants/ActionTypes';
import {setFileProgress, setBinningProgress,
  INDETERMINATE, PERCENT, COUNT, COUNT_WITH_TOTAL} from '../actions/ProgressActions';
import {setFileError, requestDSVColumnMapping, requestGeoJSONNameField, addSpeciesAndBins} from '../actions/FileLoaderActions';
import io from '../utils/io';
import shp from 'shpjs';
import * as S from '../utils/statistics';
import QuadtreeGeoBinner from '../utils/QuadtreeGeoBinner';

// Worker scoped variables
var _geoJSON = null;
var _dsvType = null; // "TSV" or "CSV"
var _content = null; // string content for dsv files
var _features = []; // GeoJSON features
var _bins = [];
var _species = []; // array of [{name, count}], sorted on count
var _speciesCountMap = new Map();

var _binning = {
  minNodeSize: 1,
  maxNodeSize: 4,
  densityThreshold: 100,
};

function dispatch(action) {
  postMessage(action);
}

// progress signature: (activity, mode, amount, total)

function loadShapefiles(files) {
  console.log("Load shapefiles...");
  dispatch(setFileProgress("Load shapefiles...", INDETERMINATE));
  // Keep buffers here
  let shapefiles = new Map();

  for (let i = 0; i < numFiles; ++i) {
    let file = files[i];
    // Only keep .shp, .prj and .dbf files
    if (/shp$|prj$|dbf$/.test(file.name))
      shapefiles.set(file.name.slice(-3), file);
  }
  if (!shapefiles.has('dbf'))
    return dispatch(setFileError(`Can't use a .shp file without a .dbf file.`));

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
      dispatch(setFileProgress("Parsing shapefiles...", INDETERMINATE));
      let parsedShape = shp.parseShp(shpBuffer, prjString);
      let parsedDbf = shp.parseDbf(dbfBuffer);
      dispatch(setFileProgress("Combining shapefiles to GeoJSON...", INDETERMINATE));
      _geoJSON = shp.combine([parsedShape, parsedDbf]);
      console.log("Loaded _geoJSON:", _geoJSON);
      const {properties} = _geoJSON.features[0];
      dispatch(selectGeoJSONProperties(properties));
    })
    .catch(err => {
      return dispatch(setFileError(`Error loading shapefiles: ${err}`));
    });
}

function loadTextFile(file) {
  console.log("[DataWorker]: Load file:", file.name);

  // FileReader not available in workers in Firefox: https://bugzilla.mozilla.org/show_bug.cgi?id=1051150
  var usingAsyncReader = typeof FileReader === 'function';
  var reader;
  var result;

  if (usingAsyncReader) {
    reader = new FileReader();

    reader.onprogress = function(event) {
      // console.log("[DataWorker]: onprogress");
      let mode = event.lengthComputable? COUNT_WITH_TOTAL : COUNT;
      dispatch(setFileProgress("Loading file...", mode, event.loaded, {total: event.total}));
    };

    reader.onloadend = (event) => {
      console.log("[DataWorker]: onloadend");
      const {result, error} = event.target;

      if (error) {
        console.log("File reader error:", error, "error code:", error.code);
        dispatch(setFileError(`File could not be read: ${error.toString()}`));
      }
      else {
        console.log("Got file content!");
        parseDSVHeader(result);
      }
    };
  }
  else {
    console.log("[DataWorker]: Using FileReaderSync as FileReader not available in workers in Firefox.");
    reader = new FileReaderSync();
  }

  var successful = true;
  try {
    console.log("[DataWorker]: try reader.readAsText()");
    result = reader.readAsText(file);
  }
  catch (e) {
    console.log("[DataWorker]: Error reader.readAsText():", e);
    successful = false;
    dispatch(setFileError(`Error loading file '${file.name}': ${e}`));
  }
  finally {
    if (!usingAsyncReader && successful) {
      console.log("[DataWorker]: got sync result");
      parseDSVHeader(result);
    }
  }
}

function loadFiles(files) {
  let numFiles = files.length;

  let isShapefile = _.any(files, file => /shp$/.test(file.name));

  if (isShapefile)
    loadShapefiles();
  else
    loadTextFile(files[0]);
}


function parseDSVHeader(content) {
  dispatch(setFileProgress("Trying to parse the file as delimiter-separated values...", INDETERMINATE));
  let newlineIndex = content.indexOf('\n');
  if (newlineIndex == -1) {
    if (content.length === 0)
      return dispatch(setFileError("No file content to read.", "Please check the file, or try with another browser."));
    return dispatch(setFileError("Could only read a single line from the file.", "Please check the file format."));
  }

  let headLines = [];
  let prevIndex = 0;
  while (newlineIndex !== -1 && headLines.length < 5) {
    headLines.push(content.substring(prevIndex, newlineIndex));
    prevIndex = newlineIndex + 1;
    newlineIndex = content.indexOf('\n', prevIndex);
  }

  let headerLine = headLines[0];
  let isTSV = headerLine.split('\t').length > 1;
  let isCSV = headerLine.split(',').length > 1;

  if (!isTSV && !isCSV)
    return dispatch(setFileError("Couldn't recognise the format as CSV or TSV"));

  _dsvType = isTSV? "TSV" : "CSV";
  let parser = isTSV? d3.tsv : d3.csv;

  dispatch(setFileProgress(`Trying to parse the file as ${_dsvType}...`, INDETERMINATE));

  const parsedHead = parser.parseRows(headLines.join('\n'));

  let columns = parsedHead[0];

  if (columns.length < 3)
    return dispatch(setFileError(`Not enough columns: ${columns}`));

  dispatch(requestDSVColumnMapping(parsedHead));

  // Save reference to continue when columns selected
  _content = content;
}


function parseDSV(fieldsToColumns) {
  console.log("[DataWorker]: parseDSV with fieldsToColumns:", fieldsToColumns);
  const {Name, Latitude, Longitude} = fieldsToColumns; // Contains index of corresponding field

  let parser = _dsvType == "TSV" ? d3.tsv : d3.csv;
  let numSkipped = 0;
  let count = 0;

  let features = parser.parseRows(_content, (row, index) => {
    // Skip header
    if (index === 0)
      return null;
    ++count;
    const name = row[Name];
    const lat = +row[Latitude];
    const long = +row[Longitude];
    if (name && lat >= lat && long >= long) { // not undefined/NaN etc
      if (count % 1000 === 0) {
        dispatch(setFileProgress("Parsing rows...", COUNT, count, {numSkipped}));
        // postMessage({type: "progress", payload: { count, numSkipped, activity: "Parsing rows..." }});
      }
      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [long, lat]
        },
        properties: {
          name
        }
      };
    }
    ++numSkipped;
    return null;
  });
  console.log(`Parsed ${features.length} valid features and skipped ${numSkipped} bad ones.`);

  // Store features
  _features = features;

  dispatch(setFileProgress("Parsing rows... done!", COUNT, count, {numSkipped, done: true}));

  dispatch(setFileProgress("Aggregating species...", INDETERMINATE));
  groupByName();

  dispatch(setFileProgress("Binning species...", INDETERMINATE));
  binData();

  dispatch(setFileProgress("Transferring result...", INDETERMINATE));
  dispatch(addSpeciesAndBins(_species, _bins));
}

function groupByName() {
  _species = S.sortedCountBy(feature => feature.properties.name, _features);
  // _speciesCountMap = d3.map(_species, d => d.name);
  _speciesCountMap = new Map(_species.map(({name, count}) => [name, count]));
}

function binData() {
  dispatch(setBinningProgress("Binning species...", INDETERMINATE));
  let binner = new QuadtreeGeoBinner()
   .minNodeSize(_binning.minNodeSize)
   .maxNodeSize(_binning.maxNodeSize)
   .densityThreshold(_binning.densityThreshold);
   // Bin and map to summary bins, all points not needed
  _bins = binner.bins(_features).map((bin) => {
    const countedSpecies = S.countBy(feature => feature.properties.name, bin.points);
    const topCommonSpecies = S.topSortedBy(d => d.count, 10, countedSpecies);
    const topIndicatorSpecies = S.topIndicatorItems("name", _speciesCountMap, _species[0].count, topCommonSpecies[0].count, 10, topCommonSpecies)
    return {
      x1: bin.x1,
      x2: bin.x2,
      y1: bin.y1,
      y2: bin.y2,
      isLeaf: bin.isLeaf,
      area: bin.area(),
      size: bin.size(),
      count: bin.points.length,
      speciesCount: countedSpecies.length,
      topCommonSpecies,
      topIndicatorSpecies,
      clusterId: -1
    };
  });
}

onmessage = function(event) {
  const {type} = event.data;
  console.log("[DataWorker]: got message of type:", type);
  switch (type) {
    case LOAD_FILES:
      loadFiles(event.data.files);
      break;
    case SET_FIELDS_TO_COLUMNS_MAPPING:
      parseDSV(event.data.fieldsToColumns);
      break;
    case SET_FEATURE_NAME_FIELD:
      parseGeoJSON(event.data.featureNameField);
      break;
    default:
      console.log("[DataWorker]: Unrecognised message type:", type);
  }
};
