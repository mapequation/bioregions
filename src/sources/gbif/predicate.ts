// OccurrenceQuery -> GBIF predicates. One neutral clause list serializes to both
// dialects: the GraphQL/search dialect (camelCase keys, `range`, `within` with
// `value`) and the download API dialect (UPPER_SNAKE keys, comparison types,
// `within` with `geometry`, `isNull` with `parameter`).

import type { FilterId, OccurrenceQuery } from '../types';
import { areaToWkt } from '../geo';

export type GbifField =
  | 'taxonKey'
  | 'speciesKey'
  | 'hasCoordinate'
  | 'hasGeospatialIssue'
  | 'basisOfRecord'
  | 'year'
  | 'coordinateUncertaintyInMeters'
  | 'establishmentMeans'
  | 'degreeOfEstablishment'
  | 'occurrenceStatus'
  | 'country'
  | 'depth'
  | 'datasetKey';

export type Clause =
  | { op: 'equals'; field: GbifField; value: string }
  | { op: 'in'; field: GbifField; values: string[] }
  | { op: 'range'; field: GbifField; gte?: number; lte?: number }
  | { op: 'within'; wkt: string }
  | { op: 'isNull'; field: GbifField }
  | { op: 'not'; clause: Clause }
  | { op: 'and' | 'or'; clauses: Clause[] };

/** establishmentMeans values that mean "not part of the native range". */
export const NON_NATIVE_ESTABLISHMENT_MEANS = [
  'introduced',
  'introducedAssistedColonisation',
  'vagrant',
];

/** degreeOfEstablishment values other than `native` (all describe non-native or kept organisms). */
export const NON_NATIVE_DEGREE_OF_ESTABLISHMENT = [
  'captive',
  'cultivated',
  'released',
  'failing',
  'casual',
  'reproducing',
  'established',
  'colonising',
  'invasive',
  'widespreadInvasive',
  'managed',
];

export const ALL_BASIS_OF_RECORD = [
  'PRESERVED_SPECIMEN',
  'HUMAN_OBSERVATION',
  'MACHINE_OBSERVATION',
  'OCCURRENCE',
  'MATERIAL_SAMPLE',
  'MATERIAL_CITATION',
  'OBSERVATION',
  'LIVING_SPECIMEN',
  'FOSSIL_SPECIMEN',
] as const;

export interface ClauseOptions {
  /** Filters to leave out, e.g. to measure their impact. */
  omit?: FilterId[];
  /** Extra clauses ANDed in, e.g. a species or spatial partition. */
  extra?: Clause[];
}

const notInOrMissing = (field: GbifField, values: string[]): Clause => ({
  op: 'or',
  clauses: [
    { op: 'isNull', field },
    { op: 'not', clause: { op: 'in', field, values } },
  ],
});

const rangeClause = (
  field: GbifField,
  [lo, hi]: [number | null, number | null],
): Clause | null =>
  lo == null && hi == null
    ? null
    : { op: 'range', field, ...(lo != null && { gte: lo }), ...(hi != null && { lte: hi }) };

/** The query as a list of clauses that are ANDed together. */
export function queryClauses(
  query: OccurrenceQuery,
  { omit = [], extra = [] }: ClauseOptions = {},
): Clause[] {
  const skip = new Set(omit);
  const clauses: Clause[] = [];
  const { quality } = query;

  const taxonKeys = query.taxa
    .map((t) => t.gbifKey)
    .filter((k): k is number => k != null)
    .map(String);
  if (taxonKeys.length > 0) {
    clauses.push({ op: 'in', field: 'taxonKey', values: taxonKeys });
  }

  clauses.push({ op: 'equals', field: 'hasCoordinate', value: 'true' });

  const wkt = areaToWkt(query.area);
  if (wkt) {
    clauses.push({ op: 'within', wkt });
  } else if (query.area.kind === 'countries' && query.area.codes.length > 0) {
    clauses.push({ op: 'in', field: 'country', values: query.area.codes });
  }

  const years = rangeClause('year', query.years);
  if (years && !skip.has('years')) {
    clauses.push(years);
  }

  const depth = rangeClause('depth', query.depth);
  if (depth && !skip.has('depth')) {
    clauses.push(depth);
  }

  const basis = quality.basisOfRecord;
  if (
    !skip.has('basisOfRecord') &&
    basis.length > 0 &&
    !ALL_BASIS_OF_RECORD.every((b) => basis.includes(b))
  ) {
    clauses.push({ op: 'in', field: 'basisOfRecord', values: [...basis] });
  }

  if (quality.maxUncertaintyMeters != null && !skip.has('uncertainty')) {
    const limit: Clause = {
      op: 'range',
      field: 'coordinateUncertaintyInMeters',
      lte: quality.maxUncertaintyMeters,
    };
    clauses.push(
      quality.keepMissingUncertainty
        ? {
            op: 'or',
            clauses: [{ op: 'isNull', field: 'coordinateUncertaintyInMeters' }, limit],
          }
        : limit,
    );
  }

  if (quality.excludeGeospatialIssues && !skip.has('geospatialIssues')) {
    clauses.push({ op: 'equals', field: 'hasGeospatialIssue', value: 'false' });
  }

  if (quality.excludeIntroduced && !skip.has('introduced')) {
    // GBIF evaluates `not` like SQL: a record without the field fails `not(in(...))`,
    // so records that say nothing about establishment must be let through explicitly.
    clauses.push(
      notInOrMissing('establishmentMeans', NON_NATIVE_ESTABLISHMENT_MEANS),
      notInOrMissing('degreeOfEstablishment', NON_NATIVE_DEGREE_OF_ESTABLISHMENT),
    );
  }

  const excluded = quality.excludeDatasets ?? [];
  if (excluded.length > 0 && !skip.has('datasets')) {
    // datasetKey is always set, so a plain `not` is safe here.
    clauses.push({ op: 'not', clause: { op: 'in', field: 'datasetKey', values: excluded } });
  }

  if (quality.presentOnly && !skip.has('presentOnly')) {
    clauses.push({ op: 'equals', field: 'occurrenceStatus', value: 'PRESENT' });
  }

  return [...clauses, ...extra];
}

