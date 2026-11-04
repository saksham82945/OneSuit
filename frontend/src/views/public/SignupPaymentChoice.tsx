import React from 'react';
import { Gift, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BILLING_CYCLES, cyclePrice, formatPrice, type BillingInterval } from '@/services/superAdmin';
import type { PublicPlan } from './publicApi';

// Sign-up: choose to start the free trial or pay for the plan now (then /billing/checkout).

export const SignupPaymentChoice: React.FC<{
  plan: PublicPlan;
  trialDays: number;
  payNow: boolean;
  onPayNow: (v: boolean) => void;
  cycle: BillingInterval;
  onCycle: (c: BillingInterval) => void;
  disabled: boolean;
}> = ({ plan, trialDays, payNow, onPayNow, cycle, onCycle, disabled }) => {
  const options = [
    {
      value: false,
      icon: Gift,
      title: trialDays > 0 ? `Start ${trialDays}-day free trial` : 'Pay later',
      text: trialDays > 0 ? 'No card needed. Pay any time.' : 'Set up first, pay from Billing.',
    },
    { value: true, icon: Wallet, title: 'Pay now', text: 'UPI, card or net banking' },
  ];
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-white/80 light:text-gray-700">How do you want to start?</p>
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="How do you want to start">
        {options.map((o) => {
          const active = payNow === o.value;
          return (
            <button
              key={String(o.value)}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onPayNow(o.value)}
              className={cn(
                'flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors disabled:opacity-60',
                active
                  ? 'border-emerald-500/70 bg-emerald-500/[0.08] ring-1 ring-emerald-500/50 light:bg-emerald-50'
                  : 'border-white/10 hover:border-emerald-500/40 light:border-gray-200 light:hover:border-emerald-300'
              )}
            >
              <o.icon className={cn('mt-0.5 h-4 w-4 shrink-0', active ? 'text-emerald-400 light:text-emerald-600' : 'text-white/40 light:text-gray-400')} />
              <span>
                <span className="block text-sm font-medium text-white light:text-gray-900">{o.title}</span>
                <span className="block text-xs text-white/45 light:text-gray-500">{o.text}</span>
              </span>
            </button>
          );
        })}
      </div>

      {payNow && (
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
      )}
    </div>
  );
};
