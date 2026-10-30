import React, { useEffect, useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { ErrorState } from '@/components/shared/ErrorState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ChevronDown, ExternalLink, Eye, EyeOff, Facebook, KeyRound, MessageCircle, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { superAdminService, type PlatformConfig, type PlatformConfigUpdate } from '@/services/superAdmin';
import { refreshConnectWhatsAppConfig } from '@/components/whatsapp/ConnectWhatsAppButton';
import { cardClass, fieldClass, LoadingBlock, errorMessage } from './shared';
import { cn } from '@/lib/utils';

/** A titled box like the reference "Manual Onboarding" / "Embedded Signup" panels. */
const Panel: React.FC<{ title: React.ReactNode; children: React.ReactNode }> = ({ title, children }) => (
  <fieldset className="rounded-xl border border-white/[0.08] light:border-gray-200 px-5 pb-5 pt-2">
    <legend className="px-2 text-base font-medium text-sky-300 light:text-sky-700">{title}</legend>
    <div className="space-y-4 pt-2">{children}</div>
  </fieldset>
);

const ToggleRow: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string }> = ({ checked, onChange, label }) => (
  <label className="flex items-center gap-3 text-sm">
    <Switch checked={checked} onCheckedChange={onChange} />
    {label}
  </label>
);