// --- GraphQL / search dialect ---------------------------------------------------

export type GraphqlPredicate = Record<string, unknown>;

export function clauseToGraphql(clause: Clause): GraphqlPredicate {
  switch (clause.op) {
    case 'equals':
      return { type: 'equals', key: clause.field, value: clause.value };
    case 'in':
      return clause.values.length === 1
        ? { type: 'equals', key: clause.field, value: clause.values[0] }
        : { type: 'in', key: clause.field, values: clause.values };
    case 'range':
      return {
        type: 'range',
        key: clause.field,
        value: {
          ...(clause.gte != null && { gte: String(clause.gte) }),
          ...(clause.lte != null && { lte: String(clause.lte) }),
        },
      };
    case 'within':
      return { type: 'within', key: 'geometry', value: clause.wkt };
    case 'isNull':
      return { type: 'isNull', key: clause.field };
    case 'not':
      return { type: 'not', predicate: clauseToGraphql(clause.clause) };
    case 'and':
    case 'or':
      return { type: clause.op, predicates: clause.clauses.map(clauseToGraphql) };
  }
}

/** Predicate for `occurrenceSearch(predicate: ...)` on graphql.gbif.org. */
export function gbifPredicate(query: OccurrenceQuery, options?: ClauseOptions): GraphqlPredicate {
  return clauseToGraphql({ op: 'and', clauses: queryClauses(query, options) });
}

// --- Download API dialect -------------------------------------------------------

const DOWNLOAD_KEY: Record<GbifField, string> = {
  taxonKey: 'TAXON_KEY',
  speciesKey: 'SPECIES_KEY',
  hasCoordinate: 'HAS_COORDINATE',
  hasGeospatialIssue: 'HAS_GEOSPATIAL_ISSUE',
  basisOfRecord: 'BASIS_OF_RECORD',
  year: 'YEAR',
  coordinateUncertaintyInMeters: 'COORDINATE_UNCERTAINTY_IN_METERS',
  establishmentMeans: 'ESTABLISHMENT_MEANS',
  degreeOfEstablishment: 'DEGREE_OF_ESTABLISHMENT',
  occurrenceStatus: 'OCCURRENCE_STATUS',
  country: 'COUNTRY',
  depth: 'DEPTH',
  datasetKey: 'DATASET_KEY',
};

export type DownloadPredicate = Record<string, unknown>;

export function clauseToDownload(clause: Clause): DownloadPredicate {
  switch (clause.op) {
    case 'equals':
      return { type: 'equals', key: DOWNLOAD_KEY[clause.field], value: clause.value };
    case 'in':
      return clause.values.length === 1
        ? { type: 'equals', key: DOWNLOAD_KEY[clause.field], value: clause.values[0] }
        : { type: 'in', key: DOWNLOAD_KEY[clause.field], values: clause.values };
    case 'range': {
      const key = DOWNLOAD_KEY[clause.field];
      const parts: DownloadPredicate[] = [];
      if (clause.gte != null) {
        parts.push({ type: 'greaterThanOrEquals', key, value: String(clause.gte) });
      }
      if (clause.lte != null) {
        parts.push({ type: 'lessThanOrEquals', key, value: String(clause.lte) });
      }
      return parts.length === 1 ? parts[0] : { type: 'and', predicates: parts };
    }
    case 'within':
      return { type: 'within', geometry: clause.wkt };
    case 'isNull':
      return { type: 'isNull', parameter: DOWNLOAD_KEY[clause.field] };
    case 'not':
      return { type: 'not', predicate: clauseToDownload(clause.clause) };
    case 'and':
    case 'or':
      return { type: clause.op, predicates: clause.clauses.map(clauseToDownload) };
  }
}

/** Predicate for `POST /v1/occurrence/download/request`. */
export function gbifDownloadPredicate(query: OccurrenceQuery): DownloadPredicate {
  return clauseToDownload({ op: 'and', clauses: queryClauses(query) });
}
