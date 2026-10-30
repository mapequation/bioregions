// Citable GBIF downloads: request one with the user's GBIF account, poll its status,
// and format the citation. The zip itself has no CORS, so the user downloads it in
// the browser and drops it back into the app (see zip.ts).

import { delay, fetchJson, fetchText, HttpError } from '../http';
import type { OccurrenceQuery } from '../types';
import { GBIF_API_URL } from './graphql';
import { gbifDownloadPredicate } from './predicate';

export const GBIF_DOWNLOAD_REQUEST_URL = `${GBIF_API_URL}/occurrence/download/request`;

export type GbifDownloadState =
  | 'PREPARING'
  | 'RUNNING'
  | 'SUSPENDED'
  | 'SUCCEEDED'
  | 'CANCELLED'
  | 'KILLED'
  | 'FAILED'
  | 'FILE_ERASED';

/** States after which the download no longer changes. */
export const TERMINAL_DOWNLOAD_STATES: ReadonlySet<string> = new Set([
  'SUCCEEDED',
  'CANCELLED',
  'KILLED',
  'FAILED',
  'FILE_ERASED',
]);

export interface GbifDownloadStatus {
  key: string;
  status: GbifDownloadState | string;
  /** Bare DOI, e.g. "10.15468/dl.gpysnc". */
  doi?: string;
  totalRecords?: number;
  /** Zip size in bytes. */
  size?: number;
  downloadLink?: string;
  numberDatasets?: number;
  license?: string;
  created?: string;
  modified?: string;
  eraseAfter?: string;
}

export interface GbifDownloadRequest {
  username: string;
  password: string;
  /** Notification address; GBIF emails when the download is ready. */
  email?: string;
  query: OccurrenceQuery;
}

/** User-facing error for a failed download request. */
export class GbifDownloadError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'GbifDownloadError';
    this.status = status;
  }
}

/** Base64 of a UTF-8 string (`btoa` alone rejects characters above U+00FF). */
export function base64Utf8(text: string): string {
  let binary = '';
  for (const byte of new TextEncoder().encode(text)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/** JSON body of `POST /occurrence/download/request`. */
export function gbifDownloadBody({ username, email, query }: Omit<GbifDownloadRequest, 'password'>) {
  return {
    creator: username,
    notificationAddresses: email ? [email] : [],
    sendNotification: !!email,
    format: 'SIMPLE_CSV',
    predicate: gbifDownloadPredicate(query),
  };
}

function downloadErrorMessage(error: HttpError): string {
  switch (error.status) {
    case 401:
    case 403:
      return 'GBIF rejected the login: wrong username or password.';
    case 409:
    case 420:
    case 429:
      return 'Too many downloads are running for this GBIF account (GBIF allows only a few at a time). Wait for one to finish and try again.';
    case 400:
      return `GBIF could not run this query${error.body ? `: ${error.body.slice(0, 300)}` : '.'}`;
    default:
      return `GBIF download request failed (HTTP ${error.status}).`;
  }
}

/**
 * Request a SIMPLE_CSV download for the query; resolves to the download key.
 * Credentials are sent only to api.gbif.org.
 */
export async function requestGbifDownload(
  request: GbifDownloadRequest,
  signal?: AbortSignal,
): Promise<string> {
  try {
    const key = await fetchText(GBIF_DOWNLOAD_REQUEST_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${base64Utf8(`${request.username}:${request.password}`)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(gbifDownloadBody(request)),
      signal,
      // Never repeat a POST that may already have started a download.
      retries: 0,
      timeoutMs: 60_000,
    });
    return key.trim();
  } catch (error) {
    if (error instanceof HttpError) {
      throw new GbifDownloadError(downloadErrorMessage(error), error.status);
    }
    throw error;
  }
}

/** Current status of a download. */
export async function getGbifDownload(key: string, signal?: AbortSignal): Promise<GbifDownloadStatus> {
  return fetchJson<GbifDownloadStatus>(
    `${GBIF_API_URL}/occurrence/download/${encodeURIComponent(key)}`,
    { signal },
  );
}

/** Poll until the download reaches a terminal state; `onUpdate` sees every status. */
export async function pollGbifDownload(
  key: string,
  {
    onUpdate,
    signal,
    intervalMs = 10_000,
  }: { onUpdate?: (status: GbifDownloadStatus) => void; signal?: AbortSignal; intervalMs?: number } = {},
): Promise<GbifDownloadStatus> {
  while (true) {
    const status = await getGbifDownload(key, signal);
    onUpdate?.(status);
    if (TERMINAL_DOWNLOAD_STATES.has(status.status)) {
      return status;
    }
    await delay(intervalMs, signal);
  }
}

/** "30 October 2026" in UTC. */
function citationDate(iso: string | undefined): string {
  const date = iso ? new Date(iso) : new Date();
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(Number.isNaN(date.getTime()) ? new Date() : date);
}

/** GBIF's recommended citation, e.g. "GBIF.org (30 October 2026) GBIF Occurrence Download https://doi.org/10.15468/dl.gpysnc". */
export function gbifDownloadCitation(status: Pick<GbifDownloadStatus, 'doi' | 'created' | 'key'>): string {
  const ref = status.doi ? `https://doi.org/${status.doi.replace(/^https?:\/\/doi\.org\//, '')}` : status.key;
  return `GBIF.org (${citationDate(status.created)}) GBIF Occurrence Download ${ref}`;
}
