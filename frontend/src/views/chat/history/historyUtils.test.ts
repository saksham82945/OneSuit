import { describe, expect, it } from 'vitest';
import { formatDuration, groupByDay, rangeFor, splitHighlight, toDateInput } from './historyUtils';
import { filenameFromDisposition, historyParams } from '@/services/historyApi';

const now = new Date(2026, 2, 15, 14, 30); // 15 Mar 2026, local

describe('rangeFor', () => {
  const span = (p: Parameters<typeof rangeFor>[0], custom?: { from: string; to: string }) => {
    const r = rangeFor(p, now, custom);
    return [toDateInput(r.from), toDateInput(r.to)];
  };
  it('covers whole local days, end exclusive', () => {
    expect(span('today')).toEqual(['2026-03-15', '2026-03-16']);
    expect(span('yesterday')).toEqual(['2026-03-14', '2026-03-15']);
    expect(span('7d')).toEqual(['2026-03-09', '2026-03-16']);
    expect(span('30d')).toEqual(['2026-02-14', '2026-03-16']);
    expect(span('this_month')).toEqual(['2026-03-01', '2026-03-16']);
    expect(span('last_month')).toEqual(['2026-02-01', '2026-03-01']);
  });
  it('custom is inclusive and swaps a reversed range', () => {
    expect(span('custom', { from: '2026-01-05', to: '2026-01-07' })).toEqual(['2026-01-05', '2026-01-08']);
    expect(span('custom', { from: '2026-01-07', to: '2026-01-05' })).toEqual(['2026-01-05', '2026-01-08']);
  });
  it('last month across a year boundary', () => {
    const r = rangeFor('last_month', new Date(2026, 0, 10));
    expect([toDateInput(r.from), toDateInput(r.to)]).toEqual(['2025-12-01', '2026-01-01']);
  });
});

describe('helpers', () => {
  it('formats durations', () => {
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(42)).toBe('42s');
    expect(formatDuration(420)).toBe('7m');
    expect(formatDuration(4800)).toBe('1h 20m');
    expect(formatDuration(2 * 86400 + 3 * 3600)).toBe('2d 3h');
  });
  it('splits highlights case-insensitively', () => {
    expect(splitHighlight('Parcel and parcel', 'PARCEL')).toEqual([
      { text: 'Parcel', match: true },
      { text: ' and ', match: false },
      { text: 'parcel', match: true },
    ]);
    expect(splitHighlight('hello', '')).toEqual([{ text: 'hello', match: false }]);
  });
  it('groups by day in order', () => {
    const g = groupByDay([
      { created_at: new Date(2026, 2, 1, 9).toISOString() },
      { created_at: new Date(2026, 2, 1, 20).toISOString() },
      { created_at: new Date(2026, 2, 2, 8).toISOString() },
    ]);
    expect(g.map((x) => [x.day, x.items.length])).toEqual([
      ['2026-03-01', 2],
      ['2026-03-02', 1],
    ]);
  });
  it('builds params without empty filters', () => {
    expect(historyParams({ from: 'a', to: 'b', search: ' +91 ', tags: [], direction: '' }, { page: 2 })).toEqual({
      from: 'a',
      to: 'b',
      page: 2,
      search: '91',
    });
  });
  it('reads a download filename', () => {
    expect(filenameFromDisposition('attachment; filename="chat_a.csv"', 'x')).toBe('chat_a.csv');
    expect(filenameFromDisposition(undefined, 'x')).toBe('x');
  });
});
