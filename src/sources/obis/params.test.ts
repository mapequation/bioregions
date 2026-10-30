import { describe, expect, it } from 'vitest';
import type { OccurrenceQuery } from '../types';
import { obisCaveats, obisParams, supportsObis } from './params';

const query = (patch: Partial<OccurrenceQuery> = {}, quality = {}): OccurrenceQuery => ({
  taxa: [{ name: 'Delphinidae', rank: 'FAMILY', obisId: 136980 }],
  area: { kind: 'world' },
  years: [null, null],
  depth: [null, null],
  quality: {
    basisOfRecord: [],
    maxUncertaintyMeters: null,
    keepMissingUncertainty: true,
    excludeGeospatialIssues: false,
    excludeIntroduced: false,
    presentOnly: true,
    dedupe: 'none',
    ...quality,
  },
  sources: { gbif: true, obis: true },
  ...patch,
});

describe('obisParams', () => {
  it('maps taxa, area, years, depth and quality flags', () => {
    const params = obisParams(
      query(
        { area: { kind: 'bbox', bbox: [-80, 20, 0, 70] }, years: [1970, 2020], depth: [0, 200] },
        { excludeGeospatialIssues: true },
      ),
      { taxonIds: [136980, 136984, 136980] },
    );
    expect(Object.fromEntries(params)).toEqual({
      taxonid: '136980,136984',
      geometry: 'POLYGON((-80 20,0 20,0 70,-80 70,-80 20))',
      startdate: '1970-01-01',
      enddate: '2020-12-31',
      startdepth: '0',
      enddepth: '200',
      absence: 'false',
      exclude: 'ON_LAND,DEPTH_EXCEEDS_BATH',
    });
  });

  it('uses a MULTIPOLYGON for antimeridian boxes and open year ends', () => {
    const params = obisParams(query({ area: { kind: 'bbox', bbox: [170, -50, -170, -30] }, years: [null, 2000] }));
    expect(params.get('geometry')).toMatch(/^MULTIPOLYGON/);
    expect(params.get('startdate')).toBeNull();
    expect(params.get('enddate')).toBe('2000-12-31');
    expect(params.get('taxonid')).toBe('136980');
  });

  it('omits filters for impact queries and includes absences when not presentOnly', () => {
    const q = query({ years: [1970, 2020] }, { excludeGeospatialIssues: true });
    const params = obisParams(q, { omit: ['years', 'presentOnly', 'geospatialIssues'] });
    expect(params.get('startdate')).toBeNull();
    expect(params.get('absence')).toBe('include');
    expect(params.get('exclude')).toBeNull();
    expect(obisParams(query({}, { presentOnly: false })).get('absence')).toBe('include');
  });
});

describe('supportsObis / obisCaveats', () => {
  it('rejects country areas and unbounded queries', () => {
    expect(supportsObis(query()).ok).toBe(true);
    expect(supportsObis(query({ area: { kind: 'countries', codes: ['SE'] } })).ok).toBe(false);
    expect(supportsObis(query({ taxa: [] })).ok).toBe(false);
  });

  it('explains client-side and unsupported filters', () => {
    const notes = obisCaveats(
      query(
        { taxa: [{ name: 'Phocoenidae', rank: 'FAMILY' }] },
        {
          basisOfRecord: ['HUMAN_OBSERVATION'],
          maxUncertaintyMeters: 1000,
          excludeIntroduced: true,
          excludeGeospatialIssues: true,
        },
      ),
    );
    expect(notes).toHaveLength(5);
    expect(notes.join(' ')).toMatch(/Phocoenidae/);
    expect(notes.join(' ')).toMatch(/establishment/);
  });
});
