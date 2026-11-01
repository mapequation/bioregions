// Pure helpers of the year brush.

export interface YearBin {
  year: number;
  count: number;
}

/** Share of records before which the brush domain starts (the early tail is lumped). */
const TAIL = 0.005;

/**
 * Brush domain [lo, hi]: from the decade where the earliest 0.5 % of dated records end
 * (or the selected start year, if earlier) to the current year.
 */
export function brushDomain(bins: readonly YearBin[], from: number | null, currentYear: number): [number, number] {
  const hi = currentYear;
  if (bins.length === 0) return [Math.min(from ?? 1900, hi - 10), hi];
  const sorted = [...bins].sort((a, b) => a.year - b.year);
  const total = sorted.reduce((s, b) => s + b.count, 0);
  let lo = sorted[0].year;
  let cum = 0;
  for (const b of sorted) {
    cum += b.count;
    if (cum >= total * TAIL) {
      lo = Math.floor(b.year / 10) * 10;
      break;
    }
  }
  if (from != null) lo = Math.min(lo, from);
  return [Math.min(lo, hi - 10), hi];
}

/** Share of dated records within [from, to] (null ends are open). */
export function rangeShare(bins: readonly YearBin[], from: number | null, to: number | null): number {
  let all = 0;
  let inside = 0;
  for (const b of bins) {
    all += b.count;
    if ((from == null || b.year >= from) && (to == null || b.year <= to)) inside += b.count;
  }
  return all > 0 ? inside / all : 0;
}
