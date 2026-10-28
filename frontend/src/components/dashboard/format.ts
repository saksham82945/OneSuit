/** Money in Indian formatting (₹1,23,456) unless the API gives another currency. */
export const formatMoney = (amount: number, currency = 'INR') => {
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currency || 'INR',
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);
  }
};

/** Whole numbers with Indian digit grouping. */
export const formatCount = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : new Intl.NumberFormat('en-IN').format(n);

/** Seconds as "45s", "3m 20s", "2h 5m". */
export const formatDuration = (seconds: number | null | undefined) => {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return '—';
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
};

export const formatShortDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
