// Small fetch helpers shared by the online sources: timeout, retry with backoff on
// throttling and server errors, abort propagation, and a concurrency limiter.

export class HttpError extends Error {
  readonly status: number;
  readonly body: string;
  /** Reason phrase of the response (often empty over HTTP/2). */
  readonly statusText: string;

  constructor(status: number, body: string, url: string, statusText = '') {
    super(`HTTP ${status} from ${new URL(url).host}${body ? `: ${body.slice(0, 200)}` : ''}`);
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
    this.statusText = statusText;
  }
}

export interface FetchOptions extends RequestInit {
  /** Per-attempt timeout in ms (default 30 s). */
  timeoutMs?: number;
  /** Retries after the first attempt for 429/5xx/network errors (default 3). */
  retries?: number;
}

const RETRY_STATUS = new Set([408, 429, 500, 502, 503, 504]);

/** Retries for bulk streams, which can wait longer than interactive requests. */
export const BULK_RETRIES = 5;
/**
 * A stream stops issuing new requests after this many failed parts in a row (a part
 * fails once its retries are used up), and ends with `progress.stoppedEarly = 'errors'`.
 */
export const MAX_CONSECUTIVE_FAILURES = 5;

/** Backoff timing; tests shrink it. */
export const retryTiming = {
  /** First backoff in ms; doubles per attempt. */
  baseMs: 500,
  /** Backoff cap without a Retry-After header. */
  maxMs: 8000,
  /** Cap on a server's Retry-After. */
  maxRetryAfterMs: 30_000,
};

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

/** Retry-After in ms (delta seconds or an HTTP date), or undefined when absent. */
function retryAfterMs(response?: Response): number | undefined {
  const header = response?.headers.get('retry-after');
  if (!header) return undefined;
  const seconds = Number(header);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now();
  return Number.isFinite(ms) && ms > 0 ? ms : undefined;
}

/** Backoff before retry `attempt` (0-based), honouring the response's Retry-After. */
export function retryDelay(attempt: number, response?: Response): number {
  const retryAfter = retryAfterMs(response);
  if (retryAfter !== undefined) {
    return Math.min(retryAfter, retryTiming.maxRetryAfterMs);
  }
  return Math.min(retryTiming.baseMs * 2 ** attempt, retryTiming.maxMs) * (0.75 + Math.random() * 0.5);
}

const STATUS_TEXT: Record<number, string> = {
  400: 'Bad Request',
  404: 'Not Found',
  408: 'Request Timeout',
  413: 'Payload Too Large',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
};

/**
 * A short, human-readable account of a failed request for the UI, e.g.
 * "GBIF returned HTTP 503 Service Unavailable". `service` names the remote.
 */
export function describeRequestError(error: unknown, service: string): string {
  if (error instanceof HttpError) {
    const text = error.statusText || STATUS_TEXT[error.status] || '';
    return `${service} returned HTTP ${error.status}${text ? ` ${text}` : ''}`;
  }
  if (error instanceof TypeError) {
    return `Could not reach ${service} (network error)`;
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/timed out/i.test(message)) {
    return `${service} did not respond in time`;
  }
  const short = message.length > 120 ? `${message.slice(0, 117)}...` : message;
  return `${service} request failed: ${short}`;
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
      // Network error (fetch rejects with a TypeError) or timeout: retry.
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
      throw new HttpError(
        response.status,
        await response.text().catch(() => ''),
        url,
        response.statusText,
      );
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
