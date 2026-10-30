// Preview of an OBIS query: counts, year histogram, top species and datasets, basis
// of record (five small requests in parallel), then the ledger base and one
// /statistics call per active filter OBIS can express.

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

const ALL_FILTERS: FilterId[] = [
  'basisOfRecord',
  'uncertainty',
  'geospatialIssues',
  'introduced',
  'presentOnly',
  'years',
  'depth',
  'datasets',
];

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
    baseTotal: 0,
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

/** What the second preview step adds: the ledger base and server-side filter impact. */
export type ObisPreviewImpact = Pick<PreviewSummary, 'baseTotal' | 'filterImpact'>;

/** The two halves of an OBIS preview: the fast summary and the ledger counts that follow it. */
export interface ObisPreviewParts {
  summary: Promise<PreviewSummary>;
  impact: Promise<ObisPreviewImpact>;
}

/**
 * Preview in two steps. `summary` (five parallel calls) carries everything except the
 * ledger base and the server-side filter impact; `total` already subtracts records the
 * streamed basis-of-record filter will drop (exact, from the facet), and that impact is
 * in the summary. `impact` starts once the summary's statistics are in, so its
 * /statistics calls never compete with the summary for connections. Uncertainty impact
 * is unknown, so it has no `filterImpact` key.
 */
export function previewObisParts(query: OccurrenceQuery, signal?: AbortSignal): ObisPreviewParts {
  const raw = summarize(query, signal);
  const summary = raw.then((r) => r.summary);
  const impact = raw.then(async ({ summary: s, records, ids }) => {
    if (!ids) return { baseTotal: s.total, filterImpact: {} };
    const filters = serverFilters(query);
    if (filters.length === 0) return { baseTotal: s.baseTotal, filterImpact: {} };
    const [baseStats, ...impacts] = await Promise.all([
      obisStatistics(obisParams(query, { taxonIds: ids, omit: ALL_FILTERS }), signal),
      ...filters.map((id) => obisStatistics(obisParams(query, { taxonIds: ids, omit: [id] }), signal)),
    ]);
    const filterImpact: PreviewSummary['filterImpact'] = {};
    filters.forEach((id, i) => {
      filterImpact[id] = Math.max(0, impacts[i].records - records);
    });
    return { baseTotal: Math.max(records, baseStats.records), filterImpact };
  });
  // The caller may only await `summary`; never leave a rejection unhandled.
  impact.catch(() => {});
  return { summary, impact };
}

async function summarize(
  query: OccurrenceQuery,
  signal?: AbortSignal,
): Promise<{ summary: PreviewSummary; records: number; ids: number[] | null }> {
  const taxa = await resolveQueryTaxa(query, signal);
  if (taxa.empty) {
    return { summary: emptyObisPreview(), records: 0, ids: null };
  }
  const params = obisParams(query, { taxonIds: taxa.ids });
  const filtered = serverFilters(query).length > 0;

  const [stats, years, checklist, datasets, facet] = await Promise.all([
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
  ]);

  const basisOfRecord = basisBuckets(facet.results.basisOfRecord ?? []);
  const filterImpact: PreviewSummary['filterImpact'] = {};
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
  const summary: PreviewSummary = {
    source: 'obis',
    total,
    // Without a server-side filter the base is the server count (basis of record included).
    ...(!filtered && { baseTotal: stats.records }),
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
  return { summary, records: stats.records, ids: taxa.ids };
}

/** Summary and impact together, e.g. for scripts and tests. */
export async function previewObis(
  query: OccurrenceQuery,
  signal?: AbortSignal,
): Promise<PreviewSummary> {
  const parts = previewObisParts(query, signal);
  const [summary, impact] = await Promise.all([parts.summary, parts.impact]);
  return {
    ...summary,
    ...(impact.baseTotal != null && { baseTotal: impact.baseTotal }),
    filterImpact: { ...summary.filterImpact, ...impact.filterImpact },
  };
}
