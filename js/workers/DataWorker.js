import d3 from 'd3';
import _ from 'lodash';
import {LOAD_FILES, SET_FIELDS_TO_COLUMNS_MAPPING, SET_FEATURE_NAME_FIELD, GET_CLUSTERS, ADD_CLUSTERS,
  BINNING_MIN_NODE_SIZE, BINNING_MAX_NODE_SIZE, BINNING_NODE_CAPACITY, BINNING_LOWER_THRESHOLD} from '../constants/ActionTypes';
import {setFileProgress, setBinningProgress, setClusteringProgress,
  INDETERMINATE, PERCENT, COUNT, COUNT_WITH_TOTAL} from '../actions/ProgressActions';
import {setFileError, requestDSVColumnMapping, requestGeoJSONNameField, addSpeciesAndBins} from '../actions/FileLoaderActions';
import {addClustersAndStatistics, calculateClusters} from '../actions/ClusterActions';
import io from '../utils/io';
import shp from 'shpjs';
import * as S from '../utils/statistics';
import QuadtreeGeoBinner from '../utils/QuadtreeGeoBinner';
import {calculateInfomapClusters, getClusterStatistics, getBipartiteNetwork} from '../utils/clustering';
import turfPolygon from 'turf-polygon';
import turfSimplify from 'turf-simplify';
import turfExtent from 'turf-extent';
import turfPoint from 'turf-point';
import turfInside from 'turf-inside';

console.log(`[DataWorker] ok`);

// Worker state
const getInitialState = () => {
  return {
    geoJSON: null,
    DSVType: null, // "TSV" or "CSV"
    DSVStringContent: null, // string content for dsv files
    features: [], // Only point features here, possibly regenerate from shapeFeatures on binning change
    bins: [],
    species: [], // array of [{name, count}], sorted on count
    speciesCountMap: new Map(),
    shapeFeatures: null, // Store shapefile/GeoJSON features here to generate point features
    binning: { // TODO: Sync with main data state
      minNodeSizeLog2: 0,
      maxNodeSizeLog2: 1,
      nodeCapacity: 100,
      lowerThreshold: 10,
    }
  }
};

var state = getInitialState();

function dispatch(action) {
  postMessage(action);
}

// progress signature: (activity, mode, amount, total)

function loadShapefiles(files) {
  console.log("Load shapefiles...");
  dispatch(setFileProgress("Load shapefiles...", INDETERMINATE));
  const numFiles = files.length;
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
      dispatch(setFileProgress("Parsing shapes...", INDETERMINATE));
      let parsedShape = shp.parseShp(shpBuffer, prjString);
      dispatch(setFileProgress("Parsing attributes...", INDETERMINATE));
      let parsedDbf = shp.parseDbf(dbfBuffer);
      dispatch(setFileProgress("Combining to GeoJSON...", INDETERMINATE));
      state.geoJSON = shp.combine([parsedShape, parsedDbf]);
      console.log("Loaded state.geoJSON:", state.geoJSON);
      const {properties} = state.geoJSON.features[0];
      dispatch(requestGeoJSONNameField(properties));
    })
    .catch(err => {
      return dispatch(setFileError(`Error loading shapefiles: ${err}`));
    });
}


