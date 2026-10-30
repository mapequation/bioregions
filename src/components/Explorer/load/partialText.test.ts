import { describe, expect, it } from 'vitest';
import { partialExplanation, partialKindOf } from './partialText';

describe('partial load wording', () => {
  it('uses the store kind when present, else infers it from species counts', () => {
    expect(partialKindOf({ kind: 'recordsTruncated', speciesLoaded: 42, speciesPlanned: 46 })).toBe('recordsTruncated');
    expect(partialKindOf({ speciesLoaded: 42, speciesPlanned: 46 })).toBe('speciesMissing');
    expect(partialKindOf({ speciesLoaded: 46, speciesPlanned: 46 })).toBe('recordsTruncated');
  });

  it('names the missing species when species never arrived', () => {
    expect(partialExplanation({ kind: 'speciesMissing', speciesLoaded: 42, speciesPlanned: 46 })).toBe(
      'Records stream species by species, so the 4 missing species are absent, not thinned.',
    );
  });

  it('says density is not representative when every species arrived', () => {
    expect(partialExplanation({ kind: 'recordsTruncated', speciesLoaded: 46, speciesPlanned: 46 })).toBe(
      'All 46 species are present, but later records were not received, so record density per species is not representative.',
    );
  });
});
