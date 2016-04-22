import _ from 'lodash';

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
export function visitTreeDepthFirst(opts, root, callback) {
  if (!callback) {
    [opts, root, callback] = [{}, opts, root];
  }
  if (!opts.postOrder && (!opts.include || opts.include(root)) && callback(root)) return true;
  let childExit = !_.every(root.children || [], child => !visitTreeDepthFirst(opts, child, callback));
	if (childExit || opts.postOrder && (!opts.include || opts.include(root)) && callback(root)) return true;
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

export default {
  visitTreeDepthFirst,
  mapDepthFirst,
  visitTreeBreadthFirst,
  visitLeafNodes,
  mapLeafNodes,
  getLeafNodes,
  collapse,
};