import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/services/api';
import { readData } from '@/services/response';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useBrandedTitle, useBranding } from '@/services/branding';
import {
  BrandMark,
  FormAlert,
  PasswordInput,
  PublicTopBar,
  errorInputClass,
  inputClass,
} from '@/views/public/PublicLayout';
import { apiErrorMessage, apiErrorStatus, isValidEmail } from '@/views/public/publicApi';
import { cn } from '@/lib/utils';
import { AuthBackdrop } from './AuthBackdrop';
import { AuthShowcase } from './AuthShowcase';
import { CapsLockHint, ForgotPasswordDialog } from './AuthFormBits';
import { useCapsLock } from './authHooks';

interface SSOProvider {
  provider: string;
  name: string;
}

/** Brand mark for a sign-in provider button. */
const ProviderIcon: React.FC<{ provider: string }> = ({ provider }) =>
  provider === 'google' ? (
    <svg viewBox="0 0 24 24" className="mr-2 h-4 w-4" aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.3-1.6 3.8-5.4 3.8-3.2 0-5.9-2.7-5.9-6s2.7-6 5.9-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.4 14.6 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z" />
    </svg>
  ) : provider === 'facebook' ? (
    <svg viewBox="0 0 24 24" className="mr-2 h-4 w-4" fill="#1877F2" aria-hidden>
      <path d="M24 12.07C24 5.41 18.63 0 12 0S0 5.41 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z" />
    </svg>
  ) : null;

/** Where "Remember me" keeps the last email. Only the email: the session itself is the server's call. */
export const REMEMBER_EMAIL_KEY = 'auth.remembered_email';

