import { parseTree, prepareTree, visitTreeDepthFirstPostOrder } from '.';
import type { PhyloNode } from '.';
import type { ITree } from './newick';

export function testSimpleTree() {
  const tree: PhyloNode = prepareTree({
    name: 'root',
    children: [
      {
        name: '1',
        children: [
          { name: '1:1', children: [] },
          {
            name: '1:2',
            children: [
              { name: '1:2:1', children: [] },
              { name: '1:2:2', children: [] },
            ],
          },
        ],
      },
      {
        name: '2',
        children: [
          {
            name: '2:1',
            children: [
              { name: '2:1:1', children: [] },
              { name: '2:1:2', children: [] },
            ],
          },
          { name: '2:2', children: [] },
        ],
      },
    ],
  });
  console.log(tree);

  console.log('Test visit tree');
  visitTreeDepthFirstPostOrder(tree, (node) => {
    console.log(node.name);
  });
}

export function testNewickTree() {
  const nwk = '(a1,a2,((a311,a312)a31,a32)a3)root;';
  const parsed: ITree = parseTree(nwk);

  console.log(parsed);
  const tree: PhyloNode = prepareTree(parsed);
  console.log(tree);

  console.log('Test visit tree');
  visitTreeDepthFirstPostOrder(tree, (node) => {
    console.log(node.uid, node.depth, node.name);
  });
}
