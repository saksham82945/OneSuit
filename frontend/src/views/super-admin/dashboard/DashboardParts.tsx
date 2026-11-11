import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, CalendarRange, Info, Minus, type LucideIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { dashCardClass, toneClasses, type Tone } from '@/components/dashboard';
import { cn } from '@/lib/utils';
import { RANGE_PRESETS, isValidRange, percentChange, type DateRange, type RangePreset } from './range';

/** A small "i" that explains a number or chart. */
export const InfoTip: React.FC<{ text: string }> = ({ text }) => (
  <TooltipProvider delayDuration={150}>
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={text}
          className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-gray-400 hover:text-gray-600 dark:text-white/40 dark:hover:text-white/70"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-[260px] leading-relaxed">{text}</TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

/** A titled card holding one chart, with an empty state when there's no data. */
export const ChartCard: React.FC<{
  title: string;
  info: string;
  /** Small figure next to the title, e.g. the period total. */
  headline?: React.ReactNode;
  empty?: boolean;
  emptyText?: string;
  height?: number;
  className?: string;
  linkTo?: string;
  linkLabel?: string;
  children: React.ReactNode;
}> = ({ title, info, headline, empty, emptyText = 'No data for this period yet.', height = 240, className, linkTo, linkLabel, children }) => (
  <div className={cn(dashCardClass, 'p-4 flex flex-col min-w-0', className)}>
    <div className="flex items-start justify-between gap-3 mb-3">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <h3 className="text-[13px] font-semibold text-gray-900 dark:text-white truncate">{title}</h3>
          <InfoTip text={info} />
        </div>
        {headline !== undefined && (
          <p className="mt-1 text-lg font-semibold tabular-nums text-gray-900 dark:text-white">{headline}</p>
        )}
      </div>
      {linkTo && (
        <Link to={linkTo} className="shrink-0 text-xs font-semibold text-[#0f5c62] hover:underline dark:text-teal-300">
          {linkLabel ?? 'View'}
        </Link>
      )}
    </div>
    <div className="relative flex-1 min-w-0" style={{ height }}>
      {empty ? (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl border border-dashed border-gray-200 text-xs text-gray-400 dark:border-white/[0.08] dark:text-white/40">
          {emptyText}
        </div>
      ) : (
        children
      )}
    </div>
  </div>
);

/** Headline number with its change vs the previous period. */
export const KpiCard: React.FC<{
  label: string;
  value: string;
  info: string;
  icon: LucideIcon;
  tone: Tone;
  current: number;
  previous?: number | null;
  /** Shown instead of a change when the metric is a live count. */
  note?: string;
  to?: string;
  highlight?: boolean;
}> = ({ label, value, info, icon: Icon, tone, current, previous, note, to, highlight }) => {
  const change = percentChange(current, previous);
  let trend: React.ReactNode;
  if (previous === undefined || previous === null) {
    trend = <span className="text-gray-400 dark:text-white/40">{note ?? 'Right now'}</span>;
  } else if (change === null) {
    trend = (
      <span className="text-gray-500 dark:text-white/50">
        New · none in previous period
      </span>
    );
  } else if (Math.abs(change) < 0.5) {
    trend = (
      <span className="inline-flex items-center gap-1 text-gray-500 dark:text-white/50">
        <Minus className="h-3 w-3" /> No change
      </span>
    );
  } else {
    const up = change > 0;
    trend = (
      <span
        className={cn(
          'inline-flex items-center gap-0.5 font-semibold',
          up ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
        )}
      >
        {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
        {Math.abs(change) >= 1000 ? '999+' : Math.abs(change).toFixed(Math.abs(change) < 10 ? 1 : 0)}%
        <span className="ml-1 font-normal text-gray-400 dark:text-white/40">vs previous</span>
      </span>
    );
  }
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-white/50 truncate">{label}</p>
          <InfoTip text={info} />
        </div>
        <span className={cn('h-7 w-7 rounded-lg flex items-center justify-center shrink-0', toneClasses[tone])}>
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-gray-900 dark:text-white truncate">{value}</p>
      <p className="mt-1 text-[11px]">{trend}</p>
    </>
  );
  const cls = cn(
    dashCardClass,
    'p-4 min-w-0 block',
    highlight && 'ring-1 ring-amber-400/60',
    to && 'transition-colors hover:border-[#0f5c62]/40 dark:hover:border-teal-400/30'
  );
  return to ? (
    <Link to={to} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
};

/** 7d / 30d / 90d / 12 months / custom switch. */
export const RangePicker: React.FC<{
  preset: RangePreset;
  range: DateRange;
  onPreset: (p: Exclude<RangePreset, 'custom'>) => void;
  onCustom: (r: DateRange) => void;
}> = ({ preset, range, onPreset, onCustom }) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange>(range);
  const btn = (active: boolean) =>
    cn(
      'rounded-lg px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors',
      active
        ? 'bg-white text-gray-900 shadow-sm dark:bg-white/[0.12] dark:text-white'
        : 'text-gray-500 hover:text-gray-900 dark:text-white/50 dark:hover:text-white'
    );
  const inputCls =
    'h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-900 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:[color-scheme:dark]';
  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <div className="flex flex-wrap items-center gap-1 rounded-xl bg-gray-100 p-1 dark:bg-white/[0.05]">
        {RANGE_PRESETS.map((p) => (
          <button key={p.id} type="button" className={btn(preset === p.id)} onClick={() => { setOpen(false); onPreset(p.id); }}>
            {p.label}
          </button>
        ))}
        <button
          type="button"
          className={cn(btn(preset === 'custom'), 'inline-flex items-center gap-1')}
          onClick={() => {
            setDraft(range);
            setOpen((o) => !o);
          }}
        >
          <CalendarRange className="h-3.5 w-3.5" /> Custom
        </button>
      </div>
      {open && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!isValidRange(draft)) return;
            onCustom(draft);
            setOpen(false);
          }}
        >
          <input type="date" aria-label="From" className={inputCls} value={draft.from} max={draft.to} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
          <span className="text-xs text-gray-400">to</span>
          <input type="date" aria-label="To" className={inputCls} value={draft.to} min={draft.from} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
          <button
            type="submit"
            disabled={!isValidRange(draft)}
            className="h-8 rounded-lg bg-[#0f5c62] px-3 text-xs font-semibold text-white disabled:opacity-40 dark:bg-teal-500 dark:text-gray-900"
          >
            Apply
          </button>
        </form>
      )}
      {open && !isValidRange(draft) && (
        <p className="text-[11px] text-rose-600 dark:text-rose-400">Pick a start before the end, at most about 2 years apart.</p>
      )}
    </div>
  );
};
