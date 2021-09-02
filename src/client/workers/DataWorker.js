import d3 from "d3";
import _ from "lodash";
import {
  LOAD_FILES,
  LOAD_TREE,
  SET_FIELDS_TO_COLUMNS_MAPPING,
  SET_FEATURE_NAME_FIELD,
  GET_CLUSTERS,
  ADD_CLUSTERS,
  BINNING_CHANGE_UNIT,
  BINNING_MIN_NODE_SIZE,
  BINNING_MAX_NODE_SIZE,
  BINNING_NODE_CAPACITY,
  BINNING_LOWER_THRESHOLD,
  BINNING_PATCH_SPARSE_NODES,
  CANCEL_FILE_ACTIONS,
  CHANGE_TREE_WEIGHT_MODEL,
  REMOVE_SPECIES,
} from "../constants/ActionTypes";
import * as Binning from "../constants/Binning";
import {
  setFileProgress,
  setBinningProgress,
  setClusteringProgress,
  INDETERMINATE,
  COUNT,
  COUNT_WITH_TOTAL,
} from "../actions/ProgressActions";
import {
  setFileError,
  requestDSVColumnMapping,
  requestGeoJSONNameField,
  addSpeciesAndBins,
  addPhyloTree,
} from "../actions/FileLoaderActions";
import {
  addClustersAndStatistics,
  calculateClusters,
} from "../actions/ClusterActions";
import { setError } from "../actions/ErrorActions";
import io from "../utils/io";
import shp from "shpjs";
import * as S from "../utils/statistics";
import QuadtreeGeoBinner from "../utils/QuadtreeGeoBinner";
import {
  calculateInfomapClusters,
  getClusterStatistics,
  getBipartiteNetwork,
  getBipartitePhyloNetwork,
  mergeClustersToBins,
  getPajekNetwork,
  getJaccardIndex,
  getAllJaccardIndex,
} from "../utils/clustering";
import { polygonExtent } from "../utils/polygons";
import turfPolygon from "turf-polygon";
import turfSimplify from "turf-simplify";
import turfExtent from "turf-extent";
import turfPoint from "turf-point";
import turfInside from "turf-inside";
import { parseTree } from "../utils/phylogeny";
import treeUtils from "../utils/treeUtils";

console.log(`[DataWorker] ok`);

// Worker state
// TODO: Set inital value on a single place between worker and main!
const getInitialState = () => {
  return {
    isInitial: true,
    geoJSON: null,
    DSVType: null, // "TSV" or "CSV"
    DSVStringContent: null, // string content for dsv files
    features: [], // Only point features here, possibly regenerate from shapeFeatures on binning change
    bins: [],
    species: [], // array of [{name, count}], sorted on count
    speciesToBins: {}, // { name:String -> { speciesId: Int, bins: Set<binId:Int> }}
    speciesCountMap: new Map(),
    shapeFeatures: null, // Store shapefile/GeoJSON features here to generate point features
    binning: {
      // TODO: Sync with main data state
      unit: Binning.DEGREE,
      minNodeSizeLog2: 0,
      maxNodeSizeLog2: 2,
      nodeCapacity: 100,
      lowerThreshold: 10,
      patchSparseNodes: true,
    },
    simplifyGeometry: true, // Simplify during load to reduce memory usage
    tree: {}, // Parsed newick tree
    treeWeightModelIndex: 0,
  };
};

var state = getInitialState();

function dispatch(action) {
  postMessage(action);
}

// progress signature: (activity, mode, amount, total)

function dispatchError(message) {
  dispatch(setError(message));
}

function getNodeSize(exponent) {
  const size = Math.pow(2, exponent);
  switch (state.binning.unit) {
    case Binning.DEGREE:
      return size;
    case Binning.MINUTE:
      return size / 60;
    default:
      return size;
  }
}

