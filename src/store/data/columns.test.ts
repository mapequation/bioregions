import { describe, expect, it } from 'vitest';
import { guessColumnNames } from './columns';

const GBIF_SIMPLE_CSV = [
  'gbifID', 'datasetKey', 'occurrenceID', 'kingdom', 'phylum', 'class', 'order', 'family', 'genus',
  'species', 'infraspecificEpithet', 'taxonRank', 'scientificName', 'verbatimScientificName',
  'verbatimScientificNameAuthorship', 'countryCode', 'locality', 'stateProvince', 'occurrenceStatus',
  'individualCount', 'publishingOrgKey', 'decimalLatitude', 'decimalLongitude',
  'coordinateUncertaintyInMeters', 'eventDate', 'year', 'basisOfRecord',
];

describe('guessColumnNames', () => {
  it('picks species and decimal coordinates from a GBIF Simple CSV header', () => {
    expect(guessColumnNames(GBIF_SIMPLE_CSV)).toEqual({
      name: 'species',
      lat: 'decimalLatitude',
      long: 'decimalLongitude',
    });
  });

  it('reads the bundled example header', () => {
    expect(guessColumnNames(['species', 'longitude', 'latitude'])).toEqual({
      name: 'species',
      lat: 'latitude',
      long: 'longitude',
    });
  });

  it('falls back to columns 0, 1 and 2 when only the name is recognised', () => {
    expect(guessColumnNames(['scientificName', 'x', 'y'])).toEqual({ name: 'scientificName', lat: 'x', long: 'y' });
  });

  it('falls back to columns 0, 1 and 2 when nothing is recognised', () => {
    expect(guessColumnNames(['a', 'b', 'c', 'd'])).toEqual({ name: 'a', lat: 'b', long: 'c' });
  });

  it('never picks the same column twice', () => {
    expect(guessColumnNames(['x', 'scientificName', 'y'])).toEqual({ name: 'scientificName', lat: 'x', long: 'y' });
  });
});
