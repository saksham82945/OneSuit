import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { cycleInfo, formatPrice } from '@/services/superAdmin';
import { checkoutPath, paymentsService, PAYMENT_STATUS_LABEL, type Payment, type PaymentStatus } from '@/services/payments';

const STATUS_STYLE: Record<PaymentStatus, string> = {
  paid: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
  pending_verification: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30',
  created: 'bg-gray-500/10 text-gray-600 dark:text-gray-300 border-gray-500/20',
  failed: 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20',
  rejected: 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20',
};

const day = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

/** The workspace's plan payments (GET /api/payments). Unpaid, abandoned checkouts are left out. */
export const PaymentsSection: React.FC = () => {
  const navigate = useNavigate();
  const [payments, setPayments] = useState<Payment[] | null>(null);

  useEffect(() => {
    paymentsService
      .list()
      .then((list) => setPayments(list.filter((p) => p.status !== 'created')))
      .catch(() => setPayments([]));
  }, []);

  const pending = payments?.filter((p) => p.status === 'pending_verification') ?? [];

  return (
    <div className="rounded-2xl border border-gray-200/90 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#141b1a]">
      <div className="border-b border-gray-100 pb-4 dark:border-white/5">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white">Payments</h3>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Plan payments made by Razorpay or UPI</p>
      </div>
      {pending.length > 0 && (
        <p className="mt-4 rounded-xl border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          {pending.length === 1 ? 'A payment is' : `${pending.length} payments are`} awaiting verification. Your plan activates once the OneSuit
          team confirms it (usually within a few hours).
        </p>
      )}
      {payments === null ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      ) : payments.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <Receipt className="h-8 w-8 text-gray-300 dark:text-gray-600" />
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">No payments yet</p>
        </div>
      ) : (
        <ul className="mt-2 divide-y divide-gray-100 dark:divide-white/5">
          {payments.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 text-xs">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-900 dark:text-white">
                  {p.plan_name} · {cycleInfo(p.billing_cycle).label}
                </p>
                <p className="mt-0.5 text-gray-500 dark:text-gray-400">
                  {day(p.paid_at || p.created_at)} · {p.method === 'upi' ? 'UPI' : 'Razorpay'}
                  {p.upi_reference ? ` · UTR ${p.upi_reference}` : ''}
                </p>
                {(p.status === 'rejected' || p.status === 'failed') && p.failure_reason && (
                  <p className="mt-1 text-red-600 dark:text-red-400">{p.failure_reason}</p>
                )}
              </div>
              <span className="font-semibold tabular-nums text-gray-900 dark:text-white">{formatPrice(p.amount)}</span>
              <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase', STATUS_STYLE[p.status])}>
                {PAYMENT_STATUS_LABEL[p.status] ?? p.status}
              </span>
              {(p.status === 'rejected' || p.status === 'failed') && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate(checkoutPath(p.plan_id, p.billing_cycle))}
                  className="h-7 text-xs font-semibold text-teal-700 dark:text-teal-300"
                >
                  Pay again
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
