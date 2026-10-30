// Preview of an OBIS query: counts, year histogram, top species and datasets, basis
// of record, and per-filter impact. About five small requests in parallel (~0.7 s),
// plus one /statistics call per active filter OBIS can express.

import { fetchJson } from '../http';
import type { FacetBucket, FilterId, OccurrenceQuery, PreviewSummary } from '../types';
import { normalizeObisBasis } from './records';
import { OBIS_API, activeBasisFilter, obisParams } from './params';
import { resolveQueryTaxa } from './taxa';

export interface ObisStatistics {
  records: number;
  species: number;
  taxa?: number;
  datasets: number;
  yearrange: [number | null, number | null];
}

interface ChecklistItem {
  taxonID: number;
  scientificName: string;
  taxonRank?: string;
  records: number;
}

interface DatasetItem {
  id: string;
  title?: string;
  /** Records matching the query; a string in the response. */
  records: string | number;
}

type FacetResponse = { results: Record<string, { key: string; records: number }[]> };

/** Number of top species and datasets in the preview. */
export const TOP_N = 12;

export function obisUrl(path: string, params: URLSearchParams): string {
  const search = params.toString();
  return `${OBIS_API}/${path}${search ? `?${search}` : ''}`;
}

export function obisStatistics(params: URLSearchParams, signal?: AbortSignal) {
  return fetchJson<ObisStatistics>(obisUrl('statistics', params), { signal });
}

const withParam = (params: URLSearchParams, key: string, value: string) => {
  const next = new URLSearchParams(params);
  next.set(key, value);
  return next;
};

/** Filters that are active and that OBIS applies on the server. */
function serverFilters(query: OccurrenceQuery): FilterId[] {
  const active: FilterId[] = [];
  if (query.years.some((y) => y != null)) active.push('years');
  if (query.depth.some((d) => d != null)) active.push('depth');
  if (query.quality.presentOnly) active.push('presentOnly');
  if (query.quality.excludeGeospatialIssues) active.push('geospatialIssues');
  return active;
}

const BASIS_LABELS: Record<string, string> = {
  PRESERVED_SPECIMEN: 'Preserved specimen',
  HUMAN_OBSERVATION: 'Human observation',
  MACHINE_OBSERVATION: 'Machine observation',
  OCCURRENCE: 'Occurrence',
  MATERIAL_SAMPLE: 'Material sample',
  MATERIAL_CITATION: 'Material citation',
  OBSERVATION: 'Observation',
  LIVING_SPECIMEN: 'Living specimen',
  FOSSIL_SPECIMEN: 'Fossil specimen',
};

/** Merge OBIS's free-text basisOfRecord facet into the GBIF vocabulary. */
export function basisBuckets(facet: { key: string; records: number }[]): FacetBucket[] {
  const counts = new Map<string, number>();
  for (const { key, records } of facet) {
    const basis = normalizeObisBasis(key);
    counts.set(basis, (counts.get(basis) ?? 0) + records);
  }
  return [...counts]
    .map(([key, count]) => ({ key, label: BASIS_LABELS[key] ?? key, count }))
    .sort((a, b) => b.count - a.count);
}

export function emptyObisPreview(): PreviewSummary {
  return {
    source: 'obis',
    total: 0,
    species: 0,
    datasets: 0,
    yearRange: null,
    years: [],
    basisOfRecord: [],
    topSpecies: [],
    topDatasets: [],
    countries: [],
    issues: [],
    uncertainty: null,
    filterImpact: {},
  };
}

/**
 * Preview summary. `total` already subtracts records the streamed basis-of-record
 * filter will drop (exact, from the facet); the other figures describe the
 * server-side query. Uncertainty impact is unknown, so it has no `filterImpact` key.
 */
export async function previewObis(
  query: OccurrenceQuery,
  signal?: AbortSignal,
): Promise<PreviewSummary> {
  const taxa = await resolveQueryTaxa(query, signal);
  if (taxa.empty) {
    return emptyObisPreview();
  }
  const params = obisParams(query, { taxonIds: taxa.ids });
  const filters = serverFilters(query);

  const [stats, years, checklist, datasets, facet, ...impacts] = await Promise.all([
    obisStatistics(params, signal),
    fetchJson<{ year: number | null; records: number }[]>(obisUrl('statistics/years', params), {
      signal,
    }),
    // Higher taxa are listed too; ask for more and keep the species.
    fetchJson<{ results: ChecklistItem[] }>(
      obisUrl('checklist', withParam(params, 'size', String(TOP_N * 3))),
      { signal },
    ),
    fetchJson<{ results: DatasetItem[] }>(
      obisUrl('dataset', withParam(params, 'size', String(TOP_N))),
      { signal },
    ),
    fetchJson<FacetResponse>(
      obisUrl('facet', withParam(withParam(params, 'facets', 'basisOfRecord'), 'size', '100')),
      { signal },
    ),
    ...filters.map((id) =>
      obisStatistics(obisParams(query, { taxonIds: taxa.ids, omit: [id] }), signal),
    ),
  ]);

  const basisOfRecord = basisBuckets(facet.results.basisOfRecord ?? []);
  const filterImpact: PreviewSummary['filterImpact'] = {};
  filters.forEach((id, i) => {
    filterImpact[id] = Math.max(0, impacts[i].records - stats.records);
  });

  let total = stats.records;
  const keep = activeBasisFilter(query);
  if (keep) {
    const dropped = basisOfRecord
      .filter((b) => !keep.includes(b.key as (typeof keep)[number]))
      .reduce((sum, b) => sum + b.count, 0);
    filterImpact.basisOfRecord = dropped;
    total = Math.max(0, total - dropped);
  }

  const [minYear, maxYear] = stats.yearrange ?? [null, null];
  return {
    source: 'obis',
    total,
    species: stats.species,
    datasets: stats.datasets,
    yearRange: minYear != null && maxYear != null ? [minYear, maxYear] : null,
    years: years
      .filter((y): y is { year: number; records: number } => y.year != null && y.records > 0)
      .map(({ year, records }) => ({ year, count: records }))
      .sort((a, b) => a.year - b.year),
    basisOfRecord,
    topSpecies: checklist.results
      .filter((t) => t.taxonRank === 'Species')
      .sort((a, b) => b.records - a.records)
      .slice(0, TOP_N)
      .map((t) => ({ key: String(t.taxonID), label: t.scientificName, count: t.records })),
    topDatasets: datasets.results
      .map((d) => ({ key: d.id, label: d.title ?? d.id, count: Number(d.records) || 0 }))
      .sort((a, b) => b.count - a.count),
    countries: [],
    issues: [],
    uncertainty: null,
    filterImpact,
  };
}
