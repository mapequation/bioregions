// Pure helpers for the decision ledger's "Cleaning · in order" section and the load-outcome wording.
import type { Funnel } from '../../../sources/types';
import { fmtInt, fmtPct } from '../format';
import { partialExplanation } from '../load/partialText';

const SOURCE_LABEL: Record<string, string> = { gbif: 'GBIF', obis: 'OBIS', file: 'File' };

export interface CleaningStep {
  id: 'received' | 'invalid' | 'outside' | 'crossSource' | 'duplicate' | 'lowCount' | 'accepted';
  label: string;
  value: number;
  kind: 'start' | 'drop' | 'end';
  /** Waterfall bar start (records), for drops. */
  start: number;
  note?: string;
}

/** The cleaning funnel as ordered waterfall steps. */
export function cleaningSteps(funnel: Funnel, showLowCount: boolean): CleaningStep[] {
  const d = funnel.dropped as Partial<Record<string, number>>;
  const split = Object.entries(funnel.bySource)
    .filter(([, v]) => v && v.received > 0)
    .map(([k, v]) => `${SOURCE_LABEL[k] ?? k} ${fmtInt(v?.received ?? 0)}`)
    .join(' · ');
  const bothSources = (funnel.bySource.gbif?.received ?? 0) > 0 && (funnel.bySource.obis?.received ?? 0) > 0;
  const drops: Omit<CleaningStep, 'start' | 'kind'>[] = [
    {
      id: 'invalid',
      label: 'Invalid / no species',
      value: (d.noSpecies ?? 0) + (d.invalidCoordinates ?? 0) + (d.zeroCoordinates ?? 0),
    },
    { id: 'outside', label: 'Outside area', value: d.outsideArea ?? 0 },
  ];
  // Shown once the store counts it, for loads that combine both sources.
  if (d.crossSource != null && (bothSources || d.crossSource > 0)) {
    drops.push({ id: 'crossSource', label: CROSS_SOURCE_LABEL, value: d.crossSource ?? 0 });
  }
  drops.push({ id: 'duplicate', label: 'Duplicates', value: d.duplicate ?? 0 });
  if (showLowCount || (d.lowCount ?? 0) > 0) {
    drops.push({ id: 'lowCount', label: 'Low-count species', value: d.lowCount ?? 0 });
  }
  const steps: CleaningStep[] = [
    { id: 'received', label: 'Received', value: funnel.received, kind: 'start', start: 0, note: split || undefined },
  ];
  let running = funnel.received;
  for (const s of drops) {
    steps.push({ ...s, kind: 'drop', start: Math.max(0, running - s.value) });
    running -= s.value;
  }
  steps.push({ id: 'accepted', label: 'Accepted', value: funnel.accepted, kind: 'end', start: 0 });
  return steps;
}

// --- Load outcome wording, shared by the loaded panel, the load dock and the ledger. ---

/** Why a load ended with no records. */
export type EmptyReason = 'noMatches' | 'allDropped' | 'cancelledEarly';

/** A partial (cancelled or failed) load, as recorded on the load snapshot. */
export interface PartialLoad {
  /** Species missing, or all species present but later records truncated. */
  kind?: 'speciesMissing' | 'recordsTruncated';
  planned: number;
  accepted: number;
  speciesLoaded?: number | null;
  speciesPlanned?: number | null;
  /** Planned records never received because the load stopped. */
  notReceived?: number | null;
  /** Planned species with no record received (store contract; absent on older snapshots). */
  missingSpecies?: readonly unknown[] | null;
}

/** A planned species the stopped load never reached, with the records its plan expected. */
export interface MissingSpecies {
  name: string;
  /** Records the plan expected for it; null when unknown. */
  expected: number | null;
}

/**
 * The species a partial load never reached, largest expected count first. Accepts plain names or
 * `{ name, expected | records | count }` objects, so the ledger works whichever shape the store
 * records; anything else is skipped.
 */
