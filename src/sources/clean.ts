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
   * minimum records per species; GBIF leaves them out at plan time already).
   */
  lowCount?: Partial<Record<RecordSource, ReadonlySet<string>>>;
}

/**
 * Validates and deduplicates streamed records across all sources, counting why
 * records were dropped. Feed every batch through one cleaner per load.
 */
export class RecordCleaner {
  private readonly dedupe: DedupeMode;
  private readonly bbox: BBox | null;
  private readonly lowCount: Partial<Record<RecordSource, ReadonlySet<string>>>;
  /** Dedupe key -> the source it was first seen from (to tell cross-source overlap from thinning). */
  private readonly seen = new Map<string, RecordSource>();
  private readonly names = new Map<string, string | null>();
  private state: Funnel = emptyFunnel();

  constructor(opts: RecordCleanerOptions) {
    this.dedupe = opts.dedupe;
    this.bbox = opts.area?.kind === 'bbox' ? opts.area.bbox : null;
    this.lowCount = opts.lowCount ?? {};
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

  /** The records that pass, with canonical names. */
  accept(records: OccurrenceRecord[]): OccurrenceRecord[] {
    const out: OccurrenceRecord[] = [];
    const f = this.state;
    const dropped = f.dropped;
    const { bbox, dedupe, seen } = this;
    let counts = records.length > 0 ? this.sourceCounts(records[0].source) : null;
    for (const r of records) {
      if (counts === null || r.source !== records[0].source) counts = this.sourceCounts(r.source);
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
      if (dedupe !== 'none') {
        const key =
          dedupe === 'exact'
            ? `${name}|${Math.round(lon * 1e4)}|${Math.round(lat * 1e4)}`
            : `${name}|${Math.floor(lon * 100)}|${Math.floor(lat * 100)}`;
        const first = seen.get(key);
        if (first !== undefined) {
          if (first === r.source) dropped.duplicate++;
          else dropped.crossSource++;
          continue;
        }
        seen.set(key, r.source);
      }
      f.accepted++;
      counts.accepted++;
      out.push(name === r.name ? r : { ...r, name });
    }
    return out;
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
    this.seen.clear();
    this.state = emptyFunnel();
  }
}
