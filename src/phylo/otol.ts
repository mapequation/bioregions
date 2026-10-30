// Open Tree of Life API v3 client: name matching (TNRS), the synthetic tree
// (induced subtree, MRCA, version), and published study trees. All endpoints
// are CORS-enabled; request and response shapes were verified live (synthesis
// opentree16.1, Oct 2026).

import { createLimiter, fetchText, HttpError, postJson } from '@/sources/http';

export const OTOL_API = 'https://api.opentreeoflife.org/v3';

/** Names per TNRS call. The API accepted 10 000 in testing; matched names carry long synonym lists, so keep responses small. */
export const TNRS_BATCH_SIZE = 250;
/** Smaller batches for fuzzy matching, which is much slower per name. */
export const TNRS_APPROX_BATCH_SIZE = 50;

export interface NameMatch {
  /** The name as given. */
  input: string;
  ottId?: number;
  /** Accepted OTT name (unique_name, which disambiguates homonyms). */
  ottName?: string;
  rank?: string;
  /** The input matched a synonym of `ottName`. */
  isSynonym: boolean;
  /** Fuzzy (misspelling-tolerant) match. */
  isApproximate: boolean;
  score?: number;
  /** OTT taxonomy flags, e.g. 'extinct', 'incertae_sedis'. */
  flags?: string[];
  /**
   * False when the taxonomy suppresses the taxon from synthesis. A hint only:
   * `inducedSubtree` reports the ids actually missing from the synthetic tree.
   */
  inSynthesis?: boolean;
}

export interface MatchNamesOptions {
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
  /** TNRS context such as 'Mammals' or 'Land plants' (see tnrs/contexts). */
  contextName?: string;
  /** Retry unmatched names with fuzzy matching (default true). */
  approximate?: boolean;
}

interface TnrsTaxon {
  ott_id: number;
  name: string;
  unique_name: string;
  rank?: string;
  flags?: string[];
  is_suppressed?: boolean;
  is_suppressed_from_synth?: boolean;
}

interface TnrsMatch {
  is_approximate_match: boolean;
  is_synonym: boolean;
  matched_name: string;
  score: number;
  taxon: TnrsTaxon;
}

interface TnrsResponse {
  results: { name: string; matches: TnrsMatch[] }[];
  unmatched_names?: string[];
}

/** Rank TNRS candidates: exact, accepted, in synthesis, highest score, then API order. */
function bestMatch(matches: TnrsMatch[]): TnrsMatch | undefined {
  const rank = (m: TnrsMatch) =>
    (m.is_approximate_match ? 4 : 0) + (m.is_synonym ? 2 : 0) + (m.taxon.is_suppressed_from_synth ? 1 : 0);
  return matches
    .map((m, i) => ({ m, i }))
    .sort((a, b) => rank(a.m) - rank(b.m) || b.m.score - a.m.score || a.i - b.i)[0]?.m;
}

function toNameMatch(input: string, match: TnrsMatch | undefined): NameMatch {
  if (!match) {
    return { input, isSynonym: false, isApproximate: false };
  }
  const { taxon } = match;
  return {
    input,
    ottId: taxon.ott_id,
    ottName: taxon.unique_name || taxon.name,
    rank: taxon.rank,
    isSynonym: match.is_synonym,
    isApproximate: match.is_approximate_match,
    score: match.score,
    flags: taxon.flags ?? [],
    inSynthesis: !taxon.is_suppressed_from_synth,
  };
}

/**
 * Match names to OTT taxa with tnrs/match_names. Exact matching first, then (by
 * default) fuzzy matching for the rest. Batched, two requests at a time; returns
 * one result per input, in input order. Progress counts unique names resolved.
 */
