import React from 'react';
import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';

/** Shown instead of a page whose section the workspace's plan doesn't include. */
export const PlanLockedNotice: React.FC = () => (
  <div className="flex h-full items-center justify-center p-6">
    <div className="max-w-sm rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm dark:border-white/10 dark:bg-[#141b1a]">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
        <Lock className="h-5 w-5" />
      </span>
      <h2 className="mt-4 text-base font-semibold text-gray-900 dark:text-white">Not included in your plan</h2>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        This section isn't part of your current subscription. Contact support to upgrade your plan.
      </p>
      <div className="mt-5 flex justify-center gap-2">
        <Link to="/settings/billing" className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium hover:bg-gray-50 dark:border-white/10 dark:hover:bg-white/5">
          View plan
        </Link>
        <Link to="/support" className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500">
          Contact support
        </Link>
      </div>
    </div>
  </div>
);
