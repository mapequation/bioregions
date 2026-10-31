import { describe, expect, it } from 'vitest';
import { exampleCatalog } from '../../../store/data/catalog';
import { approxNote, citationText, countsText, scopeText, sourceBadges, treeBadge } from './exampleText';

describe('treeBadge', () => {
  it('names the three tree states', () => {
    expect(treeBadge({ included: true, usedByDefault: true })).toMatchObject({
      state: 'used',
      label: 'Includes a tree',
    });
    expect(treeBadge({ included: true, usedByDefault: false })).toMatchObject({
      state: 'notUsed',
      label: 'Includes a tree · not used by default',
    });
    expect(treeBadge({ included: false, usedByDefault: false })).toMatchObject({
      state: 'none',
      label: 'No tree · find one in Phylogeny',
    });
  });

  it('covers all three states in the production catalog', () => {
    const states = new Set(exampleCatalog(false).map((e) => treeBadge(e.tree).state));
    expect([...states].sort()).toEqual(['none', 'notUsed', 'used']);
  });
});

describe('card text', () => {
  it('formats exact and approximate counts', () => {
    expect(countsText({ records: { n: 40123, approx: false }, species: { n: 38, approx: false } })).toBe(
      '40,123 records · 38 species',
    );
    expect(countsText({ records: { n: 16000, approx: true }, species: { n: 49, approx: true } })).toBe(
      '~16,000 records · ~49 species',
    );
    expect(countsText({ records: { n: 5, approx: false }, species: null })).toBe('5 records');
    expect(countsText({ records: { n: 0, approx: true }, species: null })).toBe('Record count not estimated');
  });

  it('adds the caveat only to approximate counts', () => {
    expect(approxNote({ records: { n: 1, approx: false } })).toBeNull();
    expect(approxNote({ records: { n: 1, approx: true }, asOf: '2026-10-31' })).toBe(
      'Estimated 2026-10-31; live count may differ',
    );
  });

  it('formats scope, sources and citation', () => {
    expect(scopeText({ taxon: 'Mammalia', rank: 'class', region: 'Neotropics' })).toBe('Mammalia (class) · Neotropics');
    expect(sourceBadges('GBIF + OBIS')).toEqual(['GBIF', 'OBIS']);
    expect(citationText({ kind: 'query', source: 'GBIF + OBIS' })).toMatch(/^Records stream live from GBIF and OBIS/);
    expect(citationText({ kind: 'files', source: 'x', citation: 'C' })).toBe('C');
  });

  it('gives every catalog entry a citation and counts', () => {
    for (const e of exampleCatalog(true)) {
      expect(citationText(e)).not.toBe('');
      expect(countsText(e)).toMatch(/records|not estimated/);
    }
  });
});
