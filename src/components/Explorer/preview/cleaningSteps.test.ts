import { describe, expect, it } from 'vitest';
import type { Funnel } from '../../../sources/types';
import { cleaningSteps } from './cleaningSteps';

const funnel = (over: Partial<Funnel> = {}): Funnel => ({
  received: 1000,
  accepted: 800,
  dropped: { noSpecies: 20, invalidCoordinates: 5, zeroCoordinates: 5, outsideArea: 50, duplicate: 120, lowCount: 0 },
  bySource: { gbif: { received: 900, accepted: 720 }, obis: { received: 100, accepted: 80 } },
  ...over,
});

describe('cleaningSteps', () => {
  it('orders the funnel as a waterfall with running starts', () => {
    const steps = cleaningSteps(funnel(), false);
    expect(steps.map((s) => s.id)).toEqual(['received', 'invalid', 'outside', 'duplicate', 'accepted']);
    expect(steps.map((s) => s.value)).toEqual([1000, 30, 50, 120, 800]);
    // Each drop is drawn ending where the previous running total was.
    expect(steps.map((s) => s.start)).toEqual([0, 970, 920, 800, 0]);
    expect(steps[0].note).toBe('GBIF 900 · OBIS 100');
  });

  it('shows low-count species when the filter is on or records were dropped for it', () => {
    expect(cleaningSteps(funnel(), true).some((s) => s.id === 'lowCount')).toBe(true);
    const dropped = { ...funnel().dropped, lowCount: 7 };
    const step = cleaningSteps(funnel({ dropped }), false).find((s) => s.id === 'lowCount');
    expect(step?.value).toBe(7);
  });

  it('notes cross-source duplicates when the funnel reports them', () => {
    const f = { ...funnel(), crossSourceDuplicates: 42 } as Funnel;
    expect(cleaningSteps(f, false).find((s) => s.id === 'duplicate')?.note).toBe('of which GBIF∩OBIS 42');
  });

  it('never starts a bar below zero while streaming', () => {
    const steps = cleaningSteps(funnel({ received: 10 }), false);
    expect(steps.every((s) => s.start >= 0)).toBe(true);
  });
});
