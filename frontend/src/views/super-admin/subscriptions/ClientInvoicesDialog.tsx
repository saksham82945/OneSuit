import React, { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api, type BillingInvoice } from '@/services/api';
import { formatDate, formatPrice, type Vendor } from '@/services/superAdmin';
import { cn } from '@/lib/utils';
import { errorMessage } from '../shared';

const fetchInvoices = (id: string) =>
  api
    .get<{ data: { invoices: BillingInvoice[] } }>(`/super-admin/vendors/${id}/invoices`)
    .then((r) => r.data.data?.invoices ?? []);

const statusClass = (status: string) =>
  status === 'paid'
    ? 'bg-emerald-500/15 text-emerald-400 light:bg-emerald-100 light:text-emerald-700'
    : status === 'due'
      ? 'bg-amber-500/15 text-amber-400 light:bg-amber-100 light:text-amber-700'
      : 'bg-gray-500/15 text-gray-300 light:bg-gray-100 light:text-gray-600';

const period = (inv: BillingInvoice) =>
  inv.period_start && inv.period_end ? `${formatDate(inv.period_start)} – ${formatDate(inv.period_end)}` : null;

/** A client's invoices (newest first), read from GET /super-admin/vendors/{id}/invoices. */
export const ClientInvoicesDialog: React.FC<{ client: Vendor | null; onClose: () => void }> = ({ client, onClose }) => {
  const [invoices, setInvoices] = useState<BillingInvoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!client) return;
    let alive = true;
    setInvoices(null);
    setError(null);
    fetchInvoices(client.id)
      .then((list) => alive && setInvoices(list))
      .catch((e) => alive && setError(errorMessage(e, 'Could not load invoices')));
    return () => {
      alive = false;
    };
  }, [client]);

  const paidTotal = (invoices ?? []).filter((i) => i.status === 'paid').reduce((sum, i) => sum + i.amount, 0);

  return (
    <Dialog open={!!client} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[760px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Invoices · {client?.name}</DialogTitle>
          <DialogDescription>
            {invoices && invoices.length > 0
              ? `${invoices.length} invoice${invoices.length === 1 ? '' : 's'} · ${formatPrice(paidTotal)} paid in total`
              : 'Subscription and ad credit invoices issued to this client.'}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto -mx-1 px-1">
          {error ? (
            <p className="py-8 text-center text-sm text-rose-400 light:text-rose-600">{error}</p>
          ) : !invoices ? (
            <p className="py-8 text-center text-sm text-white/40 light:text-gray-400">Loading…</p>
          ) : invoices.length === 0 ? (
            <div className="py-10 text-center text-sm text-white/50 light:text-gray-500">
              <FileText className="mx-auto mb-2 h-6 w-6 opacity-60" />
              No invoices yet. One is issued automatically when an active client's plan, cycle or renewal changes.
            </div>
          ) : (
            <>
              {/* Phone: stacked cards */}
              <ul className="space-y-2 sm:hidden">
                {invoices.map((inv) => (
                  <li key={inv.id} className="rounded-lg border border-white/[0.08] p-3 light:border-gray-200">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-xs">{inv.number}</p>
                        <p className="mt-0.5 text-sm">{inv.description}</p>
                      </div>
                      <span className="text-sm font-semibold tabular-nums">{formatPrice(inv.amount)}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2 text-xs text-white/50 light:text-gray-500">
                      <span>{formatDate(inv.issued_at)}{period(inv) && ` · ${period(inv)}`}</span>
                      <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase', statusClass(inv.status))}>{inv.status}</span>
                    </div>
                  </li>
                ))}
              </ul>

              {/* Wider screens: table */}
              <table className="hidden w-full text-sm sm:table">
                <thead>
                  <tr className="border-b border-white/[0.08] text-left text-xs text-white/50 light:border-gray-200 light:text-gray-500">
                    <th className="py-2 pr-3 font-medium">Number</th>
                    <th className="py-2 pr-3 font-medium">Date</th>
                    <th className="py-2 pr-3 font-medium">Description</th>
                    <th className="py-2 pr-3 text-right font-medium">Amount</th>
                    <th className="py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="border-b border-white/[0.05] last:border-0 light:border-gray-100">
                      <td className="py-2 pr-3 font-mono text-xs whitespace-nowrap">{inv.number}</td>
                      <td className="py-2 pr-3 text-xs whitespace-nowrap">{formatDate(inv.issued_at)}</td>
                      <td className="py-2 pr-3">
                        <span className="block">{inv.description}</span>
                        {period(inv) && <span className="block text-[11px] text-white/40 light:text-gray-500">{period(inv)}</span>}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">{formatPrice(inv.amount)}</td>
                      <td className="py-2">
                        <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase', statusClass(inv.status))}>{inv.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
