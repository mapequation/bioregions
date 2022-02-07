import { observer } from 'mobx-react';
import { Box } from '@chakra-ui/react';
import { getIntersectingBranches, PhyloNode } from '../../utils/tree';
import type { Branch } from '../../utils/tree';
import * as d3 from 'd3';
import { useDemoStore } from '../../store';
import { Cell } from '../../utils/QuadTreeGeoBinner';

export interface DemoTreeProps {
  tree: PhyloNode;
  integrationTime: number;
  segregationTime: number;
}

type Name = string;
type Pos = [number, number];

const layout = d3.tree<PhyloNode>();

export default observer(() => {
  const demoStore = useDemoStore();
  const { treeStore, infomapStore, speciesStore, colorStore } = demoStore;
  const { tree } = treeStore;
  // const { bioregions } = infomapStore;
  const { colorBioregion } = colorStore;

  if (!tree || !speciesStore.loaded) {
    return null;
  }

  const { integrationTime, segregationTime, network, haveStateNodes } =
    infomapStore;
  const { binner } = speciesStore;
  const { cells } = binner;
  const networkLinks = network ? network.links : [];
  const blue = 'hsl(213, 55%, 53%)';
  const red = 'hsl(4, 69%, 65%)';
  const purple = 'hsl(255, 45%, 69%)';

  const hierTree = d3.hierarchy<PhyloNode>(tree);
  const positionedTree = layout(hierTree);

  const integratingBranches = getIntersectingBranches(tree, integrationTime);
  const separatingBranches = getIntersectingBranches(tree, segregationTime);

  const branchColorMap = new Map<string, string>();
  const fillColorMap = new Map<number, string>();
  const strokeColorMap = new Map<number, string>();

  const getBranchId = ({
    parent,
    child,
  }: {
    parent: PhyloNode;
    child: PhyloNode;
  }) => `${parent.uid}-${child.uid}`;

  const interpolateBlue = d3.interpolateHsl(blue, 'hsl(213, 55%, 100%)');

  const interpolateRed = d3.interpolateHsl(red, 'hsl(4, 0%, 40%)');

  integratingBranches.forEach((branch: Branch) => {
    branchColorMap.set(getBranchId(branch), blue);
    fillColorMap.set(branch.parent.uid, interpolateBlue(branch.childWeight));
    fillColorMap.set(branch.child.uid, interpolateBlue(1 - branch.childWeight));
  });

  separatingBranches.forEach((branch) => {
    const id = getBranchId(branch);
    branchColorMap.set(id, branchColorMap.has(id) ? purple : red);

    strokeColorMap.set(branch.parent.uid, interpolateRed(branch.childWeight));
    strokeColorMap.set(
      branch.child.uid,
      interpolateRed(1 - branch.childWeight),
    );
  });

  const getLinkColor = (link: d3.HierarchyPointLink<PhyloNode>) => {
    const {
      source: { data: parent },
      target: { data: child },
    } = link;
    return branchColorMap.get(getBranchId({ parent, child })) ?? 'currentColor';
  };

  const getFillColor = (node: PhyloNode) =>
    fillColorMap.get(node.uid) ?? 'white';
  const getStrokeColor = (node: PhyloNode) =>
    strokeColorMap.get(node.uid) ?? 'currentColor';

  const getTreeNodeBioregionColor = (node: PhyloNode) => {
    const bioregionId = treeStore.treeNodeMap.get(node.name)?.bioregionId;
    return bioregionId != null ? colorBioregion(bioregionId) : 'transparent';
  };

  const positionedTreeDescendants = positionedTree.descendants();
  const nodeMap = new Map<Name, d3.HierarchyPointNode<PhyloNode>>();
  positionedTreeDescendants.forEach((node) => {
    const { x } = node;
    node.x = node.data.time * 100;
    node.y = x * 100;
    nodeMap.set(node.data.name, node);
  });

  const cellMap = new Map<string, Cell>();
  cells.forEach((cell) => {
    cellMap.set(cell.id, cell);
  });

  const cellSize = 17;
  const firstCellPos: Pos = [120, 8];
  const stateCellRadius = 1.5;

  const projection = d3
    .geoIdentity()
    .scale(1)
    .reflectY(true)
    .fitExtent(
      [firstCellPos, firstCellPos.map((p) => p + cellSize) as Pos],
      cells[cells.length - 1],
    );

  const geoPath = d3.geoPath(projection);

  const getPhysName = (nodeId: number) => {
    if (!network) {
      return '';
    }
    const physId = 'states' in network ? network.states[nodeId].id : nodeId;
    return network.nodes[physId].name!;
  };

  const getPhysLink = (link: typeof networkLinks[number]) => {
    // source: tree node, target: grid cell
    const taxonName = getPhysName(link.source);
    const cellName = getPhysName(link.target);
    const treeNode = nodeMap.get(taxonName)!;
    const cell = cellMap.get(cellName)!;
    return { treeNode, cell, weight: link.weight };
  };

  const physCellNodes = binner.cells.map((cell, i) => {
    return {
      key: i,
      cell,
      svgString: geoPath(cell) as string,
      bioregionId: cell.bioregionId,
    };
  });

  const numCells = cellMap.size;

  type StateCell = {
    cellStateName: string;
    cellId: string;
    memTaxonId: string;
    memTreeNode: d3.HierarchyPointNode<PhyloNode>;
    bioregionId: number;
    cellPos: [number, number];
    x: number;
    y: number;
  };
  type StateLink = {
    treeNode: d3.HierarchyPointNode<PhyloNode>;
    weight: number;
    stateCell: StateCell;
  };

  const cellIdToStates = new Map<string, StateCell[]>();
  const stateLinks: StateLink[] = [];

  if (network && 'states' in network) {
    network.states
      .filter(({ id }) => id < numCells)
      .forEach(({ name: cellStateName }) => {
        // const cellId = network.nodes[id].name!;
        const [cellId, memTaxonId] = (cellStateName ?? '_').split('_');
        const memTreeNode = nodeMap.get(memTaxonId)!;
        const cell = cellMap.get(cellId)!;
        const cellPos = projection(cell.center) ?? [0, 0];
        const stateCells = cellIdToStates.get(cellId) ?? [];
        if (stateCells.length === 0) {
          cellIdToStates.set(cellId, stateCells);
        }
        const bioregionId =
          cell.overlappingBioregions.memoryIdToBioregion.get(memTaxonId)!;
        stateCells.push({
          cellStateName: cellStateName ?? '',
          cellId,
          memTaxonId,
          memTreeNode,
          bioregionId,
          cellPos,
          x: cellPos[0] - 4,
          y: cellPos[1],
        });
      });

    // Sort cell state nodes on mem taxon position
    cellIdToStates.forEach((stateCells) => {
      stateCells.sort((a, b) => a.memTreeNode.y - b.memTreeNode.y);
    });

    network.links.forEach(({ source, target, weight }) => {
      const treeNodeName = network.states[source].name!;
      const treeNode = nodeMap.get(treeNodeName)!;
      const cellStateName = network.states[target].name!;
      const [cellId, memTaxonId] = (cellStateName ?? '_').split('_');
      const stateCells = cellIdToStates.get(cellId)!;
      const stateCell = stateCells.find(
        (stateCell) => stateCell.memTaxonId === memTaxonId,
      )!;
      stateLinks.push({
        treeNode,
        stateCell,
        weight: weight!,
      });
    });

    // Set internal y pos based on memory taxon position
    cellIdToStates.forEach((stateCells) => {
      const numStates = stateCells.length;
      const { cellPos } = stateCells[0]!;
      const startY = cellPos[1] - cellSize / 2;
      const dy = cellSize / (numStates + 1);
      stateCells.forEach((stateCell, i) => {
        stateCell.y = startY + (i + 1) * dy;
      });
    });
  }
  const stateCells = Array.from(cellIdToStates.values()).flatMap(
    (stateCells) => stateCells,
  );
  // console.log('State cells:', stateCells);

  const networkPhysLinks = networkLinks.map(getPhysLink);

  const colorCell = (cell: Cell) => {
    if (cell.overlappingBioregions.size === 0) {
      return colorBioregion(cell.bioregionId);
    }
    // Add colors from all overlapping bioregions weighted on opacity
    // Let final opacity be half-transparent to signal overlapping bioregions
    const {
      topBioregionId,
      topBioregionProportion,
      secondBioregionId,
      secondBioregionProportion,
    } = cell.overlappingBioregions;
    const t =
      topBioregionProportion /
      (topBioregionProportion + secondBioregionProportion);
    const firstColor = colorBioregion(topBioregionId);
    const secondColor = colorBioregion(secondBioregionId);
    const color = d3.color(d3.interpolateRgb(secondColor, firstColor)(t))!;
    color.opacity = topBioregionProportion;
    // console.log(
    //   `cell ${cell.id}: top: ${topBioregionId} (${topBioregionProportion}), second: ${secondBioregionId} (${secondBioregionProportion})`,
    // );
    return color.toString();
  };

  return (
    <Box textAlign="center">
      <svg
        width="100%"
        height="100%"
        viewBox="-4 -4 144 144"
        style={{ color: '#666' }}
        preserveAspectRatio="xMidYMid meet"
      >
        <g className="grid-cells">
          {physCellNodes.map(({ key, cell, svgString, bioregionId }) => (
            <path
              key={key}
              d={svgString}
              stroke="white"
              fill={colorCell(cell)}
            />
          ))}
        </g>
        {haveStateNodes && (
          <g>
            <g className="state-cells">
              {stateCells.map((stateCell) => (
                <g key={stateCell.cellStateName}>
                  <circle
                    r={stateCellRadius}
                    cx={stateCell.x}
                    cy={stateCell.y}
                    strokeWidth={0.2}
                    stroke="white"
                    fill={colorBioregion(stateCell.bioregionId) ?? '#ccc'}
                  />
                  <text
                    x={stateCell.x + stateCellRadius + 1}
                    y={stateCell.y}
                    fontSize={3}
                    dy={1}
                    fill="white"
                  >
                    {stateCell.memTaxonId}
                  </text>
                </g>
              ))}
            </g>
            <g
              className="state-tree-links"
              stroke="#33c"
              strokeWidth={0.5}
              fill="none"
            >
              {stateLinks.map(({ treeNode, stateCell, weight }, i) => {
                const cellX = stateCell.x - stateCellRadius;
                const cellY = stateCell.y;
                if (treeNode.data.isLeaf && false) {
                  return (
                    <line
                      key={i}
                      x1={treeNode.x}
                      y1={treeNode.y}
                      x2={stateCell.x}
                      y2={stateCell.y}
                      opacity={weight ?? 0}
                    />
                  );
                }
                const xMid = (treeNode.x + cellX) / 2;
                const yMid = (treeNode.y + cellY) / 2;
                const cp1 = [xMid, treeNode.y];
                const cp2 = [xMid, yMid];
                // prettier-ignore
                const d = `M ${treeNode.x} ${treeNode.y} C ${cp1.join(' ')}, ${cp2.join(' ')}, ${cellX} ${cellY}`;
                return <path key={i} d={d} opacity={weight ?? 0} />;
              })}
            </g>
          </g>
        )}

        {!haveStateNodes && (
          <g className="tree-links" stroke="#33c" strokeWidth={0.5} fill="none">
            {networkPhysLinks.map(({ treeNode, cell, weight }, i) => {
              const cellPos = projection(cell.center) ?? [0, 0];
              const cellX = cellPos[0] - cellSize / 2 + 0.5;
              const cellY = cellPos[1];

              //console.log(`${treeNode?.data.name} - ${cell.id}`);

              if (treeNode.data.isLeaf && false) {
                return (
                  <line
                    key={i}
                    x1={treeNode.x}
                    y1={treeNode.y}
                    x2={cellX}
                    y2={cellY}
                    opacity={weight ?? 0}
                  />
                );
              }

              const xMid = (treeNode.x + cellX) / 2;
              const yMid = (treeNode.y + cellY) / 2;
              const cp1 = [xMid, treeNode.y];
              const cp2 = [xMid, yMid];

              // prettier-ignore
              const d = `M ${treeNode.x} ${treeNode.y} C ${cp1.join(' ')}, ${cp2.join(' ')}, ${cellX} ${cellY}`;

              return <path key={i} d={d} opacity={weight ?? 0} />;
            })}
          </g>
        )}

        <g className="separating-lines">
          <g strokeLinecap="round" strokeWidth={0.5} fill="none">
            <path
              d="M0,111 L0,109 M0,110 L100,110 M100,111 L100,109"
              stroke="var(--chakra-colors-gray-500)"
            />
            <line
              x1={100 * segregationTime}
              y1={0}
              x2={100 * segregationTime}
              y2={122}
              stroke={red}
              strokeDasharray="1.1,2"
            />
            <line
              x1={100 * integrationTime}
              y1={0}
              x2={100 * integrationTime}
              y2={127}
              stroke={blue}
              strokeDasharray="0.4,1.3"
            />
          </g>
          <g paintOrder="stroke" stroke="white" strokeWidth={1} fontSize={3}>
            <text
              x={100 * segregationTime}
              y={106}
              dx={2}
              dy={Math.abs(segregationTime - integrationTime) < 0.32 ? -2 : 0}
              fill={red}
            >
              Segregation time{' '}
              {segregationTime === 0 || segregationTime === 1
                ? 1 - segregationTime
                : (1 - segregationTime).toFixed(2)}
            </text>
            <text
              x={100 * integrationTime}
              y={106}
              dx={2}
              dy={Math.abs(segregationTime - integrationTime) < 0.32 ? 2 : 0}
              fill={blue}
            >
              Integration time{' '}
              {integrationTime === 0 || integrationTime === 1
                ? 1 - integrationTime
                : (1 - integrationTime).toFixed(2)}
            </text>
          </g>
          <g
            fill="var(--chakra-colors-gray-500)"
            fontSize={3}
            fontWeight={400}
            textAnchor="middle"
            paintOrder="stroke"
            stroke="white"
            strokeWidth={1}
          >
            <text x={50} y={110} dy={5} dx={0}>
              Time
            </text>
            <text x={0} y={110} dy={5} dx={0}>
              1
            </text>
            <text x={100} y={110} dy={5} dx={0}>
              0
            </text>
          </g>
        </g>

        <g className="phylo-tree" strokeLinejoin="round" strokeLinecap="round">
          {positionedTree.links().map((link) => (
            <path
              key={`${link.source.data.uid}-${link.target.data.uid}`}
              d={`M${link.source.x},${link.source.y}L${link.source.x},${link.target.y}L${link.target.x},${link.target.y}`}
              fill="none"
              stroke={getLinkColor(link)}
              strokeWidth={0.5}
            />
          ))}

          {positionedTreeDescendants.map((node) => (
            <g key={node.data.uid}>
              <circle
                cx={node.x}
                cy={node.y}
                r={3}
                fill={getFillColor(node.data)}
                stroke={getStrokeColor(node.data)}
                strokeWidth={strokeColorMap.has(node.data.uid) ? 0.8 : 0.5}
              />
              <circle
                cx={node.x + 3.2}
                cy={node.y - 3.2}
                r={0.7}
                fill={getTreeNodeBioregionColor(node.data)}
                paintOrder={'stroke'}
                strokeWidth={0.1}
                stroke="white"
              />
              <text
                x={node.x}
                y={node.y}
                dy={1}
                dx={0}
                fontSize={3}
                fontWeight={700}
                textAnchor="middle"
                paintOrder="stroke"
                stroke="hsla(0, 0%, 100%, 0.8)"
                strokeWidth={0.3}
                fill="#333"
              >
                {node.data.name}
              </text>
            </g>
          ))}
        </g>
      </svg>
    </Box>
  );
});
