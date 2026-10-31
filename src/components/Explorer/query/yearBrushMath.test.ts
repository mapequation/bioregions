import { describe, expect, it } from 'vitest';
import { brushDomain, rangeShare } from './yearBrushMath';

describe('brushDomain', () => {
  it('falls back to 1900 without data', () => {
    expect(brushDomain([], null, 2026)).toEqual([1900, 2026]);
    expect(brushDomain([], 1850, 2026)).toEqual([1850, 2026]);
  });

  it('skips the sparse early tail and floors to a decade', () => {
    const bins = [
      { year: 1750, count: 1 },
      { year: 1903, count: 10 },
      { year: 1990, count: 1000 },
      { year: 2020, count: 1000 },
    ];
    expect(brushDomain(bins, null, 2026)).toEqual([1900, 2026]);
    expect(brushDomain(bins, 1800, 2026)).toEqual([1800, 2026]);
  });

  it('keeps at least ten years', () => {
    expect(brushDomain([{ year: 2025, count: 5 }], null, 2026)).toEqual([2016, 2026]);
  });
});

describe('rangeShare', () => {
  const bins = [
    { year: 2000, count: 1 },
    { year: 2010, count: 1 },
    { year: 2020, count: 2 },
  ];
  it('handles open ends', () => {
    expect(rangeShare(bins, null, null)).toBe(1);
    expect(rangeShare(bins, 2010, null)).toBe(0.75);
    expect(rangeShare(bins, null, 2009)).toBe(0.25);
    expect(rangeShare([], 2000, 2001)).toBe(0);
  });
});
