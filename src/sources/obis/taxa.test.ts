import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OccurrenceQuery } from '../types';
import { clearObisTaxonCache, resolveObisTaxon, resolveQueryTaxa, suggestObisTaxa } from './taxa';

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

const animal = { kingdom: 'Animalia', phylum: 'Chordata', class: 'Mammalia', order: 'Cetartiodactyla' };

beforeEach(() => clearObisTaxonCache());
afterEach(() => vi.unstubAllGlobals());

describe('suggestObisTaxa', () => {
  it('maps, deduplicates synonyms and puts an exact match first', async () => {
    const fetch = vi.fn(async () =>
      json([
        { id: 383306, scientificName: 'Delphiniceti', acceptedNameUsageID: '148723', rank: 'Superfamily', ...animal, family: null },
        { id: 383311, scientificName: 'Delphinapteridae', acceptedNameUsageID: '136980', rank: 'Family', ...animal, family: 'Delphinapteridae' },
        { id: 136980, scientificName: 'Delphinidae', acceptedNameUsageID: '136980', rank: 'Family', ...animal, family: 'Delphinidae' },
      ]),
    );
    vi.stubGlobal('fetch', fetch);
    const refs = await suggestObisTaxa('delphinidae');
    expect(String(fetch.mock.calls[0])).toContain('/taxon/complete/verbose/delphinidae');
    expect(refs).toEqual([
      { name: 'Delphinidae', rank: 'FAMILY', obisId: 136980, path: 'Animalia › Chordata › Mammalia › Cetartiodactyla' },
      { name: 'Delphiniceti', rank: 'SUPERFAMILY', obisId: 148723, path: 'Animalia › Chordata › Mammalia › Cetartiodactyla' },
    ]);
  });

  it('skips very short queries', async () => {
    vi.stubGlobal('fetch', vi.fn());
    expect(await suggestObisTaxa('d')).toEqual([]);
  });
});

describe('resolveObisTaxon', () => {
  it('prefers the accepted name, falls back to the accepted id, and caches', async () => {
    const fetch = vi.fn(async (url: string) =>
      url.includes('Delphinapteridae')
        ? json({ total: 1, results: [{ taxonID: 383311, scientificName: 'Delphinapteridae', taxonomicStatus: 'unaccepted', acceptedNameUsageID: 136980 }] })
        : url.includes('Nonexistus')
          ? json({ total: 0, results: [] })
          : json({ total: 1, results: [{ taxonID: 136984, scientificName: 'Phocoenidae', taxonomicStatus: 'accepted', acceptedNameUsageID: 136984 }] }),
    );
    vi.stubGlobal('fetch', fetch);
    expect(await resolveObisTaxon('Phocoenidae')).toBe(136984);
    expect(await resolveObisTaxon('Phocoenidae')).toBe(136984);
    expect(await resolveObisTaxon('Delphinapteridae')).toBe(136980);
    expect(await resolveObisTaxon('Nonexistus foo')).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('resolves query taxa and reports when none match', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ total: 0, results: [] })));
    const query = {
      taxa: [{ name: 'Delphinidae', rank: 'FAMILY', obisId: 136980 }, { name: 'Nonexistus', rank: 'GENUS' }],
    } as OccurrenceQuery;
    expect(await resolveQueryTaxa(query)).toEqual({ ids: [136980], unresolved: ['Nonexistus'], empty: false });
    query.taxa = [query.taxa[1]];
    expect((await resolveQueryTaxa(query)).empty).toBe(true);
  });
});
