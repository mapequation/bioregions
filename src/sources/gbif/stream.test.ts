import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BULK_RETRIES, MAX_CONSECUTIVE_FAILURES, retryTiming } from '../http';
import type { GbifStreamCursor, OccurrenceQuery, RecordBatch, StreamCursor } from '../types';
import { GbifGraphqlError, gbifGraphql } from './graphql';
import { BYTES_PER_RECORD, MAX_ALIASES, planGbif, planRequests, streamGbif, type GbifPlanDetail } from './stream';

// --- A fake graphql.gbif.org over an in-memory record set ------------------------

interface FakeRecord {
  speciesKey: number;
  decimalLongitude: number;
  decimalLatitude: number;
  year: number | null;
}

type Pred = Record<string, unknown>;

function polygonBox(wkt: string): [number, number, number, number] {
  const nums = [...wkt.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  const xs = nums.map((n) => n[0]);
  const ys = nums.map((n) => n[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

function matches(r: FakeRecord, p: Pred): boolean {
  const value = (key: string) => (r as unknown as Record<string, unknown>)[key];
  switch (p.type) {
    case 'and':
      return (p.predicates as Pred[]).every((q) => matches(r, q));
    case 'or':
      return (p.predicates as Pred[]).some((q) => matches(r, q));
    case 'not':
      return !matches(r, p.predicate as Pred);
    case 'equals':
      if (p.key === 'hasCoordinate' || p.key === 'taxonKey') return true;
      return String(value(p.key as string)) === p.value;
    case 'in':
      return (p.values as string[]).includes(String(value(p.key as string)));
    case 'isNull':
      return value(p.key as string) == null;
    case 'range': {
      const v = value(p.key as string) as number | null;
      const { gte, lte } = p.value as { gte?: string; lte?: string };
      return v != null && (gte == null || v >= Number(gte)) && (lte == null || v <= Number(lte));
    }
    case 'within': {
      // Edges inclusive, like GBIF.
      const [w, s, e, n] = polygonBox(p.value as string);
      return (
        r.decimalLongitude >= w &&
        r.decimalLongitude <= e &&
        r.decimalLatitude >= s &&
        r.decimalLatitude <= n
      );
    }
    default:
      throw new Error(`unsupported predicate ${String(p.type)}`);
  }
}

interface FakeServer {
  requests: string[];
  /** Latency per request in ms. */
  latency: number;
  inFlight: number;
  maxInFlight: number;
}

function fakeGbif(db: FakeRecord[], names: Map<number, string>): FakeServer {
  const server: FakeServer = { requests: [], latency: 0, inFlight: 0, maxInFlight: 0 };
  const respond = (body: { query: string; variables: Record<string, Pred> }) => {
    const { query, variables } = body;
    const select = (p: Pred) => db.filter((r) => matches(r, p));
    const facet = query.match(/speciesKey\(size: (\d+), from: (\d+)\)/);
    if (facet) {
      const rows = select(variables.p);
      const counts = new Map<number, number>();
      for (const r of rows) counts.set(r.speciesKey, (counts.get(r.speciesKey) ?? 0) + 1);
      const sorted = [...counts].sort((a, b) => b[1] - a[1]);
      const from = Number(facet[2]);
      const page = sorted.slice(from, from + Number(facet[1]));
      return {
        occurrenceSearch: {
          ...(query.includes('total') && { documents: { total: rows.length } }),
          facet: {
            speciesKey: page.map(([key, count]) => ({
              key: String(key),
              count,
              label: names.get(key) ?? null,
            })),
          },
        },
      };
    }
    const data: Record<string, unknown> = {};
    for (const m of query.matchAll(/a(\d+): occurrenceSearch\(predicate: \$p(\d+)\) \{ (\w+)(?:\(size: (\d+)\))?/g)) {
      const rows = select(variables[`p${m[2]}`]);
      if (m[3] === 'stats') {
        const years = rows.map((r) => r.year).filter((y): y is number => y != null);
        data[`a${m[1]}`] = {
          stats: { year: years.length ? { min: Math.min(...years), max: Math.max(...years) } : null },
        };
      } else if (m[4] === '0') {
        data[`a${m[1]}`] = { documents: { total: rows.length } };
      } else {
        const size = Number(m[4]);
        expect(size).toBeLessThanOrEqual(6000);
        data[`a${m[1]}`] = {
          documents: {
            results: rows.slice(0, size).map((r) => ({
              decimalLatitude: r.decimalLatitude,
              decimalLongitude: r.decimalLongitude,
              year: r.year,
              datasetKey: 'ds',
              basisOfRecord: 'PRESERVED_SPECIMEN',
              coordinateUncertaintyInMeters: null,
              countryCode: 'BR',
            })),
          },
        };
      }
    }
    return data;
  };

  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    server.requests.push(body.query);
    server.inFlight++;
    server.maxInFlight = Math.max(server.maxInFlight, server.inFlight);
    try {
      if (server.latency > 0) {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, server.latency);
          init.signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new DOMException('aborted', 'AbortError'));
          });
        });
      }
      return new Response(JSON.stringify({ data: respond(body) }), { status: 200 });
    } finally {
      server.inFlight--;
    }
  });
  return server;
}

