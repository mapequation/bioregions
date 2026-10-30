import { describe, expect, it } from 'vitest';
import { fmtBytes, fmtCompact, fmtDuration, fmtInt, fmtPct, fmtSigned } from './format';

describe('explorer number formats', () => {
  it('formats integers with thousands separators', () => {
    expect(fmtInt(1234567)).toBe('1,234,567');
    expect(fmtInt(0)).toBe('0');
    expect(fmtInt(12.6)).toBe('13');
  });

  it('formats compact counts', () => {
    expect(fmtCompact(950)).toBe('950');
    expect(fmtCompact(412380)).toBe('412 k');
    expect(fmtCompact(1500)).toBe('1.5 k');
    expect(fmtCompact(1_800_000)).toBe('1.8 M');
    expect(fmtCompact(999_999)).toBe('1 M');
    expect(fmtCompact(25_000_000)).toBe('25 M');
    expect(fmtCompact(-12_300)).toBe('−12 k');
  });

  it('formats bytes in decimal units', () => {
    expect(fmtBytes(61_000_000)).toBe('61 MB');
    expect(fmtBytes(1_500_000_000)).toBe('1.5 GB');
    expect(fmtBytes(800)).toBe('800 B');
  });

  it('formats durations', () => {
    expect(fmtDuration(72)).toBe('1 m 12 s');
    expect(fmtDuration(41)).toBe('41 s');
    expect(fmtDuration(120)).toBe('2 m');
    expect(fmtDuration(3720)).toBe('1 h 2 m');
  });

  it('formats percentages', () => {
    expect(fmtPct(0.31)).toBe('31 %');
    expect(fmtPct(0.003)).toBe('<1 %');
    expect(fmtPct(0)).toBe('0 %');
  });

  it('formats signed counts with a true minus sign', () => {
    expect(fmtSigned(-88410)).toBe('−88,410');
    expect(fmtSigned(1200)).toBe('+1,200');
    expect(fmtSigned(0)).toBe('0');
  });
});
