// Record validation, species-name canonicalization and cross-source deduplication.
import { normalizeSpeciesName } from '@/utils/names';
import { bboxContains } from './geo';
import type {
  AreaFilter,
  BBox,
  DedupeMode,
  DropReason,
  Funnel,
  OccurrenceRecord,
  RecordSource,
} from './types';

const GENUS = /^[A-Za-z][a-z]+$/;
const EPITHET = /^[a-z][a-z-]*[a-z]$/;
const SUBGENUS = /^\([A-Z][a-z]+\)$/;
const HYBRID = /^[×x]$/;

/** Placeholder epithets: open nomenclature, indeterminate or not a name at all. */
const BAD_EPITHETS = new Set([
  'sp',
  'spp',
  'ssp',
  'cf',
  'aff',
  'nr',
  'indet',
  'gen',
  'nov',
  'species',
  'sedis',
  'undetermined',
  'unidentified',
  'unknown',
  'undefined',
  'null',
  'none',
]);

const BAD_GENERA = new Set([
  'Incertae',
  'Unknown',
  'Unidentified',
  'Undetermined',
  'Indet',
  'Not',
  'None',
  'Null',
  'Undefined',
  'Na',
]);

/**
 * Canonical species binomial "Genus species" from a GBIF/OBIS/file name, or null.
 * Strips authorship, years and subgenus, collapses infraspecific names to the
 * species and named hybrids ("Mentha × piperita") to the binomial, and rejects
 * genus-only names, open nomenclature (sp., spp., cf., aff.), uncertain names (?),
 * hybrid formulas ("A × B") and anything that is not a Latin binomial.
 */
export function toSpeciesName(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string' || raw.includes('?')) return null;
  const tokens = raw.replace(/_/g, ' ').trim().split(/\s+/);
  let i = 0;
  // Named nothogenus, e.g. "× Triticosecale rimpaui".
  if (tokens[i] !== undefined && HYBRID.test(tokens[i])) i++;
  let genus = tokens[i++];
  if (genus === undefined) return null;
  if (genus.startsWith('×')) genus = genus.slice(1);
  if (!GENUS.test(genus)) return null;
  genus = genus[0].toUpperCase() + genus.slice(1);
  if (BAD_GENERA.has(genus)) return null;
  if (tokens[i] !== undefined && SUBGENUS.test(tokens[i])) i++;
  // Named hybrid, e.g. "Mentha × piperita".
  if (tokens[i] !== undefined && HYBRID.test(tokens[i])) i++;
  let epithet = tokens[i++];
  if (epithet === undefined) return null;
  if (epithet.startsWith('×')) epithet = epithet.slice(1);
  epithet = epithet.replace(/[.,;:]+$/, '');
  if (!EPITHET.test(epithet) || BAD_EPITHETS.has(epithet)) return null;
  // A hybrid marker later on means a formula ("Salix alba × fragilis").
  for (let j = i; j < tokens.length; j++) {
    if (HYBRID.test(tokens[j]) || tokens[j].includes('×')) return null;
  }
  return normalizeSpeciesName(`${genus} ${epithet}`);
}

const DROP_REASONS: DropReason[] = [
  'noSpecies',
  'invalidCoordinates',
  'zeroCoordinates',
  'outsideArea',
  'duplicate',
  'crossSource',
  'lowCount',
];

function emptyFunnel(): Funnel {
  return {
    received: 0,
    accepted: 0,
    dropped: Object.fromEntries(DROP_REASONS.map((r) => [r, 0])) as Record<DropReason, number>,
    bySource: {},
  };
}

export interface RecordCleanerOptions {
  dedupe: DedupeMode;
  /** Records outside a bbox area are dropped; other area kinds are trusted to the source. */
  area?: AreaFilter;
  /**
   * Canonical species names to drop per source as 'lowCount' (species below the
   * minimum records per species; a GBIF stream leaves them out at plan time already).
   */
  lowCount?: Partial<Record<RecordSource, ReadonlySet<string>>>;
  /**
   * Records loaded before this cleaner started (a Continue's earlier runs). A record with
   * the dedupe key of one of them is dropped as a 'duplicate'.
   */
  existing?: Iterable<{ name: string; lon: number; lat: number }>;
}

