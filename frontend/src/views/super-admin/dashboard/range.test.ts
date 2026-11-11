import { describe, expect, it } from 'vitest';
import { isValidRange, percentChange, presetRange } from './range';

describe('platform dashboard ranges', () => {
  const today = new Date(2026, 10, 11); // 11 Nov 2026

  it('covers whole days ending today', () => {
    expect(presetRange('7d', today)).toEqual({ from: '2026-11-05', to: '2026-11-11' });
    expect(presetRange('30d', today)).toEqual({ from: '2026-10-13', to: '2026-11-11' });
    expect(presetRange('90d', today)).toEqual({ from: '2026-08-14', to: '2026-11-11' });
  });

  it('starts 12 months on the first of a month', () => {
    expect(presetRange('12m', today)).toEqual({ from: '2025-12-01', to: '2026-11-11' });
  });

  it('validates custom ranges', () => {
    expect(isValidRange({ from: '2026-01-01', to: '2026-01-31' })).toBe(true);
    expect(isValidRange({ from: '2026-02-01', to: '2026-01-31' })).toBe(false);
    expect(isValidRange({ from: '', to: '2026-01-31' })).toBe(false);
    expect(isValidRange({ from: '2020-01-01', to: '2026-01-31' })).toBe(false);
  });

  it('only shows a change when there is something to compare with', () => {
    expect(percentChange(10, null)).toBeNull();
    expect(percentChange(10, 0)).toBeNull();
    expect(percentChange(0, 0)).toBe(0);
    expect(percentChange(15, 10)).toBe(50);
  });
});
