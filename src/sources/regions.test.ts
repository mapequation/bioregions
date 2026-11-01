import { describe, expect, it } from 'vitest';
import { bboxContains } from './geo';
import { areaLabel, COUNTRIES, COUNTRY_CODES, countryName, REGION_PRESETS, regionById } from './regions';

describe('regions', () => {
  it('has unique ids and valid boxes', () => {
    expect(new Set(REGION_PRESETS.map((r) => r.id)).size).toBe(REGION_PRESETS.length);
    for (const { bbox } of REGION_PRESETS) {
      const [w, s, e, n] = bbox;
      expect(Math.abs(w) <= 180 && Math.abs(e) <= 180 && s < n && s >= -90 && n <= 90).toBe(true);
    }
  });

  it('Pacific crosses the antimeridian', () => {
    const pacific = regionById('ocean-pacific');
    expect(pacific).toBeDefined();
    const bbox = pacific?.bbox ?? [0, 0, 0, 0];
    expect(bbox[0]).toBeGreaterThan(bbox[2]);
    expect(bboxContains(bbox, 180, 0)).toBe(true);
    expect(bboxContains(bbox, -150, 0)).toBe(true);
    expect(bboxContains(bbox, 0, 0)).toBe(false);
  });

  it('lists countries with names', () => {
    expect(COUNTRY_CODES).toHaveLength(250);
    expect(new Set(COUNTRY_CODES).size).toBe(250);
    expect(countryName('SE')).toBe('Sweden');
    expect(countryName('XK')).toBe('Kosovo');
    expect(countryName('ZZZ')).toBe('ZZZ');
    expect(COUNTRIES[0].name.localeCompare(COUNTRIES[1].name)).toBeLessThan(0);
  });

  it('labels areas', () => {
    expect(areaLabel({ kind: 'world' })).toBe('World');
    expect(areaLabel({ kind: 'bbox', bbox: [-82, -56, -34, 13] })).toBe('South America');
    expect(areaLabel({ kind: 'bbox', bbox: [-80, -10, -60, 5] })).toBe('10°S–5°N, 80°W–60°W');
    expect(areaLabel({ kind: 'bbox', bbox: [10.25, 0, 20, 45.5] })).toBe('0°–45.5°N, 10.3°E–20°E');
    expect(areaLabel({ kind: 'countries', codes: ['SE', 'NO'] })).toBe('Sweden, Norway');
    expect(areaLabel({ kind: 'countries', codes: ['SE', 'NO', 'FI', 'DK', 'IS'] })).toBe('Sweden, Norway, Finland + 2 more');
    expect(areaLabel({ kind: 'wkt', wkt: 'POLYGON((0 0,1 0,1 1,0 0))' })).toBe('Custom polygon');
  });
});
