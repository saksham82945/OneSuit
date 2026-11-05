import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  CreditCard,
  Gift,
  LifeBuoy,
  Loader2,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { refreshPlanModules } from '@/lib/planModules';
import { api, billingService, type BillingInfo } from '@/services/api';
import { readData } from '@/services/response';
import { BILLING_CYCLES, cyclePrice, formatLimit, formatPrice, type BillingInterval } from '@/services/superAdmin';
import {
  isBillingCycle,
  loadRazorpay,
  paymentsService,
  type CheckoutResponse,
  type Payment,
  type PaymentMethod,
  type PaymentOptions,
} from '@/services/payments';
import { apiErrorMessage, type PublicPlan } from '@/views/public/publicApi';
import { UPIPayPanel } from './UPIPayPanel';

// Checkout: pay for a plan by Razorpay (card / UPI / net banking) or straight to the platform's UPI ID.
// /billing/checkout?plan=<id>&cycle=<monthly|quarterly|half_yearly|yearly>

type Phase =
  | { kind: 'choose' }
  | { kind: 'upi'; checkout: CheckoutResponse }
  | { kind: 'confirming'; paymentId: string; method: PaymentMethod }
  | { kind: 'paid' };

const card = 'rounded-2xl border border-gray-200/90 bg-white p-5 shadow-sm sm:p-6 dark:border-white/10 dark:bg-[#141b1a]';

/** After a plan is activated, reload so the plan, its modules and banners update everywhere. */
const openDashboard = () => window.location.assign('/');

