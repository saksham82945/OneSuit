import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  IndianRupee,
  RefreshCw,
  Search,
  Copy,
  Check,
  CalendarDays,
  CircleCheck,
  Hourglass,
  X,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  QrCode,
  CreditCard,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/services/api';
import { readData } from '@/services/response';
import { cycleInfo } from '@/services/superAdmin';
import { PageHeader } from '@/components/shared/PageHeader';
import { ErrorState } from '@/components/shared/ErrorState';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cardClass, fieldClass, LoadingBlock, errorMessage, StatCard } from './shared';
import { cn } from '@/lib/utils';

// Super admin: every subscription payment (Razorpay and UPI), UPI approvals,
// and the platform's payment settings.

type PaymentStatus = 'created' | 'pending_verification' | 'paid' | 'failed' | 'rejected';
type PaymentMethod = 'razorpay' | 'upi';

interface Payment {
  id: string;
  organization_id: string;
  organization_name?: string;
  plan_name?: string;
  billing_cycle: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  status: PaymentStatus;
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  upi_reference?: string;
  payer_name?: string;
  payer_email?: string;
  payer_phone?: string;
  failure_reason?: string;
  created_at: string;
  submitted_at?: string;
  paid_at?: string;
  period_end?: string;
  invoice_id?: string;
}

interface PaymentsSummary {
  collected: number;
  paid_count: number;
  pending_verification: number;
  collected_this_month: number;
}

interface PaymentsData {
  payments: Payment[];
  total: number;
  page: number;
  limit: number;
  summary: PaymentsSummary;
}

interface PaymentSettings {
  razorpay_enabled: boolean;
  razorpay_key_id: string;
  upi_enabled: boolean;
  upi_id: string;
  upi_payee_name: string;
  has_razorpay_secret: boolean;
  has_razorpay_webhook_secret: boolean;
  webhook_url?: string;
}

const PAGE_SIZE = 25;
const REFRESH_MS = 20_000;

const STATUS_FILTERS: { id: '' | PaymentStatus; label: string }[] = [
  { id: '', label: 'All' },
  { id: 'pending_verification', label: 'Waiting for approval' },
  { id: 'paid', label: 'Paid' },
  { id: 'created', label: 'Not paid yet' },
  { id: 'failed', label: 'Failed' },
  { id: 'rejected', label: 'Rejected' },
];

const METHOD_FILTERS: { id: '' | PaymentMethod; label: string }[] = [
  { id: '', label: 'All methods' },
  { id: 'upi', label: 'UPI' },
  { id: 'razorpay', label: 'Razorpay' },
];

const statusInfo: Record<PaymentStatus, { label: string; cls: string }> = {
  created: { label: 'Not paid yet', cls: 'bg-gray-500/15 text-gray-300 light:bg-gray-100 light:text-gray-600' },
  pending_verification: { label: 'Waiting for approval', cls: 'bg-amber-500/15 text-amber-400 light:bg-amber-100 light:text-amber-700' },
  paid: { label: 'Paid', cls: 'bg-emerald-500/15 text-emerald-400 light:bg-emerald-100 light:text-emerald-700' },
  failed: { label: 'Failed', cls: 'bg-rose-500/15 text-rose-400 light:bg-rose-100 light:text-rose-700' },
  rejected: { label: 'Rejected', cls: 'bg-rose-500/15 text-rose-400 light:bg-rose-100 light:text-rose-700' },
};

const inr = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n || 0);