/** The dedupe key of a record with a canonical species name (see `RecordCleaner`). */
export function dedupeKey(mode: Exclude<DedupeMode, 'none'>, name: string, lon: number, lat: number): string {
  return mode === 'exact'
    ? `${name}|${Math.round(lon * 1e4)}|${Math.round(lat * 1e4)}`
    : `${name}|${Math.floor(lon * 100)}|${Math.floor(lat * 100)}`;
}

const SOURCE_RANK: Record<RecordSource, number> = { gbif: 0, obis: 1, file: 2 };

/** Ascending, with missing values last. */
function compareField<T extends string | number>(a: T | undefined, b: T | undefined): number {
  if (a === b) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The order that decides which of several duplicates is kept (the first): GBIF before
 * OBIS, then the earliest year, then dataset key, basis of record, the smallest coordinate
 * uncertainty, longitude, latitude and country. Missing values sort last. Records that tie
 * on all of these are interchangeable for everything the app does with them.
 */
export function compareRecords(a: OccurrenceRecord, b: OccurrenceRecord): number {
  return (
    SOURCE_RANK[a.source] - SOURCE_RANK[b.source] ||
    compareField(a.year, b.year) ||
    compareField(a.datasetKey, b.datasetKey) ||
    compareField(a.basisOfRecord, b.basisOfRecord) ||
    compareField(a.uncertainty, b.uncertainty) ||
    compareField(a.lon, b.lon) ||
    compareField(a.lat, b.lat) ||
    compareField(a.country, b.country)
  );
}

/** The records of one dedupe key. */
interface Group {
  /** The record kept so far: the first by `compareRecords`. */
  best: OccurrenceRecord;
  /** The record `accept` returned for this key: the first to arrive. */
  first: OccurrenceRecord;
  /** Position of `first` among all records `accept` returned. */
  index: number;
  /** Records per source, by `SOURCE_RANK`. */
  n: number[];
}

/** A record `accept` returned that the dedupe rule replaced once later records arrived. */
export interface SettledRecord {
  /** Position of the returned record among all records `accept` returned. */
  index: number;
  /** The record kept in its place. */
  record: OccurrenceRecord;
}

/**
 * Validates and deduplicates streamed records across all sources, counting why
 * records were dropped. Feed every batch through one cleaner per load.
 *
 * Which duplicate is kept does not depend on the order records arrive in: of the records
 * with one dedupe key, the first by `compareRecords` is kept. The others are dropped as
 * 'duplicate' when they come from the kept record's source and as 'crossSource' otherwise,
 * and the funnel counts them that way at every point of the load. `accept` returns the
 * first record of each key as soon as it arrives, so a load can draw it at once; when a
 * later record takes its place, `changes` reports the swap for the load to apply at the end.
 */
export class RecordCleaner {
  private readonly dedupe: DedupeMode;
  private readonly bbox: BBox | null;
  private readonly lowCount: Partial<Record<RecordSource, ReadonlySet<string>>>;
  /** Dedupe keys of records loaded before this cleaner (`existing`). */
  private readonly existing = new Set<string>();
  private readonly groups = new Map<string, Group>();
  /** Records `accept` returned so far. */
  private returned = 0;
  private readonly names = new Map<string, string | null>();
  private state: Funnel = emptyFunnel();

  constructor(opts: RecordCleanerOptions) {
    this.dedupe = opts.dedupe;
    this.bbox = opts.area?.kind === 'bbox' ? opts.area.bbox : null;
    this.lowCount = opts.lowCount ?? {};
    const mode = opts.dedupe;
    if (mode !== 'none' && opts.existing) {
      for (const p of opts.existing) this.existing.add(dedupeKey(mode, p.name, p.lon, p.lat));
    }
  }

  private speciesName(raw: string): string | null {
    let name = this.names.get(raw);
    if (name === undefined) {
      name = toSpeciesName(raw);
      if (this.names.size > 500_000) this.names.clear();
      this.names.set(raw, name);
    }
    return name;
  }

  private sourceCounts(source: RecordSource) {
    let c = this.state.bySource[source];
    if (!c) {
      c = { received: 0, accepted: 0 };
      this.state.bySource[source] = c;
    }
    return c;
  }

  /** Add a record to its key's group, moving the funnel's counts to the record now kept. */
  private join(g: Group, r: OccurrenceRecord, name: string): void {
    const dropped = this.state.dropped;
    const before = g.best.source;
    const nBefore = g.n[SOURCE_RANK[before]];
    g.n[SOURCE_RANK[r.source]]++;
    if (compareRecords(r, g.best) < 0) g.best = name === r.name ? r : { ...r, name };
    const after = g.best.source;
    if (after === before) {
      // One more drop, of the kept record's source or another.
      if (r.source === after) dropped.duplicate++;
      else dropped.crossSource++;
      return;
    }
    // A record from a preferred source took over: the group's drops are counted against it now.
    const total = g.n.reduce((sum, k) => sum + k, 0);
    const nAfter = g.n[SOURCE_RANK[after]];
    dropped.duplicate += nAfter - 1 - (nBefore - 1);
    dropped.crossSource += total - nAfter - (total - 1 - nBefore);
    this.sourceCounts(before).accepted--;
    this.sourceCounts(after).accepted++;
  }

  /**
   * The records that pass, with canonical names: the first record of each dedupe key
   * (all records with `dedupe: 'none'`).
   */
  accept(records: OccurrenceRecord[]): OccurrenceRecord[] {
    const out: OccurrenceRecord[] = [];
    const f = this.state;
    const dropped = f.dropped;
    const { bbox, dedupe, existing, groups } = this;
    for (const r of records) {
      const counts = this.sourceCounts(r.source);
      f.received++;
      counts.received++;
      const name = this.speciesName(r.name);
      if (name === null) {
        dropped.noSpecies++;
        continue;
      }
      if (this.lowCount[r.source]?.has(name)) {
        dropped.lowCount++;
        continue;
      }
      const { lon, lat } = r;
      if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
        dropped.invalidCoordinates++;
        continue;
      }
      if (lat === 0 && lon === 0) {
        dropped.zeroCoordinates++;
        continue;
      }
      if (bbox !== null && !bboxContains(bbox, lon, lat)) {
        dropped.outsideArea++;
        continue;
      }
      let kept: OccurrenceRecord;
      if (dedupe === 'none') {
        kept = name === r.name ? r : { ...r, name };
      } else {
        const key = dedupeKey(dedupe, name, lon, lat);
        if (existing.has(key)) {
          dropped.duplicate++;
          continue;
        }
        const g = groups.get(key);
        if (g !== undefined) {
          this.join(g, r, name);
          continue;
        }
        kept = name === r.name ? r : { ...r, name };
        const n = [0, 0, 0];
        n[SOURCE_RANK[r.source]] = 1;
        groups.set(key, { best: kept, first: kept, index: this.returned, n });
      }
      this.returned++;
      f.accepted++;
      counts.accepted++;
      out.push(kept);
    }
    return out;
  }

  /**
   * The records `accept` returned that a later record replaced, by position, with the
   * records kept in their place. Empty when the records arrived in the rule's order.
   */
  changes(): SettledRecord[] {
    const out: SettledRecord[] = [];
    for (const g of this.groups.values()) {
      if (g.best !== g.first) out.push({ index: g.index, record: g.best });
    }
    return out;
  }

  /** The records kept so far, in the order their keys first arrived (with dedupe on). */
  kept(): OccurrenceRecord[] {
    return Array.from(this.groups.values(), (g) => g.best);
  }

  /** Snapshot of the counts so far. */
  get funnel(): Funnel {
    const f = this.state;
    const bySource: Funnel['bySource'] = {};
    for (const [k, v] of Object.entries(f.bySource)) {
      if (v) bySource[k as RecordSource] = { ...v };
    }
    return { received: f.received, accepted: f.accepted, dropped: { ...f.dropped }, bySource };
  }

  reset(): void {
    this.groups.clear();
    this.returned = 0;
    this.state = emptyFunnel();
  }
}
