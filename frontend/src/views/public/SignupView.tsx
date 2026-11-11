import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Check,
  CheckCircle2,
  CreditCard,
  IndianRupee,
  Loader2,
  Lock,
  MessageCircle,
  Rocket,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { User } from '@/stores/auth';
import { api } from '@/services/api';
import { readData } from '@/services/response';
import {
  useBranding,
  apiErrorMessage,
  apiErrorStatus,
  completeSignIn,
  formatPriceWithInterval,
  isValidEmail,
  planLimits,
  useDocumentTitle,
  isExplorer,
  usePublicPlans,
  useSignedInUser,
  type PublicPlan,
  type PublicPlansInfo,
} from './publicApi';
import {
  Field,
  FormAlert,
  HeaderLink,
  PasswordInput,
  PublicShell,
  cardClass,
  errorInputClass,
  inputClass,
} from './PublicLayout';
import { AuthBackdrop } from '@/views/auth/AuthBackdrop';
import { ChatMock } from '@/views/auth/AuthShowcase';
import { CapsLockHint, ConsentCheckbox, StepProgress } from '@/views/auth/AuthFormBits';
import { useCapsLock } from '@/views/auth/authHooks';
import { checkoutPath, isBillingCycle } from '@/services/payments';
import { cycleInfo, cyclePrice, formatPrice, type BillingInterval } from '@/services/superAdmin';
import { SignupPaymentChoice } from './SignupPaymentChoice';
import { PasswordChecklist, PhoneInput } from './SignupFields';
import { PASSWORD_RULES_MESSAGE, passwordIsValid } from '@/lib/passwordRules';
import { DEFAULT_COUNTRY, phoneError, toE164, type Country } from '@/lib/countries';

type FieldName = 'full_name' | 'email' | 'password' | 'confirm_password' | 'business_name' | 'phone' | 'plan_id' | 'consent';
type FieldErrors = Partial<Record<FieldName, string>>;

interface FormState {
  business_name: string;
  full_name: string;
  email: string;
  phone: string;
  password: string;
  confirm_password: string;
}

const emptyForm: FormState = { business_name: '', full_name: '', email: '', phone: '', password: '', confirm_password: '' };

/** Step 1 is "who you are", step 2 is "your business and plan". */
const SIGNUP_STEPS = ['Your account', 'Business & plan'];
const ACCOUNT_FIELDS: FieldName[] = ['full_name', 'email', 'password', 'confirm_password'];
const stepOfField = (f: FieldName) => (ACCOUNT_FIELDS.includes(f) ? 0 : 1);

/** Server validation messages that belong to one field. */
function fieldForServerMessage(message: string): FieldName | null {
  const m = message.toLowerCase();
  if (m.includes('business name')) return 'business_name';
  if (m.includes('your name')) return 'full_name';
  if (m.includes('email')) return 'email';
  if (m.includes('password')) return 'password';
  if (m.includes('phone')) return 'phone';
  if (m.includes('plan')) return 'plan_id';
  return null;
}

/** Optional phone: only checked when something was typed. */
function checkPhone(country: Country, phone: string): string | undefined {
  if (!phone.trim()) return undefined;
  return phoneError(country, phone) ?? undefined;
}

function validateAccount(form: FormState): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.full_name.trim()) errors.full_name = 'Enter your name';
  if (!form.email.trim()) errors.email = 'Enter your work email';
  else if (!isValidEmail(form.email)) errors.email = 'Enter a valid email address';
  if (!passwordIsValid(form.password)) errors.password = PASSWORD_RULES_MESSAGE;
  if (!form.confirm_password) errors.confirm_password = 'Type your password again';
  else if (form.confirm_password !== form.password) errors.confirm_password = "Passwords don't match";
  return errors;
}

function validateBusiness(form: FormState, country: Country, consent: boolean): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.business_name.trim()) errors.business_name = 'Enter your business name';
  const phone = checkPhone(country, form.phone);
  if (phone) errors.phone = phone;
  if (!consent) errors.consent = 'Please accept the terms to continue';
  return errors;
}

/** Small reassurance strip shown beside the sign-up forms. No made-up numbers. */
const TrustList: React.FC = () => (
  <ul className="auth-enter mt-4 grid gap-2 text-sm" style={{ animationDelay: '260ms' }} aria-label="Why sign up">
    {[
      { icon: BadgeCheck, text: 'Official WhatsApp Business API' },
      { icon: ShieldCheck, text: 'Secure payments by Razorpay: UPI, cards & net banking' },
      { icon: IndianRupee, text: 'Made in India, simple pricing in ₹' },
    ].map(({ icon: Icon, text }) => (
      <li
        key={text}
        className="flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5 text-white/70 backdrop-blur light:border-gray-200 light:bg-white/80 light:text-gray-700"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400 light:bg-emerald-50 light:text-emerald-600">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        {text}
      </li>
    ))}
  </ul>
);

