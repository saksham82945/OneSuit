/** Date-range presets and small pure helpers for the Chat History page. */

export type RangePreset = 'today' | 'yesterday' | '7d' | '30d' | 'this_month' | 'last_month' | 'custom';

export const RANGE_PRESETS: { id: RangePreset; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
  { id: 'this_month', label: 'This month' },
  { id: 'last_month', label: 'Last month' },
  { id: 'custom', label: 'Custom' },
];

/** A half-open local-time window [from, to). */
export interface DateRange {
  from: Date;
  to: Date;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** "YYYY-MM-DD" in local time, for <input type="date">. */
export const toDateInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** Parses "YYYY-MM-DD" as local midnight; null when malformed. */
export const fromDateInput = (s: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * The window for a preset. Custom uses the inclusive from/to dates
 * ("YYYY-MM-DD"); a reversed custom range is swapped.
 */
export function rangeFor(preset: RangePreset, now = new Date(), custom?: { from: string; to: string }): DateRange {
  const today = startOfDay(now);
  switch (preset) {
    case 'today':
      return { from: today, to: addDays(today, 1) };
    case 'yesterday':
      return { from: addDays(today, -1), to: today };
    case '7d':
      return { from: addDays(today, -6), to: addDays(today, 1) };
    case '30d':
      return { from: addDays(today, -29), to: addDays(today, 1) };
    case 'this_month':
      return { from: new Date(today.getFullYear(), today.getMonth(), 1), to: addDays(today, 1) };
    case 'last_month':
      return {
        from: new Date(today.getFullYear(), today.getMonth() - 1, 1),
        to: new Date(today.getFullYear(), today.getMonth(), 1),
      };
    case 'custom': {
      let from = (custom && fromDateInput(custom.from)) || addDays(today, -6);
      let to = (custom && fromDateInput(custom.to)) || today;
      if (to < from) [from, to] = [to, from];
      return { from, to: addDays(to, 1) };
    }
  }
}

/** Human label such as "3 Mar – 9 Mar 2026" (to is exclusive). */
export function rangeLabel(r: DateRange) {
  const last = addDays(r.to, -1);
  const sameYear = r.from.getFullYear() === last.getFullYear();
  const fmt = (d: Date, withYear: boolean) =>
    d.toLocaleDateString([], { day: 'numeric', month: 'short', year: withYear ? 'numeric' : undefined });
  if (toDateInput(r.from) === toDateInput(last)) return fmt(r.from, true);
  return `${fmt(r.from, !sameYear)} – ${fmt(last, true)}`;
}

/** Seconds as "45s", "7m", "1h 20m", "2d 3h". */
export function formatDuration(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d}d ${h % 24}h` : `${d}d`;
}

/** Splits text around case-insensitive matches of q, for highlighting. */
export function splitHighlight(text: string, q: string): { text: string; match: boolean }[] {
  const needle = q.trim();
  if (!needle || !text) return [{ text, match: false }];
  const lower = text.toLowerCase();
  const n = needle.toLowerCase();
  const out: { text: string; match: boolean }[] = [];
  let i = 0;
  while (i < text.length) {
    const j = lower.indexOf(n, i);
    if (j < 0) break;
    if (j > i) out.push({ text: text.slice(i, j), match: false });
    out.push({ text: text.slice(j, j + needle.length), match: true });
    i = j + needle.length;
  }
  if (i < text.length) out.push({ text: text.slice(i), match: false });
  return out.length ? out : [{ text, match: false }];
}

/** Groups items by local calendar day, keeping order. */
export function groupByDay<T extends { created_at: string }>(items: T[]): { day: string; items: T[] }[] {
  const groups: { day: string; items: T[] }[] = [];
  for (const it of items) {
    const d = new Date(it.created_at);
    const key = Number.isNaN(d.getTime()) ? '' : toDateInput(d);
    const last = groups[groups.length - 1];
    if (last && last.day === key) last.items.push(it);
    else groups.push({ day: key, items: [it] });
  }
  return groups;
}
