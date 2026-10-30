import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OccurrenceQuery } from '../types';
import {
  activeGbifFilters,
  basisOfRecordLabel,
  buildImpactRequest,
  buildSummaryRequest,
  countryLabel,
  issueLabel,
  previewGbif,
  previewGbifImpact,
  previewGbifSummary,
} from './preview';

function query(overrides: Partial<OccurrenceQuery> = {}): OccurrenceQuery {
  return {
    taxa: [{ name: 'Felidae', rank: 'FAMILY', gbifKey: 9703 }],
    area: { kind: 'world' },
    years: [null, null],
    depth: [null, null],
    quality: {
      basisOfRecord: [],
      maxUncertaintyMeters: null,
      keepMissingUncertainty: true,
      excludeGeospatialIssues: false,
      excludeIntroduced: false,
      presentOnly: false,
      dedupe: 'none',
    },
    sources: { gbif: true, obis: false },
    ...overrides,
  };
}

const filtered = query({
  years: [1990, 2020],
  quality: {
    basisOfRecord: ['HUMAN_OBSERVATION', 'PRESERVED_SPECIMEN'],
    maxUncertaintyMeters: 10_000,
    keepMissingUncertainty: true,
    excludeGeospatialIssues: true,
    excludeIntroduced: false,
    presentOnly: false,
    dedupe: 'cell',
  },
});

// Shape observed live from graphql.gbif.org (2026-10-30), trimmed.
const mainResult = {
  documents: { total: 1000 },
  cardinality: { speciesKey: 54, datasetKey: 12 },
  stats: {
    year: { min: 1990, max: 2020 },
    coordinateUncertaintyInMeters: { min: 0.11, max: 10000, avg: 1494.7 },
  },
  histogram: {
    year: {
      buckets: [
        { key: '2020', count: 30 },
        { key: '1990', count: 10 },
        { key: '1991', count: 20 },
      ],
    },
  },
  facet: {
    basisOfRecord: [{ key: 'HUMAN_OBSERVATION', count: 900 }],
    issue: [{ key: 'COORDINATE_ROUNDED', count: 300 }],
    countryCode: [{ key: 'BR', count: 400 }],
    speciesKey: [{ key: '5219426', count: 500, label: 'Panthera onca' }],
    datasetKey: [{ key: '06e98c3e', count: 600, label: 'Jaguar Movement Database' }],
  },
};