function loadShapefiles(files) {
  console.log("Load shapefiles...");
  dispatch(setFileProgress("Load shapefiles...", INDETERMINATE));
  const numFiles = files.length;
  // Keep buffers here
  const shapefiles = new Map();

  for (let i = 0; i < numFiles; ++i) {
    const file = files[i];
    // Only keep .shp, .prj and .dbf files
    if (/shp$|prj$|dbf$/.test(file.name)) {
      shapefiles.set(file.name.slice(-3), file);
    }
  }
  if (!shapefiles.has("dbf")) {
    dispatch(setFileError(`Can't use a .shp file without a .dbf file.`));
    return;
  }

  const filePromises = [];
  shapefiles.forEach((file) => {
    console.log(`Add promise for file ${file.name}...`);
    filePromises.push(
      io.readFile(file, /prj$/.test(file.name) ? "text" : "buffer")
    );
  });

  let numTooSimplifiedPolygons = 0;

  function parseGeometry(geometry, i) {
    // console.log(`Parsing geometry ${i}...`);
    if (i % 1000 === 0) {
      console.log(`Parsing geometry ${i}...`);
    }
    return geometry;
  }

  function parseSimplifiedGeometry(geometry, i) {
    // console.log(`Parsing geometry ${i}...`);
    if (i % 1000 === 0) {
      console.log(`Parsing geometry ${i}...`);
    }

    // const tolerance = 0.5 / 8;
    //TODO: Limit the minNodeSize to current - 3 after loading to limit simplification noise!!
    const tolerance = getNodeSize(state.binning.minNodeSizeLog2 - 4);

    // if (geometry.type === 'Polygon') {
    //   return {
    //     type: 'Point',
    //     coordinates: geometry.coordinates[0][0],
    //   };
    // }
    // if (geometry.type === 'MultiPolygon') {
    //   return {
    //     type: 'Point',
    //     coordinates: geometry.coordinates[0][0][0],
    //   };
    // }
    // return {
    //   type: 'Point',
    //   coordinates: [0, 0],
    // };

    if (geometry.type === "Polygon") {
      if (geometry.coordinates[0].length < 4) {
        return {
          type: "Point",
          coordinates: geom.coordinates[0][0],
        };
      }
      const simplified = turfSimplify({ type: "Feature", geometry }, tolerance);
      if (simplified) {
        simplified.geometry.coordinates = [simplified.geometry.coordinates[0]];
        if (simplified.geometry.coordinates[0].length < 4) {
          ++numTooSimplifiedPolygons;
          return geometry;
        }
        return simplified.geometry;
      }
      return geometry;
    }
    if (geometry.type === "MultiPolygon") {
      const simplifiedCoordinates = [];
      const numPolygonsInMultiPolygon = geometry.coordinates.length;
      geometry.coordinates.forEach((polygonCoords, i) => {
        dispatch(
          setFileProgress(
            "Simplify multipolygon... ",
            COUNT_WITH_TOTAL,
            i + 1,
            { total: numPolygonsInMultiPolygon }
          )
        );
        // simplify each set of polygonCoords in the MultiPolygon
        const simplifiedPolygon = turfSimplify(
          {
            type: "Feature",
            geometry: {
              type: "Polygon",
              coordinates: polygonCoords,
            },
          },
          tolerance
        );
        if (simplifiedPolygon) {
          //TODO: Why just outer ring, doesn't turfSimplifiy support holes?
          simplifiedPolygon.geometry.coordinates = [
            simplifiedPolygon.geometry.coordinates[0],
          ];
          if (simplifiedPolygon.geometry.coordinates[0].length < 4) {
            ++numTooSimplifiedPolygons;
            if (polygonCoords[0].length < 4) {
              console.log(
                "!!!! Original multi->polygon < 4 points!",
                polygonCoords
              );
            } else {
              simplifiedCoordinates.push(polygonCoords);
            }
          } else {
            // console.log('simplified multi->poly coords:', simplifiedPolygon.geometry.coordinates);
            simplifiedCoordinates.push(simplifiedPolygon.geometry.coordinates);
          }
        } else {
          if (polygonCoords[0].length < 4) {
            console.log(
              "!!!! Original multi->polygon not simplified!",
              polygonCoords
            );
          } else {
            simplifiedCoordinates.push(polygonCoords);
          }
        }
      });
      if (simplifiedCoordinates.length === 0) {
        console.log("!! Empty multipolygon!!!");
        return {
          type: "Point",
          coordinates: geometry.coordinates[0][0][0],
        };
      }
      return {
        type: "MultiPolygon",
        coordinates: simplifiedCoordinates,
      };
    }
    console.log("Unhandled geometry:", geometry);
    return geometry;
  }

  const simplifyGeometry = state.simplifyGeometry;

  Promise.all(filePromises)
    .then((result) => {
      console.log("Loaded shapefile buffer, parse shapes...");
      result.forEach((file) => {
        shapefiles.set(file.name.slice(-3), file.data);
      });
      const shpBuffer = shapefiles.get("shp");
      const prjString = shapefiles.get("prj");
      const dbfBuffer = shapefiles.get("dbf");
      dispatch(setFileProgress("Parsing shapes...", INDETERMINATE));
      console.log("Parsing shapes with simplification...");
      const parseGeometryCallback = simplifyGeometry
        ? parseSimplifiedGeometry
        : parseGeometry;
      const parsedShape = shp.parseShp(
        shpBuffer,
        prjString,
        parseGeometryCallback
      );
      dispatch(setFileProgress("Parsing attributes...", INDETERMINATE));
      const parsedDbf = shp.parseDbf(dbfBuffer);
      dispatch(setFileProgress("Combining to GeoJSON...", INDETERMINATE));
      state.geoJSON = shp.combine([parsedShape, parsedDbf]);
      console.log("Loaded state.geoJSON:", state.geoJSON);
      const { properties } = state.geoJSON.features[0];
      console.log(
        `Number of too simplified polygons: ${numTooSimplifiedPolygons} (Keeping unsimplified originals)`
      );
      dispatch(requestGeoJSONNameField(properties));
    })
    .catch((err) => {
      return dispatch(setFileError(`Error loading shapefiles: ${err}`));
    });

  // Promise.all(filePromises)
  //   .then(filesData => {
  //     console.log('Loaded shapefile buffer, parse shapes...');
  //     filesData.forEach(file => { shapefiles.set(file.name.slice(-3), file.data); });
  //     let shpBuffer = shapefiles.get('shp');
  //     let prjString = shapefiles.get('prj');
  //     let dbfBuffer = shapefiles.get('dbf');
  //     dispatch(setFileProgress("Parsing shapes...", INDETERMINATE));

  //     console.log('Streaming shapefile...');
  //     shapefile.open(shpBuffer, dbfBuffer).then(function(source) {
  //       const features = [];
  //       let numFeatures = 0;
  //       let numPolygons = 0;
  //       let numMultiPolygons = 0;
  //       let numPolygonsFromMultiPolygons = 0;
  //       const collection = {type: "FeatureCollection", features: features, bbox: source.bbox};
  //       console.log('Streaming shapefile to collection:', collection);
  //       return source.read().then(function read(result) {
  //         if (result.done) return collection;
  //         ++numFeatures;
  //         const feature = result.value;
  //         const { type } = feature.geometry;

  //         if (type === "Polygon") {
  //           ++numPolygons;
  //           const simplifiedFeature = turfSimplify(feature, 0.5 / 8);
  //           if (simplifiedFeature) {
  //             features.push(simplifiedFeature);
  //           } else {
  //             console.log(`Couldn't simplify feature ${numFeatures}:`, feature);
  //             features.push(feature);
  //           }
  //         }
  //         else if (type === "MultiPolygon") {
  //           ++numMultiPolygons;
  //           feature.geometry.coordinates.forEach(polygonCoords => {
  //             ++numPolygonsFromMultiPolygons;
  //             const polygonFeature = turfPolygon(polygonCoords, feature.properties);
  //             if (!polygonFeature.geometry.bbox) {
  //               polygonFeature.geometry.bbox = turfExtent(feature);
  //             }
  //             const simplifiedFeature = turfSimplify(polygonFeature, 0.5 / 8);
  //             if (simplifiedFeature) {
  //               features.push(simplifiedFeature);
  //             } else {
  //               console.log(`Couldn't simplify polygon in feature ${numFeatures}:`, polygonFeature);
  //               features.push(polygonFeature);
  //             }
  //           });
  //         }
  //         else {
  //           console.log(`Adding non-polygon feature of type ${type}`)
  //           features.push(feature);
  //         }

  //         if (numFeatures % 1000 === 0) {
  //           console.log(`Parsed ${numFeatures} features, ${numPolygons} polygons, expanded ${numMultiPolygons} multipolygons into ${numPolygonsFromMultiPolygons}.`);
  //         }
  //         return source.read().then(read);
  //       });
  //     })
  //     .then(collection => {
  //       console.log('Parsed collection!', collection);
  //       state.geoJSON = collection;
  //       const { properties } = state.geoJSON.features[0];
  //       dispatch(requestGeoJSONNameField(properties));
  //     })
  //     .catch(err => {
  //       console.log('Error parsing shp:', err);
  //     });
  //   })
  //   .catch(err => {
  //     return dispatch(setFileError(`Error loading shapefiles: ${err}`));
  //   });
}

