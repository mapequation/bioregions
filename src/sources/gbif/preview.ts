// GBIF preview: one graphql.gbif.org request returns totals, species/dataset counts,
// year histogram, uncertainty stats, top facets, and the per-filter impact counts.

import type { FacetBucket, FilterId, OccurrenceQuery, PreviewSummary } from '../types';
import { gbifGraphql } from './graphql';
import { gbifPredicate, type GraphqlPredicate } from './predicate';

/** Filters whose impact the preview measures, in display order. */
export const PREVIEW_FILTERS: FilterId[] = [
  'basisOfRecord',
  'uncertainty',
  'geospatialIssues',
  'introduced',
  'presentOnly',
  'years',
  'depth',
];

const BASIS_OF_RECORD_LABELS: Record<string, string> = {
  PRESERVED_SPECIMEN: 'Preserved specimen',
  HUMAN_OBSERVATION: 'Human observation',
  MACHINE_OBSERVATION: 'Machine observation',
  OCCURRENCE: 'Occurrence (unspecified)',
  MATERIAL_SAMPLE: 'Material sample',
  MATERIAL_CITATION: 'Material citation',
  OBSERVATION: 'Observation',
  LIVING_SPECIMEN: 'Living specimen',
  FOSSIL_SPECIMEN: 'Fossil specimen',
};

/** Readable label for a basis of record enum, e.g. HUMAN_OBSERVATION -> "Human observation". */
export function basisOfRecordLabel(key: string): string {
  return BASIS_OF_RECORD_LABELS[key] ?? sentenceCase(key);
}

const ISSUE_LABELS: Record<string, string> = {
  TAXON_MATCH_HIGHERRANK: 'Taxon matched to a higher rank',
  TAXON_MATCH_FUZZY: 'Fuzzy taxon match',
  TAXON_MATCH_NONE: 'No taxon match',
  TAXON_MATCH_AGGREGATE: 'Taxon matched to an aggregate',
};

/** Tokens kept upper case by `sentenceCase`. */
const ACRONYMS = new Set(['WGS84', 'ID', 'IDS', 'URI', 'URL', 'GBIF', 'ISO', 'UTM', 'DNA']);

function sentenceCase(key: string): string {
  const words = key
    .split('_')
    .filter(Boolean)
    .map((w) => (ACRONYMS.has(w) ? w : w.toLowerCase()));
  if (words.length === 0) {
    return key;
  }
  const [first, ...rest] = words;
  return [first.charAt(0).toUpperCase() + first.slice(1), ...rest].join(' ');
}

/** Readable label for a GBIF interpretation issue, e.g. COORDINATE_ROUNDED -> "Coordinate rounded". */
export function issueLabel(key: string): string {
  return ISSUE_LABELS[key] ?? sentenceCase(key);
}

let regionNames: Intl.DisplayNames | null | undefined;

