// Pure candidate-tree helpers for PhyloStore: build table rows from Open Tree
// results, sort and filter them, and write the tree citation for the methods text.
import { otolCitation, type StudyTree, studyCitation, type SynthesisInfo } from '@/phylo/otol';
import type { TreeCandidate } from '../explorer/types';

/**
 * A candidate tree row with display extras on top of the spec's TreeCandidate:
 * a short second line (tree label or synthesis version) and the raw branch-length mode.
 */
export interface PhyloCandidate extends TreeCandidate {
  /** Short muted second line: a cleaned tree label, 'tree 2 of 4', or the synthesis version. */
  subtitle?: string;
  /** Full curator label and tree id, for the subtitle tooltip. */
  subtitleDetail?: string;
  /** Open Tree branch-length mode, e.g. 'ot:time' or 'ot:substitutionCount'. */
  lengthMode?: string;
  /** Why the coverage check failed (coverageState 'error'): it took too long, or the download failed. */
  coverageError?: 'timeout' | 'failed';
}

export const SYNTHETIC_ID = 'synthetic';
/** Exact coverage is computed for at most this many study trees. */
export const MAX_COVERAGE_CHECKS = 15;
/** Concurrent study-tree downloads. */
export const COVERAGE_CONCURRENCY = 6;
/** A dated tree is pre-selected when it covers at least this share of the dataset species. */
export const DATED_MIN_SHARE = 0.6;
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

export function syntheticCandidate(info: SynthesisInfo | null): PhyloCandidate {
  const version = synthVersionLabel(info?.synthId);
  return {
    id: SYNTHETIC_ID,
    kind: 'synthetic',
    title: 'Open Tree synthesis',
    citation: info?.citation ?? otolCitation(),
    // The table shows synthVersion in the Year column.
    year: null,
    synthVersion: version,
    subtitle: version ? `Synthetic tree ${version} · all studies combined` : 'Synthetic tree · all studies combined',
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

/**
 * A curator's tree label without ids and boilerplate, or null when nothing readable
 * is left ('Untitled (tree6187)', 'tree6187', '').
 */
export function cleanTreeLabel(label: string | undefined, treeId: string, surname?: string): string | null {
  const quote = (text: string) => text.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&');
  let text = (label ?? '').trim();
  // 'Buckner et al., 2015 Bayesian Concatenated' repeats the row title: keep 'Bayesian Concatenated'.
  if (surname) text = text.replace(new RegExp(`^${quote(surname)}\\b[^\\d]{0,24}\\b(?:19|20)\\d{2}\\b[,;:.)]*`), '');
  text = text
    .replace(new RegExp(`\\b${quote(treeId)}\\b`, 'g'), '')
    .replace(/\btree\s*\d+\b/gi, '')
    .replace(/^\s*untitled\b/i, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,;:.\-–]+|[\s,;:\-–]+$/g, '');
  return text.length > 1 ? text : null;
}

/** Longest subtitle before it is cut at a word boundary (curator labels are capped at 50 characters). */
export const SUBTITLE_MAX = 44;

/** Open Tree stores at most this many characters of a curator's tree label. */
const LABEL_CAP = 50;

/** Cut `text` at the last word boundary within `max` characters and add an ellipsis. */
export function truncateWords(text: string, max = SUBTITLE_MAX): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max + 1);
  const space = cut.lastIndexOf(' ');
  const head = (space > max * 0.5 ? cut.slice(0, space) : text.slice(0, max)).replace(/[\s,;:.\-–(]+$/, '');
  return `${head}…`;
}

const FILE_TOKENS: [RegExp, string][] = [
  [/^mcc$/i, 'MCC tree'],
  [/^(?:mcc)?(?:target|summary)$/i, ''],
  [/^(?:maj(?:ority)?rule|consensus|con)$/i, 'consensus tree'],
  [/^(?:ml|raxml|iqtree|garli)$/i, 'ML tree'],
  [/^(?:dnaonly|dna)$/i, 'DNA-only'],
  [/^(?:completed|complete|full)$/i, 'completed'],
];

/**
 * A readable label for a file-like id ('MamPhy_fullPosterior_BDvr_DNAonly_4098sp_..._MCC_v2_target'
 * -> 'MCC tree · DNA-only · 4,098 spp.'): known tokens are kept in a fixed
 * order, and an id with none of them just gets spaces for underscores. Text with spaces
 * is returned unchanged.
 */
