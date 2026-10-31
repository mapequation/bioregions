import { describe, expect, it } from 'vitest';
import { EXAMPLE_CITATION_PLACEHOLDER, exampleCatalog } from './catalog';

describe('exampleCatalog', () => {
  const all = exampleCatalog(true);
  const production = exampleCatalog(false);

  it('hides dev-only entries outside development', () => {
    expect(all.some((e) => e.devOnly)).toBe(true);
    expect(production.some((e) => e.devOnly)).toBe(false);
    expect(production.length).toBe(all.filter((e) => !e.devOnly).length);
  });

  it('gives every entry a unique id', () => {
    expect(new Set(all.map((e) => e.id)).size).toBe(all.length);
  });

  it.each(exampleCatalog(false).map((e) => [e.id, e] as const))('describes %s fully', (_id, e) => {
    expect(e.title).toBeTruthy();
    expect(e.why).toBeTruthy();
    expect(e.taxon).toBeTruthy();
    expect(e.region).toBeTruthy();
    expect(e.source).toBeTruthy();
    expect(e.records.n).toBeGreaterThan(0);
    expect(e.size).toBeTruthy();
    expect(e.tree.included).toBe(Boolean(e.files?.tree));
    if (e.kind === 'files') {
      expect(e.files?.species).toMatch(/^\/bioregions\/data\//);
      expect(e.citation).toBeTruthy();
      expect(e.records.approx).toBe(false);
    } else {
      expect(e.query).toBeDefined();
      expect(e.records.approx).toBe(true);
      expect(e.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('marks a bundled tree that is off by default', () => {
    const global = all.find((e) => e.id === 'mammals-global');
    expect(global?.tree).toEqual({ included: true, usedByDefault: false });
    const neotropics = all.find((e) => e.id === 'mammals-neotropics');
    expect(neotropics?.tree).toEqual({ included: true, usedByDefault: true });
    expect(neotropics?.citation).toBe(EXAMPLE_CITATION_PLACEHOLDER);
  });

  it('labels query sources and sizes', () => {
    const dolphins = all.find((e) => e.id === 'example-dolphins');
    expect(dolphins?.source).toBe('GBIF + OBIS');
    expect(dolphins?.size).toBe('Streams live from GBIF and OBIS · ~170 MB');
    expect(dolphins?.rank).toBe('family');
    const marmosets = all.find((e) => e.id === 'example-marmosets');
    expect(marmosets?.source).toBe('GBIF');
    expect(marmosets?.size).toBe('Streams live from GBIF · ~2.7 MB');
  });
});
