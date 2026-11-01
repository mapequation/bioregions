import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BASIS,
  decodeQuery,
  defaultQuery,
  describeQuery,
  encodeQuery,
  isQueryRunnable,
  matchPreset,
  presetQuality,
  QUALITY_PRESETS,
  queryKey,
  queryTitle,
} from './query';
import type { OccurrenceQuery } from './types';

const felids = (): OccurrenceQuery => ({
  ...defaultQuery(),
  taxa: [{ name: 'Felidae', rank: 'FAMILY', gbifKey: 9703, vernacularName: 'Kattdjur – ü' }],
  area: { kind: 'bbox', bbox: [-82, -56, -34, 13] },
  years: [1970, 2025],
});

describe('presets', () => {
  it('default basis excludes living and fossil specimens', () => {
    expect(DEFAULT_BASIS).toHaveLength(7);
    expect(DEFAULT_BASIS).not.toContain('LIVING_SPECIMEN');
    expect(DEFAULT_BASIS).not.toContain('FOSSIL_SPECIMEN');
  });

  it('matches presets, ignoring basis order', () => {
    for (const id of Object.keys(QUALITY_PRESETS) as (keyof typeof QUALITY_PRESETS)[]) {
      expect(matchPreset(presetQuality(id))).toBe(id);
    }
    const q = presetQuality('recommended');
    q.basisOfRecord.reverse();
    expect(matchPreset(q)).toBe('recommended');
    expect(matchPreset({ ...q, maxUncertaintyMeters: 2000 })).toBe('custom');
    expect(QUALITY_PRESETS.strict.quality.basisOfRecord).not.toContain('OCCURRENCE');
  });

  it('default query is world, recommended, GBIF only, and fresh each time', () => {
    const q = defaultQuery();
    expect(q.area).toEqual({ kind: 'world' });
    expect(q.sources).toEqual({ gbif: true, obis: false });
    expect(matchPreset(q.quality)).toBe('recommended');
    q.quality.basisOfRecord.pop();
    expect(defaultQuery().quality.basisOfRecord).toHaveLength(7);
  });
});

describe('summaries', () => {
  it('describes a query', () => {
    expect(queryTitle(felids())).toBe('Felidae · South America · 1970–2025');
    const d = describeQuery({ ...felids(), years: [2000, null], depth: [0, 200] });
    expect(d).toMatchObject({ taxa: 'Felidae', area: 'South America', years: '2000 onwards', depth: '0–200 m depth' });
    expect(d.quality).toContain('Excludes living specimen, fossil specimen');
    expect(d.quality).toContain('Coordinate uncertainty ≤ 10 km (or not reported)');
    expect(describeQuery(defaultQuery()).years).toBe('All years');
    expect(describeQuery(defaultQuery()).depth).toBeNull();
    expect(queryTitle({ ...defaultQuery(), area: { kind: 'countries', codes: ['SE'] } })).toBe('All taxa · Sweden');
  });

  it('queryKey is stable under key and set order', () => {
    const a = felids();
    const b: OccurrenceQuery = {
      sources: { obis: false, gbif: true },
      quality: { ...a.quality, basisOfRecord: [...a.quality.basisOfRecord].reverse() },
      depth: a.depth,
      years: a.years,
      area: a.area,
      taxa: a.taxa,
    };
    expect(queryKey(a)).toBe(queryKey(b));
    expect(queryKey(a)).not.toBe(queryKey({ ...a, years: [1971, 2025] }));
  });
});

describe('encoding', () => {
  it('round-trips, including unicode', () => {
    const q = { ...felids(), area: { kind: 'countries' as const, codes: ['SE', 'NO'] } };
    const s = encodeQuery(q);
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeQuery(s)).toEqual(q);
  });

  it('merges partial queries onto the default', () => {
    const s = Buffer.from(JSON.stringify({ v: 1, q: { years: [1990, null] } })).toString('base64url');
    expect(decodeQuery(s)).toEqual({ ...defaultQuery(), years: [1990, null] });
  });

  it('rejects garbage', () => {
    const enc = (x: unknown) => Buffer.from(JSON.stringify(x)).toString('base64url');
    for (const s of [
      '',
      '!!!',
      'abc',
      enc({ v: 2, q: {} }),
      enc({ v: 1, q: [] }),
      enc({ v: 1, q: { taxa: [{ name: 1 }] } }),
      enc({ v: 1, q: { area: { kind: 'bbox', bbox: [0, 0, 1] } } }),
      enc({ v: 1, q: { area: { kind: 'countries', codes: ['XX'] } } }),
      enc({ v: 1, q: { years: [1990.5, null] } }),
      enc({ v: 1, q: { quality: { basisOfRecord: ['FOO'] } } }),
      enc({ v: 1, q: { quality: { dedupe: 'all' } } }),
      enc({ v: 1, q: { sources: { gbif: 'yes' } } }),
    ]) {
      expect(decodeQuery(s)).toBeNull();
    }
  });
});

describe('isQueryRunnable', () => {
  it('needs a source and a taxon or an area', () => {
    expect(isQueryRunnable(felids())).toEqual({ ok: true });
    expect(isQueryRunnable(defaultQuery()).ok).toBe(false);
    expect(isQueryRunnable({ ...felids(), sources: { gbif: false, obis: false } })).toMatchObject({ ok: false, reason: expect.stringMatching(/source/) });
    expect(isQueryRunnable({ ...defaultQuery(), area: { kind: 'countries', codes: ['SE'] } }).ok).toBe(true);
    expect(isQueryRunnable({ ...felids(), years: [2000, 1990] }).ok).toBe(false);
  });
});