function parseGeoJSON(nameField) {
  state.shapeFeatures = [];
  let numPoints = 0;
  let numPolygons = 0;
  let numMultiPolygons = 0;
  let numMultiPolygonsExpanded = 0;
  let numBadFeatures = 0;
  const numOriginalFeatures = state.geoJSON.features.length;
  let lastPercent = -1;
  console.log("parseGeoJSON:", state.geoJSON);

  state.geoJSON.features.forEach((feature, i) => {
    const percent = Math.round(((i + 1) * 100) / numOriginalFeatures);
    if (percent !== lastPercent) {
      dispatch(
        setFileProgress("Parsing features...", COUNT_WITH_TOTAL, i + 1, {
          total: numOriginalFeatures,
        })
      );
      lastPercent = percent;
    }

    // Simplify the feature
    // console.log("Simplifying features...");
    // feature = turfSimplify(feature, 0.01, false);
    // if (!feature) {
    //   ++numBadFeatures;
    // }
    // else {

    // console.log(i, 'feature:', feature);
    // console.log(' -> properties:', feature.properties);

    feature.properties.name = feature.properties[nameField];
    // Split MultiPolygon features to multiple Polygon features
    const { type } = feature.geometry;
    if (type === "Polygon") {
      ++numPolygons;
      if (!feature.geometry.bbox) feature.geometry.bbox = turfExtent(feature);
      state.shapeFeatures.push(feature);
    } else if (type === "MultiPolygon") {
      ++numMultiPolygons;
      const numPolygonsInMultiPolygon = feature.geometry.coordinates.length;
      numMultiPolygonsExpanded += numPolygonsInMultiPolygon;
      feature.geometry.coordinates.forEach((polygonCoords, i) => {
        dispatch(
          setFileProgress("Parsing multipolygon... ", COUNT_WITH_TOTAL, i + 1, {
            total: numPolygonsInMultiPolygon,
          })
        );
        const polygonFeature = turfPolygon(polygonCoords, feature.properties);
        if (!polygonFeature.geometry.bbox) {
          // polygonFeature.geometry.bbox = turfExtent(feature);
          polygonFeature.geometry.bbox = polygonExtent(polygonCoords);
        }
        state.shapeFeatures.push(polygonFeature);
      });
    } else if (type === "Point") {
      ++numPoints;
      //TODO: Check valid coordinates
      //   const c = feature.geometry.coordinates;
      // if (c[0] >= 180) {
      //     c[0] = (c[0] + 180) % 360 - 180;
      // }
      // if (c[0] < -180) {
      //     c[0] = (c[0] - 180) % 360 + 180;
      // }
      // if (c[1] >= 90) {
      //     c[1] = (c[1] + 90) % 180 - 90;
      // }
      // if (c[1] < -90) {
      //     c[1] = (c[1] - 90) % 180 + 90;
      // }
      if (!feature.geometry.bbox) feature.geometry.bbox = turfExtent(feature);
      state.shapeFeatures.push(feature);
    } else {
      console.log("Unsupported geometry type:", type);
    }
  });
  dispatch(
    setFileProgress(
      "Parsing features... done!",
      COUNT_WITH_TOTAL,
      numOriginalFeatures,
      { total: numOriginalFeatures }
    )
  );

  console.log(
    `numPoints: ${numPoints}, numPolygons: ${numPolygons}, numMultiPolygons: ${numMultiPolygons}, numMultiPolygonsExpanded: ${numMultiPolygonsExpanded}, numBadFeatures: ${numBadFeatures}`
  );

  shapeToPoints();

  dispatch(setFileProgress("Aggregating species...", INDETERMINATE));
  groupByName();

  dispatch(setFileProgress("Binning species...", INDETERMINATE));
  binData();

  dispatch(setFileProgress("Transferring result...", INDETERMINATE));
  dispatchAddSpeciesAndBins();
}

