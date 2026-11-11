import { describe, expect, it } from 'vitest';
import { bucketLabel, computeTrend, rangeDays, resolveRange, validateCustomRange } from './range';

describe('dashboard range', () => {
  const now = new Date(2026, 10, 11, 15, 30); // 11 Nov 2026

  it('resolves presets to inclusive day bounds', () => {
    expect(resolveRange({ preset: 'today' }, now)).toEqual({ from: '2026-11-11', to: '2026-11-11' });
    expect(resolveRange({ preset: '7d' }, now)).toEqual({ from: '2026-11-05', to: '2026-11-11' });
    expect(resolveRange({ preset: '30d' }, now)).toEqual({ from: '2026-10-13', to: '2026-11-11' });
    expect(resolveRange({ preset: '90d' }, now).from).toBe('2026-08-14');
    expect(resolveRange({ preset: 'custom', from: '2026-01-01', to: '2026-01-31' }, now)).toEqual({
      from: '2026-01-01',
      to: '2026-01-31',
    });
  });

  it('counts days and validates custom ranges', () => {
    expect(rangeDays('2026-11-05', '2026-11-11')).toBe(7);
    expect(validateCustomRange('2026-11-05', '2026-11-11')).toBeNull();
    expect(validateCustomRange('2026-11-12', '2026-11-11')).toMatch(/before/);
    expect(validateCustomRange('2024-01-01', '2026-01-01')).toMatch(/at most/);
    expect(validateCustomRange('', '2026-01-01')).toMatch(/Pick/);
  });

  it('labels buckets', () => {
    expect(bucketLabel('2026-11-05T14:00', 'hour')).toBe('14:00');
    expect(bucketLabel('2026-11-05T00:00', 'day')).toMatch(/5/);
  });
});

describe('computeTrend', () => {
  it('compares counts in percent', () => {
    expect(computeTrend({ current: 150, previous: 100 })).toEqual({ direction: 'up', text: '+50.0%' });
    expect(computeTrend({ current: 50, previous: 100 })).toEqual({ direction: 'down', text: '−50.0%' });
    expect(computeTrend({ current: 5, previous: 0 })).toEqual({ direction: 'up', text: 'New' });
    expect(computeTrend({ current: 0, previous: 0 })).toEqual({ direction: 'flat', text: 'No change' });
  });

  it('compares rates in points and skips missing data', () => {
    expect(computeTrend({ current: 92.5, previous: 90 }, 'rate')).toEqual({ direction: 'up', text: '+2.5 pts' });
    expect(computeTrend({ current: 80, previous: null })).toEqual({ direction: 'none', text: '' });
    expect(computeTrend(undefined)).toEqual({ direction: 'none', text: '' });
  });
});
