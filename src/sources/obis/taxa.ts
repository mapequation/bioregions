// OBIS taxon autocomplete and name -> AphiaID resolution (WoRMS backbone).

import { fetchJson } from '../http';
import type { OccurrenceQuery, TaxonRef } from '../types';
import { OBIS_API, queryTaxonIds } from './params';

interface CompleteItem {
  id: number;
  scientificName: string;
  /** AphiaID of the accepted name; string in the response, null for some names. */
  acceptedNameUsageID?: string | number | null;
  rank?: string | null;
  kingdom?: string | null;
  phylum?: string | null;
  class?: string | null;
  order?: string | null;
  family?: string | null;
}

interface TaxonItem {
  taxonID: number;
  scientificName: string;
  taxonomicStatus?: string;
  acceptedNameUsageID?: number | null;
}

const acceptedId = (item: CompleteItem): number => {
  const accepted = Number(item.acceptedNameUsageID);
  return Number.isFinite(accepted) && accepted > 0 ? accepted : item.id;
};

/** Taxon suggestions; synonyms map to their accepted AphiaID and are deduplicated. */
export async function suggestObisTaxa(q: string, signal?: AbortSignal): Promise<TaxonRef[]> {
  const term = q.trim();
  if (term.length < 2) {
    return [];
  }
  const items = await fetchJson<CompleteItem[]>(
    `${OBIS_API}/taxon/complete/verbose/${encodeURIComponent(term)}`,
    { signal },
  );
  // A synonym is dropped when its accepted name is also listed; otherwise it stands
  // in for the accepted taxon (same AphiaID). The API's relevance order is kept.
  const listedAccepted = new Set(items.filter((i) => acceptedId(i) === i.id).map((i) => i.id));
  const seen = new Set<number>();
  const refs: TaxonRef[] = [];
  for (const item of items) {
    const obisId = acceptedId(item);
    const synonymOfListed = obisId !== item.id && listedAccepted.has(obisId);
    if (seen.has(obisId) || synonymOfListed) {
      continue;
    }
    seen.add(obisId);
    const path = [item.kingdom, item.phylum, item.class, item.order, item.family]
      .filter((x): x is string => !!x && x !== item.scientificName)
      .join(' › ');
    refs.push({
      name: item.scientificName,
      rank: (item.rank ?? '').toUpperCase(),
      obisId,
      ...(path && { path }),
    });
  }
  // An exact name match first (the API ranks "Delphinidae" below "Delphiniceti").
  const exact = term.toLowerCase();
  return [
    ...refs.filter((r) => r.name.toLowerCase() === exact),
    ...refs.filter((r) => r.name.toLowerCase() !== exact),
  ];
}

const resolved = new Map<string, number | null>();

/** Clear the name resolution cache (tests). */
export function clearObisTaxonCache(): void {
  resolved.clear();
}

/** AphiaID of the accepted taxon for an exact scientific name, or null if WoRMS has none. */
export async function resolveObisTaxon(name: string, signal?: AbortSignal): Promise<number | null> {
  const key = name.trim();
  if (!key) {
    return null;
  }
  const cached = resolved.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const { results } = await fetchJson<{ total: number; results: TaxonItem[] }>(
    `${OBIS_API}/taxon/${encodeURIComponent(key)}`,
    { signal },
  );
  const accepted = results.find((r) => r.taxonomicStatus === 'accepted');
  const first = accepted ?? results[0];
  const id = first ? (first.acceptedNameUsageID ?? first.taxonID) : null;
  resolved.set(key, id);
  return id;
}

export interface ResolvedTaxa {
  ids: number[];
  /** Names of query taxa OBIS does not know. */
  unresolved: string[];
  /** True when the query has taxa but none resolved, i.e. OBIS has nothing to return. */
  empty: boolean;
}

/** AphiaIDs for all query taxa, resolving those without `obisId` by name. */
export async function resolveQueryTaxa(
  query: OccurrenceQuery,
  signal?: AbortSignal,
): Promise<ResolvedTaxa> {
  const ids = queryTaxonIds(query);
  const missing = query.taxa.filter((t) => t.obisId == null);
  const lookups = await Promise.all(missing.map((t) => resolveObisTaxon(t.name, signal)));
  const unresolved: string[] = [];
  lookups.forEach((id, i) => {
    if (id == null) {
      unresolved.push(missing[i].name);
    } else {
      ids.push(id);
    }
  });
  const unique = [...new Set(ids)];
  return { ids: unique, unresolved, empty: query.taxa.length > 0 && unique.length === 0 };
}