const query: OccurrenceQuery = {
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
};

/** Deterministic pseudo-random numbers. */
function rng(seed: number) {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) % 2 ** 31;
    return x / 2 ** 31;
  };
}

function species(key: number, n: number, place: (i: number) => Omit<FakeRecord, 'speciesKey'>) {
  return Array.from({ length: n }, (_, i) => ({ speciesKey: key, ...place(i) }));
}

async function collect(gen: AsyncGenerator<RecordBatch, unknown>) {
  const batches: RecordBatch[] = [];
  let result = await gen.next();
  while (!result.done) {
    batches.push(result.value);
    result = await gen.next();
  }
  return { batches, summary: result.value as { truncated: number; reachedCap: boolean } };
}

const last = <T>(xs: T[]): T | undefined => xs[xs.length - 1];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('planRequests', () => {
  it('packs parts under 6000 records and 40 aliases', () => {
    const r = rng(1);
    const parts = Array.from({ length: 500 }, () => ({ count: 1 + Math.floor(r() * 3000) }));
    parts.push(...Array.from({ length: 200 }, () => ({ count: 1 })));
    const bins = planRequests(parts);
    expect(bins.flat()).toHaveLength(parts.length);
    for (const bin of bins) {
      expect(bin.length).toBeLessThanOrEqual(MAX_ALIASES);
      expect(bin.reduce((s, p) => s + p.count, 0)).toBeLessThanOrEqual(6000);
    }
    const total = parts.reduce((s, p) => s + p.count, 0);
    // First-fit decreasing stays close to the lower bound.
    expect(bins.length).toBeLessThan(Math.ceil(total / 6000) * 1.25 + 2);
  });
});

describe('planGbif', () => {
  it('enumerates species over facet pages and flags the cap', async () => {
    const r = rng(2);
    const names = new Map<number, string>();
    const db: FakeRecord[] = [];
    // 10 001 species forces a second facet page.
    for (let k = 1; k <= 10_001; k++) {
      names.set(k, `Genus_${k} species`);
      db.push({ speciesKey: k, decimalLongitude: r() * 10, decimalLatitude: r() * 10, year: 2000 });
    }
    const server = fakeGbif(db, names);
    const plan = await planGbif(query, { maxRecords: 5000 });
    const detail = plan.detail as GbifPlanDetail;
    expect(server.requests).toHaveLength(2);
    expect(detail.species).toHaveLength(10_001);
    expect(detail.species[0].name).toMatch(/^Genus \d+ species$/);
    expect(detail.total).toBe(10_001);
    expect(detail.exceedsCap).toBe(true);
    expect(plan.expectedRecords).toBe(10_001);
    expect(plan.estimatedBytes).toBe(10_001 * BYTES_PER_RECORD);
  });
});