export async function matchNames(names: string[], opts: MatchNamesOptions = {}): Promise<NameMatch[]> {
  const { signal, onProgress, contextName, approximate = true } = opts;
  const unique = [...new Set(names.map((name) => name.trim()).filter(Boolean))];
  const found = new Map<string, TnrsMatch>();
  const total = unique.length;
  let done = 0;
  onProgress?.(0, total);

  const limit = createLimiter(2);
  const run = async (batchSize: number, fuzzy: boolean, pending: string[]) => {
    const batches: string[][] = [];
    for (let i = 0; i < pending.length; i += batchSize) {
      batches.push(pending.slice(i, i + batchSize));
    }
    await Promise.all(
      batches.map((batch) =>
        limit(async () => {
          const body: Record<string, unknown> = { names: batch, do_approximate_matching: fuzzy };
          if (contextName) {
            body.context_name = contextName;
          }
          const response = await postJson<TnrsResponse>(`${OTOL_API}/tnrs/match_names`, body, {
            signal,
            timeoutMs: 120_000,
          });
          let matched = 0;
          response.results.forEach((result, i) => {
            const key = batch.includes(result.name) ? result.name : batch[i];
            const match = bestMatch(result.matches);
            if (key !== undefined && match) {
              found.set(key, match);
              matched++;
            }
          });
          // On the exact pass, unmatched names stay pending until the fuzzy pass.
          done += fuzzy || !approximate ? batch.length : matched;
          onProgress?.(done, total);
        }),
      ),
    );
  };

  await run(TNRS_BATCH_SIZE, false, unique);
  if (approximate) {
    await run(
      TNRS_APPROX_BATCH_SIZE,
      true,
      unique.filter((name) => !found.has(name)),
    );
  }
  return names.map((name) => toNameMatch(name, found.get(name.trim())));
}

export interface MrcaResult {
  /** Taxon name of the MRCA node, or of the nearest enclosing taxon. */
  name: string;
  ottId?: number;
  rank?: string;
  /** Tips in the synthetic tree below the MRCA node. */
  numTips?: number;
  /** Synthetic-tree node id ('ott123' or 'mrcaott1ott2'). */
  nodeId?: string;
  /** The MRCA node is itself the named taxon (not just inside it). */
  isTaxon: boolean;
}

interface OtolTaxon {
  name: string;
  ott_id: number;
  rank?: string;
  unique_name?: string;
}

interface MrcaResponse {
  mrca: { node_id: string; num_tips?: number; taxon?: OtolTaxon };
  nearest_taxon?: OtolTaxon;
}

/** Most recent common ancestor of the taxa in the synthetic tree (tree_of_life/mrca). */
export async function mrca(ottIds: number[], signal?: AbortSignal): Promise<MrcaResult> {
  const response = await postJson<MrcaResponse>(
    `${OTOL_API}/tree_of_life/mrca`,
    { ott_ids: [...new Set(ottIds)] },
    { signal, timeoutMs: 120_000 },
  );
  const taxon = response.mrca.taxon ?? response.nearest_taxon;
  return {
    name: taxon?.unique_name || taxon?.name || response.mrca.node_id,
    ottId: taxon?.ott_id,
    rank: taxon?.rank,
    numTips: response.mrca.num_tips,
    nodeId: response.mrca.node_id,
    isTaxon: response.mrca.taxon !== undefined,
  };
}

export interface InducedSubtree {
  /**
   * Topology only (no branch lengths), labelled by id: tips 'ott123', internal
   * nodes 'ott123' or 'mrcaott1ott2'. Contains many unary nodes (collapse them).
   */
  newick: string;
  /** Requested 'ott123' ids of non-monophyletic taxa → the 'mrcaott..' node standing in for them. */
  broken: Record<string, string>;
  /** Requested ids not in the synthetic tree (pruned or invalid), dropped from the request. */
  missing: number[];
}

/** Ids the API rejected, from a 400 body like `{"unknown": {"ott5064411": "pruned_ott_id"}}`. */
export function parseUnknownIds(error: unknown): number[] {
  if (!(error instanceof HttpError) || error.status !== 400) {
    return [];
  }
  try {
    const body = JSON.parse(error.body) as { unknown?: Record<string, string> };
    return Object.keys(body.unknown ?? {})
      .map((key) => Number(key.replace(/^ott/, '')))
      .filter((id) => Number.isInteger(id));
  } catch {
    return [];
  }
}

