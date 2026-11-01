import { describe, expect, it } from 'vitest';
import type { StopState } from '@/store/data/types';
import {
  continueLabel,
  doneRowText,
  ERRORS_MISSING,
  emptyAction,
  emptyRowReason,
  nextStepText,
  partialExplanation,
  partialKindOf,
  partialMissingText,
  partialTitle,
  stopReasonText,
} from './partialText';

const stop = (s: Partial<StopState> & Pick<StopState, 'reason'>): StopState => ({
  failedParts: 0,
  stoppedEarly: false,
  sources: ['gbif'],
  ...s,
});
const cancelled = stop({ reason: 'cancelled' });
const errors = stop({ reason: 'errors', failedParts: 2, lastError: 'GBIF returned HTTP 503 Service Unavailable' });
const repeated = stop({
  reason: 'errors',
  failedParts: 5,
  stoppedEarly: true,
  requests: 40,
  requestsDone: 30,
  lastError: 'Could not reach GBIF (network error)',
});
const cap = stop({ reason: 'cap', estimate: 430_000 });
const partial = { kind: 'speciesMissing' as const, accepted: 40_033, planned: 412_380, speciesLoaded: 38, speciesPlanned: 40 };

describe('partial load wording', () => {
  it('uses the store kind when present, else infers it from species counts', () => {
    expect(partialKindOf({ kind: 'recordsTruncated', speciesLoaded: 42, speciesPlanned: 46 })).toBe('recordsTruncated');
    expect(partialKindOf({ speciesLoaded: 42, speciesPlanned: 46 })).toBe('speciesMissing');
    expect(partialKindOf({ speciesLoaded: 46, speciesPlanned: 46 })).toBe('recordsTruncated');
  });

  it('names the missing species without assuming the user stopped the load', () => {
    expect(partialExplanation({ kind: 'speciesMissing', speciesLoaded: 42, speciesPlanned: 46 })).toBe(
      'An incomplete load under-represents the species that had not arrived yet: records arrive species by species, so 4 species are missing entirely.',
    );
  });

  it('says density is not representative when every species arrived', () => {
    expect(partialExplanation({ kind: 'recordsTruncated', speciesLoaded: 46, speciesPlanned: 46 })).toBe(
      'All 46 species are present, but records that had not arrived yet are missing, so record counts per species are not representative.',
    );
  });
});

describe('partial banner copy per stop reason', () => {
  it('titles the banner with records and species', () => {
    expect(partialTitle(partial, cancelled)).toBe('Loaded 40,033 of ~412,380 records · 38 of 40 species (partial)');
    expect(partialTitle({ ...partial, accepted: 500_000, planned: 430_000 }, cap)).toBe(
      'Loaded 500,000 records · 38 of 40 species (partial)',
    );
  });

  it('says why it stopped', () => {
    expect(stopReasonText(cancelled, 500_000)).toBe('You stopped the load before every record arrived.');
    expect(stopReasonText(errors, 500_000)).toBe(
      '2 requests to GBIF still failed after retries (GBIF returned HTTP 503 Service Unavailable); everything else loaded.',
    );
    expect(stopReasonText(repeated, 500_000)).toBe(
      'Loading stopped after repeated errors from GBIF: Could not reach GBIF (network error). 10 requests did not complete.',
    );
    expect(stopReasonText(cap, 500_000)).toBe(
      'GBIF stopped at the cap of 500,000 records; the estimate was ~430,000, so more records may exist.',
    );
    expect(stopReasonText(null, 500_000)).toBeNull();
  });

  it('describes errors as gaps in areas or years, never as a user stop', () => {
    for (const s of [errors, repeated]) {
      const text = [stopReasonText(s, 500_000), partialMissingText(s, partial), doneRowText({ accepted: 1, partial, stop: s }).parts.join(' · ')].join(' ');
      expect(text).toMatch(/areas or years/);
      expect(text).toMatch(/gaps/);
      expect(text).not.toMatch(/you stopped/i);
    }
    expect(partialMissingText(errors, partial)).toBe(ERRORS_MISSING);
    expect(partialMissingText(cancelled, partial)).toMatch(/^An incomplete load/);
    expect(partialMissingText(cap, partial)).toMatch(/^An incomplete load/);
  });

  it('labels Continue and explains both actions', () => {
    expect(continueLabel(cancelled, 500_000)).toBe('Continue loading');
    expect(continueLabel(errors, 500_000)).toBe('Continue loading');
    expect(continueLabel(cap, 1_000_000)).toBe('Continue up to 1,000,000');
    expect(nextStepText(errors, 500_000)).toBe(
      'Continue loading fetches only what is missing and adds it to this dataset. Load again starts over.',
    );
    expect(nextStepText(cap, 1_000_000)).toBe(
      'Continue raises the cap to 1,000,000 and fetches the rest. Load again starts over.',
    );
  });
});

describe('dock status row', () => {
  it('shows each state without telling the user to edit the query', () => {
    const rows = [
      doneRowText({ accepted: 412_380, species: 1_203 }),
      doneRowText({ accepted: 40_033, partial, stop: cancelled }),
      doneRowText({ accepted: 40_033, partial, stop: errors }),
      doneRowText({ accepted: 500_000, partial, stop: cap }),
    ];
    expect(rows.map((r) => [r.title, ...r.parts].join(' · '))).toEqual([
      'Loaded 412,380 records · 1,203 species',
      'Loaded 40,033 of ~412,380 records · partial · you stopped the load',
      'Loaded 40,033 of ~412,380 records · partial · GBIF returned HTTP 503 Service Unavailable',
      'Loaded 500,000 records · GBIF stopped at the cap; the estimate was ~430,000, so more may exist',
    ]);
    for (const r of rows) expect(r.parts.join(' ')).not.toMatch(/edit the query/i);
  });

  it('names the error of a failed empty load and offers the matching action', () => {
    expect(emptyRowReason('failed', 'OBIS did not respond in time')).toBe('OBIS did not respond in time');
    expect(emptyRowReason('failed')).toBe('the requests failed');
    expect(emptyRowReason('cancelledEarly')).toBe('stopped before any record arrived');
    expect(emptyAction('failed')).toBe('tryAgain');
    expect(emptyAction('cancelledEarly')).toBe('loadAgain');
    expect(emptyAction('noMatches')).toBeNull();
    expect(emptyAction('allDropped')).toBeNull();
  });
});
