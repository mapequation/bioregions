import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OccurrenceQuery } from '../types';
import { previewObis } from './preview';

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

const query: OccurrenceQuery = {
  taxa: [{ name: 'Delphinidae', rank: 'FAMILY', obisId: 136980 }],
  area: { kind: 'bbox', bbox: [-80, 20, 0, 70] },
  years: [1970, null],
  depth: [null, null],
  quality: {
    basisOfRecord: ['HUMAN_OBSERVATION', 'PRESERVED_SPECIMEN'],
    maxUncertaintyMeters: 1000,
    keepMissingUncertainty: true,
    excludeGeospatialIssues: true,
    excludeIntroduced: true,
    presentOnly: true,
    dedupe: 'none',
  },
  sources: { gbif: true, obis: true },
};

// Shapes observed live on 2026-10-30.
function respond(url: string): Response {
  const u = new URL(url);
  const p = u.searchParams;
  if (u.pathname.endsWith('/statistics')) {
    let records = 1000;
    if (!p.has('startdate')) records += 200;
    if (p.get('absence') === 'include') records += 50;
    if (!p.has('exclude')) records += 30;
    return json({ records, species: 24, taxa: 35, datasets: 457, specieslevel: 900, yearrange: [1970, 2026] });
  }
  if (u.pathname.endsWith('/statistics/years')) {
    return json([{ year: 2001, records: 3 }, { year: null, records: 5 }, { year: 1999, records: 7 }]);
  }
  if (u.pathname.endsWith('/checklist')) {
    return json({
      total: 3,
      results: [
        { taxonID: 136980, scientificName: 'Delphinidae', taxonRank: 'Family', records: 900 },
        { taxonID: 137111, scientificName: 'Tursiops truncatus', taxonRank: 'Species', records: 400 },
        { taxonID: 137094, scientificName: 'Delphinus delphis', taxonRank: 'Species', records: 500 },
      ],
    });
  }
  if (u.pathname.endsWith('/dataset')) {
    return json({ total: 2, results: [{ id: 'a', title: 'Sea Watch', records: '110' }, { id: 'b', title: 'Pelagis', records: '210' }] });
  }
  if (u.pathname.endsWith('/facet')) {
    return json({
      results: {
        basisOfRecord: [
          { key: 'HumanObservation', records: 900 },
          { key: 'Human observation', records: 20 },
          { key: 'Occurrence', records: 60 },
          { key: 'materialSample', records: 20 },
        ],
      },
    });
  }
  return new Response('not found', { status: 404 });
}

afterEach(() => vi.unstubAllGlobals());

describe('previewObis', () => {
  it('combines statistics, histogram, checklist, datasets, facets and filter impact', async () => {
    const fetch = vi.fn(async (url: string) => respond(url));
    vi.stubGlobal('fetch', fetch);
    const preview = await previewObis(query);
    // 5 summary calls + 3 impact calls (years, presentOnly, geospatialIssues).
    expect(fetch).toHaveBeenCalledTimes(8);
    expect(preview).toMatchObject({
      source: 'obis',
      total: 920,
      species: 24,
      datasets: 457,
      yearRange: [1970, 2026],
      years: [{ year: 1999, count: 7 }, { year: 2001, count: 3 }],
      topSpecies: [
        { key: '137094', label: 'Delphinus delphis', count: 500 },
        { key: '137111', label: 'Tursiops truncatus', count: 400 },
      ],
      topDatasets: [{ key: 'b', label: 'Pelagis', count: 210 }, { key: 'a', label: 'Sea Watch', count: 110 }],
      issues: [],
      countries: [],
      uncertainty: null,
      filterImpact: { years: 200, presentOnly: 50, geospatialIssues: 30, basisOfRecord: 80 },
    });
    expect(preview.basisOfRecord[0]).toEqual({ key: 'HUMAN_OBSERVATION', label: 'Human observation', count: 920 });
    expect(preview.filterImpact.uncertainty).toBeUndefined();
  });

  it('returns an empty preview when no taxon resolves', async () => {
    const fetch = vi.fn(async () => json({ total: 0, results: [] }));
    vi.stubGlobal('fetch', fetch);
    const preview = await previewObis({ ...query, taxa: [{ name: 'Nonexistus obisi', rank: 'SPECIES' }] });
    expect(preview.total).toBe(0);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