function stubGraphql(data: unknown) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
    new Response(JSON.stringify({ data }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('labels', () => {
  it('maps enums to readable labels', () => {
    expect(basisOfRecordLabel('HUMAN_OBSERVATION')).toBe('Human observation');
    expect(basisOfRecordLabel('SOMETHING_NEW')).toBe('Something new');
    expect(issueLabel('COORDINATE_ROUNDED')).toBe('Coordinate rounded');
    expect(issueLabel('GEODETIC_DATUM_ASSUMED_WGS84')).toBe('Geodetic datum assumed WGS84');
    expect(countryLabel('BR')).toBe('Brazil');
  });
});

describe('activeGbifFilters', () => {
  it('reports only filters that change the predicate', () => {
    expect(activeGbifFilters(query())).toEqual([]);
    expect(activeGbifFilters(filtered)).toEqual([
      'basisOfRecord',
      'uncertainty',
      'geospatialIssues',
      'years',
    ]);
  });

  it('treats a full basis-of-record list as inactive', () => {
    const all = query({
      quality: {
        ...query().quality,
        basisOfRecord: [
          'PRESERVED_SPECIMEN',
          'HUMAN_OBSERVATION',
          'MACHINE_OBSERVATION',
          'OCCURRENCE',
          'MATERIAL_SAMPLE',
          'MATERIAL_CITATION',
          'OBSERVATION',
          'LIVING_SPECIMEN',
          'FOSSIL_SPECIMEN',
        ],
      },
    });
    expect(activeGbifFilters(all)).toEqual([]);
  });
});

describe('buildSummaryRequest', () => {
  it('asks only for the main search, with no count aliases', () => {
    const { document, variables } = buildSummaryRequest(filtered);
    expect(document).toContain('main: occurrenceSearch(predicate: $p)');
    expect(document).toContain('histogram');
    expect(document).not.toContain('f_');
    expect(document).not.toContain('base:');
    expect(Object.keys(variables)).toEqual(['p']);
  });
});

describe('buildImpactRequest', () => {
  it('adds one count alias per active filter, each without that filter', () => {
    const request = buildImpactRequest(filtered);
    if (!request) throw new Error('expected an impact request');
    const { document, variables } = request;
    expect(document).toContain('main: occurrenceSearch(predicate: $p) { documents(size: 0) { total } }');
    expect(document).not.toContain('histogram');
    expect(document).toContain('f_years: occurrenceSearch(predicate: $p_years)');
    expect(JSON.stringify(variables.p)).toContain('"key":"year"');
    expect(JSON.stringify(variables.p_years)).not.toContain('"key":"year"');
    expect(JSON.stringify(variables.p_years)).toContain('"key":"basisOfRecord"');
  });

  it('adds one ledger-base alias with every filter omitted', () => {
    const request = buildImpactRequest(filtered);
    expect(request?.document).toContain('base: occurrenceSearch(predicate: $p_base)');
    const base = JSON.stringify(request?.variables.p_base);
    for (const key of ['year', 'basisOfRecord', 'coordinateUncertaintyInMeters']) {
      expect(base).not.toContain(`"key":"${key}"`);
    }
  });

  it('is not needed when no filter is active', async () => {
    expect(buildImpactRequest(query())).toBeNull();
    const fetchMock = stubGraphql({});
    expect(await previewGbifImpact(query())).toEqual({ filterImpact: {} });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('previewGbif', () => {
  it('summarizes the response and computes filter impact', async () => {
    const fetchMock = stubGraphql({
      main: mainResult,
      f_basisOfRecord: { documents: { total: 1100 } },
      f_uncertainty: { documents: { total: 1500 } },
      f_geospatialIssues: { documents: { total: 1010 } },
      f_years: { documents: { total: 4000 } },
      base: { documents: { total: 6000 } },
    });
    const summary = await previewGbif(filtered);

    // The fast summary and the ledger counts go out together as two requests.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const bodies = fetchMock.mock.calls.map(([url, init]) => {
      expect(url).toBe('https://graphql.gbif.org/graphql');
      return JSON.parse(String(init?.body));
    });
    expect(bodies.some((b) => b.variables.p_uncertainty != null)).toBe(true);
    expect(bodies.some((b) => Object.keys(b.variables).length === 1)).toBe(true);

    expect(summary).toMatchObject({
      source: 'gbif',
      total: 1000,
      baseTotal: 6000,
      species: 54,
      datasets: 12,
      yearRange: [1990, 2020],
      uncertainty: { min: 0.11, max: 10000, avg: 1494.7 },
      filterImpact: { basisOfRecord: 100, uncertainty: 500, geospatialIssues: 10, years: 3000 },
    });
    expect(summary.years).toEqual([
      { year: 1990, count: 10 },
      { year: 1991, count: 20 },
      { year: 2020, count: 30 },
    ]);
    expect(summary.basisOfRecord[0]).toEqual({
      key: 'HUMAN_OBSERVATION',
      label: 'Human observation',
      count: 900,
    });
    expect(summary.issues[0].label).toBe('Coordinate rounded');
    expect(summary.countries[0].label).toBe('Brazil');
    expect(summary.topSpecies[0]).toEqual({ key: '5219426', label: 'Panthera onca', count: 500 });
    expect(summary.topDatasets[0].label).toBe('Jaguar Movement Database');
  });

  it('leaves the ledger base to the impact request when a filter is active', async () => {
    stubGraphql({ main: mainResult });
    const summary = await previewGbifSummary(filtered);
    expect(summary.total).toBe(1000);
    expect(summary.baseTotal).toBeUndefined();
    expect(summary.filterImpact).toEqual({});
  });

  it('handles an empty result', async () => {
    stubGraphql({
      main: {
        documents: { total: 0 },
        cardinality: { speciesKey: 0, datasetKey: 0 },
        stats: {
          year: { min: null, max: null },
          coordinateUncertaintyInMeters: { min: null, max: null, avg: null },
        },
        histogram: { year: { buckets: [] } },
        facet: { basisOfRecord: [], issue: [], countryCode: [], speciesKey: [], datasetKey: [] },
      },
    });
    const summary = await previewGbif(query());
    expect((await previewGbifSummary(query())).baseTotal).toBe(0);
    expect(summary.total).toBe(0);
    expect(summary.baseTotal).toBe(0);
    expect(summary.yearRange).toBeNull();
    expect(summary.uncertainty).toBeNull();
    expect(summary.years).toEqual([]);
    expect(summary.filterImpact).toEqual({});
  });

  it.skipIf(!process.env.LIVE_API)('queries GBIF live', async () => {
    vi.unstubAllGlobals();
    const summary = await previewGbif(filtered);
    expect(summary.total).toBeGreaterThan(0);
    expect(summary.years.length).toBeGreaterThan(10);
    expect(summary.filterImpact.years).toBeGreaterThan(0);
  });
});
