// Plain-text pieces of an example card (§5.3), kept pure so they can be tested without a DOM.
import type { ExampleEntry } from '../../../store/data/catalog';

export type TreeState = 'used' | 'notUsed' | 'none';

export interface TreeBadge {
  state: TreeState;
  label: string;
  palette: 'green' | 'orange' | 'gray';
}

/** The tree badge in its three states. */
export function treeBadge(tree: ExampleEntry['tree']): TreeBadge {
  if (tree.included && tree.usedByDefault) return { state: 'used', label: 'Includes a tree', palette: 'green' };
  if (tree.included) return { state: 'notUsed', label: 'Includes a tree · not used by default', palette: 'orange' };
  return { state: 'none', label: 'No tree · find one in Phylogeny', palette: 'gray' };
}

const fmt = (n: number) => n.toLocaleString('en-US');

/** "~40,000 records · 38 species", or exact counts without the tilde. */
export function countsText(entry: Pick<ExampleEntry, 'records' | 'species'>): string {
  const { records, species } = entry;
  if (records.n === 0 && records.approx) return 'Record count not estimated';
  const parts = [`${records.approx ? '~' : ''}${fmt(records.n)} records`];
  if (species) parts.push(`${species.approx ? '~' : ''}${fmt(species.n)} species`);
  return parts.join(' · ');
}

/** The caveat under approximate counts, or null for exact ones. */
export function approxNote(entry: Pick<ExampleEntry, 'records' | 'asOf'>): string | null {
  if (!entry.records.approx) return null;
  return entry.asOf ? `Estimated ${entry.asOf}; live count may differ` : 'Live count may differ';
}

/** "taxon (rank) · region". */
export function scopeText(entry: Pick<ExampleEntry, 'taxon' | 'rank' | 'region'>): string {
  return `${entry.taxon}${entry.rank ? ` (${entry.rank})` : ''} · ${entry.region}`;
}

/** One badge per source: 'GBIF + OBIS' becomes two. */
export function sourceBadges(source: string): string[] {
  return source
    .split(' + ')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The citation shown under "Cite". Query examples cite the records they load, after loading. */
export function citationText(entry: Pick<ExampleEntry, 'kind' | 'citation' | 'source'>): string {
  if (entry.citation) return entry.citation;
  if (entry.kind === 'query')
    return `Records stream live from ${entry.source.replace(' + ', ' and ')}. After loading, the Cite tab lists the citations for what you loaded.`;
  return '';
}
