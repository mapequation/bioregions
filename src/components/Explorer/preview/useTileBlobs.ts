import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A fetched map tile: its blob URL, 'empty' (204, no records) or 'failed' (after the
 * retries). A URL missing from the map is still loading.
 */
export type TileState = string | 'empty' | 'failed';

/** Retries of a failed tile (so up to 1 + TILE_RETRIES requests). */
export const TILE_RETRIES = 3;
const BASE_DELAY_MS = 800;
/** Cached tiles kept beyond the ones in view before old ones are dropped. */
const MAX_CACHE = 400;

/** Whether a failed response is worth asking again (overload, rate limit, gateway). */
export function retryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/** Backoff before retry `attempt` (0-based): 0.8, 1.6, 3.2 s, plus up to 25 % jitter. */
export function retryDelay(attempt: number, random = Math.random): number {
  return BASE_DELAY_MS * 2 ** attempt * (1 + 0.25 * random());
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });

/**
 * Fetch one tile, retrying overloads and network errors with backoff. An <img> would draw
 * any decodable body whatever the status, and GBIF answers an overloaded ad-hoc tile with a
 * 503 PNG reading "503"; fetching keeps error and empty tiles off the map.
 */
export async function fetchTile(
  url: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
  wait: (ms: number, signal: AbortSignal) => Promise<void> = sleep,
): Promise<TileState> {
  for (let attempt = 0; ; attempt++) {
    let retry: boolean;
    try {
      const res = await fetcher(url, { signal });
      if (res.status === 204) return 'empty';
      if (res.ok) return URL.createObjectURL(await res.blob());
      retry = retryableStatus(res.status);
    } catch (error) {
      if (signal.aborted) throw error;
      retry = true; // network error
    }
    if (!retry || attempt >= TILE_RETRIES) return 'failed';
    await wait(retryDelay(attempt), signal);
  }
}

export interface TileBlobs {
  tiles: ReadonlyMap<string, TileState>;
  /** Ask again for every tile that failed. */
  retry(): void;
}

/** Density tiles as blob URLs, cached across renders and revoked on unmount. */
export function useTileBlobs(urls: string[]): TileBlobs {
  const cache = useRef(new Map<string, TileState>());
  const inflight = useRef(new Map<string, AbortSignal>());
  const controller = useRef<AbortController | null>(null);
  const [, bump] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const latest = useRef(urls);
  latest.current = urls;
  const key = urls.join('\n');
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` stands for the url list read via `latest`; `attempt` re-runs after a retry.
  useEffect(() => {
    if (!controller.current) controller.current = new AbortController();
    const signal = controller.current.signal;
    for (const url of latest.current) {
      if (cache.current.has(url) || inflight.current.has(url)) continue;
      inflight.current.set(url, signal);
      fetchTile(url, signal)
        .then((state) => {
          if (signal.aborted) return;
          inflight.current.delete(url);
          const blobs = cache.current;
          if (blobs.size > MAX_CACHE) {
            // Drop tiles out of view; the ones on the map keep their blob URLs.
            const live = new Set(latest.current);
            for (const [u, s] of blobs) {
              if (live.has(u)) continue;
              if (s !== 'empty' && s !== 'failed') URL.revokeObjectURL(s);
              blobs.delete(u);
            }
          }
          blobs.set(url, state);
          bump((n) => n + 1);
        })
        .catch(() => {
          // Aborted on unmount; a request made since then keeps its entry.
          if (inflight.current.get(url) === signal) inflight.current.delete(url);
        });
    }
  }, [key, attempt]);
  useEffect(() => {
    const blobs = cache.current;
    return () => {
      controller.current?.abort();
      controller.current = null;
      inflight.current.clear();
      for (const s of blobs.values()) if (s !== 'empty' && s !== 'failed') URL.revokeObjectURL(s);
      blobs.clear();
    };
  }, []);
  const retry = useCallback(() => {
    for (const [u, s] of cache.current) if (s === 'failed') cache.current.delete(u);
    setAttempt((n) => n + 1);
  }, []);
  return { tiles: cache.current, retry };
}
