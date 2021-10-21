// @ts-no-check
import _ from 'lodash';

export function normalizeSpeciesName(speciesName) {
  if (!speciesName || speciesName.length === 1)
    return speciesName;
  return _.upperFirst(speciesName.replace(/_/g, ' '));
}


function _visitTreeDepthFirst(opts, node, callback, depth, childIndex, parent) {
  if (!opts.postOrder && (!opts.include || opts.include(node)) && callback(node, depth, childIndex, parent)) return true;
  let childExit = !_.every(node.children || [], (child, i) => !_visitTreeDepthFirst(opts, child, callback, depth + 1, i, node));
  if (childExit || (opts.postOrder && (!opts.include || opts.include(node)) && callback(node, depth, childIndex, parent))) return true;
  return false;
}

/**
 * Visits the subtree rooted at this node using a depth first search,
 * invoking the callback function on each visited node.
 * @param opts:Object Optional options:
 *  postOrder:Boolean to visit post order (children before parents). Pre-order by default.
 *  include:Function if given, only visit nodes that predicates true in the include function.
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
  return _visitTreeDepthFirst(opts, root, callback, 0, 0, null);
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

export function setParents(tree) {
  visitTreeDepthFirst(tree, (node, depth, childIndex, parent) => {
    node.parent = parent;
  });
  return tree;
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
    node.children = null;
  }
  return node;
}

export function collapseAll(node) {
  if (node.children) {
    node._children = node.children;
    node._children.forEach(collapseAll);
    node.children = null;
  }
  return node;
}

export function expand(node) {
  if (node._children) {
    node.children = node._children;
    node._children = null;
  }
  return node;
}

export function expandAll(node) {
  if (node._children) {
    node.children = node._children;
    node._children = null;
  }
  // Even if not collapsed, expand possibly collapsed nodes further down
  if (node.children)
    node.children.forEach(expandAll);
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
  visitTreeDepthFirst({ postOrder: true }, root, (node) => {
    if (!node.children)
      leafMutator(node);
    else
      parentMutator(node);
  });
}

/**
 * Aggregate counts from leaf nodes to root (modifies the tree)
 * @param tree:Object The tree
 * @param getLeafCount:Function (leafNode) => count. Default to zero.
 * @param field {String}, the field to store the count
 */
export function aggregateCount(tree, getLeafCount, field = 'count') {
  // Reset counts on leaf nodes and aggregate on parents
  visitTreeDepthFirst({ postOrder: true }, tree, node => {
    if (!node.children) {
      node[field] = getLeafCount(node) || 0;
      return;
    }
    node[field] = _.reduce(node.children, (sum, child) => sum + child[field], 0);
  });
  return tree;
}

/**
 * Sort the children on all nodes in the tree
 * @param comparator {Function|String} sort by comparator
 * 
 * Example: '-leafCount', corresponds to (a, b) => -1 * (a.leafCount - b.leafCount). 
 * 
 */
export function sort(tree, comparator = 'originalChildIndex') {
  let _comparator = comparator;
  if (typeof comparator === 'string') {
    const first = comparator.charAt(0);
    const descending = first === '-';
    const sortField = descending || first === '+' ? comparator.substr(1) : comparator;
    const sign = descending ? -1 : 1;
    _comparator = (a, b) => sign * (a[sortField] - b[sortField]);
  }
  visitTreeDepthFirst(tree, (node) => {
    if (node.children) {
      node.children.sort(_comparator);
    }
  });
  return tree;
}

function _limitLeafCount(node, limit) {
  node.limitedLeafCount = node.leafCount;

  if (!node.children)
    return node;

  if (node.leafCount <= limit)
    return node;

  const minCollapsedLeafCount = node.leafCount - limit;

  // const LOG = (s) => console.log(`${'    '.repeat(node.depth)}${s}`);
  // LOG(`>>>> Limit node ${node.name}:${node.leafCount} with limit: ${limit} -> minCollapsedLeafCount: ${minCollapsedLeafCount}`);
  let collapsedLeafCount = 0;
  // Collapse from right until limit ok
  for (let i = node.children.length - 1; i !== -1; --i) {
    const child = node.children[i];
    // LOG(` -> ${child.name}:${child.leafCount}`);
    if (collapsedLeafCount + child.leafCount <= minCollapsedLeafCount) {
      // Collapse if below or equal limit
      if (child.children) {
        collapseAll(child);
        collapsedLeafCount += child.leafCount;
        child.limitedLeafCount = 0;
        // LOG(` => collapse ->  ∑ collapsedLeafCount: ${collapsedLeafCount}`);
      }
      else {
        // LOG(` => skip leaf`);
      }
    }
    else {
      if (!node.children) {
        // LOG(` => skip pivotal leaf!`);
        continue;
      }
      // Try finer-grained collapse by recursion. If not enough (due to leaf nodes
      // on next level), collapse the whole node.
      const subMinCollapsedLeafCount = minCollapsedLeafCount - collapsedLeafCount;
      const subLimit = child.leafCount - subMinCollapsedLeafCount;
      // LOG(` -> recurse with subLimit: ${subLimit}`);

      // Recursively prune branch
      _limitLeafCount(child, subLimit);

      const subCollapsedLeafCount = child.leafCount - child.limitedLeafCount;
      // LOG(` => collapsed ${subCollapsedLeafCount} -> ∑ ${collapsedLeafCount + subCollapsedLeafCount} >= ${minCollapsedLeafCount} ?`)

      if (collapsedLeafCount + subCollapsedLeafCount >= minCollapsedLeafCount) {
        collapsedLeafCount += subCollapsedLeafCount;
        // LOG(` YES! break..`);
        break;
      }
      else {
        // Collapse whole node if recursive collapse wasn't enough
        collapseAll(child);
        collapsedLeafCount += child.leafCount;
        // LOG(` NO! Collapse whole node! -> ∑ collapsedLeafCount: ${collapsedLeafCount}`);
        break;
      }
    }
  }
  if (collapsedLeafCount > 0) {
    node.limitedLeafCount -= collapsedLeafCount;
    // LOG(` =====> collapsed ${collapsedLeafCount}/${node.leafCount} leaf nodes -> limitedLeafCount: ${node.limitedLeafCount}`);
  }
  return node;
}


