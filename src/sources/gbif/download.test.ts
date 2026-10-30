import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OccurrenceQuery } from '../types';
import {
  base64Utf8,
  GbifDownloadError,
  gbifDownloadBody,
  gbifDownloadCitation,
  pollGbifDownload,
  requestGbifDownload,
} from './download';

const query: OccurrenceQuery = {
  taxa: [{ name: 'Felidae', rank: 'FAMILY', gbifKey: 9703 }],
  area: { kind: 'world' },
  years: [2000, null],
  depth: [null, null],
  quality: {
    basisOfRecord: [],
    maxUncertaintyMeters: null,
    keepMissingUncertainty: true,
    excludeGeospatialIssues: true,
    excludeIntroduced: false,
    presentOnly: true,
    dedupe: 'none',
  },
  sources: { gbif: true, obis: false },
};

// Observed live from GET /v1/occurrence/download/0017436-261023074918325 (2026-10-30).
const succeeded = {
  key: '0017436-261023074918325',
  doi: '10.15468/dl.gpysnc',
  created: '2026-10-30T13:19:34.194+00:00',
  modified: '2026-10-30T13:28:27.097+00:00',
  eraseAfter: '2027-10-30T13:28:27.073+00:00',
  status: 'SUCCEEDED',
  downloadLink:
    'https://api.gbif.org/v1/occurrence/download/request/0017436-261023074918325.zip',
  size: 45815,
  totalRecords: 1339,
  numberDatasets: 18,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('requestGbifDownload', () => {
  it('posts the predicate with basic auth and returns the key', async () => {
    const fetch = vi.fn(async () => new Response('0012345-261023074918325\n', { status: 201 }));
    vi.stubGlobal('fetch', fetch);
    const key = await requestGbifDownload({
      username: 'åsa',
      password: 'pässword',
      email: 'a@example.org',
      query,
    });
    expect(key).toBe('0012345-261023074918325');
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.gbif.org/v1/occurrence/download/request');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${base64Utf8('åsa:pässword')}`);
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      creator: 'åsa',
      notificationAddresses: ['a@example.org'],
      sendNotification: true,
      format: 'SIMPLE_CSV',
    });
    expect(JSON.stringify(body.predicate)).toContain('"key":"TAXON_KEY"');
  });

  it.each([
    [401, /wrong username or password/],
    [403, /wrong username or password/],
    [420, /Too many downloads/],
    [429, /Too many downloads/],
    [400, /could not run this query: Invalid predicate/],
  ])('maps HTTP %i to a user-facing message', async (status, message) => {
    const fetch = vi.fn(async () => new Response('Invalid predicate', { status }));
    vi.stubGlobal('fetch', fetch);
    const error = await requestGbifDownload({ username: 'u', password: 'p', query }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(GbifDownloadError);
    expect((error as Error).message).toMatch(message);
    // Never retried: a repeated POST could start a second download.
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('omits notification without an email', () => {
    expect(gbifDownloadBody({ username: 'u', query })).toMatchObject({
      notificationAddresses: [],
      sendNotification: false,
    });
  });
});

describe('base64Utf8', () => {
  it('encodes non-Latin-1 characters', () => {
    expect(base64Utf8('user:pass')).toBe(btoa('user:pass'));
    expect(atob(base64Utf8('ø✓'))).toBe('\xc3\xb8\xe2\x9c\x93');
  });
});

describe('pollGbifDownload', () => {
  it('polls until a terminal status', async () => {
    const states = ['PREPARING', 'RUNNING', 'SUCCEEDED'];
    const fetch = vi.fn(async () =>
      Response.json({ ...succeeded, status: states.shift() ?? 'SUCCEEDED' }),
    );
    vi.stubGlobal('fetch', fetch);
    const seen: string[] = [];
    const final = await pollGbifDownload(succeeded.key, {
      intervalMs: 1,
      onUpdate: (s) => seen.push(s.status),
    });
    expect(seen).toEqual(['PREPARING', 'RUNNING', 'SUCCEEDED']);
    expect(final.doi).toBe('10.15468/dl.gpysnc');
  });

  it('stops when aborted', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ ...succeeded, status: 'RUNNING' }));
    const controller = new AbortController();
    const done = pollGbifDownload(succeeded.key, { intervalMs: 10_000, signal: controller.signal });
    setTimeout(() => controller.abort(), 5);
    await expect(done).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('gbifDownloadCitation', () => {
  it('formats the GBIF citation', () => {
    expect(gbifDownloadCitation(succeeded)).toBe(
      'GBIF.org (30 October 2026) GBIF Occurrence Download https://doi.org/10.15468/dl.gpysnc',
    );
  });
});
