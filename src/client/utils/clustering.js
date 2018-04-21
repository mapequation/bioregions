import {setFileProgress, setBinningProgress, setClusteringProgress,
  INDETERMINATE, PERCENT, COUNT, COUNT_WITH_TOTAL} from '../actions/ProgressActions';
import d3 from 'd3';
import {
  countBy,
  topSortedBy,
  topIndicatorItems,
  reduceLimitRest,
} from '../utils/statistics';
import _ from 'lodash';

/**
 * Aggregate clusters below a count fraction threshold in a rest cluster.
 * Assume sorted on biggest first. If that is below threshold, keep add while sum
 * is less than the threshold
 * @param fractionThreshold:Number count/totCount >= threshold or sum/totCount < threshold
 * @param [totCount]:Number optional, otherwise it will be calculated from sortedClusters
 * @param sortedClusters:Object {totCount, clusters: [{count, clusterId},...]}
 * @return {totCount, clusters: [{count, clusterId}, ...., {count, clusterId: 'rest', rest: [
 * {count, clusterId}, ...]}]}
 */
export function aggregateSmallClusters(fractionThreshold, totCount, sortedClusters) {
  if (!sortedClusters)
    [totCount, sortedClusters] = [_.sumBy(sortedClusters, 'count'), totCount];
  return reduceLimitRest(0,
    (sum, {count}) => sum + count,
    (sum, {count}) => count / totCount >= fractionThreshold || sum / totCount < fractionThreshold,
    (sum, rest) => { return { clusterId: 'rest', count: totCount - sum, rest}; },
    sortedClusters);
}

/**
*
* returns {
*   clustersPerSpecies: {name -> {totCount, clusters: limitRest([{clusterId, count}, ... ])}}
*   clusters: [{
*    clusterId,
*    numBins,
*    numRecords,
*    numSpecies,
*    topCommonSpecies,
*    topIndicatorSpecies,
*  }, ...]
*
*/
export function getClusterStatistics(clusterIds, bins, maxGlobalCount, speciesCountMap, clustersFractionThreshold = 0.1) {
  if (bins.length === 0)
    return [];
  if (bins[0].clusterId < 0)
    mergeClustersToBins(clusterIds, bins);

  // Cluster per species, sorted on count
  let clustersPerSpecies = {}; // species -> {count, clusters: [{clusterId, count}, ...]}

  // Species per cluster
  const clusters = d3.nest()
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

      // Save to clustersPerSpecies
      const {clusterId} = bins[0]; // All bins in this rollup have the same clusterId
      features.forEach(feature => {
        const {name} = feature.properties;
        let speciesClusters = clustersPerSpecies[name];
        if (!speciesClusters)
          speciesClusters = clustersPerSpecies[name] = {totCount: 0, clusters: [{clusterId, count: 0}]};
        ++speciesClusters.totCount;
        let clusters = speciesClusters.clusters;
        let cluster = clusters[clusters.length - 1];
        if (cluster.clusterId !== clusterId) {
          clusters.push({clusterId, count: 0});
          cluster = clusters[clusters.length - 1];
        }
        ++cluster.count;
      });

      // const topCommonSpecies = topSortedBy(feature => feature.properties.name, 10, features);
      const species = countBy(feature => feature.properties.name, features);
      const topCommonSpecies = topSortedBy(d => d.count, 10, species);
      const topIndicatorSpecies = topIndicatorItems('name', speciesCountMap, maxGlobalCount, topCommonSpecies[0].count, 10, species);
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
    .entries(bins);

  // sort and limit clusters per species
  _.forEach(clustersPerSpecies, cluPerSpecies => {
    const sortedClusters = _(cluPerSpecies.clusters).sortBy('count').reverse().value();
    const { totCount } = cluPerSpecies;
    
    cluPerSpecies.clusters = aggregateSmallClusters(clustersFractionThreshold, totCount, sortedClusters);
  });

  return {clusters, clustersPerSpecies};
}

export function mergeClustersToBins(clusterIds, bins) {
  // return bins.map((bin, i) => Object.assign(bin, {clusterId: clusterIds[i]}));
  if (clusterIds.length === bins.length) {
    bins.forEach((bin, i) => {
      bin.clusterId = clusterIds[i];
    });
  }
  return bins;
}

/**
 * Get similar cells by spreading out weight 1.0 two steps 
 * on the bipartite network
 * @param {Object} cell The selected cell
 * @param {Array<Object>} species Array of {name, count}, sorted on count
 * @param {Object} speciesToBins { name:String -> { speciesId: Int, bins: Set<binId:Int> }}
 */
