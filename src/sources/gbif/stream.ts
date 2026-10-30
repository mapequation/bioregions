// Bulk streaming of GBIF occurrences through the GraphQL API.
//
// `documents(size, from)` is capped at 6000 records per search, so the query is
// partitioned by species (enumerated with the speciesKey facet). Small species are
// packed into aliased multi-search requests; species above the cap are split into
// spatial quadrants, then year halves, and a leaf that is still too large is
// truncated and reported. Requests for large species alternate with the packed small
// batches, so a stopped stream is not biased towards rare species.

import { normalizeSpeciesName } from '../../utils/names';
import { abortError, createLimiter, isAbortError, type FetchOptions } from '../http';
import { bboxQuadrants, bboxToWkt, bboxWidth, WORLD_BBOX } from '../geo';
import type {
  BBox,
  OccurrenceQuery,
  OccurrenceRecord,
  RecordBatch,
  StreamOptions,
  StreamPlan,
  StreamProgress,
} from '../types';

type Truncation = NonNullable<StreamProgress['truncated']>[number];
import { GBIF_MAX_DOCUMENTS, gbifGraphql } from './graphql';
import { type Clause, type GraphqlPredicate, gbifPredicate } from './predicate';

/** Species per facet page while planning. */
export const FACET_PAGE_SIZE = 10_000;
/** Aliased searches per request. */
export const MAX_ALIASES = 40;
/** Stop splitting a cell spatially below this width in degrees. */
export const MIN_CELL_DEGREES = 0.01;
/** Rough transfer size of one record with the streamed fields. */
export const BYTES_PER_RECORD = 168;

const RECORD_FIELDS =
  'decimalLatitude decimalLongitude year datasetKey basisOfRecord coordinateUncertaintyInMeters countryCode';

export interface GbifSpecies {
  key: number;
  name: string;
  count: number;
}

/** `StreamPlan.detail` for GBIF. */
export interface GbifPlanDetail {
  species: GbifSpecies[];
  /** Records matching the query, including records not identified to species. */
  total: number;
  /** Set when the species counts exceed `maxRecords` (the caller decides what to do). */
  exceedsCap?: boolean;
}

/** Returned by `streamGbif` when it finishes (not on abort). */
export interface GbifStreamSummary {
  fetched: number;
  /** Records left out because a leaf partition was still above the 6000-record cap. */
  truncated: number;
  requests: number;
  /** True when the stream stopped at `maxRecords`. */
  reachedCap: boolean;
}

/** One search: a species, optionally narrowed to a cell and a year range. */
interface Part {
  species: GbifSpecies;
  count: number;
  /** Cell the part was split to; `root` is the cell splitting started from. */
  cell?: { bbox: BBox; root: BBox };
  years?: [number, number] | 'missing';
}

interface FacetData {
  occurrenceSearch: {
    documents?: { total: number };
    facet: { speciesKey: { key: string; count: number; label: string | null }[] };
  };
}

interface RawRecord {
  decimalLatitude: number | null;
  decimalLongitude: number | null;
  year: number | null;
  datasetKey: string | null;
  basisOfRecord: string | null;
  coordinateUncertaintyInMeters: number | null;
  /** ISO 3166-1 alpha-2 (GraphQL `countryCode`); absent in older fixtures. */
  countryCode?: string | null;
}

type Aliased<T> = Record<string, T>;

// --- Planning ---------------------------------------------------------------------

/** Enumerate the species matching the query with their record counts. */
export async function planGbif(
  query: OccurrenceQuery,
  { maxRecords }: { maxRecords: number },
  signal?: AbortSignal,
): Promise<StreamPlan> {
  const p = gbifPredicate(query);
  const species: GbifSpecies[] = [];
  let total = 0;
  for (let from = 0; ; from += FACET_PAGE_SIZE) {
    const withTotal = from === 0 ? 'documents(size: 0) { total }' : '';
    const data = await gbifGraphql<FacetData>(
      `query($p: Predicate) { occurrenceSearch(predicate: $p) { ${withTotal}
        facet { speciesKey(size: ${FACET_PAGE_SIZE}, from: ${from}) { key count label } } } }`,
      { p },
      { signal, timeoutMs: 60_000 },
    );
    const page = data.occurrenceSearch.facet.speciesKey;
    if (from === 0) {
      total = data.occurrenceSearch.documents?.total ?? 0;
    }
    for (const { key, count, label } of page) {
      if (label && count > 0) {
        species.push({ key: Number(key), name: normalizeSpeciesName(label), count });
      }
    }
    if (page.length < FACET_PAGE_SIZE) {
      break;
    }
  }

  const expectedRecords = species.reduce((sum, s) => sum + s.count, 0);
  const detail: GbifPlanDetail = {
    species,
    total,
    ...(expectedRecords > maxRecords && { exceedsCap: true }),
  };
  return {
    source: 'gbif',
    query,
    expectedRecords,
    expectedSpecies: species.length,
    requests: plannedGbifRequests(species),
    estimatedBytes: expectedRecords * BYTES_PER_RECORD,
    detail,
  };
}

