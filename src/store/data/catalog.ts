// The example catalog: bundled file examples (src/examples.json) and the explorer's
// query examples (exampleStudies), described with the same fields for the Examples tab.
import examplesData from '../../examples.json';
import { areaLabel } from '../../sources/regions';
import type { OccurrenceQuery } from '../../sources/types';
import { exampleStudies } from '../explorer/examples';

export interface ExampleSettings {
  minCellSize?: number;
  maxCellSize?: number;
  minCellCapacity?: number;
  maxCellCapacity?: number;
  includeTree?: boolean;
}

export type ExampleIcon = 'paw' | 'cat' | 'bird' | 'oak' | 'waves' | 'shell' | 'map';

export interface Count {
  n: number;
  approx: boolean;
}

export interface ExampleEntry {
  id: string;
  title: string;
  kind: 'files' | 'query';
  why: string;
  icon: ExampleIcon;
  taxon: string;
  rank?: string;
  region: string;
  /** 'GBIF', 'GBIF + OBIS', or the dataset origin. */
  source: string;
  records: Count;
  species: Count | null;
  /** '2.8 MB download' | 'Streams live from GBIF · ~6 MB'. */
  size: string;
  /** Date of the approximate counts (query kind). */
  asOf?: string;
  citation?: string;
  tree: { included: boolean; usedByDefault: boolean; citation?: string };
  devOnly?: boolean;
  /** Paths are app URLs under the `/bioregions` base, as the old ExampleStore built them. */
  files?: { species: string; tree?: string; settings: ExampleSettings };
  query?: OccurrenceQuery;
}

/** Shown where an example's source is not documented yet (owner decision 9.3). */
export const EXAMPLE_CITATION_PLACEHOLDER = 'Source: Infomap Bioregions example data';

/** Why each query example is interesting, and its icon (keyed by SavedQuery id). */
export const EXAMPLE_NOTES: Record<string, { why: string; icon: ExampleIcon }> = {
  'example-marmosets': { why: 'Do Amazonian rivers split the regions? A classic barrier test.', icon: 'paw' },
  'example-cats': { why: 'One family on every continent: do the classic realms emerge?', icon: 'cat' },
  'example-hummingbirds': { why: 'Steep turnover along the Andes, from museum specimens only.', icon: 'bird' },
  'example-oaks': { why: 'Oak diversity peaks in Mexico. Where do the floras meet?', icon: 'oak' },
  'example-dolphins': { why: 'Merges GBIF and OBIS: shelf, slope and open-ocean provinces.', icon: 'waves' },
  'example-corals': { why: 'Merges GBIF and OBIS on the richest reefs on Earth.', icon: 'shell' },
};

/** Date of the approximate query counts below. */
export const QUERY_COUNTS_AS_OF = '2026-10-31';

/**
 * Approximate size of each query example, from one plan run per source on
 * QUERY_COUNTS_AS_OF: records summed over sources (before cross-source dedupe), the
 * larger per-source species count, and the estimated transfer in bytes.
 */
const QUERY_COUNTS: Record<string, { records: number; species: number; bytes: number }> = {
  'example-marmosets': { records: 16_000, species: 49, bytes: 2_700_000 },
  'example-cats': { records: 580_000, species: 44, bytes: 98_000_000 },
  'example-hummingbirds': { records: 37_000, species: 254, bytes: 6_200_000 },
  'example-oaks': { records: 150_000, species: 391, bytes: 25_000_000 },
  'example-dolphins': { records: 720_000, species: 27, bytes: 170_000_000 },
  'example-corals': { records: 90_000, species: 1_017, bytes: 21_000_000 },
};

const BASE = '/bioregions';

function megabytes(bytes: number): string {
  const mb = bytes / 1e6;
  return mb < 10 ? `${Number(mb.toFixed(1))} MB` : `${Math.round(mb)} MB`;
}

interface FileExampleJson {
  id: string;
  name: string;
  speciesFile: string;
  treeFile?: string;
  size: string;
  devOnly?: boolean;
  taxon: string;
  rank?: string;
  region: string;
  source: string;
  records: number;
  species: number;
  citation?: string;
  treeCitation?: string;
  why: string;
  icon: string;
  settings: ExampleSettings;
}

function fileEntry(e: FileExampleJson): ExampleEntry {
  const included = Boolean(e.treeFile);
  return {
    id: e.id,
    title: e.name,
    kind: 'files',
    why: e.why,
    icon: e.icon as ExampleIcon,
    taxon: e.taxon,
    ...(e.rank ? { rank: e.rank } : {}),
    region: e.region,
    source: e.source,
    records: { n: e.records, approx: false },
    species: { n: e.species, approx: false },
    size: `${e.size} download`,
    citation: e.citation || EXAMPLE_CITATION_PLACEHOLDER,
    tree: {
      included,
      usedByDefault: included && e.settings.includeTree !== false,
      ...(e.treeCitation ? { citation: e.treeCitation } : {}),
    },
    ...(e.devOnly ? { devOnly: true } : {}),
    files: {
      species: `${BASE}/${e.speciesFile}`,
      ...(e.treeFile ? { tree: `${BASE}/${e.treeFile}` } : {}),
      settings: e.settings,
    },
  };
}

/** Sources that serve a query: OBIS only when a taxon has an AphiaID. */
function sourceLabel(q: OccurrenceQuery): string {
  const out: string[] = [];
  if (q.sources.gbif) out.push('GBIF');
  if (q.sources.obis && q.taxa.some((t) => t.obisId != null)) out.push('OBIS');
  return out.join(' + ');
}

function queryEntries(): ExampleEntry[] {
  return exampleStudies().map((s) => {
    const q = s.query;
    const taxon = q.taxa[0];
    const counts = QUERY_COUNTS[s.id];
    const note = EXAMPLE_NOTES[s.id];
    const source = sourceLabel(q);
    return {
      id: s.id,
      title: s.name,
      kind: 'query',
      why: note?.why ?? '',
      icon: note?.icon ?? 'map',
      taxon: q.taxa.map((t) => t.name).join(', '),
      ...(taxon?.rank ? { rank: taxon.rank.toLowerCase() } : {}),
      region: areaLabel(q.area),
      source,
      records: { n: counts?.records ?? 0, approx: true },
      species: counts ? { n: counts.species, approx: true } : null,
      size: `Streams live from ${source.replace(' + ', ' and ')}${counts ? ` · ~${megabytes(counts.bytes)}` : ''}`,
      asOf: QUERY_COUNTS_AS_OF,
      tree: { included: false, usedByDefault: false },
      query: q,
    };
  });
}

/**
 * Every example, bundled files first. `devOnly` entries are left out unless `dev`
 * (the old ExampleStore showed them only in development).
 */
export function exampleCatalog(dev: boolean = process.env.NODE_ENV === 'development'): ExampleEntry[] {
  const files = (examplesData as FileExampleJson[]).map(fileEntry);
  return [...files, ...queryEntries()].filter((e) => dev || !e.devOnly);
}
