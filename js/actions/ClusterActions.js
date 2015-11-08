import {REQUEST_CLUSTERS, ADD_CLUSTERS, ERROR_MESSAGE} from '../constants/ActionTypes';
import * as DataFetching from '../constants/DataFetching';
import axios from 'axios';
import d3 from 'd3';

function setError(message) {
  return {
    type: ERROR_MESSAGE,
    message
  }
}

/**
* Add the bioregions clusters
* @param clusterIds An array of cluster indexes for the corresponding spatial bins array
*/
function addClusters(clustersIds, binsTimestamp) {
  return {
    type: ADD_CLUSTERS,
    clustersIds,
    binsTimestamp
  }
}

function requestClusters(binsTimestamp) {
  return {
    type: REQUEST_CLUSTERS,
    binsTimestamp
  }
}

function calculateClusters(bins) {
  return dispatch => {
    dispatch(requestClusters(url));
    return axios.get(url)
      .then(response => dispatch(addWorld(response.data)))
      .catch(response => dispatch(setError(`Error loading world '${url}': ${response}`)));
  }
}


function getBipartiteNetwork(features, bins) {
  // Collect unique names //TODO: Histogram grouped on name should be on state?
  let uniqueNames = new Set();
  features.forEach((feature) => {
      uniqueNames.add(feature.properties.name);
  });
  // Map names to index
  var speciesNameToIndex = new Map();
  var speciesCounter = 0;
  uniqueNames.forEach((name) => {
      ++speciesCounter;
      speciesNameToIndex.set(name, speciesCounter);
  });

  // Create network with links from species to bins
  var network = [];
  network.push("# speciesId binId [speciesCount]");
  var binCounter = 0;
  bins.forEach((bin) => {
    ++binCounter;
    bin.points.forEach((point) => {
      network.push(`f${speciesNameToIndex.get(point.properties.name)} n${binCounter}`);
    })
  });
  console.log("First 10 links:", network.slice(0,10));
  return network.join('\n');
}

function onInfomapFinished(dispatch, binsTimestamp, output) {
  console.log("Infomap finished!");
  let parser = d3.dsv(" ", "text/plain");
  let commentCharCode = "#".charCodeAt(0);
  let clu = parser.parseRows(output.clu, function accessor(row, index) {
    // Row is # nodeId clusterId flow
    // nodeId is prepended by 'n' for bipartite networks
    if (row[0].charCodeAt(0) === commentCharCode)
      return null; // Strip commented rows
    return [+row[0].substring(1), +row[1]]; // [nodeId, clusterId] // zero-based
  });
  let clusterIds = new Array(clu.length);
  clu.forEach((row) => {
    clusterIds[row[0] - 1] = row[1] - 1;
  });
  dispatch(addClusters(clusterIds, binsTimestamp));
}


export function getClusters(infomapArgs = "-v") {
  return (dispatch, getState) => {
    const {features, bins} = getState().data;
    if (bins.length === 0)
      return Promise.resolve();

    const binsTimestamp = Date.now(); //TODO: Should be on state
    dispatch(requestClusters(binsTimestamp));

    const networkData = getBipartiteNetwork(features, bins);

    console.log("Creating worker...");
    var worker = new Worker('Infomap-worker.js');

    infomapArgs += " -i bipartite --clu --skip-adjust-bipartite-flow -2";

    worker.onmessage = function worker_onmessage(event) {
      // console.log('\nclient got ' + JSON.stringify(event.data).substr(0, 150) + '\n');
      var data = event.data;
      switch (data.target) {
        case 'stdout': {
          console.log(data.content);
          break;
        }
        case 'stderr': {
          console.log("Error: " + data.content);
          break;
        }
        case 'finished': {
          console.log("Infomap finished with data:", data);
          // dispatch(addClusters(data.output));
          onInfomapFinished(dispatch, binsTimestamp, data.output);
          console.log("Terminating worker...");
          worker.terminate();
          break;
        }
        default: throw `Unknown target on message from Infomap worker: '${data}'`;
      }
    };

    setTimeout(function() {
      console.log("Init Infomap worker with args:", infomapArgs);
      worker.postMessage({
        target: 'Infomap',
        inputFilename: 'network.txt',
        inputData: networkData,
        arguments: infomapArgs
      });
    }, 0); // delay til next frame, to make sure html is ready


  }
}
