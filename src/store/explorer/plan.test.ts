import { describe, expect, it, vi } from 'vitest';
import { BYTES_PER_RECORD, type GbifPlanDetail } from '../../sources/gbif/stream';
import { defaultQuery } from '../../sources/query';
import type { PreviewSummary, StreamPlan } from '../../sources/types';
import {
  type ObisExplorerDetail,
  applyMinRecords,
  computeEstimate,
  fetchObisChecklist,
  missingPlannedSpecies,
  planSpeciesNames,
} from './plan';

vi.mock('../../sources/http', async (orig) => ({
  ...(await orig<typeof import('../../sources/http')>()),
  fetchJson: vi.fn(),
}));
const { fetchJson } = await import('../../sources/http');

const gbifPlan = (species: [string, number][]): StreamPlan => {
  const detail: GbifPlanDetail = {
    species: species.map(([name, count], i) => ({ key: i + 1, name, count })),
    total: species.reduce((s, [, c]) => s + c, 0),
  };
  return {
    source: 'gbif',
    query: defaultQuery(),
    expectedRecords: detail.total,
    expectedSpecies: species.length,
    requests: 1,
    estimatedBytes: detail.total * 150,
    detail,
  };
};

const obisPlan = (counts: [string, number][]): StreamPlan => ({
  source: 'obis',
  query: defaultQuery(),
  expectedRecords: counts.reduce((s, [, c]) => s + c, 0),
  expectedSpecies: counts.length,
  requests: 1,
  estimatedBytes: 1000,
  speciesCounts: counts.map(([label, count], i) => ({ key: String(i), label, count })),
  detail: { params: 'taxonid=1', taxonIds: [1], unresolvedTaxa: [], clientFilter: {}, pageSize: 5000 },
});

const preview = (source: 'gbif' | 'obis', total: number, species: number): PreviewSummary => ({
  source,
  total,
  species,
  datasets: 1,
  yearRange: null,
  years: [],
  basisOfRecord: [],
  topSpecies: [],
  topDatasets: [],
  countries: [],
  issues: [],
  uncertainty: null,
  filterImpact: {},
});

describe('applyMinRecords', () => {
  it('drops GBIF species below the minimum from the species list', () => {
    const plan = applyMinRecords(gbifPlan([['Aa bb', 10], ['Cc dd', 2], ['Ee ff', 5]]), 5);
    expect((plan.detail as GbifPlanDetail).species.map((s) => s.name)).toEqual(['Aa bb', 'Ee ff']);
    expect(plan.expectedRecords).toBe(15);
    expect(plan.expectedSpecies).toBe(2);
    expect(plan.speciesCounts?.map((b) => b.count)).toEqual([10, 5]);
  });

  it('marks OBIS species below the minimum for the cleaner', () => {
    const plan = applyMinRecords(obisPlan([['Aa bb', 10], ['Cc dd var. alba', 2]]), 3);
    expect((plan.detail as ObisExplorerDetail).lowCountNames).toEqual(['Cc dd']);
    expect(plan.speciesCounts?.length).toBe(1);
    expect(plan.expectedRecords).toBe(12);
  });

  it('is a no-op without a minimum', () => {
    const plan = gbifPlan([['Aa bb', 1]]);
    expect(applyMinRecords(plan, 1).expectedRecords).toBe(1);
    expect(applyMinRecords(plan, undefined).speciesCounts?.length).toBe(1);
  });
});

describe('computeEstimate', () => {
  it('is exact from plans and flags the cap on the total', () => {
    const est = computeEstimate({
      cap: 20,
      plans: [gbifPlan([['Aa bb', 10]]), obisPlan([['Aa bb', 6], ['Cc dd', 6]])],
      previews: [],
    });
    expect(est).toMatchObject({ records: 22, species: 2, exact: true, overCap: true });
    expect(est?.seconds).toBeGreaterThan(0);
  });

  it('approximates from previews', () => {
    const est = computeEstimate({ cap: 500_000, plans: null, previews: [preview('gbif', 12_000, 40)] });
    expect(est).toMatchObject({ records: 12_000, species: 40, exact: false, overCap: false, requests: 4 });
    expect(est?.bytes).toBe(12_000 * BYTES_PER_RECORD);
  });

  it('is null without plans or previews', () => {
    expect(computeEstimate({ cap: 1, plans: null, previews: [] })).toBeNull();
  });
});

describe('fetchObisChecklist', () => {
  it('pages through the checklist and keeps species', async () => {
    const page = (n: number, from: number) =>
      Array.from({ length: n }, (_, i) => ({
        taxonID: from + i,
        scientificName: `Genus sp${from + i}`,
        taxonRank: i === 0 ? 'Genus' : 'Species',
        records: from + i + 1,
      }));
    vi.mocked(fetchJson)
      .mockResolvedValueOnce({ total: 1200, results: page(1000, 0) })
      .mockResolvedValueOnce({ total: 1200, results: page(200, 1000) });
    const out = await fetchObisChecklist('taxonid=1');
    expect(out?.length).toBe(1198);
    expect(out?.[0].count).toBe(1200);
    expect(vi.mocked(fetchJson).mock.calls[1][0]).toContain('skip=1000');
  });

  it('gives up past the page limit', async () => {
    vi.mocked(fetchJson).mockResolvedValue({
      total: 5000,
      results: Array.from({ length: 1000 }, (_, i) => ({ taxonID: i, scientificName: 'A b', records: 1 })),
    });
    expect(await fetchObisChecklist('x=1', undefined, 2)).toBeNull();
  });
});

describe('planSpeciesNames', () => {
  it('unions canonical names over sources', () => {
    expect(planSpeciesNames([applyMinRecords(gbifPlan([['Aa bb', 1]]), 1), obisPlan([['Aa bb', 2], ['Cc dd ssp. e', 1]])])).toEqual([
      'Aa bb',
      'Cc dd',
    ]);
  });
});

describe('missingPlannedSpecies', () => {
  it('lists planned species without loaded records, largest first, summed over sources', () => {
    const plans = [
      applyMinRecords(
        gbifPlan([
          ['Aa bb', 10],
          ['Ee ff', 9000],
          ['Gg hh', 40],
        ]),
        1,
      ),
      obisPlan([
        ['Aa bb', 2],
        ['Cc dd ssp. e', 30],
        ['Gg hh', 5],
      ]),
    ];
    expect(missingPlannedSpecies(plans, ['Aa bb'])).toEqual([
      { name: 'Ee ff', expected: 9000 },
      { name: 'Gg hh', expected: 45 },
      { name: 'Cc dd', expected: 30 },
    ]);
    expect(missingPlannedSpecies(plans, ['Aa bb', 'Ee ff', 'Gg hh', 'Cc dd'])).toEqual([]);
    expect(missingPlannedSpecies(plans, [], 2).map((m) => m.name)).toEqual(['Ee ff', 'Gg hh']);
    expect(missingPlannedSpecies([undefined], ['Aa bb'])).toEqual([]);
  });
});