export function humanizeTreeLabel(label: string): string {
  if (/\s/.test(label.trim()) || !/[_]/.test(label)) return label.trim();
  const tokens = label.split(/[_]+/).filter(Boolean);
  const parts: string[] = [];
  let species: string | null = null;
  for (const token of tokens) {
    const count = /^(\d+)(?:sp|spp|species|taxa|tips)$/i.exec(token);
    if (count) {
      species = `${Number(count[1]).toLocaleString('en-US')} spp.`;
      continue;
    }
    const known = FILE_TOKENS.find(([re]) => re.test(token));
    if (known?.[1] && !parts.includes(known[1])) parts.push(known[1]);
  }
  if (species) parts.push(species);
  if (parts.length === 0) return tokens.join(' ');
  // 'MCC tree' / 'consensus tree' / 'ML tree' lead; the rest keep their order.
  const kind = parts.findIndex((p) => p.endsWith(' tree'));
  if (kind > 0) parts.unshift(...parts.splice(kind, 1));
  return parts.join(' · ');
}

/** Open Tree branch-length mode and time unit -> short unit label and a sentence-ready long form. */
export function lengthUnits(
  c: Pick<PhyloCandidate, 'branchLengths' | 'lengthMode' | 'timeUnit'>,
): { short: string; long: string } {
  if (c.branchLengths === 'none') return { short: 'Grafen', long: 'relative ages (Grafen)' };
  if (c.branchLengths === 'time') {
    const unit = c.timeUnit?.trim();
    if (!unit || /^(?:my|myr|mya|ma|million(?:s)? (?:of )?years?.*)$/i.test(unit)) return { short: 'Myr', long: 'Myr' };
    return { short: unit, long: unit };
  }
  switch (c.lengthMode) {
    case 'ot:substitutionCount':
      return { short: 'subst./site', long: 'substitutions per site' };
    case 'ot:changesCount':
      return { short: 'changes', long: 'character changes' };
    default:
      return { short: 'unknown', long: 'unknown units' };
  }
}

/** 'Springer et al. 2012', or the authors alone when the year is unknown. */
export function studyTitle(tree: Pick<StudyTree, 'reference' | 'studyId' | 'year'>): string {
  const authors = shortAuthors(tree.reference) ?? `Study ${tree.studyId}`;
  return tree.year != null ? `${authors} ${tree.year}` : authors;
}

/**
 * One study tree row. `position` is the tree's place among the study's candidate
 * trees ([index, count]); several trees from one study get a 'tree 2 of 4' fallback label.
 */