describe('streamGbif', () => {
  const plan = async (db: FakeRecord[], names: Map<number, string>) => {
    const server = fakeGbif(db, names);
    return { server, plan: await planGbif(query, { maxRecords: Infinity }) };
  };

  it('packs small species and yields every record once', async () => {
    const r = rng(3);
    const names = new Map<number, string>();
    const db: FakeRecord[] = [];
    for (let k = 1; k <= 120; k++) {
      names.set(k, `Species ${k}`);
      db.push(
        ...species(k, 1 + Math.floor(r() * 400), () => ({
          decimalLongitude: r() * 360 - 180,
          decimalLatitude: r() * 180 - 90,
          year: 1950 + Math.floor(r() * 70),
        })),
      );
    }
    const { server, plan: p } = await plan(db, names);
    server.requests.length = 0;
    const { batches } = await collect(streamGbif(p, { maxRecords: Infinity }));
    const records = batches.flatMap((b) => b.records);
    expect(records).toHaveLength(db.length);
    expect(server.requests.length).toBe(Math.max(Math.ceil(db.length / 6000), 3));
    const end = last(batches)?.progress;
    expect(end).toMatchObject({ fetched: db.length, speciesDone: 120, speciesTotal: 120 });
    expect(end?.requestsDone).toBe(end?.requestsTotal);
    expect(records[0]).toMatchObject({ source: 'gbif', datasetKey: 'ds', country: 'BR' });
    expect(server.requests[server.requests.length - 1]).toContain('countryCode');
  });

  it('splits a large species spatially without duplicating edge points', async () => {
    const r = rng(4);
    const names = new Map([[1, 'Felis catus']]);
    const db = species(1, 15_000, (i) => ({
      // Some points on the quadrant edges (lon 0, lat 0, lon 90).
      decimalLongitude: i % 50 === 0 ? 0 : i % 77 === 0 ? 90 : r() * 360 - 180,
      decimalLatitude: i % 60 === 0 ? 0 : r() * 180 - 90,
      year: 2000,
    }));
    const { plan: p } = await plan(db, names);
    const { batches, summary } = await collect(streamGbif(p, { maxRecords: Infinity }));
    const records = batches.flatMap((b) => b.records);
    expect(records).toHaveLength(15_000);
    expect(records.every((x) => x.name === 'Felis catus')).toBe(true);
    expect(summary.truncated).toBe(0);
    expect(last(batches)?.progress.speciesDone).toBe(1);
    // The plan's request count is where the stream's total starts; it only grows.
    expect(p.requests).toBe(1 + Math.ceil(15_000 / 6000));
    const totals = batches.map((b) => b.progress.requestsTotal);
    expect(totals[0]).toBeGreaterThanOrEqual(p.requests);
    expect(totals.every((t, i) => i === 0 || t >= totals[i - 1])).toBe(true);
    expect(last(batches)?.progress.requestsDone).toBe(last(totals));
  });

  it('splits a dense point by year and truncates an indivisible leaf', async () => {
    const names = new Map([
      [1, 'Dense years'],
      [2, 'Dense point'],
    ]);
    const db = [
      ...species(1, 7000, (i) => ({
        decimalLongitude: 10.123,
        decimalLatitude: 10.456,
        year: i % 10 === 0 ? null : 1900 + (i % 100),
      })),
      ...species(2, 6500, () => ({ decimalLongitude: -50.5, decimalLatitude: -20.5, year: 1999 })),
    ];
    const { plan: p } = await plan(db, names);
    const { batches, summary } = await collect(streamGbif(p, { maxRecords: Infinity }));
    const records = batches.flatMap((b) => b.records);
    expect(records.filter((x) => x.name === 'Dense years')).toHaveLength(7000);
    expect(records.filter((x) => x.name === 'Dense point')).toHaveLength(6000);
    expect(summary.truncated).toBe(500);
    expect(last(batches)?.progress.truncated).toEqual([
      { name: 'Dense point', kept: 6000, total: 6500 },
    ]);
  });

  it('interleaves large species with the small-species batches', async () => {
    const r = rng(7);
    const names = new Map<number, string>([[1, 'Common']]);
    const db: FakeRecord[] = species(1, 13_000, () => ({
      decimalLongitude: r() * 360 - 180,
      decimalLatitude: r() * 180 - 90,
      year: 2001,
    }));
    for (let k = 2; k <= 31; k++) {
      names.set(k, `Rare ${k}`);
      db.push(...species(k, 5000, () => ({ decimalLongitude: r(), decimalLatitude: r(), year: 2001 })));
    }
    const { plan: p } = await plan(db, names);
    const { batches } = await collect(streamGbif(p, { maxRecords: Infinity, concurrency: 1 }));
    expect(batches.flatMap((b) => b.records)).toHaveLength(db.length);
    // Before: the common species' parts queued behind all 30 rare-species requests.
    const firstCommon = batches.findIndex((b) => b.records.some((x) => x.name === 'Common'));
    expect(firstCommon).toBeGreaterThanOrEqual(0);
    expect(firstCommon).toBeLessThan(4);
    // Its parts keep alternating with the rare batches instead of all coming last.
    const commonAt = batches.flatMap((b, i) => (b.records.some((x) => x.name === 'Common') ? [i] : []));
    expect(commonAt[commonAt.length - 1]).toBeLessThan(batches.length - 10);
    const totals = batches.map((b) => b.progress.requestsTotal);
    expect(totals[0]).toBeGreaterThanOrEqual(p.requests);
    expect(last(batches)?.progress.requestsDone).toBe(last(totals));
  });

  it('respects concurrency and stops at maxRecords', async () => {
    const r = rng(5);
    const names = new Map<number, string>();
    const db: FakeRecord[] = [];
    for (let k = 1; k <= 40; k++) {
      names.set(k, `Species ${k}`);
      db.push(...species(k, 3000, () => ({ decimalLongitude: r(), decimalLatitude: r(), year: 2001 })));
    }
    const { server, plan: p } = await plan(db, names);
    server.latency = 5;
    const { batches, summary } = await collect(
      streamGbif(p, { maxRecords: 10_000, concurrency: 2 }),
    );
    expect(server.maxInFlight).toBeLessThanOrEqual(2);
    expect(batches.flatMap((b) => b.records)).toHaveLength(10_000);
    expect(last(batches)?.progress.fetched).toBe(10_000);
    expect(summary.reachedCap).toBe(true);
  });

  it('rejects with an AbortError when aborted mid-stream', async () => {
    const r = rng(6);
    const names = new Map<number, string>();
    const db: FakeRecord[] = [];
    for (let k = 1; k <= 30; k++) {
      names.set(k, `Species ${k}`);
      db.push(...species(k, 5000, () => ({ decimalLongitude: r(), decimalLatitude: r(), year: 2001 })));
    }
    const { server, plan: p } = await plan(db, names);
    server.latency = 20;
    const controller = new AbortController();
    const gen = streamGbif(p, { maxRecords: Infinity, signal: controller.signal });
    const first = await gen.next();
    expect(first.done).toBe(false);
    controller.abort();
    await expect(gen.next()).rejects.toMatchObject({ name: 'AbortError' });
    // In-flight requests were cancelled.
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(server.inFlight).toBe(0);
    expect(server.requests.length).toBeLessThan(31);
  });
});

