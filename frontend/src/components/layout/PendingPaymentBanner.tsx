import React from 'react';
import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { usePlanModules } from '@/lib/planModules';
import { CHECKOUT_PATH } from '@/lib/pendingPayment';

/**
 * Explore mode: a workspace that signed up for a paid plan and hasn't paid yet
 * can open every page; this slim strip keeps the way to pay one click away.
 * (The checkout page picks the workspace's own plan.)
 */
export const PendingPaymentBanner: React.FC<{ hidden?: boolean }> = ({ hidden }) => {
  const { pendingPayment } = usePlanModules();
  if (!pendingPayment || hidden) return null;

  return (
    <div className="sticky top-12 md:top-0 z-30 flex items-center justify-between gap-3 border-b border-emerald-500/20 bg-emerald-950 px-4 py-1.5 text-xs text-emerald-50 shrink-0 light:border-emerald-200 light:bg-emerald-50 light:text-emerald-900">
      <span className="flex items-center gap-2 min-w-0">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-emerald-400 light:text-emerald-600" />
        <span className="truncate">
          <span className="sm:hidden">Exploring · upgrade to start</span>
          <span className="hidden sm:inline">
            You're exploring OneSuit — Upgrade to start connecting your number, sending and running ads.
          </span>
        </span>
      </span>
      <Link
        to={CHECKOUT_PATH}
        className="shrink-0 rounded-md bg-emerald-600 px-2.5 py-0.5 font-medium text-white hover:bg-emerald-500"
      >
        Upgrade / Pay now
      </Link>
    </div>
  );
};