/** Super admin controls for how admins and users connect their WhatsApp number. */
export const WhatsAppOnboardingView: React.FC = () => {
  const [config, setConfig] = useState<PlatformConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [editKeys, setEditKeys] = useState(false);
  const [secret, setSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);

  const load = () => {
    setError(null);
    superAdminService.getConfig().then(setConfig).catch((e) => setError(errorMessage(e)));
  };
  useEffect(load, []);

  const set = <K extends keyof PlatformConfig>(k: K, v: PlatformConfig[K]) => setConfig((c) => (c ? { ...c, [k]: v } : c));

  /** Save one panel's fields. */
  const save = async (section: string, payload: PlatformConfigUpdate) => {
    setSaving(section);
    try {
      const updated = await superAdminService.updateConfig(payload);
      setConfig(updated);
      setSecret('');
      setEditKeys(false);
      refreshConnectWhatsAppConfig();
      toast.success('Saved');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save'));
    } finally {
      setSaving(null);
    }
  };

  const keysSet = Boolean(config?.meta_app_id && config?.meta_config_id);

  return (
    <div className="flex flex-col min-h-full bg-[#0a0a0b] light:bg-gray-50">
      <PageHeader
        title="WhatsApp Onboarding"
        subtitle="Choose how admins and users connect their WhatsApp number"
        icon={MessageCircle}
        iconGradient="bg-gradient-to-br from-emerald-500 to-green-600 shadow-emerald-500/20"
      />

      {error ? (
        <div className="p-6"><ErrorState title="Couldn't load the settings" description={error} onRetry={load} /></div>
      ) : !config ? (
        <LoadingBlock />
      ) : (
        <div className="p-4 sm:p-6 max-w-5xl w-full">
          <div className={cn('rounded-xl border p-5 sm:p-7 space-y-8', cardClass)}>
            <h2 className="text-2xl font-medium text-indigo-200 light:text-indigo-900">WhatsApp Onboarding Setup</h2>

            {/* Manual */}
            <Panel title="Manual Onboarding">
              <ToggleRow
                checked={config.manual_signup_enabled}
                onChange={(v) => set('manual_signup_enabled', v)}
                label="Enable Manual WhatsApp Onboarding"
              />
              <p className="text-xs text-white/50 light:text-gray-500">
                Admins and users paste their Phone Number ID, WhatsApp Business Account ID and access token from Meta themselves.
              </p>
              <div className="grid gap-1.5 max-w-sm">
                <Label className="text-xs">Button text</Label>
                <Input
                  placeholder="Configure WABA API"
                  maxLength={40}
                  value={config.manual_button_label ?? ''}
                  onChange={(e) => set('manual_button_label', e.target.value)}
                  className={fieldClass}
                />
              </div>
              <Button
                className="bg-emerald-600 hover:bg-emerald-500 text-white"
                disabled={saving !== null}
                onClick={() => save('manual', { manual_signup_enabled: config.manual_signup_enabled, manual_button_label: config.manual_button_label ?? '' })}
              >
                {saving === 'manual' ? 'Saving…' : 'Save'}
              </Button>
            </Panel>

            {/* Embedded signup */}
            <Panel title={<span className="inline-flex items-center gap-2"><Facebook className="h-4 w-4 text-[#1877F2]" /> Embedded Signup Onboarding</span>}>
              <div className="rounded-lg border border-white/[0.08] light:border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowInfo(!showInfo)}
                  className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
                >
                  <span className="text-sky-300 light:text-sky-700">
                    Requirements and Information <span className="text-xs text-white/40 light:text-gray-500">Click to show/hide</span>
                  </span>
                  <ChevronDown className={cn('h-4 w-4 transition-transform', showInfo && 'rotate-180')} />
                </button>
                {showInfo && (
                  <div className="border-t border-white/[0.08] light:border-gray-200 px-4 py-3 text-xs text-white/70 light:text-gray-600 space-y-2">
                    <ol className="list-decimal list-inside space-y-1.5">
                      <li>Create a <strong>Business</strong> app in your verified Meta Business account.</li>
                      <li>Add the <strong>WhatsApp</strong> and <strong>Facebook Login for Business</strong> products.</li>
                      <li>In Facebook Login for Business → Configurations, create an Embedded Signup configuration and copy its <strong>Configuration ID</strong>.</li>
                      <li>Add your website domain (HTTPS) to the app's allowed domains and redirect URIs.</li>
                      <li>Get advanced access to <code>whatsapp_business_management</code> and <code>whatsapp_business_messaging</code>.</li>
                      <li>Enter the App ID, Configuration ID and App Secret below.</li>
                    </ol>
                    <a href="https://developers.facebook.com/docs/whatsapp/embedded-signup" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sky-300 hover:underline light:text-sky-700">
                      Meta's Embedded Signup guide <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
              </div>

              <ToggleRow checked={config.embedded_signup_enabled} onChange={(v) => set('embedded_signup_enabled', v)} label="Enable Embedded Signup" />

              <div className="inline-flex overflow-hidden rounded-md text-xs font-semibold">
                <span className={cn('px-4 py-2.5', keysSet ? 'bg-emerald-500/80 text-white' : 'bg-amber-500/80 text-white')}>
                  {keysSet ? 'Embedded Signup settings exist' : 'Embedded Signup settings are missing'}
                </span>
                <button type="button" onClick={() => setEditKeys(!editKeys)} className="bg-gray-500/70 px-4 py-2.5 text-white hover:bg-gray-500">
                  {editKeys ? 'Close' : keysSet ? 'Update' : 'Add'}
                </button>
              </div>

              {editKeys && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label className="text-xs">Meta App ID *</Label>
                    <Input value={config.meta_app_id} onChange={(e) => set('meta_app_id', e.target.value)} placeholder="e.g. 1732716131427334" className={fieldClass} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs">Configuration ID *</Label>
                    <Input value={config.meta_config_id} onChange={(e) => set('meta_config_id', e.target.value)} placeholder="e.g. 860928616411834" className={fieldClass} />
                  </div>
                  <div className="grid gap-1.5 sm:col-span-2">
                    <Label className="text-xs flex items-center gap-1.5">
                      <KeyRound className="h-3.5 w-3.5" /> Meta App Secret {config.has_meta_app_secret && <span className="text-emerald-400 light:text-emerald-600">(saved, leave empty to keep)</span>}
                    </Label>
                    <div className="relative">
                      <Input
                        type={showSecret ? 'text' : 'password'}
                        value={secret}
                        onChange={(e) => setSecret(e.target.value)}
                        placeholder={config.has_meta_app_secret ? '••••••••••••••••' : 'Enter Meta App Secret'}
                        className={fieldClass}
                        autoComplete="off"
                      />
                      <button type="button" onClick={() => setShowSecret(!showSecret)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 light:text-gray-400">
                        {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <p className="text-[11px] text-white/40 light:text-gray-500">Stored encrypted and never shown again.</p>
                  </div>
                </div>
              )}

              <div className="grid gap-1.5 max-w-sm">
                <Label className="text-xs">Button text</Label>
                <Input
                  placeholder="Connect with Facebook"
                  maxLength={40}
                  value={config.embedded_button_label ?? ''}
                  onChange={(e) => set('embedded_button_label', e.target.value)}
                  className={fieldClass}
                />
              </div>

              <Button
                className="bg-emerald-600 hover:bg-emerald-500 text-white"
                disabled={saving !== null}
                onClick={() =>
                  save('embedded', {
                    embedded_signup_enabled: config.embedded_signup_enabled,
                    embedded_button_label: config.embedded_button_label ?? '',
                    meta_app_id: config.meta_app_id.trim(),
                    meta_config_id: config.meta_config_id.trim(),
                    ...(secret.trim() ? { meta_app_secret: secret.trim() } : {}),
                  })
                }
              >
                {saving === 'embedded' ? 'Saving…' : 'Save'}
              </Button>
            </Panel>

            {/* Connect button */}
            <Panel title={<span className="inline-flex items-center gap-2"><Settings2 className="h-4 w-4" /> "Connect WhatsApp with Facebook" Button</span>}>
              <ToggleRow
                checked={!config.hide_connect_button}
                onChange={(v) => set('hide_connect_button', !v)}
                label="Show the button to admins and users"
              />
              <p className="text-xs text-white/50 light:text-gray-500">
                The blue button in the top bar, Settings, Ads Manager and WhatsApp Setup. It opens Meta's WhatsApp onboarding page.
              </p>
              <div className="grid gap-1.5">
                <Label className="text-xs">Facebook onboarding link</Label>
                <Input
                  value={config.connect_url ?? ''}
                  onChange={(e) => set('connect_url', e.target.value)}
                  placeholder="https://business.facebook.com/messaging/whatsapp/onboard/?app_id=…&config_id=…"
                  className={fieldClass}
                />
                <p className="text-[11px] text-white/40 light:text-gray-500">Leave empty to build it from the App ID and Configuration ID.</p>
              </div>
              <Button
                className="bg-emerald-600 hover:bg-emerald-500 text-white"
                disabled={saving !== null}
                onClick={() => save('button', { hide_connect_button: config.hide_connect_button ?? false, connect_url: (config.connect_url ?? '').trim() })}
              >
                {saving === 'button' ? 'Saving…' : 'Save'}
              </Button>
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
};

export default WhatsAppOnboardingView;
