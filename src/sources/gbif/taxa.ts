// GBIF backbone taxon lookup: autocomplete over scientific and common names,
// name matching for taxa picked elsewhere (OBIS), and occurrence counts.
// Synonyms are always replaced by their accepted usage, so the returned `gbifKey`
// is what the occurrence `taxonKey` predicate expects.

import type { TaxonRef } from '../types';
import { fetchJson, isAbortError } from '../http';
import { GBIF_API_URL, gbifGraphql } from './graphql';
import { clauseToGraphql } from './predicate';

/** The GBIF Backbone Taxonomy checklist. */
export const GBIF_BACKBONE_KEY = 'd7dddbf4-2cf0-4f39-9b2a-bb099caae36c';

/** Synonym hits resolved to their accepted usage per suggestion (each costs two requests). */
const MAX_SYNONYMS = 4;

/** Name usage fields shared by /species/suggest, /species/search and /species/{key}. */
interface GbifUsage {
  key: number;
  canonicalName?: string;
  scientificName?: string;
  rank?: string;
  /** suggest: ACCEPTED | SYNONYM | DOUBTFUL | ... */
  status?: string;
  /** search, species/{key}. */
  taxonomicStatus?: string;
  synonym?: boolean;
  acceptedKey?: number;
  kingdom?: string;
  phylum?: string;
  class?: string;
  order?: string;
  family?: string;
  genus?: string;
  vernacularName?: string;
  vernacularNames?: { vernacularName: string; language?: string | null }[];
}

interface SearchResponse {
  results: GbifUsage[];
}

interface MatchResponse {
  usageKey?: number;
  acceptedUsageKey?: number;
  canonicalName?: string;
  rank?: string;
  status?: string;
  matchType?: 'EXACT' | 'FUZZY' | 'HIGHERRANK' | 'NONE';
  confidence?: number;
  kingdom?: string;
  phylum?: string;
  class?: string;
  order?: string;
  family?: string;
  genus?: string;
}

/** Approximate depth of each rank, for ordering and for building display paths. */
const RANK_LEVEL: Record<string, number> = {
  DOMAIN: -1,
  KINGDOM: 0,
  SUBKINGDOM: 0.5,
  PHYLUM: 1,
  SUBPHYLUM: 1.5,
  SUPERCLASS: 1.8,
  CLASS: 2,
  SUBCLASS: 2.5,
  SUPERORDER: 2.8,
  ORDER: 3,
  SUBORDER: 3.5,
  INFRAORDER: 3.6,
  SUPERFAMILY: 3.8,
  FAMILY: 4,
  SUBFAMILY: 4.5,
  TRIBE: 4.6,
  SUBTRIBE: 4.7,
  GENUS: 5,
  SUBGENUS: 5.5,
  SECTION: 5.6,
  SPECIES: 6,
  SUBSPECIES: 7,
  VARIETY: 7,
  FORM: 7,
};

const rankLevel = (rank: string | undefined) => RANK_LEVEL[rank ?? ''] ?? 8;

const PATH_RANKS = ['kingdom', 'phylum', 'class', 'order', 'family', 'genus'] as const;

type Classified = Partial<Record<(typeof PATH_RANKS)[number], string>>;

/**
 * Higher classification above `rank`, e.g. "Animalia › Chordata › Mammalia › Carnivora"
 * for Felidae. The genus is left out for species and below (it starts the name).
 */
export function classificationPath(usage: Classified, rank: string | undefined): string {
  const level = rankLevel(rank);
  return PATH_RANKS.filter((r, i) => i < level && !(r === 'genus' && level >= 6))
    .map((r) => usage[r])
    .filter((name): name is string => Boolean(name))
    .join(' › ');
}

const isAccepted = (u: { status?: string; taxonomicStatus?: string; synonym?: boolean }) =>
  (u.taxonomicStatus ?? u.status) === 'ACCEPTED' && !u.synonym;

