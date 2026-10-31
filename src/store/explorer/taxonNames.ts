// Names of the taxon keys in a GBIF download's request. Backbone keys are numeric
// (api.gbif.org/v1/species); keys of GBIF's newer COL-based checklist are alphanumeric
// (e.g. "935Y2"), which the v1 species API rejects (HTTP 400, checked 2026-10-30), so
// those are looked up in ChecklistBank's latest COL extended release (alias 3LXR).
import { GBIF_API_URL } from '../../sources/gbif/graphql';
import { type FetchOptions, fetchJson } from '../../sources/http';

export const CHECKLISTBANK_TAXON_URL = 'https://api.checklistbank.org/dataset/3LXR/taxon';

type Fetch = <T>(url: string, options?: FetchOptions) => Promise<T>;

/** Label of a key no service could name. */
export function unknownTaxonLabel(key: string): string {
  return `unknown taxon (key ${key})`;
}

async function gbifName(key: string, fetch: Fetch, signal?: AbortSignal): Promise<string | null> {
  const r = await fetch<{ canonicalName?: string; scientificName?: string }>(
    `${GBIF_API_URL}/species/${encodeURIComponent(key)}`,
    { signal, retries: 0, timeoutMs: 10_000 },
  );
  return r.canonicalName || r.scientificName || null;
}

async function checklistBankName(key: string, fetch: Fetch, signal?: AbortSignal): Promise<string | null> {
  const r = await fetch<{ name?: { scientificName?: string } }>(
    `${CHECKLISTBANK_TAXON_URL}/${encodeURIComponent(key)}`,
    { signal, retries: 0, timeoutMs: 10_000 },
  );
  return r.name?.scientificName || null;
}

const settle = (p: Promise<string | null>) => p.catch(() => null);

/**
 * A name for every key (never throws): GBIF first for numeric keys, ChecklistBank for the
 * rest and for numeric keys GBIF does not know, else "unknown taxon (key …)".
 */
export async function resolveTaxonNames(
  keys: string[],
  signal?: AbortSignal,
  fetch: Fetch = fetchJson,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  await Promise.all(
    keys.map(async (key) => {
      let name = /^\d+$/.test(key) ? await settle(gbifName(key, fetch, signal)) : null;
      if (!name && !signal?.aborted) name = await settle(checklistBankName(key, fetch, signal));
      out.set(key, name ?? unknownTaxonLabel(key));
    }),
  );
  return out;
}