function parseGeoJSON(nameField) {
  state.shapeFeatures = [];
  let numPoints = 0;
  let numPolygons = 0;
  let numMultiPolygons = 0;
  let numMultiPolygonsExpanded = 0;
  let numBadFeatures = 0;
  const numOriginalFeatures = state.geoJSON.features.length;
  let lastPercent = 0;

  state.geoJSON.features.forEach((feature, i) => {
    let percent = Math.round((i+1) * 100 / numOriginalFeatures);
    if (percent !== lastPercent) {
      dispatch(setFileProgress("Parsing features...", COUNT_WITH_TOTAL, i+1, {total: numOriginalFeatures}));
      lastPercent = percent;
    }

    // Simplify the feature
    // console.log("Simplifying features...");
    // feature = turfSimplify(feature, 0.01, false);
    // if (!feature) {
    //   ++numBadFeatures;
    // }
    // else {

    feature.properties.name = feature.properties[nameField];
    // Split MultiPolygon features to multiple Polygon features
    const {type} = feature.geometry;
    if (type === "Polygon") {
      ++numPolygons;
      if (!feature.geometry.bbox)
        feature.geometry.bbox = turfExtent(feature);
      state.shapeFeatures.push(feature);
    }
    else if (type === "MultiPolygon") {
      ++numMultiPolygons;
      feature.geometry.coordinates.forEach(polygonCoords => {
        ++numMultiPolygonsExpanded;
        let polygonFeature = turfPolygon(polygonCoords, feature.properties);
        if (!polygonFeature.geometry.bbox)
          polygonFeature.geometry.bbox = turfExtent(feature);
        state.shapeFeatures.push(polygonFeature);
      });
    }
    else if (type === "Point") {
      ++numPoints;
      state.shapeFeatures.push(feature);
    }
    else {
      console.log("Unsupported geometry type:", type);
    }
  });
  dispatch(setFileProgress("Parsing features...", COUNT_WITH_TOTAL, numOriginalFeatures, {total: numOriginalFeatures}));

  console.log(`numPoints: ${numPoints}, numPolygons: ${numPolygons}, numMultiPolygons: ${numMultiPolygons}, numMultiPolygonsExpanded: ${numMultiPolygonsExpanded}, numBadFeatures: ${numBadFeatures}`);

  shapeToPoints();

  dispatch(setFileProgress("Aggregating species...", INDETERMINATE));
  groupByName();

  dispatch(setFileProgress("Binning species...", INDETERMINATE));
  binData();

  dispatch(setFileProgress("Transferring result...", INDETERMINATE));
  dispatch(addSpeciesAndBins(state.species, getSummaryBins(state.bins)));

}

function shapeToPoints() {
  state.features = [];
  const minNodeSize = Math.pow(2, state.binning.minNodeSizeLog2);
  const halfMinNodeSize = minNodeSize / 2;
  const resolution = minNodeSize * 0.1;
  const totCount = state.shapeFeatures.length;
  let lastPercent = 0;

  state.shapeFeatures.forEach((feature, i) => {
    let percent = Math.round((i+1) * 100 / totCount);
    if (percent !== lastPercent) {
      dispatch(setFileProgress("Resolving polygons for binning...", COUNT_WITH_TOTAL, i+1, {total: totCount}));
      lastPercent = percent;
    }
    const {bbox} = feature.geometry;
    const bboxWidth = bbox[2] - bbox[0];
    const bboxHeight = bbox[3] - bbox[1];
    const [bboxSizeMin, bboxSizeMax] = bboxWidth < bboxHeight ? [bboxWidth, bboxHeight] : [bboxHeight, bboxWidth];
    if (bboxSizeMax < minNodeSize) {
      // If feature less than minimum cell size, add points at centre
      state.features.push(turfPoint([bbox[0] + bboxWidth/2, bbox[1] + bboxHeight/2], feature.properties));
      // const long = bbox[0] + halfMinNodeSize;
      // const lat = bbox[1] + halfMinNodeSize;
      // for (let x = long - halfMinNodeSize; x < long + halfMinNodeSize; x += resolution) {
      //   for (let y = lat - halfMinNodeSize; y < lat + halfMinNodeSize; y += resolution) {
      //     const pointFeature = turfPoint([x, y], feature.properties);
      //     state.features.push(pointFeature);
      //   }
      // }
    }
    else {
      let simplifiedFeature = turfSimplify(feature, minNodeSize / 8);
      for (let long = bbox[0] + halfMinNodeSize; long < bbox[2]; long += minNodeSize) {
        for (let lat = bbox[1] + halfMinNodeSize; lat < bbox[3]; lat += minNodeSize) {
          const pointFeature = turfPoint([long, lat], feature.properties);
          if (turfInside(pointFeature, simplifiedFeature)) {
            state.features.push(turfPoint([long, lat], feature.properties));
            // for (let x = long - halfMinNodeSize; x < long + halfMinNodeSize; x += resolution) {
            //   for (let y = lat - halfMinNodeSize; y < lat + halfMinNodeSize; y += resolution) {
            //     const subPointFeature = turfPoint([x, y], feature.properties);
            //     state.features.push(subPointFeature);
            //   }
            // }
          }
        }
      }
    }
  });
}