const isSynonym = (u: { status?: string; taxonomicStatus?: string; synonym?: boolean }) =>
  u.synonym === true || /SYNONYM/.test(u.taxonomicStatus ?? u.status ?? '');

function toTaxonRef(usage: GbifUsage, vernacularName?: string): TaxonRef {
  const rank = (usage.rank ?? 'UNRANKED').toUpperCase();
  const path = classificationPath(usage, rank);
  const vernacular = vernacularName ?? usage.vernacularName;
  return {
    name: usage.canonicalName || usage.scientificName || String(usage.key),
    rank,
    gbifKey: usage.key,
    ...(vernacular && { vernacularName: vernacular }),
    ...(path && { path }),
  };
}

const speciesUrl = (key: number) => `${GBIF_API_URL}/species/${key}`;

/** The accepted usage for a synonym key, or null when it has none. */
async function acceptedUsage(key: number, signal?: AbortSignal): Promise<GbifUsage | null> {
  const synonym = await fetchJson<GbifUsage>(speciesUrl(key), { signal });
  if (synonym.acceptedKey == null) {
    return null;
  }
  const accepted = await fetchJson<GbifUsage>(speciesUrl(synonym.acceptedKey), { signal });
  return isAccepted(accepted) ? accepted : null;
}

/** Pick the English common name that best matches the query (exact > prefix > contains > first). */
export function pickVernacular(usage: GbifUsage, q: string): string | undefined {
  const english = (usage.vernacularNames ?? [])
    .filter((v) => v.language === 'eng')
    // Some source checklists leave markup debris such as "Jaguar Gobies-->".
    .map((v) => v.vernacularName.replace(/[\s<>-]+$/, '').trim())
    .filter(Boolean);
  if (english.length === 0) {
    return usage.vernacularName || undefined;
  }
  const lq = q.toLowerCase();
  return english.reduce((best, name) =>
    textScore(name, lq) < textScore(best, lq) ? name : best,
  );
}

/** 0 exact, 1 prefix, 2 word prefix, 3 substring, 4 no match (case-insensitive, `lq` lower-cased). */
function textScore(text: string | undefined, lq: string): number {
  if (!text) {
    return 4;
  }
  const t = text.toLowerCase();
  if (t === lq) {
    return 0;
  }
  if (t.startsWith(lq)) {
    return 1;
  }
  if (t.split(/[\s-]+/).some((w) => w.startsWith(lq))) {
    return 2;
  }
  return t.includes(lq) ? 3 : 4;
}

interface Candidate {
  taxon: TaxonRef;
  score: number;
  order: number;
}

/**
 * Autocomplete GBIF backbone taxa by scientific or English common name. Only accepted
 * names are returned (synonyms map to their accepted usage), deduplicated by key,
 * best matches first and higher ranks before lower ones at equal relevance.
 */
