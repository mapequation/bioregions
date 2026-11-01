// Query library persistence (recent, saved, GBIF downloads) and query JSON import.
import { decodeQuery } from '../../sources/query';
import type { OccurrenceQuery } from '../../sources/types';
import type { GbifDownload, SavedQuery } from './types';

export const STORAGE_KEYS = {
  recent: 'bioregions.explorer.recent',
  saved: 'bioregions.explorer.saved',
  downloads: 'bioregions.explorer.downloads',
} as const;

export const MAX_RECENT = 10;

/** A download request, with the key of the query it was made for. */
export interface StoredDownload extends GbifDownload {
  queryKey?: string;
}

/** Parsed JSON from localStorage, or `fallback` when missing, unreadable or blocked. */
export function readStorage<T>(key: string, fallback: T, valid: (x: unknown) => x is T): T {
  try {
    const text = globalThis.localStorage?.getItem(key);
    if (!text) return fallback;
    const parsed: unknown = JSON.parse(text);
    return valid(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

/** Store JSON in localStorage; failures (quota, private mode) are ignored. */
export function writeStorage(key: string, value: unknown): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    // Persistence is a convenience; the in-memory state stays correct.
  }
}

const toBase64Url = (text: string) => {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/**
 * A query from JSON text: a bare query object, `{v: 1, q: query}`, or an
 * `encodeQuery` string. Validated with `decodeQuery`.
 */
export function parseQueryText(text: string): { ok: true; query: OccurrenceQuery } | { ok: false; reason: string } {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, reason: 'Paste a query (JSON) first.' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    const q = decodeQuery(trimmed);
    return q ? { ok: true, query: q } : { ok: false, reason: 'This is not valid query JSON.' };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, reason: 'The JSON is not a query object.' };
  }
  const obj = parsed as Record<string, unknown>;
  const wrapped = 'v' in obj && 'q' in obj ? obj : { v: 1, q: obj };
  const q = decodeQuery(toBase64Url(JSON.stringify(wrapped)));
  return q ? { ok: true, query: q } : { ok: false, reason: 'The query JSON has invalid or unsupported fields.' };
}

const isObj = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);

/** Saved queries from storage, re-validated through `decodeQuery`. */
export function isSavedList(x: unknown): x is SavedQuery[] {
  return Array.isArray(x) && x.every((s) => isObj(s) && typeof s.id === 'string' && typeof s.name === 'string' && isObj(s.query));
}

export function loadSavedList(key: string): SavedQuery[] {
  const out: SavedQuery[] = [];
  for (const s of readStorage<SavedQuery[]>(key, [], isSavedList)) {
    const parsed = parseQueryText(JSON.stringify(s.query));
    if (parsed.ok) out.push({ ...s, query: parsed.query });
  }
  return out;
}

export function isDownloadList(x: unknown): x is StoredDownload[] {
  return Array.isArray(x) && x.every((d) => isObj(d) && typeof d.key === 'string' && typeof d.status === 'string');
}

/** Prepend an entry, dropping an older one with the same query key, keeping `max`. */
export function pushRecent(list: SavedQuery[], entry: SavedQuery, key: (q: OccurrenceQuery) => string, max = MAX_RECENT): SavedQuery[] {
  const k = key(entry.query);
  return [entry, ...list.filter((s) => key(s.query) !== k)].slice(0, max);
}

let counter = 0;
/** Short unique id for library entries. */
export function libraryId(prefix: string): string {
  counter = (counter + 1) % 1e6;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`;
}