function loadTextFile(file) {
  console.log("[DataWorker]: Load file:", file.name);

  io.readFile(file, 'text', (event) => {
    let mode = event.lengthComputable? COUNT_WITH_TOTAL : COUNT;
    console.log("!!!! io.readFile progress!!", event);
    dispatch(setFileProgress("Loading file...", mode, event.loaded, {total: event.total}));
  }).then(result => {
    parseDSVHeader(result.data)
  }).catch(error => {
    console.log("File read error:", error);
    if (error.message && error.name)
      dispatch(setFileError(error.name, error.message));
    else
      dispatch(setFileError("Error reading file", error.toString()));
  });
}


function loadFiles(files) {
  const numFiles = files.length;

  let isShapefile = _.any(files, file => /shp$/.test(file.name));

  if (isShapefile)
    loadShapefiles(files);
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

  state.DSVType = isTSV? "TSV" : "CSV";
  let parser = isTSV? d3.tsv : d3.csv;

  dispatch(setFileProgress(`Trying to parse the file as ${state.DSVType}...`, INDETERMINATE));

  const parsedHead = parser.parseRows(headLines.join('\n'));

  let columns = parsedHead[0];

  if (columns.length < 3)
    return dispatch(setFileError(`Not enough columns: ${columns}`));

  dispatch(requestDSVColumnMapping(parsedHead));

  // Save reference to continue when columns selected
  state.DSVStringContent = content;
}


