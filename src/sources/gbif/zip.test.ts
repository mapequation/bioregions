import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import type { OccurrenceRecord } from '../types';
import { importGbifZip } from './zip';

// Header and row layout follow GBIF's SIMPLE_CSV (download 0017434-261023074918325).
const SIMPLE_HEADER = [
  'gbifID',
  'datasetKey',
  'species',
  'occurrenceStatus',
  'decimalLatitude',
  'decimalLongitude',
  'coordinateUncertaintyInMeters',
  'year',
  'basisOfRecord',
  'establishmentMeans',
];

const row = (fields: (string | number)[]) => fields.join('\t');

function simpleCsv(n: number): string {
  const lines = [row(SIMPLE_HEADER)];
  for (let i = 0; i < n; i++) {
    lines.push(
      row([
        i,
        'ds-1',
        i % 2 ? 'Helleborus torquatus' : 'Puma concolor',
        i === 3 ? 'ABSENT' : 'PRESENT',
        (i / 10).toFixed(4),
        (-i / 10).toFixed(4),
        i % 5 ? 100 : '',
        2000 + (i % 20),
        'HUMAN_OBSERVATION',
        i === 4 ? 'introduced' : '',
      ]),
    );
  }
  return `${lines.join('\r\n')}\r\n`;
}

async function readAll(blob: Blob, opts: Parameters<typeof importGbifZip>[1] = {}) {
  const gen = importGbifZip(blob, opts);
  const records: OccurrenceRecord[] = [];
  let batches = 0;
  let result = await gen.next();
  while (!result.done) {
    batches++;
    records.push(...result.value.records);
    result = await gen.next();
  }
  return { records, batches, summary: result.value };
}

const zipBlob = (files: Record<string, string>, level: 0 | 6 = 6) =>
  new Blob([
    zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])), {
      level,
    }) as Uint8Array<ArrayBuffer>,
  ]);

describe('importGbifZip', () => {
  it('reads a SIMPLE_CSV zip in batches and skips absences', async () => {
    const blob = zipBlob({ '0017434-261023074918325.csv': simpleCsv(2500) });
    const { records, batches, summary } = await readAll(blob, { batchSize: 1000 });
    expect(summary).toEqual({
      downloadKey: '0017434-261023074918325',
      rows: 2500,
      absent: 1,
      introduced: 0,
      format: 'SIMPLE_CSV',
    });
    expect(records).toHaveLength(2499);
    expect(batches).toBe(3);
    expect(records[0]).toEqual({
      name: 'Puma concolor',
      lon: 0,
      lat: 0,
      year: 2000,
      source: 'gbif',
      datasetKey: 'ds-1',
      basisOfRecord: 'HUMAN_OBSERVATION',
    });
    expect(records[1]).toMatchObject({ name: 'Helleborus torquatus', lat: 0.1, uncertainty: 100 });
  });

  it('optionally drops non-native records', async () => {
    const blob = zipBlob({ '0017434-261023074918325.csv': simpleCsv(10) }, 0);
    const { records, summary } = await readAll(blob, { excludeIntroduced: true });
    expect(summary.introduced).toBe(1);
    expect(records).toHaveLength(8);
  });

  it('reads a DWCA zip with its citation and DOI', async () => {
    const occurrence = [
      row(['gbifID', 'species', 'decimalLatitude', 'decimalLongitude', 'year', 'occurrenceStatus']),
      row([1, 'Lynx lynx', '60.5', '15.25', '1999', 'PRESENT']),
      row([2, '', '61', '16', '', 'PRESENT']),
    ].join('\n');
    const blob = zipBlob({
      'meta.xml': '<archive/>',
      'occurrence.txt': occurrence,
      'verbatim.txt': 'ignored',
      'metadata.xml':
        '<eml><alternateIdentifier>10.15468/dl.abc123</alternateIdentifier><alternateIdentifier>https://www.gbif.org/occurrence/download/0012345-261023074918325</alternateIdentifier></eml>',
      'citations.txt':
        'When using this dataset please use the following citation:\nGBIF.org (30 October 2026) GBIF Occurrence Download https://doi.org/10.15468/dl.abc123\n',
    });
    const { records, summary } = await readAll(blob);
    expect(summary).toEqual({
      downloadKey: '0012345-261023074918325',
      rows: 2,
      absent: 0,
      introduced: 0,
      format: 'DWCA',
      doi: '10.15468/dl.abc123',
      citation:
        'GBIF.org (30 October 2026) GBIF Occurrence Download https://doi.org/10.15468/dl.abc123',
    });
    expect(records[0]).toEqual({ name: 'Lynx lynx', lon: 15.25, lat: 60.5, year: 1999, source: 'gbif' });
    // Rows without a species name pass through for the cleaner to count.
    expect(records[1].name).toBe('');
  });

  it('decodes UTF-8 split across chunks', async () => {
    const csv = `${row(['species', 'decimalLatitude', 'decimalLongitude'])}\n${'Æéü species\t1\t2\n'.repeat(5000)}`;
    const { records } = await readAll(zipBlob({ 'x.csv': csv }, 0));
    expect(records).toHaveLength(5000);
    expect(records.every((r) => r.name === 'Æéü species')).toBe(true);
  });

  it('rejects zips without an occurrence table', async () => {
    await expect(readAll(zipBlob({ 'readme.txt': 'hi' }))).rejects.toThrow(/No GBIF occurrence table/);
    await expect(readAll(zipBlob({ 'a.csv': 'foo\tbar\n1\t2\n' }))).rejects.toThrow(/missing species/);
  });

  it('stops when aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      readAll(zipBlob({ 'a.csv': simpleCsv(10) }), { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
