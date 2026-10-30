import { describe, expect, it } from 'vitest';
import {
  contributingSources,
  gbifReference,
  isPending,
  isValidEmail,
  normalizeDoi,
  obisCitationHead,
  requestError,
  shortTime,
  timeAgo,
} from './citeHelpers';

describe('normalizeDoi', () => {
  it('accepts bare, doi: and doi.org forms', () => {
    expect(normalizeDoi('10.15468/dd-ab12cd')).toBe('10.15468/dd-ab12cd');
    expect(normalizeDoi(' doi:10.15468/dd-ab12cd ')).toBe('10.15468/dd-ab12cd');
    expect(normalizeDoi('https://doi.org/10.15468/dd-ab12cd')).toBe('10.15468/dd-ab12cd');
  });
  it('rejects non-DOIs', () => {
    expect(normalizeDoi('')).toBeNull();
    expect(normalizeDoi('15468/dd-ab12cd')).toBeNull();
    expect(normalizeDoi('10.1/x')).toBeNull();
  });
});

describe('gbifReference', () => {
  const last = { retrievedAt: '2026-10-30T13:03:00Z', gbifDownloadKey: 'k1' };
  it('prefers a succeeded download DOI', () => {
    const r = gbifReference({ ...last, derivedDoi: '10.15468/dd-x' }, [
      { key: 'k1', status: 'SUCCEEDED', doi: '10.15468/dl.abc', createdAt: '2026-10-30T13:10:00Z' },
    ]);
    expect(r).toContain('https://doi.org/10.15468/dl.abc');
  });
  it('falls back to the derived-dataset DOI, then the placeholder', () => {
    const running = [{ key: 'k1', status: 'RUNNING' as const, createdAt: '2026-10-30T13:10:00Z' }];
    expect(gbifReference({ ...last, derivedDoi: 'doi:10.15468/dd-x' }, running)).toBe(
      'GBIF.org (30 October 2026) Filtered export of GBIF occurrence data https://doi.org/10.15468/dd-x',
    );
    expect(gbifReference(last, running)).toMatch(/derived dataset to be registered$/);
  });
});

describe('small helpers', () => {
  it('contributingSources reads the funnel and dataset counts', () => {
    expect(
      contributingSources({
        funnel: { received: 2, accepted: 2, dropped: {} as never, bySource: { gbif: { received: 2, accepted: 2 } } },
        datasetCounts: { obis: [{ key: 'a', label: 'A', count: 1 }] },
      }),
    ).toEqual(['gbif', 'obis']);
  });
  it('obisCitationHead drops the dataset list', () => {
    expect(obisCitationHead('OBIS (2026) Ocean … https://obis.org. Datasets: a, b')).toBe('OBIS (2026) Ocean … https://obis.org');
    expect(obisCitationHead('OBIS (2026) x')).toBe('OBIS (2026) x');
  });
  it('isPending, isValidEmail, requestError', () => {
    expect(isPending({ status: 'RUNNING' })).toBe(true);
    expect(isPending({ status: 'SUCCEEDED' })).toBe(false);
    expect(isValidEmail('a@b.org')).toBe(true);
    expect(isValidEmail('a@b')).toBe(false);
    expect(requestError('Wrong GBIF username or password.').field).toBe('password');
    expect(requestError('GBIF is busy.').field).toBeUndefined();
  });
  it('timeAgo and shortTime', () => {
    const now = Date.parse('2026-10-30T14:00:00Z');
    expect(timeAgo('2026-10-30T13:59:30Z', now)).toBe('just now');
    expect(timeAgo('2026-10-30T13:30:00Z', now)).toBe('30 min ago');
    expect(timeAgo('2026-10-30T11:00:00Z', now)).toBe('3 h ago');
    expect(timeAgo('not a date', now)).toBe('');
    expect(shortTime(undefined)).toBe('–');
  });
});