/** Step-1 side panel: what the workspace looks like, before any business details. */
const SignupPreview: React.FC<{ plan: PublicPlan | null }> = ({ plan }) => (
  <div className={cn(cardClass, 'space-y-5 p-6 sm:p-7')}>
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-white/40 light:text-gray-500">What you get</p>
      <h2 className="mt-2 text-lg font-semibold text-white light:text-gray-900">Your team inbox for WhatsApp</h2>
    </div>
    <ChatMock className="hidden max-w-none sm:block" />
    <ul className="space-y-2 text-sm">
      {['Shared inbox for your whole team', 'Bot flows and quick replies', 'Template campaigns with read stats'].map((f) => (
        <li key={f} className="flex gap-2 text-white/70 light:text-gray-700">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400 light:text-emerald-600" aria-hidden />
          {f}
        </li>
      ))}
    </ul>
    {plan && (
      <p className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs text-white/50 light:border-gray-200 light:bg-gray-50 light:text-gray-500">
        Selected plan: <span className="font-medium text-white/80 light:text-gray-800">{plan.name}</span> ·{' '}
        <span className="tabular-nums">{formatPriceWithInterval(plan)}</span>. You can change it in the next step.
      </p>
    )}
  </div>
);

/** Eyebrow pill + gradient headline used at the top of both forms. */
const SignupHeading: React.FC<{ eyebrow: React.ReactNode; title: React.ReactNode; children: React.ReactNode }> = ({
  eyebrow,
  title,
  children,
}) => (
  <div className="auth-stagger mb-8 max-w-2xl" style={{ '--auth-base-delay': '0ms' } as React.CSSProperties}>
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/[0.08] px-3 py-1 text-xs font-medium text-emerald-300 light:border-emerald-200 light:bg-emerald-50 light:text-emerald-700">
      {eyebrow}
    </span>
    <h1 className="mt-4 text-2xl font-bold tracking-tight text-white sm:text-4xl light:text-gray-900">{title}</h1>
    <p className="mt-2 text-white/50 light:text-gray-500">{children}</p>
  </div>
);

const fieldOrder: FieldName[] = [...ACCOUNT_FIELDS, 'business_name', 'phone', 'plan_id', 'consent'];

/** What the chosen billing cycle costs, in words the summary card can show. */
const CycleTotal: React.FC<{ plan: PublicPlan; cycle: BillingInterval }> = ({ plan, cycle }) => {
  const info = cycleInfo(cycle);
  const cp = cyclePrice(plan, cycle);
  return (
    <div className="mt-5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5 light:border-gray-200 light:bg-gray-50" aria-live="polite">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-white/60 light:text-gray-600">Billed {info.label.toLowerCase()}</span>
        <span className="text-lg font-semibold tabular-nums text-white light:text-gray-900">{formatPrice(cp.total)}</span>
      </div>
      {info.months > 1 && (
        <p className="mt-1 text-right text-xs tabular-nums text-white/45 light:text-gray-500">
          {formatPrice(cp.perMonth)}/month for {info.months} months
        </p>
      )}
      {cp.saving > 0 && (
        <p className="mt-2 flex items-center justify-between gap-2 text-xs">
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-semibold text-emerald-300 light:bg-emerald-100 light:text-emerald-700">
            {cp.discount}% off
          </span>
          <span className="tabular-nums text-emerald-300 light:text-emerald-700">
            You save {formatPrice(cp.saving)} <s className="ml-1 text-white/35 light:text-gray-400">{formatPrice(cp.full)}</s>
          </span>
        </p>
      )}
    </div>
  );
};

