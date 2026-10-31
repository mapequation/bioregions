import { describe, expect, it } from 'vitest';
import {
  COLOR_SCHEMES,
  MURAL_COLORS,
  computeBioregionColors,
  toneLightness,
  type BioregionColorOptions,
  type SchemeName,
} from './ColorStore';

const defaults: BioregionColorOptions = {
  scheme: 'Turbo',
  tone: 'auto',
  lightness: toneLightness('auto'),
  offset: 0,
  reverse: false,
  strength: 0,
};

const flows = (n: number) => {
  const raw = Array.from({ length: n }, (_, i) => 1 / (i + 1));
  const total = raw.reduce((a, b) => a + b, 0);
  return raw.map((f) => f / total);
};

describe('computeBioregionColors', () => {
  const schemes = COLOR_SCHEMES.map((s) => s.value as SchemeName).filter((s) => s !== 'Mural');

  for (const scheme of schemes) {
    for (const n of [5, 12, 30]) {
      it(`gives ${n} distinct hex colors for ${scheme}`, () => {
        const colors = computeBioregionColors(n, flows(n), { ...defaults, scheme });
        expect(colors).toHaveLength(n);
        for (const c of colors) expect(c).toMatch(/^#[0-9a-f]{6}$/);
        expect(new Set(colors).size).toBe(n);
      });
    }
  }

  it('is deterministic for fixed options', () => {
    const options = { ...defaults, tone: 'vivid' as const, offset: 0.3, reverse: true, strength: 0.5 };
    expect(computeBioregionColors(12, flows(12), options)).toEqual(
      computeBioregionColors(12, flows(12), options),
    );
    expect(computeBioregionColors(5, undefined, defaults)).toEqual([
      '#f3559a',
      '#86bd68',
      '#008aa8',
      '#da6a00',
      '#779bff',
    ]);
  });

  it('keeps earlier colors when the number of bioregions grows', () => {
    const few = computeBioregionColors(5, undefined, defaults);
    const many = computeBioregionColors(30, undefined, defaults);
    expect(many.slice(0, 5)).toEqual(few);
  });

  it('ignores flows at zero weight strength', () => {
    expect(computeBioregionColors(12, flows(12), defaults)).toEqual(
      computeBioregionColors(12, undefined, defaults),
    );
    expect(computeBioregionColors(12, flows(12), { ...defaults, strength: 1 })).not.toEqual(
      computeBioregionColors(12, undefined, defaults),
    );
  });

  it('uses the mural colors first for the Mural scheme', () => {
    const options = { ...defaults, scheme: 'Mural' as const };
    expect(computeBioregionColors(12, undefined, options)).toEqual(MURAL_COLORS);

    const n = MURAL_COLORS.length + 10;
    const colors = computeBioregionColors(n, flows(n), options);
    expect(colors).toHaveLength(n);
    expect(colors.slice(0, MURAL_COLORS.length)).toEqual(MURAL_COLORS);
    expect(new Set(colors).size).toBe(n);
  });
});
