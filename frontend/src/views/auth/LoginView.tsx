import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/services/api';
import { readData } from '@/services/response';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { useBrandedTitle, useBranding } from '@/services/branding';
import { BrandMark } from '@/views/public/PublicLayout';
import { cn } from '@/lib/utils';

interface SSOProvider {
  provider: string;
  name: string;
}

export const LoginView: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [ssoProviders, setSsoProviders] = useState<SSOProvider[]>([]);
  const { platform_name: platformName } = useBranding();
  const [exploreEnabled, setExploreEnabled] = useState(false);
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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error(t('auth.enterEmailPassword') || 'Please enter email and password');
      return;
    }

    setIsLoading(true);

    try {
      await login(email, password);
      toast.success(t('auth.loginSuccess') || 'Logged in successfully');
      const redirect = searchParams.get('redirect');
      navigate(redirect || '/');
    } catch (error) {
      const message =
        (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
        t('auth.invalidCredentials') ||
        'Invalid email or password';
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const initiateSSO = (provider: string) => {
    const basePath = ((window as Window & { __BASE_PATH__?: string }).__BASE_PATH__ ?? '').replace(/\/$/, '');
    window.location.href = `${basePath}/api/auth/sso/${provider}/init`;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0b] light:bg-gradient-to-br light:from-gray-50 light:to-gray-100 p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-white/[0.02] backdrop-blur light:bg-white light:border-gray-200 light:shadow-xl">
        <div className="p-8 space-y-1 text-center">
          <div className="flex flex-col items-center gap-2 mb-4">
            <BrandMark className="h-12 w-12" iconClassName="h-7 w-7" />
            <span className="text-sm font-semibold tracking-tight text-white/80 light:text-gray-700">{platformName}</span>
          </div>
          <h2 className="text-2xl font-bold text-white light:text-gray-900">
            {t('auth.welcomeTitle') || 'Welcome back'}
          </h2>
          <p className="text-white/50 light:text-gray-500">
            {t('auth.welcomeSubtitle') || `Sign in to access your ${platformName} workspace`}
          </p>
        </div>

        <form onSubmit={handleLogin}>
          <div className="px-8 pb-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-white/70 light:text-gray-700">
                {t('common.email') || 'Email'}
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@login.com"
                disabled={isLoading}
                autoComplete="email"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-white/70 light:text-gray-700">
                {t('auth.password') || 'Password'}
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={isLoading}
                autoComplete="current-password"
                required
              />
            </div>

            <Button
              type="submit"
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-md shadow-emerald-600/20"
              disabled={isLoading}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('auth.signIn') || 'Sign In'}
            </Button>

            {/* Quick Demo Credentials */}
            <div className="pt-2">
              <div className="flex items-center justify-between text-xs text-white/50 light:text-gray-500 mb-2">
                <span className="font-semibold uppercase tracking-wider text-[11px] text-emerald-400 light:text-emerald-600">
                  Quick Logins
                </span>
                <span className="text-[11px] text-white/40 light:text-gray-400">Password: <code className="bg-white/10 light:bg-gray-200 px-1 py-0.5 rounded font-mono text-[10px]">admin123</code></span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { label: 'Super Admin', email: 'superadmin@login.com' },
                  { label: 'Admin', email: 'admin@login.com' },
                  { label: 'Manager', email: 'manager@login.com' },
                  { label: 'Agent', email: 'agent@login.com' },
                  { label: 'User', email: 'user@login.com' },
                  { label: 'Explorer', email: 'explorer@login.com' },
                ].map((cred) => (
                  <button
                    key={cred.email}
                    type="button"
                    onClick={() => {
                      setEmail(cred.email);
                      setPassword('admin123');
                    }}
                    className={cn(
                      'text-left p-2 rounded-lg border text-xs transition-all cursor-pointer',
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
          <div className="px-8 pb-6">
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <Separator className="w-full bg-white/[0.08] light:bg-gray-200" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-[#0a0a0b] px-2 text-white/40 light:bg-white light:text-gray-500">
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
                  className="w-full border-white/[0.08] text-white/80 hover:bg-white/[0.04] light:border-gray-200 light:text-gray-800 light:hover:bg-gray-100"
                  onClick={() => initiateSSO(sso.provider)}
                >
                  {sso.name}
                </Button>
              ))}
            </div>
          </div>
        )}

        <div className="px-8 pb-8 text-center text-sm text-white/40 light:text-gray-500">
          <span>{t('auth.noAccount') || "Don't have an account? "}</span>
          <Link
            to="/signup"
            className="text-emerald-400 hover:text-emerald-300 font-medium underline-offset-4 hover:underline"
          >
            {t('auth.signUp') || 'Sign up'}
          </Link>
          <div className="mt-2">
            <span>New to {platformName}? </span>
            <Link
              to="/pricing"
              className="text-emerald-400 hover:text-emerald-300 font-medium underline-offset-4 hover:underline"
            >
              See plans
            </Link>
          </div>
          {exploreEnabled && (
            <div className="mt-2">
              <span>Just looking? </span>
              <Link
                to="/explore"
                className="text-emerald-400 hover:text-emerald-300 font-medium underline-offset-4 hover:underline"
              >
                Explore the demo
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
export default LoginView;