const PlanSummary: React.FC<{
  plan: PublicPlan | null;
  businessName: string;
  cycle?: BillingInterval;
}> = ({ plan, businessName, cycle }) => (
  <aside className={cn(cardClass, 'p-6 sm:p-7')}>
    <p className="text-xs font-medium uppercase tracking-wider text-white/40 light:text-gray-500">
      Your plan
    </p>
    {plan ? (
      <>
        <div className="mt-3 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-white light:text-gray-900">{plan.name}</h2>
            {plan.description && (
              <p className="mt-1 text-sm text-white/50 light:text-gray-500">{plan.description}</p>
            )}
          </div>
          <p className="shrink-0 text-right text-lg font-semibold tabular-nums text-white light:text-gray-900">
            {formatPriceWithInterval(plan)}
          </p>
        </div>
        <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
          {planLimits(plan).map((limit) => (
            <div
              key={limit.label}
              className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-2.5 light:border-gray-200 light:bg-gray-50"
            >
              <dd className="text-sm font-semibold tabular-nums text-white light:text-gray-900">{limit.value}</dd>
              <dt className="mt-0.5 text-[11px] leading-tight text-white/40 light:text-gray-500">{limit.label}</dt>
            </div>
          ))}
        </dl>
        {plan.features.length > 0 && (
          <ul className="mt-5 space-y-2 text-sm">
            {plan.features.map((feature, i) => (
              <li key={`${feature}-${i}`} className="flex gap-2 text-white/70 light:text-gray-700">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400 light:text-emerald-600" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        )}
      </>
    ) : (
      <h2 className="mt-3 text-lg font-semibold text-white light:text-gray-900">
        Your new workspace
      </h2>
    )}

    {plan && plan.price > 0 && cycle && <CycleTotal plan={plan} cycle={cycle} />}

    {plan && plan.price > 0 && (
      <div className="mt-4 flex gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-3.5 light:border-emerald-200 light:bg-emerald-50">
        <CreditCard className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400 light:text-emerald-600" />
        <div className="text-sm">
          <p className="font-medium text-emerald-200 light:text-emerald-800">Pay after creating your account</p>
          <p className="mt-0.5 text-emerald-100/60 light:text-emerald-900/70">
            Your workspace unlocks as soon as your first payment goes through.
          </p>
        </div>
      </div>
    )}

    <p className="mt-5 flex gap-2 text-xs text-white/40 light:text-gray-500">
      <CheckCircle2 className="h-4 w-4 shrink-0" />
      <span>
        You'll be the admin of{' '}
        <span className="text-white/70 light:text-gray-800">{businessName.trim() || 'your business'}</span> and can
        invite your team once you're in.
      </span>
    </p>
  </aside>
);

const PlanSelect: React.FC<{
  plans: PublicPlan[];
  value: string;
  error?: string;
  disabled: boolean;
  triggerRef: (el: HTMLButtonElement | null) => void;
  onChange: (planId: string) => void;
}> = ({ plans, value, error, disabled, triggerRef, onChange }) => {
  if (plans.length === 0) return null;
  return (
    <Field id="plan" label="Plan" error={error}>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id="plan" ref={triggerRef} className={cn('h-10 text-sm', error && errorInputClass)}>
          <SelectValue placeholder="Choose a plan" />
        </SelectTrigger>
        <SelectContent>
          {plans.map((plan) => (
            <SelectItem key={plan.id} value={plan.id} className="text-sm">
              <span className="flex items-center gap-2">
                <span>{plan.name}</span>
                <span className="text-white/40 light:text-gray-500">· {formatPriceWithInterval(plan)}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
};

/** ?plan= if it's a real plan, else the platform default, else the first plan. */
function useInitialPlanId(info: PublicPlansInfo | null, plans: PublicPlan[]): string {
  const [searchParams] = useSearchParams();
  return useMemo(() => {
    const fromQuery = searchParams.get('plan');
    if (fromQuery && plans.some((p) => p.id === fromQuery)) return fromQuery;
    if (info?.default_plan && plans.some((p) => p.id === info.default_plan)) return info.default_plan;
    return plans[0]?.id ?? '';
  }, [searchParams, plans, info?.default_plan]);
}

/** A paid plan needs a billing cycle and opens checkout after sign-up; a free plan goes to the dashboard. */
function usePaymentChoice(plan: PublicPlan | null) {
  const [searchParams] = useSearchParams();
  const [cycle, setCycle] = useState<BillingInterval>(() => {
    const c = searchParams.get('cycle');
    return isBillingCycle(c) ? c : 'monthly';
  });
  const payNow = !!plan && plan.price > 0;
  const afterSignup = payNow && plan ? checkoutPath(plan.id, cycle) : '/';
  return { payNow, cycle, setCycle, afterSignup };
}

export const SignupView: React.FC = () => {
  const user = useSignedInUser();
  // An explorer already has a login: only the business details are missing.
  return isExplorer(user) ? <UpgradeSignup email={user?.email ?? ''} /> : <NewBusinessSignup />;
};

const NewBusinessSignup: React.FC = () => {
  const navigate = useNavigate();
  const { info, loading } = usePublicPlans();
  const [searchParams] = useSearchParams();

  // Coming back from "Continue with Google/Facebook" without an account: fill in what we know.
  const [form, setForm] = useState<FormState>(() => ({
    ...emptyForm,
    email: searchParams.get('email') ?? '',
    full_name: searchParams.get('name') ?? '',
  }));
  const [step, setStep] = useState(0);
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [chosenPlanId, setChosenPlanId] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [triedSubmit, setTriedSubmit] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [emailTaken, setEmailTaken] = useState<string | null>(null);
  const [closedMessage, setClosedMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRefs = useRef<Partial<Record<FieldName, HTMLElement | null>>>({});
  /** Field to focus once the step that holds it has rendered. */
  const pendingFocus = useRef<FieldName | null>(null);
  const { capsLock, handlers: capsHandlers } = useCapsLock();

  const branding = useBranding();
  const platformName = branding.platform_name;
  const plans = useMemo(() => info?.plans ?? [], [info]);
  useDocumentTitle(`Create your account · ${platformName}`);

  const initialPlanId = useInitialPlanId(info, plans);
  const planId = chosenPlanId ?? initialPlanId;
  const selectedPlan = plans.find((p) => p.id === planId) ?? null;
  const payment = usePaymentChoice(selectedPlan);

  const signupClosed = (info && !info.signup_enabled) || closedMessage !== null;

  useEffect(() => {
    const f = pendingFocus.current;
    if (f === null) return;
    pendingFocus.current = null;
    inputRefs.current[f]?.focus();
  }, [step]);

  const setField = (name: keyof FormState, value: string) => {
    setForm((f) => ({ ...f, [name]: value }));
    if (errors[name]) setErrors((e) => ({ ...e, [name]: undefined }));
    // Retyping the password re-checks the confirmation only once it was filled in.
    if (name === 'password' && errors.confirm_password) setErrors((e) => ({ ...e, confirm_password: undefined }));
    if (name === 'email') setEmailTaken(null);
    setFormError(null);
  };

  /** Focus a field, switching to its step first if needed. */
  const focusField = (f: FieldName) => {
    const target = stepOfField(f);
    if (target !== step) {
      pendingFocus.current = f;
      setStep(target);
    } else {
      inputRefs.current[f]?.focus();
    }
  };

  const focusFirstError = (errs: FieldErrors) => {
    const first = fieldOrder.find((f) => errs[f]);
    if (first) focusField(first);
  };

  const goToStep = (next: number) => {
    pendingFocus.current = next === 0 ? 'full_name' : 'business_name';
    setStep(next);
    setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    // Step 1: check the account details, then move on (Enter works the same as "Continue").
    if (step === 0) {
      const errs = validateAccount(form);
      setErrors(errs);
      setTriedSubmit(true);
      if (Object.keys(errs).length > 0) {
        focusFirstError(errs);
        return;
      }
      goToStep(1);
      return;
    }

    const errs = { ...validateAccount(form), ...validateBusiness(form, country, consent) };
    setErrors(errs);
    setFormError(null);
    setEmailTaken(null);
    setTriedSubmit(true);
    if (Object.keys(errs).length > 0) {
      if (errs.password) toast.error(PASSWORD_RULES_MESSAGE);
      else if (!errs.consent || Object.keys(errs).length > 1) toast.error('Please fix the highlighted fields');
      focusFirstError(errs);
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post('/auth/signup', {
        business_name: form.business_name.trim(),
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        password: form.password,
        ...(form.phone.trim() ? { phone: toE164(country, form.phone) } : {}),
        ...(planId ? { plan_id: planId } : {}),
      });
      const { user } = readData<{ user: User }>(res);
      toast.success(`Welcome to ${platformName}! Your workspace is ready.`);
      completeSignIn(user, navigate, payment.afterSignup);
    } catch (err) {
      const status = apiErrorStatus(err);
      const message = apiErrorMessage(err, "We couldn't create your account. Please try again.");
      const field = status === 400 ? fieldForServerMessage(message) : null;
      if (status === 409) {
        setEmailTaken(message);
        focusField('email');
      } else if (status === 403) {
        setClosedMessage(message);
      } else if (field) {
        setErrors({ [field]: message });
        focusField(field);
      } else if (status === 429) {
        setFormError('Too many attempts. Please wait a minute and try again.');
      } else if (!status) {
        setFormError("We couldn't reach the server. Check your connection and try again.");
      } else {
        setFormError(message);
      }
      setSubmitting(false);
    }
  };

  const headerActions = (
    <>
      <HeaderLink to="/pricing">Plans</HeaderLink>
      <HeaderLink to="/login">Sign in</HeaderLink>
    </>
  );

  if (loading && !info) {
    return (
      <PublicShell headerActions={headerActions}>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-white/40 light:text-gray-400" aria-label="Loading" />
        </div>
      </PublicShell>
    );
  }

  if (signupClosed) {
    const supportEmail = branding.support_email;
    return (
      <PublicShell headerActions={headerActions}>
        <div className="auth-motion mx-auto flex min-h-[60vh] max-w-md items-center px-4 py-16">
          <div className={cn(cardClass, 'auth-enter w-full p-8 text-center')}>
            <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/10 light:bg-amber-50">
              <Lock className="h-5 w-5 text-amber-400 light:text-amber-600" />
            </div>
            <h1 className="text-xl font-semibold text-white light:text-gray-900">Sign-ups are closed</h1>
            <p className="mt-2 text-sm text-white/50 light:text-gray-500">
              {closedMessage ?? "We're not accepting new businesses right now."}
              {supportEmail && (
                <>
                  {' '}
                  Contact{' '}
                  <a href={`mailto:${supportEmail}`} className="text-emerald-400 hover:text-emerald-300 light:text-emerald-600">
                    {supportEmail}
                  </a>{' '}
                  to get access.
                </>
              )}
            </p>
            <Button asChild className="mt-6 w-full bg-emerald-600 text-white hover:bg-emerald-500">
              <Link to="/login">Sign in to an existing account</Link>
            </Button>
          </div>
        </div>
      </PublicShell>
    );
  }

  const confirmMatches = !!form.confirm_password && form.confirm_password === form.password;
  const passwordDescribedBy = [
    errors.password ? 'password-error' : '',
    'password-rules',
    capsLock ? 'password-caps' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <PublicShell headerActions={headerActions}>
      <div className="auth-motion relative isolate overflow-hidden">
      <AuthBackdrop className="-z-10" />
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        <SignupHeading
          eyebrow={
            <>
              <MessageCircle className="h-3.5 w-3.5" />
              WhatsApp Business, made simple
            </>
          }
          title={
            <>
              Create your{' '}
              <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-500 bg-clip-text text-transparent light:from-emerald-600 light:via-teal-500 light:to-emerald-600">
                {platformName}
              </span>{' '}
              account
            </>
          }
        >
          {payment.payNow
            ? 'Set up your workspace in under a minute, then pay securely to unlock your plan.'
            : 'Set up a workspace for your business in under a minute and start chatting with customers.'}
        </SignupHeading>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8">
          <form
            onSubmit={handleSubmit}
            noValidate
            aria-label="Create your account"
            className={cn(cardClass, 'auth-enter p-6 sm:p-8 shadow-2xl shadow-black/30 light:shadow-emerald-900/5')}
          >
            <StepProgress steps={SIGNUP_STEPS} current={step} onStep={(i) => !submitting && goToStep(i)} />

            {step === 0 ? (
              <div key="account" className="auth-step-panel space-y-5">
                <Field id="full_name" label="Your name" error={errors.full_name}>
                  <Input
                    id="full_name"
                    ref={(el) => {
                      inputRefs.current.full_name = el;
                    }}
                    value={form.full_name}
                    onChange={(e) => setField('full_name', e.target.value)}
                    placeholder="Jane Doe"
                    autoComplete="name"
                    autoFocus={!form.full_name}
                    aria-invalid={!!errors.full_name || undefined}
                    aria-describedby={errors.full_name ? 'full_name-error' : undefined}
                    className={cn(inputClass, errors.full_name && errorInputClass)}
                  />
                </Field>

                <Field id="email" label="Work email" error={errors.email}>
                  <Input
                    id="email"
                    type="email"
                    ref={(el) => {
                      inputRefs.current.email = el;
                    }}
                    value={form.email}
                    onChange={(e) => setField('email', e.target.value)}
                    onBlur={() => {
                      if (form.email.trim() && !isValidEmail(form.email))
                        setErrors((er) => ({ ...er, email: 'Enter a valid email address' }));
                    }}
                    placeholder="jane@acme.com"
                    autoComplete="email"
                    inputMode="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    autoFocus={!!form.full_name && !form.email}
                    aria-invalid={!!(errors.email || emailTaken) || undefined}
                    aria-describedby={errors.email ? 'email-error' : undefined}
                    className={cn(inputClass, (errors.email || emailTaken) && errorInputClass)}
                  />
                </Field>

                {emailTaken && (
                  <FormAlert>
                    <p>{emailTaken}</p>
                    <Link
                      to="/login"
                      className="inline-block font-medium text-white underline underline-offset-2 hover:text-emerald-300 light:text-red-800"
                    >
                      Go to sign in →
                    </Link>
                  </FormAlert>
                )}

                <div className="grid gap-5 sm:grid-cols-2">
                  <Field id="password" label="Password" error={errors.password}>
                    <PasswordInput
                      id="password"
                      ref={(el) => {
                        inputRefs.current.password = el;
                      }}
                      value={form.password}
                      onChange={(e) => setField('password', e.target.value)}
                      {...capsHandlers}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      autoFocus={!!form.full_name && !!form.email}
                      invalid={!!errors.password}
                      aria-describedby={passwordDescribedBy}
                    />
                  </Field>
                  <Field id="confirm_password" label="Confirm password" error={errors.confirm_password}>
                    <div className="relative">
                      <PasswordInput
                        id="confirm_password"
                        ref={(el) => {
                          inputRefs.current.confirm_password = el;
                        }}
                        value={form.confirm_password}
                        onChange={(e) => setField('confirm_password', e.target.value)}
                        onBlur={() => {
                          if (form.confirm_password && form.confirm_password !== form.password)
                            setErrors((er) => ({ ...er, confirm_password: "Passwords don't match" }));
                        }}
                        placeholder="••••••••"
                        autoComplete="new-password"
                        invalid={!!errors.confirm_password}
                        aria-describedby={errors.confirm_password ? 'confirm_password-error' : confirmMatches ? 'confirm_password-ok' : undefined}
                        className={cn(confirmMatches && 'pr-16')}
                      />
                      {confirmMatches && (
                        <span
                          id="confirm_password-ok"
                          className="pointer-events-none absolute right-10 top-1/2 flex -translate-y-1/2 items-center text-emerald-400 light:text-emerald-600"
                        >
                          <Check className="h-4 w-4" aria-hidden />
                          <span className="sr-only">Passwords match</span>
                        </span>
                      )}
                    </div>
                  </Field>
                </div>
                <div className="-mt-2">
                  <CapsLockHint id="password-caps" show={capsLock} />
                  <div className="mt-2">
                    <PasswordChecklist id="password-rules" password={form.password} showErrors={triedSubmit} />
                  </div>
                </div>

                {formError && <FormAlert>{formError}</FormAlert>}

                <Button
                  type="submit"
                  className="auth-cta h-11 w-full bg-emerald-600 text-base font-medium text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-500"
                >
                  Continue
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
                </Button>
              </div>
            ) : (
              <div key="business" className="auth-step-panel space-y-5">
                <Field id="business_name" label="Business name" error={errors.business_name}>
                  <Input
                    id="business_name"
                    ref={(el) => {
                      inputRefs.current.business_name = el;
                    }}
                    value={form.business_name}
                    onChange={(e) => setField('business_name', e.target.value)}
                    placeholder="Acme Inc."
                    autoComplete="organization"
                    disabled={submitting}
                    aria-invalid={!!errors.business_name || undefined}
                    aria-describedby={errors.business_name ? 'business_name-error' : undefined}
                    className={cn(inputClass, errors.business_name && errorInputClass)}
                  />
                </Field>

                <Field id="phone" label="Phone" optional error={errors.phone}>
                  <PhoneInput
                    id="phone"
                    country={country}
                    onCountry={(c) => {
                      setCountry(c);
                      if (errors.phone) setErrors((e) => ({ ...e, phone: undefined }));
                    }}
                    value={form.phone}
                    onChange={(v) => setField('phone', v)}
                    inputRef={(el) => {
                      inputRefs.current.phone = el;
                    }}
                    disabled={submitting}
                    invalid={!!errors.phone}
                    describedBy={errors.phone ? 'phone-error' : undefined}
                  />
                </Field>

                <PlanSelect
                  plans={plans}
                  value={planId}
                  error={errors.plan_id}
                  disabled={submitting}
                  triggerRef={(el) => {
                    inputRefs.current.plan_id = el;
                  }}
                  onChange={(v) => {
                    setChosenPlanId(v);
                    setErrors((e) => ({ ...e, plan_id: undefined }));
                  }}
                />

                {payment.payNow && selectedPlan && (
                  <SignupPaymentChoice
                    plan={selectedPlan}
                    cycle={payment.cycle}
                    onCycle={payment.setCycle}
                    disabled={submitting}
                  />
                )}

                <ConsentCheckbox
                  checked={consent}
                  onChange={(v) => {
                    setConsent(v);
                    if (v) setErrors((e) => ({ ...e, consent: undefined }));
                  }}
                  error={errors.consent}
                  disabled={submitting}
                  inputRef={(el) => {
                    inputRefs.current.consent = el;
                  }}
                />

                {formError && <FormAlert>{formError}</FormAlert>}

                <div className="flex flex-col-reverse gap-3 sm:flex-row">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => goToStep(0)}
                    disabled={submitting}
                    className="auth-lift h-11 border-white/[0.1] bg-transparent text-white/80 hover:bg-white/[0.04] hover:text-white light:border-gray-200 light:text-gray-700 light:hover:bg-gray-100"
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
                    Back
                  </Button>
                  <Button
                    type="submit"
                    disabled={submitting}
                    className="auth-cta h-11 flex-1 bg-emerald-600 text-base font-medium text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-500"
                    aria-busy={submitting || undefined}
                  >
                    {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                    {submitting
                      ? 'Creating your workspace…'
                      : payment.payNow
                        ? 'Create account & continue to payment'
                        : 'Create account'}
                  </Button>
                </div>
              </div>
            )}

            <p className="mt-5 text-center text-sm text-white/40 light:text-gray-500">
              Already have an account?{' '}
              <Link
                to="/login"
                className="font-medium text-emerald-400 underline-offset-4 hover:text-emerald-300 hover:underline light:text-emerald-600"
              >
                Sign in
              </Link>
            </p>
          </form>

          <div className="auth-enter lg:sticky lg:top-6" style={{ animationDelay: '120ms' }}>
            {step === 0 ? (
              <SignupPreview plan={selectedPlan} />
            ) : (
              <PlanSummary plan={selectedPlan} businessName={form.business_name} cycle={payment.payNow ? payment.cycle : undefined} />
            )}
            <TrustList />
          </div>
        </div>
      </div>
      </div>
    </PublicShell>
  );
};

type UpgradeField = 'business_name' | 'phone' | 'plan_id';
const upgradeFieldOrder: UpgradeField[] = ['business_name', 'phone', 'plan_id'];

/** Explorer -> admin of their own business (POST /subscribe). */
const UpgradeSignup: React.FC<{ email: string }> = ({ email }) => {
  const navigate = useNavigate();
  const { info, loading } = usePublicPlans();

  const [businessName, setBusinessName] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [chosenPlanId, setChosenPlanId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<UpgradeField, string>>>({});
  const [formError, setFormError] = useState<React.ReactNode>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRefs = useRef<Partial<Record<UpgradeField, HTMLElement | null>>>({});

  const branding = useBranding();
  const platformName = branding.platform_name;
  const plans = useMemo(() => info?.plans ?? [], [info]);
  useDocumentTitle(`Get your own workspace · ${platformName}`);

  const initialPlanId = useInitialPlanId(info, plans);
  const planId = chosenPlanId ?? initialPlanId;
  const selectedPlan = plans.find((p) => p.id === planId) ?? null;
  const payment = usePaymentChoice(selectedPlan);
  const upgradeClosed = info ? !info.signup_enabled : false;

  const focusFirstError = (errs: Partial<Record<UpgradeField, string>>) => {
    const first = upgradeFieldOrder.find((f) => errs[f]);
    if (first) inputRefs.current[first]?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const errs: Partial<Record<UpgradeField, string>> = {};
    if (!businessName.trim()) errs.business_name = 'Enter your business name';
    const phoneErr = checkPhone(country, phone);
    if (phoneErr) errs.phone = phoneErr;
    setErrors(errs);
    setFormError(null);
    if (Object.keys(errs).length > 0) {
      toast.error('Please fix the highlighted fields');
      focusFirstError(errs);
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post('/subscribe', {
        business_name: businessName.trim(),
        ...(phone.trim() ? { phone: toE164(country, phone) } : {}),
        ...(planId ? { plan_id: planId } : {}),
      });
      const { user } = readData<{ user: User }>(res);
      toast.success('Welcome to your new workspace');
      // Sets the new admin session, drops the demo org selection and opens the dashboard (or checkout).
      completeSignIn(user, navigate, payment.afterSignup);
    } catch (err) {
      const status = apiErrorStatus(err);
      const message = apiErrorMessage(err, "We couldn't create your workspace. Please try again.");
      const lower = message.toLowerCase();
      if (status === 400 && lower.includes('already belongs')) {
        setFormError(
          <>
            <p>{message}</p>
            <Link to="/" className="inline-block font-medium text-white underline underline-offset-2 light:text-red-800">
              Open your workspace →
            </Link>
          </>
        );
      } else if (status === 400 && lower.includes('business name')) {
        setErrors({ business_name: message });
        focusFirstError({ business_name: message });
      } else if (status === 400 && lower.includes('plan')) {
        setErrors({ plan_id: message });
        focusFirstError({ plan_id: message });
      } else if (status === 400 && lower.includes('phone')) {
        setErrors({ phone: message });
        focusFirstError({ phone: message });
      } else if (status === 429) {
        setFormError('Too many attempts. Please wait a minute and try again.');
      } else {
        setFormError(message);
      }
      setSubmitting(false);
    }
  };

  const headerActions = (
    <>
      <HeaderLink to="/pricing">Plans</HeaderLink>
      <HeaderLink to="/">Back to the demo</HeaderLink>
    </>
  );

  if (loading && !info) {
    return (
      <PublicShell headerActions={headerActions}>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-white/40 light:text-gray-400" aria-label="Loading" />
        </div>
      </PublicShell>
    );
  }

  return (
    <PublicShell headerActions={headerActions}>
      <div className="auth-motion relative isolate overflow-hidden">
      <AuthBackdrop className="-z-10" />
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        <SignupHeading
          eyebrow={
            <>
              <Rocket className="h-3.5 w-3.5" />
              Upgrade
            </>
          }
          title="Upgrade to your own workspace"
        >
          Set up your business and keep your login
          {email ? (
            <>
              {' '}
              (<span className="text-white/75 light:text-gray-800">{email}</span>)
            </>
          ) : null}
          . You'll leave the demo and land in a fresh workspace of your own.
        </SignupHeading>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8">
          <form
            onSubmit={handleSubmit}
            noValidate
            className={cn(cardClass, 'auth-enter p-6 sm:p-8 shadow-2xl shadow-black/30 light:shadow-emerald-900/5')}
          >
            <div className="auth-stagger space-y-5" style={{ '--auth-base-delay': '160ms' } as React.CSSProperties}>
              {upgradeClosed && (
                <FormAlert tone="info">
                  <p className="font-medium">New workspaces are currently closed.</p>
                  <p className="text-amber-100/70 light:text-amber-800/80">
                    {branding.support_email ? (
                      <>
                        Contact{' '}
                        <a href={`mailto:${branding.support_email}`} className="underline underline-offset-2">
                          {branding.support_email}
                        </a>{' '}
                        to get access. You can keep exploring the demo in the meantime.
                      </>
                    ) : (
                      'You can keep exploring the demo in the meantime.'
                    )}
                  </p>
                </FormAlert>
              )}

              <Field id="business_name" label="Business name" error={errors.business_name}>
                <Input
                  id="business_name"
                  ref={(el) => {
                    inputRefs.current.business_name = el;
                  }}
                  value={businessName}
                  onChange={(e) => {
                    setBusinessName(e.target.value);
                    setErrors((er) => ({ ...er, business_name: undefined }));
                    setFormError(null);
                  }}
                  placeholder="Acme Inc."
                  autoComplete="organization"
                  autoFocus
                  disabled={submitting || upgradeClosed}
                  aria-invalid={!!errors.business_name || undefined}
                  aria-describedby={errors.business_name ? 'business_name-error' : undefined}
                  className={cn(inputClass, errors.business_name && errorInputClass)}
                />
              </Field>

              <Field id="phone" label="Phone" optional error={errors.phone}>
                <PhoneInput
                  id="phone"
                  country={country}
                  onCountry={(c) => {
                    setCountry(c);
                    setErrors((er) => ({ ...er, phone: undefined }));
                  }}
                  value={phone}
                  onChange={(v) => {
                    setPhone(v);
                    setErrors((er) => ({ ...er, phone: undefined }));
                    setFormError(null);
                  }}
                  inputRef={(el) => {
                    inputRefs.current.phone = el;
                  }}
                  disabled={submitting || upgradeClosed}
                  invalid={!!errors.phone}
                  describedBy={errors.phone ? 'phone-error' : undefined}
                />
              </Field>

              <PlanSelect
                plans={plans}
                value={planId}
                error={errors.plan_id}
                disabled={submitting || upgradeClosed}
                triggerRef={(el) => {
                  inputRefs.current.plan_id = el;
                }}
                onChange={(v) => {
                  setChosenPlanId(v);
                  setErrors((er) => ({ ...er, plan_id: undefined }));
                  setFormError(null);
                }}
              />

              {payment.payNow && selectedPlan && !upgradeClosed && (
                <SignupPaymentChoice
                  plan={selectedPlan}
                  cycle={payment.cycle}
                  onCycle={payment.setCycle}
                  disabled={submitting}
                />
              )}

              {formError && <FormAlert>{formError}</FormAlert>}

              <Button
                type="submit"
                disabled={submitting || upgradeClosed}
                className="auth-cta h-11 w-full bg-emerald-600 text-base font-medium text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-500"
                aria-busy={submitting || undefined}
              >
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                {submitting
                  ? 'Creating your workspace…'
                  : payment.payNow
                    ? 'Create workspace & continue to payment'
                    : 'Create my workspace'}
              </Button>

              <p className="text-center text-sm text-white/40 light:text-gray-500">
                Not ready yet?{' '}
                <Link
                  to="/"
                  className="font-medium text-emerald-400 underline-offset-4 hover:text-emerald-300 hover:underline light:text-emerald-600"
                >
                  Keep exploring the demo
                </Link>
              </p>
            </div>
          </form>

          <div className="auth-enter lg:sticky lg:top-6" style={{ animationDelay: '120ms' }}>
            <PlanSummary plan={selectedPlan} businessName={businessName} cycle={payment.payNow && !upgradeClosed ? payment.cycle : undefined} />
            <TrustList />
          </div>
        </div>
      </div>
      </div>
    </PublicShell>
  );
};

export default SignupView;
