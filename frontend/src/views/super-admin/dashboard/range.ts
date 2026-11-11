/** Date range presets for the platform dashboard. Dates are YYYY-MM-DD, inclusive. */
export type RangePreset = '7d' | '30d' | '90d' | '12m' | 'custom';

export const RANGE_PRESETS: { id: Exclude<RangePreset, 'custom'>; label: string }[] = [
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: '90d', label: '90 days' },
  { id: '12m', label: '12 months' },
];

export interface DateRange {
  from: string;
  to: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar date as YYYY-MM-DD. */
export const toISODate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The from/to dates a preset covers, ending today. 12 months starts on the 1st so months are whole. */
export const presetRange = (preset: Exclude<RangePreset, 'custom'>, today = new Date()): DateRange => {
  const to = toISODate(today);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  switch (preset) {
    case '7d':
      start.setDate(start.getDate() - 6);
      break;
    case '30d':
      start.setDate(start.getDate() - 29);
      break;
    case '90d':
      start.setDate(start.getDate() - 89);
      break;
    case '12m':
      start.setDate(1);
      start.setMonth(start.getMonth() - 11);
      break;
  }
  return { from: toISODate(start), to };
};

/** A custom range is valid when both dates are set, from ≤ to, and it spans at most 800 days (the API's limit). */
export const isValidRange = (r: DateRange) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.from) || !/^\d{4}-\d{2}-\d{2}$/.test(r.to)) return false;
  const from = new Date(`${r.from}T00:00:00`);
  const to = new Date(`${r.to}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return false;
  return (to.getTime() - from.getTime()) / 86_400_000 < 800;
};

/** Change vs the previous period: null when there's nothing to compare against. */
export const percentChange = (value: number, previous: number | null | undefined): number | null => {
  if (previous === null || previous === undefined) return null;
  if (previous === 0) return value === 0 ? 0 : null;
  return ((value - previous) / previous) * 100;
};

/** Chart axis label for a bucket key (YYYY-MM-DD). */
export const bucketLabel = (bucket: string, granularity: 'day' | 'month') => {
  const d = new Date(`${bucket}T00:00:00`);
  return granularity === 'month'
    ? d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
    : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};
