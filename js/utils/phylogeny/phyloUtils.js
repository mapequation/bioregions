import treeUtils from '../treeUtils';
import _ from 'lodash';

/**
 * Aggregate counts from leaf nodes to root (modifies the tree)
 * @param tree:Object The tree
 * @param getLeafCount:Function (leafNode) => count. Default to zero.
 */
export function aggregateCount(tree, getLeafCount) {
    // Reset counts on leaf nodes and aggregate on parents
    treeUtils.visitTreeDepthFirst({ postOrder: true }, tree, node => {
        if (!node.children) {
            node.count = getLeafCount(node) || 0;
            return;
        }
        node.count = _.reduce(node.children, (sum, { count }) => sum + count, 0);
    });
    return tree;
}

/**
 * Prune the tree (generate a new tree but reuse same node objects)
 * @param tree:Object The tree
 * @param include:Function (node) => Boolean. Return true to include the node,
 * else the whole branch will not be included.
 */
export function prune(tree, include) {
    const newTree = Object.assign({}, tree);
    newTree.children = [];
    let current = newTree;
    
    function clone(node) {
        if (!node.children) return;
        current.children = [];
        _.each(node.children, child => {
            if (include(child)) {
                const parent = current;
                current = Object.assign({}, child);
                current.children = null;
                parent.children.push(current);
                clone(child);
                current = parent;
            }
        });
        if (current.children.length === 0) {
            current.children = null;
        }
    }
    clone(tree);
    return newTree;
}

export default {
    aggregateCount,
    prune,
}