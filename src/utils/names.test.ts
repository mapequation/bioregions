import { describe, expect, it } from 'vitest';
import { normalizeSpeciesName } from './names';

describe('normalizeSpeciesName', () => {
  it('replaces separators and capitalises the first letter', () => {
    expect(normalizeSpeciesName('abrocoma_bennettii.')).toBe(
      'Abrocoma bennettii ',
    );
  });

  it('accepts numeric names, as shapefile attribute tables can hold', () => {
    expect(normalizeSpeciesName(12)).toBe('12');
    expect(normalizeSpeciesName(1033)).toBe('1033');
  });
});