const fmtDate = (s?: string) => (s ? new Date(s).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const fmtDay = (s?: string) => (s ? new Date(s).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : '—');

/** The reference shown for a payment: the UTR for UPI, the Razorpay payment ID otherwise. */
const paymentRef = (p: Payment) => (p.method === 'upi' ? p.upi_reference : p.razorpay_payment_id) || '';

const canApprove = (p: Payment) => p.status === 'pending_verification' || p.status === 'created' || p.status === 'failed';

const muted = 'text-white/50 light:text-gray-500';

const StatusBadge: React.FC<{ status: PaymentStatus }> = ({ status }) => {
  const s = statusInfo[status] ?? statusInfo.created;
  return <Badge className={cn('border-0 text-[11px] shadow-none whitespace-nowrap', s.cls)}>{s.label}</Badge>;
};

const MethodBadge: React.FC<{ method: PaymentMethod }> = ({ method }) => (
  <Badge
    className={cn(
      'border-0 text-[11px] shadow-none',
      method === 'upi'
        ? 'bg-violet-500/15 text-violet-300 light:bg-violet-100 light:text-violet-700'
        : 'bg-blue-500/15 text-blue-300 light:bg-blue-100 light:text-blue-700'
    )}
  >
    {method === 'upi' ? 'UPI' : 'Razorpay'}
  </Badge>
);

const CopyButton: React.FC<{ value: string; label?: string; className?: string }> = ({ value, label = 'Copy', className }) => {
  const [copied, setCopied] = useState(false);
  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Copy failed; select the text and copy it');
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={label}
      title={label}
      className={cn('inline-flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-white/10 light:hover:bg-gray-100', muted, className)}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
};

const RefCell: React.FC<{ p: Payment }> = ({ p }) => {
  const ref = paymentRef(p);
  if (!ref) return <span className={muted}>—</span>;
  return (
    <span className="inline-flex max-w-full items-center gap-1">
      <span className="truncate font-mono text-xs">{ref}</span>
      <CopyButton value={ref} label={p.method === 'upi' ? 'Copy UTR' : 'Copy Razorpay payment ID'} />
    </span>
  );
};

const FilterChip: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode; badge?: number }> = ({
  active,
  onClick,
  children,
  badge,
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={cn(
      'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition-colors',
      active
        ? 'border-violet-500/60 bg-violet-500/15 text-violet-200 light:border-violet-300 light:bg-violet-50 light:text-violet-700'
        : 'border-white/[0.08] text-white/60 hover:bg-white/[0.04] light:border-gray-200 light:text-gray-600 light:hover:bg-gray-50'
    )}
  >
    {children}
    {!!badge && <span className="rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-black">{badge}</span>}
  </button>
);

// --- Payments list -----------------------------------------------------------

const PaymentsList: React.FC = () => {
  const [data, setData] = useState<PaymentsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'' | PaymentStatus>('');
  const [method, setMethod] = useState<'' | PaymentMethod>('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const [details, setDetails] = useState<Payment | null>(null);
  const [toApprove, setToApprove] = useState<Payment | null>(null);
  const [toReject, setToReject] = useState<Payment | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  // Debounce the search box.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const reqId = useRef(0);
  const load = useCallback(
    async (quiet = false) => {
      const id = ++reqId.current;
      if (!quiet) setLoading(true);
      try {
        const res = await api.get('/super-admin/payments', { params: { status, method, search, page, limit: PAGE_SIZE } });
        if (id !== reqId.current) return;
        setData(readData<PaymentsData>(res) ?? null);
        setError(null);
      } catch (err) {
        if (id !== reqId.current) return;
        if (!quiet) setError(errorMessage(err, 'Could not load payments'));
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    [status, method, search, page]
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Keep the list fresh while UPI payments are waiting for approval.
  const pendingCount = data?.summary?.pending_verification ?? 0;
  useEffect(() => {
    if (pendingCount <= 0) return;
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void load(true);
    }, REFRESH_MS);
    return () => clearInterval(t);
  }, [pendingCount, load]);

  const pickStatus = (s: '' | PaymentStatus) => {
    setStatus(s);
    setPage(1);
  };

  const replaceRow = (p: Payment) => {
    setData((d) => (d ? { ...d, payments: d.payments.map((x) => (x.id === p.id ? { ...x, ...p, organization_name: x.organization_name } : x)) } : d));
    setDetails((cur) => (cur && cur.id === p.id ? { ...cur, ...p, organization_name: cur.organization_name } : cur));
  };

  const approve = async () => {
    if (!toApprove) return;
    setBusy(true);
    try {
      const updated = readData<Payment>(await api.post(`/super-admin/payments/${toApprove.id}/approve`));
      if (updated?.id) replaceRow(updated);
      toast.success(`Approved — ${toApprove.organization_name || 'the client'}'s plan is active and a paid invoice was issued`);
      setToApprove(null);
      void load(true);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not approve the payment'));
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    if (!toReject) return;
    setBusy(true);
    try {
      const updated = readData<Payment>(
        await api.post(`/super-admin/payments/${toReject.id}/reject`, { reason: reason.trim() || 'Payment not received' })
      );
      if (updated?.id) replaceRow(updated);
      toast.success('Payment rejected. The client can submit a correct reference again.');
      setToReject(null);
      void load(true);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not reject the payment'));
    } finally {
      setBusy(false);
    }
  };

  const openReject = (p: Payment) => {
    setReason('');
    setToReject(p);
  };

  const summary = data?.summary;
  const payments = data?.payments ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const actions = (p: Payment, compact = false) =>
    p.method === 'upi' && p.status === 'pending_verification' ? (
      <div className={cn('flex gap-2', compact ? '' : 'justify-end')} onClick={(e) => e.stopPropagation()}>
        <Button size="sm" className="h-7 bg-emerald-600 px-2.5 text-xs text-white hover:bg-emerald-500" onClick={() => setToApprove(p)}>
          <Check className="mr-1 h-3.5 w-3.5" /> Approve
        </Button>
        <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={() => openReject(p)}>
          <X className="mr-1 h-3.5 w-3.5" /> Reject
        </Button>
      </div>
    ) : null;

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Collected (all time)" value={summary ? inr(summary.collected) : '—'} icon={IndianRupee} tone="emerald" />
        <StatCard label="Collected this month" value={summary ? inr(summary.collected_this_month) : '—'} icon={CalendarDays} tone="blue" />
        <StatCard label="Paid payments" value={summary ? summary.paid_count.toLocaleString('en-IN') : '—'} icon={CircleCheck} tone="violet" />
        <button
          type="button"
          onClick={() => pickStatus('pending_verification')}
          className={cn(
            'rounded-xl text-left transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400',
            pendingCount > 0 && 'ring-2 ring-amber-500/60 light:ring-amber-400'
          )}
          title="Show payments waiting for approval"
        >
          <StatCard
            label="Waiting for approval"
            value={summary ? pendingCount : '—'}
            hint={pendingCount > 0 ? 'Check your UPI account, then approve or reject' : 'Nothing to check'}
            icon={Hourglass}
            tone="amber"
          />
        </button>
      </div>

      <section className={cn('rounded-xl border', cardClass)}>
        {/* Filters */}
        <div className="space-y-3 border-b border-white/[0.06] p-4 light:border-gray-100">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {STATUS_FILTERS.map((f) => (
              <FilterChip
                key={f.id || 'all'}
                active={status === f.id}
                onClick={() => pickStatus(f.id)}
                badge={f.id === 'pending_verification' ? pendingCount : undefined}
              >
                {f.label}
              </FilterChip>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40 light:text-gray-400" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search client, email, UTR or Razorpay ID"
                className={cn('h-9 pl-8 text-xs', fieldClass)}
              />
            </div>
            <div className="flex items-center gap-2">
              <select
                value={method}
                onChange={(e) => {
                  setMethod(e.target.value as '' | PaymentMethod);
                  setPage(1);
                }}
                aria-label="Payment method"
                className={cn('h-9 flex-1 rounded-md border px-2 text-xs sm:flex-none', fieldClass)}
              >
                {METHOD_FILTERS.map((m) => (
                  <option key={m.id || 'all'} value={m.id} className="bg-[#141415] light:bg-white">
                    {m.label}
                  </option>
                ))}
              </select>
              <Button size="sm" variant="outline" className="h-9" onClick={() => void load()} disabled={loading} aria-label="Refresh">
                <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
              </Button>
            </div>
          </div>
        </div>

        {error ? (
          <div className="p-6">
            <ErrorState title="Couldn't load payments" description={error} onRetry={() => void load()} />
          </div>
        ) : !data ? (
          <LoadingBlock />
        ) : payments.length === 0 ? (
          <p className={cn('p-10 text-center text-sm', muted)}>
            {status || method || search ? 'No payments match these filters.' : 'No payments yet. They appear here when clients pay for a plan.'}
          </p>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto xl:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className={cn('border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wide light:border-gray-100', muted)}>
                    <th className="px-4 py-2.5 font-medium">Date</th>
                    <th className="px-4 py-2.5 font-medium">Client</th>
                    <th className="px-4 py-2.5 font-medium">Plan</th>
                    <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                    <th className="px-4 py-2.5 font-medium">Method</th>
                    <th className="px-4 py-2.5 font-medium">Reference</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05] light:divide-gray-100">
                  {payments.map((p) => (
                    <tr
                      key={p.id}
                      onClick={() => setDetails(p)}
                      className="cursor-pointer hover:bg-white/[0.03] light:hover:bg-gray-50"
                    >
                      <td className={cn('whitespace-nowrap px-4 py-3 text-xs', muted)}>{fmtDate(p.submitted_at || p.created_at)}</td>
                      <td className="max-w-[200px] px-4 py-3">
                        <p className="truncate font-medium">{p.organization_name || 'Unknown client'}</p>
                        {p.payer_email && <p className={cn('truncate text-xs', muted)}>{p.payer_email}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <p className="truncate">{p.plan_name || '—'}</p>
                        <p className={cn('text-xs', muted)}>{cycleInfo(p.billing_cycle).label}</p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums">{inr(p.amount)}</td>
                      <td className="px-4 py-3"><MethodBadge method={p.method} /></td>
                      <td className="max-w-[180px] px-4 py-3"><RefCell p={p} /></td>
                      <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                      <td className="px-4 py-3">{actions(p)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Phone cards */}
            <ul className="divide-y divide-white/[0.05] xl:hidden light:divide-gray-100">
              {payments.map((p) => (
                <li key={p.id} className="space-y-2 p-4" onClick={() => setDetails(p)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{p.organization_name || 'Unknown client'}</p>
                      <p className={cn('truncate text-xs', muted)}>
                        {p.plan_name || '—'} · {cycleInfo(p.billing_cycle).label}
                      </p>
                    </div>
                    <p className="shrink-0 font-semibold tabular-nums">{inr(p.amount)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <MethodBadge method={p.method} />
                    <StatusBadge status={p.status} />
                    <span className={cn('text-xs', muted)}>{fmtDate(p.submitted_at || p.created_at)}</span>
                  </div>
                  {paymentRef(p) && (
                    <div className="text-xs">
                      <span className={muted}>{p.method === 'upi' ? 'UTR ' : 'Payment ID '}</span>
                      <RefCell p={p} />
                    </div>
                  )}
                  {actions(p, true)}
                </li>
              ))}
            </ul>

            {/* Paging */}
            <div className={cn('flex items-center justify-between gap-3 border-t border-white/[0.06] px-4 py-3 text-xs light:border-gray-100', muted)}>
              <span>
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
              </span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="h-7 px-2" disabled={page <= 1} onClick={() => setPage((n) => n - 1)} aria-label="Previous page">
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <span>
                  Page {page} of {pages}
                </span>
                <Button size="sm" variant="outline" className="h-7 px-2" disabled={page >= pages} onClick={() => setPage((n) => n + 1)} aria-label="Next page">
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </>
        )}
      </section>

      {/* Details */}
      <Dialog open={!!details} onOpenChange={(o) => !o && setDetails(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          {details && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  {inr(details.amount)} <MethodBadge method={details.method} /> <StatusBadge status={details.status} />
                </DialogTitle>
                <DialogDescription>
                  {details.organization_name || 'Unknown client'} · {details.plan_name || '—'} ({cycleInfo(details.billing_cycle).label})
                </DialogDescription>
              </DialogHeader>
              <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-2 text-sm">
                {(
                  [
                    ['Client', details.organization_name || '—'],
                    ['Plan', details.plan_name || '—'],
                    ['Billing cycle', cycleInfo(details.billing_cycle).label],
                    ['Amount', `${inr(details.amount)} ${details.currency && details.currency !== 'INR' ? details.currency : ''}`],
                    ['Method', details.method === 'upi' ? 'UPI (direct transfer)' : 'Razorpay'],
                    ['Status', statusInfo[details.status]?.label ?? details.status],
                    ['UTR / UPI reference', details.upi_reference, true],
                    ['Razorpay order ID', details.razorpay_order_id, true],
                    ['Razorpay payment ID', details.razorpay_payment_id, true],
                    ['Payer name', details.payer_name],
                    ['Payer email', details.payer_email, true],
                    ['Payer phone', details.payer_phone, true],
                    ['Reason', details.failure_reason],
                    ['Started', fmtDate(details.created_at)],
                    ['Reference sent', details.submitted_at ? fmtDate(details.submitted_at) : ''],
                    ['Paid', details.paid_at ? fmtDate(details.paid_at) : ''],
                    ['Plan active until', details.period_end ? fmtDay(details.period_end) : ''],
                    ['Invoice', details.invoice_id, true],
                    ['Payment ID', details.id, true],
                  ] as [string, string | undefined, boolean?][]
                )
                  .filter(([, v]) => !!v)
                  .map(([k, v, copy]) => (
                    <React.Fragment key={k}>
                      <dt className={cn('text-xs leading-6', muted)}>{k}</dt>
                      <dd className="flex min-w-0 items-center gap-1 break-all">
                        <span className={cn('min-w-0', copy && 'font-mono text-xs')}>{v}</span>
                        {copy && v && <CopyButton value={v} label={`Copy ${k}`} />}
                      </dd>
                    </React.Fragment>
                  ))}
              </dl>
              <DialogFooter className="gap-2 sm:gap-2">
                {details.method === 'upi' && details.status === 'pending_verification' ? (
                  <>
                    <Button variant="outline" onClick={() => {
                        setDetails(null);
                        openReject(details);
                      }}>
                      <X className="mr-1.5 h-4 w-4" /> Reject
                    </Button>
                    <Button className="bg-emerald-600 text-white hover:bg-emerald-500" onClick={() => {
                        setDetails(null);
                        setToApprove(details);
                      }}>
                      <Check className="mr-1.5 h-4 w-4" /> Approve
                    </Button>
                  </>
                ) : canApprove(details) ? (
                  <Button variant="outline" onClick={() => {
                      setDetails(null);
                      setToApprove(details);
                    }} title="Use only if you confirmed the money arrived">
                    Mark as paid
                  </Button>
                ) : null}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Approve */}
      <Dialog open={!!toApprove} onOpenChange={(o) => !o && !busy && setToApprove(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          {toApprove && (
            <>
              <DialogHeader>
                <DialogTitle>{toApprove.status === 'pending_verification' ? 'Approve this payment?' : 'Mark this payment as paid?'}</DialogTitle>
                <DialogDescription asChild>
                  <div className="space-y-2 text-sm">
                    <p>
                      Check that <b>{inr(toApprove.amount)}</b> arrived in your{' '}
                      {toApprove.method === 'upi' ? 'UPI account' : 'Razorpay account'}
                      {paymentRef(toApprove) ? (
                        <>
                          {' '}with reference <b className="font-mono">{paymentRef(toApprove)}</b>
                        </>
                      ) : null}{' '}
                      before approving — this activates <b>{toApprove.organization_name || 'the client'}</b>’s{' '}
                      <b>{toApprove.plan_name || ''}</b> plan ({cycleInfo(toApprove.billing_cycle).label.toLowerCase()}) and issues a paid invoice.
                    </p>
                    {toApprove.status !== 'pending_verification' && (
                      <p className="text-amber-400 light:text-amber-700">
                        The client hasn’t sent a confirmed payment for this. Only continue if you received the money another way.
                      </p>
                    )}
                  </div>
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2 sm:gap-2">
                <Button variant="outline" onClick={() => setToApprove(null)} disabled={busy}>
                  Cancel
                </Button>
                <Button className="bg-emerald-600 text-white hover:bg-emerald-500" onClick={approve} disabled={busy}>
                  {busy ? 'Approving…' : 'Yes, money received — approve'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject */}
      <Dialog open={!!toReject} onOpenChange={(o) => !o && !busy && setToReject(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          {toReject && (
            <>
              <DialogHeader>
                <DialogTitle>Reject this payment?</DialogTitle>
                <DialogDescription>
                  {inr(toReject.amount)} from {toReject.organization_name || 'the client'}
                  {paymentRef(toReject) ? ` · reference ${paymentRef(toReject)}` : ''}. The client sees your reason and can send the correct
                  reference again.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-1.5">
                <Label htmlFor="reject-reason" className="text-xs">
                  Reason
                </Label>
                <Textarea
                  id="reject-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Payment not received"
                  rows={3}
                  className={fieldClass}
                />
                <div className="flex flex-wrap gap-1.5">
                  {['Payment not received', 'Amount does not match', 'Wrong UTR / reference'].map((r) => (
                    <FilterChip key={r} active={reason === r} onClick={() => setReason(r)}>
                      {r}
                    </FilterChip>
                  ))}
                </div>
              </div>
              <DialogFooter className="gap-2 sm:gap-2">
                <Button variant="outline" onClick={() => setToReject(null)} disabled={busy}>
                  Cancel
                </Button>
                <Button className="bg-rose-600 text-white hover:bg-rose-500" onClick={reject} disabled={busy}>
                  {busy ? 'Rejecting…' : 'Reject payment'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

// --- Payment settings --------------------------------------------------------

type SecretMode = 'keep' | 'replace' | 'clear';

const SecretField: React.FC<{
  id: string;
  label: string;
  saved: boolean;
  mode: SecretMode;
  value: string;
  onMode: (m: SecretMode) => void;
  onValue: (v: string) => void;
  placeholder?: string;
}> = ({ id, label, saved, mode, value, onMode, onValue, placeholder }) => (
  <div className="grid gap-1.5">
    <div className="flex items-center justify-between gap-2">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      {mode === 'clear' ? (
        <span className="text-[11px] font-medium text-rose-400 light:text-rose-600">Will be cleared</span>
      ) : saved ? (
        <span className="text-[11px] font-medium text-emerald-400 light:text-emerald-600">Saved ✓</span>
      ) : (
        <span className="text-[11px] font-medium text-amber-400 light:text-amber-600">Not set</span>
      )}
    </div>
    {saved && mode !== 'replace' ? (
      <div className="flex gap-2">
        <Input readOnly value={mode === 'clear' ? '' : '••••••••••••'} placeholder="(empty)" className={cn('font-mono text-xs', fieldClass)} />
        {mode === 'clear' ? (
          <Button type="button" size="sm" variant="outline" className="h-9" onClick={() => onMode('keep')}>
            Undo
          </Button>
        ) : (
          <>
            <Button type="button" size="sm" variant="outline" className="h-9" onClick={() => onMode('replace')}>
              Replace
            </Button>
            <Button type="button" size="sm" variant="outline" className="h-9" onClick={() => onMode('clear')}>
              Clear
            </Button>
          </>
        )}
      </div>
    ) : (
      <div className="flex gap-2">
        <Input
          id={id}
          type="password"
          autoComplete="new-password"
          value={value}
          onChange={(e) => {
            onValue(e.target.value);
            if (mode !== 'replace') onMode('replace');
          }}
          placeholder={placeholder}
          className={cn('font-mono text-xs', fieldClass)}
        />
        {saved && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9"
            onClick={() => {
              onValue('');
              onMode('keep');
            }}
          >
            Cancel
          </Button>
        )}
      </div>
    )}
  </div>
);

const PaymentSettingsPanel: React.FC = () => {
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [rzpEnabled, setRzpEnabled] = useState(false);
  const [keyId, setKeyId] = useState('');
  const [secret, setSecret] = useState('');
  const [secretMode, setSecretMode] = useState<SecretMode>('keep');
  const [whSecret, setWhSecret] = useState('');
  const [whMode, setWhMode] = useState<SecretMode>('keep');
  const [upiEnabled, setUpiEnabled] = useState(false);
  const [upiId, setUpiId] = useState('');
  const [payee, setPayee] = useState('');

  const apply = (s: PaymentSettings) => {
    setSettings(s);
    setRzpEnabled(!!s.razorpay_enabled);
    setKeyId(s.razorpay_key_id || '');
    setSecret('');
    setSecretMode('keep');
    setWhSecret('');
    setWhMode('keep');
    setUpiEnabled(!!s.upi_enabled);
    setUpiId(s.upi_id || '');
    setPayee(s.upi_payee_name || '');
  };

  const load = useCallback(async () => {
    setError(null);
    try {
      apply(readData<PaymentSettings>(await api.get('/super-admin/payment-settings')));
    } catch (err) {
      setError(errorMessage(err, 'Could not load payment settings'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <ErrorState title="Couldn't load payment settings" description={error} onRetry={load} />;
  if (!settings) return <LoadingBlock />;

  const secretWillExist = secretMode === 'replace' ? !!secret.trim() : secretMode === 'clear' ? false : settings.has_razorpay_secret;
  const whWillExist = whMode === 'replace' ? !!whSecret.trim() : whMode === 'clear' ? false : settings.has_razorpay_webhook_secret;
  const rzpMissing = rzpEnabled && (!keyId.trim() || !secretWillExist);
  const upiMissing = upiEnabled && !upiId.trim();
  const keyIdBad = !!keyId.trim() && !keyId.trim().startsWith('rzp_');
  const upiBad = !!upiId.trim() && (!upiId.includes('@') || /[\s&?=]/.test(upiId.trim()));

  const dirty =
    rzpEnabled !== settings.razorpay_enabled ||
    keyId.trim() !== (settings.razorpay_key_id || '') ||
    (secretMode === 'replace' && !!secret.trim()) ||
    (secretMode === 'clear' && settings.has_razorpay_secret) ||
    (whMode === 'replace' && !!whSecret.trim()) ||
    (whMode === 'clear' && settings.has_razorpay_webhook_secret) ||
    upiEnabled !== settings.upi_enabled ||
    upiId.trim() !== (settings.upi_id || '') ||
    payee.trim() !== (settings.upi_payee_name || '');

  const save = async () => {
    const body: Record<string, unknown> = {
      razorpay_enabled: rzpEnabled,
      razorpay_key_id: keyId.trim(),
      upi_enabled: upiEnabled,
      upi_id: upiId.trim(),
      upi_payee_name: payee.trim(),
    };
    if (secretMode === 'replace' && secret.trim()) body.razorpay_key_secret = secret.trim();
    if (secretMode === 'clear') body.razorpay_key_secret = '';
    if (whMode === 'replace' && whSecret.trim()) body.razorpay_webhook_secret = whSecret.trim();
    if (whMode === 'clear') body.razorpay_webhook_secret = '';
    setSaving(true);
    try {
      apply(readData<PaymentSettings>(await api.put('/super-admin/payment-settings', body)));
      toast.success('Payment settings saved');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save payment settings'));
    } finally {
      setSaving(false);
    }
  };

  const webhookUrl = settings.webhook_url || `${window.location.origin}/razorpay/order-payment-razorpay-webhook`;
  const previewName = payee.trim() || 'OneSuit';

  return (
    <div className="space-y-5">
      {/* Razorpay */}
      <section className={cn('space-y-4 rounded-xl border p-5', cardClass)}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-blue-400">
              <CreditCard className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Razorpay</h3>
              <p className={cn('text-xs', muted)}>Cards, netbanking, wallets and UPI through Razorpay. Plans activate automatically.</p>
            </div>
          </div>
          <Switch checked={rzpEnabled} onCheckedChange={setRzpEnabled} aria-label="Enable Razorpay" />
        </div>

        {rzpMissing && (
          <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300 light:border-amber-200 light:bg-amber-50 light:text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Razorpay is on but {!keyId.trim() && !secretWillExist ? 'the Key ID and Key Secret are' : !keyId.trim() ? 'the Key ID is' : 'the Key Secret is'}{' '}
              missing. Clients won’t see Razorpay at checkout until both are saved.
            </span>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="rzp-key-id" className="text-xs">
              Key ID
            </Label>
            <Input
              id="rzp-key-id"
              value={keyId}
              onChange={(e) => setKeyId(e.target.value)}
              placeholder="rzp_live_… or rzp_test_…"
              autoComplete="off"
              className={cn('font-mono text-xs', fieldClass)}
            />
            {keyIdBad && <p className="text-[11px] text-rose-400 light:text-rose-600">The Key ID starts with rzp_live_ or rzp_test_</p>}
          </div>
          <SecretField
            id="rzp-secret"
            label="Key Secret"
            saved={settings.has_razorpay_secret}
            mode={secretMode}
            value={secret}
            onMode={setSecretMode}
            onValue={setSecret}
            placeholder="Paste the Key Secret"
          />
        </div>
        <p className={cn('text-[11px]', muted)}>Razorpay Dashboard → Account &amp; Settings → API Keys. Secrets are stored encrypted and never shown again.</p>

        <div className="space-y-3 rounded-lg border border-white/[0.08] bg-white/[0.02] p-4 light:border-gray-200 light:bg-gray-50">
          <h4 className="text-xs font-semibold">Webhook (confirms payments even if the client closes the page)</h4>
          <div className="grid gap-1">
            <Label className="text-xs">Webhook URL</Label>
            <div className="flex gap-2">
              <Input readOnly value={webhookUrl} className={cn('font-mono text-xs', fieldClass)} onFocus={(e) => e.currentTarget.select()} />
              <CopyButton value={webhookUrl} label="Copy webhook URL" className="h-9 w-9 border border-white/[0.08] light:border-gray-200" />
            </div>
          </div>
          <ol className={cn('list-decimal space-y-1 pl-4 text-xs', muted)}>
            <li>
              In <b>Razorpay Dashboard → Settings → Webhooks → Add webhook</b>, paste this URL.
            </li>
            <li>Set a secret there and enter the same secret as <b>Webhook Secret</b> below.</li>
            <li>
              Tick <b>payment.captured</b>, <b>payment.failed</b> and <b>order.paid</b>, then save.
            </li>
          </ol>
          <div className="flex gap-2 rounded-md border border-blue-500/30 bg-blue-500/10 p-2.5 text-xs text-blue-200 light:border-blue-200 light:bg-blue-50 light:text-blue-800">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              This URL must reach <b>this OneSuit server</b> — it’s built from the address you’re using now. If you use a custom domain (for
              example wa.onesuit.in), that domain must point to this server, otherwise Razorpay can’t confirm payments.
            </span>
          </div>
          <SecretField
            id="rzp-webhook-secret"
            label="Webhook Secret"
            saved={settings.has_razorpay_webhook_secret}
            mode={whMode}
            value={whSecret}
            onMode={setWhMode}
            onValue={setWhSecret}
            placeholder="Same secret as in Razorpay"
          />
          {rzpEnabled && !whWillExist && (
            <p className="text-[11px] text-amber-400 light:text-amber-600">
              Without a webhook secret, payments are confirmed only when the client returns to the page after paying.
            </p>
          )}
        </div>
      </section>

      {/* UPI */}
      <section className={cn('space-y-4 rounded-xl border p-5', cardClass)}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-400">
              <QrCode className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Direct UPI</h3>
              <p className={cn('text-xs', muted)}>
                Clients pay your UPI ID and send the transaction ID (UTR). You approve each payment here after checking your account.
              </p>
            </div>
          </div>
          <Switch checked={upiEnabled} onCheckedChange={setUpiEnabled} aria-label="Enable UPI" />
        </div>

        {upiMissing && (
          <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300 light:border-amber-200 light:bg-amber-50 light:text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>UPI is on but there’s no UPI ID. Clients won’t see UPI at checkout until you add one.</span>
          </div>
        )}

        <div className="grid gap-5 md:grid-cols-[1fr,260px]">
          <div className="grid content-start gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="upi-id" className="text-xs">
                UPI ID
              </Label>
              <Input
                id="upi-id"
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                placeholder="name@bank"
                autoComplete="off"
                className={cn('font-mono text-xs', fieldClass)}
              />
              {upiBad && <p className="text-[11px] text-rose-400 light:text-rose-600">Enter a UPI ID like name@bank</p>}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="upi-payee" className="text-xs">
                Payee name
              </Label>
              <Input id="upi-payee" value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="OneSuit" className={cn('text-xs', fieldClass)} />
              <p className={cn('text-[11px]', muted)}>Shown in the client’s UPI app. Use the name on the bank account.</p>
            </div>
          </div>

          {/* Preview */}
          <div>
            <p className={cn('mb-1.5 text-[11px] uppercase tracking-wide', muted)}>What clients see</p>
            <div className={cn('rounded-xl border p-4 text-center', upiEnabled ? '' : 'opacity-50', 'border-white/[0.08] bg-white/[0.03] light:border-gray-200 light:bg-gray-50')}>
              <div className="mx-auto mb-3 flex h-24 w-24 items-center justify-center rounded-lg bg-white text-gray-800">
                <QrCode className="h-16 w-16" />
              </div>
              <p className="text-sm font-semibold">Pay ₹1,499 to {previewName}</p>
              <p className="mt-0.5 font-mono text-xs text-violet-300 light:text-violet-700">{upiId.trim() || 'name@bank'}</p>
              <p className={cn('mt-2 text-[11px]', muted)}>
                Scan with any UPI app or tap “Pay with UPI app”, then enter the 12-digit transaction ID (UTR) to finish.
              </p>
              {!upiEnabled && <p className="mt-2 text-[11px] text-amber-400 light:text-amber-600">UPI is off — clients won’t see this.</p>}
            </div>
          </div>
        </div>
      </section>

      {!rzpEnabled && !upiEnabled && (
        <div className="flex gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300 light:border-rose-200 light:bg-rose-50 light:text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Both payment methods are off, so clients can’t pay for a plan.</span>
        </div>
      )}

      <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t border-white/[0.06] bg-[#0a0a0b]/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 light:border-gray-200 light:bg-gray-50/90">
        <Button variant="outline" onClick={() => apply(settings)} disabled={!dirty || saving}>
          Discard
        </Button>
        <Button className="bg-violet-600 text-white hover:bg-violet-500" onClick={save} disabled={!dirty || saving || keyIdBad || upiBad}>
          {saving ? 'Saving…' : 'Save settings'}
        </Button>
      </div>
    </div>
  );
};

// --- Page ----------------------------------------------------------------------

export const PaymentsView: React.FC = () => {
  const [tab, setTab] = useState('payments');
  return (
    <div className="flex min-h-full flex-col bg-[#0a0a0b] light:bg-gray-50">
      <PageHeader
        title="Payments"
        subtitle="Every plan payment from clients, UPI approvals, and Razorpay / UPI settings"
        icon={IndianRupee}
        iconGradient="bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-500/20"
      />
      <div className="space-y-5 p-4 sm:p-6">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="settings">Payment settings</TabsTrigger>
          </TabsList>
          <TabsContent value="payments" className="mt-5">
            <PaymentsList />
          </TabsContent>
          <TabsContent value="settings" className="mt-5">
            <PaymentSettingsPanel />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default PaymentsView;