/** English country name for an ISO 3166-1 alpha-2 code, or the code itself. */
export function countryLabel(code: string): string {
  if (regionNames === undefined) {
    try {
      regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
    } catch {
      regionNames = null;
    }
  }
  try {
    return regionNames?.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

/** Filters that change the predicate for this query (omitting them changes the result). */
export function activeGbifFilters(query: OccurrenceQuery): FilterId[] {
  const full = JSON.stringify(gbifPredicate(query));
  return PREVIEW_FILTERS.filter(
    (id) => JSON.stringify(gbifPredicate(query, { omit: [id] })) !== full,
  );
}

interface RawBucket {
  key: string;
  count: number;
  label?: string | null;
}

interface MainResult {
  documents: { total: number };
  cardinality: { speciesKey: number | null; datasetKey: number | null } | null;
  stats: {
    year: { min: number | null; max: number | null } | null;
    coordinateUncertaintyInMeters: {
      min: number | null;
      max: number | null;
      avg: number | null;
    } | null;
  } | null;
  histogram: { year: { buckets: RawBucket[] } | null } | null;
  facet: {
    basisOfRecord: RawBucket[] | null;
    issue: RawBucket[] | null;
    countryCode: RawBucket[] | null;
    speciesKey: RawBucket[] | null;
    datasetKey: RawBucket[] | null;
  } | null;
}

type PreviewResponse = { main: MainResult } & Record<string, { documents: { total: number } }>;

const MAIN_FIELDS = `
    documents(size: 0) { total }
    cardinality { speciesKey datasetKey }
    stats {
      year { min max }
      coordinateUncertaintyInMeters { min max avg }
    }
    histogram { year(interval: 1) { buckets { key count } } }
    facet {
      basisOfRecord(size: 10) { key count }
      issue(size: 12) { key count }
      countryCode(size: 12) { key count }
      speciesKey(size: 12) { key count label }
      datasetKey(size: 12) { key count label }
    }`;

/** The GraphQL document and variables for a preview; exported for tests and debugging. */
export function buildPreviewRequest(query: OccurrenceQuery): {
  document: string;
  variables: Record<string, GraphqlPredicate>;
  filters: FilterId[];
} {
  const filters = activeGbifFilters(query);
  const variables: Record<string, GraphqlPredicate> = { p: gbifPredicate(query) };
  const params = ['$p: Predicate'];
  const aliases: string[] = [];
  for (const id of filters) {
    variables[`p_${id}`] = gbifPredicate(query, { omit: [id] });
    params.push(`$p_${id}: Predicate`);
    aliases.push(`  f_${id}: occurrenceSearch(predicate: $p_${id}) { documents(size: 0) { total } }`);
  }
  const document = [
    `query Preview(${params.join(', ')}) {`,
    `  main: occurrenceSearch(predicate: $p) {${MAIN_FIELDS}\n  }`,
    ...aliases,
    '}',
  ].join('\n');
  return { document, variables, filters };
}

const buckets = (raw: RawBucket[] | null | undefined, label: (b: RawBucket) => string) =>
  (raw ?? []).map((b): FacetBucket => ({ key: String(b.key), label: label(b), count: b.count }));

/** Summarize what a query returns from GBIF, in a single GraphQL request. */
export async function previewGbif(
  query: OccurrenceQuery,
  signal?: AbortSignal,
): Promise<PreviewSummary> {
  const { document, variables, filters } = buildPreviewRequest(query);
  const data = await gbifGraphql<PreviewResponse>(document, variables, { signal });
  const main = data.main;
  const total = main.documents.total;

  const filterImpact: PreviewSummary['filterImpact'] = {};
  for (const id of filters) {
    const count = data[`f_${id}`]?.documents.total;
    if (typeof count === 'number') {
      filterImpact[id] = Math.max(0, count - total);
    }
  }

  const years = (main.histogram?.year?.buckets ?? [])
    .map((b) => ({ year: Math.round(Number(b.key)), count: b.count }))
    .filter((b) => Number.isFinite(b.year) && b.count > 0)
    .sort((a, b) => a.year - b.year);

  const yearStats = main.stats?.year;
  const yearRange: [number, number] | null =
    yearStats?.min != null && yearStats.max != null
      ? [Math.round(yearStats.min), Math.round(yearStats.max)]
      : years.length > 0
        ? [years[0].year, years[years.length - 1].year]
        : null;

  const unc = main.stats?.coordinateUncertaintyInMeters;
  const uncertainty =
    unc?.min != null && unc.max != null && unc.avg != null
      ? { min: unc.min, max: unc.max, avg: unc.avg }
      : null;

  const facet = main.facet;
  return {
    source: 'gbif',
    total,
    species: main.cardinality?.speciesKey ?? null,
    datasets: main.cardinality?.datasetKey ?? null,
    yearRange,
    years,
    basisOfRecord: buckets(facet?.basisOfRecord, (b) => basisOfRecordLabel(b.key)),
    topSpecies: buckets(facet?.speciesKey, (b) => b.label || `Species ${b.key}`),
    topDatasets: buckets(facet?.datasetKey, (b) => b.label || b.key),
    countries: buckets(facet?.countryCode, (b) => countryLabel(b.key)),
    issues: buckets(facet?.issue, (b) => issueLabel(b.key)),
    uncertainty,
    filterImpact,
  };
}
