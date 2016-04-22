import treeUtils from '../treeUtils';

/**
 * Aggregate counts from leaf nodes to root
 * @param tree:Object The tree
 * @param getLeafCount:Function (leafNode) => count. Default to zero.
 */
export function aggregateCount(tree, getLeafCount) {
    // Reset counts on leaf nodes and aggregate on parents
    treeUtils.visitTreeDepthFirst(tree, node => {
        if (!node.children) {
            node.count = getLeafCount(node) || 0;
            return;
        }
        node.count = _.reduce(node.children, (sum, { count }) => sum + count, 0);
    }, false);
    return tree;
}

export default {
    aggregateCount,
}