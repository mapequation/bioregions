import { describe, expect, it } from 'vitest';
import { RecordCleaner, toSpeciesName } from './clean';
import type { OccurrenceRecord } from './types';

describe('toSpeciesName', () => {
  it.each([
    ['Puma concolor (Linnaeus, 1771)', 'Puma concolor'],
    ['Panthera leo persica', 'Panthera leo'],
    ['Quercus robur var. robur', 'Quercus robur'],
    ['Canis lupus familiaris', 'Canis lupus'],
    ['Delphinus delphis Linnaeus, 1758', 'Delphinus delphis'],
    ['Bombus (Pyrobombus) hypnorum', 'Bombus hypnorum'],
    ['Mentha × piperita L.', 'Mentha piperita'],
    ['Aster novae-angliae', 'Aster novae-angliae'],
    ['Puma_concolor', 'Puma concolor'],
    ['  puma   concolor  ', 'Puma concolor'],
    ['Abra alba (W. Wood, 1802) f. minor', 'Abra alba'],
  ])('%s -> %s', (raw, expected) => {
    expect(toSpeciesName(raw)).toBe(expected);
  });

  it.each([
    'Felis sp.',
    'Felis spp.',
    'Felis',
    'Felidae',
    'Puma cf. concolor',
    'Puma aff. concolor',
    'Puma concolor?',
    'Salix alba × Salix fragilis',
    'Salix alba x fragilis',
    'Incertae sedis',
    'BOLD:AAA1234',
    '12345',
    '',
    'Felis Linnaeus, 1758',
    'Unknown species',
  ])('rejects %s', (raw) => {
    expect(toSpeciesName(raw)).toBeNull();
  });

  it('handles non-strings', () => {
    expect(toSpeciesName(null)).toBeNull();
    expect(toSpeciesName(undefined)).toBeNull();
  });
});

const rec = (name: string, lon: number, lat: number, source: OccurrenceRecord['source'] = 'gbif') => ({
  name,
  lon,
  lat,
  source,
});

describe('RecordCleaner', () => {
  it('drops invalid records with reasons and counts per source', () => {
    const c = new RecordCleaner({ dedupe: 'exact', area: { kind: 'bbox', bbox: [-90, -60, -30, 15] } });
    const out = c.accept([
      rec('Puma concolor (Linnaeus, 1771)', -60, -10),
      rec('Felis sp.', -60, -10),
      rec('Puma concolor', Number.NaN, -10),
      rec('Puma concolor', -60, 95),
      rec('Puma concolor', 0, 0),
      rec('Puma concolor', 10, 50),
      rec('Puma concolor', -60.00001, -10.00001, 'obis'),
      rec('Puma concolor', -60.001, -10, 'obis'),
    ]);
    expect(out.map((r) => [r.name, r.lon, r.source])).toEqual([
      ['Puma concolor', -60, 'gbif'],
      ['Puma concolor', -60.001, 'obis'],
    ]);
    expect(c.funnel).toEqual({
      received: 8,
      accepted: 2,
      dropped: { noSpecies: 1, invalidCoordinates: 2, zeroCoordinates: 1, outsideArea: 1, duplicate: 1, lowCount: 0 },
      bySource: { gbif: { received: 6, accepted: 1 }, obis: { received: 2, accepted: 1 } },
    });
  });

  it('dedupes per cell, never with none, and honours antimeridian boxes', () => {
    const cell = new RecordCleaner({ dedupe: 'cell' });
    expect(cell.accept([rec('Abra alba', 10.001, 5.001), rec('Abra alba', 10.009, 5.009), rec('Abra nitida', 10.001, 5.001)])).toHaveLength(2);
    const none = new RecordCleaner({ dedupe: 'none', area: { kind: 'bbox', bbox: [170, -30, -170, 0] } });
    expect(none.accept([rec('Abra alba', 175, -10), rec('Abra alba', 175, -10), rec('Abra alba', -175, -10), rec('Abra alba', 0, -10)])).toHaveLength(3);
    expect(none.funnel.dropped.outsideArea).toBe(1);
  });

  it('dedupes across batches until reset', () => {
    const c = new RecordCleaner({ dedupe: 'exact' });
    expect(c.accept([rec('Abra alba', 1, 1)])).toHaveLength(1);
    expect(c.accept([rec('Abra alba', 1, 1, 'obis')])).toHaveLength(0);
    c.reset();
    expect(c.funnel.received).toBe(0);
    expect(c.accept([rec('Abra alba', 1, 1)])).toHaveLength(1);
  });

  it('skips the area check for countries', () => {
    const c = new RecordCleaner({ dedupe: 'none', area: { kind: 'countries', codes: ['SE'] } });
    expect(c.accept([rec('Abra alba', 100, 10)])).toHaveLength(1);
  });

  it('cleans 200k records quickly', () => {
    const names = Array.from({ length: 2000 }, (_, i) => `Genus${String.fromCharCode(97 + (i % 26))} species${String.fromCharCode(97 + Math.floor(i / 26) % 26)}x (Author, 1900)`);
    const records: OccurrenceRecord[] = Array.from({ length: 200_000 }, (_, i) => ({
      name: names[i % names.length].replace(/\d/g, ''),
      lon: ((i * 7.31) % 360) - 180,
      lat: ((i * 3.17) % 180) - 90,
      source: i % 2 ? 'gbif' : 'obis',
    }));
    const c = new RecordCleaner({ dedupe: 'exact' });
    const t0 = performance.now();
    const out = c.accept(records);
    const ms = performance.now() - t0;
    expect(out.length).toBeGreaterThan(0);
    expect(ms).toBeLessThan(1500);
  });
});
