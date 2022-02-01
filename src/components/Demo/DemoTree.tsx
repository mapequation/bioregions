import { Box } from '@chakra-ui/react';
import { getIntersectingBranches, Node } from '../../utils/tree';
import type { Branch } from '../../utils/tree';
import * as d3 from 'd3';

export interface DemoTreeProps {
  tree: Node;
  integrationTime: number;
  segregationTime: number;
}

const layout = d3.tree<Node>();

export default function DemoTree({
  tree,
  integrationTime,
  segregationTime,
}: DemoTreeProps) {
  const blue = 'hsl(213, 55%, 53%)';
  const red = 'hsl(4, 69%, 65%)';
  const purple = 'hsl(255, 45%, 69%)';

  const hierTree = d3.hierarchy<Node>(tree);
  const positionedTree = layout(hierTree);

  const integratingBranches = getIntersectingBranches(tree, integrationTime);
  const separatingBranches = getIntersectingBranches(tree, segregationTime);

  const branchColorMap = new Map<string, string>();
  const fillColorMap = new Map<number, string>();
  const strokeColorMap = new Map<number, string>();

  const getBranchId = ({ parent, child }: { parent: Node; child: Node }) =>
    `${parent.uid}-${child.uid}`;

  const interpolateBlue = d3.interpolateHsl(blue, 'hsl(213, 55%, 100%)');

  const interpolateRed = d3.interpolateHsl(red, 'hsl(4, 69%, 0%)');

  integratingBranches.forEach((branch: Branch) => {
    branchColorMap.set(getBranchId(branch), blue);
    fillColorMap.set(branch.parent.uid, interpolateBlue(branch.fractionParent));
    fillColorMap.set(
      branch.child.uid,
      interpolateBlue(1 - branch.fractionParent),
    );
  });

  separatingBranches.forEach((branch) => {
    const id = getBranchId(branch);
    branchColorMap.set(id, branchColorMap.has(id) ? purple : red);

    strokeColorMap.set(
      branch.parent.uid,
      interpolateRed(branch.fractionParent),
    );
    strokeColorMap.set(
      branch.child.uid,
      interpolateRed(1 - branch.fractionParent),
    );
  });

  const getLinkColor = (link: d3.HierarchyPointLink<Node>) => {
    const {
      source: { data: parent },
      target: { data: child },
    } = link;
    return branchColorMap.get(getBranchId({ parent, child })) ?? 'currentColor';
  };

  const getFillColor = (node: Node) => fillColorMap.get(node.uid) ?? 'white';
  const getStrokeColor = (node: Node) =>
    strokeColorMap.get(node.uid) ?? 'currentColor';

  positionedTree.descendants().forEach((node) => {
    const { x } = node;
    node.x = node.data.time * 100;
    node.y = x * 100;
  });

  return (
    <Box textAlign="center">
      <svg
        width="100%"
        height="100%"
        viewBox="-10 -10 125 125"
        style={{ color: '#666' }}
      >
        {positionedTree.links().map((link) => (
          <path
            key={`${link.source.data.uid}-${link.target.data.uid}`}
            d={`M${link.source.x},${link.source.y}L${link.source.x},${link.target.y}L${link.target.x},${link.target.y}`}
            fill="none"
            stroke={getLinkColor(link)}
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeWidth={0.5}
          />
        ))}

        {positionedTree.descendants().map((node) => (
          <g key={node.data.uid}>
            <circle
              cx={node.x}
              cy={node.y}
              r={2}
              fill={getFillColor(node.data)}
              stroke={getStrokeColor(node.data)}
              strokeWidth={strokeColorMap.has(node.data.uid) ? 0.8 : 0.5}
            />
            <text
              x={node.x}
              y={node.y}
              dy={1.75}
              dx={5}
              fontSize={5}
              fontWeight={500}
              fill="currentColor"
            >
              {node.data.name}
            </text>
          </g>
        ))}

        <path
          d="M0,110 L2,109 M0,110 L2,111 M0,110 L100,110 M100,111 L100,109"
          fill="none"
          stroke="var(--chakra-colors-gray-500)"
          strokeWidth={0.5}
          strokeLinecap="round"
        />
        <text
          x={0}
          y={110}
          dy={4}
          dx={-2}
          fill="var(--chakra-colors-gray-500)"
          fontSize={3}
          fontWeight={400}
        >
          Time
        </text>

        <line
          x1={100 * segregationTime}
          y1={5}
          x2={100 * segregationTime}
          y2={109}
          stroke={red}
          strokeWidth={0.5}
          strokeDasharray="1,2"
          strokeLinecap="round"
        />
        <line
          x1={100 * integrationTime}
          y1={5}
          x2={100 * integrationTime}
          y2={109}
          stroke={blue}
          strokeWidth={0.5}
          strokeDasharray="1,2"
          strokeLinecap="round"
        />
      </svg>
    </Box>
  );
}
