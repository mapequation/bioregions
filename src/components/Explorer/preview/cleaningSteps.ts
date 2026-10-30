// Pure helper for the decision ledger's "Cleaning · in order" section.
import type { Funnel } from '../../../sources/types';
import { fmtInt } from '../format';

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
