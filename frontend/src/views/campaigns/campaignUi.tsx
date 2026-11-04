import React from 'react';
import { cn } from '@/lib/utils';
import { type CampaignRow, cardCls } from './campaignFormat';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-white/[0.06] dark:text-gray-300 dark:border-white/10',
  scheduled: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900/60',
  queued: 'bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-900/60',
  processing: 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-900/60',
  paused: 'bg-orange-50 text-orange-800 border-orange-200 dark:bg-orange-950/50 dark:text-orange-300 dark:border-orange-900/60',
  completed: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900/60',
  cancelled: 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-white/[0.04] dark:text-gray-400 dark:border-white/10',
  failed: 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-900/60',
  // recipient statuses
  pending: 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-white/[0.06] dark:text-gray-300 dark:border-white/10',
  sent: 'bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-900/60',
  delivered: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900/60',
  read: 'bg-teal-50 text-teal-800 border-teal-200 dark:bg-teal-950/50 dark:text-teal-300 dark:border-teal-900/60',
};

export const StatusBadge: React.FC<{ status?: string; className?: string }> = ({ status, className }) => {
  const s = (status || 'unknown').toLowerCase();
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap',
        STATUS_STYLES[s] || STATUS_STYLES.draft,
        className
      )}
    >
      {s === 'processing' && <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />}
      {s}
    </span>
  );
};

/** Stacked delivery bar: read ⊂ delivered ⊂ sent, plus failed, as a share of recipients. */
export const DeliveryBar: React.FC<{ c: CampaignRow; className?: string }> = ({ c, className }) => {
  const total = Math.max(c.total_recipients || 0, (c.sent_count || 0) + (c.failed_count || 0), 1);
  const read = c.read_count || 0;
  const delivered = Math.max((c.delivered_count || 0) - read, 0);
  const sentOnly = Math.max((c.sent_count || 0) - (c.delivered_count || 0), 0);
  const failed = c.failed_count || 0;
  const seg = (n: number) => `${(n / total) * 100}%`;
  return (
    <div
      className={cn('flex h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-white/[0.08]', className)}
      role="img"
      aria-label={`Read ${read}, delivered ${c.delivered_count || 0}, sent ${c.sent_count || 0}, failed ${failed} of ${c.total_recipients || 0}`}
    >
      <div className="bg-teal-600 dark:bg-teal-400" style={{ width: seg(read) }} />
      <div className="bg-emerald-500" style={{ width: seg(delivered) }} />
      <div className="bg-sky-400" style={{ width: seg(sentOnly) }} />
      <div className="bg-rose-500" style={{ width: seg(failed) }} />
    </div>
  );
};

export const DeliveryLegend: React.FC = () => (
  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-gray-500 dark:text-gray-400">
    {[
      ['bg-teal-600 dark:bg-teal-400', 'Read'],
      ['bg-emerald-500', 'Delivered'],
      ['bg-sky-400', 'Sent'],
      ['bg-rose-500', 'Failed'],
    ].map(([cls, label]) => (
      <span key={label} className="inline-flex items-center gap-1">
        <span className={cn('h-2 w-2 rounded-sm', cls)} />
        {label}
      </span>
    ))}
  </div>
);

export const StatCard: React.FC<{
  label: string;
  value: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: 'gray' | 'emerald' | 'teal' | 'sky' | 'rose' | 'violet';
}> = ({ label, value, hint, icon: Icon, tone = 'gray' }) => {
  const tones: Record<string, string> = {
    gray: 'bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300',
    emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
    teal: 'bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300',
    sky: 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300',
    rose: 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
    violet: 'bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300',
  };
  return (
    <div className={cn(cardCls, 'p-4 min-w-0')}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 truncate">{label}</p>
        <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', tones[tone])}>
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900 dark:text-white">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400 truncate">{hint}</p>}
    </div>
  );
};

export const ConfirmDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  busyLabel: string;
  cancelLabel?: string;
  isSubmitting?: boolean;
  onConfirm: () => void;
}> = ({ open, onOpenChange, title, description, confirmLabel, busyLabel, cancelLabel = 'Cancel', isSubmitting, onConfirm }) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-[425px]">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogFooter className="gap-2 sm:gap-0">
        <Button variant="outline" disabled={isSubmitting} onClick={() => onOpenChange(false)}>{cancelLabel}</Button>
        <Button variant="destructive" disabled={isSubmitting} onClick={onConfirm}>{isSubmitting ? busyLabel : confirmLabel}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
