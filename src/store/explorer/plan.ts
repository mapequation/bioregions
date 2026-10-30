// Load planning for the explorer: per-source stream plans with per-species counts,
// the minimum-records-per-species filter, and the load size estimate.
import { toSpeciesName } from '../../sources/clean';
import { GBIF_MAX_DOCUMENTS } from '../../sources/gbif/graphql';
import { type GbifPlanDetail, BYTES_PER_RECORD, planGbif, planRequests } from '../../sources/gbif/stream';
import { fetchJson } from '../../sources/http';
import { supportsObis } from '../../sources/obis/params';
import { obisUrl } from '../../sources/obis/preview';
import { OBIS_BYTES_PER_RECORD, OBIS_PAGE_SIZE, type ObisPlanDetail, planObis } from '../../sources/obis/stream';
import type { FacetBucket, OccurrenceQuery, PreviewSummary, SourceId, StreamPlan } from '../../sources/types';
import type { Estimate } from './types';

/** OBIS checklist page size and the most pages fetched for per-species counts. */
export const CHECKLIST_PAGE_SIZE = 1000;
export const MAX_CHECKLIST_PAGES = 20;

/**
 * Throughput model for the time estimate, from live runs (2026-10): a GBIF search
 * request (up to 6000 records) takes ~4.5 s (Callitrichidae, Neotropic: 16k records
 * in 3 requests, 5.2 s) and an OBIS page (5000 records) ~3 s; both sources run four
 * requests at a time, and planning costs about a second.
 */
export const SECONDS_PER_REQUEST: Record<SourceId, number> = { gbif: 4.5, obis: 3 };
export const STREAM_CONCURRENCY = 4;
const PLAN_SECONDS = 1;

/** `StreamPlan.detail` for OBIS after planning here: the plan's own detail plus low-count species. */
export interface ObisExplorerDetail extends ObisPlanDetail {
  /** Canonical names of species below the minimum records per species (dropped while cleaning). */
  lowCountNames?: string[];
}

/** Per-species counts from a GBIF plan, largest first. */
export function gbifSpeciesCounts(detail: GbifPlanDetail): FacetBucket[] {
  return detail.species
    .map((s) => ({ key: String(s.key), label: s.name, count: s.count }))
    .sort((a, b) => b.count - a.count);
}

/** Request count for a GBIF species list (mirrors `planGbif`). */
export function gbifRequests(species: { count: number }[]): number {
  const small = species.filter((s) => s.count <= GBIF_MAX_DOCUMENTS);
  const large = species.filter((s) => s.count > GBIF_MAX_DOCUMENTS);
  const largeRequests = large.reduce((sum, s) => sum + 1 + Math.ceil((4 * s.count) / GBIF_MAX_DOCUMENTS), 0);
  return planRequests(small).length + largeRequests;
}

/**
 * Apply `minRecordsPerSpecies` to a plan. GBIF: species below it leave the species
 * list (they are never requested). OBIS: the checklist names below it are recorded
 * in the detail so the cleaner drops their records as 'lowCount'.
 * `speciesCounts` keeps only the species that will be loaded.
 */
export function applyMinRecords(plan: StreamPlan, min: number | undefined): StreamPlan {
  const m = min ?? 1;
  if (plan.source === 'gbif') {
    const detail = plan.detail as GbifPlanDetail;
    const species = m > 1 ? detail.species.filter((s) => s.count >= m) : detail.species;
    const expectedRecords = species.reduce((sum, s) => sum + s.count, 0);
    const filtered: GbifPlanDetail = { ...detail, species };
    return {
      ...plan,
      expectedRecords,
      expectedSpecies: species.length,
      requests: species === detail.species ? plan.requests : gbifRequests(species),
      estimatedBytes: expectedRecords * BYTES_PER_RECORD,
      speciesCounts: gbifSpeciesCounts(filtered),
      detail: filtered,
    };
  }
  const counts = plan.speciesCounts;
  if (!counts) return plan;
  const low = m > 1 ? counts.filter((b) => b.count < m) : [];
  const detail: ObisExplorerDetail = {
    ...(plan.detail as ObisPlanDetail),
    lowCountNames: low.map((b) => toSpeciesName(b.label) ?? b.label),
  };
  return {
    ...plan,
    expectedSpecies: plan.expectedSpecies == null ? null : Math.max(0, plan.expectedSpecies - low.length),
    speciesCounts: low.length > 0 ? counts.filter((b) => b.count >= m) : counts,
    // Records of low-count species are still downloaded, then dropped while cleaning.
    detail,
  };
}

interface ChecklistPage {
  total: number;
  results: { taxonID: number; scientificName: string; taxonRank?: string; records: number }[];
}

/**
 * Species-rank records per taxon from the OBIS checklist for a plan's query
 * parameters, or null when the checklist is longer than `maxPages` pages.
 */
