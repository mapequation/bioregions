// Small fetch helpers shared by the online sources: timeout, retry with backoff on
// throttling and server errors, abort propagation, and a concurrency limiter.

export class HttpError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string, url: string) {
    super(`HTTP ${status} from ${new URL(url).host}${body ? `: ${body.slice(0, 200)}` : ''}`);
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
  }
}

export interface FetchOptions extends RequestInit {
  /** Per-attempt timeout in ms (default 30 s). */
  timeoutMs?: number;
  /** Retries after the first attempt for 429/5xx/network errors (default 3). */
  retries?: number;
}

const RETRY_STATUS = new Set([408, 429, 500, 502, 503, 504]);

export function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException
      ? error.name === 'AbortError'
      : (error as { name?: string } | null)?.name === 'AbortError'
  );
}

export function abortError(): DOMException {
  return new DOMException('The operation was aborted.', 'AbortError');
}

/** Resolve after `ms`, or reject with an AbortError as soon as `signal` aborts. */
export function delay(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function retryDelay(attempt: number, response?: Response): number {
  const retryAfter = Number(response?.headers.get('retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(retryAfter * 1000, 30_000);
  }
  return Math.min(500 * 2 ** attempt, 8000) * (0.75 + Math.random() * 0.5);
}

/** `fetch` with a per-attempt timeout and retries; throws `HttpError` on a final non-2xx. */
export async function fetchWithRetry(
  url: string,
  { timeoutMs = 30_000, retries = 3, signal, ...init }: FetchOptions = {},
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    if (signal?.aborted) {
      throw abortError();
    }
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response | undefined;
    try {
      response = await fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
      if (signal?.aborted) {
        throw abortError();
      }
      // Network error or timeout: retry.
      if (attempt >= retries) {
        throw error instanceof Error && !isAbortError(error)
          ? error
          : new Error(`Request to ${new URL(url).host} timed out`);
      }
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }

    if (response?.ok) {
      return response;
    }
    if (response && (!RETRY_STATUS.has(response.status) || attempt >= retries)) {
      throw new HttpError(response.status, await response.text().catch(() => ''), url);
    }
    await delay(retryDelay(attempt, response), signal);
  }
}

export async function fetchJson<T>(url: string, options?: FetchOptions): Promise<T> {
  const response = await fetchWithRetry(url, options);
  return (await response.json()) as T;
}

export async function fetchText(url: string, options?: FetchOptions): Promise<string> {
  const response = await fetchWithRetry(url, options);
  return response.text();
}

export async function postJson<T>(
  url: string,
  body: unknown,
  options: FetchOptions = {},
): Promise<T> {
  return fetchJson<T>(url, {
    ...options,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    body: JSON.stringify(body),
  });
}

/** Run at most `concurrency` tasks at once; tasks queue in call order. */
export function createLimiter(concurrency: number) {
  let active = 0;
  const queue: (() => void)[] = [];

  const next = () => {
    if (active >= concurrency) {
      return;
    }
    const start = queue.shift();
    if (start) {
      active++;
      start();
    }
  };

  return function limit<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push(() => {
        task()
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          });
      });
      next();
    });
  };
}
