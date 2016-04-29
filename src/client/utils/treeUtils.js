import _ from 'lodash';
import { normalizeSpeciesName } from './naming'

/**
 * Visits the subtree rooted at this node using a depth first search,
 * invoking the callback function on each visited node.
 * @param opts:Object Optional options:
 *  postOrder:Boolean to visit post order (children before parents). Pre-order by default.
 *  include:Function if give, only visit nodes that predicates true in the include function.
 * @param root the root node to start the visit.
 * @param callback the function to invoke on the nodes. If the function
 *  returns true, the visitation is ended with an early exit.
 * @param preorder if true, nodes are visited in a pre-order traversal (default);
 *  if false, they are visited in a post-order traversal
 * @return true if the visitation was interrupted with an early exit
 */
export function visitTreeDepthFirst(opts, root, callback, depth = 0) {
  if (!callback) {
    [opts, root, callback] = [{}, opts, root];
  }
  if (!opts.postOrder && (!opts.include || opts.include(root)) && callback(root, depth)) return true;
  let childExit = !_.every(root.children || [], child => !visitTreeDepthFirst(opts, child, callback, depth + 1));
	if (childExit || opts.postOrder && (!opts.include || opts.include(root)) && callback(root, depth)) return true;
	return false;
}

export function mapDepthFirst(opts, root, callback) {
  if (!callback) {
    [opts, root, callback] = [{}, opts, root];
  }
  const res = [];
  visitTreeDepthFirst(opts, root, node => {
    res.push(callback(node));
  });
  return res;
}

/**
 * Visits the subtree rooted at this node using a breadth first search,
 * invoking the callback function on each visited node.
 * @param opts:Object Optional options:
 *  include:Function if give, only visit nodes that predicates true in the include function.
 * @param callback the function to invoke on the nodes. If the function
 *  returns true, the visitation is ended with an early exit.
 * @return true if the visitation was interrupted with an early exit
 */
export function visitTreeBreadthFirst(opts, root, callback) {
  if (!callback) {
    [opts, root, callback] = [{}, opts, root];
  }
  const q = [];
  let x;

	q.push(root);
	while (q.length > 0) {
    x = q.shift();
    if (opts.include && !opts.include(x)) continue;
		if (callback(x)) return true;
		(x.children || []).forEach(child => q.push(child));
	}
	return false;
}

export function visitLeafNodes(root, callback) {
  visitTreeDepthFirst(root, node => {
    if (!node.children) {
      callback(node);
    }
  });
}

export function mapLeafNodes(root, callback) {
  const res = [];
  visitLeafNodes(root, (leaf) => {
    res.push(callback(leaf));
  });
}

export function getLeafNodes(root) {
  const leafNodes = [];
  visitTreeDepthFirst(root, node => {
    if (!node.children) {
      leafNodes.push(node);
    }
  });
  return leafNodes;
}

export function visitAncestors(opts, node, callback) {
  if (!callback)
    [opts, node, callback] = [{}, opts, node];
  let current = node;
  if (opts.includeStartNode)
    callback(current);
  while (current.parent) {
    current = current.parent;
    callback(current);
  }
}

export function collapse(node) {
  if (node.children) {
    node._children = node.children;
    node._children.forEach(collapse);
    node.children = null;
  }
  return node;
}

/**
 * Visit the tree from bottom to top with mutator callbacks
 * to set aggregated values on the nodes
 * @param root:Object The tree
 * @param parentMutator Function called on non-leaf nodes
 * @param leafMutator Function called on leaf nodes
 */
export function aggregate(root, parentMutator, leafMutator) {
  visitTreeDepthFirst(root, (node) => {
    if (!node.children)
      leafMutator(node);
    else
      parentMutator(node);
  }, false);
}



/**
 * Aggregate counts from leaf nodes to root (modifies the tree)
 * @param tree:Object The tree
 * @param getLeafCount:Function (leafNode) => count. Default to zero.
 */
export function aggregateCount(tree, getLeafCount) {
    // Reset counts on leaf nodes and aggregate on parents
    visitTreeDepthFirst({ postOrder: true }, tree, node => {
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

export function clone(tree) {
    return prune(tree, () => true);
}

export function normalizeNames(tree) {
    visitTreeDepthFirst(tree, (node) => {
        if (node.name) {
            node.name = normalizeSpeciesName(node.name);
        }
    });
}


export default {
  visitTreeDepthFirst,
  mapDepthFirst,
  visitTreeBreadthFirst,
  visitLeafNodes,
  mapLeafNodes,
  getLeafNodes,
  visitAncestors,
  collapse,
  aggregateCount,
  prune,
  clone,
  normalizeNames,
};