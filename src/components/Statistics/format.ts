import { format } from 'd3-format';
import type { Bioregion } from '@/store/InfomapStore';

export const formatInt = format(',');
const format3r = format(',.3r');
const formatPercent1 = format('.1%');

/** `word` or its plural form for `n` ("1 cell" / "2 cells" uses `plural` below). */
export function pluralWord(n: number, word: string, pluralForm = `${word}s`) {
  return n === 1 ? word : pluralForm;
}

/** "1 cell", "2,000 cells". */
export function plural(n: number, word: string, pluralForm?: string) {
  return `${formatInt(n)} ${pluralWord(n, word, pluralForm)}`;
}

/** "49,300 km²" below a million, "1.84 M km²" above. */
export function formatArea(km2: number) {
  if (km2 < 1e6) return `${format3r(km2)} km²`;
  return `${format('.3r')(km2 / 1e6)} M km²`;
}

/** Whole percent, but never round a non-zero share down to "0%". */
export function formatShare(fraction: number) {
  if (fraction > 0 && fraction < 0.005) return '<1%';
  return `${Math.round(fraction * 100)}%`;
}

/** One decimal, but never round a non-zero share down to "0.0%". */
export function formatFlow(flow: number) {
  if (flow > 0 && flow < 0.0005) return '<0.1%';
  return formatPercent1(flow);
}

const lat = (y: number) => {
  const v = Math.round(Math.abs(y));
  return v === 0 ? '0°' : `${v}°${y > 0 ? 'N' : 'S'}`;
};

const lon = (x: number) => {
  // The bbox east edge may exceed 180 for regions straddling the antimeridian.
  const wrapped = x > 180 ? x - 360 : x < -180 ? x + 360 : x;
  const v = Math.round(Math.abs(wrapped));
  return v === 0 || v === 180 ? `${v}°` : `${v}°${wrapped > 0 ? 'E' : 'W'}`;
};

/** "8°N–34°S, 78°W–52°W" (north–south, west–east). */
export function formatExtent(bbox: Bioregion['bbox']) {
  const [w, s, e, n] = bbox;
  return `${lat(n)}–${lat(s)}, ${lon(w)}–${lon(e)}`;
}
