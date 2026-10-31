import { describe, expect, it, vi } from 'vitest';
import { fetchTile, retryableStatus, retryDelay, TILE_RETRIES } from './useTileBlobs';

const res = (status: number) => new Response(status === 204 ? null : 'x', { status });
const noWait = () => Promise.resolve();

describe('fetchTile', () => {
  it('returns empty for 204 and a blob URL for 200', async () => {
    const signal = new AbortController().signal;
    expect(await fetchTile('u', signal, async () => res(204), noWait)).toBe('empty');
    const url = await fetchTile('u', signal, async () => res(200), noWait);
    expect(url).toMatch(/^blob:/);
    URL.revokeObjectURL(url);
  });

  it('retries a 503 with backoff, then succeeds', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(res(503)).mockResolvedValueOnce(res(503)).mockResolvedValue(res(204));
    const wait = vi.fn(noWait);
    expect(await fetchTile('u', new AbortController().signal, fetcher, wait)).toBe('empty');
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenCalledTimes(2);
  });

  it(`gives up after ${TILE_RETRIES} retries`, async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError('network'));
    expect(await fetchTile('u', new AbortController().signal, fetcher, noWait)).toBe('failed');
    expect(fetcher).toHaveBeenCalledTimes(TILE_RETRIES + 1);
  });

  it('does not retry a client error', async () => {
    const fetcher = vi.fn().mockResolvedValue(res(400));
    expect(await fetchTile('u', new AbortController().signal, fetcher, noWait)).toBe('failed');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('rethrows when aborted', async () => {
    const c = new AbortController();
    c.abort();
    const fetcher = vi.fn().mockRejectedValue(new DOMException('aborted', 'AbortError'));
    await expect(fetchTile('u', c.signal, fetcher, noWait)).rejects.toThrow();
  });
});

describe('retry policy', () => {
  it('retries overloads and gateway errors only', () => {
    expect([503, 502, 429].every(retryableStatus)).toBe(true);
    expect([400, 404].some(retryableStatus)).toBe(false);
  });
  it('doubles the delay per attempt', () => {
    expect(retryDelay(0, () => 0)).toBe(800);
    expect(retryDelay(2, () => 0)).toBe(3200);
  });
});