export function missingSpeciesOf(p: object | null | undefined): MissingSpecies[] {
  // A plain object parameter: the store's PartialLoad may not declare `missingSpecies` yet.
  const list = (p as { missingSpecies?: unknown } | null | undefined)?.missingSpecies;
  if (!Array.isArray(list)) return [];
  const out: MissingSpecies[] = [];
  for (const item of list) {
    if (typeof item === 'string') {
      if (item) out.push({ name: item, expected: null });
      continue;
    }
    if (item == null || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const name = typeof o.name === 'string' ? o.name : typeof o.species === 'string' ? o.species : null;
    if (!name) continue;
    const n = [o.expected, o.records, o.count, o.planned].find((v) => typeof v === 'number' && Number.isFinite(v));
    out.push({ name, expected: typeof n === 'number' ? n : null });
  }
  return out.sort((a, b) => (b.expected ?? -1) - (a.expected ?? -1) || a.name.localeCompare(b.name));
}

/** The load-outcome fields of a load snapshot (some are optional until every store path sets them). */
export interface LoadOutcome {
  funnel: Funnel;
  partial: PartialLoad | null;
  accepted?: number;
  emptyReason?: EmptyReason | null;
  previousKept?: boolean;
}

export const EMPTY_TITLE = 'No records were loaded';

export const EMPTY_REASON_TEXT: Record<EmptyReason, string> = {
  noMatches: 'No records match this query.',
  allDropped: 'Cleaning removed every record received (no species, invalid or outside the area, duplicates).',
  cancelledEarly: 'The load was cancelled before any records arrived.',
};

/** Short form for one-line status rows. */
export const EMPTY_REASON_SHORT: Record<EmptyReason, string> = {
  noMatches: 'no records match this query',
  allDropped: 'cleaning removed every record',
  cancelledEarly: 'cancelled before any records arrived',
};

export const PREVIOUS_KEPT = 'Your previous data is unchanged.';

/** Records the load kept. */
export function acceptedOf(load: LoadOutcome): number {
  return load.accepted ?? load.funnel.accepted;
}

/** Why a load came back empty, or null when it loaded records. Falls back to the funnel when the store does not say. */
export function emptyReasonOf(load: LoadOutcome): EmptyReason | null {
  if (acceptedOf(load) > 0) return null;
  if (load.emptyReason) return load.emptyReason;
  if (load.funnel.received > 0) return 'allDropped';
  return load.partial ? 'cancelledEarly' : 'noMatches';
}

/** Planned records never received because the load stopped early (0 for a complete load). */
export function notReceivedOf(load: LoadOutcome): number {
  const p = load.partial;
  if (!p) return 0;
  return Math.max(0, p.notReceived ?? p.planned - load.funnel.received);
}

/** Why bioregions from a partial dataset should not be trusted (kind-neutral). */
export const PARTIAL_BIAS = 'Bioregions from this partial dataset are not representative.';

/** The kind-specific explanation plus PARTIAL_BIAS, for tooltips. */
export function partialBiasText(p: PartialLoad | null | undefined): string {
  return p ? `${partialExplanation(p)} ${PARTIAL_BIAS}` : PARTIAL_BIAS;
}

/** "819 of ~272,546 records (<1 %) from 1 of 210 species." */
export function partialSummary(p: PartialLoad): string {
  const share = fmtPct(p.planned > 0 ? p.accepted / p.planned : 0);
  const species =
    p.speciesLoaded != null && p.speciesPlanned != null && p.speciesPlanned > 0
      ? ` from ${fmtInt(p.speciesLoaded)} of ${fmtInt(p.speciesPlanned)} species`
      : '';
  return `${fmtInt(p.accepted)} of ~${fmtInt(p.planned)} records (${share})${species}.`;
}

// --- Path from the planned records to the loaded dataset, shared by the ledger and the panel. ---

/** Records found in both GBIF and OBIS (kept once). */
export const CROSS_SOURCE_LABEL = 'Same record in GBIF and OBIS';

/** What counts as a duplicate, from the query's dedupe setting. */
export function dedupeText(dedupe: string | undefined): string {
  if (dedupe === 'cell') return 'same species in one ~1 km cell';
  if (dedupe === 'none') return 'kept';
  return 'same species at one site';
}

export interface LoadDrop {
  id: 'notReceived' | 'crossSource' | 'duplicates' | 'cleaning';
  /** Ledger label (sentence case). */
  label: string;
  /** Lower-case form for the loaded panel's sentence. */
  short: string;
  /** Records; negative when more arrived than planned. */
  value: number;
  /** Not received (never fetched) rather than removed by cleaning. */
  missing?: boolean;
  tip?: string;
}

/**
 * The drops between the planned species-level records and the loaded dataset, in order:
 * not received, same record in both sources, duplicates, other cleaning.
 */
export function loadDrops(p: {
  funnel: Funnel;
  /** Planned species-level records, or null when unknown. */
  toLoad: number | null;
  /** Planned records never received because the load was cancelled. */
  cancelled: number;
  dedupeLabel: string;
  /** The partial load, for kind-specific wording of the not-received tip. */
  partial?: PartialLoad | null;
}): LoadDrop[] {
  const d = p.funnel.dropped as Partial<Record<string, number>>;
  const cross = d.crossSource ?? 0;
  const dup = d.duplicate ?? 0;
  const cleaned = Math.max(0, p.funnel.received - p.funnel.accepted - dup - cross);
  const out: LoadDrop[] = [];
  const notReceived = p.cancelled > 0 ? p.cancelled : p.toLoad != null ? p.toLoad - p.funnel.received : 0;
  if (p.cancelled > 0) {
    out.push({
      id: 'notReceived',
      label: 'Not loaded (cancelled)',
      short: 'not loaded (cancelled)',
      value: p.cancelled,
      missing: true,
      tip: `Planned records that never arrived because the load was stopped. ${partialBiasText(p.partial)}`,
    });
  } else if (notReceived !== 0) {
    out.push({
      id: 'notReceived',
      label: notReceived > 0 ? 'Not received (cap or source changes)' : 'Received beyond the preview count',
      short: notReceived > 0 ? 'not received' : 'received beyond the preview count',
      value: notReceived,
      missing: true,
      tip: 'Difference between the preview count and the records the sources returned while loading.',
    });
  }
  if (cross > 0) {
    out.push({
      id: 'crossSource',
      label: CROSS_SOURCE_LABEL,
      short: 'in both GBIF and OBIS',
      value: cross,
      tip: 'The same occurrence published to both GBIF and OBIS is kept once.',
    });
  }
  out.push({ id: 'duplicates', label: `Duplicates: ${p.dedupeLabel}`, short: 'duplicates', value: dup });
  if (cleaned > 0) {
    out.push({
      id: 'cleaning',
      label: 'Invalid, outside the area or low-count',
      short: 'invalid or outside the area',
      value: cleaned,
      tip: 'Records dropped by the other cleaning steps; the cleaning detail below breaks them down.',
    });
  }
  return out;
}

const joinAnd = (parts: string[]) =>
  parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : (parts[0] ?? '');

/**
 * "From 2,031 records matching all filters: 12 not identified to species and 120 duplicates
 * removed; 46 not received." Uses the decision ledger's vocabulary.
 */
export function loadStory(p: { matching: number; notSpecies: number | null; lowCount: number; drops: LoadDrop[] }): string {
  const removed = [
    p.notSpecies ? `${fmtInt(p.notSpecies)} not identified to species` : null,
    p.lowCount > 0 ? `${fmtInt(p.lowCount)} in species under the minimum records` : null,
    ...p.drops.filter((x) => !x.missing && x.value > 0).map((x) => `${fmtInt(x.value)} ${x.short}`),
  ].filter((x): x is string => x != null);
  const missing = p.drops.filter((x) => x.missing && x.value > 0).map((x) => `${fmtInt(x.value)} ${x.short}`);
  const head = `From ${fmtInt(p.matching)} records matching all filters`;
  const tail = [removed.length > 0 ? `${joinAnd(removed)} removed` : null, missing.length > 0 ? joinAnd(missing) : null]
    .filter(Boolean)
    .join('; ');
  return tail ? `${head}: ${tail}.` : `${head}: all loaded.`;
}
