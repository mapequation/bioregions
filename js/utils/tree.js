import _ from 'lodash';

/**
 * Visits the subtree rooted at this node using a depth first search,
 * invoking the callback function on each visited node.
 * @param root the root node to start the visit.
 * @param callback the function to invoke on the nodes. If the function
 *  returns true, the visitation is ended with an early exit.
 * @param preorder if true, nodes are visited in a pre-order traversal (default);
 *  if false, they are visited in a post-order traversal
 * @return true if the visitation was interrupted with an early exit
 */
export function visitTreeDepthFirst(root, callback, preorder = true) {
  if (preorder && callback(root)) return true;
  let childExit = !_.every(root.children || [], child => !visitTreeDepthFirst(child, callback, preorder));
	if (childExit || !preorder && callback(root)) return true;
	return false;
}

export function mapDepthFirst(root, callback, preorder = true) {
  const res = [];
  visitTreeDepthFirst(root, node => {
    res.push(callback(node));
  }, preorder);
  return res;
}

export function filterDepthFirst(root, callback, preorder = true) {
  const res = [];
  visitTreeDepthFirst(root, node => {
    let val = callback(node);
    if (val)
      res.push(val);
  }, preorder);
  return res;
}

/**
 * Visits the subtree rooted at this node using a breadth first search,
 * invoking the callback function on each visited node.
 * @param callback the function to invoke on the nodes. If the function
 *  returns true, the visitation is ended with an early exit.
 * @return true if the visitation was interrupted with an early exit
 */
export function visitTreeBreadthFirst(root, callback) {
	let q = [], x;

	q.push(root);
	while (q.length > 0) {
		if (callback(x=q.shift())) return true;
		(x.children || []).forEach(child => q.push(child));
	}
	return false;
}

export function visitLeafNodes(root, callback) {
  visitTreeDepthFirst(root, node => {
    if (!node.children)
      callback(node);
  });
}

export function getLeafNodes(root) {
  let leafNodes = [];
  visitTreeDepthFirst(root, node => {
    if (!node.children)
      leafNodes.push(node);
  });
  return leafNodes;
}

export function collapse(node) {
  if (node.children) {
    node._children = node.children;
    node._children.forEach(collapse);
    node.children = null;
  }
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

