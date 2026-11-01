// OccurrenceQuery -> OBIS API v3 query parameters, plus what OBIS cannot express.
//
// Verified live (2026-10-30) against https://api.obis.org/v3:
// - `taxonid` takes comma-separated AphiaIDs and returns their union.
// - `geometry` accepts WKT POLYGON and MULTIPOLYGON, so antimeridian boxes (a
//   MULTIPOLYGON from `bboxToWkt`) need no request splitting.
// - Absences are excluded by default; `absence=include` adds them.
// - Dropped records (invalid coordinates etc.) are excluded by default.
// - `exclude=<flags>` drops records with any of the QC flags. `NO_DEPTH` is set on
//   most records, so only position-related flags are excluded.
// - There is no server-side filter for basisOfRecord, coordinate uncertainty,
//   establishment means or country; the first two are applied while streaming.

import { areaToWkt } from '../geo';
import type { BasisOfRecord, FilterId, OccurrenceQuery, Supports } from '../types';

export const OBIS_API = 'https://api.obis.org/v3';

/** QC flags that indicate a wrong position; excluded by `excludeGeospatialIssues`. */
export const OBIS_GEOSPATIAL_FLAGS = ['ON_LAND', 'DEPTH_EXCEEDS_BATH'];

export const ALL_BASIS: readonly BasisOfRecord[] = [
  'PRESERVED_SPECIMEN',
  'HUMAN_OBSERVATION',
  'MACHINE_OBSERVATION',
  'OCCURRENCE',
  'MATERIAL_SAMPLE',
  'MATERIAL_CITATION',
  'OBSERVATION',
  'LIVING_SPECIMEN',
  'FOSSIL_SPECIMEN',
];

export interface ObisParamOptions {
  /** Filters to leave out, e.g. to measure their impact. */
  omit?: FilterId[];
  /** Resolved AphiaIDs; defaults to the `obisId` of each query taxon. */
  taxonIds?: number[];
}

/** AphiaIDs already present on the query taxa. */
export function queryTaxonIds(query: OccurrenceQuery): number[] {
  return query.taxa.map((t) => t.obisId).filter((id): id is number => id != null);
}

/** The basis-of-record values to keep, or null when the filter is inactive. */
export function activeBasisFilter(query: OccurrenceQuery): BasisOfRecord[] | null {
  const basis = query.quality.basisOfRecord;
  if (basis.length === 0 || ALL_BASIS.every((b) => basis.includes(b))) {
    return null;
  }
  return basis;
}

/**
 * OBIS query parameters for the server-side part of the query. Country areas are
 * left out (OBIS cannot filter them); check `supportsObis` first.
 */
export function obisParams(
  query: OccurrenceQuery,
  { omit = [], taxonIds }: ObisParamOptions = {},
): URLSearchParams {
  const skip = new Set(omit);
  const params = new URLSearchParams();
  const ids = taxonIds ?? queryTaxonIds(query);
  if (ids.length > 0) {
    params.set('taxonid', [...new Set(ids)].join(','));
  }

  const wkt = areaToWkt(query.area);
  if (wkt) {
    params.set('geometry', wkt);
  }

  const [from, to] = query.years;
  if (!skip.has('years')) {
    if (from != null) params.set('startdate', `${from}-01-01`);
    if (to != null) params.set('enddate', `${to}-12-31`);
  }

  const [minDepth, maxDepth] = query.depth;
  if (!skip.has('depth')) {
    if (minDepth != null) params.set('startdepth', String(minDepth));
    if (maxDepth != null) params.set('enddepth', String(maxDepth));
  }

  const { quality } = query;
  params.set('absence', quality.presentOnly && !skip.has('presentOnly') ? 'false' : 'include');

  if (quality.excludeGeospatialIssues && !skip.has('geospatialIssues')) {
    params.set('exclude', OBIS_GEOSPATIAL_FLAGS.join(','));
  }
  return params;
}

/** Whether OBIS can run the query at all. */
export function supportsObis(query: OccurrenceQuery): Supports {
  if (query.area.kind === 'countries' && query.area.codes.length > 0) {
    return {
      ok: false,
      reason: 'OBIS cannot filter by country. Draw a box or pick a region instead.',
    };
  }
  if (query.taxa.length === 0 && query.area.kind === 'world') {
    return { ok: false, reason: 'Add a taxon or limit the area to query OBIS.' };
  }
  return { ok: true };
}

/** Human-readable notes on how OBIS handles this query differently from GBIF. */
export function obisCaveats(query: OccurrenceQuery): string[] {
  const notes: string[] = [];
  const { quality } = query;
  if (query.area.kind === 'countries' && query.area.codes.length > 0) {
    notes.push('OBIS cannot filter by country; without another area it would search worldwide.');
  }
  const byName = query.taxa.filter((t) => t.obisId == null).map((t) => t.name);
  if (byName.length > 0) {
    notes.push(`Matched in WoRMS by name: ${byName.join(', ')}.`);
  }
  if (activeBasisFilter(query)) {
    notes.push('OBIS cannot filter basis of record on the server; records are filtered while streaming.');
  }
  if (quality.maxUncertaintyMeters != null) {
    notes.push(
      'OBIS cannot filter coordinate uncertainty on the server; records are filtered while streaming, so the preview cannot show the impact.',
    );
  }
  if (quality.excludeGeospatialIssues) {
    notes.push(`Geospatial issues in OBIS: records flagged ${OBIS_GEOSPATIAL_FLAGS.join(' or ')} are excluded.`);
  }
  if (quality.excludeIntroduced) {
    notes.push('OBIS has no establishment-means filter; introduced records are not excluded.');
  }
  return notes;
}
