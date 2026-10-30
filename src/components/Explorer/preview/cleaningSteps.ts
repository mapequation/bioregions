// Pure helpers for the decision ledger's "Cleaning · in order" section and the load-outcome wording.
import type { Funnel } from '../../../sources/types';
import { fmtInt, fmtPct } from '../format';

const SOURCE_LABEL: Record<string, string> = { gbif: 'GBIF', obis: 'OBIS', file: 'File' };

export interface CleaningStep {
  id: 'received' | 'invalid' | 'outside' | 'duplicate' | 'lowCount' | 'accepted';
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
  const extra = funnel as Funnel & { crossSourceDuplicates?: number };
  const split = Object.entries(funnel.bySource)
    .filter(([, v]) => v && v.received > 0)
    .map(([k, v]) => `${SOURCE_LABEL[k] ?? k} ${fmtInt(v?.received ?? 0)}`)
    .join(' · ');
  const drops: Omit<CleaningStep, 'start' | 'kind'>[] = [
    {
      id: 'invalid',
      label: 'Invalid / no species',
      value: (d.noSpecies ?? 0) + (d.invalidCoordinates ?? 0) + (d.zeroCoordinates ?? 0),
    },
    { id: 'outside', label: 'Outside area', value: d.outsideArea ?? 0 },
    {
      id: 'duplicate',
      label: 'Duplicates',
      value: d.duplicate ?? 0,
      note:
        extra.crossSourceDuplicates != null && extra.crossSourceDuplicates > 0
          ? `of which GBIF∩OBIS ${fmtInt(extra.crossSourceDuplicates)}`
          : undefined,
    },
  ];
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
  planned: number;
  accepted: number;
  speciesLoaded?: number | null;
  speciesPlanned?: number | null;
  /** Planned records never received because the load stopped. */
  notReceived?: number | null;
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

/** Why a partial dataset is taxonomically biased, not just thinned. */
export const PARTIAL_BIAS =
  'Records stream species by species, so missing species are absent, not thinned; bioregions from this partial dataset are not representative.';

/** "819 of ~272,546 records (<1 %) from 1 of 210 species." */
export function partialSummary(p: PartialLoad): string {
  const share = fmtPct(p.planned > 0 ? p.accepted / p.planned : 0);
  const species =
    p.speciesLoaded != null && p.speciesPlanned != null && p.speciesPlanned > 0
      ? ` from ${fmtInt(p.speciesLoaded)} of ${fmtInt(p.speciesPlanned)} species`
      : '';
  return `${fmtInt(p.accepted)} of ~${fmtInt(p.planned)} records (${share})${species}.`;
}
