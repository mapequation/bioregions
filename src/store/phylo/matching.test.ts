import { describe, expect, it } from 'vitest';
import type { NameMatch } from '@/phylo/otol';
import {
  joinableRows,
  largestGenera,
  matchCounts,
  nameToDatasetMap,
  namesWithStatus,
  ottToDatasetMap,
  toMatchRows,
  uniqueNames,
} from './matching';

const m = (input: string, ottId?: number, extra: Partial<NameMatch> = {}): NameMatch => ({
  input,
  ottId,
  ottName: ottId ? input : undefined,
  isSynonym: false,
  isApproximate: false,
  ...extra,
});

describe('toMatchRows', () => {
  const names = ['Puma concolor', 'Puma yagouaroundi', 'Felis catus', 'Felis catvs', 'Nonsense name'];
  const rows = toMatchRows(names, [
    m('Puma concolor', 1),
    m('Puma yagouaroundi', 2, { isSynonym: true, ottName: 'Herpailurus yagouaroundi' }),
    m('Felis catus', 3),
    m('Felis catvs', 3, { isApproximate: true, ottName: 'Felis catus' }),
    m('Nonsense name'),
  ]);

  it('classifies matches', () => {
    expect(rows.map((r) => r.status)).toEqual(['matched', 'synonym', 'matched', 'ambiguous', 'unmatched']);
    expect(rows[1].ottName).toBe('Herpailurus yagouaroundi');
    expect(matchCounts(rows)).toEqual({ matched: 2, synonym: 1, unmatched: 2 });
  });

  it('keeps one dataset name per OTT taxon, preferring the accepted name', () => {
    const dup = toMatchRows(
      ['Hapale jacchus', 'Callithrix jacchus'],
      [m('Hapale jacchus', 7, { isSynonym: true }), m('Callithrix jacchus', 7)],
    );
    expect(dup.map((r) => r.status)).toEqual(['ambiguous', 'matched']);
    expect(ottToDatasetMap(dup).get(7)).toBe('Callithrix jacchus');
  });

  it('builds join maps and copy lists', () => {
    expect(joinableRows(rows).map((r) => r.ottId)).toEqual([1, 2, 3]);
    expect(nameToDatasetMap(rows).get('Herpailurus yagouaroundi')).toBe('Puma yagouaroundi');
    expect(namesWithStatus(rows, 'unmatched')).toBe('Felis catvs\nNonsense name');
    expect(namesWithStatus(rows, 'ambiguous')).toBe('Felis catvs');
    expect(namesWithStatus(rows, 'synonym')).toBe('Puma yagouaroundi');
  });

  it('finds the largest genera', () => {
    expect(largestGenera(rows, 3, 1)).toEqual(['Felis', 'Herpailurus', 'Puma']);
    expect(largestGenera(rows)).toEqual([]);
  });
});

it('uniqueNames trims and deduplicates', () => {
  expect(uniqueNames([' A b', 'A b', '', 'C d'])).toEqual(['A b', 'C d']);
});
