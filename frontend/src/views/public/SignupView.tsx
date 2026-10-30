import React, { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Check, CheckCircle2, Gift, Loader2, Lock, Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { User } from '@/stores/auth';
import { api } from '@/services/api';
import { readData } from '@/services/response';
import {
  useBranding,
  MIN_PASSWORD_LENGTH,
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

type FieldName = 'business_name' | 'full_name' | 'email' | 'phone' | 'password' | 'plan_id';
type FieldErrors = Partial<Record<FieldName, string>>;

interface FormState {
  business_name: string;
  full_name: string;
  email: string;
  phone: string;
  password: string;
}

const PHONE_PATTERN = /^[+\d][\d\s()-]{5,}$/;

const emptyForm: FormState = { business_name: '', full_name: '', email: '', phone: '', password: '' };

/** Server validation messages that belong to one field. */
function fieldForServerMessage(message: string): FieldName | null {
  const m = message.toLowerCase();
  if (m.includes('business name')) return 'business_name';
  if (m.includes('your name')) return 'full_name';
  if (m.includes('email')) return 'email';
  if (m.includes('password')) return 'password';
  if (m.includes('plan')) return 'plan_id';
  return null;
}

function validate(form: FormState): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.business_name.trim()) errors.business_name = 'Enter your business name';
  if (!form.full_name.trim()) errors.full_name = 'Enter your name';
  if (!form.email.trim()) errors.email = 'Enter your work email';
  else if (!isValidEmail(form.email)) errors.email = 'Enter a valid email address';
  if (form.phone.trim() && !PHONE_PATTERN.test(form.phone.trim()))
    errors.phone = 'Enter a valid phone number, or leave it empty';
  if (form.password.length < MIN_PASSWORD_LENGTH)
    errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters`;
  return errors;
}

const fieldOrder: FieldName[] = ['business_name', 'full_name', 'email', 'phone', 'password', 'plan_id'];

const PlanSummary: React.FC<{
  plan: PublicPlan | null;
  trialDays: number;
  businessName: string;
}> = ({ plan, trialDays, businessName }) => (
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
        {trialDays > 0 ? 'Free trial' : 'Your new workspace'}
      </h2>
    )}

    {trialDays > 0 && (
      <div className="mt-6 flex gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-3.5 light:border-emerald-200 light:bg-emerald-50">
        <Gift className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400 light:text-emerald-600" />
        <div className="text-sm">
          <p className="font-medium text-emerald-200 light:text-emerald-800">
            {trialDays} days free{plan && plan.price > 0 ? `, then ${formatPriceWithInterval(plan)}` : ''}
          </p>
          <p className="mt-0.5 text-emerald-100/60 light:text-emerald-900/70">No card needed to start.</p>
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
  const [chosenPlanId, setChosenPlanId] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [emailTaken, setEmailTaken] = useState<string | null>(null);
  const [closedMessage, setClosedMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRefs = useRef<Partial<Record<FieldName, HTMLElement | null>>>({});

  const branding = useBranding();
  const platformName = branding.platform_name;
  const plans = useMemo(() => info?.plans ?? [], [info]);
  const trialDays = info?.trial_days ?? 0;
  useDocumentTitle(`Start your free trial · ${platformName}`);

  const initialPlanId = useInitialPlanId(info, plans);
  const planId = chosenPlanId ?? initialPlanId;
  const selectedPlan = plans.find((p) => p.id === planId) ?? null;

  const signupClosed = (info && !info.signup_enabled) || closedMessage !== null;

  const setField = (name: keyof FormState, value: string) => {
    setForm((f) => ({ ...f, [name]: value }));
    if (errors[name]) setErrors((e) => ({ ...e, [name]: undefined }));
    if (name === 'email') setEmailTaken(null);
    setFormError(null);
  };

  const focusFirstError = (errs: FieldErrors) => {
    const first = fieldOrder.find((f) => errs[f]);
    if (first) inputRefs.current[first]?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const errs = validate(form);
    setErrors(errs);
    setFormError(null);
    setEmailTaken(null);
    if (Object.keys(errs).length > 0) {
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
        ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
        ...(planId ? { plan_id: planId } : {}),
      });
      const { user } = readData<{ user: User }>(res);
      toast.success(`Welcome to ${platformName}! Your workspace is ready.`);
      completeSignIn(user, navigate);
    } catch (err) {
      const status = apiErrorStatus(err);
      const message = apiErrorMessage(err, "We couldn't create your account. Please try again.");
      if (status === 409) {
        setEmailTaken(message);
        inputRefs.current.email?.focus();
      } else if (status === 403) {
        setClosedMessage(message);
      } else if (status === 400 && fieldForServerMessage(message)) {
        const field = fieldForServerMessage(message)!;
        setErrors({ [field]: message });
        focusFirstError({ [field]: message });
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
        <div className="mx-auto flex min-h-[60vh] max-w-md items-center px-4 py-16">
          <div className={cn(cardClass, 'w-full p-8 text-center')}>
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

  const passwordOk = form.password.length >= MIN_PASSWORD_LENGTH;

  return (
    <PublicShell headerActions={headerActions}>
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="mb-8 max-w-xl">
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl light:text-gray-900">
            {trialDays > 0 ? `Start your ${trialDays}-day free trial` : `Create your ${platformName} account`}
          </h1>
          <p className="mt-2 text-white/50 light:text-gray-500">
            Set up a workspace for your business in under a minute. No card needed.
          </p>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8">
          <form onSubmit={handleSubmit} noValidate className={cn(cardClass, 'p-6 sm:p-8')}>
            <div className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
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
                    autoFocus
                    disabled={submitting}
                    aria-invalid={!!errors.business_name || undefined}
                    aria-describedby={errors.business_name ? 'business_name-error' : undefined}
                    className={cn(inputClass, errors.business_name && errorInputClass)}
                  />
                </Field>
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
                    disabled={submitting}
                    aria-invalid={!!errors.full_name || undefined}
                    aria-describedby={errors.full_name ? 'full_name-error' : undefined}
                    className={cn(inputClass, errors.full_name && errorInputClass)}
                  />
                </Field>
              </div>

              <Field id="email" label="Work email" error={errors.email}>
                <Input
                  id="email"
                  type="email"
                  ref={(el) => {
                    inputRefs.current.email = el;
                  }}
                  value={form.email}
                  onChange={(e) => setField('email', e.target.value)}
                  placeholder="jane@acme.com"
                  autoComplete="email"
                  inputMode="email"
                  disabled={submitting}
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

              <Field id="phone" label="Phone" optional error={errors.phone}>
                <Input
                  id="phone"
                  type="tel"
                  ref={(el) => {
                    inputRefs.current.phone = el;
                  }}
                  value={form.phone}
                  onChange={(e) => setField('phone', e.target.value)}
                  placeholder="+1 555 123 4567"
                  autoComplete="tel"
                  inputMode="tel"
                  disabled={submitting}
                  aria-invalid={!!errors.phone || undefined}
                  aria-describedby={errors.phone ? 'phone-error' : undefined}
                  className={cn(inputClass, errors.phone && errorInputClass)}
                />
              </Field>

              <Field
                id="password"
                label="Password"
                error={errors.password}
                hint={
                  <span className={cn('inline-flex items-center gap-1', passwordOk && 'text-emerald-400 light:text-emerald-600')}>
                    {passwordOk && <Check className="h-3.5 w-3.5" />}
                    At least {MIN_PASSWORD_LENGTH} characters
                  </span>
                }
              >
                <PasswordInput
                  id="password"
                  ref={(el) => {
                    inputRefs.current.password = el;
                  }}
                  value={form.password}
                  onChange={(e) => setField('password', e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  disabled={submitting}
                  invalid={!!errors.password}
                  aria-describedby={errors.password ? 'password-error' : 'password-hint'}
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

              {formError && <FormAlert>{formError}</FormAlert>}

              <Button
                type="submit"
                disabled={submitting}
                className="h-11 w-full bg-emerald-600 text-base font-medium text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-500"
              >
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {submitting
                  ? 'Creating your workspace…'
                  : trialDays > 0
                    ? 'Start free trial'
                    : 'Create account'}
              </Button>

              <p className="text-center text-sm text-white/40 light:text-gray-500">
                Already have an account?{' '}
                <Link
                  to="/login"
                  className="font-medium text-emerald-400 underline-offset-4 hover:text-emerald-300 hover:underline light:text-emerald-600"
                >
                  Sign in
                </Link>
              </p>
            </div>
          </form>

          <div className="lg:sticky lg:top-6">
            <PlanSummary plan={selectedPlan} trialDays={trialDays} businessName={form.business_name} />
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
  const [chosenPlanId, setChosenPlanId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<UpgradeField, string>>>({});
  const [formError, setFormError] = useState<React.ReactNode>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRefs = useRef<Partial<Record<UpgradeField, HTMLElement | null>>>({});

  const branding = useBranding();
  const platformName = branding.platform_name;
  const plans = useMemo(() => info?.plans ?? [], [info]);
  const trialDays = info?.trial_days ?? 0;
  useDocumentTitle(`Get your own workspace · ${platformName}`);

  const initialPlanId = useInitialPlanId(info, plans);
  const planId = chosenPlanId ?? initialPlanId;
  const selectedPlan = plans.find((p) => p.id === planId) ?? null;
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
    if (phone.trim() && !PHONE_PATTERN.test(phone.trim()))
      errs.phone = 'Enter a valid phone number, or leave it empty';
    setErrors(errs);
    setFormError(null);
    if (Object.keys(errs).length > 0) {
      focusFirstError(errs);
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post('/subscribe', {
        business_name: businessName.trim(),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        ...(planId ? { plan_id: planId } : {}),
      });
      const { user } = readData<{ user: User }>(res);
      toast.success('Welcome to your new workspace');
      // Sets the new admin session, drops the demo org selection and opens the dashboard.
      completeSignIn(user, navigate);
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
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="mb-8 max-w-xl">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/[0.08] px-3 py-1 text-xs font-medium text-emerald-300 light:border-emerald-200 light:bg-emerald-50 light:text-emerald-700">
            <Rocket className="h-3.5 w-3.5" />
            Upgrade
          </span>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-white sm:text-3xl light:text-gray-900">
            Upgrade to your own workspace
          </h1>
          <p className="mt-2 text-white/50 light:text-gray-500">
            {trialDays > 0 ? `Start your ${trialDays}-day free trial` : 'Set up your business'} and keep your login
            {email ? (
              <>
                {' '}
                (<span className="text-white/75 light:text-gray-800">{email}</span>)
              </>
            ) : null}
            . You'll leave the demo and land in a fresh workspace of your own.
          </p>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8">
          <form onSubmit={handleSubmit} noValidate className={cn(cardClass, 'p-6 sm:p-8')}>
            <div className="space-y-5">
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
                <Input
                  id="phone"
                  type="tel"
                  ref={(el) => {
                    inputRefs.current.phone = el;
                  }}
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    setErrors((er) => ({ ...er, phone: undefined }));
                    setFormError(null);
                  }}
                  placeholder="+1 555 123 4567"
                  autoComplete="tel"
                  inputMode="tel"
                  disabled={submitting || upgradeClosed}
                  aria-invalid={!!errors.phone || undefined}
                  aria-describedby={errors.phone ? 'phone-error' : undefined}
                  className={cn(inputClass, errors.phone && errorInputClass)}
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

              {formError && <FormAlert>{formError}</FormAlert>}

              <Button
                type="submit"
                disabled={submitting || upgradeClosed}
                className="h-11 w-full bg-emerald-600 text-base font-medium text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-500"
              >
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {submitting
                  ? 'Creating your workspace…'
                  : trialDays > 0
                    ? 'Start free trial'
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

          <div className="lg:sticky lg:top-6">
            <PlanSummary plan={selectedPlan} trialDays={trialDays} businessName={businessName} />
          </div>
        </div>
      </div>
    </PublicShell>
  );
};

export default SignupView;
