import Papa from 'papaparse';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadFile, TABLE_CONFIG } from './loader';

describe('loadFile', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parses local and remote tables with trimmed header names', () => {
    const parse = vi.spyOn(Papa, 'parse').mockImplementation(() => undefined as never);
    loadFile(new File(['species,longitude,latitude\n'], 'a.csv'));
    loadFile('data/demo.csv');
    expect(parse).toHaveBeenCalledTimes(2);
    for (const [, config] of parse.mock.calls) {
      expect(config).toMatchObject({ header: true, dynamicTyping: true, skipEmptyLines: true });
      expect((config as typeof TABLE_CONFIG).transformHeader(' longitude ')).toBe('longitude');
    }
  });
});

describe('TABLE_CONFIG', () => {
  it('keys rows by trimmed header names', () => {
    // The header of public/data/demo.csv
    const { data, meta } = Papa.parse('species, longitude, latitude\nA, 0.9, 9.8', TABLE_CONFIG);
    expect(meta.fields).toEqual(['species', 'longitude', 'latitude']);
    expect(data).toEqual([{ species: 'A', longitude: 0.9, latitude: 9.8 }]);
  });
});