/**
 * Subtree of the synthetic tree spanning the taxa (tree_of_life/induced_subtree,
 * label_format 'id'). Ids the API rejects are dropped and retried, and reported
 * in `missing`. Throws when no requested taxon is in the tree.
 */
export async function inducedSubtree(ottIds: number[], signal?: AbortSignal): Promise<InducedSubtree> {
  let ids = [...new Set(ottIds)];
  const missing: number[] = [];
  for (;;) {
    if (ids.length === 0) {
      throw new Error('None of the taxa are in the Open Tree synthetic tree');
    }
    try {
      const response = await postJson<{ newick: string; broken?: Record<string, string> }>(
        `${OTOL_API}/tree_of_life/induced_subtree`,
        { ott_ids: ids, label_format: 'id' },
        { signal, timeoutMs: 180_000 },
      );
      return { newick: response.newick, broken: response.broken ?? {}, missing };
    } catch (error) {
      const unknown = new Set(parseUnknownIds(error));
      const dropped = ids.filter((id) => unknown.has(id));
      if (dropped.length === 0) {
        throw error;
      }
      missing.push(...dropped);
      ids = ids.filter((id) => !unknown.has(id));
    }
  }
}

export interface StudyTree {
  studyId: string;
  treeId: string;
  /** Curator's tree label, when given. */
  label?: string;
  /** Full publication reference. */
  reference: string;
  year?: number;
  /** https://doi.org/... */
  doi?: string;
  focalClade?: string;
  /** Open Tree branch length mode, e.g. 'ot:time', 'ot:substitutionCount'. */
  branchLengthMode?: string;
  timeUnit?: string;
  /** Branch lengths are times (a chronogram). */
  isDated: boolean;
  curator?: string;
  proposedForSynthesis?: boolean;
}

interface FindTreesResponse {
  matched_studies?: {
    'ot:studyId': string;
    'ot:studyPublicationReference'?: string;
    'ot:studyPublication'?: string;
    'ot:studyYear'?: number | string;
    'ot:focalCladeOTTTaxonName'?: string;
    'ot:curatorName'?: string | string[];
    matched_trees?: {
      'ot:treeId': string;
      '@label'?: string | null;
      'ot:branchLengthMode'?: string | null;
      'ot:branchLengthTimeUnit'?: string | null;
      'ot:proposedForSynthesis'?: boolean;
    }[];
  }[];
}

/** Normalize 'http://dx.doi.org/10.1/x', 'doi:10.1/x' or '10.1/x' to 'https://doi.org/10.1/x'. */
export function normalizeDoi(value: string | undefined | null): string | undefined {
  const match = value?.trim().match(/(10\.\d{4,9}\/\S+)$/);
  return match ? `https://doi.org/${match[1]}` : undefined;
}

function toStudyTrees(response: FindTreesResponse): StudyTree[] {
  const trees: StudyTree[] = [];
  for (const study of response.matched_studies ?? []) {
    const year = Number(study['ot:studyYear']);
    const curator = study['ot:curatorName'];
    for (const tree of study.matched_trees ?? []) {
      const mode = tree['ot:branchLengthMode'] || undefined;
      trees.push({
        studyId: study['ot:studyId'],
        treeId: tree['ot:treeId'],
        label: tree['@label'] || undefined,
        reference: study['ot:studyPublicationReference']?.trim() ?? '',
        year: Number.isFinite(year) && year > 0 ? year : undefined,
        doi: normalizeDoi(study['ot:studyPublication']),
        focalClade: study['ot:focalCladeOTTTaxonName'] || undefined,
        branchLengthMode: mode,
        timeUnit: tree['ot:branchLengthTimeUnit'] || undefined,
        isDated: mode === 'ot:time',
        curator: (Array.isArray(curator) ? curator.join(', ') : curator) || undefined,
        proposedForSynthesis: tree['ot:proposedForSynthesis'],
      });
    }
  }
  return trees;
}

/**
 * Published trees containing the taxon (studies/find_trees on ot:ottId, falling back
 * to ot:ottTaxonName when the id finds nothing). Deduplicated; dated trees first,
 * then newest.
 */
