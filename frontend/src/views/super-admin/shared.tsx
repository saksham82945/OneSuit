import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';
import type { VendorStatus } from '@/services/superAdmin';

export const cardClass =
  'card-depth border-white/[0.08] bg-[#141415] text-white light:bg-white light:border-gray-200 light:text-gray-900';

export const fieldClass =
  'bg-white/[0.04] border-white/[0.08] text-white light:bg-white light:border-gray-200 light:text-gray-900';

export const StatCard: React.FC<{
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon: LucideIcon;
  tone?: 'emerald' | 'blue' | 'amber' | 'violet' | 'rose';
}> = ({ label, value, hint, icon: Icon, tone = 'emerald' }) => {
  const tones = {
    emerald: 'bg-emerald-500/15 text-emerald-400',
    blue: 'bg-blue-500/15 text-blue-400',
    amber: 'bg-amber-500/15 text-amber-400',
    violet: 'bg-violet-500/15 text-violet-400',
    rose: 'bg-rose-500/15 text-rose-400',
  };
  return (
    <div className={cn('rounded-xl border p-4', cardClass)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-white/50 light:text-gray-500">{label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums truncate">{value}</p>
        </div>
        <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center shrink-0', tones[tone])}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      {hint && <p className="mt-2 text-xs text-white/40 light:text-gray-500">{hint}</p>}
    </div>
  );
};

const statusStyles: Record<VendorStatus, string> = {
  active: 'bg-emerald-500/15 text-emerald-400 light:bg-emerald-100 light:text-emerald-700',
  trial: 'bg-blue-500/15 text-blue-400 light:bg-blue-100 light:text-blue-700',
  suspended: 'bg-rose-500/15 text-rose-400 light:bg-rose-100 light:text-rose-700',
};

export const VendorStatusBadge: React.FC<{ status: VendorStatus }> = ({ status }) => (
  <Badge className={cn('border-0 text-[11px] capitalize shadow-none', statusStyles[status])}>{status}</Badge>
);

export const LoadingBlock: React.FC = () => (
  <div className="flex-1 flex items-center justify-center p-12 text-sm text-white/40 light:text-gray-400">Loading…</div>
);

/** Pull a readable message out of an axios error. */
export const errorMessage = (err: unknown, fallback = 'Something went wrong'): string => {
  const e = err as { response?: { data?: { message?: string } }; message?: string } | undefined;
  return e?.response?.data?.message || e?.message || fallback;
};
