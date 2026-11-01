import { describe, expect, it } from 'vitest';
import { palette, tones } from '@mapequation/c3';
import ColorStore, {
  COLOR_SCHEMES,
  MURAL_COLORS,
  computeBioregionColors,
  tonesFor,
  toneLightness,
  type BioregionColorOptions,
  type SchemeName,
} from './ColorStore';
import type RootStore from './RootStore';

const turbo: BioregionColorOptions = {
  scheme: 'Turbo',
  tone: 'auto',
  lightness: toneLightness('auto'),
  offset: 0,
  reverse: false,
  strength: 0,
};

// The store's setters touch no other store, so a bare root is enough
const newStore = () => new ColorStore({} as RootStore);

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
        const colors = computeBioregionColors(n, flows(n), { ...turbo, scheme });
        expect(colors).toHaveLength(n);
        for (const c of colors) expect(c).toMatch(/^#[0-9a-f]{6}$/);
        expect(new Set(colors).size).toBe(n);
      });
    }
  }

  it('is deterministic for fixed options', () => {
    const options = { ...turbo, tone: 'vivid' as const, offset: 0.3, reverse: true, strength: 0.5 };
    expect(computeBioregionColors(12, flows(12), options)).toEqual(
      computeBioregionColors(12, flows(12), options),
    );
    expect(computeBioregionColors(5, undefined, turbo)).toEqual([
      '#f3559a',
      '#86bd68',
      '#008aa8',
      '#da6a00',
      '#779bff',
    ]);
  });

  it('keeps earlier colors when the number of bioregions grows', () => {
    const few = computeBioregionColors(5, undefined, turbo);
    const many = computeBioregionColors(30, undefined, turbo);
    expect(many.slice(0, 5)).toEqual(few);
  });

  it('ignores flows at zero weight strength', () => {
    expect(computeBioregionColors(12, flows(12), turbo)).toEqual(
      computeBioregionColors(12, undefined, turbo),
    );
    expect(computeBioregionColors(12, flows(12), { ...turbo, strength: 1 })).not.toEqual(
      computeBioregionColors(12, undefined, turbo),
    );
  });

  it('uses the mural colors first for the Mural scheme', () => {
    const options = { ...turbo, scheme: 'Mural' as const };
    expect(computeBioregionColors(12, undefined, options)).toEqual(MURAL_COLORS);

    const n = MURAL_COLORS.length + 10;
    const colors = computeBioregionColors(n, flows(n), options);
    expect(colors).toHaveLength(n);
    expect(colors.slice(0, MURAL_COLORS.length)).toEqual(MURAL_COLORS);
    expect(new Set(colors).size).toBe(n);
  });
});

describe('ColorStore defaults', () => {
  it('starts on the Oklch hue circle with the strong tone, from blue', () => {
    const store = newStore();
    expect(store.scheme).toBe('Oklch');
    expect(store.tone).toBe('strong');
    expect(store.lightness).toEqual([...tones.strong.lightness]);
    expect(store.offset).toBe(245 / 360);
    expect(store.reverse).toBe(false);
  });

  it("gives c3's default Oklch palette", () => {
    const store = newStore();
    const options: BioregionColorOptions = {
      scheme: store.scheme,
      tone: store.tone,
      lightness: store.lightness,
      offset: store.offset,
      reverse: store.reverse,
      strength: 1,
    };
    const expected = (weights: number | number[]) =>
      palette(weights, {
        hue: 'Oklch',
        tone: { ...tones.strong, lightness: store.lightness },
        offset: 245,
        reverse: false,
      });
    expect(computeBioregionColors(12, flows(12), options)).toEqual(expected(flows(12)));
    expect(computeBioregionColors(12, undefined, options)).toEqual(expected(12));
  });

  it('resets the offset to the start of the new palette', () => {
    const store = newStore();
    store.setOffset(0.1);
    store.setScheme('Turbo');
    expect(store.offset).toBe(0);
    store.setOffset(0.4);
    store.setScheme('Oklch');
    expect(store.offset).toBe(245 / 360);
  });

  it("resets the tone to the palette's own: strong on Oklch, the scheme's on a scheme", () => {
    const store = newStore();
    store.setTone('pastel');
    store.setScheme('Turbo');
    expect(store.tone).toBe('auto');
    store.setTone('vivid');
    store.setScheme('Oklch');
    expect(store.tone).toBe('strong');
    expect(store.lightness).toEqual([...tones.strong.lightness]);

    expect(tonesFor('Oklch').map((t) => t.value)).not.toContain('auto');
    expect(tonesFor('Turbo').map((t) => t.value)).toContain('auto');
  });

  it('keeps Greys grey when switching from the default palette', () => {
    const store = newStore();
    store.setScheme('Greys');
    expect(store.tone).toBe('auto');
    expect(tonesFor('Greys').map((t) => t.value)).toEqual(['auto']);
    const colors = computeBioregionColors(8, undefined, {
      scheme: store.scheme,
      tone: store.tone,
      lightness: store.lightness,
      offset: store.offset,
      reverse: store.reverse,
      strength: store.strength,
    });
    for (const hex of colors) {
      const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
      expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(24);
    }
  });
});
