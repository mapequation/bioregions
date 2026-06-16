import type { PhyloNode } from './treeUtils';
import { visitTreeDepthFirstPostOrder } from './treeUtils';

/**
 * Fitch maximum-parsimony reconstruction of ancestral bioregion ranges (Fitch 1971),
 * plus occurrence-count aggregation. A region is `{clusterId, count}` — a bioregion id
 * and a count of species occurrences in it. Two distinct per-node products:
 *
 *  - `ranges`   — the reconstructed ancestral *range set* (membership): at a tip the
 *                 species' present regions, at an internal node the most-parsimonious
 *                 ancestral set. Counts here are presence (1); membership is the point.
 *  - `clusters` — the occurrence-count *distribution*: leaf counts summed up the tree,
 *                 sorted by descending count. Used to size the pie wedges.
 *
 * Ported from the d3gl `ancestral-ranges` example (website/src/examples/shared/parsimony.ts),
 * adapted to bioregions' `PhyloNode` (leaves are `node.isLeaf` / `node.children.length === 0`).
 * Results are stored in an out-of-band `AncestralMap` keyed by node, so `PhyloNode` and its
 * shared types stay untouched.
 */
export interface Region {
  clusterId: number;
  count: number;
}
export interface RegionSet {
  totCount: number;
  clusters: Region[];
  byUnion?: boolean;
}
export type ClustersPerSpecies = Record<string, RegionSet>;

export interface AncestralData {
  /** Reconstructed ancestral range set (membership). */
  ranges: RegionSet;
  /** Occurrence-count distribution (sorted by descending count). Sizes the pie wedges. */
  clusters: RegionSet;
  /** Number of subtended terminals (branch-thickness metric). */
  speciesCount: number;
}
export type AncestralMap = Map<PhyloNode, AncestralData>;

const idSet = (s: Region[]): Set<number> => new Set(s.map((r) => r.clusterId));
/** Regions of `a` also present in `b` (by clusterId), preserving `a`'s order. */
const intersectBy = (a: Region[], b: Region[]): Region[] => {
  const bi = idSet(b);
  return a.filter((r) => bi.has(r.clusterId));
};
/** Regions of `a`, then regions of `b` not already in `a`. */
const unionBy = (a: Region[], b: Region[]): Region[] => {
  const ai = idSet(a);
  return a.concat(b.filter((r) => !ai.has(r.clusterId)));
};
const set = (clusters: Region[], byUnion?: boolean): RegionSet => ({
  totCount: clusters.length,
  clusters,
  byUnion,
});

function visitPreOrder(
  node: PhyloNode,
  cb: (n: PhyloNode, parent: PhyloNode | null) => void,
  parent: PhyloNode | null = null,
): void {
  cb(node, parent);
  node.children.forEach((c) => {
    visitPreOrder(c, cb, node);
  });
}

/** Bottom-up pass: leaves presence-count their regions; each internal node takes the
 *  intersection of its children's sets, falling back to the union (flagged) if empty. */
function preliminaryPhase(
  root: PhyloNode,
  clustersPerSpecies: ClustersPerSpecies,
  ranges: Map<PhyloNode, RegionSet>,
): void {
  visitTreeDepthFirstPostOrder(root, (node) => {
    if (node.isLeaf) {
      const cl = clustersPerSpecies[node.name];
      ranges.set(
        node,
        set(cl ? cl.clusters.map((r) => ({ clusterId: r.clusterId, count: 1 })) : []),
      );
      return;
    }
    const childSets = node.children.map((c) => ranges.get(c)!.clusters);
    let anc = childSets.reduce((acc, s) => intersectBy(acc, s));
    const byUnion = anc.length === 0;
    if (byUnion) anc = childSets.reduce((acc, s) => unionBy(acc, s), [] as Region[]);
    ranges.set(node, set(anc, byUnion));
  });
}

/** Top-down pass applying Fitch's rules I–V. Root and leaves stay final; children are visited
 *  after their parent so a node's Rule-V lookup reads children's *preliminary* sets first. */
