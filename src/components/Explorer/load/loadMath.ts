// Pure helpers for the load dock and progress rows (no React, no store).

/** Smallest "round" cap at or above n: one significant digit, half steps when it starts with 1. */
export function niceCapAbove(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 1000;
  const mag = 10 ** Math.floor(Math.log10(n));
  const step = n / mag < 2 ? mag / 2 : mag;
  return Math.max(1000, Math.ceil(n / step - 1e-9) * step);
}

/**
 * First year of a narrowed range that keeps at most `fraction` of the records in `range`,
 * keeping the most recent years. Null when even the last year alone is too much.
 */
export function yearsToFitCap(
  hist: { year: number; count: number }[],
  range: [number, number],
  fraction: number,
): number | null {
  const inRange = hist.filter((b) => b.year >= range[0] && b.year <= range[1]).sort((a, b) => b.year - a.year);
  const total = inRange.reduce((s, b) => s + b.count, 0);
  if (total === 0 || fraction >= 1) return null;
  const budget = total * fraction;
  let sum = 0;
  let first: number | null = null;
  for (const b of inRange) {
    if (sum + b.count > budget) break;
    sum += b.count;
    first = b.year;
  }
  return first;
}

/** 130 -> "~2 min", 20 -> "<1 min", 4000 -> "~1 h 7 min". */
export function fmtApproxMinutes(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 45) return '<1 min';
  const min = Math.round(seconds / 60);
  if (min < 60) return `~${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `~${h} h ${m} min` : `~${h} h`;
}

/** Whole seconds until `retryAt` (never negative). */
export function secondsUntil(retryAt: number | undefined, now: number): number | null {
  if (retryAt == null) return null;
  return Math.max(0, Math.ceil((retryAt - now) / 1000));
}

/** Clamped 0–100 percentage of done / total, null when the total is unknown. */
export function progressPercent(done: number, total: number): number | null {
  if (!Number.isFinite(total) || total <= 0) return null;
  return Math.min(100, Math.max(0, (done / total) * 100));
}

/** "Mod+Enter" label for the platform. */
export function modEnterLabel(platform: string): string {
  return /mac|iphone|ipad/i.test(platform) ? '⌘ ↵' : 'Ctrl ↵';
}