export function getSimilarCells(cell, species, speciesToBins) {
  const links = new Map();
  console.log('############ getSimilarCells, cell:', cell, '\nspecies:', species);
  // const cellId = cell.binId;
  const speciesIndices = cell.species;
  const numSpecies = speciesIndices.length;
  const weight1 = 1.0 / numSpecies;
  speciesIndices.forEach(index => {
    const name = species[index].name;
    const connectedCells = speciesToBins[name].bins;
    const weight2 = 1.0 / connectedCells.size;
    const weight = weight1 * weight2;
    // console.log(`  weight2: 1.0 / ${connectedCells.length} =`, weight2, '-> w1*w2:', weight);
    connectedCells.forEach(binId2 => {
      links.set(binId2, (links.get(binId2) || 0.0) + weight);
    });
  });
  // console.log('links:', _.map(links, (w) => w).sort((a, b) => b - a));
  // console.log(`cell ${cellId}, selfWeight: ${links[cellId]}, 136: ${links[136]}, 141: ${links[141]}`);
  return links;
}

export function getAllJaccardIndex(species, features, bins, minSimilarity = 0.1) {
  const nameToBins = {};
  species.forEach(({name}) => {
    nameToBins[name] = {};
  });
  bins.forEach((bin) => {
    bin.features.forEach((feature) => {
      nameToBins[feature.properties.name][bin.binId] = 1;
    });
  });
  const links = {};
  bins.forEach((bin) => {
    const binLinks = {};
    bin.features.forEach((feature) => {
      const linkedBins = nameToBins[feature.properties.name];
      _.each(linkedBins, (value, binId) => {
        if (binLinks[binId]) {
          binLinks[binId] += 1;
        } else {
          binLinks[binId] = 1;
        }
      });
      links[bin.binId] = binLinks;
    });
  });
  const binSizes = {};
  bins.forEach((bin) => {
    binSizes[bin.binId] = bin.features.length;
  });
  _.each(links, (binLinks, binId1) => {
    _.each(binLinks, (intersection, binId2) => {
      const jaccard = intersection / (binSizes[binId1] + binSizes[binId2] - intersection);
      if (jaccard < minSimilarity) {
        delete binLinks[binId2];
      } else {
        binLinks[binId2] = jaccard;
      }
    });
    // links[binId1] = _.chain(binLinks)
    // .map((jaccard, binId) => ({
    //   binId, jaccard,
    // }))
    // .sortBy('jaccard')
    // .reverse()
    // .value();
  });
  return links;
}

export function getJaccardIndex(bin, nameToBins, binSizes, minSimilarity = 0.1) {
  const binLinks = {};
  bin.features.forEach((feature) => {
    const linkedBins = nameToBins[feature.properties.name];
    _.each(linkedBins, (value, binId) => {
      if (binLinks[binId]) {
        binLinks[binId] += 1;
      } else {
        binLinks[binId] = 1;
      }
    });
  });
  const jaccardIndex = {};
  const binId1 = bin.binId;
  _.each(binLinks, (intersection, binId2) => {
    const jaccard = intersection / (binSizes[binId1] + binSizes[binId2] - intersection);
    if (jaccard >= minSimilarity) {
      jaccardIndex[binId2] = jaccard;
    }
  });
  return jaccardIndex;
}

export function getBipartiteNetwork(species, features, bins) {

  // Map names to index
  var speciesNameToIndex = new Map();
  var speciesCounter = 0;
  species.forEach(({name}) => {
      ++speciesCounter;
      speciesNameToIndex.set(name, speciesCounter);
  });
  // console.log('==================\nSpecies name to index:');
  // console.log(Array.from(speciesNameToIndex.entries()).join('\n'));

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
  // console.log('========== WHOLE NETWORK =========');
  // console.log(network);
  return network.join('\n');
}

export function getPajekNetwork(species, speciesToBins, bins) {
  console.log(`Generate bipartite network between ${species.length} species and ${bins.length} grid cells ("grid-size long lat")...`);
  const network = [];
  network.push(`# Bipartite network between ${species.length} species and ${bins.length} grid cells ("grid-size long lat")`);
  network.push(`*Vertices ${species.length + bins.length}`);
  // Map names to index
  species.forEach(({ name }, index) => {
    network.push(`${index + 1} "${name}"`);
  });
  console.log('First 10 species nodes:', network.slice(0, 12));
  // console.log('==================\nSpecies name to index:');
  // console.log(Array.from(speciesNameToIndex.entries()).join('\n'));

  bins.forEach((bin, i) => {
    network.push(`${i + 1 + species.length} "${bin.size} ${bin.x1} ${bin.y1}"`);
  });
  console.log('Last 10 grid cell nodes:', network.slice(-10));
  // Add links from species to bins
  network.push('*Edges');
  _.each(speciesToBins, ({ speciesId, bins: linkedBins }) => {
    linkedBins.forEach(binId => {
      network.push(`${speciesId + 1} ${binId + 1 + species.length}`);
    });
  });

  return network.join('\n');
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
    console.log("Worker error:", typeof event, event.type);
    dispatch(setClusteringProgress("Error loading Infomap, please report the issue.", PERCENT, 0));
    callback("Error loading Infomap worker. Please report the issue.");
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