/**
 * Collapse small branches recursively until visible leaf count
 * is below or equal a limit
 * @param tree {Object} the tree
 * @param limit {Number} the leaf count limit under which a branch is collapsed
 * @note The function stores 'limitedLeafCount' on some node,
 * which is the number of visible leaf nodes under the node.
 * 
 * @return tree {Object} the modified tree
 */
export function limitLeafCount(tree, limit = Number.MAX_VALUE) {
  // Prepare for recursive collapse
  expandAll(tree);

  if (!tree.leafCount) {
    aggregateCount(tree, () => 1, 'leafCount');
  }
  // console.log('Debugging limitLeafCount:');
  // visitTreeDepthFirst(tree, (node, depth) => {
  //   node.depth = depth;
  // });

  return _limitLeafCount(tree, limit);
}

/**
 * Prune the tree (generate a new tree but reuse same node objects)
 * @param tree:Object The tree
 * @param include:Function (node) => Boolean. Return true to include the node,
 * else the whole branch will not be included.
 */
export function prune(tree, include) {
  if (!tree)
    return tree;
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


/**
 * Prepare tree with some default and aggregated properties:
 * parent - null for root
 * name - string for leaf nodes, with Capital first letter and '_' -> ' ',
 * may be undefined for parent nodes
 * uid - unique id for each node from 1 to first leaf to numNodes for root
 * originalChildIndex - original index in the children array, 0 for root.
 * isLeaf - boolean
 * depth - number of steps from root
 * length - branch length, > 0 || 1
 * leafCount - number of leaf nodes under each node, 1 for leaf nodes
 * maxLength - max branch length to leafs under each node
 * rootDist - total branch length from root
 */
export function prepareTree(tree) {
  // Traverse from leaf nodes to root to define and aggregate some properties
  let uid = 0;
  tree.branchLength = 0; // Don't use default length 1 on root.
  visitTreeDepthFirst({ postOrder: true }, tree, (node, depth, childIndex) => {
    node.uid = ++uid;
    node.originalChildIndex = childIndex;
    node.isLeaf = !node.children;
    node.depth = depth;
    // Ensure nodes has positive length property, else use length 1
    if (node.branchLength === undefined || node.branchLength < 0) {
      node.branchLength = 1;
    }
    if (node.isLeaf) {
      node.leafCount = 1;
      node.maxLength = node.branchLength;
      // Ensure leaf nodes has name, and replace underscores with spaces
      node.name = node.name ? normalizeSpeciesName(node.name) : '';
    } else { // no leaf
      if (node.name) {
        node.name = node.name.replace(/_/g, ' ');
      }
      let leafCount = 0;
      let maxLength = 0;
      node.children.forEach((child) => {
        leafCount += child.leafCount;
        maxLength = Math.max(maxLength, child.maxLength);
      });
      node.leafCount = leafCount;
      node.maxLength = node.branchLength + maxLength;
    }
  });

  // Traverse from root to leaf nodes to set accumulative root distance
  visitTreeDepthFirst(tree, (node, depth, childIndex, parent) => {
    node.parent = parent;
    if (!parent) {
      node.rootDist = 0;
    } else {
      node.rootDist = parent.rootDist + node.branchLength;
    }
  });

  return tree;
}

/**
 * Remove nodes with only one child
 */
export function simplifyTree(tree) {
  visitTreeDepthFirst(tree, (node) => {
    while (node.children && node.children.length === 1) {
      const child = node.children[0];
      if (child.children) {
        // Replace children
        node.children = child.children;
        child.children.forEach(d => { d.length += child.length; });
      }
    }
    _.each(node.children || [], (child, i) => {
      let d = child;
      while (d.children && d.children.length === 1) {
        // Add length from parent and remove parent
        d.children[0].length += d.length;
        d = d.children[0];
      }
      node.children[i] = d;
    });
  });
  return Object.assign({}, tree);
}
