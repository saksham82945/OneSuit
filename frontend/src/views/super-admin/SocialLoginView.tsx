import React, { useEffect, useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { ErrorState } from '@/components/shared/ErrorState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Check, Copy, ExternalLink, Eye, EyeOff, KeyRound, LogIn } from 'lucide-react';
import { toast } from 'sonner';
import { socialLoginService, type SocialProvider } from '@/services/integrations';
import { cardClass, fieldClass, LoadingBlock, errorMessage } from './shared';
import { cn } from '@/lib/utils';

const GUIDES: Record<string, { console: string; steps: string[] }> = {
  google: {
    console: 'https://console.cloud.google.com/apis/credentials',
    steps: [
      'Open Google Cloud Console → APIs & Services → Credentials.',
      'Create an OAuth client ID of type "Web application".',
      'Add the redirect URL below under "Authorised redirect URIs".',
      'Copy the Client ID and Client Secret here.',
    ],
  },
  facebook: {
    console: 'https://developers.facebook.com/apps',
    steps: [
      'Open Meta for Developers and create (or open) your app.',
      'Add the "Facebook Login" product.',
      'Add the redirect URL below under Facebook Login → Settings → Valid OAuth Redirect URIs.',
      'Copy the App ID (Client ID) and App Secret from App settings → Basic.',
    ],
  },
};

const GoogleMark = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
    <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.3-1.6 3.8-5.4 3.8-3.2 0-5.9-2.7-5.9-6s2.7-6 5.9-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.4 14.6 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z" />
  </svg>
);
const FacebookMark = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="#1877F2" aria-hidden>
    <path d="M24 12.07C24 5.41 18.63 0 12 0S0 5.41 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z" />
  </svg>
);

