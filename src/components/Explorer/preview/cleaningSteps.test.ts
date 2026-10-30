import { describe, expect, it } from 'vitest';
import type { Funnel } from '../../../sources/types';
import { cleaningSteps, emptyReasonOf, loadDrops, loadStory, notReceivedOf, partialSummary } from './cleaningSteps';

const funnel = (over: Partial<Funnel> = {}): Funnel => ({
  received: 1000,
  accepted: 800,
  dropped: { noSpecies: 20, invalidCoordinates: 5, zeroCoordinates: 5, outsideArea: 50, duplicate: 120, crossSource: 0, lowCount: 0 },
  bySource: { gbif: { received: 900, accepted: 720 }, obis: { received: 100, accepted: 80 } },
  ...over,
});

describe('cleaningSteps', () => {
  it('orders the funnel as a waterfall with running starts', () => {
    const steps = cleaningSteps(funnel(), false);
    expect(steps.map((s) => s.id)).toEqual(['received', 'invalid', 'outside', 'crossSource', 'duplicate', 'accepted']);
    expect(steps.map((s) => s.value)).toEqual([1000, 30, 50, 0, 120, 800]);
    // Each drop is drawn ending where the previous running total was.
    expect(steps.map((s) => s.start)).toEqual([0, 970, 920, 920, 800, 0]);
    expect(steps[0].note).toBe('GBIF 900 · OBIS 100');
  });

  it('shows low-count species when the filter is on or records were dropped for it', () => {
    expect(cleaningSteps(funnel(), true).some((s) => s.id === 'lowCount')).toBe(true);
    const dropped = { ...funnel().dropped, lowCount: 7 };
    const step = cleaningSteps(funnel({ dropped }), false).find((s) => s.id === 'lowCount');
    expect(step?.value).toBe(7);
  });

  it('splits records found in both sources from duplicates', () => {
    const dropped = { ...funnel().dropped, duplicate: 78, crossSource: 42 } as Funnel['dropped'];
    const steps = cleaningSteps(funnel({ dropped }), false);
    expect(steps.find((s) => s.id === 'crossSource')?.value).toBe(42);
    expect(steps.find((s) => s.id === 'duplicate')?.value).toBe(78);
    const gbifOnly = funnel({ dropped, bySource: { gbif: { received: 1000, accepted: 800 } } });
    expect(cleaningSteps(gbifOnly, false).some((s) => s.id === 'crossSource')).toBe(true);
    const none = { ...dropped, crossSource: 0 } as Funnel['dropped'];
    const gbifOnlyNone = funnel({ dropped: none, bySource: { gbif: { received: 1000, accepted: 800 } } });
    expect(cleaningSteps(gbifOnlyNone, false).some((s) => s.id === 'crossSource')).toBe(false);
  });

  it('never starts a bar below zero while streaming', () => {
    const steps = cleaningSteps(funnel({ received: 10 }), false);
    expect(steps.every((s) => s.start >= 0)).toBe(true);
  });
});

describe('load outcome', () => {
  const load = (over: Partial<Funnel>, rest: object = {}) => ({ funnel: funnel(over), partial: null, ...rest });

  it('has no empty reason when records were accepted', () => {
    expect(emptyReasonOf(load({}))).toBeNull();
  });

  it('prefers the store reason, else infers it from the funnel', () => {
    expect(emptyReasonOf(load({ accepted: 0 }, { emptyReason: 'noMatches' }))).toBe('noMatches');
    expect(emptyReasonOf(load({ accepted: 0 }))).toBe('allDropped');
    expect(emptyReasonOf(load({ accepted: 0, received: 0 }))).toBe('noMatches');
    const cancelled = load({ accepted: 0, received: 0 }, { partial: { planned: 500, accepted: 0 } });
    expect(emptyReasonOf(cancelled)).toBe('cancelledEarly');
  });

  it('counts records not received after a cancel', () => {
    expect(notReceivedOf(load({}))).toBe(0);
    expect(notReceivedOf(load({}, { partial: { planned: 5000, accepted: 800 } }))).toBe(4000);
    expect(notReceivedOf(load({}, { partial: { planned: 5000, accepted: 800, notReceived: 3900 } }))).toBe(3900);
  });

  it('states the share and the species covered', () => {
    expect(partialSummary({ planned: 272546, accepted: 819, speciesLoaded: 1, speciesPlanned: 210 })).toBe(
      '819 of ~272,546 records (<1 %) from 1 of 210 species.',
    );
    expect(partialSummary({ planned: 1000, accepted: 500 })).toBe('500 of ~1,000 records (50 %).');
  });
});

describe('load drops and story', () => {
  const f = (over: Partial<Funnel> = {}): Funnel => ({
    received: 865,
    accepted: 819,
    dropped: { noSpecies: 0, invalidCoordinates: 0, zeroCoordinates: 0, outsideArea: 0, duplicate: 40, lowCount: 0, crossSource: 6 } as Funnel['dropped'],
    bySource: { gbif: { received: 865, accepted: 819 } },
    ...over,
  });

  it('names records never received like the ledger does', () => {
    const drops = loadDrops({ funnel: f(), toLoad: 911, cancelled: 0, dedupeLabel: 'same species at one site' });
    expect(drops.map((d) => [d.id, d.value])).toEqual([
      ['notReceived', 46],
      ['crossSource', 6],
      ['duplicates', 40],
    ]);
    expect(drops[2].label).toBe('Duplicates: same species at one site');
    expect(loadStory({ matching: 1000, notSpecies: 89, lowCount: 0, drops })).toBe(
      'From 1,000 records matching all filters: 89 not identified to species, 6 in both GBIF and OBIS and 40 duplicates removed; 46 not received.',
    );
  });

  it('reports a cancelled load as not loaded', () => {
    const drops = loadDrops({ funnel: f(), toLoad: 5000, cancelled: 4000, dedupeLabel: 'x' });
    expect(drops[0]).toMatchObject({ id: 'notReceived', label: 'Not loaded (cancelled)', value: 4000 });
  });
});
