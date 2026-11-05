import React from 'react';
import { cn } from '@/lib/utils';
import { BILLING_CYCLES, cyclePrice, formatPrice, type BillingInterval } from '@/services/superAdmin';
import type { PublicPlan } from './publicApi';

// Sign-up for a paid plan: choose how often to pay. The account is created, then
// /billing/checkout opens for the first payment.

export const SignupPaymentChoice: React.FC<{
  plan: PublicPlan;
  cycle: BillingInterval;
  onCycle: (c: BillingInterval) => void;
  disabled: boolean;
}> = ({ plan, cycle, onCycle, disabled }) => (
  <div className="space-y-3">
    <div>
      <p className="text-sm font-medium text-white/80 light:text-gray-700">Billing cycle</p>
      <p className="text-xs text-white/45 light:text-gray-500">You'll pay by UPI, card or net banking right after creating your account.</p>
    </div>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Billing cycle">
      {BILLING_CYCLES.map((c) => {
        const cp = cyclePrice(plan, c.id);
        const active = c.id === cycle;
        return (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onCycle(c.id)}
            className={cn(
              'relative rounded-lg border px-2.5 py-2 text-left transition-colors disabled:opacity-60',
              active
                ? 'border-emerald-500/70 bg-emerald-500/[0.08] light:bg-emerald-50'
                : 'border-white/10 hover:border-emerald-500/40 light:border-gray-200 light:hover:border-emerald-300'
            )}
          >
            {cp.discount > 0 && (
              <span className="absolute -top-2 right-1.5 rounded-full bg-emerald-600 px-1.5 text-[9px] font-bold leading-4 text-white">
                {cp.discount}% off
              </span>
            )}
            <span className="block text-[11px] text-white/50 light:text-gray-500">{c.label}</span>
            <span className="block text-sm font-semibold tabular-nums text-white light:text-gray-900">{formatPrice(cp.total)}</span>
          </button>
        );
      })}
    </div>
  </div>
);
