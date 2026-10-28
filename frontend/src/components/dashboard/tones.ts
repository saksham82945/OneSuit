export type Tone = 'green' | 'teal' | 'purple' | 'blue' | 'orange' | 'red' | 'amber' | 'slate';

/** Soft icon-tile colours that read well in light and dark themes. */
export const toneClasses: Record<Tone, string> = {
  green: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
  teal: 'bg-[#e6f2f1] text-[#0f5c62] dark:bg-teal-500/15 dark:text-teal-300',
  purple: 'bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400',
  blue: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400',
  orange: 'bg-orange-50 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400',
  red: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400',
  slate: 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300',
};

/** Shared surface for dashboard cards. */
export const dashCardClass =
  'rounded-2xl border border-gray-200/80 bg-white shadow-sm dark:border-white/[0.08] dark:bg-[#141b1a]';