const toPart = (species: GbifSpecies): Part => ({ species, count: species.count });

/**
 * Requests still to come for a part too large for one search, at the least: the
 * fetches its records need (it is split before them, and the split request is
 * counted when it is sent). Splits often leave cells far from full, so the stream's
 * total grows past this while it runs (live runs: ~4 requests per 6000 records).
 */
export function splitFetchRequests(count: number): number {
  return Math.ceil(count / GBIF_MAX_DOCUMENTS);
}

/**
 * Requests the stream starts out with for these species: the exact packing of the
 * species that fit one search (`planRequests`, as `streamGbif` packs them), plus a
 * split and `splitFetchRequests` for each larger one. `streamGbif` reports the same
 * number as its first `requestsTotal`, which then only grows.
 */
export function plannedGbifRequests(species: GbifSpecies[]): number {
  const small = species.filter((s) => s.count <= GBIF_MAX_DOCUMENTS);
  const large = species.filter((s) => s.count > GBIF_MAX_DOCUMENTS);
  return planRequests(small.map(toPart)).length + large.reduce((sum, s) => sum + 1 + splitFetchRequests(s.count), 0);
}

/**
 * First-fit-decreasing packing of parts (each <= 6000 records) into requests of at
 * most 6000 records and `MAX_ALIASES` searches.
 */
export function planRequests<T extends { count: number }>(parts: T[]): T[][] {
  const sorted = [...parts].sort((a, b) => b.count - a.count);
  const bins: { items: T[]; size: number }[] = [];
  // Bins below this index are full in at least one dimension; skip them.
  let firstOpen = 0;
  for (const part of sorted) {
    let bin = bins.slice(firstOpen).find(
      (b) => b.size + part.count <= GBIF_MAX_DOCUMENTS && b.items.length < MAX_ALIASES,
    );
    if (!bin) {
      bin = { items: [], size: 0 };
      bins.push(bin);
    }
    bin.items.push(part);
    bin.size += part.count;
    while (
      firstOpen < bins.length &&
      (bins[firstOpen].items.length >= MAX_ALIASES || bins[firstOpen].size >= GBIF_MAX_DOCUMENTS)
    ) {
      firstOpen++;
    }
  }
  return bins.map((b) => b.items);
}

// --- Predicates -------------------------------------------------------------------

function partClauses(part: Omit<Part, 'count'>): Clause[] {
  const clauses: Clause[] = [{ op: 'equals', field: 'speciesKey', value: String(part.species.key) }];
  if (part.cell) {
    clauses.push({ op: 'within', wkt: bboxToWkt(part.cell.bbox) });
  }
  if (part.years === 'missing') {
    clauses.push({ op: 'isNull', field: 'year' });
  } else if (part.years) {
    clauses.push({ op: 'range', field: 'year', gte: part.years[0], lte: part.years[1] });
  }
  return clauses;
}

function partPredicate(query: OccurrenceQuery, part: Omit<Part, 'count'>): GraphqlPredicate {
  return gbifPredicate(query, { extra: partClauses(part) });
}

/** `query($p0: Predicate, ...) { a0: occurrenceSearch(predicate: $p0) { <body> } ... }` */
function aliasedQuery(bodies: string[]): string {
  const vars = bodies.map((_, i) => `$p${i}: Predicate`).join(', ');
  const fields = bodies.map((body, i) => `a${i}: occurrenceSearch(predicate: $p${i}) { ${body} }`);
  return `query(${vars}) { ${fields.join(' ')} }`;
}

function aliasedVariables(predicates: GraphqlPredicate[]): Record<string, GraphqlPredicate> {
  return Object.fromEntries(predicates.map((p, i) => [`p${i}`, p]));
}

