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
    const childWeight = Math.min(
      1,
      (time - parentTime) / (node.time - parentTime),
    );

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
  value: number;
  count: number;
};

type AccumulatedTreeDataOptions = {
  getNodeData: (n: PhyloNode) => number;
  initialValue: number;
  minTime?: number;
}

export function getAccumulatedTreeData(
  tree: PhyloNode,
  {
    getNodeData,
    initialValue,
    minTime = 0.01,
  }: AccumulatedTreeDataOptions,
) {
  const timePoints: HistogramDataPoint[] = [];
  visitTreeDepthFirstPreOrder(tree, (node) => {
    // if (node.isLeaf && isEqual(node.time, 1, minTime / 10)) {
    //   return;
    // }
    timePoints.push({ t: node.time, value: getNodeData(node), count: 1 });
  });
  // Sort on time
  timePoints.sort((a, b) => a.t - b.t);
  // Sparsify
  const histogram: HistogramDataPoint[] = [];
  let value = initialValue;
  histogram.push({ t: 0, value: initialValue, count: 1 });
  let previousTime = 0;
  let count = 0;
  for (let i = 0; i < timePoints.length; ++i) {
    const { t, value: dValue } = timePoints[i];
    ++count;
    if (i > 0 && i + 1 < timePoints.length && t - previousTime < minTime) {
      value += dValue;
      continue;
    }
    previousTime = t;
    value += dValue;
    histogram.push({ t, value, count });
    count = 0;
  }
  // histogram.push({ t: 1, value, count: 0 });
  return histogram;
}

type TreeHistogramOptions = {
  getNodeData: (n: PhyloNode) => number;
  numBins: number;
}

export function getTreeHistogram(
  tree: PhyloNode,
  {
    getNodeData,
    numBins = 100
  }: TreeHistogramOptions,
) {
  const timePoints: HistogramDataPoint[] = [];
  const binSize = 1/numBins;
  visitTreeDepthFirstPreOrder(tree, (node) => {
    // if (node.isLeaf && isEqual(node.time, 1, binSize / 10)) {
    //   return;
    // }
    timePoints.push({ t: node.time, value: getNodeData(node), count: 1 });
  });
  // Sort on time
  timePoints.sort((a, b) => a.t - b.t);
  // Bin
  const histogram: HistogramDataPoint[] = [];
  let value = 0;
  let previousTime = -2*binSize;
  let count = 0;
  for (let i = 0; i < timePoints.length; ++i) {
    const { t, value: dValue } = timePoints[i];
    value += dValue;
    ++count;
    if (i + 1 < timePoints.length && t - previousTime < binSize) {
      continue;
    }
    previousTime = t;
    histogram.push({ t, value, count });
    count = 0;
    value = 0;
  }
  return histogram;
}
