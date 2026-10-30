import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OccurrenceQuery, RecordBatch } from '../types';
import { MAX_ALIASES, planGbif, planRequests, streamGbif, type GbifPlanDetail } from './stream';

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
    expect(plan.estimatedBytes).toBe(10_001 * 150);
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
    expect(records[0]).toMatchObject({ source: 'gbif', datasetKey: 'ds' });
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