export async function suggestGbifTaxa(q: string, signal?: AbortSignal): Promise<TaxonRef[]> {
  const query = q.trim();
  if (query.length < 2) {
    return [];
  }
  const params = (extra: Record<string, string>) =>
    new URLSearchParams({ q: query, datasetKey: GBIF_BACKBONE_KEY, ...extra }).toString();

  const [suggested, vernacular] = await Promise.allSettled([
    fetchJson<GbifUsage[]>(`${GBIF_API_URL}/species/suggest?${params({ limit: '10' })}`, {
      signal,
    }),
    fetchJson<SearchResponse>(
      `${GBIF_API_URL}/species/search?${params({ qField: 'VERNACULAR', limit: '20' })}`,
      { signal },
    ),
  ]);
  if (signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError');
  }
  if (suggested.status === 'rejected' && vernacular.status === 'rejected') {
    throw suggested.reason;
  }

  const lq = query.toLowerCase();
  const byKey = new Map<number, Candidate>();
  let order = 0;
  const add = (usage: GbifUsage, vernacularName: string | undefined, nameScore: number) => {
    const taxon = toTaxonRef(usage, vernacularName);
    const score = Math.min(textScore(taxon.name, lq), nameScore);
    const existing = byKey.get(usage.key);
    if (existing) {
      existing.score = Math.min(existing.score, score);
      existing.taxon.vernacularName ??= taxon.vernacularName;
      return;
    }
    byKey.set(usage.key, { taxon, score, order: order++ });
  };

  const synonyms: { key: number; score: number; vernacular?: string }[] = [];

  for (const usage of suggested.status === 'fulfilled' ? suggested.value : []) {
    if (isAccepted(usage)) {
      add(usage, undefined, 4);
    } else if (isSynonym(usage)) {
      // A synonym matched by name ranks like a match on the accepted name.
      synonyms.push({ key: usage.key, score: textScore(usage.canonicalName, lq) });
    }
  }

  for (const usage of vernacular.status === 'fulfilled' ? vernacular.value.results : []) {
    const name = pickVernacular(usage, query);
    const score = textScore(name, lq);
    if (isAccepted(usage)) {
      add(usage, name, score);
    } else if (isSynonym(usage) && usage.acceptedKey != null) {
      synonyms.push({ key: usage.key, score, vernacular: name });
    }
  }

  const resolved = await Promise.all(
    synonyms.slice(0, MAX_SYNONYMS).map(async (s) => {
      try {
        return { ...s, usage: await acceptedUsage(s.key, signal) };
      } catch (error) {
        if (isAbortError(error)) {
          throw error;
        }
        return { ...s, usage: null };
      }
    }),
  );
  for (const { usage, score, vernacular: name } of resolved) {
    if (usage) {
      add(usage, name, score);
    }
  }

  return [...byKey.values()]
    .sort(
      (a, b) =>
        a.score - b.score ||
        rankLevel(a.taxon.rank) - rankLevel(b.taxon.rank) ||
        a.order - b.order,
    )
    .map((c) => c.taxon);
}

/**
 * Match a scientific name to the GBIF backbone and return its accepted usage, or null
 * when GBIF has no confident match at that rank (a match only to a higher rank is null).
 */
export async function resolveGbifTaxon(
  name: string,
  signal?: AbortSignal,
): Promise<TaxonRef | null> {
  const clean = name.replace(/_/g, ' ').trim();
  if (!clean) {
    return null;
  }
  const params = new URLSearchParams({ name: clean, verbose: 'false' });
  const match = await fetchJson<MatchResponse>(`${GBIF_API_URL}/species/match?${params}`, {
    signal,
  });
  if (
    match.usageKey == null ||
    (match.matchType !== 'EXACT' && match.matchType !== 'FUZZY') ||
    (match.matchType === 'FUZZY' && (match.confidence ?? 0) < 90)
  ) {
    return null;
  }
  if (match.acceptedUsageKey != null && match.acceptedUsageKey !== match.usageKey) {
    const accepted = await fetchJson<GbifUsage>(speciesUrl(match.acceptedUsageKey), { signal });
    return toTaxonRef(accepted);
  }
  return toTaxonRef({
    ...match,
    key: match.usageKey,
    rank: match.rank,
  });
}

const COUNT_QUERY = `query TaxonCount($p: Predicate) {
  occurrenceSearch(predicate: $p) { documents(size: 0) { total } }
}`;

/** Number of GBIF occurrences with coordinates for a backbone taxon key. */
export async function gbifTaxonCount(key: number, signal?: AbortSignal): Promise<number> {
  const predicate = clauseToGraphql({
    op: 'and',
    clauses: [
      { op: 'equals', field: 'taxonKey', value: String(key) },
      { op: 'equals', field: 'hasCoordinate', value: 'true' },
    ],
  });
  const data = await gbifGraphql<{ occurrenceSearch: { documents: { total: number } } }>(
    COUNT_QUERY,
    { p: predicate },
    { signal },
  );
  return data.occurrenceSearch.documents.total;
}
