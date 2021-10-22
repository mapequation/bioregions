import { prepareTree, visitTreeDepthFirstPostOrder } from '.';
import type { Node } from '.'

const tree: Node = prepareTree({
  name: "root",
  children: [
    {
      name: "1",
      children: [
        { name: "1:1", children: [] },
        {
          name: "1:2", children: [
            { name: "1:2:1", children: [] },
            { name: "1:2:2", children: [] },
          ]
        },
      ],
    },
    {
      name: "2",
      children: [
        {
          name: "2:1", children: [
            { name: "2:1:1", children: [] },
            { name: "2:1:2", children: [] },
          ]
        },
        { name: "2:2", children: [] },
      ],
    },
  ]
})
console.log(tree);

console.log("Test visit tree")
// Include internal tree nodes into network
visitTreeDepthFirstPostOrder(tree, (node) => {
  console.log(`Node ${node.name}`)
})