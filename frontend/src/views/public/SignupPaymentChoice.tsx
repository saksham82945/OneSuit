import React from 'react';
import { Compass, CreditCard } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BILLING_CYCLES, cyclePrice, formatPrice, type BillingInterval } from '@/services/superAdmin';
import type { PublicPlan } from './publicApi';

// Sign-up for a paid plan: pay now (the account is created, then /billing/checkout
// opens for the first payment) or explore first (straight into the app; looking
// around is free, anything that runs asks for the payment).

export type PaymentMode = 'now' | 'later';

const MODES: { id: PaymentMode; title: string; text: string; icon: React.ElementType }[] = [
  {
    id: 'now',
    title: 'Pay now',
    text: 'Pay by UPI, card or net banking right after creating your account and start straight away.',
    icon: CreditCard,
  },
  {
    id: 'later',
    title: 'Explore first (pay later)',
    text: 'Look around every feature for free. Pay when you want to connect your number, send or run ads.',
    icon: Compass,
  },
];

export const SignupPaymentChoice: React.FC<{
  plan: PublicPlan;
  mode: PaymentMode;
  onMode: (m: PaymentMode) => void;
  cycle: BillingInterval;
  onCycle: (c: BillingInterval) => void;
  disabled: boolean;
}> = ({ plan, mode, onMode, cycle, onCycle, disabled }) => (
  <div className="space-y-4">
    <div className="space-y-2">
      <p className="text-sm font-medium text-white/80 light:text-gray-700">How do you want to start?</p>
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="How do you want to start?">
        {MODES.map((m) => {
          const active = m.id === mode;
          const Icon = m.icon;
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onMode(m.id)}
              className={cn(
                'flex gap-3 rounded-xl border p-3 text-left transition-colors disabled:opacity-60',
                active
                  ? 'border-emerald-500/70 bg-emerald-500/[0.08] light:bg-emerald-50'
                  : 'border-white/10 hover:border-emerald-500/40 light:border-gray-200 light:hover:border-emerald-300'
              )}
            >
              <span
                className={cn(
                  'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                  active
                    ? 'bg-emerald-600 text-white'
                    : 'bg-white/[0.06] text-white/60 light:bg-gray-100 light:text-gray-500'
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-white light:text-gray-900">{m.title}</span>
                <span className="mt-0.5 block text-xs text-white/50 light:text-gray-500">{m.text}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>

    {mode === 'now' && (
      <div className="space-y-2">
        <p className="text-sm font-medium text-white/80 light:text-gray-700">Billing cycle</p>
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
    )}
  </div>
);
