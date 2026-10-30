import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OccurrenceQuery, RecordBatch } from '../types';
import { normalizeObisBasis, toOccurrenceRecord } from './records';
import { idRanges, planObis, streamObis } from './stream';

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

const query = (quality = {}): OccurrenceQuery => ({
  taxa: [{ name: 'Delphinidae', rank: 'FAMILY', obisId: 136980 }],
  area: { kind: 'bbox', bbox: [-80, 20, 0, 70] },
  years: [null, null],
  depth: [null, null],
  quality: {
    basisOfRecord: [],
    maxUncertaintyMeters: null,
    keepMissingUncertainty: true,
    excludeGeospatialIssues: false,
    excludeIntroduced: false,
    presentOnly: true,
    dedupe: 'none',
    ...quality,
  },
  sources: { gbif: false, obis: true },
});

/** A fake OBIS with `n` records whose ids spread over the UUID space, sorted by id. */
function fakeObis(n: number) {
  const rows = Array.from({ length: n }, (_, i) => {
    const hex = Math.floor((i / n) * 0xffffffff).toString(16).padStart(8, '0');
    return {
      id: `${hex}-0000-4000-8000-${String(i).padStart(12, '0')}`,
      ...(i % 10 !== 0 && { species: 'Tursiops truncatus' }),
      scientificName: i % 10 !== 0 ? 'Tursiops truncatus' : 'Delphinidae',
      decimalLatitude: 40,
      decimalLongitude: -30,
      date_year: 2000,
      dataset_id: 'ds',
      basisOfRecord: i % 2 ? 'HumanObservation' : 'PreservedSpecimen',
      ...(i % 3 === 0 && { coordinateUncertaintyInMeters: i % 2 ? 50 : 5000 }),
    };
  });
  const sizes: number[] = [];
  const fetch = vi.fn(async (url: string) => {
    const u = new URL(url);
    if (u.pathname.endsWith('/statistics')) {
      return json({ records: n, species: 1, datasets: 1, yearrange: [2000, 2000] });
    }
    const after = u.searchParams.get('after') ?? '';
    const size = Number(u.searchParams.get('size'));
    sizes.push(size);
    expect(size).toBeLessThanOrEqual(10_000);
    expect(u.searchParams.get('fields')).toContain('decimalLongitude');
    return json({ total: n, results: rows.filter((r) => r.id > after).slice(0, size) });
  });
  return { rows, fetch, sizes };
}

async function collect(stream: AsyncGenerator<RecordBatch>) {
  const batches: RecordBatch[] = [];
  for await (const batch of stream) batches.push(batch);
  return batches;
}

afterEach(() => vi.unstubAllGlobals());

describe('records', () => {
  it('normalizes basis of record and species names', () => {
    expect(normalizeObisBasis('Human observation')).toBe('HUMAN_OBSERVATION');
    expect(normalizeObisBasis('MATERIAL_SAMPLE')).toBe('MATERIAL_SAMPLE');
    expect(normalizeObisBasis('O')).toBe('OCCURRENCE');
    expect(
      toOccurrenceRecord({ id: 'x', scientificName: 'Delphinidae', decimalLatitude: 1, decimalLongitude: 2 }).name,
    ).toBe('');
    expect(
      toOccurrenceRecord({
        id: 'x',
        species: 'Tursiops truncatus',
        decimalLatitude: 1,
        decimalLongitude: 2,
        date_year: 1999,
        dataset_id: 'd',
        basisOfRecord: 'HumanObservation',
        coordinateUncertaintyInMeters: '25',
      }),
    ).toEqual({
      name: 'Tursiops truncatus',
      lon: 2,
      lat: 1,
      year: 1999,
      source: 'obis',
      datasetKey: 'd',
      basisOfRecord: 'HUMAN_OBSERVATION',
      uncertainty: 25,
    });
  });

  it('splits the id space into ranges', () => {
    expect(idRanges(1)).toEqual([{ after: undefined, end: undefined }]);
    expect(idRanges(4)).toEqual([
      { after: undefined, end: '4' },
      { after: '4', end: '8' },
      { after: '8', end: 'c' },
      { after: 'c', end: undefined },
    ]);
  });
});

describe('planObis / streamObis', () => {
  it('streams every record exactly once across parallel id ranges', async () => {
    const { fetch } = fakeObis(23_456);
    vi.stubGlobal('fetch', fetch);
    const plan = await planObis(query());
    expect(plan).toMatchObject({ expectedRecords: 23_456, requests: 5 });
    const batches = await collect(streamObis(plan, { maxRecords: 1e9 }));
    const total = batches.reduce((sum, b) => sum + b.records.length, 0);
    expect(total).toBe(23_456);
    const last = batches[batches.length - 1].progress;
    expect(last).toMatchObject({ fetched: 23_456, expected: 23_456 });
    expect(last.requestsTotal).toBe(last.requestsDone);
    expect(batches.every((b) => b.source === 'obis')).toBe(true);
  });

  it('respects maxRecords and applies client-side filters', async () => {
    const { fetch } = fakeObis(30_000);
    vi.stubGlobal('fetch', fetch);
    const plan = await planObis(
      query({ basisOfRecord: ['HUMAN_OBSERVATION'], maxUncertaintyMeters: 100, keepMissingUncertainty: false }),
      { maxRecords: 7000 },
    );
    expect(plan.requests).toBe(2);
    const batches = await collect(streamObis(plan, { maxRecords: 7000, concurrency: 1 }));
    const records = batches.flatMap((b) => b.records);
    expect(batches[batches.length - 1].progress.fetched).toBe(7000);
    expect(records.length).toBeGreaterThan(0);
    expect(records.every((r) => r.basisOfRecord === 'HUMAN_OBSERVATION' && r.uncertainty === 50)).toBe(true);
  });

  it('stops with an AbortError when aborted', async () => {
    const { fetch } = fakeObis(50_000);
    vi.stubGlobal('fetch', fetch);
    const plan = await planObis(query());
    const controller = new AbortController();
    const run = async () => {
      for await (const _ of streamObis(plan, { maxRecords: 1e9, signal: controller.signal })) {
        controller.abort();
      }
    };
    await expect(run()).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('plans nothing when no taxon resolves', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ total: 0, results: [] })));
    const plan = await planObis({ ...query(), taxa: [{ name: 'Nonexistus obisi', rank: 'SPECIES' }] });
    expect(plan.expectedRecords).toBe(0);
    expect(await collect(streamObis(plan, { maxRecords: 100 }))).toEqual([]);
  });
});
