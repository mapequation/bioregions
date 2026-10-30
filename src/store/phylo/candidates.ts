// Pure candidate-tree helpers for PhyloStore: build table rows from Open Tree
// results, sort and filter them, and write the tree citation for the methods text.
import { otolCitation, type StudyTree, studyCitation, type SynthesisInfo } from '@/phylo/otol';
import type { TreeCandidate } from '../explorer/types';

export const SYNTHETIC_ID = 'synthetic';
/** Exact coverage is computed for at most this many study trees. */
export const MAX_COVERAGE_CHECKS = 15;
/** Concurrent study-tree downloads. */
export const COVERAGE_CONCURRENCY = 3;
/** Below this many study trees for the clade, also search its largest genera. */
export const FEW_STUDY_TREES = 5;

export const GRAFEN_NOTE =
  "Topology only. Branch lengths use Grafen's method (ρ = 1): ages are relative (root = 1), not millions of years.";

/** 'opentree15.1' -> 'v15.1'. */
export function synthVersionLabel(synthId: string | undefined): string | undefined {
  if (!synthId) return undefined;
  const match = /(\d+(?:\.\d+)*)$/.exec(synthId);
  return match ? `v${match[1]}` : synthId;
}

export function syntheticCandidate(info: SynthesisInfo | null): TreeCandidate {
  return {
    id: SYNTHETIC_ID,
    kind: 'synthetic',
    title: 'Open Tree synthesis',
    citation: info?.citation ?? otolCitation(),
    // The table shows synthVersion in the Year column.
    year: null,
    synthVersion: synthVersionLabel(info?.synthId),
    branchLengths: 'none',
    coverage: null,
    coverageState: 'pending',
  };
}

/** Open Tree branch-length mode -> table value. */
export function branchLengthKind(mode: string | undefined): TreeCandidate['branchLengths'] {
  switch (mode) {
    case 'ot:time':
      return 'time';
    case 'ot:substitutionCount':
    case 'ot:changesCount':
    case 'ot:other':
      return 'other';
    default:
      return 'none';
  }
}

/**
 * Short author label from an APA-like reference: 'Nyakatura & Bininda-Emonds',
 * 'Johnson et al.', or the first surname.
 */
export function shortAuthors(reference: string): string | null {
  const ref = reference.trim();
  if (!ref) return null;
  const authors = ref.split(/\(?\b(?:19|20)\d{2}\b/)[0];
  const surnames = authors
    .split(/,|&|\band\b/)
    .map((part) =>
      part
        .replace(/\bet al\.?/, '')
        .trim()
        // 'Smith JA' -> 'Smith'
        .replace(/\s+[A-Z]{1,3}$/, '')
        // 'Janet C. Buckner' -> 'Buckner'
        .replace(/^[A-Z][a-z]+(?:\s+[A-Z]\.)+\s+/, ''),
    )
    // Drop initials such as 'K.', 'O. R.' and 'J.-C.'.
    .filter((part) => part.length > 1 && !/^(?:[A-Z]\.[\s-]*)+$/.test(part));
  if (surnames.length === 0) return null;
  const first = surnames[0];
  if (/et al/.test(authors) || surnames.length > 2) return `${first} et al.`;
  if (surnames.length === 2) return `${first} & ${surnames[1]}`;
  return first;
}

export function studyCandidateId(tree: Pick<StudyTree, 'studyId' | 'treeId'>): string {
  return `${tree.studyId}@${tree.treeId}`;
}

/** The tree's label, or its id when the label is missing or 'Untitled (tree6187)'. */
function treeLabel(tree: StudyTree): string {
  const label = tree.label?.trim();
  return label && !/^untitled\b/i.test(label) ? label : tree.treeId;
}

export function studyCandidate(tree: StudyTree, multipleTreesInStudy = false): TreeCandidate {
  const authors = shortAuthors(tree.reference) ?? `Study ${tree.studyId}`;
  return {
    id: studyCandidateId(tree),
    kind: 'study',
    title: multipleTreesInStudy ? `${authors} (${treeLabel(tree)})` : authors,
    citation: studyCitation(tree),
    year: tree.year ?? null,
    doi: tree.doi,
    studyId: tree.studyId,
    treeId: tree.treeId,
    branchLengths: branchLengthKind(tree.branchLengthMode),
    timeUnit: tree.timeUnit,
    coverage: null,
    coverageState: 'pending',
  };
}

/** Study candidates from several find_trees results, deduplicated in order. */
export function studyCandidates(lists: StudyTree[][]): TreeCandidate[] {
  const unique = new Map<string, StudyTree>();
  for (const list of lists) {
    for (const tree of list) {
      const id = studyCandidateId(tree);
      if (!unique.has(id)) unique.set(id, tree);
    }
  }
  const perStudy = new Map<string, number>();
  for (const tree of unique.values()) perStudy.set(tree.studyId, (perStudy.get(tree.studyId) ?? 0) + 1);
  return [...unique.values()].map((tree) => studyCandidate(tree, (perStudy.get(tree.studyId) ?? 0) > 1));
}

/**
 * Table order: the synthetic tree first, then by coverage (unknown last) or year
 * (newest first, unknown last), ties broken by dated, then year. Dated only keeps
 * trees with time branch lengths.
 */
export function sortCandidates(
  candidates: TreeCandidate[],
  sort: 'coverage' | 'year',
  datedOnly: boolean,
): TreeCandidate[] {
  const cov = (c: TreeCandidate) => (c.coverage ? c.coverage.matched : -1);
  const year = (c: TreeCandidate) => c.year ?? -1;
  const dated = (c: TreeCandidate) => (c.branchLengths === 'time' ? 1 : 0);
  return candidates
    .filter((c) => !datedOnly || c.branchLengths === 'time')
    .map((c, i) => ({ c, i }))
    .sort(
      (a, b) =>
        Number(b.c.kind === 'synthetic') - Number(a.c.kind === 'synthetic') ||
        (sort === 'coverage' ? cov(b.c) - cov(a.c) : year(b.c) - year(a.c)) ||
        dated(b.c) - dated(a.c) ||
        year(b.c) - year(a.c) ||
        a.i - b.i,
    )
    .map(({ c }) => c);
}

/** Citation paragraph for the methods text. */
export function treeCitationText(
  candidate: Pick<TreeCandidate, 'kind' | 'citation'>,
  tips: number,
  grafen: boolean,
): string {
  const source =
    candidate.kind === 'synthetic'
      ? 'The phylogeny is the Open Tree of Life synthetic tree, induced for the matched species'
      : 'The phylogeny is a published tree from the Open Tree of Life study collection';
  const parts = [
    `${source}, with names matched by the Open Tree TNRS and pruned to the ${tips} dataset species it contains.`,
  ];
  if (grafen) {
    parts.push("Branch lengths were computed with Grafen's method (ρ = 1) and are relative, not in time units.");
  }
  parts.push(candidate.citation);
  return parts.join(' ');
}

/** Run `fn` over `items` with at most `limit` in flight. Rejections are left to `fn`. */
export async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}
