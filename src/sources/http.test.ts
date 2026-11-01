import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { describeRequestError, fetchWithRetry, HttpError, retryDelay, retryTiming } from './http';

const timing = { ...retryTiming };
beforeEach(() => Object.assign(retryTiming, { baseMs: 1, maxMs: 2 }));
afterEach(() => {
  Object.assign(retryTiming, timing);
  vi.unstubAllGlobals();
});

describe('fetchWithRetry', () => {
  it('retries network errors, then succeeds', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', async () => {
      calls++;
      if (calls < 3) throw new TypeError('Failed to fetch');
      return new Response('ok');
    });
    await expect((await fetchWithRetry('https://api.example.org/x')).text()).resolves.toBe('ok');
    expect(calls).toBe(3);
  });

  it('throws an HttpError with the status text after the retries', async () => {
    vi.stubGlobal('fetch', async () => new Response('down', { status: 503, statusText: 'Service Unavailable' }));
    const error = await fetchWithRetry('https://api.example.org/x', { retries: 1 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ status: 503, statusText: 'Service Unavailable' });
  });
});

describe('retryDelay', () => {
  it('honours Retry-After in seconds and as a date, capped', () => {
    const withRetryAfter = (value: string) => new Response('', { status: 429, headers: { 'Retry-After': value } });
    expect(retryDelay(0, withRetryAfter('2'))).toBe(2000);
    expect(retryDelay(0, withRetryAfter('3600'))).toBe(retryTiming.maxRetryAfterMs);
    const date = new Date(Date.now() + 5000).toUTCString();
    expect(retryDelay(0, withRetryAfter(date))).toBeGreaterThan(3000);
    expect(retryDelay(3)).toBeLessThanOrEqual(retryTiming.maxMs * 1.25);
  });
});

describe('describeRequestError', () => {
  it('gives a short message per kind of failure', () => {
    expect(describeRequestError(new HttpError(503, 'x', 'https://api.gbif.org/v1'), 'GBIF')).toBe(
      'GBIF returned HTTP 503 Service Unavailable',
    );
    expect(describeRequestError(new TypeError('Failed to fetch'), 'OBIS')).toBe(
      'Could not reach OBIS (network error)',
    );
    expect(describeRequestError(new Error('Request to api.obis.org timed out'), 'OBIS')).toBe(
      'OBIS did not respond in time',
    );
    expect(describeRequestError(new Error('x'.repeat(300)), 'GBIF').length).toBeLessThan(150);
  });
});