const ProviderPanel: React.FC<{ p: SocialProvider; onSaved: (list: SocialProvider[]) => void }> = ({ p, onSaved }) => {
  const [enabled, setEnabled] = useState(p.enabled);
  const [showOnLogin, setShowOnLogin] = useState(p.show_on_login);
  const [editing, setEditing] = useState(!p.keys_set);
  const [clientId, setClientId] = useState(p.client_id);
  const [secret, setSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const guide = GUIDES[p.provider];

  useEffect(() => {
    setEnabled(p.enabled);
    setShowOnLogin(p.show_on_login);
    setClientId(p.client_id);
  }, [p]);

  const save = async () => {
    setSaving(true);
    try {
      const list = await socialLoginService.update(p.provider, {
        enabled,
        show_on_login: showOnLogin,
        ...(editing ? { client_id: clientId.trim() } : {}),
        ...(secret.trim() ? { client_secret: secret.trim() } : {}),
      });
      onSaved(list);
      setSecret('');
      setEditing(false);
      toast.success(`${p.name} login saved`);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save'));
    } finally {
      setSaving(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(p.callback_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Copy failed; select the link and copy it');
    }
  };

  return (
    <fieldset className="rounded-xl border border-white/[0.08] light:border-gray-200 px-5 pb-5 pt-2">
      <legend className="px-1">
        <label className="flex items-center gap-2 rounded-lg border border-white/[0.08] light:border-gray-200 bg-white/[0.02] light:bg-white px-3 py-2 text-sm text-sky-300 light:text-sky-700 cursor-pointer">
          <input type="checkbox" className="h-4 w-4 accent-sky-600" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          {p.provider === 'google' ? <GoogleMark /> : <FacebookMark />}
          Allow {p.name} Login
        </label>
      </legend>

      <div className="space-y-4 pt-3">
        <div className="inline-flex overflow-hidden rounded-md text-xs font-semibold">
          <span className={cn('px-4 py-2.5 text-white', p.keys_set ? 'bg-emerald-500/80' : 'bg-amber-500/80')}>
            {p.keys_set ? `${p.name} keys are installed.` : `${p.name} keys are not added yet.`}
          </span>
          <button type="button" onClick={() => setEditing(!editing)} className="bg-gray-500/70 px-4 py-2.5 text-white hover:bg-gray-500">
            {editing && p.keys_set ? 'Close' : p.keys_set ? 'Update' : 'Add'}
          </button>
        </div>

        {editing && (
          <div className="space-y-3 rounded-lg border border-white/[0.06] light:border-gray-200 p-4">
            <ol className="list-decimal list-inside space-y-1 text-xs text-white/60 light:text-gray-600">
              {guide.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            <a href={guide.console} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-sky-300 hover:underline light:text-sky-700">
              Open {p.provider === 'google' ? 'Google Cloud Console' : 'Meta for Developers'} <ExternalLink className="h-3 w-3" />
            </a>
            <div className="grid gap-1.5">
              <Label className="text-xs">Redirect URL (paste this in {p.name})</Label>
              <div className="flex gap-2">
                <Input readOnly value={p.callback_url} className={cn(fieldClass, 'font-mono text-xs')} />
                <Button type="button" variant="outline" size="sm" className="h-9 border-white/10 light:border-gray-200" onClick={copy}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label className="text-xs">{p.provider === 'facebook' ? 'App ID (Client ID)' : 'Client ID'} *</Label>
                <Input value={clientId} onChange={(e) => setClientId(e.target.value)} className={fieldClass} autoComplete="off" />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs flex items-center gap-1">
                  <KeyRound className="h-3.5 w-3.5" /> {p.provider === 'facebook' ? 'App Secret' : 'Client Secret'} {p.has_secret ? '(saved; leave empty to keep)' : '*'}
                </Label>
                <div className="relative">
                  <Input
                    type={showSecret ? 'text' : 'password'}
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    placeholder={p.has_secret ? '••••••••••••' : ''}
                    className={fieldClass}
                    autoComplete="off"
                  />
                  <button type="button" onClick={() => setShowSecret(!showSecret)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 light:text-gray-400">
                    {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-white/40 light:text-gray-500">The secret is stored encrypted and never shown again.</p>
          </div>
        )}

        <label className="flex items-center gap-3 text-sm">
          <Switch checked={showOnLogin} onCheckedChange={setShowOnLogin} />
          Show the "Continue with {p.name}" button on the login page
        </label>

        <Button className="bg-emerald-600 hover:bg-emerald-500 text-white" disabled={saving} onClick={save}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </fieldset>
  );
};

/** Super admin: Google and Facebook sign-in for the whole platform. */
export const SocialLoginView: React.FC = () => {
  const [providers, setProviders] = useState<SocialProvider[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    socialLoginService.get().then(setProviders).catch((e) => setError(errorMessage(e)));
  };
  useEffect(load, []);

  return (
    <div className="flex flex-col min-h-full bg-[#0a0a0b] light:bg-gray-50">
      <PageHeader
        title="Social Login"
        subtitle="Let people sign in with Google or Facebook, and choose which buttons the login page shows"
        icon={LogIn}
        iconGradient="bg-gradient-to-br from-sky-500 to-blue-600 shadow-sky-500/20"
      />
      {error ? (
        <div className="p-6"><ErrorState title="Couldn't load social login" description={error} onRetry={load} /></div>
      ) : !providers ? (
        <LoadingBlock />
      ) : (
        <div className="p-4 sm:p-6 max-w-5xl w-full">
          <div className={cn('rounded-xl border p-5 sm:p-7 space-y-8', cardClass)}>
            <div>
              <h2 className="text-2xl font-medium text-indigo-200 light:text-indigo-900">Social Login</h2>
              <p className="mt-1 text-xs text-white/50 light:text-gray-500">
                People sign in to their existing account with the same email. Someone without an account is taken to sign-up with their name and email filled in.
              </p>
            </div>
            {providers.map((p) => (
              <ProviderPanel key={p.provider} p={p} onSaved={setProviders} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SocialLoginView;
