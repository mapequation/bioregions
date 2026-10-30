import { describe, expect, it } from 'vitest';
import { parseTree, prepareTree, visitTreeDepthFirstPostOrder } from '.';
import type { PhyloNode } from '.';

function postOrder(tree: PhyloNode, f: (node: PhyloNode) => unknown = (node) => node.name) {
  const visited: unknown[] = [];
  visitTreeDepthFirstPostOrder(tree, (node) => {
    visited.push(f(node));
  });
  return visited;
}

describe('tree utils', () => {
  it('visits a prepared tree depth-first in post-order', () => {
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

    expect(postOrder(tree)).toEqual([
      '1:1', '1:2:1', '1:2:2', '1:2', '1',
      '2:1:1', '2:1:2', '2:1', '2:2', '2',
      'root',
    ]);
  });

  it('parses a Newick tree with internal node names', () => {
    const tree = prepareTree(parseTree('(a1,a2,((a311,a312)a31,a32)a3)root;'));

    // Leaf names are normalized as species names; internal names are kept.
    expect(postOrder(tree, (node) => [node.name, node.depth])).toEqual([
      ['A1', 1], ['A2', 1],
      ['A311', 3], ['A312', 3], ['a31', 2],
      ['A32', 2], ['a3', 1],
      ['root', 0],
    ]);
  });
});
