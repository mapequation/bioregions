// Explain a clade (MRCA) whose name differs from the taxon the user queried.
import type { Clade } from '../explorer/types';

/** Rank suffixes of zoological (ICZN) and botanical (ICN) names above genus, longest first. */
const RANK_SUFFIXES = ['oideae', 'oidea', 'aceae', 'idae', 'inae', 'ales', 'eae', 'ini', 'ina'];

/** 'Callitrichidae' -> 'callitrich'; null for a name without a rank suffix. */
function stem(name: string): string | null {
  const lower = name.trim().toLowerCase();
  const suffix = RANK_SUFFIXES.find((s) => lower.endsWith(s) && lower.length > s.length + 2);
  return suffix ? lower.slice(0, -suffix.length) : null;
}

const SPECIES_RANKS = new Set(['SPECIES', 'SUBSPECIES', 'VARIETY', 'FORM', 'SUBVARIETY', 'SUBFORM']);

/**
 * A sentence for the clade card when the single higher taxon the user queried has a
 * different name on Open Tree: the same group at another rank ('Callitrichidae' as
 * the subfamily 'Callitrichinae'), or a different clade. Null when the names agree
 * or the query is not one higher taxon.
 */
export function cladeNameNote(queried: { name: string; rank?: string }[], clade: Pick<Clade, 'name' | 'rank'>): string | null {
  const higher = queried.filter((t) => !SPECIES_RANKS.has((t.rank ?? '').toUpperCase()));
  if (higher.length !== 1 || queried.length !== 1) return null;
  const taxon = higher[0];
  if (taxon.name.trim().toLowerCase() === clade.name.trim().toLowerCase()) return null;
  const rank = clade.rank && clade.rank !== 'no rank' ? clade.rank.toLowerCase() : null;
  const theirs = taxon.rank ? ` (${taxon.rank.toLowerCase()})` : '';
  const a = stem(taxon.name);
  if (a && a === stem(clade.name)) {
    return `Open Tree treats ${taxon.name} as ${rank ? `the ${rank} ` : ''}${clade.name}; same group, different rank.`;
  }
  return `The smallest Open Tree clade with all your matched species is ${clade.name}${rank ? ` (${rank})` : ''}, not ${taxon.name}${theirs}.`;
}
