import React from 'react';
import { Link } from 'react-router-dom';
import { CreditCard } from 'lucide-react';
import { CHECKOUT_PATH } from '@/lib/pendingPayment';

/** Shown instead of a page until a new workspace pays for its plan. */
export const PendingPaymentNotice: React.FC = () => (
  <div className="flex h-full items-center justify-center p-6">
    <div className="max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm dark:border-white/10 dark:bg-[#141b1a]">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
        <CreditCard className="h-5 w-5" />
      </span>
      <h2 className="mt-4 text-base font-semibold text-gray-900 dark:text-white">Complete your payment</h2>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Your workspace is ready. Pay for your plan to start using OneSuit — everything unlocks as soon as the payment goes through.
      </p>
      <div className="mt-5 flex justify-center gap-2">
        <Link to="/support" className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium hover:bg-gray-50 dark:border-white/10 dark:hover:bg-white/5">
          Contact support
        </Link>
        <Link to={CHECKOUT_PATH} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500">
          Continue to payment
        </Link>
      </div>
    </div>
  </div>
);
