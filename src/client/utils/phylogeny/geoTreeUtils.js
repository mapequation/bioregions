import treeUtils from '../treeUtils';
import _ from 'lodash';
import { reduceLimitRest } from '../statistics';


/**
 * Internal function to simply aggregate clusters and count from leafs to root
 * into cluster maps on each node
 * @param clustersPerSpecies: {}, // name -> {totCount, clusters: limitRest([{clusterId, count}, ...])}
 * Each node in the tree will get .clusters: { totCount:Number, clusters: Map[[clusterId,count]] }
 * @return the modified tree
 */
export function _aggregateClusters(tree, clustersPerSpecies = {}) {
    treeUtils.visitTreeDepthFirst(tree, (node) => {
        // Use Map instead of Object to keep clusterIds as numbers
        node.clusters = { totCount: 0, clusters: new Map() };
        if (node.children)
            return;
            
        const aggregateCount = (clusterAggregateMap, clusterId, count) => {
            const aggregatedCount = clusterAggregateMap.get(clusterId);
            if (aggregatedCount === undefined)
                clusterAggregateMap.set(clusterId, count);
            else
                clusterAggregateMap.set(clusterId, aggregatedCount + count);
        }
        
        const clusters = clustersPerSpecies[node.name];
        if (clusters) {
            treeUtils.visitAncestors({ includeStartNode: true }, node, ancestor => {
                ancestor.clusters.totCount += clusters.totCount;
                const ancestorClusters = ancestor.clusters.clusters;
                clusters.clusters.forEach(({clusterId, count, rest}) => {
                    if (rest && rest.length) {
                        rest.forEach(({clusterId, count}) => {
                            aggregateCount(ancestorClusters, clusterId, count);
                        });
                    }
                    else {
                        aggregateCount(ancestorClusters, clusterId, count);
                    }                    
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
 * @param fractionThreshold limit clusters if count less than fractionThreshold
 * @return object {totCount, main: [{clusterId, count}, ...], rest: [{clusterId, count}, ...]}
 */
export function _sortAndLimitClusters({totCount, clusters}, fractionThreshold = 0.1) {
    const sortedClusters = _(Array.from(clusters))
        .map(([clusterId, count]) => {
            return {clusterId, count};
        })
        // Sort on descending count and then increasing clusterId (from Map)
        .reverse()
        .sortBy('count') // stable sort, keeps order for equal items
        .reverse()
        .value();
    
    const limitedClusters = reduceLimitRest(0,
        (sum, {count}) => sum + count,
        (sum, {count}) => count / totCount >= fractionThreshold || sum / totCount < fractionThreshold,
        (sum, rest) => { return { clusterId: 'rest', count: totCount - sum, rest}; },
        sortedClusters);
    
    return {
        totCount,
        clusters: limitedClusters,
    }
}

/**
 * Aggregate clusters on the tree, sorted and limited by fractionThreshold.
 * @param tree:Object the tree
 * * @param clustersPerSpecies: {}, // name -> {totCount, clusters: limitRest([{clusterId, count}, ...])}
 * @param fractionThreshold limit clusters if count less than fractionThreshold
 * 
 * Each node in the tree will get .clusters: { totCount:Number, clusters: limitRest([{clusterId,count}, ...]) }
 * @note it will expand all nodes before aggregating clusters
 * @return the modified tree
 */
export function aggregateClusters(tree, clustersPerSpecies = {}, fractionThreshold = 0.1) {
    treeUtils.expandAll(tree);
    _aggregateClusters(tree, clustersPerSpecies);
    treeUtils.visitTreeDepthFirst(tree, (node) => {
        node.clusters = _sortAndLimitClusters(node.clusters, fractionThreshold);
    });
    return tree;
}

export default {
    aggregateClusters,
}