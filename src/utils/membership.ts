import type { Cell } from './QuadTree';

export type MembershipShare = { bioregionId: number; share: number };

/** Below this top share a cell reads as a transition zone between bioregions. */
export const BOUNDARY_SHARE = 0.7;

/**
 * A grid cell's fuzzy bioregion membership as shares of its flow, largest first.
 *
 * Reads the same source as `ColorStore.colorCell`: the state-node flow per bioregion
 * (`overlappingBioregions`, filled by state and multilayer networks) when present, otherwise the
 * link flow to each species' bioregion (`connectedBioregions`, bipartite networks). A cell with
 * neither belongs wholly to its own bioregion. Both are cleared on every rerun.
 */
export function cellMembership(cell: Cell): MembershipShare[] {
  const shares: MembershipShare[] = [];
  const { overlappingBioregions, connectedBioregions } = cell;
  if (overlappingBioregions.bioregionIds.size > 0 && overlappingBioregions.flow > 0) {
    const total = overlappingBioregions.flow;
    overlappingBioregions.bioregionIds.forEach((flow, bioregionId) => {
      shares.push({ bioregionId, share: flow / total });
    });
  } else if (connectedBioregions.bioregionIds.size > 0 && connectedBioregions.flowCount.flow > 0) {
    const total = connectedBioregions.flowCount.flow;
    connectedBioregions.bioregionIds.forEach(({ flow }, bioregionId) => {
      shares.push({ bioregionId, share: flow / total });
    });
  } else if (cell.bioregionId) {
    shares.push({ bioregionId: cell.bioregionId, share: 1 });
  }
  return shares
    .filter((s) => s.share > 0)
    .sort((a, b) => b.share - a.share || a.bioregionId - b.bioregionId);
}
