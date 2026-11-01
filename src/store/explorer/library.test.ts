import { describe, expect, it } from 'vitest';
import { defaultQuery, encodeQuery, queryKey } from '../../sources/query';
import { exampleStudies } from './examples';
import { parseQueryText, pushRecent } from './library';
import type { SavedQuery } from './types';

describe('parseQueryText', () => {
  const q = { ...defaultQuery(), taxa: [{ name: 'Felidae', rank: 'FAMILY', gbifKey: 9703 }] };

  it('accepts a bare query, a wrapped query and a share string', () => {
    for (const text of [JSON.stringify(q), JSON.stringify({ v: 1, q }), encodeQuery(q)]) {
      const r = parseQueryText(text);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.query.taxa[0].gbifKey).toBe(9703);
    }
  });

  it('rejects garbage and invalid fields', () => {
    expect(parseQueryText('').ok).toBe(false);
    expect(parseQueryText('not json').ok).toBe(false);
    expect(parseQueryText('[1,2]').ok).toBe(false);
    expect(parseQueryText(JSON.stringify({ years: 'soon' })).ok).toBe(false);
  });
});

describe('pushRecent', () => {
  it('keeps the newest entry per query and at most max entries', () => {
    const e = (id: string, year: number): SavedQuery => ({
      id,
      name: id,
      savedAt: '',
      query: { ...defaultQuery(), years: [year, null] },
    });
    let list = [e('a', 2000), e('b', 2001)];
    list = pushRecent(list, e('c', 2000), queryKey, 2);
    expect(list.map((s) => s.id)).toEqual(['c', 'b']);
  });
});

describe('exampleStudies', () => {
  it('has six runnable examples with GBIF keys', () => {
    const ex = exampleStudies();
    expect(ex).toHaveLength(6);
    for (const s of ex) {
      expect(s.query.taxa[0].gbifKey).toBeTypeOf('number');
      expect(parseQueryText(JSON.stringify(s.query)).ok).toBe(true);
    }
    expect(ex.filter((s) => s.query.sources.obis).map((s) => s.query.taxa[0].obisId)).toEqual([136980, 1363]);
  });
});
