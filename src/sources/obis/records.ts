// OBIS occurrence rows -> OccurrenceRecord, and the filters OBIS cannot apply on the
// server (basis of record, coordinate uncertainty).

import { normalizeSpeciesName } from '../../utils/names';
import type { BasisOfRecord, OccurrenceQuery, OccurrenceRecord } from '../types';
import { activeBasisFilter } from './params';

/** Fields requested per streamed record (~285 bytes each in JSON). */
export const OBIS_FIELDS = [
  'id',
  'species',
  'scientificName',
  'decimalLatitude',
  'decimalLongitude',
  'date_year',
  'dataset_id',
  'basisOfRecord',
  'coordinateUncertaintyInMeters',
  // Publisher-supplied and often missing (marine records outside any country).
  'countryCode',
];

export interface ObisOccurrence {
  id: string;
  /** Set only for records identified to species (or below). */
  species?: string;
  scientificName?: string;
  decimalLatitude?: number;
  decimalLongitude?: number;
  date_year?: number;
  dataset_id?: string;
  basisOfRecord?: string;
  countryCode?: string;
  coordinateUncertaintyInMeters?: number | string;
}

const BASIS_BY_KEY: Record<string, BasisOfRecord> = {
  preservedspecimen: 'PRESERVED_SPECIMEN',
  humanobservation: 'HUMAN_OBSERVATION',
  machineobservation: 'MACHINE_OBSERVATION',
  occurrence: 'OCCURRENCE',
  materialsample: 'MATERIAL_SAMPLE',
  materialentity: 'MATERIAL_SAMPLE',
  materialcitation: 'MATERIAL_CITATION',
  derivedfromliterature: 'MATERIAL_CITATION',
  observation: 'OBSERVATION',
  livingspecimen: 'LIVING_SPECIMEN',
  fossilspecimen: 'FOSSIL_SPECIMEN',
};

/**
 * OBIS passes basisOfRecord through as published ("HumanObservation",
 * "Human observation", "MATERIAL_SAMPLE", "O", ...). Map it to the GBIF vocabulary;
 * unrecognised or missing values become OCCURRENCE, as GBIF does.
 */
export function normalizeObisBasis(value: string | null | undefined): BasisOfRecord {
  const key = (value ?? '').toLowerCase().replace(/[^a-z]/g, '');
  return BASIS_BY_KEY[key] ?? 'OCCURRENCE';
}

/** Species-level name: `species`, else a scientificName that is at least a binomial. */
function speciesName(row: ObisOccurrence): string {
  if (row.species) {
    return normalizeSpeciesName(row.species);
  }
  const name = row.scientificName?.trim() ?? '';
  // Genus or higher-rank identifications get no name, so the cleaner drops them.
  return /^[A-Z][a-z-]+ [a-z][a-z-]+/.test(name) ? normalizeSpeciesName(name) : '';
}

export function toOccurrenceRecord(row: ObisOccurrence): OccurrenceRecord {
  const uncertainty = Number(row.coordinateUncertaintyInMeters);
  const code = row.countryCode?.trim().toUpperCase();
  const country = code && /^[A-Z]{2}$/.test(code) ? code : undefined;
  return {
    name: speciesName(row),
    lon: Number(row.decimalLongitude),
    lat: Number(row.decimalLatitude),
    ...(row.date_year != null && { year: row.date_year }),
    source: 'obis',
    ...(row.dataset_id && { datasetKey: row.dataset_id }),
    basisOfRecord: normalizeObisBasis(row.basisOfRecord),
    ...(row.coordinateUncertaintyInMeters != null &&
      Number.isFinite(uncertainty) && { uncertainty }),
    ...(country && { country }),
  };
}

/** The client-side part of the query, serialisable into a stream plan. */
export interface ObisClientFilter {
  basis: BasisOfRecord[] | null;
  maxUncertaintyMeters: number | null;
  keepMissingUncertainty: boolean;
}

export function obisClientFilter(query: OccurrenceQuery): ObisClientFilter {
  return {
    basis: activeBasisFilter(query),
    maxUncertaintyMeters: query.quality.maxUncertaintyMeters,
    keepMissingUncertainty: query.quality.keepMissingUncertainty,
  };
}

/** Whether a record passes the filters OBIS cannot apply on the server. */
export function passesClientFilter(record: OccurrenceRecord, filter: ObisClientFilter): boolean {
  if (filter.basis && !filter.basis.includes(record.basisOfRecord as BasisOfRecord)) {
    return false;
  }
  if (filter.maxUncertaintyMeters != null) {
    if (record.uncertainty == null) {
      return filter.keepMissingUncertainty;
    }
    return record.uncertainty <= filter.maxUncertaintyMeters;
  }
  return true;
}