export async function findStudyTrees(
  { ottId, taxonName }: { ottId?: number; taxonName?: string },
  signal?: AbortSignal,
): Promise<StudyTree[]> {
  const query = (property: string, value: string) =>
    postJson<FindTreesResponse>(
      `${OTOL_API}/studies/find_trees`,
      { property, value, verbose: true },
      { signal, timeoutMs: 60_000 },
    ).then(toStudyTrees);

  let trees = ottId !== undefined ? await query('ot:ottId', String(ottId)) : [];
  if (trees.length === 0 && taxonName) {
    trees = await query('ot:ottTaxonName', taxonName);
  }
  const unique = new Map<string, StudyTree>();
  for (const tree of trees) {
    unique.set(`${tree.studyId}@${tree.treeId}`, tree);
  }
  return [...unique.values()].sort(
    (a, b) => Number(b.isDated) - Number(a.isDated) || (b.year ?? 0) - (a.year ?? 0),
  );
}

export type StudyTipLabel = 'ot:ottId' | 'ot:ottTaxonName' | 'ot:originalLabel';

/**
 * Newick of a published tree (GET study/{id}/tree/{treeId}.tre), with branch lengths.
 * Tips are labelled by OTT id by default ('770315', unquoted), which maps back to
 * matched dataset names exactly; taxon names can repeat and are quoted. Tips not
 * mapped to OTT read "*tip #1 not mapped to OTT. Original label - ..." in every mode.
 */
export function fetchStudyTree(
  studyId: string,
  treeId: string,
  signal?: AbortSignal,
  tipLabel: StudyTipLabel = 'ot:ottId',
): Promise<string> {
  const url = `${OTOL_API}/study/${encodeURIComponent(studyId)}/tree/${encodeURIComponent(treeId)}.tre?tip_label=${tipLabel}`;
  return fetchText(url, { signal, timeoutMs: 120_000 });
}

/** OTT id of a study-tree tip fetched with tip_label=ot:ottId, or null for unmapped tips. */
export function studyTipOttId(label: string): number | null {
  return /^\d+$/.test(label.trim()) ? Number(label) : null;
}

export interface SynthesisInfo {
  /** e.g. 'opentree16.1'. */
  synthId: string;
  /** Creation date, YYYY-MM-DD. */
  date?: string;
  taxonomyVersion?: string;
  citation: string;
}

const HINCHLIFF_2015 =
  'Hinchliff, C. E., et al. (2015). Synthesis of phylogeny and taxonomy into a comprehensive tree of life. ' +
  'PNAS 112(41): 12764-12769. https://doi.org/10.1073/pnas.1423041112';

/** Open Tree synthesis citation, naming the synthetic tree version when known. */
export function otolCitation(info?: { synthId?: string; date?: string }): string {
  const version = info?.synthId
    ? ` Synthetic tree ${info.synthId}${info.date ? ` (${info.date})` : ''}, https://tree.opentreeoflife.org.`
    : ' https://tree.opentreeoflife.org.';
  return `Open Tree of Life.${version} ${HINCHLIFF_2015}`;
}

/** Citation for a published tree: the study reference plus its DOI and Open Tree id. */
export function studyCitation(tree: StudyTree): string {
  const parts = [tree.reference || `Open Tree study ${tree.studyId}`];
  if (tree.doi && !tree.reference.includes(tree.doi.replace('https://doi.org/', ''))) {
    parts.push(tree.doi);
  }
  parts.push(`Tree ${tree.treeId} in Open Tree study ${tree.studyId} (https://tree.opentreeoflife.org/curator/study/view/${tree.studyId}).`);
  return parts.join(' ');
}

/** Version of the synthetic tree (tree_of_life/about). */
export async function synthesisInfo(signal?: AbortSignal): Promise<SynthesisInfo> {
  const response = await postJson<{ synth_id: string; date_created?: string; taxonomy_version?: string }>(
    `${OTOL_API}/tree_of_life/about`,
    {},
    { signal },
  );
  const date = response.date_created?.slice(0, 10);
  return {
    synthId: response.synth_id,
    date,
    taxonomyVersion: response.taxonomy_version,
    citation: otolCitation({ synthId: response.synth_id, date }),
  };
}
