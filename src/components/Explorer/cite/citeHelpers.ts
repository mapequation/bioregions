// Pure helpers for the Cite & reproduce tab and the Library (no React, no store).
import { citationDate, gbifDownloadCitation } from '@/sources';
import type { GbifDownload, Provenance } from '../../../store/explorer/types';

/** Accepts "10.15468/dd-abc", "doi:10.…" or "https://doi.org/10.…"; returns the bare DOI or null. */
export function normalizeDoi(input: string): string | null {
  const bare = input.trim().replace(/^(https?:\/\/(dx\.)?doi\.org\/|doi:\s*)/i, '');
  return /^10\.\d{4,9}\/\S+$/.test(bare) ? bare : null;
}

/** Sources that contributed accepted records to a load. */
export function contributingSources(last: Pick<Provenance, 'funnel' | 'datasetCounts'>): ('gbif' | 'obis')[] {
  return (['gbif', 'obis'] as const).filter(
    (s) => (last.funnel.bySource[s]?.accepted ?? 0) > 0 || (last.datasetCounts[s]?.length ?? 0) > 0,
  );
}

/** The GBIF reference: a citable download DOI wins over a derived-dataset DOI, else the to-be-registered note. */
export function gbifReference(
  last: Pick<Provenance, 'retrievedAt' | 'derivedDoi' | 'gbifDownloadKey'>,
  downloads: Pick<GbifDownload, 'key' | 'status' | 'doi' | 'createdAt'>[],
): string {
  const dl = downloads.find((d) => d.key === last.gbifDownloadKey && d.status === 'SUCCEEDED');
  if (dl) return gbifDownloadCitation({ key: dl.key, doi: dl.doi, created: dl.createdAt });
  const date = citationDate(last.retrievedAt);
  const doi = last.derivedDoi ? normalizeDoi(last.derivedDoi) : null;
  if (doi) return `GBIF.org (${date}) Filtered export of GBIF occurrence data https://doi.org/${doi}`;
  return `GBIF.org (${date}) GBIF Occurrence Data via API, derived dataset to be registered`;
}

/** The OBIS citation without the trailing "Datasets: id, id, …" list. */
export function obisCitationHead(citation: string): string {
  return citation.split(/\.\s+Datasets:/)[0];
}

export function isPending(d: Pick<GbifDownload, 'status'>): boolean {
  return d.status === 'PREPARING' || d.status === 'RUNNING';
}

/** "14:31" today, "29 Oct, 14:31" on other days, "–" when missing. */
export function shortTime(iso: string | undefined, now = new Date()): string {
  if (!iso) return '–';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const sameDay = d.toDateString() === now.toDateString();
  return d.toLocaleString(undefined, {
    ...(sameDay ? {} : { day: 'numeric', month: 'short' }),
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** "30 Oct 2026, 14:03" in the viewer's locale. */
export function retrievedLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** "just now", "5 min ago", "3 h ago", "2 d ago", else a date. */
export function timeAgo(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const s = Math.max(0, (now - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** Inline error for the download dialog; credential problems point at the password field. */
export function requestError(text: string): { text: string; field?: 'password' } {
  return /password|username|credential|unauthori[sz]ed|\b40[13]\b/i.test(text) ? { text, field: 'password' } : { text };
}

/** Save text as a file in the browser. */
export function downloadText(fileName: string, text: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Copy to the clipboard; resolves false when the browser refuses. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