/**
 * Within-boxes include their edges, so a point on a shared edge matches two cells.
 * Keep it only in the cell where it lies in the half-open box (closed at the root's
 * east and north edges).
 */
function inHalfOpenCell(cell: Part['cell'], lon: number, lat: number): boolean {
  if (!cell) {
    return true;
  }
  const [w, s, e, n] = cell.bbox;
  const [, , re, rn] = cell.root;
  return lon >= w && (lon < e || e === re) && lat >= s && (lat < n || n === rn);
}

function toRecord(raw: RawRecord, name: string): OccurrenceRecord {
  return {
    name,
    lon: raw.decimalLongitude ?? Number.NaN,
    lat: raw.decimalLatitude ?? Number.NaN,
    ...(raw.year != null && { year: raw.year }),
    source: 'gbif',
    ...(raw.datasetKey != null && { datasetKey: raw.datasetKey }),
    ...(raw.basisOfRecord != null && { basisOfRecord: raw.basisOfRecord }),
    ...(raw.coordinateUncertaintyInMeters != null && {
      uncertainty: raw.coordinateUncertaintyInMeters,
    }),
    ...(raw.countryCode && { country: raw.countryCode }),
  };
}

// --- Streaming --------------------------------------------------------------------

function rootCell(query: OccurrenceQuery): BBox {
  const { area } = query;
  // Start from the query's box when it is a plain box; otherwise from the world.
  return area.kind === 'bbox' && area.bbox[0] < area.bbox[2] ? area.bbox : WORLD_BBOX;
}

/** Lane of the packed species that fit one search (large species use their key, >= 0). */
const SMALL_LANE = -1;

type Event = { kind: 'batch'; batch: RecordBatch } | { kind: 'error'; error: unknown };

/**
 * Stream the planned records. Yields one batch per response in completion order;
 * throws an AbortError when `opts.signal` aborts.
 */
