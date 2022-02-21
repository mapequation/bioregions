import { isEqual } from '../math';

//import _ from 'lodash';
export { prepareTree } from './treeUtilsJS';

export interface Branch {
  parent: PhyloNode;
  child: PhyloNode;
  childWeight: number;
}

export type PhyloNode = {
  parent: PhyloNode | null;
  children: PhyloNode[];
  name: string;
  uid: number;
  originalChildIndex: number;
  isLeaf: boolean;
  depth: number;
  branchLength: number;
  numLeafs: number;
  maxLeafDistance: number;
  rootDistance: number;
  time: number; // Normalized root distance, 0 in root, 1 in youngest leafs
  speciesSet?: Set<string>;
  memory?: Branch;
};

export function visitTreeDepthFirstPreOrder(
  node: PhyloNode,
  callback: (node: PhyloNode) => void,
) {
  callback(node);
  node.children.forEach((child) => {
    visitTreeDepthFirstPreOrder(child, callback);
  });
}

export function visitTreeDepthFirstPostOrder(
  node: PhyloNode,
  callback: (node: PhyloNode) => void,
) {
  node.children.forEach((child) => {
    visitTreeDepthFirstPostOrder(child, callback);
  });
  callback(node);
}

// type VisitOpts = {
//   postOrder?: boolean;
//   include?: (node: Node) => boolean;
// }

// const defaultVisitOpts: VisitOpts = {
//   postOrder: false,
//   include: () => true,
// };

// type VisitCallback<T> = (node: Node, depth: number, childIndex: number, parent?: Node) => T;

// function _visitTreeDepthFirst<T>(
//   opts: VisitOpts,
//   node: Node,
//   callback: VisitCallback<T>,
//   depth: number,
//   childIndex: number,
//   parent?: Node) {
//   if (!opts.postOrder && (!opts.include || opts.include(node)) && callback(node, depth, childIndex, parent)) return true;

//   const childExit = !_.every(node.children || [], (child, i) => !_visitTreeDepthFirst(opts, child, callback, depth + 1, i, node));

//   if (childExit || opts.postOrder && (!opts.include || opts.include(node)) && callback(node, depth, childIndex, parent)) return true;

//   return false;
// }

// /**
//  * Visits the subtree rooted at this node using a depth first search,
//  * invoking the callback function on each visited node.
//  * @param opts:Object Optional options:
//  *  postOrder:Boolean to visit post order (children before parents). Pre-order by default.
//  *  include:Function if given, only visit nodes that predicates true in the include function.
//  * @param root the root node to start the visit.
//  * @param callback the function to invoke on the nodes. If the function
//  *  returns true, the visitation is ended with an early exit.
//  * @param preorder if true, nodes are visited in a pre-order traversal (default);
//  *  if false, they are visited in a post-order traversal
//  * @return true if the visitation was interrupted with an early exit
//  */
// export function visitTreeDepthFirst<T>(root: Node, callback: VisitCallback<T>, opts: VisitOpts = defaultVisitOpts) {
//   return _visitTreeDepthFirst(opts, root, callback, 0, 0);
// }

export function getIntersectingBranches(tree: PhyloNode, time: number) {
  const branches: Branch[] = [];
  visitTreeDepthFirstPostOrder(tree, (node) => {
    const { parent } = node;
    const parentTime = parent?.time ?? 0;
    const parentIsOlder = parent && parentTime <= time;
    const nodeIsYounger = node.time > time || node.isLeaf; // TODO: Fix normalize time to 1, now 0.9998
    const childWeight = (time - parentTime) / (node.time - parentTime);

    if (parentIsOlder && nodeIsYounger) {
      branches.push({
        parent,
        child: node,
        childWeight,
      });
    }
  });
  return branches;
}

export type HistogramDataPoint = {
  t: number;
  numBranches: number;
};
export function getTreeHistogram(
  tree: PhyloNode,
  { minTime = 0.01 }: { minTime?: number } = {},
) {
  const timePoints: { t: number; isBranching: boolean }[] = [];
  visitTreeDepthFirstPreOrder(tree, (node) => {
    if (node.isLeaf && isEqual(node.time, 1, minTime / 10)) {
      return;
    }
    const isBranching = !node.isLeaf;
    timePoints.push({ t: node.time, isBranching });
  });
  // Sort on time
  timePoints.sort((a, b) => a.t - b.t);
  const histogram: HistogramDataPoint[] = [];
  let numBranches = 1;
  let previousTime = 0;
  let numSkippedPoints = 0;
  for (let i = 0; i < timePoints.length; ++i) {
    const { t, isBranching } = timePoints[i];
    if (i > 0 && t - previousTime < minTime) {
      numBranches += isBranching ? 1 : -1;
      ++numSkippedPoints;
      continue;
    }
    previousTime = t;
    if (numSkippedPoints > 0) {
      numBranches += isBranching ? 1 : -1;
      histogram.push({ t, numBranches });
      numSkippedPoints = 0;
    } else {
      histogram.push({ t, numBranches });
      numBranches += isBranching ? 1 : -1;
      histogram.push({ t, numBranches });
    }
  }
  histogram.push({ t: 1, numBranches });
  return histogram;
}
