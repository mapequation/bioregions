import { observer } from 'mobx-react';
import { Box, useColorModeValue } from '@chakra-ui/react';
import {
  getIntersectingBranches,
  PhyloNode,
  visitTreeDepthFirstPreOrder,
} from '../../utils/tree';
import type { Branch } from '../../utils/tree';
import * as d3 from 'd3';
import { useDemoStore } from '../../store';
import { Cell } from '../../utils/QuadTreeGeoBinner';
import { range } from '../../utils/range';
import { GrMap, GrBug } from 'react-icons/gr';

export interface DemoTreeProps {
  beta?: number;
  hideTree?: boolean;
  hideSegregation?: boolean;
}

type Name = string;
type Pos = [number, number];

const layout = d3.tree<PhyloNode>();

export default observer(
  ({ beta, hideTree, hideSegregation }: DemoTreeProps) => {
    const demoStore = useDemoStore();
    const hiddenLinkColor = useColorModeValue('#eeeeee', '#333333');
    const hiddenNodeFillColor = useColorModeValue('#ffffff', '#000000');
    const hiddenNodeStrokeColor = useColorModeValue('#eeeeee', '#333333');
    // const iconColor = useColorModeValue('#999999', '#666666');
    const { treeStore, infomapStore, speciesStore, colorStore } = demoStore;
    const { tree } = treeStore;
    // const { bioregions } = infomapStore;
    const { colorBioregion, colorCell } = colorStore;

    if (!tree || !speciesStore.loaded) {
      return null;
    }

    const {
      integrationTime,
      segregationTime: _segTime,
      network,
      // haveStateNodes,
    } = infomapStore;
    const haveStateNodes = network && 'states' in network;
    const segregationTime = hideSegregation ? 0 : _segTime;
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
      fillColorMap.set(
        branch.child.uid,
        interpolateBlue(1 - branch.childWeight),
      );
    });

    if (!hideSegregation) {
      separatingBranches.forEach((branch) => {
        const id = getBranchId(branch);
        branchColorMap.set(id, branchColorMap.has(id) ? purple : red);

        strokeColorMap.set(
          branch.parent.uid,
          interpolateRed(branch.childWeight),
        );
        strokeColorMap.set(
          branch.child.uid,
          interpolateRed(1 - branch.childWeight),
        );
      });
    }

    const getLinkColor = (link: d3.HierarchyPointLink<PhyloNode>) => {
      if (hideTree) {
        return hiddenLinkColor;
      }
      const {
        source: { data: parent },
        target: { data: child },
      } = link;
      return (
        branchColorMap.get(getBranchId({ parent, child })) ?? 'currentColor'
      );
    };

    const getFillColor = (node: PhyloNode) =>
      hideTree
        ? hiddenNodeFillColor
        : fillColorMap.get(node.uid) ?? hiddenNodeFillColor;
    const getStrokeColor = (node: PhyloNode) =>
      hideTree && !node.isLeaf
        ? hiddenNodeStrokeColor
        : strokeColorMap.get(node.uid) ?? 'currentColor';
    const getNodeTextColor = (node: PhyloNode) =>
      hideTree && !node.isLeaf ? hiddenNodeStrokeColor : 'currentColor';

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

    const { nameToCellIds } = binner;
    const getPhysLink = (link: typeof networkLinks[number]) => {
      // source: tree node, target: grid cell
      const taxonName = getPhysName(link.source);
      const cellName = getPhysName(link.target);
      const treeNode = nodeMap.get(taxonName)!;
      const cell = cellMap.get(cellName)!;
      const weight = link.weight ?? 0;

      return { treeNode, cell, weight };
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

    const straightSpeciesToGridCellLinks = false;
    const useBundledCurves = true;

    const getControlPathways = (
      treeNode: d3.HierarchyPointNode<PhyloNode>,
      cellName: string,
      cellLinkPoint: [number, number],
    ) => {
      if (treeNode.data.isLeaf) {
        const dx = cellLinkPoint[0] - treeNode.x;
        const controlPoints = [[treeNode.x, treeNode.y]];
        if (!straightSpeciesToGridCellLinks) {
          controlPoints.push([treeNode.x + dx / 3, treeNode.y]);
        }
        controlPoints.push(cellLinkPoint);
        return [controlPoints];
      }

      const controlPathways: [number, number][][] = [];
      let path: string[] = [];
      let lastDepth = treeNode.data.depth - 1;
      visitTreeDepthFirstPreOrder(treeNode.data, (node: PhyloNode) => {
        if (node.depth <= lastDepth) {
          // eslint-disable-next-line  @typescript-eslint/no-unused-vars
          for (const _ of range(lastDepth - node.depth + 1)) {
            path.pop();
          }
        }
        path.push(node.name);

        if (node.isLeaf && nameToCellIds[node.name].has(cellName)) {
          const points = path
            .map((taxonName) => nodeMap.get(taxonName))
            .map((node) => [node?.x ?? 0, node?.y ?? 0] as [number, number]);
          points.push(cellLinkPoint);
          controlPathways.push(points);
        }
        lastDepth = node.depth;
      });
      return controlPathways;
    };

    const networkPhysLinksBundle = !useBundledCurves
      ? []
      : networkPhysLinks
          .map(({ treeNode, cell, weight }) => {
            const cellLinkPoint = projection(cell.center) ?? [0, 0];
            // cellLinkPoint[0] -= cellSize / 2 - 0.5;
            const controlPathways = getControlPathways(
              treeNode,
              cell.id,
              cellLinkPoint,
            );
            return controlPathways.map((controlPoints) => ({
              treeNode,
              cell,
              weight: weight / controlPathways.length,
              controlPoints,
            }));
          })
          .flatMap((links) => links);

    const stateTreeLinksBundle = !useBundledCurves
      ? []
      : stateLinks
          .map(({ stateCell, treeNode, weight }) => {
            const stateCellPos = [stateCell.x, stateCell.y] as [number, number];
            const controlPathways = getControlPathways(
              treeNode,
              stateCell.cellId,
              stateCellPos,
            );
            return controlPathways.map((controlPoints) => ({
              treeNode,
              stateCell,
              weight: weight / controlPathways.length,
              controlPoints,
            }));
          })
          .flatMap((links) => links);

    const speciesX = nodeMap.get('A')!.x;
    const cellsX = projection(cells![0].center)![0];

    return (
      <Box textAlign="center" pt={4}>
        <svg
          width="100%"
          height="100%"
          viewBox="-4 -4 144 144"
          style={{ color: '#666' }}
          preserveAspectRatio="xMidYMid meet"
        >
          <g className="help" opacity={0.5}>
            <g transform={`translate(${speciesX},-4)`}>
              <g transform="translate(-3,0)">
                <GrBug size={6} />
              </g>
              <text textAnchor="middle" dy={9} fontSize={3}>
                Species
              </text>
            </g>
            <g transform={`translate(${cellsX},-4)`}>
              <g transform="translate(-3,0)">
                <GrMap size={6} />
              </g>
              <text textAnchor="middle" dy={9} fontSize={3}>
                Grid cells
              </text>
            </g>
          </g>
          {!haveStateNodes && (
            <g>
              {!useBundledCurves && (
                <g
                  className="tree-links"
                  stroke={blue}
                  strokeWidth={0.5}
                  fill="none"
                >
                  {networkPhysLinks.map(({ treeNode, cell, weight }, i) => {
                    const cellPos = projection(cell.center) ?? [0, 0];
                    const cellX = cellPos[0] - cellSize / 2 + 0.5;
                    const cellY = cellPos[1];
                    //console.log(`${treeNode?.data.name} - ${cell.id}`);
                    if (
                      treeNode.data.isLeaf &&
                      straightSpeciesToGridCellLinks
                    ) {
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
                    return (
                      <g key={i}>
                        <title>
                          {treeNode.data.name} - {cell.id}, weight: {weight}
                        </title>
                        <path d={d} opacity={weight ?? 0} />
                      </g>
                    );
                  })}
                </g>
              )}
              {useBundledCurves && (
                <g
                  className="tree-bundle-links"
                  stroke={blue}
                  strokeWidth={0.5}
                  fill="none"
                >
                  {networkPhysLinksBundle.map(
                    ({ treeNode, cell, weight, controlPoints }, i) => {
                      const path = d3.path();
                      const curveBundle = d3.curveBundle.beta(beta ?? 0.75)(
                        path,
                      );
                      curveBundle.lineStart();
                      for (const [x, y] of controlPoints) {
                        curveBundle.point(x, y);
                      }
                      curveBundle.lineEnd();
                      const d = path.toString();
                      return (
                        <g key={i}>
                          <title>
                            {treeNode.data.name} - {cell.id}, weight: {weight}
                          </title>
                          <path d={d} opacity={weight ?? 0} />
                        </g>
                      );
                    },
                  )}
                </g>
              )}
            </g>
          )}
          <g className="grid-cells">
            {physCellNodes.map(({ key, cell, svgString }) => (
              <g key={key}>
                <title>Bioregion {cell.bioregionId}</title>
                <path
                  d={svgString}
                  stroke="white"
                  strokeWidth={0.5}
                  fill={colorCell(cell)}
                />
              </g>
            ))}
          </g>
          {haveStateNodes && (
            <g>
              {useBundledCurves && (
                <g
                  className="state-tree-bundle-links"
                  stroke={blue}
                  strokeWidth={0.5}
                  fill="none"
                >
                  {stateTreeLinksBundle.map(
                    ({ treeNode, stateCell, weight, controlPoints }, i) => {
                      const path = d3.path();
                      const curveBundle = d3.curveBundle.beta(beta ?? 0.75)(
                        path,
                      );
                      curveBundle.lineStart();
                      for (const [x, y] of controlPoints) {
                        curveBundle.point(x, y);
                      }
                      curveBundle.lineEnd();
                      const d = path.toString();
                      return (
                        <g key={i}>
                          <title>
                            {treeNode.data.name} - {stateCell.cellId}_
                            {stateCell.memTaxonId}, weight: {weight}
                          </title>
                          <path d={d} opacity={weight ?? 0} />
                        </g>
                      );
                    },
                  )}
                </g>
              )}
              {!useBundledCurves && (
                <g
                  className="state-tree-links"
                  stroke={blue}
                  strokeWidth={0.5}
                  fill="none"
                >
                  {stateLinks.map(({ treeNode, stateCell, weight }, i) => {
                    const cellX = stateCell.x - stateCellRadius;
                    const cellY = stateCell.y;
                    if (
                      treeNode.data.isLeaf &&
                      straightSpeciesToGridCellLinks
                    ) {
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
              )}
              <g className="state-cells">
                {stateCells.map((stateCell) => (
                  <g key={stateCell.cellStateName}>
                    <title>Bioegion: {stateCell.bioregionId}</title>
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
            </g>
          )}

          {!hideTree && (
            <g className="separating-lines">
              <g strokeLinecap="round" strokeWidth={0.5} fill="none">
                {!hideSegregation && (
                  <line
                    x1={100 * segregationTime}
                    y1={7}
                    x2={100 * segregationTime}
                    y2={127}
                    stroke={red}
                    strokeDasharray="1.1,2"
                  />
                )}
                <line
                  x1={100 * integrationTime}
                  y1={7}
                  x2={100 * integrationTime}
                  y2={122}
                  stroke={blue}
                  strokeDasharray="0.4,1.3"
                />
              </g>

              <g
                paintOrder="stroke"
                stroke="white"
                strokeWidth={1}
                fontSize={3}
              >
                {!hideSegregation && (
                  <text
                    x={100 * segregationTime}
                    y={106}
                    dx={2}
                    dy={
                      Math.abs(segregationTime - integrationTime) < 0.35 ? 2 : 0
                    }
                    fill={red}
                  >
                    Segregation time{' '}
                    {segregationTime === 0 || segregationTime === 1
                      ? 1 - segregationTime
                      : (1 - segregationTime).toFixed(2)}
                  </text>
                )}
                <text
                  x={100 * integrationTime}
                  y={106}
                  dx={2}
                  dy={
                    Math.abs(segregationTime - integrationTime) < 0.35 ? -2 : 0
                  }
                  fill={blue}
                >
                  Integration time{' '}
                  {integrationTime === 0 || integrationTime === 1
                    ? 1 - integrationTime
                    : (1 - integrationTime).toFixed(2)}
                </text>
              </g>
            </g>
          )}

          <g strokeLinecap="round" strokeWidth={0.5} fill="none">
            <path
              d="M0,111 L0,109 M0,110 L100,110 M100,111 L100,109"
              stroke="var(--chakra-colors-gray-500)"
            />
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

          <g
            className="phylo-tree"
            strokeLinejoin="round"
            strokeLinecap="round"
          >
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
                <title>
                  Bioregion:{' '}
                  {treeStore.treeNodeMap.get(node.data.name)?.bioregionId}
                </title>
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={3}
                  fill={getFillColor(node.data)}
                  stroke={getStrokeColor(node.data)}
                  strokeWidth={
                    !hideTree && strokeColorMap.has(node.data.uid) ? 0.8 : 0.5
                  }
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
                  fill={getNodeTextColor(node.data)}
                >
                  {node.data.name}
                </text>
                <text
                  x={node.x}
                  y={node.y}
                  dy={5}
                  dx={0}
                  fontSize={2}
                  fontWeight={400}
                  // textAnchor="middle"
                  paintOrder="stroke"
                  stroke="hsla(0, 0%, 100%, 0.8)"
                  strokeWidth={0.3}
                  fill={getNodeTextColor(node.data)}
                >
                  {node.data.memory &&
                    `${node.data.memory.parent.name}, ${d3.format('.2f')(
                      node.data.memory.childWeight,
                    )}, ${node.data.memory.child.name}`}
                </text>
              </g>
            ))}
          </g>
        </svg>
      </Box>
    );
  },
);