export async function* streamGbif(
  plan: StreamPlan,
  opts: StreamOptions,
): AsyncGenerator<RecordBatch, GbifStreamSummary> {
  const { query } = plan;
  const detail = plan.detail as GbifPlanDetail;
  const { maxRecords, concurrency = 4 } = opts;
  const controller = new AbortController();
  const signal = controller.signal;
  const onOuterAbort = () => controller.abort();
  opts.signal?.addEventListener('abort', onOuterAbort, { once: true });
  const request: FetchOptions = { signal, timeoutMs: 60_000 };
  const limit = createLimiter(concurrency);

  const progress: StreamProgress = {
    fetched: 0,
    expected: Math.min(plan.expectedRecords, maxRecords),
    requestsDone: 0,
    requestsTotal: 0,
    speciesDone: 0,
    speciesTotal: detail.species.length,
    bytes: 0,
  };
  /** Truncated species by key; copied into `progress.truncated`. */
  const truncations = new Map<number, Truncation>();
  let truncatedRecords = 0;
  /** Outstanding searches and splits per species, to report `speciesDone`. */
  const openParts = new Map<number, number>();
  /** Requests sent, and fetches still expected for parts waiting to be split. */
  let spawned = 0;
  let splitEstimate = 0;
  /**
   * Requests not yet handed to the limiter, in lanes: one for the packed small species
   * and one per species too large for one search (its split, then its parts). `feed`
   * alternates a small-species batch with one request of a large species, taking the
   * large lanes round-robin from the largest, so a stopped load holds part of every
   * species started rather than only the rare ones; a split's parts join its lane and
   * so never wait behind every queued small batch.
   */
  const lanes = new Map<number, (() => void)[]>();
  const largeLanes: number[] = [];
  let largeCursor = 0;
  let queued = 0;
  let smallTurn = true;
  /** `requestsTotal` starts at the plan's count and never shrinks. */
  const updateTotal = () => {
    progress.requestsTotal = Math.max(progress.requestsTotal, spawned + queued + splitEstimate);
  };
  const enqueue = (lane: number, start: () => void) => {
    let items = lanes.get(lane);
    if (!items) {
      items = [];
      lanes.set(lane, items);
      if (lane !== SMALL_LANE) largeLanes.push(lane);
    }
    items.push(start);
    queued++;
    updateTotal();
  };
  const nextLarge = (): (() => void) | undefined => {
    for (let i = 0; i < largeLanes.length; i++) {
      const at = (largeCursor + i) % largeLanes.length;
      const item = lanes.get(largeLanes[at])?.shift();
      if (item) {
        largeCursor = at + 1;
        return item;
      }
    }
    return undefined;
  };
  const takeNext = (): (() => void) | undefined => {
    const small = lanes.get(SMALL_LANE);
    if (smallTurn && small && small.length > 0) {
      smallTurn = false;
      return small.shift();
    }
    smallTurn = true;
    return nextLarge() ?? small?.shift();
  };
  const events: Event[] = [];
  let pending = 0;
  let wake: (() => void) | null = null;
  const notify = () => {
    const w = wake;
    wake = null;
    w?.();
  };
  signal.addEventListener('abort', notify, { once: true });
  // Back-pressure: tasks wait while the consumer is behind.
  const maxBuffered = 2 * concurrency;
  let room: (() => void)[] = [];
  const waitForRoom = async () => {
    while (events.length >= maxBuffered && !signal.aborted) {
      await new Promise<void>((resolve) => room.push(resolve));
    }
  };

  const openPart = (part: Part, n = 1) =>
    openParts.set(part.species.key, (openParts.get(part.species.key) ?? 0) + n);
  const closePart = (part: Part) => {
    const left = (openParts.get(part.species.key) ?? 1) - 1;
    openParts.set(part.species.key, left);
    if (left === 0) {
      progress.speciesDone = (progress.speciesDone ?? 0) + 1;
    }
  };

  /** Run one request through the limiter; errors surface through `events`. */
  const spawn = (task: () => Promise<void>) => {
    pending++;
    spawned++;
    updateTotal();
    limit(async () => {
      if (signal.aborted) {
        throw abortError();
      }
      await waitForRoom();
      if (signal.aborted) {
        throw abortError();
      }
      await task();
    })
      .catch((error: unknown) => events.push({ kind: 'error', error }))
      .finally(() => {
        pending--;
        feed();
        notify();
      });
  };

  /** Hand queued requests to the limiter while it has idle slots. */
  const feed = () => {
    while (pending < concurrency && queued > 0 && !signal.aborted) {
      const start = takeNext();
      if (!start) break;
      queued--;
      start();
    }
  };

  const fetchParts = (lane: number, parts: Part[]) => {
    for (const part of parts) {
      openPart(part);
    }
    enqueue(lane, () => spawn(async () => {
      const bodies = parts.map(
        (part) => `documents(size: ${part.count}) { results { ${RECORD_FIELDS} } }`,
      );
      const data = await gbifGraphql<Aliased<{ documents: { results: RawRecord[] } }>>(
        aliasedQuery(bodies),
        aliasedVariables(parts.map((part) => partPredicate(query, part))),
        request,
      );
      const records: OccurrenceRecord[] = [];
      let received = 0;
      parts.forEach((part, i) => {
        const results = data[`a${i}`]?.documents.results ?? [];
        received += results.length;
        for (const raw of results) {
          const record = toRecord(raw, part.species.name);
          if (inHalfOpenCell(part.cell, record.lon, record.lat)) {
            records.push(record);
          }
        }
        closePart(part);
      });
      // Count raw records, so the cap reflects transfer; trim the final batch to it.
      const room = Math.max(0, maxRecords - progress.fetched);
      const kept = records.length > room ? records.slice(0, room) : records;
      progress.fetched += Math.min(received, room);
      progress.bytes = (progress.bytes ?? 0) + JSON.stringify(data).length;
      progress.requestsDone++;
      events.push({
        kind: 'batch',
        batch: { source: 'gbif', records: kept, progress: { ...progress } },
      });
    }));
  };

  /**
   * Fetch parts that fit (packed), truncate too-large leaves, split the rest. Parts of a
   * split go to `lane` (their species'); the first call sends fitting species to the
   * small lane and each larger one to its own.
   */
  const schedule = (parts: Part[], lane?: number) => {
    const fitting: Part[] = [];
    for (const part of parts) {
      if (part.count <= 0) {
        continue;
      }
      if (part.count <= GBIF_MAX_DOCUMENTS) {
        fitting.push(part);
      } else if (!part.cell || bboxWidth(part.cell.bbox) >= MIN_CELL_DEGREES * 2) {
        splitEstimate += splitFetchRequests(part.count);
        splitSpatially(part, lane ?? part.species.key);
      } else if (part.years !== 'missing' && (!part.years || part.years[0] < part.years[1])) {
        splitEstimate += splitFetchRequests(part.count);
        splitByYear(part, lane ?? part.species.key);
      } else {
        const t = truncations.get(part.species.key) ?? {
          name: part.species.name,
          kept: 0,
          total: 0,
        };
        t.kept += GBIF_MAX_DOCUMENTS;
        t.total += part.count;
        truncations.set(part.species.key, t);
        truncatedRecords += part.count - GBIF_MAX_DOCUMENTS;
        progress.truncated = [...truncations.values()].map((x) => ({ ...x }));
        fitting.push({ ...part, count: GBIF_MAX_DOCUMENTS });
      }
    }
    for (const group of planRequests(fitting)) {
      fetchParts(lane ?? SMALL_LANE, group);
    }
  };

  /** Count the four quadrants of the part's cell in one request. */
  const splitSpatially = (part: Part, lane: number) => {
    openPart(part);
    enqueue(lane, () => spawn(async () => {
      const root = part.cell?.root ?? rootCell(query);
      const children: Part[] = bboxQuadrants(part.cell?.bbox ?? root).map((bbox) => ({
        ...part,
        cell: { bbox, root },
        count: 0,
      }));
      const data = await gbifGraphql<Aliased<{ documents: { total: number } }>>(
        aliasedQuery(children.map(() => 'documents(size: 0) { total }')),
        aliasedVariables(children.map((child) => partPredicate(query, child))),
        request,
      );
      children.forEach((child, i) => {
        child.count = data[`a${i}`]?.documents.total ?? 0;
      });
      progress.requestsDone++;
      splitEstimate -= splitFetchRequests(part.count);
      schedule(children, lane);
      updateTotal();
      closePart(part);
    }));
  };

  /** Split a narrow cell by year: first find its year range, then halve it. */
  const splitByYear = (part: Part, lane: number) => {
    openPart(part);
    enqueue(lane, () => spawn(async () => {
      let children: Part[];
      if (part.years && part.years !== 'missing') {
        const [lo, hi] = part.years;
        const mid = Math.floor((lo + hi) / 2);
        children = [
          { ...part, years: [lo, mid], count: 0 },
          { ...part, years: [mid + 1, hi], count: 0 },
        ];
        const data = await gbifGraphql<Aliased<{ documents: { total: number } }>>(
          aliasedQuery(children.map(() => 'documents(size: 0) { total }')),
          aliasedVariables(children.map((child) => partPredicate(query, child))),
          request,
        );
        children.forEach((child, i) => {
          child.count = data[`a${i}`]?.documents.total ?? 0;
        });
      } else {
        const missing: Part = { ...part, years: 'missing', count: 0 };
        const data = await gbifGraphql<{
          a0: { stats: { year: { min: number | null; max: number | null } | null } };
          a1: { documents: { total: number } };
        }>(
          aliasedQuery(['stats { year { min max } }', 'documents(size: 0) { total }']),
          aliasedVariables([partPredicate(query, part), partPredicate(query, missing)]),
          request,
        );
        missing.count = data.a1?.documents.total ?? 0;
        const { min, max } = data.a0?.stats.year ?? { min: null, max: null };
        children = [missing];
        if (min != null && max != null) {
          children.push({ ...part, years: [min, max], count: part.count - missing.count });
        }
      }
      progress.requestsDone++;
      splitEstimate -= splitFetchRequests(part.count);
      schedule(children, lane);
      updateTotal();
      closePart(part);
    }));
  };

  const summary = () => ({
    fetched: progress.fetched,
    truncated: truncatedRecords,
    requests: progress.requestsDone,
  });

  try {
    // Largest first, so the large lanes start in size order.
    schedule([...detail.species].sort((a, b) => b.count - a.count).map(toPart));
    feed();
    while (true) {
      if (opts.signal?.aborted) {
        throw abortError();
      }
      const event = events.shift();
      if (event) {
        for (const resolve of room) {
          resolve();
        }
        room = [];
        if (event.kind === 'error') {
          if (isAbortError(event.error) && opts.signal?.aborted) {
            throw abortError();
          }
          throw event.error;
        }
        yield event.batch;
        if (progress.fetched >= maxRecords) {
          return { ...summary(), reachedCap: true };
        }
        continue;
      }
      if (pending === 0) {
        return { ...summary(), reachedCap: false };
      }
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
    }
  } finally {
    // Stops in-flight requests when the consumer breaks out, a request fails or the cap is hit.
    controller.abort();
    opts.signal?.removeEventListener('abort', onOuterAbort);
    for (const resolve of room) {
      resolve();
    }
  }
}
