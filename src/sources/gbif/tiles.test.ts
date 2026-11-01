import { describe, expect, it } from 'vitest';
import type { OccurrenceQuery } from '../types';
import {
  gbifBasemapUrl,
  gbifDensityTileUrl,
  gbifTileBounds,
  gbifTileFilterCoverage,
  gbifTileGrid,
  gbifTileMode,
} from './tiles';

function query(overrides: Partial<OccurrenceQuery> = {}): OccurrenceQuery {
  return {
    taxa: [{ name: 'Felidae', rank: 'FAMILY', gbifKey: 9703 }],
    area: { kind: 'world' },
    years: [1970, null],
    depth: [null, null],
    quality: {
      basisOfRecord: ['PRESERVED_SPECIMEN', 'HUMAN_OBSERVATION'],
      maxUncertaintyMeters: 10_000,
      keepMissingUncertainty: false,
      excludeGeospatialIssues: true,
      excludeIntroduced: true,
      presentOnly: true,
      dedupe: 'cell',
    },
    sources: { gbif: true, obis: false },
    ...overrides,
  };
}

const params = (url: string) => new URL(url).searchParams;

describe('EPSG:4326 tiling', () => {
  it('has 2^(z+1) x 2^z tiles covering the globe', () => {
    expect(gbifTileGrid(0)).toEqual({ cols: 2, rows: 1, degrees: 180 });
    expect(gbifTileGrid(2)).toEqual({ cols: 8, rows: 4, degrees: 45 });
    expect(gbifTileBounds({ z: 0, x: 1, y: 0 })).toEqual([0, -90, 180, 90]);
    expect(gbifTileBounds({ z: 2, x: 0, y: 3 })).toEqual([-180, -90, -135, -45]);
  });
});

describe('gbifDensityTileUrl', () => {
  it('uses the density endpoint for one taxon and closes open year ranges', () => {
    const url = gbifDensityTileUrl(query(), { z: 1, x: 2, y: 0, scale: 2 });
    expect(url.startsWith('https://api.gbif.org/v2/map/occurrence/density/1/2/0@2x.png?')).toBe(
      true,
    );
    const p = params(url);
    expect(p.get('srs')).toBe('EPSG:4326');
    expect(p.get('style')).toBe('purpleYellow.point');
    expect(p.getAll('taxonKey')).toEqual(['9703']);
    expect(p.get('year')).toBe('1970,9999');
    expect(p.getAll('basisOfRecord')).toEqual(['PRESERVED_SPECIMEN', 'HUMAN_OBSERVATION']);
    // Density ignores these, so they are not sent.
    expect(p.has('coordinateUncertaintyInMeters')).toBe(false);
    expect(p.has('occurrenceStatus')).toBe(false);
  });

  it('switches to the adhoc endpoint for several taxa or a polygon area', () => {
    const q = query({
      taxa: [
        { name: 'Felidae', rank: 'FAMILY', gbifKey: 9703 },
        { name: 'Canidae', rank: 'FAMILY', gbifKey: 9701 },
      ],
      area: { kind: 'bbox', bbox: [-80, -30, -40, 10] },
      depth: [0, null],
    });
    expect(gbifTileMode(q)).toBe('adhoc');
    const url = gbifDensityTileUrl(q, { z: 0, x: 0, y: 0, dark: true });
    expect(url).toContain('/v2/map/occurrence/adhoc/0/0/0@1x.png?');
    const p = params(url);
    expect(p.get('style')).toBe('orangeHeat.point');
    expect(p.getAll('taxonKey')).toEqual(['9703', '9701']);
    expect(p.get('geometry')).toBe('POLYGON((-80 -30,-40 -30,-40 10,-80 10,-80 -30))');
    expect(p.get('year')).toBe('1970,*');
    expect(p.get('depth')).toBe('0,*');
    expect(p.get('coordinateUncertaintyInMeters')).toBe('0,10000');
    expect(p.get('hasGeospatialIssue')).toBe('false');
    expect(p.get('occurrenceStatus')).toBe('PRESENT');
  });

  it('renders hexagon bins with a poly style', () => {
    const p = params(gbifDensityTileUrl(query(), { z: 0, x: 0, y: 0, bin: 'hex' }));
    expect(p.get('bin')).toBe('hex');
    expect(p.get('style')).toBe('purpleYellow-noborder.poly');
    expect(p.get('hexPerTile')).toBe('64');
  });

  it('keeps only the first taxon when density is forced', () => {
    const q = query({
      taxa: [
        { name: 'Felidae', rank: 'FAMILY', gbifKey: 9703 },
        { name: 'Canidae', rank: 'FAMILY', gbifKey: 9701 },
      ],
    });
    const p = params(gbifDensityTileUrl(q, { z: 0, x: 0, y: 0, mode: 'density' }));
    expect(p.getAll('taxonKey')).toEqual(['9703']);
    expect(gbifTileFilterCoverage(q, 'density').ignored).toContain('Taxa after the first');
  });
});

describe('gbifTileFilterCoverage', () => {
  it('lists active filters the tiles honour and ignore', () => {
    expect(gbifTileFilterCoverage(query())).toEqual({
      mode: 'density',
      applied: ['Taxon', 'Years', 'Basis of record', 'Geospatial issues'],
      ignored: ['Coordinate uncertainty', 'Introduced records', 'Absence records'],
    });
    expect(gbifTileFilterCoverage(query(), 'adhoc')).toEqual({
      mode: 'adhoc',
      applied: [
        'Taxon',
        'Years',
        'Basis of record',
        'Coordinate uncertainty',
        'Geospatial issues',
        'Absence records',
      ],
      ignored: ['Introduced records'],
    });
  });

  it('ignores an uncertainty limit that keeps records without uncertainty', () => {
    const q = query({ quality: { ...query().quality, keepMissingUncertainty: true } });
    expect(gbifTileFilterCoverage(q, 'adhoc').ignored).toContain('Coordinate uncertainty');
  });
});

describe('gbifBasemapUrl', () => {
  it('points at the GBIF OpenMapTiles basemap', () => {
    expect(gbifBasemapUrl({ z: 0, x: 1, y: 0 })).toBe(
      'https://tile.gbif.org/4326/omt/0/1/0@1x.png?style=gbif-light',
    );
    expect(gbifBasemapUrl({ z: 3, x: 4, y: 2, scale: 2, dark: true })).toBe(
      'https://tile.gbif.org/4326/omt/3/4/2@2x.png?style=gbif-dark',
    );
  });
});
