import React, { useState } from 'react';
import { CalendarRange } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { RANGE_PRESETS, formatDay, rangeLabel, resolveRange, validateCustomRange, type DashboardRange } from './range';

interface RangePickerProps {
  value: DashboardRange;
  onChange: (range: DashboardRange) => void;
}

const segment =
  'h-7 rounded-lg px-2.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500';
const active = 'bg-white text-gray-900 shadow-sm dark:bg-white/10 dark:text-white';
const idle = 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200';

/** Today / 7d / 30d / 90d / Custom switch that drives every dashboard chart. */
export const RangePicker: React.FC<RangePickerProps> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const current = resolveRange(value);
  const [from, setFrom] = useState(current.from);
  const [to, setTo] = useState(current.to);
  const error = validateCustomRange(from, to);
  const today = formatDay(new Date());

  return (
    <div
      role="group"
      aria-label="Date range"
      className="flex flex-wrap items-center gap-0.5 rounded-xl border border-gray-200 bg-gray-50 p-0.5 dark:border-white/10 dark:bg-white/[0.04]"
    >
      {RANGE_PRESETS.map((p) => (
        <button
          key={p.key}
          type="button"
          aria-pressed={value.preset === p.key}
          onClick={() => onChange({ preset: p.key })}
          className={cn(segment, value.preset === p.key ? active : idle)}
        >
          {p.label}
        </button>
      ))}
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (o) {
            setFrom(current.from);
            setTo(current.to);
          }
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-pressed={value.preset === 'custom'}
            className={cn(segment, 'inline-flex items-center gap-1', value.preset === 'custom' ? active : idle)}
          >
            <CalendarRange className="h-3.5 w-3.5" />
            {value.preset === 'custom' ? rangeLabel(value) : 'Custom'}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 space-y-3">
          <p className="text-sm font-semibold">Custom range</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-[11px] font-medium text-gray-500 dark:text-gray-400">
              From
              <input
                type="date"
                value={from}
                max={to || today}
                onChange={(e) => setFrom(e.target.value)}
                className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-900 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-100"
              />
            </label>
            <label className="space-y-1 text-[11px] font-medium text-gray-500 dark:text-gray-400">
              To
              <input
                type="date"
                value={to}
                min={from}
                max={today}
                onChange={(e) => setTo(e.target.value)}
                className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-900 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-100"
              />
            </label>
          </div>
          {error && <p className="text-[11px] text-rose-600 dark:text-rose-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={!!error}
              onClick={() => {
                onChange({ preset: 'custom', from, to });
                setOpen(false);
              }}
            >
              Apply
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};
