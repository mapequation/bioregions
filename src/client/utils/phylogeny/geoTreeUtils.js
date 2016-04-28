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
 * @param fractionLimit group clusters into main while below fractionLimit
 * @return object {totCount, main: [{clusterId, count}, ...], rest: [{clusterId, count}, ...]}
 */
export function _sortAndLimitClusters({count:totCount, clusters}, fractionLimit = 0.9) {
    const sortedClusters = _(Array.from(clusters)).map(([clusterId, count]) => {
        return {clusterId, count};
    }).sortBy('count').reverse().value();
    
    const limitedClusters = reduceLimitRest(0,
        (sum, {count}) => sum + count,
        sum => sum / totCount <= fractionLimit,
        (sum, rest) => { return { clusterId: 'rest', count: totCount - sum, rest}; },
        sortedClusters);
        // d => {
        // console.log(`clusterId: ${d.clusterId}, count: ${d.count}, sum: ${sumRestCount + d.count}, < restLimit ? ${(sumRestCount + d.count) / totCount < restLimit}`);
        // if ((sumRestCount + d.count) / totCount < restLimit) {
        //     sumRestCount += d.count;
        //     console.log(` --> sumRestCount: ${sumRestCount}`);
        //     return true;
        // }
        // return false;
    // }, rest => {
    //     console.log(`========> sumRestCount: ${sumRestCount}, rest: ${JSON.stringify(rest)}`);
    //     return {
    //         clusterId: 'rest',
    //         count: sumRestCount,
    //         rest,
    //     };
    // }, sortedClusters);
    
    return {
        totCount,
        clusters: limitedClusters,
    }
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