function finalPhase(root: PhyloNode, ranges: Map<PhyloNode, RegionSet>): void {
  visitPreOrder(root, (node, parent) => {
    if (!parent || node.isLeaf) return;
    const prelim = ranges.get(node)!.clusters;
    const pfinal = ranges.get(parent)!.clusters;
    if (intersectBy(prelim, pfinal).length === pfinal.length) {
      ranges.set(node, set(intersectBy(prelim, pfinal))); // I → II (diminished)
    } else if (ranges.get(node)!.byUnion) {
      ranges.set(node, set(unionBy(prelim, pfinal))); // III → IV (expanded)
    } else {
      // III → V (encompassing): add parent regions present in ≥1 child's preliminary set.
      const childrenUnion = node.children
        .map((c) => ranges.get(c)!.clusters)
        .reduce((a, b) => unionBy(a, b), [] as Region[]);
      ranges.set(node, set(unionBy(prelim, intersectBy(pfinal, childrenUnion))));
    }
  });
}

/** Sum occurrence counts up the tree, sorted by descending count (ties broken by clusterId). */
function aggregateClusters(
  root: PhyloNode,
  clustersPerSpecies: ClustersPerSpecies,
  clusters: Map<PhyloNode, RegionSet>,
): void {
  const sorted = (cs: Region[], totCount: number): RegionSet => ({
    totCount,
    clusters: [...cs].sort((a, b) => b.count - a.count || a.clusterId - b.clusterId),
  });
  visitTreeDepthFirstPostOrder(root, (node) => {
    if (node.isLeaf) {
      const cl = clustersPerSpecies[node.name];
      const cs = cl ? cl.clusters.map((r) => ({ clusterId: r.clusterId, count: r.count })) : [];
      clusters.set(node, sorted(cs, cs.reduce((s, r) => s + r.count, 0)));
      return;
    }
    const agg = new Map<number, number>();
    let totCount = 0;
    for (const child of node.children) {
      const childEntry = clusters.get(child);
      if (!childEntry) continue;
      for (const r of childEntry.clusters) {
        agg.set(r.clusterId, (agg.get(r.clusterId) ?? 0) + r.count);
        totCount += r.count;
      }
    }
    clusters.set(node, sorted([...agg].map(([clusterId, count]) => ({ clusterId, count })), totCount));
  });
}

/** Post-order aggregation of `speciesCount` = number of subtended terminals. */
function aggregateSpeciesCount(root: PhyloNode, counts: Map<PhyloNode, number>): void {
  visitTreeDepthFirstPostOrder(root, (node) => {
    if (node.isLeaf) {
      counts.set(node, 1);
      return;
    }
    counts.set(
      node,
      node.children.reduce((sum, c) => sum + (counts.get(c) ?? 0), 0),
    );
  });
}

/**
 * Run all three reconstructions on `root` and return a map from each node to its
 * `{ranges, clusters, speciesCount}`. `clustersPerSpecies` maps a leaf's `name` to the set of
 * bioregions its occurrences fall in (with counts) — built from `species.countPerRegion`.
 */
export function reconstructAncestralRanges(
  root: PhyloNode,
  clustersPerSpecies: ClustersPerSpecies,
): AncestralMap {
  const ranges = new Map<PhyloNode, RegionSet>();
  const clusters = new Map<PhyloNode, RegionSet>();
  const speciesCount = new Map<PhyloNode, number>();

  preliminaryPhase(root, clustersPerSpecies, ranges);
  finalPhase(root, ranges);
  aggregateClusters(root, clustersPerSpecies, clusters);
  aggregateSpeciesCount(root, speciesCount);

  const result: AncestralMap = new Map();
  visitTreeDepthFirstPostOrder(root, (node) => {
    result.set(node, {
      ranges: ranges.get(node)!,
      clusters: clusters.get(node)!,
      speciesCount: speciesCount.get(node)!,
    });
  });
  return result;
}
