// Pure name-matching helpers for PhyloStore: turn Open Tree TNRS results into one
// row per dataset species, and the lookups used to join tree tips back to them.
import type { NameMatch } from '@/phylo/otol';
import { normalizeSpeciesName } from '@/utils/names';
import type { MatchStatus, NameMatchRow } from '../explorer/types';

/** Unique, trimmed, non-empty names in first-seen order. */
export function uniqueNames(names: Iterable<string>): string[] {
  const seen = new Set<string>();
  for (const raw of names) {
    const name = raw.trim();
    if (name) seen.add(name);
  }
  return [...seen];
}

/**
 * One row per dataset name. Exact accepted matches are 'matched', exact synonym
 * matches 'synonym', fuzzy (misspelling-tolerant) matches 'ambiguous' (kept as a
 * suggestion, not joined to trees) and no match 'unmatched'. When several dataset
 * names resolve to the same OTT taxon, only one can be a tree tip: an accepted-name
 * match wins over synonyms (then the first), and the others become 'ambiguous'.
 */
export function toMatchRows(names: string[], matches: NameMatch[]): NameMatchRow[] {
  const byInput = new Map(matches.map((m) => [m.input.trim(), m]));
  const rows: NameMatchRow[] = names.map((datasetName) => {
    const m = byInput.get(datasetName.trim());
    if (!m || m.ottId === undefined) {
      return { datasetName, status: 'unmatched' };
    }
    const status: MatchStatus = m.isApproximate ? 'ambiguous' : m.isSynonym ? 'synonym' : 'matched';
    return { datasetName, status, ottId: m.ottId, ottName: m.ottName };
  });

  const winner = new Map<number, number>();
  rows.forEach((row, i) => {
    if (row.ottId === undefined || row.status === 'ambiguous') return;
    const current = winner.get(row.ottId);
    if (current === undefined || (rows[current].status === 'synonym' && row.status === 'matched')) {
      winner.set(row.ottId, i);
    }
  });
  return rows.map((row, i) =>
    row.ottId !== undefined && row.status !== 'ambiguous' && winner.get(row.ottId) !== i
      ? { ...row, status: 'ambiguous' }
      : row,
  );
}

/** Rows that join to tree tips (matched or synonym, with an OTT id). */
export function joinableRows(rows: NameMatchRow[]): (NameMatchRow & { ottId: number })[] {
  return rows.filter(
    (row): row is NameMatchRow & { ottId: number } =>
      row.ottId !== undefined && (row.status === 'matched' || row.status === 'synonym'),
  );
}

/** OTT id -> dataset name, for joinable rows. */
export function ottToDatasetMap(rows: NameMatchRow[]): Map<number, string> {
  return new Map(joinableRows(rows).map((row) => [row.ottId, row.datasetName]));
}

/** Normalized dataset name or accepted OTT name -> dataset name, for name-based tip joins. */
export function nameToDatasetMap(rows: NameMatchRow[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of joinableRows(rows)) {
    map.set(normalizeSpeciesName(row.datasetName), row.datasetName);
  }
  for (const row of joinableRows(rows)) {
    if (row.ottName) {
      const key = normalizeSpeciesName(row.ottName);
      if (!map.has(key)) map.set(key, row.datasetName);
    }
  }
  return map;
}

/** Matched, synonym and unmatched (including ambiguous) counts. */
export function matchCounts(rows: NameMatchRow[]): { matched: number; synonym: number; unmatched: number } {
  const counts = { matched: 0, synonym: 0, unmatched: 0 };
  for (const row of rows) {
    if (row.status === 'matched') counts.matched++;
    else if (row.status === 'synonym') counts.synonym++;
    else counts.unmatched++;
  }
  return counts;
}

/**
 * Newline-separated dataset names with a status. 'unmatched' includes ambiguous
 * names, matching the Unmatched count; 'ambiguous' lists only those.
 */
export function namesWithStatus(rows: NameMatchRow[], status: MatchStatus): string {
  return rows
    .filter((row) => row.status === status || (status === 'unmatched' && row.status === 'ambiguous'))
    .map((row) => row.datasetName)
    .join('\n');
}

/**
 * Up to `max` genera (first word of the accepted name) with the most joinable
 * species, at least `min` each, for finding study trees below the clade.
 */
export function largestGenera(rows: NameMatchRow[], max = 3, min = 2): string[] {
  const counts = new Map<string, number>();
  for (const row of joinableRows(rows)) {
    const genus = (row.ottName ?? row.datasetName).split(/\s+/)[0];
    if (genus) counts.set(genus, (counts.get(genus) ?? 0) + 1);
  }
  return [...counts]
    .filter(([, n]) => n >= min)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([genus]) => genus);
}