export function studyCandidate(tree: StudyTree, position: [number, number] = [1, 1]): PhyloCandidate {
  const [index, count] = position;
  // Last word of the first author ('Leandro Aristide et al.' -> 'Aristide').
  const surname = shortAuthors(tree.reference)
    ?.replace(/\s+et al\.$/, '')
    .split(' & ')[0]
    .split(/\s+/)
    .pop();
  const cleaned = cleanTreeLabel(tree.label, tree.treeId, surname)
    // 'File S3. Fully assembled …' -> 'Fully assembled …'
    ?.replace(/^(?:file|fig(?:ure)?\.?|table|appendix)\s*S?\d+[a-z]?[.:]\s+(?=\S)/i, '');
  let label = cleaned ? humanizeTreeLabel(cleaned) : null;
  // A label at Open Tree's cap was cut mid-word: drop the partial word.
  if (label && (tree.label?.trim().length ?? 0) >= LABEL_CAP && /\w$/.test(label) && label.includes(' ')) {
    label = `${label.slice(0, label.lastIndexOf(' ')).replace(/[\s,;:.\-–(]+$/, '')}…`;
  }
  label = label ? truncateWords(label) : null;
  const fallback = count > 1 ? `tree ${index} of ${count}` : undefined;
  const full = tree.label?.trim();
  return {
    id: studyCandidateId(tree),
    kind: 'study',
    title: studyTitle(tree),
    subtitle: label ?? fallback,
    subtitleDetail: `${full ? `${full} · ` : ''}${tree.studyId}/${tree.treeId}`,
    lengthMode: tree.branchLengthMode,
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
export function studyCandidates(lists: StudyTree[][]): PhyloCandidate[] {
  const unique = new Map<string, StudyTree>();
  for (const list of lists) {
    for (const tree of list) {
      const id = studyCandidateId(tree);
      if (!unique.has(id)) unique.set(id, tree);
    }
  }
  const perStudy = new Map<string, number>();
  for (const tree of unique.values()) perStudy.set(tree.studyId, (perStudy.get(tree.studyId) ?? 0) + 1);
  const seen = new Map<string, number>();
  return [...unique.values()].map((tree) => {
    const index = (seen.get(tree.studyId) ?? 0) + 1;
    seen.set(tree.studyId, index);
    return studyCandidate(tree, [index, perStudy.get(tree.studyId) ?? 1]);
  });
}

/** A checked study tree that shares no tips with the dataset. */
export function hasNoOverlap(c: TreeCandidate): boolean {
  return c.kind === 'study' && c.coverageState === 'ready' && c.coverage?.matched === 0;
}

/**
 * Table order: the synthetic tree first, then by coverage or year (newest first),
 * ties broken by dated, then year. With coverage sort, unchecked or failed rows
 * come after checked ones and trees with no overlap last. Dated only keeps trees
 * with time branch lengths.
 */
export function sortCandidates<C extends TreeCandidate>(
  candidates: C[],
  sort: 'coverage' | 'year',
  datedOnly: boolean,
): C[] {
  const group = (c: TreeCandidate) =>
    c.kind === 'synthetic' ? 0 : hasNoOverlap(c) ? 3 : sort === 'coverage' && !c.coverage ? 2 : 1;
  const cov = (c: TreeCandidate) => (c.coverage ? c.coverage.matched : -1);
  const year = (c: TreeCandidate) => c.year ?? -1;
  const dated = (c: TreeCandidate) => (c.branchLengths === 'time' ? 1 : 0);
  return candidates
    .filter((c) => !datedOnly || c.branchLengths === 'time')
    .map((c, i) => ({ c, i }))
    .sort(
      (a, b) =>
        group(a.c) - group(b.c) ||
        (sort === 'coverage' ? cov(b.c) - cov(a.c) : year(b.c) - year(a.c)) ||
        dated(b.c) - dated(a.c) ||
        year(b.c) - year(a.c) ||
        a.i - b.i,
    )
    .map(({ c }) => c);
}

/** Order before coverage is known: the synthetic tree, dated trees newest first, then the rest newest first. */
export function initialOrder(candidates: TreeCandidate[]): string[] {
  const year = (c: TreeCandidate) => c.year ?? -1;
  const rank = (c: TreeCandidate) => (c.kind === 'synthetic' ? 0 : c.branchLengths === 'time' ? 1 : 2);
  return candidates
    .map((c, i) => ({ c, i }))
    .sort((a, b) => rank(a.c) - rank(b.c) || year(b.c) - year(a.c) || a.i - b.i)
    .map(({ c }) => c.id);
}

/** Row ids of the table and of the collapsed 'No overlap with your species' group. */
export interface RowLayout {
  order: string[];
  noOverlap: string[];
}

/**
 * Sort the rows and move trees with no overlap to their own group. A pinned row
 * (the user's pick) keeps the position it had among the `previous` visible ids,
 * so a re-sort never moves it under the cursor; it is never grouped away.
 */
export function arrangeRows(
  candidates: TreeCandidate[],
  sort: 'coverage' | 'year',
  pin: { id: string; previous: string[]; visible: (id: string) => boolean } | null = null,
): RowLayout {
  const sorted = sortCandidates(candidates, sort, false);
  const noOverlap = sorted.filter((c) => hasNoOverlap(c) && c.id !== pin?.id).map((c) => c.id);
  const grouped = new Set(noOverlap);
  let order = sorted.filter((c) => !grouped.has(c.id)).map((c) => c.id);
  const at = pin ? pin.previous.indexOf(pin.id) : -1;
  if (pin && at >= 0 && order.includes(pin.id)) {
    const rest = order.filter((id) => id !== pin.id);
    const visibleRest = rest.filter(pin.visible);
    const before = visibleRest[at];
    const index = before === undefined ? rest.length : rest.indexOf(before);
    order = [...rest.slice(0, index), pin.id, ...rest.slice(index)];
  }
  return { order, noOverlap };
}

/**
 * The dated study tree to pre-select: time branch lengths and coverage of at least
 * DATED_MIN_SHARE of `total` dataset species; the most tips wins, then the newest.
 */
export function bestDatedCandidate<C extends TreeCandidate>(candidates: C[], total: number): C | null {
  const min = Math.max(2, Math.ceil(total * DATED_MIN_SHARE));
  let best: C | null = null;
  for (const c of candidates) {
    if (c.kind !== 'study' || c.branchLengths !== 'time' || c.coverageState !== 'ready' || !c.coverage) continue;
    if (c.coverage.matched < min) continue;
    if (
      !best ||
      c.coverage.matched > (best.coverage?.matched ?? 0) ||
      (c.coverage.matched === best.coverage?.matched && (c.year ?? -1) > (best.year ?? -1))
    ) {
      best = c;
    }
  }
  return best;
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
