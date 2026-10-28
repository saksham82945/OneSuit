import React, { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowRight,
  Check,
  Compass,
  Eye,
  FileText,
  Loader2,
  Lock,
  Megaphone,
  MessageSquare,
  Rocket,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  isExplorer,
  isValidEmail,
  useDocumentTitle,
  usePublicPlans,
  useSignedInUser,
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

type FieldName = 'full_name' | 'email' | 'password';
type FieldErrors = Partial<Record<FieldName, string>>;
type FormState = Record<FieldName, string>;

const fieldOrder: FieldName[] = ['full_name', 'email', 'password'];

function validate(form: FormState): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.full_name.trim()) errors.full_name = 'Enter your name';
  if (!form.email.trim()) errors.email = 'Enter your email';
  else if (!isValidEmail(form.email)) errors.email = 'Enter a valid email address';
  if (form.password.length < MIN_PASSWORD_LENGTH)
    errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters`;
  return errors;
}

/** Server validation messages that belong to one field. */
function fieldForServerMessage(message: string): FieldName | null {
  const m = message.toLowerCase();
  if (m.includes('name')) return 'full_name';
  if (m.includes('email')) return 'email';
  if (m.includes('password')) return 'password';
  return null;
}

const demoContents = [
  { icon: MessageSquare, title: 'Sample chats', text: 'A shared inbox with real-looking customer conversations.' },
  { icon: Users, title: 'Contacts', text: 'Tagged contacts, notes and conversation history.' },
  { icon: FileText, title: 'Templates', text: 'Approved WhatsApp message templates, ready to browse.' },
  { icon: Megaphone, title: 'Campaigns', text: 'Broadcasts with delivery and read stats.' },
];

/** Centered notice card (exploring off, already exploring). */
const NoticeCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  actions: React.ReactNode;
}> = ({ icon, title, children, actions }) => (
  <div className="mx-auto flex min-h-[60vh] max-w-md items-center px-4 py-16">
    <div className={cn(cardClass, 'w-full p-8 text-center')}>
      <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 light:bg-emerald-50">
        {icon}
      </div>
      <h1 className="text-xl font-semibold text-white light:text-gray-900">{title}</h1>
      <div className="mt-2 text-sm text-white/50 light:text-gray-500">{children}</div>
      <div className="mt-6 flex flex-col gap-2">{actions}</div>
    </div>
  </div>
);

const primaryButtonClass = 'w-full bg-emerald-600 text-white hover:bg-emerald-500';
const secondaryButtonClass =
  'w-full border border-white/[0.1] bg-white/[0.04] text-white hover:bg-white/[0.08] light:border-gray-200 light:bg-white light:text-gray-900 light:hover:bg-gray-50';
const textLinkClass =
  'font-medium text-emerald-400 underline-offset-4 hover:text-emerald-300 hover:underline light:text-emerald-600';

export const ExploreView: React.FC = () => {
  const navigate = useNavigate();
  const { info, loading } = usePublicPlans();
  const signedInUser = useSignedInUser();

  const [form, setForm] = useState<FormState>({ full_name: '', email: '', password: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [emailTaken, setEmailTaken] = useState<string | null>(null);
  const [closedMessage, setClosedMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRefs = useRef<Partial<Record<FieldName, HTMLElement | null>>>({});

  const branding = useBranding();
  const platformName = branding.platform_name;
  const trialDays = info?.trial_days ?? 0;
  useDocumentTitle(`Explore ${platformName} free`);

  const setField = (name: FieldName, value: string) => {
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
      const res = await api.post('/auth/explore', {
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        password: form.password,
      });
      const { user } = readData<{ user: User }>(res);
      toast.success('Welcome! Have a look around the demo workspace.');
      completeSignIn(user, navigate);
    } catch (err) {
      const status = apiErrorStatus(err);
      const message = apiErrorMessage(err, "We couldn't open the demo. Please try again.");
      const field = status === 400 ? fieldForServerMessage(message) : null;
      if (status === 409) {
        setEmailTaken(message);
        inputRefs.current.email?.focus();
      } else if (status === 403 && /csrf/i.test(message)) {
        // A stale session cookie from an earlier login, not a closed demo.
        setFormError('Something from an earlier session got in the way. Sign out in your other tabs, refresh and try again.');
      } else if (status === 403) {
        setClosedMessage(message);
      } else if (field) {
        setErrors({ [field]: message });
        focusFirstError({ [field]: message });
      } else if (status === 429) {
        setFormError('Too many attempts. Please wait a minute and try again.');
      } else if (status === 503) {
        setFormError(`${message} You can still compare plans or start a free trial.`);
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

  // Already looking around: no need for a second demo account.
  if (isExplorer(signedInUser)) {
    return (
      <PublicShell headerActions={headerActions}>
        <NoticeCard
          icon={<Compass className="h-5 w-5 text-emerald-400 light:text-emerald-600" />}
          title="You're already exploring"
          actions={
            <>
              <Button asChild className={primaryButtonClass}>
                <Link to="/">Back to the demo workspace</Link>
              </Button>
              <Button asChild className={secondaryButtonClass}>
                <Link to="/pricing">Choose a plan</Link>
              </Button>
            </>
          }
        >
          You're signed in as <span className="text-white/80 light:text-gray-800">{signedInUser?.email}</span>. Pick
          up where you left off, or choose a plan to get your own workspace.
        </NoticeCard>
      </PublicShell>
    );
  }

  const exploreClosed = (info && !info.explore_enabled) || closedMessage !== null;
  if (exploreClosed) {
    return (
      <PublicShell headerActions={headerActions}>
        <NoticeCard
          icon={<Lock className="h-5 w-5 text-emerald-400 light:text-emerald-600" />}
          title="The demo isn't available right now"
          actions={
            <>
              <Button asChild className={primaryButtonClass}>
                <Link to="/pricing">
                  {info?.signup_enabled && trialDays > 0 ? `See plans · ${trialDays}-day free trial` : 'See plans'}
                </Link>
              </Button>
              <Button asChild className={secondaryButtonClass}>
                <Link to="/login">Sign in</Link>
              </Button>
            </>
          }
        >
          {closedMessage ?? 'Exploring without a plan is turned off at the moment.'}
          {branding.support_email && (
            <>
              {' '}
              Questions? Contact{' '}
              <a href={`mailto:${branding.support_email}`} className="text-emerald-400 hover:text-emerald-300 light:text-emerald-600">
                {branding.support_email}
              </a>
              .
            </>
          )}
        </NoticeCard>
      </PublicShell>
    );
  }

  const passwordOk = form.password.length >= MIN_PASSWORD_LENGTH;

  return (
    <PublicShell headerActions={headerActions}>
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        {/* Phones: intro, form, details. Desktop: intro + details left, form right. */}
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:grid-rows-[auto_1fr] lg:gap-x-12">
          <section className="lg:col-start-1 lg:row-start-1 lg:pt-4">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/[0.08] px-3 py-1 text-xs font-medium text-emerald-300 light:border-emerald-200 light:bg-emerald-50 light:text-emerald-700">
              <Compass className="h-3.5 w-3.5" />
              Free demo
            </span>
            <h1 className="mt-5 text-3xl font-bold tracking-tight text-white sm:text-4xl light:text-gray-900">
              Explore {platformName} free{' '}
              <span className="block bg-gradient-to-r from-emerald-300 to-green-400 bg-clip-text text-transparent light:from-emerald-600 light:to-green-600">
                no plan, no card
              </span>
            </h1>
            <p className="mt-4 max-w-lg text-base text-white/50 sm:text-lg light:text-gray-500">
              Look around a demo workspace filled with sample data and see how your team would work before you
              choose a plan.
            </p>
          </section>

          {/* Form */}
          <form
            onSubmit={handleSubmit}
            noValidate
            className={cn(cardClass, 'p-6 sm:p-8 lg:col-start-2 lg:row-span-2 lg:row-start-1')}
          >
            <h2 className="text-lg font-semibold text-white light:text-gray-900">Open the demo</h2>
            <p className="mt-1 text-sm text-white/50 light:text-gray-500">
              Create a free login. It takes a few seconds.
            </p>

            <div className="mt-6 space-y-5">
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
                  autoFocus
                  disabled={submitting}
                  aria-invalid={!!errors.full_name || undefined}
                  aria-describedby={errors.full_name ? 'full_name-error' : undefined}
                  className={cn(inputClass, errors.full_name && errorInputClass)}
                />
              </Field>

              <Field id="email" label="Email" error={errors.email}>
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
                    Sign in instead →
                  </Link>
                </FormAlert>
              )}

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

              {formError && <FormAlert>{formError}</FormAlert>}

              <Button
                type="submit"
                disabled={submitting}
                className="h-11 w-full bg-emerald-600 text-base font-medium text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-500"
              >
                {submitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {submitting ? 'Opening the demo…' : 'Explore the demo'}
                {!submitting && <ArrowRight className="ml-2 h-4 w-4" />}
              </Button>

              <div className="space-y-1.5 border-t border-white/[0.06] pt-5 text-center text-sm text-white/40 light:border-gray-100 light:text-gray-500">
                {info?.signup_enabled && (
                  <p>
                    Ready to set up your business?{' '}
                    <Link to="/pricing" className={textLinkClass}>
                      {trialDays > 0 ? 'Start a free trial' : 'See plans'}
                    </Link>
                  </p>
                )}
                <p>
                  Already have an account?{' '}
                  <Link to="/login" className={textLinkClass}>
                    Sign in
                  </Link>
                </p>
              </div>
            </div>
          </form>

          {/* What you get */}
          <section className="lg:col-start-1 lg:row-start-2">

            <ul className="grid gap-3 sm:grid-cols-2">
              {demoContents.map(({ icon: Icon, title, text }) => (
                <li
                  key={title}
                  className="flex gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5 light:border-gray-200 light:bg-white"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 light:bg-emerald-50">
                    <Icon className="h-4 w-4 text-emerald-400 light:text-emerald-600" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-white light:text-gray-900">{title}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-white/45 light:text-gray-500">{text}</span>
                  </span>
                </li>
              ))}
            </ul>

            <dl className="mt-6 space-y-3 text-sm">
              <div className="flex gap-3">
                <Eye className="mt-0.5 h-4 w-4 shrink-0 text-white/40 light:text-gray-400" />
                <div>
                  <dt className="inline font-medium text-white/80 light:text-gray-800">View-only. </dt>
                  <dd className="inline text-white/50 light:text-gray-500">
                    Open anything you like; changes are turned off so the demo stays the same for everyone.
                  </dd>
                </div>
              </div>
              <div className="flex gap-3">
                <Rocket className="mt-0.5 h-4 w-4 shrink-0 text-white/40 light:text-gray-400" />
                <div>
                  <dt className="inline font-medium text-white/80 light:text-gray-800">Upgrade anytime. </dt>
                  <dd className="inline text-white/50 light:text-gray-500">
                    Choose a plan when you're ready and get your own workspace with the same login
                    {trialDays > 0 ? `, starting with a ${trialDays}-day free trial` : ''}.
                  </dd>
                </div>
              </div>
            </dl>
          </section>

        </div>
      </div>
    </PublicShell>
  );
};

export default ExploreView;
