import { describe, expect, it } from 'vitest';
import { RecordCleaner, compareRecords, toSpeciesName } from './clean';
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
      dropped: {
        noSpecies: 1,
        invalidCoordinates: 2,
        zeroCoordinates: 1,
        outsideArea: 1,
        duplicate: 0,
        crossSource: 1,
        lowCount: 0,
      },
      bySource: { gbif: { received: 6, accepted: 1 }, obis: { received: 2, accepted: 1 } },
    });
  });

  it('tells GBIF∩OBIS overlap apart from same-source duplicates', () => {
    const c = new RecordCleaner({ dedupe: 'exact' });
    c.accept([rec('Abra alba', 1, 1), rec('Abra alba', 1, 1), rec('Abra alba', 2, 2, 'obis')]);
    c.accept([rec('Abra alba', 1, 1, 'obis'), rec('Abra alba', 2, 2, 'obis'), rec('Abra alba', 2, 2)]);
    // Both sites keep their GBIF record: gbif(1,1) is a duplicate within GBIF, and the
    // three OBIS records are cross-source drops, although OBIS arrived first at (2,2).
    expect(c.funnel.dropped).toMatchObject({ duplicate: 1, crossSource: 3 });
    expect(c.funnel.accepted).toBe(2);
    expect(c.funnel.bySource).toEqual({ gbif: { received: 3, accepted: 2 }, obis: { received: 3, accepted: 0 } });
    expect(c.changes()).toEqual([{ index: 1, record: rec('Abra alba', 2, 2) }]);
    const cell = new RecordCleaner({ dedupe: 'cell' });
    cell.accept([rec('Abra alba', 10.001, 5.001), rec('Abra alba', 10.009, 5.009, 'obis')]);
    expect(cell.funnel.dropped).toMatchObject({ duplicate: 0, crossSource: 1 });
  });

  it('keeps GBIF over OBIS, then the earliest year, then the other fields', () => {
    const at = (o: Partial<OccurrenceRecord>): OccurrenceRecord => ({ ...rec('Abra alba', 1, 1), ...o });
    const ranked = [
      at({ year: 2001, datasetKey: 'z' }),
      at({ year: 2001, datasetKey: 'z', basisOfRecord: 'HUMAN_OBSERVATION', uncertainty: 5 }),
      at({ year: 2001, datasetKey: 'z', basisOfRecord: 'HUMAN_OBSERVATION', uncertainty: 50 }),
      at({ year: 2001, datasetKey: 'z', basisOfRecord: 'HUMAN_OBSERVATION' }),
      at({ year: 2010, datasetKey: 'a' }),
      at({ datasetKey: 'a' }),
      at({ source: 'obis', year: 1900 }),
    ];
    // Missing values sort last: without a basis of record, the first sorts after the second.
    expect(compareRecords(ranked[0], ranked[1])).toBeGreaterThan(0);
    const sorted = [...ranked].sort(compareRecords);
    expect(sorted.map((r) => [r.source, r.year, r.datasetKey, r.basisOfRecord, r.uncertainty])).toEqual([
      ['gbif', 2001, 'z', 'HUMAN_OBSERVATION', 5],
      ['gbif', 2001, 'z', 'HUMAN_OBSERVATION', 50],
      ['gbif', 2001, 'z', 'HUMAN_OBSERVATION', undefined],
      ['gbif', 2001, 'z', undefined, undefined],
      ['gbif', 2010, 'a', undefined, undefined],
      ['gbif', undefined, 'a', undefined, undefined],
      ['obis', 1900, undefined, undefined, undefined],
    ]);
  });

  it('keeps the same records and funnel whatever order they arrive in', () => {
    const records: OccurrenceRecord[] = [];
    for (let i = 0; i < 60; i++) {
      const site = i % 7;
      records.push({
        ...rec(i % 3 === 0 ? 'Abra alba' : 'Abra prismatica (Montagu, 1808)', site + (i % 2) * 0.004, 50 + site, i % 4 === 0 ? 'obis' : 'gbif'),
        year: 1990 + (i % 5),
        datasetKey: `d${i % 3}`,
      });
    }
    let seed = 7;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const run = (mode: 'exact' | 'cell') => {
      const shuffled = [...records];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      const c = new RecordCleaner({ dedupe: mode });
      const shown: OccurrenceRecord[] = [];
      for (let i = 0; i < shuffled.length; ) {
        const size = 1 + Math.floor(random() * 9);
        shown.push(...c.accept(shuffled.slice(i, i + size)));
        i += size;
      }
      for (const { index, record } of c.changes()) shown[index] = record;
      const key = (r: OccurrenceRecord) => JSON.stringify([r.name, r.lon, r.lat, r.source, r.year, r.datasetKey]);
      expect(shown.map(key).sort()).toEqual(c.kept().map(key).sort());
      return { kept: shown.map(key).sort(), funnel: c.funnel };
    };
    for (const mode of ['exact', 'cell'] as const) {
      const first = run(mode);
      expect(first.funnel.dropped.crossSource).toBeGreaterThan(0);
      for (let k = 0; k < 20; k++) expect(run(mode)).toEqual(first);
    }
  });

  it('drops records that duplicate records loaded before', () => {
    const c = new RecordCleaner({ dedupe: 'exact', existing: [{ name: 'Aa bb', lon: 10, lat: 20 }] });
    const out = c.accept([rec('Aa bb', 10.00001, 20), rec('Aa bb', 10, 20, 'obis'), rec('Aa bb', 11, 20), rec('Cc dd', 10, 20, 'obis')]);
    expect(out.map((r) => [r.name, r.lon])).toEqual([
      ['Aa bb', 11],
      ['Cc dd', 10],
    ]);
    expect(c.funnel).toMatchObject({ accepted: 2, dropped: { duplicate: 2, crossSource: 0 } });
    expect(c.funnel.bySource).toEqual({ gbif: { received: 2, accepted: 1 }, obis: { received: 2, accepted: 1 } });
    const none = new RecordCleaner({ dedupe: 'none', existing: [{ name: 'Aa bb', lon: 10, lat: 20 }] });
    expect(none.accept([rec('Aa bb', 10, 20)])).toHaveLength(1);
  });

  it('counts each record under its own source in a mixed batch', () => {
    const c = new RecordCleaner({ dedupe: 'none' });
    c.accept([rec('Abra alba', 1, 1), rec('Abra alba', 2, 2, 'obis'), rec('Abra alba', 3, 3), rec('Abra sp.', 4, 4)]);
    expect(c.funnel.bySource).toEqual({ gbif: { received: 3, accepted: 2 }, obis: { received: 1, accepted: 1 } });
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
