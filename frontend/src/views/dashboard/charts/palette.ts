/** Chart colours tuned for the light and dark dashboard surfaces. */
export interface ChartPalette {
  sent: string;
  received: string;
  delivered: string;
  read: string;
  failed: string;
  pending: string;
  contacts: string;
  assigned: string;
  unassigned: string;
  resolved: string;
  expired: string;
  bot: string;
  grid: string;
  tick: string;
  tooltipBg: string;
  tooltipText: string;
  /** Fill for empty cells / tracks. */
  track: string;
}

const light: ChartPalette = {
  sent: '#0f766e',
  received: '#6366f1',
  delivered: '#10b981',
  read: '#0ea5e9',
  failed: '#e11d48',
  pending: '#f59e0b',
  contacts: '#2563eb',
  assigned: '#0f766e',
  unassigned: '#f59e0b',
  resolved: '#6366f1',
  expired: '#94a3b8',
  bot: '#8b5cf6',
  grid: 'rgba(15, 23, 42, 0.06)',
  tick: '#6b7280',
  tooltipBg: '#111827',
  tooltipText: '#f9fafb',
  track: '#f1f5f9',
};

const dark: ChartPalette = {
  sent: '#2dd4bf',
  received: '#a5b4fc',
  delivered: '#34d399',
  read: '#38bdf8',
  failed: '#fb7185',
  pending: '#fbbf24',
  contacts: '#60a5fa',
  assigned: '#2dd4bf',
  unassigned: '#fbbf24',
  resolved: '#a5b4fc',
  expired: '#64748b',
  bot: '#c4b5fd',
  grid: 'rgba(255, 255, 255, 0.07)',
  tick: '#9ca3af',
  tooltipBg: '#f9fafb',
  tooltipText: '#111827',
  track: 'rgba(255, 255, 255, 0.06)',
};

export const chartPalette = (isDark: boolean): ChartPalette => (isDark ? dark : light);

/** Adds an alpha channel to a #rrggbb colour. */
export const withAlpha = (hex: string, alpha: number) => {
  if (!hex.startsWith('#') || hex.length !== 7) return hex;
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
};
