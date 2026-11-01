import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BULK_RETRIES, MAX_CONSECUTIVE_FAILURES, retryTiming } from '../http';
import type { ObisStreamCursor, OccurrenceQuery, RecordBatch } from '../types';
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
        countryCode: 'us ',
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
      country: 'US',
    });
    // Not an ISO alpha-2 code: left out.
    expect(
      toOccurrenceRecord({ id: 'x', species: 'Tursiops truncatus', decimalLatitude: 1, decimalLongitude: 2, countryCode: 'USA' }).country,
    ).toBeUndefined();
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

describe('streamObis resume and failures', () => {
  const timing = { ...retryTiming };
  beforeEach(() => Object.assign(retryTiming, { baseMs: 1, maxMs: 2 }));
  afterEach(() => Object.assign(retryTiming, timing));

  /** A fake OBIS whose records are told apart by longitude; `fail` picks pages to fail. */
  function setup(n: number) {
    const server = fakeObis(n);
    for (const [i, row] of server.rows.entries()) row.decimalLongitude = -30 + i * 1e-5;
    const state = { fail: (_after: string) => false, failures: 0 };
    vi.stubGlobal('fetch', async (url: string) => {
      const u = new URL(url);
      if (u.pathname.endsWith('/occurrence') && state.fail(u.searchParams.get('after') ?? '')) {
        state.failures++;
        return new Response('down', { status: 503, statusText: 'Service Unavailable' });
      }
      return server.fetch(url);
    });
    return { ...server, state };
  }
  const lons = (batches: RecordBatch[]) => batches.flatMap((b) => b.records.map((r) => r.lon)).sort();
  const finalOf = (batches: RecordBatch[]) => batches[batches.length - 1];

  it('skips a failing range, reports it, and resumes it from the cursor', async () => {
    const { state } = setup(60_000);
    const plan = await planObis(query());
    const full = lons(await collect(streamObis(plan, { maxRecords: 1e9 })));

    // The range "4"-"8" (rows 15 000-29 999) fails at its third page, after row 24 999.
    state.fail = (after) => after >= '6' && after < '8';
    const first = await collect(streamObis(plan, { maxRecords: 1e9 }));
    expect(state.failures).toBe(1 + BULK_RETRIES);
    const end = finalOf(first);
    expect(end.progress).toMatchObject({
      failedParts: 1,
      lastError: 'OBIS returned HTTP 503 Service Unavailable',
      stoppedEarly: 'errors',
      fetched: 55_000,
    });
    const cursor = end.cursor as ObisStreamCursor;
    expect(cursor.ranges.map((r) => r.done)).toEqual([true, false, true, true]);
    expect(cursor.ranges[1]).toMatchObject({ end: '8' });
    expect(cursor.ranges[1].after?.startsWith('6')).toBe(true);
    expect(cursor).toMatchObject({ fetched: 55_000, requestsDone: end.progress.requestsDone });

    state.fail = () => false;
    const rest = await collect(streamObis(plan, { maxRecords: 1e9, resume: cursor }));
    expect([...lons(first), ...lons(rest)].sort()).toEqual(full);
    const done = finalOf(rest);
    expect(done.progress).toMatchObject({ fetched: 60_000, failedParts: 0 });
    expect(done.progress.stoppedEarly).toBeUndefined();
    expect(done.progress.requestsDone).toBe(cursor.requestsDone + 2);
    expect((done.cursor as ObisStreamCursor).ranges.every((r) => r.done)).toBe(true);
  });

  it('resumes from a mid-stream cursor without losing or duplicating records', async () => {
    setup(43_210);
    const plan = await planObis(query());
    const full = lons(await collect(streamObis(plan, { maxRecords: 1e9 })));
    for (const stopAfter of [1, 3, 6]) {
      const first: RecordBatch[] = [];
      for await (const batch of streamObis(plan, { maxRecords: 1e9 })) {
        first.push(batch);
        if (first.length >= stopAfter) break;
      }
      const cursor = JSON.parse(JSON.stringify(finalOf(first).cursor)) as ObisStreamCursor;
      const rest = await collect(streamObis(plan, { maxRecords: 1e9, resume: cursor }));
      expect([...lons(first), ...lons(rest)].sort()).toEqual(full);
      expect(rest[0].progress.fetched).toBeGreaterThan(cursor.fetched);
      expect(finalOf(rest).progress).toMatchObject({ fetched: 43_210 });
    }
  });

  it('keeps maxRecords as the cap across a resume', async () => {
    setup(30_000);
    const plan = await planObis(query());
    const gen = streamObis(plan, { maxRecords: 12_000, concurrency: 1 });
    const first = (await gen.next()).value as RecordBatch;
    await gen.return(undefined);
    const rest = await collect(streamObis(plan, { maxRecords: 12_000, concurrency: 1, resume: first.cursor }));
    expect(finalOf(rest).progress.fetched).toBe(12_000);
    const raw = (first.cursor as ObisStreamCursor).fetched;
    expect(raw).toBe(5000);
  });

  it('stops after consecutive failures', async () => {
    const { state } = setup(200_000);
    const plan = await planObis(query());
    state.fail = () => true;
    const batches = await collect(streamObis(plan, { maxRecords: 1e9, concurrency: 8 }));
    expect(batches).toHaveLength(1);
    expect(batches[0].records).toEqual([]);
    expect(batches[0].progress).toMatchObject({
      failedParts: MAX_CONSECUTIVE_FAILURES,
      stoppedEarly: 'errors',
      fetched: 0,
    });
    expect((batches[0].cursor as ObisStreamCursor).ranges.every((r) => !r.done)).toBe(true);
  });

  it('throws an AbortError on abort, and the last cursor resumes exactly', async () => {
    setup(50_000);
    const plan = await planObis(query());
    const full = lons(await collect(streamObis(plan, { maxRecords: 1e9 })));
    const controller = new AbortController();
    const seen: RecordBatch[] = [];
    const gen = streamObis(plan, { maxRecords: 1e9, signal: controller.signal });
    for (let i = 0; i < 3; i++) seen.push((await gen.next()).value as RecordBatch);
    controller.abort();
    await expect(gen.next()).rejects.toMatchObject({ name: 'AbortError' });
    const rest = await collect(streamObis(plan, { maxRecords: 1e9, resume: finalOf(seen).cursor }));
    expect([...lons(seen), ...lons(rest)].sort()).toEqual(full);
  });
});
