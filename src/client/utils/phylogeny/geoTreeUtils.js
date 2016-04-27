import treeUtils from '../treeUtils';
import _ from 'lodash'


/**
 * Internal function to simply aggregate clusters and count from leafs to root
 * into cluster maps on each node
 * @param clustersPerSpecies: {}, // name -> {count, clusters: [{clusterId, count}, ...]}
 * Each node in the tree will get .clusters: { count:Number, clusters:{ clusterId -> count } }
 * @return the modified tree
 */
export function _aggregateClusters(tree, clustersPerSpecies = {}) {
    treeUtils.visitTreeDepthFirst(tree, (node) => {
        // Use Map instead of Object to keep clusterIds as numbers
        node.clusters = { count: 0, clusters: new Map() };
        if (node.children)
            return;
        
        const clusters = clustersPerSpecies[node.name];
        if (clusters) {
            treeUtils.visitAncestors({ includeStartNode: true }, node, ancestor => {
                ancestor.clusters.count += clusters.count;
                const ancestorClusters = ancestor.clusters.clusters;
                clusters.clusters.forEach(({clusterId, count}) => {
                    const aggregatedCount = ancestorClusters.get(clusterId);
                    if (aggregatedCount === undefined)
                        ancestorClusters.set(clusterId, count);
                    else
                        ancestorClusters.set(clusterId, aggregatedCount + count);                    
                })
            })
        }
    });
    return tree;
}

/**
 * Internal function to transform cluster map to sorted array grouped on fraction limit
 * @param clusters {totCount, clusters: Map([[clusterId,count],...])
 * @param totCount sum count in clusterMap
 * @param fractionLimit group clusters into main while below fractionLimit
 * @return object {totCount, main: [{clusterId, count}, ...], rest: [{clusterId, count}, ...]}
 */
export function _sortAndLimitClusters({count:totCount, clusters}, fractionLimit = 0.9) {
    let sumCount = 0;
    let sumRestCount = 0;
    let sortedClusters = _(Array.from(clusters)).map(([clusterId, count]) => {
        return {clusterId, count};
    }).sortBy('count').reverse()
    .groupBy(d => {
        sumCount += d.count;
        if (sumCount / totCount <= fractionLimit) {
            return 'clusters';
        } else {
            sumRestCount += d.count;
            return 'rest';
        };
    }).value();
    sortedClusters.totCount = totCount;
    if (!sortedClusters.clusters) {
        sortedClusters.clusters = [];
    }
    // Add the rest as a 'virtual' cluster element for easier pie charts etc
    if (sortedClusters.rest) {
        sortedClusters.clusters.push({clusterId: 'rest', count: sumRestCount});
    }
    return sortedClusters;
}

export function aggregateSortAndLimitClusters(tree, clustersPerSpecies = {}, fractionLimit = 0.9) {
    _aggregateClusters(tree, clustersPerSpecies);
    treeUtils.visitTreeDepthFirst(tree, (node) => {
        node.clusters = _sortAndLimitClusters(node.clusters, fractionLimit);
    });
    return tree;
}

export default {
    aggregateSortAndLimitClusters,
}