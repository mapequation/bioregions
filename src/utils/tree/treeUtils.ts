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
  memory?: Branch[];
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

// export function getTreeHistogram(tree: Node, { minTime }: { minTime: number} = {}) {

//   visitTreeDepthFirstPreOrder(tree, (node) => {

//   })
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