function readRememberedEmail(): string {
  try {
    return localStorage.getItem(REMEMBER_EMAIL_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveRememberedEmail(email: string | null) {
  try {
    if (email) localStorage.setItem(REMEMBER_EMAIL_KEY, email);
    else localStorage.removeItem(REMEMBER_EMAIL_KEY);
  } catch {
    // Storage blocked (private mode): nothing to remember.
  }
}

type LoginField = 'email' | 'password';

const QUICK_LOGINS = [
  { label: 'Super Admin', email: 'superadmin@login.com' },
  { label: 'Admin', email: 'admin@login.com' },
  { label: 'Manager', email: 'manager@login.com' },
  { label: 'Explorer', email: 'explorer@login.com' },
];

const linkClass =
  'rounded-sm text-emerald-400 hover:text-emerald-300 light:text-emerald-600 light:hover:text-emerald-700 font-medium underline-offset-4 hover:underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60';

const FieldError: React.FC<{ id: string; message?: string }> = ({ id, message }) =>
  message ? (
    <p id={id} className="mt-1.5 flex items-center gap-1.5 text-xs text-red-400 light:text-red-600">
      <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {message}
    </p>
  ) : null;

export const LoginView: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useAuthStore();

  const [rememberedEmail] = useState(readRememberedEmail);
  const [email, setEmail] = useState(rememberedEmail);
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(!!rememberedEmail);
  const [errors, setErrors] = useState<Partial<Record<LoginField, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  // Briefly shakes the card after a failed attempt (purely visual).
  const [shake, setShake] = useState(false);
  const [ssoProviders, setSsoProviders] = useState<SSOProvider[]>([]);
  const { platform_name: platformName } = useBranding();
  const [exploreEnabled, setExploreEnabled] = useState(false);
  const { capsLock, handlers: capsHandlers } = useCapsLock();
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  useBrandedTitle('Sign in');

  useEffect(() => {
    api
      .get('/public/plans')
      .then((res) => {
        const data = readData<{ explore_enabled?: boolean }>(res);
        setExploreEnabled(data?.explore_enabled === true);
      })
      .catch(() => {
        // Leave the demo link hidden.
      });
  }, []);

  useEffect(() => {
    const ssoError = searchParams.get('sso_error');
    if (ssoError) {
      toast.error(decodeURIComponent(ssoError));
    }

    api
      .get('/auth/sso/providers')
      .then((res) => {
        setSsoProviders(res.data.data || []);
      })
      .catch(() => {
        setSsoProviders([]);
      });
  }, [searchParams]);

  const emailError = (value: string) => {
    if (!value.trim()) return t('auth.enterEmail', 'Enter your email');
    if (!isValidEmail(value)) return t('auth.invalidEmail', 'Enter a valid email address');
    return undefined;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    const errs: Partial<Record<LoginField, string>> = {};
    const emailErr = emailError(email);
    if (emailErr) errs.email = emailErr;
    if (!password) errs.password = t('auth.enterPassword', 'Enter your password');
    setErrors(errs);
    setFormError(null);
    if (errs.email || errs.password) {
      setShake(true);
      if (errs.email) emailRef.current?.focus();
      else passwordRef.current?.focus();
      return;
    }

    setIsLoading(true);

    try {
      await login(email.trim(), password);
      saveRememberedEmail(remember ? email.trim() : null);
      toast.success(t('auth.loginSuccess') || 'Logged in successfully');
      const redirect = searchParams.get('redirect');
      navigate(redirect || '/');
    } catch (error) {
      const status = apiErrorStatus(error);
      const fallback = t('auth.invalidCredentials') || 'Invalid email or password';
      const message =
        status === 429
          ? t('auth.tooManyAttempts', 'Too many attempts. Please wait a minute and try again.')
          : !status
            ? t('auth.networkError', "We couldn't reach the server. Check your connection and try again.")
            : apiErrorMessage(error, fallback);
      setFormError(message);
      if (status === 401) {
        setErrors({ password: ' ' });
        passwordRef.current?.select();
      }
      setShake(true);
    } finally {
      setIsLoading(false);
    }
  };

  const initiateSSO = (provider: string) => {
    const basePath = ((window as Window & { __BASE_PATH__?: string }).__BASE_PATH__ ?? '').replace(/\/$/, '');
    window.location.href = `${basePath}/api/auth/sso/${provider}/init`;
  };

  const passwordDescribedBy =
    [errors.password?.trim() ? 'password-error' : '', capsLock ? 'password-caps' : ''].filter(Boolean).join(' ') ||
    undefined;

  return (
    <div className="auth-motion relative min-h-screen overflow-hidden bg-[#0a0a0b] light:bg-gradient-to-br light:from-gray-50 light:to-gray-100">
      <AuthBackdrop />
      <PublicTopBar />
      <div className="relative z-10 mx-auto grid min-h-screen w-full max-w-6xl items-center gap-12 px-4 pb-10 pt-16 sm:px-6 lg:grid-cols-[minmax(0,1fr)_440px] lg:gap-16 lg:px-8">
        <AuthShowcase platformName={platformName} className="hidden lg:block" />

        {/* Entrance and shake live on separate elements so the shake never replays the entrance. */}
        <div className="auth-enter mx-auto w-full max-w-md">
          <div
            className={cn(
              'w-full rounded-2xl border border-white/[0.08] bg-[#111113]/80 backdrop-blur-xl shadow-2xl shadow-black/40 light:bg-white/85 light:border-gray-200 light:shadow-xl light:shadow-emerald-900/5',
              shake && 'auth-shake'
            )}
            onAnimationEnd={(e) => {
              if (e.animationName === 'auth-shake') setShake(false);
            }}
          >
            <div className="auth-stagger p-6 sm:p-8 space-y-1 text-center" style={{ '--auth-base-delay': '80ms' } as React.CSSProperties}>
              <div className="flex flex-col items-center gap-2 mb-4">
                <div className="auth-halo rounded-xl">
                  <BrandMark className="h-12 w-12" iconClassName="h-7 w-7" />
                </div>
                <span className="text-sm font-semibold tracking-tight text-white/80 light:text-gray-700">{platformName}</span>
              </div>
              <h1 className="text-2xl font-bold text-white light:text-gray-900">
                {t('auth.welcomeTitle') || 'Welcome back'}
              </h1>
              <p className="text-white/50 light:text-gray-500">
                {t('auth.welcomeSubtitle') || `Sign in to access your ${platformName} workspace`}
              </p>
            </div>

            <form onSubmit={handleLogin} noValidate aria-label="Sign in">
              <div className="auth-stagger px-6 sm:px-8 pb-4 space-y-4" style={{ '--auth-base-delay': '240ms' } as React.CSSProperties}>
                <div>
                  <label htmlFor="email" className="mb-2 block text-sm font-medium text-white/70 light:text-gray-700">
                    {t('common.email') || 'Email'}
                  </label>
                  <Input
                    id="email"
                    ref={emailRef}
                    type="email"
                    name="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (errors.email) setErrors((er) => ({ ...er, email: undefined }));
                      setFormError(null);
                    }}
                    onBlur={() => {
                      // Only nag about the format once something was typed.
                      if (email.trim() && !isValidEmail(email)) setErrors((er) => ({ ...er, email: emailError(email) }));
                    }}
                    placeholder="you@company.com"
                    disabled={isLoading}
                    autoComplete="username"
                    inputMode="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    autoFocus={!rememberedEmail}
                    required
                    aria-invalid={!!errors.email || undefined}
                    aria-describedby={errors.email ? 'email-error' : undefined}
                    className={cn(inputClass, errors.email && errorInputClass)}
                  />
                  <FieldError id="email-error" message={errors.email} />
                </div>
                <div>
                  <label htmlFor="password" className="mb-2 block text-sm font-medium text-white/70 light:text-gray-700">
                    {t('auth.password') || 'Password'}
                  </label>
                  <PasswordInput
                    id="password"
                    ref={passwordRef}
                    name="password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (errors.password) setErrors((er) => ({ ...er, password: undefined }));
                      setFormError(null);
                    }}
                    {...capsHandlers}
                    placeholder="••••••••"
                    disabled={isLoading}
                    autoComplete="current-password"
                    autoFocus={!!rememberedEmail}
                    required
                    invalid={!!errors.password}
                    aria-describedby={passwordDescribedBy}
                  />
                  <FieldError id="password-error" message={errors.password?.trim() || undefined} />
                  <CapsLockHint id="password-caps" show={capsLock} />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <label
                    className="flex w-fit cursor-pointer select-none items-center gap-2 text-sm text-white/60 light:text-gray-600"
                    title="Keeps your email filled in next time on this device"
                  >
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                      disabled={isLoading}
                      className="h-4 w-4 cursor-pointer rounded accent-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
                    />
                    {t('auth.rememberMe', 'Remember me')}
                  </label>
                  <button type="button" onClick={() => setForgotOpen(true)} className={cn(linkClass, 'text-sm')}>
                    {t('auth.forgotPassword', 'Forgot password?')}
                  </button>
                </div>

                {formError && <FormAlert>{formError}</FormAlert>}

                <Button
                  type="submit"
                  className="auth-cta h-10 w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-md shadow-emerald-600/20"
                  disabled={isLoading}
                  aria-busy={isLoading || undefined}
                >
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                  {isLoading ? t('auth.signingIn', 'Signing in…') : t('auth.signIn') || 'Sign In'}
                </Button>

                {/* Quick Demo Credentials */}
                <div className="pt-2">
                  <div className="flex items-center justify-between text-xs text-white/50 light:text-gray-500 mb-2">
                    <span className="font-semibold uppercase tracking-wider text-[11px] text-emerald-400 light:text-emerald-600">
                      Quick Logins
                    </span>
                    <span className="text-[11px] text-white/40 light:text-gray-400">Password: <code className="bg-white/10 light:bg-gray-200 px-1 py-0.5 rounded font-mono text-[10px]">admin123</code></span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {QUICK_LOGINS.map((cred) => (
                      <button
                        key={cred.email}
                        type="button"
                        disabled={isLoading}
                        aria-pressed={email === cred.email}
                        onClick={() => {
                          setEmail(cred.email);
                          setPassword('admin123');
                          setErrors({});
                          setFormError(null);
                        }}
                        className={cn(
                          'auth-lift text-left p-2 rounded-lg border text-xs cursor-pointer disabled:cursor-not-allowed disabled:opacity-60',
                          email === cred.email
                            ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300 light:text-emerald-700 light:bg-emerald-50 shadow-xs'
                            : 'border-white/10 bg-white/[0.02] text-white/70 hover:border-emerald-500/40 hover:text-white light:border-gray-200 light:bg-gray-50 light:text-gray-700 light:hover:border-emerald-500'
                        )}
                      >
                        <div className="font-semibold truncate text-[11px]">{cred.label}</div>
                        <div className="text-[10px] opacity-60 truncate font-mono">{cred.email.split('@')[0]}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </form>

            {ssoProviders.length > 0 && (
              <div className="px-6 sm:px-8 pb-6">
                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <Separator className="w-full bg-white/[0.08] light:bg-gray-200" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-[#111113] px-2 text-white/40 light:bg-white light:text-gray-500">
                      {t('auth.orContinueWith') || 'Or continue with'}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  {ssoProviders.map((sso) => (
                    <Button
                      key={sso.provider}
                      type="button"
                      variant="outline"
                      className="auth-lift w-full border-white/[0.08] text-white/80 hover:bg-white/[0.04] light:border-gray-200 light:text-gray-800 light:hover:bg-gray-100"
                      onClick={() => initiateSSO(sso.provider)}
                    >
                      <ProviderIcon provider={sso.provider} />
                      Continue with {sso.name}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <div className="px-6 sm:px-8 pb-8 text-center text-sm text-white/50 light:text-gray-500">
              <span>{(t('auth.noAccount') || "Don't have an account?").trim()}</span>{' '}
              <Link to="/signup" className={linkClass}>
                {t('auth.signUp') || 'Sign up'}
              </Link>
              <div className="mt-2">
                <span>New to {platformName}? </span>
                <Link to="/pricing" className={linkClass}>
                  See plans
                </Link>
              </div>
              {exploreEnabled && (
                <div className="mt-2">
                  <span>Just looking? </span>
                  <Link to="/explore" className={linkClass}>
                    Explore the demo
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <ForgotPasswordDialog
        open={forgotOpen}
        onOpenChange={(open) => {
          setForgotOpen(open);
          if (!open) requestAnimationFrame(() => (email ? passwordRef : emailRef).current?.focus());
        }}
      />
    </div>
  );
};
export default LoginView;
