import { afterEach, describe, expect, it, vi } from 'vitest';
import { classificationPath, gbifTaxonCount, resolveGbifTaxon, suggestGbifTaxa } from './taxa';

const felidae = {
  key: 9703,
  canonicalName: 'Felidae',
  rank: 'FAMILY',
  status: 'ACCEPTED',
  synonym: false,
  kingdom: 'Animalia',
  phylum: 'Chordata',
  class: 'Mammalia',
  order: 'Carnivora',
};
const felis = {
  key: 2435022,
  canonicalName: 'Felis',
  rank: 'GENUS',
  status: 'ACCEPTED',
  synonym: false,
  kingdom: 'Animalia',
  phylum: 'Chordata',
  class: 'Mammalia',
  order: 'Carnivora',
  family: 'Felidae',
};
const pumaConcolor = {
  key: 2435099,
  canonicalName: 'Puma concolor',
  rank: 'SPECIES',
  taxonomicStatus: 'ACCEPTED',
  kingdom: 'Animalia',
  phylum: 'Chordata',
  class: 'Mammalia',
  order: 'Carnivora',
  family: 'Felidae',
  genus: 'Puma',
  vernacularName: 'Puma',
};

// Response shapes observed live on api.gbif.org (2026-10-30), trimmed.
const routes: Record<string, unknown> = {
  '/species/suggest': [
    { key: 4623905, canonicalName: 'Felisporadoceras', rank: 'GENUS', status: 'ACCEPTED' },
    { key: 7297882, canonicalName: 'Felisaria', rank: 'GENUS', status: 'DOUBTFUL' },
    felis,
    {
      key: 2435104,
      canonicalName: 'Felis concolor',
      rank: 'SPECIES',
      status: 'SYNONYM',
      synonym: true,
      parentKey: 2435098,
    },
    felidae,
  ],
  '/species/search': {
    results: [
      {
        ...felidae,
        status: undefined,
        taxonomicStatus: 'ACCEPTED',
        vernacularNames: [
          { vernacularName: 'Katzen', language: 'deu' },
          { vernacularName: 'Cats', language: 'eng' },
          { vernacularName: 'Felines', language: 'eng' },
        ],
      },
    ],
  },
  '/species/2435104': {
    key: 2435104,
    canonicalName: 'Felis concolor',
    rank: 'SPECIES',
    taxonomicStatus: 'SYNONYM',
    acceptedKey: 2435099,
  },
  '/species/2435099': pumaConcolor,
};