function shapeToPoints() {
  state.features = [];
  const minNodeSize = getNodeSize(state.binning.minNodeSizeLog2);
  const halfMinNodeSize = minNodeSize / 2;
  // const resolution = minNodeSize / 8;
  const tolerance = minNodeSize / 8;
  const totCount = state.shapeFeatures.length;
  let lastPercent = 0;

  state.shapeFeatures.forEach((feature, i) => {
    let percent = Math.round(((i + 1) * 100) / totCount);
    if (percent !== lastPercent) {
      dispatch(
        setFileProgress(
          "Resolving polygons for binning...",
          COUNT_WITH_TOTAL,
          i + 1,
          { total: totCount }
        )
      );
      lastPercent = percent;
    }
    if (feature.geometry.type === "Point") {
      state.features.push(feature);
      return;
    }
    const { bbox } = feature.geometry;
    const bboxWidth = bbox[2] - bbox[0];
    const bboxHeight = bbox[3] - bbox[1];
    const [bboxSizeMin, bboxSizeMax] =
      bboxWidth < bboxHeight
        ? [bboxWidth, bboxHeight]
        : [bboxHeight, bboxWidth];
    if (bboxSizeMax < minNodeSize) {
      // If feature less than minimum cell size, add points at centre
      state.features.push(
        turfPoint(
          [bbox[0] + bboxWidth / 2, bbox[1] + bboxHeight / 2],
          feature.properties
        )
      );
      // const long = bbox[0] + halfMinNodeSize;
      // const lat = bbox[1] + halfMinNodeSize;
      // for (let x = long - halfMinNodeSize; x < long + halfMinNodeSize; x += resolution) {
      //   for (let y = lat - halfMinNodeSize; y < lat + halfMinNodeSize; y += resolution) {
      //     const pointFeature = turfPoint([x, y], feature.properties);
      //     state.features.push(pointFeature);
      //   }
      // }
    } else {
      let simplifiedFeature = turfSimplify(feature, tolerance);
      for (
        let long = bbox[0] + halfMinNodeSize;
        long < bbox[2];
        long += minNodeSize
      ) {
        for (
          let lat = bbox[1] + halfMinNodeSize;
          lat < bbox[3];
          lat += minNodeSize
        ) {
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

  io.readFile(file, "text", (event) => {
    let mode = event.lengthComputable ? COUNT_WITH_TOTAL : COUNT;
    console.log(`io.readFile progress`);
    dispatch(
      setFileProgress("Loading file...", mode, event.loaded, {
        total: event.total,
      })
    );
  })
    .then((result) => {
      parseDSVHeader(result.data);
    })
    .catch((error) => {
      console.log("File read error:", error);
      if (error.message && error.name)
        dispatch(setFileError(error.name, error.message));
      else dispatch(setFileError("Error reading file", error.toString()));
    });
}

function loadFiles(files) {
  const numFiles = files.length;

  let isShapefile = !_.every(files, (file) => !/shp$/.test(file.name));

  if (isShapefile) loadShapefiles(files);
  else loadTextFile(files[0]);
}

function loadNexus(file) {
  console.log("[DataWorker]: Load file:", file.name);

  io.readFile(file, "text", (event) => {
    let mode = event.lengthComputable ? COUNT_WITH_TOTAL : COUNT;
    dispatch(
      setFileProgress("Loading file...", mode, event.loaded, {
        total: event.total,
      })
    );
  })
    .then((result) => {
      parseNexus(result.data);
    })
    .catch((error) => {
      console.log("File read error:", error);
      if (error.message && error.name)
        dispatch(setFileError(error.name, error.message));
      else dispatch(setFileError("Error reading file", error.toString()));
    });
}

function parseNexus(content) {
  dispatch(
    setFileProgress(
      "Trying to parse content as a phylogenetic tree...",
      INDETERMINATE
    )
  );
  if (content.length === 0)
    return dispatch(
      setFileError(
        "No file content to read.",
        "For large files (>100Mb), this may be a bug in Chrome. Please check the file, or try with another browser."
      )
    );

  parseTree(content)
    .then((tree) => {
      console.log("Parsed tree:", tree);
      state.tree = treeUtils.prepareTree(tree);
      dispatch(setFileProgress("Transferring result...", INDETERMINATE));
      dispatch(addPhyloTree(tree));
    })
    .catch((error) => {
      dispatch(setFileError(error, "Please check the format."));
    });
}

function parseDSVHeader(content) {
  console.log("[DataWorker]: parseDSVHeader(content)...");
  dispatch(
    setFileProgress(
      "Trying to parse the file as delimiter-separated values...",
      INDETERMINATE
    )
  );
  if (content.length === 0)
    return dispatch(
      setFileError(
        "No file content to read.",
        "For large files (>100Mb), this may be a bug in Chrome. Please check the file, or try with another browser."
      )
    );
  var extractLine = /^(.+)(\r\n|\n|\r)?$/gm;
  var result;
  let headLines = [];
  while (
    (result = extractLine.exec(content)) !== null &&
    headLines.length < 5
  ) {
    headLines.push(result[1]);
  }

  if (headLines.length < 3)
    return dispatch(
      setFileError(
        `Could only read ${headLines.length} lines.`,
        "Please check the file format."
      )
    );

  let headerLine = headLines[0];
  let isTSV = headerLine.split("\t").length > 1;
  let isCSV = headerLine.split(",").length > 1;

  if (!isTSV && !isCSV)
    return dispatch(
      setFileError("Couldn't recognise the format as CSV or TSV")
    );

  state.DSVType = isTSV ? "TSV" : "CSV";
  let parser = isTSV ? d3.tsv : d3.csv;

  dispatch(
    setFileProgress(
      `Trying to parse the file as ${state.DSVType}...`,
      INDETERMINATE
    )
  );

  const parsedHead = parser.parseRows(headLines.join("\n"));

  let columns = parsedHead[0];

  if (columns.length < 3)
    return dispatch(setFileError(`Not enough columns: ${columns}`));

  dispatch(requestDSVColumnMapping(parsedHead));

  // Save reference to continue when columns selected
  state.DSVStringContent = content;
}

function parseDSV(fieldsToColumns) {
  console.log("[DataWorker]: parseDSV with fieldsToColumns:", fieldsToColumns);
  const { Name, Latitude, Longitude } = fieldsToColumns; // Contains index of corresponding field

  let parser = state.DSVType == "TSV" ? d3.tsv : d3.csv;
  let numSkipped = 0;
  let count = 0;

  let features = parser.parseRows(state.DSVStringContent, (row, index) => {
    // Skip header
    if (index === 0) return null;
    ++count;
    const name = row[Name].replace(/_/g, " ");
    const lat = +row[Latitude];
    let long = +row[Longitude];
    if (name && lat >= lat && long >= long) {
      // not undefined/NaN etc
      if (count % 1000 === 0) {
        dispatch(
          setFileProgress("Parsing rows...", COUNT, count, { numSkipped })
        );
        // postMessage({type: "progress", payload: { count, numSkipped, activity: "Parsing rows..." }});
      }
      if (row[Longitude] === "180") {
        long = -180;
      }
      return {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [long, lat],
        },
        properties: {
          name,
        },
      };
    }
    ++numSkipped;
    return null;
  });
  console.log(
    `Parsed ${features.length} valid features and skipped ${numSkipped} bad ones.`
  );

  if (features.length === 0)
    return dispatch(
      setFileError(
        `No valid records could be parsed. ${numSkipped} skipped due to missing name or coordinates. Please check the format.`
      )
    );

  // Store features
  state.features = features;

  dispatch(
    setFileProgress("Parsing rows... done!", COUNT, count, {
      numSkipped,
      done: true,
    })
  );

  dispatch(setFileProgress("Aggregating species...", INDETERMINATE));
  groupByName();

  dispatch(setFileProgress("Binning species...", INDETERMINATE));
  binData();

  dispatch(setFileProgress("Transferring result...", INDETERMINATE));
  dispatchAddSpeciesAndBins();
}

function groupByName() {
  state.species = S.sortedCountBy(
    (feature) => feature.properties.name,
    state.features
  );
  // state.speciesCountMap = d3.map(state.species, d => d.name);
  state.speciesCountMap = new Map(
    state.species.map(({ name, count }) => [name, count])
  );
}

function getSummaryBins() {
  // Bin and map to summary bins, all individual features not needed
  dispatch(
    setBinningProgress(
      "Calculating summary statistics per cell...",
      INDETERMINATE
    )
  );
  const binSizes = {};
  state.bins.forEach((bin) => {
    binSizes[bin.binId] = bin.features.length;
  });
  const minJaccardIndex = 0.1;
  const numBins = state.bins.length;

  // const jaccardIndexes = getAllJaccardIndex(state.species, state.features, state.bins, minJaccardIndex);

  return state.bins.map((bin, i) => {
    if (i % 10 === 0) {
      dispatch(
        setFileProgress(
          `Calculating cell summary statistics...`,
          COUNT_WITH_TOTAL,
          i + 1,
          { total: numBins }
        )
      );
      // console.log(`Calculating summary statistics per cell (${i + 1} / ${numBins})...`);
    }
    const countedSpecies = S.countBy(
      (feature) => feature.properties.name,
      bin.features
    );
    const topCommonSpecies = S.topSortedBy((d) => d.count, 10, countedSpecies);
    const topIndicatorSpecies = S.topIndicatorItems(
      "name",
      state.speciesCountMap,
      state.species[0].count,
      topCommonSpecies[0].count,
      10,
      countedSpecies
    );
    // const jaccardIndex = getJaccardIndex(bin, state.speciesToBins, binSizes, minJaccardIndex);
    // const jaccardIndex = {};
    // const jaccardIndex = jaccardIndexes[bin.binId];
    return {
      binId: bin.binId,
      x1: bin.x1,
      x2: bin.x2,
      y1: bin.y1,
      y2: bin.y2,
      isLeaf: bin.isLeaf,
      area: bin.area,
      size: bin.size,
      count: bin.features.length,
      speciesCount: countedSpecies.length,
      species: bin.features.map(
        (f) => state.speciesToBins[f.properties.name].speciesId
      ),
      topCommonSpecies,
      topIndicatorSpecies,
      // jaccardIndex,
      clusterId: -1,
    };
  });
}

function binData(dispatchResult = false) {
  if (state.features.length === 0) {
    return;
  }
  const unitText = state.binning.unit === Binning.DEGREE ? "˚" : "′";
  const minText = `${Math.pow(2, state.binning.minNodeSizeLog2)}${unitText}`;
  const maxText = `${Math.pow(2, state.binning.maxNodeSizeLog2)}${unitText}`;
  const statusText = `Binning species.with adaptive resolution from ${minText} to ${maxText}..`;
  console.log(statusText);
  dispatch(setBinningProgress(statusText, INDETERMINATE));
  const binner = new QuadtreeGeoBinner()
    .scale(state.binning.unit === Binning.DEGREE ? 1 : 60)
    .minNodeSizeLog2(state.binning.minNodeSizeLog2)
    .maxNodeSizeLog2(state.binning.maxNodeSizeLog2)
    .nodeCapacity(state.binning.nodeCapacity)
    .lowerThreshold(state.binning.lowerThreshold);
  state.bins = binner.bins(state.features, state.binning.patchSparseNodes);
  state.bins.forEach((bin, i) => {
    bin.binId = i;
  });

  const speciesToBins = {};
  state.species.forEach(({ name }, speciesId) => {
    speciesToBins[name] = {
      speciesId,
      area: 0.0,
      bbox: [Infinity, Infinity, -Infinity, -Infinity], // [left, bottom, right, top]
      bins: new Set(),
    };
  });
  state.bins.forEach((bin) => {
    bin.features.forEach((feature) => {
      const speciesName = feature.properties.name;
      const species = speciesToBins[speciesName];
      species.area += bin.area;
      if (species.bbox[0] > bin.x1) species.bbox[0] = bin.x1;
      if (species.bbox[1] > bin.y1) species.bbox[1] = bin.y1;
      if (species.bbox[2] < bin.x2) species.bbox[2] = bin.x2;
      if (species.bbox[3] < bin.y2) species.bbox[3] = bin.y2;
      species.bins.add(bin.binId);
    });
  });
  state.speciesToBins = speciesToBins;

  state.summaryBins = getSummaryBins(state.bins);

  if (dispatchResult) {
    dispatchAddSpeciesAndBins();
  }
}

function dispatchAddSpeciesAndBins() {
  // dispatch(addSpeciesAndBins(state.species, getSummaryBins(state.bins)));

  // dispatch(addSpeciesAndBins(state.species, state.summaryBins,
  //   getPajekNetwork(state.species, state.features, state.bins)));
  dispatch(
    addSpeciesAndBins(state.species, state.summaryBins, state.speciesToBins)
  );
}

function calculateClusterStatistics(clusterIds) {
  mergeClustersToBins(clusterIds, state.bins);

  dispatch(
    setClusteringProgress("Calculating cluster statistics...", INDETERMINATE)
  );
  const clusterStatistics = getClusterStatistics(
    clusterIds,
    state.bins,
    state.species[0].count,
    state.speciesCountMap
  );

  dispatch(setClusteringProgress("Transferring clusters...", INDETERMINATE));
  dispatch(addClustersAndStatistics(clusterIds, clusterStatistics));
}

function onInfomapFinished(error, clusterIds) {
  if (error) console.log("Error running Infomap:", error);
  else calculateClusterStatistics(clusterIds);
}

function getClusters(infomapArgs, options = {}) {
  let networkData = undefined;
  console.log(
    "state.tree:",
    state.tree,
    "maxLength:",
    state.tree.maxLength,
    "options:",
    options
  );
  if (state.tree && state.tree.maxLength && options.useTree) {
    networkData = getBipartitePhyloNetwork(state);
  } else {
    networkData = getBipartiteNetwork(state);
  }

  var haveWorker = typeof Worker === "function"; // Only Firefox support nested workers
  if (haveWorker) {
    calculateInfomapClusters(
      dispatch,
      infomapArgs,
      networkData,
      onInfomapFinished,
      state
    );
  } else {
    dispatch(calculateClusters(networkData, infomapArgs));
  }
}

function getPajek() {
  const networkData = getPajekNetwork(
    state.species,
    state.speciesToBins,
    state.bins
  );

  dispatch({
    type: "GET_PAJEK_SUCCESSFUL",
    payload: networkData,
  });
}

onmessage = function (event) {
  const { type } = event.data;
  console.log("[DataWorker]: got message of type:", type);
  try {
    switch (type) {
      case LOAD_FILES:
        console.log(
          "Reset data worker state (except binning) and load files..."
        );
        state = {
          ...getInitialState(),
          binning: state.binning,
        };
        loadFiles(event.data.files);
        break;
      case LOAD_TREE:
        loadNexus(event.data.file);
        break;
      case SET_FIELDS_TO_COLUMNS_MAPPING:
        parseDSV(event.data.fieldsToColumns);
        break;
      case SET_FEATURE_NAME_FIELD:
        parseGeoJSON(event.data.featureNameField);
        break;
      case GET_CLUSTERS:
        getClusters(event.data.infomapArgs, { ...event.data });
        break;
      case ADD_CLUSTERS:
        calculateClusterStatistics(event.data.clusterIds);
        break;
      case "GET_PAJEK":
        getPajek();
        break;
      case BINNING_CHANGE_UNIT:
        state.binning.unit = event.data.unit;
        binData(true);
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
      case BINNING_PATCH_SPARSE_NODES:
        state.binning.patchSparseNodes = event.data.patchSparseNodes;
        binData(true);
        break;
      case REMOVE_SPECIES:
        state = getInitialState();
        break;
      case CANCEL_FILE_ACTIONS:
        state = getInitialState();
        break;
      case CHANGE_TREE_WEIGHT_MODEL:
        state.treeWeightModelIndex = event.data.treeWeightModelIndex;
        break;
      default:
        console.log("[DataWorker]: Unrecognised message type:", type);
    }
  } catch (err) {
    console.log("[DataWorker]: Error:", err);
    dispatchError(err.message);
  }
};