describe('gbifGraphql retries', () => {
  const timing = { ...retryTiming };
  beforeEach(() => Object.assign(retryTiming, { baseMs: 1, maxMs: 2 }));
  afterEach(() => Object.assign(retryTiming, timing));

  it('retries a 200 response with GraphQL errors, then succeeds', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', async () => {
      calls++;
      return calls < 3
        ? new Response(JSON.stringify({ errors: [{ message: 'Elasticsearch timeout' }] }), { status: 200 })
        : new Response(JSON.stringify({ data: { ok: 1 } }), { status: 200 });
    });
    await expect(gbifGraphql('query { ok }')).resolves.toEqual({ ok: 1 });
    expect(calls).toBe(3);
  });

  it('throws a GbifGraphqlError once the retries are used up', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', async () => {
      calls++;
      return new Response(JSON.stringify({ errors: [{ message: 'boom' }] }), { status: 200 });
    });
    await expect(gbifGraphql('query { ok }', {}, { retries: 2 })).rejects.toBeInstanceOf(GbifGraphqlError);
    expect(calls).toBe(3);
  });

  it('does not retry an abort', async () => {
    let calls = 0;
    const controller = new AbortController();
    vi.stubGlobal('fetch', async () => {
      calls++;
      controller.abort();
      return new Response(JSON.stringify({ errors: [{ message: 'boom' }] }), { status: 200 });
    });
    await expect(gbifGraphql('query { ok }', {}, { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(calls).toBe(1);
  });
});

describe('streamGbif resume and failures', () => {
  const timing = { ...retryTiming };
  beforeEach(() => Object.assign(retryTiming, { baseMs: 1, maxMs: 2 }));
  afterEach(() => Object.assign(retryTiming, timing));

  /** Species keys a request's predicates select. */
  const speciesIn = (body: { variables: Record<string, Pred> }): string[] => {
    const keys: string[] = [];
    const walk = (p: Pred) => {
      if (p.type === 'equals' && p.key === 'speciesKey') keys.push(p.value as string);
      for (const q of (p.predicates as Pred[] | undefined) ?? []) walk(q);
      if (p.predicate) walk(p.predicate as Pred);
    };
    for (const v of Object.values(body.variables)) walk(v);
    return keys;
  };

  /** Make record fetches (not counts) for which `fail` holds return HTTP 503. */
  const failFetches = (fail: (species: string[]) => boolean) => {
    const inner = globalThis.fetch;
    const state = { enabled: true, failures: 0 };
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      if (state.enabled && /results \{/.test(body.query) && fail(speciesIn(body))) {
        state.failures++;
        return new Response('down', { status: 503, statusText: 'Service Unavailable' });
      }
      return inner(url, init);
    });
    return state;
  };

  /** Each species alone in a request (4000 + 4000 > 6000). */
  const separateSpecies = (n: number) => {
    const r = rng(11);
    const names = new Map<number, string>();
    const db: FakeRecord[] = [];
    for (let k = 1; k <= n; k++) {
      names.set(k, `Species ${k}`);
      db.push(...species(k, 4000, () => ({ decimalLongitude: r() * 10, decimalLatitude: r() * 10, year: 2001 })));
    }
    return { db, names };
  };

  /** A mix of small species and two large ones that need spatial and year splits. */
  const mixedDb = () => {
    const r = rng(12);
    const names = new Map<number, string>();
    const db: FakeRecord[] = [];
    for (let k = 1; k <= 30; k++) {
      names.set(k, `Species ${k}`);
      db.push(
        ...species(k, 1 + Math.floor(r() * 500), () => ({
          decimalLongitude: r() * 360 - 180,
          decimalLatitude: r() * 180 - 90,
          year: 1950 + Math.floor(r() * 70),
        })),
      );
    }
    names.set(100, 'Big one');
    db.push(
      ...species(100, 7000, (i) => ({
        decimalLongitude: i % 40 === 0 ? 0 : r() * 360 - 180,
        decimalLatitude: r() * 180 - 90,
        year: 2000 + (i % 5),
      })),
    );
    names.set(101, 'Dense one');
    // 6200 records at one point and year: a truncated leaf.
    db.push(
      ...species(101, 6800, (i) => ({
        decimalLongitude: 1,
        decimalLatitude: 1,
        year: i < 6200 ? 2000 : i % 2 ? 1990 + (i % 10) : null,
      })),
    );
    return { db, names };
  };

  /** Records as comparable strings, sorted. */
  const keysOf = (batches: RecordBatch[]) =>
    batches
      .flatMap((b) => b.records)
      .map((x) => `${x.name}|${x.lon}|${x.lat}|${x.year}`)
      .sort();

  const finalOf = (batches: RecordBatch[]) => last(batches) as RecordBatch;

  it('skips a part that keeps failing and reports it on the final batch', async () => {
    const { db, names } = separateSpecies(5);
    fakeGbif(db, names);
    const p = await planGbif(query, { maxRecords: Infinity });
    const state = failFetches((keys) => keys.includes('3'));
    const { batches, summary } = await collect(streamGbif(p, { maxRecords: Infinity, concurrency: 2 }));
    expect(state.failures).toBe(1 + BULK_RETRIES);
    expect(batches.flatMap((b) => b.records)).toHaveLength(16_000);
    expect(batches.flatMap((b) => b.records).some((x) => x.name === 'Species 3')).toBe(false);
    const end = finalOf(batches);
    expect(end.progress).toMatchObject({
      failedParts: 1,
      lastError: 'GBIF returned HTTP 503 Service Unavailable',
    });
    expect(end.progress.stoppedEarly).toBeUndefined();
    const cursor = end.cursor as GbifStreamCursor;
    expect(cursor.done.sort()).toEqual(['1', '2', '4', '5']);
    expect(cursor.fetched).toBe(16_000);
    expect(summary).toMatchObject({ failedParts: 1, reachedCap: false });

    // Resuming fetches only the failed part, and the counters continue.
    state.enabled = false;
    const resumed = await collect(streamGbif(p, { maxRecords: Infinity, resume: cursor }));
    expect(resumed.batches.flatMap((b) => b.records)).toHaveLength(4000);
    expect(resumed.batches.flatMap((b) => b.records).every((x) => x.name === 'Species 3')).toBe(true);
    const done = finalOf(resumed.batches);
    expect(done.progress).toMatchObject({ fetched: 20_000, failedParts: 0, speciesDone: 5, speciesTotal: 5 });
    expect(done.progress.requestsDone).toBe(5);
    expect(done.progress.requestsDone).toBe(done.progress.requestsTotal);
    expect((done.cursor as GbifStreamCursor).done.sort()).toEqual(['1', '2', '3', '4', '5']);
  });

  it('stops issuing requests after consecutive failures', async () => {
    const { db, names } = separateSpecies(12);
    fakeGbif(db, names);
    const p = await planGbif(query, { maxRecords: Infinity });
    // Species 1 succeeds; every other fetch fails.
    const state = failFetches((keys) => !keys.includes('1'));
    const { batches, summary } = await collect(streamGbif(p, { maxRecords: Infinity, concurrency: 1 }));
    const end = finalOf(batches);
    expect(end.records).toEqual([]);
    expect(end.progress).toMatchObject({
      failedParts: MAX_CONSECUTIVE_FAILURES,
      stoppedEarly: 'errors',
      lastError: 'GBIF returned HTTP 503 Service Unavailable',
    });
    expect(state.failures).toBe(MAX_CONSECUTIVE_FAILURES * (1 + BULK_RETRIES));
    expect(summary).toMatchObject({ stoppedEarly: 'errors', failedParts: MAX_CONSECUTIVE_FAILURES });
    const cursor = end.cursor as GbifStreamCursor;
    expect(cursor.done.every((k) => k === '1')).toBe(true);
    expect(batches.flatMap((b) => b.records).length).toBe(cursor.done.length * 4000);
  });

  it('resumes from a mid-stream cursor without losing or duplicating records', async () => {
    const { db, names } = mixedDb();
    const { server } = { server: fakeGbif(db, names) };
    const p = await planGbif(query, { maxRecords: Infinity });
    const full = await collect(streamGbif(p, { maxRecords: Infinity, concurrency: 2 }));
    const all = keysOf(full.batches);
    const fullEnd = finalOf(full.batches).progress;
    expect(full.summary.truncated).toBeGreaterThan(0);
    server.latency = 1;

    const n = full.batches.length;
    expect(n).toBeGreaterThan(6);
    let sawSplitPart = false;
    for (const stopAfter of [1, Math.floor(n / 3), Math.floor((2 * n) / 3)]) {
      const first: RecordBatch[] = [];
      const gen = streamGbif(p, { maxRecords: Infinity, concurrency: 2 });
      for await (const batch of gen) {
        first.push(batch);
        if (first.length >= stopAfter) break;
      }
      const cursor = JSON.parse(JSON.stringify(finalOf(first).cursor)) as StreamCursor;
      expect(cursor.source).toBe('gbif');
      sawSplitPart ||= (cursor as GbifStreamCursor).done.some((k) => k.includes('@'));
      const rest = await collect(streamGbif(p, { maxRecords: Infinity, concurrency: 2, resume: cursor }));
      expect([...keysOf(first), ...keysOf(rest.batches)].sort()).toEqual(all);
      const restFirst = rest.batches[0].progress;
      expect(restFirst.fetched).toBeGreaterThan(cursor.fetched);
      const end = finalOf(rest.batches).progress;
      expect(end.fetched).toBe(fullEnd.fetched);
      expect(end.requestsDone).toBe(end.requestsTotal);
      expect(end.speciesDone).toBe(end.speciesTotal);
      // The final cursor collapses finished splits to their species.
      expect((finalOf(rest.batches).cursor as GbifStreamCursor).done).toHaveLength(names.size);
    }
    // Some stop fell inside a split species, so its finished cells were resumed by key.
    expect(sawSplitPart).toBe(true);
  }, 30_000);

  it('keeps maxRecords as the cap across a resume', async () => {
    const { db, names } = separateSpecies(5);
    fakeGbif(db, names);
    const p = await planGbif(query, { maxRecords: Infinity });
    const gen = streamGbif(p, { maxRecords: 10_000, concurrency: 1 });
    const first = (await gen.next()).value as RecordBatch;
    await gen.return({ fetched: 0, truncated: 0, requests: 0, reachedCap: false });
    const rest = await collect(streamGbif(p, { maxRecords: 10_000, concurrency: 1, resume: first.cursor }));
    expect(first.records.length + rest.batches.flatMap((b) => b.records).length).toBe(10_000);
    expect(finalOf(rest.batches).progress.fetched).toBe(10_000);
    expect(rest.summary.reachedCap).toBe(true);
  });

  it('throws an AbortError on abort, and the last cursor resumes exactly', async () => {
    const { db, names } = separateSpecies(12);
    const server = fakeGbif(db, names);
    const p = await planGbif(query, { maxRecords: Infinity });
    server.latency = 15;
    const controller = new AbortController();
    const seen: RecordBatch[] = [];
    const gen = streamGbif(p, { maxRecords: Infinity, signal: controller.signal });
    for (let i = 0; i < 3; i++) {
      const next = await gen.next();
      seen.push(next.value as RecordBatch);
    }
    controller.abort();
    await expect(gen.next()).rejects.toMatchObject({ name: 'AbortError' });
    const cursor = finalOf(seen).cursor as GbifStreamCursor;
    expect(cursor.done).toHaveLength(3);
    expect(cursor.fetched).toBe(12_000);
    server.latency = 0;
    const rest = await collect(streamGbif(p, { maxRecords: Infinity, resume: cursor }));
    const expected = db.map((x) => `${names.get(x.speciesKey)}|${x.decimalLongitude}|${x.decimalLatitude}|${x.year}`);
    expect([...keysOf(seen), ...keysOf(rest.batches)].sort()).toEqual(expected.sort());
  });

  it('rejects an invalid plan or a cursor from another source', async () => {
    const bad = { source: 'gbif', query, expectedRecords: 0, expectedSpecies: 0, requests: 0, estimatedBytes: 0, detail: {} } as const;
    await expect(streamGbif(bad, { maxRecords: 10 }).next()).rejects.toThrow('Invalid GBIF stream plan');
    const ok = { ...bad, detail: { species: [], total: 0 } };
    await expect(
      streamGbif(ok, { maxRecords: 10, resume: { source: 'obis', ranges: [], fetched: 0, requestsDone: 0 } }).next(),
    ).rejects.toThrow('obis cursor');
  });
});

// Live smoke test against graphql.gbif.org: `LIVE_API=1 pnpm exec vitest run src/sources/gbif/stream.test.ts`
describe('live', () => {
  it.skipIf(!process.env.LIVE_API)(
    'streams Felidae in South America 2015-2016',
    async () => {
      const q: OccurrenceQuery = {
        ...query,
        area: { kind: 'bbox', bbox: [-82, -56, -34, 13] },
        years: [2015, 2016],
      };
      const p = await planGbif(q, { maxRecords: Infinity });
      const { batches } = await collect(streamGbif(p, { maxRecords: Infinity }));
      const fetched = last(batches)?.progress.fetched ?? 0;
      expect(fetched).toBeGreaterThan(0.95 * p.expectedRecords);
    },
    120_000,
  );
});