export const CheckoutView: React.FC = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [plans, setPlans] = useState<PublicPlan[] | null>(null);
  const [options, setOptions] = useState<PaymentOptions | null>(null);
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [openPayments, setOpenPayments] = useState<Payment[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'choose' });
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    document.title = 'Checkout · OneSuit';
    let cancelled = false;
    (async () => {
      try {
        const [plansRes, opts] = await Promise.all([api.get('/public/plans'), paymentsService.options()]);
        if (cancelled) return;
        const list = readData<{ plans: PublicPlan[] }>(plansRes)?.plans ?? [];
        setPlans(list.map((p) => ({ ...p, features: Array.isArray(p.features) ? p.features : [] })));
        setOptions(opts);
        setMethod(opts?.razorpay_enabled ? 'razorpay' : opts?.upi_enabled ? 'upi' : null);
      } catch (err) {
        if (!cancelled) setLoadError(apiErrorMessage(err, "We couldn't load the checkout. Please try again."));
      }
      // Optional extras: the current plan (default choice) and payments already waiting for review.
      billingService
        .get()
        .then((r) => !cancelled && setBilling(readData<BillingInfo>(r) ?? null))
        .catch(() => undefined);
      paymentsService
        .list()
        .then((list) => !cancelled && setOpenPayments(list.filter((p) => p.status === 'pending_verification')))
        .catch(() => undefined);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Paid: the "complete your payment" gate and plan switches update straight away.
  useEffect(() => {
    if (phase.kind === 'paid') refreshPlanModules();
  }, [phase.kind]);

  const paidPlans = useMemo(() => (plans ?? []).filter((p) => p.price > 0), [plans]);
  const queryPlan = params.get('plan');
  const plan = useMemo(() => {
    if (!plans) return null;
    return (
      plans.find((p) => p.id === queryPlan) ??
      (billing?.plan?.name ? plans.find((p) => p.name === billing.plan!.name && p.price > 0) : undefined) ??
      paidPlans[0] ??
      null
    );
  }, [plans, queryPlan, billing, paidPlans]);
  const queryCycle = params.get('cycle');
  const cycle: BillingInterval = isBillingCycle(queryCycle) ? queryCycle : isBillingCycle(billing?.billing_cycle) ? billing!.billing_cycle as BillingInterval : 'monthly';
  const price = plan ? cyclePrice(plan, cycle) : null;

  const update = (next: { plan?: string; cycle?: BillingInterval }) => {
    const q = new URLSearchParams(params);
    if (next.plan) q.set('plan', next.plan);
    if (next.cycle) q.set('cycle', next.cycle);
    setParams(q, { replace: true });
  };

  const startPayment = async () => {
    if (!plan || !method || starting) return;
    setStarting(true);
    try {
      const checkout = await paymentsService.checkout({ plan_id: plan.id, billing_cycle: cycle, method });
      if (method === 'upi' && checkout.upi) {
        setPhase({ kind: 'upi', checkout });
        setStarting(false);
        return;
      }
      if (method === 'razorpay' && checkout.razorpay) {
        await openRazorpay(checkout);
        return;
      }
      toast.error('Payment could not be started. Please try again.');
      setStarting(false);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Payment could not be started. Please try again.'));
      setStarting(false);
    }
  };

  const openRazorpay = async (checkout: CheckoutResponse) => {
    const order = checkout.razorpay!;
    let Razorpay;
    try {
      Razorpay = await loadRazorpay();
    } catch {
      toast.error("Razorpay couldn't load. Check your connection, or pay by UPI.");
      setStarting(false);
      return;
    }
    const rzp = new Razorpay({
      key: order.key_id,
      order_id: order.order_id,
      amount: order.amount,
      currency: order.currency,
      name: order.name,
      description: order.description,
      prefill: order.prefill,
      theme: { color: '#059669' },
      handler: async (resp: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
        try {
          await paymentsService.verifyRazorpay(checkout.payment_id, {
            razorpay_order_id: resp.razorpay_order_id,
            razorpay_payment_id: resp.razorpay_payment_id,
            razorpay_signature: resp.razorpay_signature,
          });
          setPhase({ kind: 'paid' });
        } catch {
          // Razorpay's webhook activates the plan too; wait for it.
          setPhase({ kind: 'confirming', paymentId: checkout.payment_id, method: 'razorpay' });
        } finally {
          setStarting(false);
        }
      },
      modal: { ondismiss: () => setStarting(false) },
    });
    rzp.on('payment.failed', (resp) => {
      toast.error(resp?.error?.description || 'The payment failed. No money was taken — please try again.');
    });
    rzp.open();
  };

  const back = (
    <Button variant="ghost" size="sm" onClick={() => navigate('/settings/billing')} className="h-9 text-xs">
      <ArrowLeft className="mr-1 h-4 w-4" /> Billing
    </Button>
  );

  const shell = (body: React.ReactNode) => (
    <div className="flex h-full flex-col overflow-y-auto bg-[#f8faf9] text-gray-900 dark:bg-[#0a0f0e] dark:text-gray-100">
      <PageHeader
        title="Checkout"
        subtitle="Pay for your OneSuit plan"
        icon={CreditCard}
        iconGradient="bg-gradient-to-br from-teal-500 to-emerald-600 shadow-teal-500/20"
        actions={back}
      />
      <div className="mx-auto w-full max-w-5xl p-4 sm:p-6">{body}</div>
    </div>
  );

  if (loadError) {
    return shell(
      <div className={cn(card, 'text-center')}>
        <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
        <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">{loadError}</p>
        <Button className="mt-4" variant="outline" onClick={() => window.location.reload()}>
          Try again
        </Button>
      </div>
    );
  }
  if (!plans || !options) {
    return shell(
      <div className="flex justify-center p-16">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" aria-label="Loading" />
      </div>
    );
  }

  if (phase.kind === 'paid') {
    return shell(
      <ResultCard
        icon={<CheckCircle2 className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />}
        title="Payment received — your plan is active"
        text={`${plan?.name ?? 'Your'} plan is now active. Thank you!`}
        action={<Button onClick={openDashboard} className="bg-emerald-600 text-white hover:bg-emerald-500">Go to dashboard</Button>}
      />
    );
  }
  if (phase.kind === 'confirming') {
    return shell(
      <ConfirmingCard paymentId={phase.paymentId} method={phase.method} onPaid={() => setPhase({ kind: 'paid' })} />
    );
  }

  const noMethods = !options.razorpay_enabled && !options.upi_enabled;

  return shell(
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      {/* Plan summary */}
      <section className={card} aria-label="Plan">
        {!plan ? (
          <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">No paid plans are available right now.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Plan</p>
                <h2 className="mt-1 text-2xl font-black text-gray-900 dark:text-white">{plan.name}</h2>
                {plan.description && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{plan.description}</p>}
              </div>
              {paidPlans.length > 1 && phase.kind === 'choose' && (
                <Select value={plan.id} onValueChange={(v) => update({ plan: v })}>
                  <SelectTrigger className="h-9 w-44 text-xs" aria-label="Change plan">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {paidPlans.map((p) => (
                      <SelectItem key={p.id} value={p.id} className="text-xs">
                        {p.name} · {formatPrice(cyclePrice(p, 'monthly').perMonth)}/mo
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {plan.price > 0 && (
              <div className="mt-5">
                <p className="mb-2 text-xs font-semibold text-gray-600 dark:text-gray-300">Billing cycle</p>
                <div className="grid grid-cols-2 gap-2 xl:grid-cols-4" role="radiogroup" aria-label="Billing cycle">
                  {BILLING_CYCLES.map((c) => {
                    const cp = cyclePrice(plan, c.id);
                    const active = c.id === cycle;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        disabled={phase.kind !== 'choose'}
                        onClick={() => update({ cycle: c.id })}
                        className={cn(
                          'relative rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                          active
                            ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500 dark:bg-emerald-500/10'
                            : 'border-gray-200 hover:border-emerald-300 dark:border-white/10 dark:hover:border-emerald-500/40'
                        )}
                      >
                        {cp.discount > 0 && (
                          <span className="absolute -top-2 right-2 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[9px] font-bold text-white">
                            {cp.discount}% OFF
                          </span>
                        )}
                        <span className="block text-xs font-semibold text-gray-700 dark:text-gray-200">{c.label}</span>
                        <span className="mt-0.5 block text-sm font-bold tabular-nums text-gray-900 dark:text-white">{formatPrice(cp.total)}</span>
                        <span className="block text-[10px] text-gray-500 dark:text-gray-400">{formatPrice(cp.perMonth)}/mo</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
              {[
                ['Users', plan.max_users],
                ['Contacts', plan.max_contacts],
                ['WhatsApp numbers', plan.max_accounts],
              ].map(([label, n]) => (
                <div key={label} className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-2.5 dark:border-white/10 dark:bg-white/[0.03]">
                  <dd className="text-sm font-semibold tabular-nums text-gray-900 dark:text-white">{formatLimit(n as number)}</dd>
                  <dt className="mt-0.5 text-[11px] leading-tight text-gray-500 dark:text-gray-400">{label}</dt>
                </div>
              ))}
            </dl>
            {plan.features.length > 0 && (
              <ul className="mt-5 grid gap-1.5 sm:grid-cols-2">
                {plan.features.map((f, i) => (
                  <li key={`${f}-${i}`} className="flex gap-1.5 text-xs text-gray-600 dark:text-gray-300">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" /> {f}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      {/* Payment */}
      <section className={cn(card, 'lg:sticky lg:top-4')} aria-label="Payment">
        {!plan ? null : plan.price <= 0 || !price || price.total <= 0 ? (
          <div className="text-center">
            <Gift className="mx-auto h-8 w-8 text-emerald-500" />
            <h3 className="mt-3 text-base font-bold">Nothing to pay</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{plan.name} is free.</p>
            <Button asChild variant="outline" className="mt-4">
              <Link to="/">Go to dashboard</Link>
            </Button>
          </div>
        ) : phase.kind === 'upi' ? (
          <UPIPayPanel
            checkout={phase.checkout}
            onSubmitted={() => setPhase({ kind: 'confirming', paymentId: phase.checkout.payment_id, method: 'upi' })}
            onCancel={() => setPhase({ kind: 'choose' })}
          />
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-3 border-b border-gray-100 pb-4 dark:border-white/5">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Total</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  {plan.name} · {BILLING_CYCLES.find((c) => c.id === cycle)?.label}
                </p>
              </div>
              <div className="text-right">
                {price.saving > 0 && <p className="text-xs text-gray-400 line-through tabular-nums">{formatPrice(price.full)}</p>}
                <p className="text-2xl font-black tabular-nums text-gray-900 dark:text-white">{formatPrice(price.total)}</p>
                {price.saving > 0 && (
                  <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">You save {formatPrice(price.saving)}</p>
                )}
              </div>
            </div>

            {openPayments.length > 0 && (
              <div className="mt-4 flex gap-2 rounded-xl border border-amber-300/60 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                <Clock className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  You already have a payment of {formatPrice(openPayments[0].amount)} awaiting verification. No need to pay again —{' '}
                  <Link to="/settings/billing" className="font-semibold underline underline-offset-2">see its status</Link>.
                </p>
              </div>
            )}

            {noMethods ? (
              <div className="mt-4 rounded-xl border border-gray-200 p-4 text-center text-sm dark:border-white/10">
                <p className="font-semibold text-gray-800 dark:text-gray-100">Online payment isn't set up yet</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Contact support and we'll activate your plan for you.</p>
                <Button asChild size="sm" className="mt-3 bg-emerald-600 text-white hover:bg-emerald-500">
                  <Link to="/support">
                    <LifeBuoy className="mr-1.5 h-4 w-4" /> Contact support
                  </Link>
                </Button>
              </div>
            ) : (
              <>
                <p className="mb-2 mt-4 text-xs font-semibold text-gray-600 dark:text-gray-300">Pay with</p>
                <div className="space-y-2" role="radiogroup" aria-label="Payment method">
                  {options.razorpay_enabled && (
                    <MethodOption
                      active={method === 'razorpay'}
                      onSelect={() => setMethod('razorpay')}
                      icon={<CreditCard className="h-4 w-4" />}
                      title="Card / UPI / Net banking"
                      text="Secure checkout by Razorpay. Your plan activates instantly."
                    />
                  )}
                  {options.upi_enabled && (
                    <MethodOption
                      active={method === 'upi'}
                      onSelect={() => setMethod('upi')}
                      icon={<Smartphone className="h-4 w-4" />}
                      title="Pay to UPI ID directly"
                      text={`Scan a QR or pay ${options.upi_id} from any UPI app. Activates once we verify it.`}
                    />
                  )}
                </div>
                <Button
                  onClick={startPayment}
                  disabled={!method || starting}
                  className="mt-5 h-11 w-full bg-gradient-to-r from-teal-600 to-emerald-600 text-sm font-semibold text-white shadow-md shadow-emerald-600/20 hover:from-teal-700 hover:to-emerald-700"
                >
                  {starting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {method === 'upi' ? 'Continue to UPI' : `Pay ${formatPrice(price.total)}`}
                </Button>
                <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                  <ShieldCheck className="h-3.5 w-3.5" /> Prices in INR, including applicable taxes
                </p>
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
};

const MethodOption: React.FC<{ active: boolean; onSelect: () => void; icon: React.ReactNode; title: string; text: string }> = ({
  active,
  onSelect,
  icon,
  title,
  text,
}) => (
  <button
    type="button"
    role="radio"
    aria-checked={active}
    onClick={onSelect}
    className={cn(
      'flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors',
      active
        ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500 dark:bg-emerald-500/10'
        : 'border-gray-200 hover:border-emerald-300 dark:border-white/10 dark:hover:border-emerald-500/40'
    )}
  >
    <span
      className={cn(
        'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
        active ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300'
      )}
    >
      {icon}
    </span>
    <span className="min-w-0">
      <span className="block text-sm font-semibold text-gray-900 dark:text-white">{title}</span>
      <span className="block break-words text-[11px] text-gray-500 dark:text-gray-400">{text}</span>
    </span>
  </button>
);

const ResultCard: React.FC<{ icon: React.ReactNode; title: string; text: React.ReactNode; action?: React.ReactNode }> = ({
  icon,
  title,
  text,
  action,
}) => (
  <div className={cn(card, 'mx-auto max-w-lg text-center')}>
    <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-500/10">{icon}</span>
    <h2 className="mt-4 text-lg font-bold text-gray-900 dark:text-white">{title}</h2>
    <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">{text}</div>
    {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
  </div>
);

/** Waits for a payment to be confirmed: Razorpay's webhook (a minute) or the team's UPI review (polled while open). */
const ConfirmingCard: React.FC<{ paymentId: string; method: PaymentMethod; onPaid: () => void }> = ({ paymentId, method, onPaid }) => {
  const [payment, setPayment] = useState<Payment | null>(null);
  const [gaveUp, setGaveUp] = useState(false);
  const started = useRef(Date.now());
  const onPaidRef = useRef(onPaid);
  onPaidRef.current = onPaid;

  const check = useCallback(async () => {
    try {
      const p = await paymentsService.get(paymentId);
      setPayment(p);
      if (p?.status === 'paid') onPaidRef.current();
      return p?.status;
    } catch {
      return undefined;
    }
  }, [paymentId]);

  useEffect(() => {
    void check();
    const every = method === 'razorpay' ? 5000 : 15000;
    const timer = window.setInterval(async () => {
      const status = await check();
      const done = status === 'paid' || status === 'rejected' || status === 'failed';
      if (done || (method === 'razorpay' && Date.now() - started.current > 60000)) {
        window.clearInterval(timer);
        if (!done) setGaveUp(true);
      }
    }, every);
    return () => window.clearInterval(timer);
  }, [check, method]);

  if (payment?.status === 'rejected' || payment?.status === 'failed') {
    return (
      <ResultCard
        icon={<AlertTriangle className="h-7 w-7 text-red-500" />}
        title={payment.status === 'rejected' ? "We couldn't verify this payment" : 'The payment failed'}
        text={payment.failure_reason || 'Please check the details and try again, or contact support.'}
        action={
          <>
            <Button onClick={() => window.location.reload()} className="bg-emerald-600 text-white hover:bg-emerald-500">Pay again</Button>
            <Button asChild variant="outline"><Link to="/support">Contact support</Link></Button>
          </>
        }
      />
    );
  }

  return (
    <ResultCard
      icon={<Clock className="h-7 w-7 text-amber-500" />}
      title={method === 'upi' ? "We're confirming your payment" : 'Confirming your payment…'}
      text={
        <>
          {method === 'upi' ? (
            <p>Your plan activates once the OneSuit team verifies it (usually within a few hours). You can close this page — we'll update your billing page.</p>
          ) : gaveUp ? (
            <p>It's taking longer than usual. If money was taken, your plan will be activated automatically shortly — check your billing page in a few minutes.</p>
          ) : (
            <p>If money was taken, it will be confirmed automatically shortly. Please keep this page open.</p>
          )}
          {payment && (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-amber-300/60 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              {(!gaveUp || method === 'upi') && <Loader2 className="h-3 w-3 animate-spin" />}
              {payment.status === 'pending_verification' ? 'Awaiting verification' : 'Waiting for confirmation'} · {formatPrice(payment.amount)}
              {payment.upi_reference ? ` · UTR ${payment.upi_reference}` : ''}
            </p>
          )}
        </>
      }
      action={
        <>
          <Button asChild variant="outline"><Link to="/settings/billing">Billing &amp; payments</Link></Button>
          <Button asChild className="bg-emerald-600 text-white hover:bg-emerald-500"><Link to="/">Go to dashboard</Link></Button>
        </>
      }
    />
  );
};

export default CheckoutView;
