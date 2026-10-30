// Pure tree helpers for PhyloStore: join Open Tree tips to dataset species, prune,
// and write a Newick string the app's reader accepts.
import {
  cleanOttLabel,
  grafenBranchLengths,
  type NewickNode,
  ottIdFromLabel,
  parseNewick,
  preOrder,
  relabelTips,
  treeStats,
  writeNewick,
} from '@/phylo/newickTools';
import { type StudyTreeTips, studyTipOttId } from '@/phylo/otol';
import { normalizeSpeciesName } from '@/utils/names';
import type { TreeSelection } from '../explorer/types';

/** Lookups from tree tips to dataset species names (see matching.ts). */
export interface TipJoin {
  ottToDataset: Map<number, string>;
  nameToDataset: Map<string, string>;
}

const ORIGINAL_LABEL = /Original label - (.+)$/;

/**
 * Dataset species name for a tip label, or null. Tries the OTT id ('ott123',
 * 'Name_ott123' or a bare '123' from study trees) first, then the cleaned name, then
 * the author's original label of an unmapped study-tree tip.
 */
export function tipToDataset(label: string, join: TipJoin): string | null {
  const id = studyTipOttId(label) ?? ottIdFromLabel(label);
  if (id !== null) {
    const name = join.ottToDataset.get(id);
    if (name) return name;
  }
  const candidates = [cleanOttLabel(label), ORIGINAL_LABEL.exec(label)?.[1] ?? ''];
  for (const raw of candidates) {
    const cleaned = raw.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
    if (!cleaned) continue;
    const name = join.nameToDataset.get(normalizeSpeciesName(cleaned));
    if (name) return name;
  }
  return null;
}

/**
 * Attach each broken taxon ('ott123' -> 'mrcaott1ott2' from induced_subtree) as a
 * tip below the node standing in for it, so it is placed at its MRCA. Mutates and
 * returns `tree`.
 */
export function placeBrokenTaxa(tree: NewickNode, broken: Record<string, string>): NewickNode {
  const byNode = new Map<string, string[]>();
  for (const [taxon, nodeLabel] of Object.entries(broken)) {
    byNode.set(nodeLabel, [...(byNode.get(nodeLabel) ?? []), taxon]);
  }
  if (byNode.size === 0) return tree;
  for (const n of preOrder(tree)) {
    const taxa = byNode.get(n.name);
    if (!taxa) continue;
    byNode.delete(n.name);
    for (const taxon of taxa) {
      n.children.push({ name: taxon, branchLength: null, children: [] });
    }
  }
  return tree;
}

export interface DatasetTree extends TreeSelection {
  /** Pruned tree with tips renamed to dataset species and no internal labels. */
  tree: NewickNode;
  /** Every non-root branch has a length. */
  hasBranchLengths: boolean;
  /** Tips in the source tree (after placing broken taxa). */
  sourceTips: number;
  /** Labels of source tips not kept (not in the dataset, or repeats); see tipDisplayName. */
  notInData: string[];
}

/** A readable name for a source-tree tip label ('770315' -> 'ott770315'). */
export function tipDisplayName(label: string): string {
  const original = ORIGINAL_LABEL.exec(label)?.[1];
  if (original) return original.replace(/_/g, ' ');
  const id = studyTipOttId(label);
  if (id !== null) return `ott${id}`;
  return cleanOttLabel(label).replace(/_/g, ' ').trim() || label;
}

/**
 * Join a source tree to the dataset: rename tips to dataset species, drop the rest
 * (first tip wins for repeats), clear internal labels, and count what was kept,
 * absent and pruned. `broken` (synthetic tree only) is placed at its MRCA first.
 */
export function buildDatasetTree(
  newick: string,
  join: TipJoin,
  datasetNames: string[],
  broken: Record<string, string> = {},
): DatasetTree {
  const source = placeBrokenTaxa(parseNewick(newick), broken);
  const sourceLabels = preOrder(source)
    .filter((n) => n.children.length === 0)
    .map((n) => n.name);
  const sourceTips = sourceLabels.length;
  const seen = new Set<string>();
  const notInData: string[] = [];
  for (const label of sourceLabels) {
    const name = tipToDataset(label, join);
    if (name && !seen.has(name)) seen.add(name);
    else notInData.push(label);
  }
  const { tree, kept } = relabelTips(source, (label) => tipToDataset(label, join));
  const keptNames = new Set<string>();
  for (const n of preOrder(tree)) {
    if (n.children.length > 0) n.name = '';
    else if (kept > 0) keptNames.add(n.name);
  }
  const brokenNames = Object.keys(broken)
    .map((label) => {
      const id = ottIdFromLabel(label);
      return id === null ? undefined : join.ottToDataset.get(id);
    })
    .filter((name): name is string => name !== undefined && keptNames.has(name));
  return {
    tree,
    kept,
    absentFromTree: datasetNames.filter((name) => !keptNames.has(name)),
    pruned: sourceTips - kept,
    broken: brokenNames,
    hasBranchLengths: kept > 1 && treeStats(tree).hasBranchLengths,
    sourceTips,
    notInData,
  };
}

/** Distinct dataset species among the tips of a source tree (exact coverage). */
export function coverageOf(newick: string, join: TipJoin): { matched: number; hasBranchLengths: boolean } {
  const tree = parseNewick(newick);
  const seen = new Set<string>();
  for (const n of preOrder(tree)) {
    if (n.children.length === 0) {
      const name = tipToDataset(n.name, join);
      if (name) seen.add(name);
    }
  }
  return { matched: seen.size, hasBranchLengths: treeStats(tree).hasBranchLengths };
}

/**
 * Coverage of a study tree from its tips alone (see fetchStudyTips): the dataset
 * species it contains, and the names of tree tips that are not in the dataset
 * (repeats included, as buildDatasetTree drops them).
 */
export function coverageOfTips(
  tips: StudyTreeTips,
  join: TipJoin,
): { kept: Set<string>; hasBranchLengths: boolean; notInData: string[] } {
  const kept = new Set<string>();
  const notInData: string[] = [];
  tips.labels.forEach((label, i) => {
    const name = tipToDataset(label, join);
    if (name && !kept.has(name)) kept.add(name);
    else notInData.push(tips.names[i] ?? tipDisplayName(label));
  });
  return { kept, hasBranchLengths: tips.hasBranchLengths, notInData };
}

/**
 * Newick for TreeStore.loadString: Grafen (rho = 1) lengths when the tree has none,
 * labels written with underscores (the app's reader drops quoted labels).
 */
export function datasetNewick(built: Pick<DatasetTree, 'tree' | 'hasBranchLengths' | 'kept'>): {
  newick: string;
  grafen: boolean;
} {
  if (built.kept < 2) {
    throw new Error('Fewer than two dataset species are in this tree');
  }
  const grafen = !built.hasBranchLengths;
  const tree = grafen ? grafenBranchLengths(built.tree) : built.tree;
  return { newick: writeNewick(tree), grafen };
}
