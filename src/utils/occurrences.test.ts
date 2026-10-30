import Papa from 'papaparse';
import { describe, expect, it } from 'vitest';
import {
  parseCoordinate,
  parseOccurrence,
  parseOccurrenceTable,
} from './occurrences';

const columns = {
  nameColumn: 'species',
  longColumn: 'longitude',
  latColumn: 'latitude',
};

describe('parseCoordinate', () => {
  it('reads numbers and decimal strings', () => {
    expect(parseCoordinate(-60.5)).toBe(-60.5);
    expect(parseCoordinate(' 1.5e1 ')).toBe(15);
    expect(parseCoordinate('+3')).toBe(3);
    expect(parseCoordinate('.5')).toBe(0.5);
  });

  it('does not read empty cells as 0', () => {
    for (const value of [null, undefined, '', '  ', true, false]) {
      expect(parseCoordinate(value)).toBeNaN();
    }
  });

  it('rejects hex, Infinity and text', () => {
    for (const value of ['0x10', 'Infinity', '-Infinity', 'abc', '1,5']) {
      expect(parseCoordinate(value)).toBeNaN();
    }
  });
});

describe('parseOccurrence', () => {
  // Rows typed the way the app's chunked Papa loader types them.
  const parse = (csv: string) =>
    Papa.parse<Record<string, unknown>>(`species,longitude,latitude\n${csv}`, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
    }).data.map((row) => parseOccurrence(row, columns));

  it('normalizes the name and keeps valid coordinates', () => {
    expect(parse('puma_concolor,-60.5,-10.25\nPanthera onca,-180,90')).toEqual([
      { name: 'Puma concolor', coordinates: [-60.5, -10.25] },
      { name: 'Panthera onca', coordinates: [-180, 90] },
    ]);
  });

  it('skips rows with a missing name', () => {
    expect(parse(',-60.5,-10.25\nNA,-60.5,-10.25\n  ,1,1')).toEqual([
      null,
      null,
      null,
    ]);
  });

  it('skips empty, non-finite and out-of-range coordinates', () => {
    expect(
      parse(
        [
          'A,,1',
          'A,1,',
          'A,abc,1',
          'A,Infinity,1',
          'A,180.5,1',
          'A,1,-90.5',
        ].join('\n'),
      ),
    ).toEqual([null, null, null, null, null, null]);
  });
});

describe('parseOccurrenceTable', () => {
  it('reads quoted fields and CRLF line endings', () => {
    const csv =
      '"species","longitude","latitude"\r\n"Puma concolor (Linnaeus, 1771)",-60.5,"-10.25"\r\n\r\n';
    expect(parseOccurrenceTable(csv, columns)).toEqual({
      occurrences: [
        {
          name: 'Puma concolor (Linnaeus, 1771)',
          coordinates: [-60.5, -10.25],
        },
      ],
      numSkipped: 0,
      fields: ['species', 'longitude', 'latitude'],
    });
  });

  it('detects tab-separated input', () => {
    const tsv = 'species\tlongitude\tlatitude\nPuma concolor\t-60.5\t-10.25\n';
    expect(parseOccurrenceTable(tsv, columns).occurrences).toEqual([
      { name: 'Puma concolor', coordinates: [-60.5, -10.25] },
    ]);
  });

  it('counts rows with an empty, hex, infinite or out-of-range coordinate as skipped', () => {
    const csv = [
      'species,longitude,latitude',
      'A,1,2',
      'A,,2',
      'A,0x10,2',
      'A,Infinity,2',
      'A,1,91',
      ',1,2',
    ].join('\n');
    const { occurrences, numSkipped } = parseOccurrenceTable(csv, columns);
    expect(occurrences).toEqual([{ name: 'A', coordinates: [1, 2] }]);
    expect(numSkipped).toBe(5);
  });
});
