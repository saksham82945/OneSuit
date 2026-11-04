import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CreditCard, CheckCircle2, Download, Sparkles, MessageSquare, ArrowUpRight, Loader2, FileText, LifeBuoy } from 'lucide-react';
import { toast } from 'sonner';
import { billingService, type BillingInfo, type BillingInvoice } from '@/services/api';
import { readData } from '@/services/response';
import { cn } from '@/lib/utils';

// Billing: the workspace's real plan, usage and invoices from GET /api/billing.

interface PublicPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  interval: string;
  max_users: number;
  max_contacts: number;
  max_accounts: number;
  features: string[];
}

const money = (amount: number, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: currency || 'INR', maximumFractionDigits: 2 }).format(amount || 0);

const day = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const cycleLabel = (c?: string) =>
  ({ monthly: 'month', quarterly: 'quarter', half_yearly: '6 months', yearly: 'year' })[c || 'monthly'] || 'month';

const limitText = (n: number) => (n > 0 ? n.toLocaleString('en-IN') : 'Unlimited');

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

/** Opens a printable invoice; the browser's print dialog saves it as PDF. */
const printInvoice = (inv: BillingInvoice, company: Record<string, string>) => {
  const w = window.open('', '_blank', 'width=820,height=1000');
  if (!w) {
    toast.error('Allow pop-ups for this site to download the invoice');
    return;
  }
  const period =
    inv.period_start && inv.period_end ? `<p class="muted">Service period: ${day(inv.period_start)} – ${day(inv.period_end)}</p>` : '';
  const billedTo = [company.workspace, company.owner_name, company.owner_email].filter(Boolean).map((v) => esc(v)).join('<br/>');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Invoice ${esc(inv.number)}</title>
<style>
body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111827;margin:48px;font-size:14px}
h1{font-size:26px;margin:0} .muted{color:#6b7280;margin:4px 0}
.row{display:flex;justify-content:space-between;gap:24px;margin-top:32px}
table{width:100%;border-collapse:collapse;margin-top:32px} th,td{text-align:left;padding:10px 8px;border-bottom:1px solid #e5e7eb}
th{font-size:12px;text-transform:uppercase;color:#6b7280} td.r,th.r{text-align:right}
.total{font-size:18px;font-weight:700} .paid{display:inline-block;padding:2px 10px;border-radius:999px;background:#d1fae5;color:#065f46;font-weight:600;font-size:12px}
@media print{body{margin:24px}}
</style></head><body>
<div class="row" style="margin-top:0"><div><h1>OneSuit</h1><p class="muted">Tax invoice</p></div>
<div style="text-align:right"><strong>${esc(inv.number)}</strong><p class="muted">Issued ${day(inv.issued_at)}</p>
<span class="paid">${esc(inv.status.toUpperCase())}${inv.paid_at ? ' · ' + day(inv.paid_at) : ''}</span></div></div>
<div class="row"><div><p class="muted">Billed to</p><p>${billedTo || '—'}</p></div></div>
<table><thead><tr><th>Description</th><th class="r">Amount</th></tr></thead>
<tbody><tr><td>${esc(inv.description)}${period}</td><td class="r">${money(inv.amount, inv.currency)}</td></tr></tbody>
<tfoot><tr><td class="total">Total</td><td class="r total">${money(inv.amount, inv.currency)}</td></tr></tfoot></table>
<p class="muted" style="margin-top:32px">Amount shown includes applicable taxes. Thank you for your business.</p>
<script>window.onload=function(){window.print()}</script>
</body></html>`);
  w.document.close();
};

export const BillingView: React.FC = () => {
  const navigate = useNavigate();
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [plansOpen, setPlansOpen] = useState(false);
  const [plans, setPlans] = useState<PublicPlan[] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setBilling(readData<BillingInfo>(await billingService.get()) ?? null);
    } catch {
      toast.error('Could not load billing details');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openPlans = async () => {
    setPlansOpen(true);
    if (plans) return;
    try {
      setPlans(readData<{ plans: PublicPlan[] }>(await billingService.publicPlans())?.plans ?? []);
    } catch {
      setPlans([]);
    }
  };

  const plan = billing?.plan ?? null;
  const invoices = billing?.invoices ?? [];
  const statusColor =
    plan?.status === 'active'
      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
      : plan?.status === 'trial'
        ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30'
        : 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30';

  return (
    <div className="flex flex-col h-full bg-[#f8faf9] dark:bg-[#0a0f0e] text-gray-900 dark:text-gray-100 overflow-y-auto">
      <PageHeader
        title="Billing & Subscription"
        subtitle="Your OneSuit plan, usage and invoices"
        icon={CreditCard}
        iconGradient="bg-gradient-to-br from-teal-500 to-emerald-600 shadow-teal-500/20"
        actions={
          <Button
            size="sm"
            onClick={openPlans}
            className="h-9 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-semibold text-xs shadow-md shadow-emerald-600/20"
          >
            <Sparkles className="h-4 w-4 mr-1.5" />
            View plans
          </Button>
        }
      />

      {loading && !billing ? (
        <div className="flex flex-1 items-center justify-center p-12">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="p-6 space-y-6 max-w-7xl mx-auto w-full">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Current plan */}
            <div className="rounded-2xl border border-gray-200/90 dark:border-white/10 bg-white dark:bg-[#141b1a] p-6 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Current Plan</span>
                  {plan && <Badge className={cn('text-[10px] font-bold uppercase', statusColor)}>{plan.status}</Badge>}
                </div>
                <h3 className="text-2xl font-black text-gray-900 dark:text-white mt-2">{plan?.name || 'No plan yet'}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  {plan?.name
                    ? `${money(billing?.cycle_price || plan.price, plan.currency)} / ${cycleLabel(billing?.billing_cycle)}`
                    : 'Choose a plan to unlock higher limits.'}
                  {plan?.renewal_date && ` · ${plan.days_left !== null && plan.days_left < 0 ? 'Expired' : 'Renews'} ${day(plan.renewal_date)}`}
                </p>
                {plan?.days_left !== null && plan?.days_left !== undefined && plan.days_left >= 0 && plan.days_left <= 7 && (
                  <p className="mt-2 text-xs font-medium text-amber-600 dark:text-amber-400">
                    {plan.days_left === 0 ? 'Your plan ends today.' : `Your plan ends in ${plan.days_left} day${plan.days_left === 1 ? '' : 's'}.`}{' '}
                    Contact support to renew.
                  </p>
                )}
                {(billing?.features?.length ?? 0) > 0 && (
                  <ul className="mt-4 grid gap-1.5 sm:grid-cols-2">
                    {billing!.features.map((f) => (
                      <li key={f} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" /> {f}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="pt-4 border-t border-gray-100 dark:border-white/5 mt-6 flex items-center justify-between">
                <button
                  onClick={() => navigate('/support')}
                  className="text-xs font-semibold text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 flex items-center gap-1"
                >
                  <LifeBuoy className="h-3.5 w-3.5" /> Billing help
                </button>
                <button onClick={openPlans} className="text-xs font-bold text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-0.5">
                  Change plan <ArrowUpRight className="h-3 w-3" />
                </button>
              </div>
            </div>

            {/* Usage */}
            <div className="rounded-2xl border border-gray-200/90 dark:border-white/10 bg-white dark:bg-[#141b1a] p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Usage</span>
                <MessageSquare className="h-4 w-4 text-teal-600 dark:text-teal-400" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-black text-gray-900 dark:text-white">
                  {(billing?.messages_this_month ?? 0).toLocaleString('en-IN')}
                </span>
                <span className="text-sm text-gray-400">messages sent this month</span>
              </div>
              <div className="mt-5 space-y-4">
                {(plan?.quotas ?? []).map((q) => {
                  const pct = q.limit > 0 ? Math.min(100, (q.used / q.limit) * 100) : 0;
                  return (
                    <div key={q.key}>
                      <div className="flex justify-between text-xs">
                        <span className="font-medium text-gray-700 dark:text-gray-300">{q.label}</span>
                        <span className="text-gray-500 dark:text-gray-400">
                          {q.used.toLocaleString('en-IN')} / {limitText(q.limit)}
                        </span>
                      </div>
                      {q.limit > 0 && (
                        <div className="w-full bg-gray-100 dark:bg-white/10 rounded-full h-1.5 mt-1.5 overflow-hidden">
                          <div
                            className={cn('h-1.5 rounded-full', pct >= 90 ? 'bg-red-500' : 'bg-gradient-to-r from-teal-500 to-emerald-500')}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
                {!plan && <p className="text-xs text-gray-500 dark:text-gray-400">Limits appear once a plan is active.</p>}
              </div>
            </div>
          </div>

          {/* Invoices */}
          <div className="rounded-2xl border border-gray-200/90 dark:border-white/10 bg-white dark:bg-[#141b1a] p-6 shadow-sm">
            <div className="pb-4 border-b border-gray-100 dark:border-white/5">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">Billing History & Invoices</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Every plan period and ad credit top-up billed to this workspace</p>
            </div>
            {invoices.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <FileText className="h-8 w-8 text-gray-300 dark:text-gray-600" />
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">No invoices yet</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Invoices appear here once a paid plan or ad credit is activated.</p>
              </div>
            ) : (
              <div className="overflow-x-auto mt-4">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-100 dark:border-white/5">
                      <th className="py-2.5 font-semibold">Invoice</th>
                      <th className="py-2.5 font-semibold">Date</th>
                      <th className="py-2.5 font-semibold">Description</th>
                      <th className="py-2.5 font-semibold">Amount</th>
                      <th className="py-2.5 font-semibold">Status</th>
                      <th className="py-2.5 font-semibold text-right">Receipt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                    {invoices.map((inv) => (
                      <tr key={inv.id} className="hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-colors">
                        <td className="py-3 font-mono font-semibold text-gray-900 dark:text-white whitespace-nowrap">{inv.number}</td>
                        <td className="py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">{day(inv.issued_at)}</td>
                        <td className="py-3 font-medium text-gray-800 dark:text-gray-200">
                          {inv.description}
                          {inv.period_start && inv.period_end && (
                            <span className="block text-[11px] font-normal text-gray-400">
                              {day(inv.period_start)} – {day(inv.period_end)}
                            </span>
                          )}
                        </td>
                        <td className="py-3 font-semibold text-gray-900 dark:text-white whitespace-nowrap">{money(inv.amount, inv.currency)}</td>
                        <td className="py-3">
                          <span
                            className={cn(
                              'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border',
                              inv.status === 'paid'
                                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20'
                                : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20'
                            )}
                          >
                            {inv.status}
                          </span>
                        </td>
                        <td className="py-3 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => printInvoice(inv, billing?.company ?? {})}
                            className="h-7 text-xs text-teal-600 dark:text-teal-400 hover:text-teal-700 font-semibold"
                          >
                            <Download className="h-3.5 w-3.5 mr-1" />
                            PDF
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Plans */}
      <Dialog open={plansOpen} onOpenChange={setPlansOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-teal-600" />
              OneSuit plans
            </DialogTitle>
            <DialogDescription>To change your plan, contact support. We switch it for you and the invoice appears here.</DialogDescription>
          </DialogHeader>
          {plans === null ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          ) : plans.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">No plans are published yet.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 py-3">
              {plans.map((p) => {
                const current = p.name === plan?.name;
                return (
                  <div
                    key={p.id}
                    className={cn(
                      'rounded-xl p-4 flex flex-col justify-between relative',
                      current ? 'border-2 border-teal-500 bg-teal-50/20 dark:bg-teal-950/30' : 'border border-gray-200 dark:border-white/10'
                    )}
                  >
                    {current && <Badge className="absolute -top-2.5 right-4 bg-teal-600 text-white text-[9px] font-bold">CURRENT PLAN</Badge>}
                    <div>
                      <span className="text-xs font-bold uppercase text-gray-600 dark:text-gray-300">{p.name}</span>
                      <div className="text-xl font-black mt-1">
                        {money(p.price)}
                        <span className="text-xs text-gray-400 font-normal">/{p.interval === 'yearly' ? 'yr' : 'mo'}</span>
                      </div>
                      {p.description && <p className="mt-1 text-[11px] text-gray-500">{p.description}</p>}
                      <ul className="text-[11px] text-gray-600 dark:text-gray-300 space-y-1.5 mt-3">
                        <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-emerald-500" /> {limitText(p.max_accounts)} WhatsApp numbers</li>
                        <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-emerald-500" /> {limitText(p.max_users)} team members</li>
                        <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-emerald-500" /> {limitText(p.max_contacts)} contacts</li>
                        {p.features.map((f) => (
                          <li key={f} className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-emerald-500" /> {f}</li>
                        ))}
                      </ul>
                    </div>
                    <Button
                      size="sm"
                      variant={current ? 'default' : 'outline'}
                      disabled={current}
                      onClick={() => {
                        setPlansOpen(false);
                        navigate('/support');
                      }}
                      className="w-full mt-4 text-xs font-semibold"
                    >
                      {current ? 'Your plan' : 'Ask to switch'}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPlansOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BillingView;