export async function fetchObisChecklist(
  params: string,
  signal?: AbortSignal,
  maxPages = MAX_CHECKLIST_PAGES,
): Promise<FacetBucket[] | null> {
  const out: FacetBucket[] = [];
  for (let page = 0; page < maxPages; page++) {
    const p = new URLSearchParams(params);
    p.set('size', String(CHECKLIST_PAGE_SIZE));
    p.set('skip', String(page * CHECKLIST_PAGE_SIZE));
    const data = await fetchJson<ChecklistPage>(obisUrl('checklist', p), { signal });
    for (const t of data.results) {
      if (t.taxonRank === 'Species' && t.records > 0) {
        out.push({ key: String(t.taxonID), label: t.scientificName, count: t.records });
      }
    }
    if (data.results.length < CHECKLIST_PAGE_SIZE || (page + 1) * CHECKLIST_PAGE_SIZE >= data.total) {
      return out.sort((a, b) => b.count - a.count);
    }
  }
  return null;
}

/** Unfiltered plan for one source (species counts included), or null when it cannot run the query. */
export async function planSource(
  id: SourceId,
  query: OccurrenceQuery,
  cap: number,
  signal?: AbortSignal,
): Promise<StreamPlan | null> {
  if (id === 'gbif') {
    // Call planGbif directly so `exceedsCap` reflects the cap (gbifSource.plan passes Infinity).
    const plan = await planGbif(query, { maxRecords: cap }, signal);
    return { ...plan, speciesCounts: gbifSpeciesCounts(plan.detail as GbifPlanDetail) };
  }
  if (!supportsObis(query).ok) return null;
  const plan = await planObis(query, { maxRecords: cap }, signal);
  if (plan.expectedRecords === 0) return { ...plan, speciesCounts: [] };
  const counts = await fetchObisChecklist((plan.detail as ObisPlanDetail).params, signal);
  return counts ? { ...plan, speciesCounts: counts } : plan;
}

/** Canonical species names over plans (union, sorted). */
export function planSpeciesNames(plans: (StreamPlan | undefined)[]): string[] {
  const names = new Set<string>();
  for (const plan of plans) {
    for (const b of plan?.speciesCounts ?? []) {
      const name = toSpeciesName(b.label);
      if (name) names.add(name);
    }
  }
  return [...names].sort();
}

/** Seconds to stream a source's requests at the modelled rate. */
export function streamSeconds(source: SourceId, requests: number): number {
  if (requests <= 0) return 0;
  const parallel = Math.min(STREAM_CONCURRENCY, requests);
  return (requests * SECONDS_PER_REQUEST[source]) / parallel;
}

export interface EstimateInput {
  cap: number;
  /** Enabled sources with min-records-filtered plans, when the plans are ready. */
  plans: StreamPlan[] | null;
  previews: PreviewSummary[];
}

/** Load size: exact from plans, else approximate from previews; null without either. */
export function computeEstimate({ cap, plans, previews }: EstimateInput): Estimate | null {
  if (plans && plans.length > 0) {
    let records = 0;
    let bytes = 0;
    let requests = 0;
    let seconds = 0;
    for (const p of plans) {
      const n = Math.min(p.expectedRecords, cap);
      const share = p.expectedRecords > 0 ? n / p.expectedRecords : 0;
      records += p.expectedRecords;
      bytes += Math.round(p.estimatedBytes * share);
      const req = Math.ceil(p.requests * share);
      requests += req;
      seconds = Math.max(seconds, streamSeconds(p.source, req));
    }
    const known = plans.every((p) => p.speciesCounts);
    const species = known ? planSpeciesNames(plans).length : maxSpecies(plans.map((p) => p.expectedSpecies));
    return {
      records,
      species,
      bytes,
      seconds: Math.round(PLAN_SECONDS + seconds),
      requests,
      exact: true,
      overCap: records > cap,
    };
  }
  if (previews.length === 0) return null;
  let records = 0;
  let bytes = 0;
  let requests = 0;
  let seconds = 0;
  for (const p of previews) {
    const n = Math.min(p.total, cap);
    records += p.total;
    const perRequest = p.source === 'gbif' ? GBIF_MAX_DOCUMENTS / 2 : OBIS_PAGE_SIZE;
    const req = Math.ceil(n / perRequest);
    requests += req;
    bytes += n * (p.source === 'gbif' ? BYTES_PER_RECORD : OBIS_BYTES_PER_RECORD);
    seconds = Math.max(seconds, streamSeconds(p.source, req));
  }
  return {
    records,
    species: maxSpecies(previews.map((p) => p.species)),
    bytes,
    seconds: Math.round(PLAN_SECONDS + seconds),
    requests,
    exact: false,
    overCap: records > cap,
  };
}

function maxSpecies(values: (number | null)[]): number | null {
  let out: number | null = null;
  for (const v of values) if (v != null) out = Math.max(out ?? 0, v);
  return out;
}