function stubRest(extra: Record<string, unknown> = {}) {
  const all = { ...routes, ...extra };
  const fetchMock = vi.fn(async (url: string) => {
    const path = new URL(url).pathname.replace('/v1', '');
    if (!(path in all)) {
      return new Response('not found', { status: 404 });
    }
    return new Response(JSON.stringify(all[path]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('classificationPath', () => {
  it('lists ranks above the taxon and drops the genus for species', () => {
    expect(classificationPath(felidae, 'FAMILY')).toBe('Animalia › Chordata › Mammalia › Carnivora');
    expect(classificationPath(pumaConcolor, 'SPECIES')).toBe(
      'Animalia › Chordata › Mammalia › Carnivora › Felidae',
    );
    expect(classificationPath(felidae, 'KINGDOM')).toBe('');
  });
});

describe('suggestGbifTaxa', () => {
  it('returns nothing for short queries without fetching', async () => {
    const fetchMock = stubRest();
    expect(await suggestGbifTaxa(' f ')).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('merges scientific and common names, resolves synonyms and ranks matches', async () => {
    const fetchMock = stubRest();
    const result = await suggestGbifTaxa('Felis');

    const urls = fetchMock.mock.calls.map(([u]) => String(u));
    expect(urls.some((u) => u.includes('/species/suggest?q=Felis'))).toBe(true);
    expect(urls.some((u) => u.includes('qField=VERNACULAR'))).toBe(true);
    expect(urls.filter((u) => u.includes('datasetKey=d7dddbf4'))).toHaveLength(2);

    expect(result.map((t) => t.name)).toEqual([
      // Exact match first.
      'Felis',
      // Prefix matches: higher rank first; the synonym "Felis concolor" maps to Puma concolor.
      'Felisporadoceras',
      'Puma concolor',
      // No textual match on either name.
      'Felidae',
    ]);
    expect(result.find((t) => t.name === 'Felisaria')).toBeUndefined();
    expect(result[2]).toEqual({
      name: 'Puma concolor',
      rank: 'SPECIES',
      gbifKey: 2435099,
      vernacularName: 'Puma',
      path: 'Animalia › Chordata › Mammalia › Carnivora › Felidae',
    });
    // Deduplicated: Felidae came from both endpoints and keeps the English name.
    expect(result.filter((t) => t.gbifKey === 9703)).toHaveLength(1);
    expect(result[3].vernacularName).toBe('Cats');
  });

  it('puts an exact common-name match first', async () => {
    stubRest({ '/species/suggest': [] });
    const result = await suggestGbifTaxa('cats');
    expect(result[0]).toMatchObject({ name: 'Felidae', vernacularName: 'Cats', gbifKey: 9703 });
  });

  it('still answers when one endpoint fails', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes('/species/search')
        ? new Response('bad', { status: 400 })
        : new Response(JSON.stringify([felidae]), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    expect((await suggestGbifTaxa('Felidae')).map((t) => t.name)).toEqual(['Felidae']);
  });

  it.skipIf(!process.env.LIVE_API)('finds the jaguar by common name live', async () => {
    vi.unstubAllGlobals();
    const result = await suggestGbifTaxa('jaguar');
    expect(result[0]).toMatchObject({ name: 'Panthera onca', gbifKey: 5219426 });
  });
});

describe('resolveGbifTaxon', () => {
  it('returns the accepted usage of a synonym', async () => {
    stubRest({
      '/species/match': {
        usageKey: 2435104,
        acceptedUsageKey: 2435099,
        canonicalName: 'Felis concolor',
        rank: 'SPECIES',
        status: 'SYNONYM',
        matchType: 'EXACT',
        confidence: 98,
      },
    });
    expect(await resolveGbifTaxon('Felis_concolor')).toMatchObject({
      name: 'Puma concolor',
      gbifKey: 2435099,
      rank: 'SPECIES',
    });
  });

  it('builds the taxon from an accepted match', async () => {
    const fetchMock = stubRest({
      '/species/match': {
        usageKey: 212,
        canonicalName: 'Aves',
        rank: 'CLASS',
        status: 'ACCEPTED',
        matchType: 'EXACT',
        confidence: 94,
        kingdom: 'Animalia',
        phylum: 'Chordata',
        class: 'Aves',
      },
    });
    expect(await resolveGbifTaxon('Aves')).toEqual({
      name: 'Aves',
      rank: 'CLASS',
      gbifKey: 212,
      path: 'Animalia › Chordata',
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain('verbose=false');
  });

  it('rejects missing and higher-rank matches', async () => {
    stubRest({ '/species/match': { confidence: 100, matchType: 'NONE', synonym: false } });
    expect(await resolveGbifTaxon('Xyzzy foo')).toBeNull();
    stubRest({
      '/species/match': { usageKey: 2435098, canonicalName: 'Puma', matchType: 'HIGHERRANK' },
    });
    expect(await resolveGbifTaxon('Puma nonexistens')).toBeNull();
  });
});

describe('gbifTaxonCount', () => {
  it('counts georeferenced occurrences with one GraphQL request', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify({ data: { occurrenceSearch: { documents: { total: 772648 } } } }), {
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    expect(await gbifTaxonCount(9703)).toBe(772648);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.variables.p).toEqual({
      type: 'and',
      predicates: [
        { type: 'equals', key: 'taxonKey', value: '9703' },
        { type: 'equals', key: 'hasCoordinate', value: 'true' },
      ],
    });
  });
});
