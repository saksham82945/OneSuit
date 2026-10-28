import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Building2, Check, Link2Off, Loader2, Lock } from 'lucide-react';
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
  isValidEmail,
  useDocumentTitle,
} from './publicApi';
import { BrandMark, Field, FormAlert, PasswordInput, cardClass, errorInputClass, inputClass } from './PublicLayout';

interface PublicInvite {
  organization_name: string;
  role_name: string;
  /** '' = anyone with the link can use it. */
  email: string;
  expires_at: string;
}

type Mode = 'new' | 'existing';
type FieldName = 'full_name' | 'email' | 'password';
type FieldErrors = Partial<Record<FieldName, string>>;

/** A follow-up action shown inside the form error. */
type ErrorAction = 'switch-existing' | 'switch-new' | 'sign-in' | null;

function formatExpiry(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const ms = date.getTime() - Date.now();
  if (ms <= 0) return null;
  const hours = Math.round(ms / 3_600_000);
  if (hours < 1) return 'Expires in less than an hour';
  if (hours < 48) return `Expires in ${hours} hour${hours === 1 ? '' : 's'}`;
  return `Expires ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

const Frame: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="relative min-h-screen flex items-center justify-center bg-[#0a0a0b] light:bg-gradient-to-br light:from-gray-50 light:to-gray-100 p-4 overflow-hidden">
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(16,185,129,0.10),transparent)]"
    />
    <div className="relative w-full max-w-md">{children}</div>
  </div>
);

export const JoinView: React.FC = () => {
  const { token = '' } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [invite, setInvite] = useState<PublicInvite | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** true when the link itself is bad (404); false for network/server trouble. */
  const [linkInvalid, setLinkInvalid] = useState(false);
  const [loading, setLoading] = useState(true);

  const [mode, setMode] = useState<Mode>('new');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<{ message: string; action: ErrorAction } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const orgName = invite?.organization_name || 'the team';
  const { platform_name: platformName } = useBranding();
  useDocumentTitle(invite ? `Join ${invite.organization_name} · ${platformName}` : `Join · ${platformName}`);

  const loadInvite = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api.get(`/public/invites/${encodeURIComponent(token)}`);
      const data = readData<PublicInvite>(res);
      setInvite(data);
      if (data.email) setEmail(data.email);
    } catch (err) {
      const status = apiErrorStatus(err);
      const invalid = status === 404 || status === 400;
      setLinkInvalid(invalid);
      setLoadError(
        invalid
          ? apiErrorMessage(err, 'This invite link is invalid, has expired, or has already been used.')
          : "We couldn't check this invite link right now. Please try again in a moment."
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadInvite();
  }, [loadInvite]);

  const lockedEmail = !!invite?.email;
  // Built-in roles come back lowercase ("agent"); show them capitalized.
  const roleName = invite?.role_name ? invite.role_name.charAt(0).toUpperCase() + invite.role_name.slice(1) : '';

  const switchMode = (next: Mode) => {
    setMode(next);
    setErrors({});
    setFormError(null);
    setPassword('');
    // Focus the first editable field of the new mode once it renders.
    requestAnimationFrame(() => {
      if (next === 'new') nameRef.current?.focus();
      else if (lockedEmail || email) passwordRef.current?.focus();
      else emailRef.current?.focus();
    });
  };

  const validate = (): FieldErrors => {
    const errs: FieldErrors = {};
    if (mode === 'new' && !fullName.trim()) errs.full_name = 'Enter your name';
    if (!email.trim()) errs.email = 'Enter your email';
    else if (!isValidEmail(email)) errs.email = 'Enter a valid email address';
    if (mode === 'new' && password.length < MIN_PASSWORD_LENGTH)
      errs.password = `Use at least ${MIN_PASSWORD_LENGTH} characters`;
    if (mode === 'existing' && !password) errs.password = 'Enter your password';
    return errs;
  };

  const focusFirst = (errs: FieldErrors) => {
    if (errs.full_name) nameRef.current?.focus();
    else if (errs.email) emailRef.current?.focus();
    else if (errs.password) passwordRef.current?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const errs = validate();
    setErrors(errs);
    setFormError(null);
    if (Object.keys(errs).length > 0) {
      focusFirst(errs);
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post('/auth/accept-invite', {
        token,
        full_name: mode === 'new' ? fullName.trim() : '',
        email: email.trim(),
        password,
      });
      const { user } = readData<{ user: User }>(res);
      toast.success(`You've joined ${orgName}`);
      completeSignIn(user, navigate);
    } catch (err) {
      const status = apiErrorStatus(err);
      const message = apiErrorMessage(err, "We couldn't add you to the organization. Please try again.");
      if (status === 404) {
        // The link went stale while the page was open.
        setInvite(null);
        setLinkInvalid(true);
        setLoadError(message);
      } else if (status === 401) {
        if (mode === 'new') {
          // The email already has an account: they need to use its password.
          setFormError({ message, action: 'switch-existing' });
        } else {
          if (/disabled/i.test(message)) {
            setFormError({ message, action: null });
          } else {
            setErrors({ password: 'Wrong password for this account' });
            passwordRef.current?.select();
          }
        }
      } else if (status === 409) {
        setFormError({ message, action: message.toLowerCase().includes('member') ? 'sign-in' : null });
      } else if (status === 400 && mode === 'existing' && /your name is required/i.test(message)) {
        // No account exists for this email: the backend wants a name for a new one.
        setFormError({
          message: "We couldn't find an account with this email.",
          action: 'switch-new',
        });
      } else if (status === 400 && /password/i.test(message)) {
        setErrors({ password: message });
        passwordRef.current?.focus();
      } else if (status === 400 && /email/i.test(message)) {
        setErrors({ email: message });
        emailRef.current?.focus();
      } else if (status === 400 && /name/i.test(message)) {
        setErrors({ full_name: message });
        nameRef.current?.focus();
      } else if (status === 429) {
        setFormError({ message: 'Too many attempts. Please wait a minute and try again.', action: null });
      } else {
        setFormError({ message, action: null });
      }
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Frame>
        <div className={cn(cardClass, 'flex flex-col items-center gap-3 p-10 text-white/50 light:text-gray-500')}>
          <Loader2 className="h-6 w-6 animate-spin" />
          <p className="text-sm">Checking your invite…</p>
        </div>
      </Frame>
    );
  }

  if (!invite) {
    return (
      <Frame>
        <div className={cn(cardClass, 'p-8 text-center')}>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10 light:bg-amber-50">
            <Link2Off className="h-6 w-6 text-amber-400 light:text-amber-600" />
          </div>
          <h1 className="text-xl font-semibold text-white light:text-gray-900">
            {linkInvalid ? "This invite can't be used" : "We couldn't load this invite"}
          </h1>
          <p className="mt-2 text-sm text-white/50 light:text-gray-500">{loadError}</p>
          <div className="mt-6 space-y-2">
            <Button asChild className="w-full bg-emerald-600 text-white hover:bg-emerald-500 shadow-md shadow-emerald-600/20">
              <Link to="/login">Go to sign in</Link>
            </Button>
            {!linkInvalid && (
              <Button
                variant="ghost"
                className="w-full text-white/60 hover:bg-white/[0.04] hover:text-white light:text-gray-600 light:hover:bg-gray-100 light:hover:text-gray-900"
                onClick={() => void loadInvite()}
              >
                Try again
              </Button>
            )}
          </div>
        </div>
      </Frame>
    );
  }

  const expiry = formatExpiry(invite.expires_at);
  const passwordOk = password.length >= MIN_PASSWORD_LENGTH;

  return (
    <Frame>
      <div className={cardClass}>
        <div className="px-8 pt-8 pb-6 text-center">
          <div className="mb-5 flex items-center justify-center gap-3">
            <BrandMark className="h-11 w-11" iconClassName="h-6 w-6" />
            <span className="h-px w-6 bg-white/[0.12] light:bg-gray-300" aria-hidden />
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] light:border-gray-200 light:bg-gray-50">
              <Building2 className="h-5 w-5 text-white/70 light:text-gray-600" />
            </div>
          </div>
          <p className="text-xs font-medium uppercase tracking-wider text-emerald-400/80 light:text-emerald-600">
            You're invited
          </p>
          <h1 className="mt-2 text-2xl font-bold text-white light:text-gray-900 break-words">
            Join {invite.organization_name}
            {roleName && (
              <>
                {' '}
                <span className="font-normal text-white/40 light:text-gray-400">as</span> {roleName}
              </>
            )}
          </h1>
          {expiry && <p className="mt-2 text-xs text-white/40 light:text-gray-500">{expiry}</p>}
        </div>

        <div className="px-8">
          <div
            role="group"
            aria-label="Do you have an account?"
            className="grid grid-cols-2 gap-1 rounded-lg border border-white/[0.08] bg-white/[0.02] p-1 light:border-gray-200 light:bg-gray-100"
          >
            {(
              [
                ['new', "I'm new here"],
                ['existing', 'I already have an account'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={mode === value}
                onClick={() => mode !== value && switchMode(value)}
                disabled={submitting}
                className={cn(
                  'rounded-md px-2 py-2 text-xs font-medium leading-tight transition-colors sm:text-sm',
                  mode === value
                    ? 'bg-white/[0.08] text-white shadow-sm light:bg-white light:text-gray-900'
                    : 'text-white/50 hover:text-white/80 light:text-gray-500 light:hover:text-gray-800'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4 px-8 pt-6 pb-8">
          {mode === 'new' && (
            <Field id="full_name" label="Your name" error={errors.full_name}>
              <Input
                id="full_name"
                ref={nameRef}
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  setErrors((er) => ({ ...er, full_name: undefined }));
                }}
                placeholder="Jane Doe"
                autoComplete="name"
                autoFocus
                disabled={submitting}
                aria-invalid={!!errors.full_name || undefined}
                aria-describedby={errors.full_name ? 'full_name-error' : undefined}
                className={cn(inputClass, errors.full_name && errorInputClass)}
              />
            </Field>
          )}

          <Field
            id="email"
            label="Email"
            error={errors.email}
            hint={lockedEmail ? 'This invite is for this email address.' : undefined}
          >
            <div className="relative">
              <Input
                id="email"
                type="email"
                ref={emailRef}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setErrors((er) => ({ ...er, email: undefined }));
                  setFormError(null);
                }}
                readOnly={lockedEmail}
                placeholder="you@company.com"
                autoComplete={mode === 'new' ? 'email' : 'username'}
                inputMode="email"
                autoFocus={mode === 'existing' && !lockedEmail}
                disabled={submitting}
                aria-invalid={!!errors.email || undefined}
                aria-describedby={errors.email ? 'email-error' : lockedEmail ? 'email-hint' : undefined}
                className={cn(
                  inputClass,
                  lockedEmail && 'pr-9 text-white/60 cursor-not-allowed light:text-gray-500 light:bg-gray-50',
                  errors.email && errorInputClass
                )}
              />
              {lockedEmail && (
                <Lock
                  className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30 light:text-gray-400"
                  aria-hidden
                />
              )}
            </div>
          </Field>

          <Field
            id="password"
            label={mode === 'new' ? 'Create a password' : 'Password'}
            error={errors.password}
            hint={
              mode === 'new' ? (
                <span
                  className={cn('inline-flex items-center gap-1', passwordOk && 'text-emerald-400 light:text-emerald-600')}
                >
                  {passwordOk && <Check className="h-3.5 w-3.5" />}
                  At least {MIN_PASSWORD_LENGTH} characters
                </span>
              ) : (
                'The password you already use to sign in.'
              )
            }
          >
            <PasswordInput
              id="password"
              ref={passwordRef}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setErrors((er) => ({ ...er, password: undefined }));
              }}
              placeholder="••••••••"
              autoComplete={mode === 'new' ? 'new-password' : 'current-password'}
              autoFocus={mode === 'existing' && lockedEmail}
              disabled={submitting}
              invalid={!!errors.password}
              aria-describedby={errors.password ? 'password-error' : 'password-hint'}
            />
          </Field>

          {formError && (
            <FormAlert>
              <p>{formError.message}</p>
              {formError.action === 'switch-existing' && (
                <button
                  type="button"
                  onClick={() => switchMode('existing')}
                  className="font-medium text-white underline underline-offset-2 hover:text-emerald-300 light:text-red-800"
                >
                  Sign in with that account instead →
                </button>
              )}
              {formError.action === 'switch-new' && (
                <button
                  type="button"
                  onClick={() => switchMode('new')}
                  className="font-medium text-white underline underline-offset-2 hover:text-emerald-300 light:text-red-800"
                >
                  Create a new account instead →
                </button>
              )}
              {formError.action === 'sign-in' && (
                <Link
                  to="/login"
                  className="inline-block font-medium text-white underline underline-offset-2 hover:text-emerald-300 light:text-red-800"
                >
                  Go to sign in →
                </Link>
              )}
            </FormAlert>
          )}

          <Button
            type="submit"
            disabled={submitting}
            className="h-10 w-full bg-emerald-600 font-medium text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-500"
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === 'new' ? `Create account & join` : `Sign in & join`}
          </Button>

          <p className="text-center text-xs text-white/35 light:text-gray-500">
            {mode === 'new'
              ? `You'll be added to ${invite.organization_name} right away.`
              : `${invite.organization_name} will be added to your account.`}
          </p>
        </form>
      </div>

      <p className="mt-6 text-center text-sm text-white/40 light:text-gray-500">
        Not expecting this invite?{' '}
        <Link to="/login" className="font-medium text-emerald-400 underline-offset-4 hover:text-emerald-300 hover:underline">
          Go to sign in
        </Link>
      </p>
    </Frame>
  );
};

export default JoinView;
