import React from 'react';
import { cn } from '@/lib/utils';
import type { Contact, Message } from '../chatUtils';

/** Props every composer dialog takes. */
export interface ComposeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: Contact;
  onSent: (m: Message | null, preview: string) => void;
}

export const primaryBtn = 'bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-60';

export const fieldCls =
  'h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20';

export const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode; className?: string }> = ({ label, hint, children, className }) => (
  <label className={cn('block text-xs font-medium text-foreground', className)}>
    <span className="mb-1 flex items-baseline justify-between gap-2">
      <span>{label}</span>
      {hint && <span className="text-[10px] font-normal text-muted-foreground">{hint}</span>}
    </span>
    {children}
  </label>
);

/** A short coloured note, e.g. "This is a WhatsApp button poll". */
export const Note: React.FC<{ tone?: 'info' | 'warn'; children: React.ReactNode }> = ({ tone = 'info', children }) => (
  <p
    className={cn(
      'rounded-lg border px-3 py-2 text-[11px] leading-relaxed',
      tone === 'info'
        ? 'border-teal-500/30 bg-teal-500/10 text-teal-800 dark:text-teal-200'
        : 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200'
    )}
  >
    {children}
  </p>
);
