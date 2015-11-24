import {setFileProgress, setBinningProgress, setClusteringProgress,
  INDETERMINATE, PERCENT, COUNT, COUNT_WITH_TOTAL} from '../actions/ProgressActions';
import d3 from 'd3';
import * as S from '../utils/statistics';

export function getBipartiteNetwork(species, features, bins) {

  // Map names to index
  var speciesNameToIndex = new Map();
  var speciesCounter = 0;
  species.forEach(({name}) => {
      ++speciesCounter;
      speciesNameToIndex.set(name, speciesCounter);
  });

  // Create network with links from species to bins
  var network = [];
  network.push("# speciesId binId [speciesCount]");
  var binCounter = 0;
  bins.forEach((bin) => {
    ++binCounter;
    bin.features.forEach((feature) => {
      network.push(`f${speciesNameToIndex.get(feature.properties.name)} n${binCounter}`);
    })
  });
  console.log("First 10 links:", network.slice(0,10));
  return network.join('\n');
}


export function getClusterStatistics(clusterIds, bins, maxGlobalCount, speciesCountMap) {
  if (bins.length === 0)
    return [];
  if (bins[0].clusterId < 0)
    mergeClustersToBins(clusterIds, bins);
  return d3.nest()
    .key((bin) => bin.clusterId)
    .rollup((bins) => {
      // rollup features grouped on bins
      let features = [];
      bins.forEach((bin) => {
        // Skip patched aggregation of features on non-leaf level
        if (bin.isLeaf) {
          bin.features.forEach((feature) => {
            features.push(feature);
          });
        }
      });
      // Check edge case where sub-nodes have been partitioned to other cluster and only non-leaf nodes left
      if (features.length === 0) {
        bins.forEach((bin, i) => {
          bin.features.forEach((feature) => {
            features.push(feature);
          });
        });
      }
      // const topCommonSpecies = S.topSortedBy(feature => feature.properties.name, 10, features);
      const species = S.countBy(feature => feature.properties.name, features);
      const topCommonSpecies = S.topSortedBy(d => d.count, 10, species);
      const topIndicatorSpecies = S.topIndicatorItems("name", speciesCountMap, maxGlobalCount, topCommonSpecies[0].count, 10, topCommonSpecies);
      const numRecords = features.length;
      const numSpecies = species.length;
      return {
        clusterId: bins[0].clusterId,
        numBins: bins.length,
        numRecords,
        numSpecies,
        topCommonSpecies,
        topIndicatorSpecies,
      }
    })
    .entries(bins)
}

export function calculateInfomapClusters(dispatch, infomapArgs, networkData, callback) {

  // Only Firefox allow spawning workers from other workers
  // var haveWorker = typeof Worker === 'function'; // object in Safari
  var haveWorker = !!Worker;

  if (!haveWorker) {
    return callback(`Worker not available, typeof Worker: ${typeof Worker}. (Only Firefox support spawning workers from other workers)`);
  }

  console.log("Creating Infomap Worker...");
  dispatch(setClusteringProgress("Loading Infomap clustering algorithm...", INDETERMINATE));
  var worker = new Worker('/Infomap-worker.js');

  infomapArgs += " -i bipartite --clu --skip-adjust-bipartite-flow -2";

  worker.onmessage = function worker_onmessage(event) {
    // console.log('\nclient got ' + JSON.stringify(event.data).substr(0, 150) + '\n');
    var data = event.data;
    switch (data.target) {
      case 'stdout': {
        console.log(data.content);
        dispatch(setClusteringProgress("Clustering...", INDETERMINATE, 0, {stdout: data.content}));
        break;
      }
      case 'stderr': {
        console.log("Error: " + data.content);
        dispatch(setClusteringProgress("Clustering...", INDETERMINATE, 0, {stderr: data.content}));
        break;
      }
      case 'finished': {
        console.log("Infomap finished with data:", data);
        dispatch(setClusteringProgress("Clustering...", INDETERMINATE, 0, {done: true}));

        dispatch(setClusteringProgress("Parsing Infomap result...", INDETERMINATE));

        var error = null;
        try {
          var clusterIds = parseInfomapOutput(data.output);
        }
        catch(e) {
          console.log("Error parsing infomap output:", e);
          error = e;
        }
        finally {
          dispatch(setClusteringProgress("Clustering done!", INDETERMINATE));

          callback(error, clusterIds);

          console.log("Terminating Infomap Worker...");
          worker.terminate();
        }
        break;
      }
      default: throw `Unknown target on message from Infomap worker: '${data}'`;
    }
  };

  worker.onerror = function worker_onerror(event) {
    console.log("Worker error:", event.toString(), event.message);
  }

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


function parseInfomapOutput(output) {
  console.log("Parse Infomap output...");
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
  return clusterIds;
}
