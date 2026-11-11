import type { DashboardKPI } from '@/services/dashboard';

export type RangePreset = 'today' | '7d' | '30d' | '90d' | 'custom';

export interface DashboardRange {
  preset: RangePreset;
  /** YYYY-MM-DD, used when preset is "custom". */
  from?: string;
  to?: string;
}

export const RANGE_PRESETS: { key: Exclude<RangePreset, 'custom'>; label: string; days: number }[] = [
  { key: 'today', label: 'Today', days: 1 },
  { key: '7d', label: '7 days', days: 7 },
  { key: '30d', label: '30 days', days: 30 },
  { key: '90d', label: '90 days', days: 90 },
];

/** The server accepts at most this many days in one range. */
export const MAX_RANGE_DAYS = 366;

export const formatDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const parseDay = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

/** Whole calendar days in [from, to], both inclusive. */
export const rangeDays = (from: string, to: string) =>
  Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / 86_400_000) + 1;

/** Resolves a range to inclusive YYYY-MM-DD bounds ("7 days" = today and the 6 days before). */
export const resolveRange = (range: DashboardRange, now = new Date()): { from: string; to: string } => {
  const today = formatDay(now);
  if (range.preset === 'custom' && range.from && range.to) return { from: range.from, to: range.to };
  const preset = RANGE_PRESETS.find((p) => p.key === range.preset) ?? RANGE_PRESETS[1];
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (preset.days - 1));
  return { from: formatDay(start), to: today };
};

/** Validates a custom range; returns an error message or null. */
export const validateCustomRange = (from: string, to: string): string | null => {
  if (!from || !to) return 'Pick a start and end date';
  if (from > to) return 'Start date must be before the end date';
  if (rangeDays(from, to) > MAX_RANGE_DAYS) return `Pick at most ${MAX_RANGE_DAYS} days`;
  return null;
};

export const rangeLabel = (range: DashboardRange) => {
  if (range.preset === 'custom' && range.from && range.to) {
    const fmt = (s: string) => parseDay(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    return range.from === range.to ? fmt(range.from) : `${fmt(range.from)} – ${fmt(range.to)}`;
  }
  const preset = RANGE_PRESETS.find((p) => p.key === range.preset);
  return preset?.key === 'today' ? 'Today' : `Last ${preset?.label ?? '7 days'}`;
};

/** Axis label for a bucket key like "2026-11-05T14:00". */
export const bucketLabel = (key: string, granularity: 'hour' | 'day' | 'week') => {
  const [day, time = '00:00'] = key.split('T');
  if (granularity === 'hour') return time;
  return parseDay(day).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

export type TrendDirection = 'up' | 'down' | 'flat' | 'none';

export interface Trend {
  direction: TrendDirection;
  /** Short text, e.g. "+12%", "−3.5 pts", "New", "No change". Empty when not comparable. */
  text: string;
}

/**
 * Change of a KPI against the previous period. Rates (already percentages)
 * are compared in percentage points; counts and durations in percent.
 */
export const computeTrend = (kpi: DashboardKPI | undefined, kind: 'count' | 'rate' | 'duration' = 'count'): Trend => {
  if (!kpi || kpi.current === null || kpi.current === undefined || kpi.previous === null || kpi.previous === undefined) {
    return { direction: 'none', text: '' };
  }
  const { current, previous } = kpi;
  if (kind === 'rate') {
    const diff = current - previous;
    if (Math.abs(diff) < 0.05) return { direction: 'flat', text: 'No change' };
    return { direction: diff > 0 ? 'up' : 'down', text: `${diff > 0 ? '+' : '−'}${Math.abs(diff).toFixed(1)} pts` };
  }
  if (current === previous) return { direction: 'flat', text: 'No change' };
  if (previous === 0) return { direction: 'up', text: 'New' };
  const change = ((current - previous) / previous) * 100;
  const abs = Math.abs(change);
  return {
    direction: change > 0 ? 'up' : 'down',
    text: `${change > 0 ? '+' : '−'}${abs >= 100 ? Math.round(abs) : abs.toFixed(1)}%`,
  };
};
