import treeUtils from '../treeUtils';

/**
 * @param clustersPerSpecies: {}, // name -> {count, clusters: [{clusterId, count}, ...]}
 */
export function aggregateClusters(tree, clustersPerSpecies) {
    treeUtils.visitTreeDepthFirst(tree, (node) => {
        node.clusters = { count: 0, clusters: [] };
        
    });
}