function parseDSV(fieldsToColumns) {
  console.log("[DataWorker]: parseDSV with fieldsToColumns:", fieldsToColumns);
  const {Name, Latitude, Longitude} = fieldsToColumns; // Contains index of corresponding field

  let parser = state.DSVType == "TSV" ? d3.tsv : d3.csv;
  let numSkipped = 0;
  let count = 0;

  let features = parser.parseRows(state.DSVStringContent, (row, index) => {
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

  if (features.length === 0)
    return dispatch(setFileError(`No valid records could be parsed. ${numSkipped} skipped.`));

  // Store features
  state.features = features;

  dispatch(setFileProgress("Parsing rows... done!", COUNT, count, {numSkipped, done: true}));

  dispatch(setFileProgress("Aggregating species...", INDETERMINATE));
  groupByName();

  dispatch(setFileProgress("Binning species...", INDETERMINATE));
  binData();

  dispatch(setFileProgress("Transferring result...", INDETERMINATE));
  dispatch(addSpeciesAndBins(state.species, getSummaryBins(state.bins)));
}

function groupByName() {
  state.species = S.sortedCountBy(feature => feature.properties.name, state.features);
  // state.speciesCountMap = d3.map(state.species, d => d.name);
  state.speciesCountMap = new Map(state.species.map(({name, count}) => [name, count]));
}

function getSummaryBins() {
   // Bin and map to summary bins, all individual features not needed
   return state.bins.map((bin) => {
     const countedSpecies = S.countBy(feature => feature.properties.name, bin.features);
     const topCommonSpecies = S.topSortedBy(d => d.count, 10, countedSpecies);
     const topIndicatorSpecies = S.topIndicatorItems("name", state.speciesCountMap, state.species[0].count, topCommonSpecies[0].count, 10, topCommonSpecies)
     return {
       x1: bin.x1,
       x2: bin.x2,
       y1: bin.y1,
       y2: bin.y2,
       isLeaf: bin.isLeaf,
       area: bin.area(),
       size: bin.size(),
       count: bin.features.length,
       speciesCount: countedSpecies.length,
       topCommonSpecies,
       topIndicatorSpecies,
       clusterId: -1
     };
   });
}

function binData(dispatchResult = false) {
  if (state.features.length === 0)
    return;
  dispatch(setBinningProgress("Binning species...", INDETERMINATE));
  let binner = new QuadtreeGeoBinner()
   .minNodeSizeLog2(state.binning.minNodeSizeLog2)
   .maxNodeSizeLog2(state.binning.maxNodeSizeLog2)
   .nodeCapacity(state.binning.nodeCapacity)
   .lowerThreshold(state.binning.lowerThreshold);
  state.bins = binner.bins(state.features);

  if (dispatchResult) {
    dispatch(addSpeciesAndBins(state.species, getSummaryBins(state.bins)));
  }
}

function mergeClustersToBins(clusterIds, bins) {
  // return bins.map((bin, i) => Object.assign(bin, {clusterId: clusterIds[i]}));
  if (clusterIds.length === bins.length) {
    bins.forEach((bin, i) => {
      bin.clusterId = clusterIds[i];
    });
  }
  return bins;
}

function calculateClusterStatistics(clusterIds) {
  mergeClustersToBins(clusterIds, state.bins);

  dispatch(setClusteringProgress("Calculating cluster statistics...", INDETERMINATE));
  const clusterStatistics = getClusterStatistics(clusterIds, state.bins, state.species[0].count, state.speciesCountMap)

  dispatch(setClusteringProgress("Transferring clusters...", INDETERMINATE));
  dispatch(addClustersAndStatistics(clusterIds, clusterStatistics));
}

function onInfomapFinished(error, clusterIds) {
  if (error)
    console.log("Error running Infomap:", error);
  else
    calculateClusterStatistics(clusterIds);
}

function getClusters(infomapArgs) {
  const networkData = getBipartiteNetwork(state.species, state.features, state.bins);

  var haveWorker = typeof Worker === 'function'; // Only Firefox support nested workers
  if (haveWorker) {
    calculateInfomapClusters(dispatch, infomapArgs, networkData, onInfomapFinished);
  }
  else {
    dispatch(calculateClusters(networkData, infomapArgs));
  }
}

onmessage = function(event) {
  const {type} = event.data;
  console.log("[DataWorker]: got message of type:", type);
  switch (type) {
    case LOAD_FILES:
      console.log("Reset data worker state");
      state = getInitialState();
      loadFiles(event.data.files);
      break;
    case SET_FIELDS_TO_COLUMNS_MAPPING:
      parseDSV(event.data.fieldsToColumns);
      break;
    case SET_FEATURE_NAME_FIELD:
      parseGeoJSON(event.data.featureNameField);
      break;
    case GET_CLUSTERS:
      getClusters(event.data.infomapArgs);
      break;
    case ADD_CLUSTERS:
      calculateClusterStatistics(event.data.clusterIds);
      break;
    case BINNING_MIN_NODE_SIZE:
      let oldMinNodeSizeLog2 = event.data.minNodeSizeLog2;
      state.binning.minNodeSizeLog2 = event.data.minNodeSizeLog2;
      if (state.binning.minNodeSizeLog2 < oldMinNodeSizeLog2) {
        shapeToPoints();
      }
      binData(true);
      break;
    case BINNING_MAX_NODE_SIZE:
      state.binning.maxNodeSizeLog2 = event.data.maxNodeSizeLog2;
      binData(true);
      break;
    case BINNING_NODE_CAPACITY:
      state.binning.nodeCapacity = event.data.nodeCapacity;
      binData(true);
      break;
    case BINNING_LOWER_THRESHOLD:
      state.binning.lowerThreshold = event.data.lowerThreshold;
      binData(true);
      break;
    default:
      console.log("[DataWorker]: Unrecognised message type:", type);
  }
};
