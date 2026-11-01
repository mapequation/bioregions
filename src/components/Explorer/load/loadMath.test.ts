import { describe, expect, it } from 'vitest';
import {
  fmtApproxMinutes,
  modEnterLabel,
  niceCapAbove,
  progressPercent,
  secondsUntil,
  yearsToFitCap,
} from './loadMath';

describe('niceCapAbove', () => {
  it('rounds up to one significant digit', () => {
    expect(niceCapAbove(1_800_000)).toBe(2_000_000);
    expect(niceCapAbove(620_000)).toBe(700_000);
    expect(niceCapAbove(500_000)).toBe(500_000);
  });
  it('uses half steps when the leading digit is 1', () => {
    expect(niceCapAbove(1_050_000)).toBe(1_500_000);
    expect(niceCapAbove(120_001)).toBe(150_000);
  });
  it('has a floor', () => {
    expect(niceCapAbove(0)).toBe(1000);
    expect(niceCapAbove(12)).toBe(1000);
  });
});

describe('yearsToFitCap', () => {
  const hist = [
    { year: 2000, count: 10 },
    { year: 2001, count: 20 },
    { year: 2002, count: 30 },
    { year: 2003, count: 40 },
  ];
  it('keeps the most recent years within the budget', () => {
    expect(yearsToFitCap(hist, [2000, 2003], 0.7)).toBe(2002);
    expect(yearsToFitCap(hist, [2000, 2003], 0.4)).toBe(2003);
  });
  it('respects the current range', () => {
    expect(yearsToFitCap(hist, [2000, 2002], 0.5)).toBe(2002);
  });
  it('returns null when nothing fits or nothing is needed', () => {
    expect(yearsToFitCap(hist, [2000, 2003], 0.1)).toBeNull();
    expect(yearsToFitCap(hist, [2000, 2003], 1)).toBeNull();
    expect(yearsToFitCap([], [2000, 2003], 0.5)).toBeNull();
  });
});

describe('small formatters', () => {
  it('formats approximate minutes', () => {
    expect(fmtApproxMinutes(20)).toBe('<1 min');
    expect(fmtApproxMinutes(130)).toBe('~2 min');
    expect(fmtApproxMinutes(4020)).toBe('~1 h 7 min');
    expect(fmtApproxMinutes(3600)).toBe('~1 h');
  });
  it('counts down seconds', () => {
    expect(secondsUntil(undefined, 0)).toBeNull();
    expect(secondsUntil(6_200, 1_000)).toBe(6);
    expect(secondsUntil(0, 1_000)).toBe(0);
  });
  it('clamps percentages', () => {
    expect(progressPercent(5, 10)).toBe(50);
    expect(progressPercent(15, 10)).toBe(100);
    expect(progressPercent(1, 0)).toBeNull();
  });
  it('labels the load shortcut per platform', () => {
    expect(modEnterLabel('MacIntel')).toBe('⌘ ↵');
    expect(modEnterLabel('Win32')).toBe('Ctrl ↵');
  });
});
