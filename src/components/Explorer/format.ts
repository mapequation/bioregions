// Number formatting for the data explorer. Every number in the explorer goes through
// these helpers so separators, units and signs stay consistent.

const MINUS = '−';
const intFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** 1234567 -> "1,234,567". */
export function fmtInt(n: number): string {
  return intFormat.format(Math.round(n));
}

function trim(value: number, digits: number): string {
  return value.toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

/** 412380 -> "412 k", 1800000 -> "1.8 M", 950 -> "950". */
export function fmtCompact(n: number): string {
  const sign = n < 0 ? MINUS : '';
  const a = Math.abs(n);
  if (a < 1000) return `${sign}${fmtInt(a)}`;
  if (a < 1e6) {
    const k = a / 1e3;
    if (Math.round(k) >= 1000) return `${sign}1 M`;
    return `${sign}${k < 10 ? trim(k, 1) : fmtInt(k)} k`;
  }
  if (a < 1e9) {
    const m = a / 1e6;
    if (Math.round(m) >= 1000) return `${sign}1 B`;
    return `${sign}${m < 10 ? trim(m, 1) : fmtInt(m)} M`;
  }
  const b = a / 1e9;
  return `${sign}${b < 10 ? trim(b, 1) : fmtInt(b)} B`;
}

/** 61e6 -> "61 MB", 1.5e9 -> "1.5 GB", 800 -> "800 B" (decimal units). */
export function fmtBytes(bytes: number): string {
  const units = ['B', 'kB', 'MB', 'GB', 'TB'];
  let v = Math.max(0, bytes);
  let i = 0;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i++;
  }
  const digits = i === 0 || v >= 10 ? 0 : 1;
  return `${trim(v, digits)} ${units[i]}`;
}

/** 72 -> "1 m 12 s", 41 -> "41 s", 3720 -> "1 h 2 m". */
export function fmtDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const rest = s % 60;
    return rest ? `${m} m ${rest} s` : `${m} m`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return m ? `${h} h ${m} m` : `${h} h`;
}

/** 0.31 -> "31 %", 0.003 -> "<1 %", 0 -> "0 %". */
export function fmtPct(fraction: number): string {
  if (!Number.isFinite(fraction)) return '–';
  if (fraction > 0 && fraction < 0.005) return '<1 %';
  return `${Math.round(fraction * 100)} %`;
}

/** -88410 -> "−88,410" (true minus sign), 1200 -> "+1,200", 0 -> "0". */
export function fmtSigned(n: number): string {
  if (n === 0) return '0';
  return `${n < 0 ? MINUS : '+'}${fmtInt(Math.abs(n))}`;
}
