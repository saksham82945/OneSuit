import React, { useEffect, useState, useRef } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { ErrorState } from '@/components/shared/ErrorState';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { refreshConnectWhatsAppConfig } from '@/components/whatsapp/ConnectWhatsAppButton';
import { Badge } from '@/components/ui/badge';
import {
  SlidersHorizontal,
  Save,
  Upload,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  Mail,
  Phone,
  Building,
  KeyRound,
  HelpCircle,
  Clock,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  superAdminService,
  NO_PLAN,
  LOGO_MAX_BYTES,
  LOGO_TYPES,
  type PlatformConfig,
  type PlatformConfigUpdate,
  type Plan,
} from '@/services/superAdmin';
import { useBranding, setBranding } from '@/services/branding';
import { TimezonePicker } from '@/components/shared/TimezonePicker';
import { BrandMark } from '@/views/public/PublicLayout';
import { cardClass, fieldClass, LoadingBlock, errorMessage } from './shared';

const Row: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <div className="flex items-center justify-between gap-6 py-3 border-b border-white/[0.06] light:border-gray-100 last:border-0">
    <div>
      <p className="text-[13px] font-medium text-white light:text-gray-900">{label}</p>
      {hint && <p className="text-xs text-white/40 light:text-gray-500">{hint}</p>}
    </div>
    <div className="shrink-0">{children}</div>
  </div>
);

/** `embedded` swaps the page header for a small save bar (used inside Settings). */
export const ConfigurationView: React.FC<{ embedded?: boolean }> = ({ embedded }) => {
  const [config, setConfig] = useState<PlatformConfig | null>(null);
  const [saved, setSaved] = useState<PlatformConfig | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('general');

  // Secret management
  const [metaSecretInput, setMetaSecretInput] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [clearSecretFlag, setClearSecretFlag] = useState(false);

  // Logo upload state
  const branding = useBranding();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isRemovingLogo, setIsRemovingLogo] = useState(false);

  const load = () => {
    setError(null);
    Promise.all([superAdminService.getConfig(), superAdminService.listPlans()])
      .then(([c, p]) => {
        setConfig(c);
        setSaved(c);
        setPlans(p);
        setMetaSecretInput('');
        setClearSecretFlag(false);
      })
      .catch((e) => setError(errorMessage(e)));
  };

  useEffect(load, []);

  const dirty =
    Boolean(config && saved && JSON.stringify(config) !== JSON.stringify(saved)) ||
    metaSecretInput.trim().length > 0 ||
    clearSecretFlag;

  const update = <K extends keyof PlatformConfig>(k: K, v: PlatformConfig[K]) =>
    setConfig((c) => (c ? { ...c, [k]: v } : c));

  // Logo upload handler
  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!LOGO_TYPES.includes(file.type)) {
      toast.error('The logo must be a PNG, JPEG, or WebP image. SVG is not allowed.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (file.size > LOGO_MAX_BYTES) {
      toast.error('Logo file must be 512 KB or smaller.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setIsUploadingLogo(true);
    try {
      const updatedBranding = await superAdminService.uploadLogo(file);
      setBranding(updatedBranding);
      toast.success('Software logo updated successfully');
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to upload logo'));
    } finally {
      setIsUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Logo remove handler
  const handleRemoveLogo = async () => {
    if (!branding.logo_url) return;
    setIsRemovingLogo(true);
    try {
      const updatedBranding = await superAdminService.removeLogo();
      setBranding(updatedBranding);
      toast.success('Software logo removed');
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to remove logo'));
    } finally {
      setIsRemovingLogo(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;

    // Validation checks
    if (!config.platform_name.trim()) {
      toast.error('Software name is required');
      return;
    }

    if (config.platform_name.trim().length > 60) {
      toast.error('Software name must be 60 characters or fewer');
      return;
    }

    if (config.website_url.trim() && !/^https?:\/\//i.test(config.website_url.trim())) {
      toast.error('Website must start with http:// or https://');
      return;
    }

    if (config.contact_address && config.contact_address.length > 500) {
      toast.error('Contact address must be 500 characters or fewer');
      return;
    }

    if (!config.embedded_signup_enabled && !config.manual_signup_enabled) {
      toast.error('Keep at least one way for businesses to connect WhatsApp turned on');
      return;
    }

    setSaving(true);
    try {
      const payload: PlatformConfigUpdate = {
        platform_name: config.platform_name.trim(),
        support_email: config.support_email.trim(),
        support_phone: config.support_phone.trim(),
        contact_address: config.contact_address.trim(),
        website_url: config.website_url.trim(),
        timezone: config.timezone.trim() || 'UTC',
        default_currency: 'INR',
        default_plan_id: config.default_plan_id,
        trial_days: config.trial_days,
        renewal_reminder_days: config.renewal_reminder_days,
        allow_vendor_signup: config.allow_vendor_signup,
        require_email_verification: config.require_email_verification,
        maintenance_mode: config.maintenance_mode,
        maintenance_message: config.maintenance_message,
        embedded_signup_enabled: config.embedded_signup_enabled,
        manual_signup_enabled: config.manual_signup_enabled,
        meta_app_id: config.meta_app_id.trim(),
        meta_config_id: config.meta_config_id.trim(),
        embedded_button_label: (config.embedded_button_label ?? '').trim(),
        manual_button_label: (config.manual_button_label ?? '').trim(),
        hide_connect_button: Boolean(config.hide_connect_button),
        connect_url: (config.connect_url ?? '').trim(),
      };

      if (clearSecretFlag) {
        payload.clear_meta_app_secret = true;
      } else if (metaSecretInput.trim()) {
        payload.meta_app_secret = metaSecretInput.trim();
      }

      const updated = await superAdminService.updateConfig(payload);
      setConfig(updated);
      setSaved(updated);
      refreshConnectWhatsAppConfig();
      setMetaSecretInput('');
      setClearSecretFlag(false);

      // Refresh public branding store so UI updates immediately
      setBranding({
        platform_name: updated.platform_name,
        support_email: updated.support_email,
        support_phone: updated.support_phone,
        contact_address: updated.contact_address,
        website_url: updated.website_url,
        timezone: updated.timezone,
      });

      toast.success('Configuration saved');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save configuration'));
    } finally {
      setSaving(false);
    }
  };

  const isBothSignupDisabled = config && !config.embedded_signup_enabled && !config.manual_signup_enabled;
  const isEmbeddedMissingIds = config && config.embedded_signup_enabled && (!config.meta_app_id.trim() || !config.meta_config_id.trim());

  return (
    <form onSubmit={handleSave} className="flex flex-col min-h-full bg-[#0a0a0b] light:bg-gray-50 text-foreground">
      {embedded ? (
        <div className="flex items-center justify-between gap-3 px-6 pt-4">
          <p className="text-xs text-white/50 light:text-gray-500">Branding, signup, subscription defaults and registration for the whole platform.</p>
          {config && (
            <Button
              type="submit"
              size="sm"
              disabled={!dirty || saving || Boolean(isBothSignupDisabled)}
              className="bg-violet-600 hover:bg-violet-500 text-white shadow-md shadow-violet-600/20"
            >
              <Save className="h-4 w-4 mr-2" /> {saving ? 'Saving…' : 'Save changes'}
            </Button>
          )}
        </div>
      ) : (
      <PageHeader
          title="Configuration"
          subtitle="Branding, signup methods, subscriptions, and platform settings"
          icon={SlidersHorizontal}
          iconGradient="bg-gradient-to-br from-violet-500 to-indigo-600 shadow-violet-500/20"
          actions={
            config && (
              <Button
                type="submit"
                size="sm"
                disabled={!dirty || saving || Boolean(isBothSignupDisabled)}
                className="bg-violet-600 hover:bg-violet-500 text-white shadow-md shadow-violet-600/20"
              >
                <Save className="h-4 w-4 mr-2" /> {saving ? 'Saving…' : 'Save changes'}
              </Button>
            )
          }
        />
      )}

      {error ? (
        <div className="p-6">
          <ErrorState title="Couldn't load configuration" description={error} onRetry={load} />
        </div>
      ) : !config ? (
        <LoadingBlock />
      ) : (
        <div className="p-6 max-w-4xl space-y-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="bg-white/[0.04] border border-white/[0.08] p-1 light:bg-white light:border-gray-200">
              <TabsTrigger value="general" className="text-xs data-[state=active]:bg-violet-600 data-[state=active]:text-white">
                General & Branding
              </TabsTrigger>
              <TabsTrigger value="signup" className="text-xs data-[state=active]:bg-violet-600 data-[state=active]:text-white">
                Signup Settings
              </TabsTrigger>
              <TabsTrigger value="subscriptions" className="text-xs data-[state=active]:bg-violet-600 data-[state=active]:text-white">
                Subscriptions
              </TabsTrigger>
              <TabsTrigger value="access" className="text-xs data-[state=active]:bg-violet-600 data-[state=active]:text-white">
                Access & Maintenance
              </TabsTrigger>
            </TabsList>

            {/* TAB 1: GENERAL & BRANDING */}
            <TabsContent value="general" className="mt-6 space-y-6">
              {/* Logo Card */}
              <Card className={cardClass}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-violet-400" /> Software Logo
                      </CardTitle>
                      <CardDescription className="text-xs text-white/50 light:text-gray-500">
                        Displayed in the sidebar, mobile header, public login/pricing/signup pages, and browser tab
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] light:bg-gray-50 light:border-gray-200">
                    <div className="flex flex-col items-center gap-2">
                      <div className="h-20 w-20 rounded-2xl overflow-hidden border border-white/[0.1] bg-[#141415] flex items-center justify-center p-2 light:bg-white light:border-gray-200 shadow-inner">
                        <BrandMark className="h-full w-full rounded-xl" iconClassName="h-8 w-8" />
                      </div>
                      <span className="text-[10px] uppercase font-mono tracking-wider text-white/40 light:text-gray-500">
                        {branding.logo_url ? 'Active Logo' : 'Default Icon'}
                      </span>
                    </div>

                    <div className="flex-1 space-y-2">
                      <p className="text-xs font-medium text-white light:text-gray-900">
                        Upload custom software logo
                      </p>
                      <p className="text-xs text-white/50 light:text-gray-500 leading-relaxed">
                        PNG, JPEG or WebP, up to 512 KB. Verified by content bytes. SVG is rejected for security.
                      </p>

                      <div className="flex items-center gap-3 pt-2">
                        <input
                          type="file"
                          ref={fileInputRef}
                          onChange={handleLogoFileChange}
                          accept="image/png,image/jpeg,image/webp"
                          className="hidden"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isUploadingLogo}
                          className="border-white/[0.1] text-xs hover:bg-white/[0.06] light:border-gray-300 light:hover:bg-gray-100"
                        >
                          <Upload className="h-3.5 w-3.5 mr-1.5" />
                          {isUploadingLogo ? 'Uploading…' : branding.logo_url ? 'Replace logo' : 'Upload logo'}
                        </Button>

                        {branding.logo_url && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={handleRemoveLogo}
                            disabled={isRemovingLogo}
                            className="text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                            {isRemovingLogo ? 'Removing…' : 'Remove logo'}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* General Details Card */}
              <Card className={cardClass}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Building className="h-4 w-4 text-violet-400" /> Brand & Contact Details
                  </CardTitle>
                  <CardDescription className="text-xs text-white/50 light:text-gray-500">
                    Shown to every visitor, explorer, client and team member
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-1.5 sm:col-span-2">
                    <Label className="text-xs font-medium">Software name *</Label>
                    <Input
                      required
                      maxLength={60}
                      value={config.platform_name}
                      onChange={(e) => update('platform_name', e.target.value)}
                      placeholder="e.g. onesuit"
                      className={fieldClass}
                    />
                    <p className="text-[11px] text-white/40 light:text-gray-500">
                      Replaces all occurrences of "onesuit" in page headers, titles, and public footers (max 60 chars)
                    </p>
                  </div>

                  <div className="grid gap-1.5">
                    <Label className="text-xs font-medium flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5 text-white/40 light:text-gray-400" /> Support email
                    </Label>
                    <Input
                      type="email"
                      value={config.support_email}
                      onChange={(e) => update('support_email', e.target.value)}
                      placeholder="support@example.com"
                      className={fieldClass}
                    />
                  </div>

                  <div className="grid gap-1.5">
                    <Label className="text-xs font-medium flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-white/40 light:text-gray-400" /> Support phone / WhatsApp number
                    </Label>
                    <Input
                      value={config.support_phone}
                      onChange={(e) => update('support_phone', e.target.value)}
                      placeholder="+91 98200 55501"
                      className={fieldClass}
                    />
                  </div>

                  <div className="grid gap-1.5 sm:col-span-2">
                    <Label className="text-xs font-medium flex items-center gap-1.5">
                      <Globe className="h-3.5 w-3.5 text-white/40 light:text-gray-400" /> Website URL
                    </Label>
                    <Input
                      value={config.website_url}
                      onChange={(e) => update('website_url', e.target.value)}
                      placeholder="https://example.com"
                      className={fieldClass}
                    />
                    <p className="text-[11px] text-white/40 light:text-gray-500">
                      Must start with http:// or https:// (shown in public footer and email templates)
                    </p>
                  </div>

                  <div className="grid gap-1.5 sm:col-span-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">Contact address</Label>
                      <span className="text-[10px] text-white/40 light:text-gray-500">
                        {config.contact_address.length} / 500 characters
                      </span>
                    </div>
                    <Textarea
                      rows={3}
                      maxLength={500}
                      value={config.contact_address}
                      onChange={(e) => update('contact_address', e.target.value)}
                      placeholder="Office address displayed in footers and future invoices"
                      className={fieldClass}
                    />
                  </div>

                  <div className="grid gap-1.5 sm:col-span-2 pt-2 border-t border-white/[0.06] light:border-gray-200">
                    <Label className="text-xs font-medium flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-white/40 light:text-gray-400" /> Default platform time zone
                    </Label>
                    <TimezonePicker
                      value={config.timezone || 'UTC'}
                      onChange={(tz) => update('timezone', tz)}
                    />
                    <p className="text-[11px] text-white/40 light:text-gray-500">
                      Assigned to all newly created businesses (sign-up, explorer upgrade, "Add client"). Existing businesses keep their own time zone.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* TAB 2: SIGNUP SETTINGS */}
            <TabsContent value="signup" className="mt-6 space-y-6">
              {isBothSignupDisabled && (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-start gap-3">
                  <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">Both connection methods cannot be turned off.</span>
                    <p className="mt-0.5 text-rose-300/80">
                      At least one way (Embedded Signup or Manual Signup) must remain enabled so businesses can connect their WhatsApp number.
                    </p>
                  </div>
                </div>
              )}

              {isEmbeddedMissingIds && (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-start gap-3">
                  <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">Meta App ID or Configuration ID missing.</span>
                    <p className="mt-0.5 text-amber-300/80">
                      Embedded Signup is turned on, but credentials are incomplete. The "Connect with Facebook" button will be hidden from customer accounts until both IDs are provided.
                    </p>
                  </div>
                </div>
              )}

              <Card className={cardClass}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">WhatsApp Connection Methods</CardTitle>
                  <CardDescription className="text-xs text-white/50 light:text-gray-500">
                    Choose how businesses connect their official WhatsApp number in Settings → Accounts
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Embedded Signup Toggle */}
                  <div className="rounded-xl p-4 bg-white/[0.02] border border-white/[0.06] light:bg-gray-50 light:border-gray-200 space-y-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-white light:text-gray-900">
                            Meta Embedded Signup ("Connect with Facebook")
                          </p>
                          <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                            Recommended
                          </Badge>
                        </div>
                        <p className="text-xs text-white/50 light:text-gray-500 mt-0.5">
                          Customers click "Connect with Facebook", log in to Meta, and select or create their WhatsApp Business Account in under 2 minutes.
                        </p>
                      </div>
                      <Switch
                        checked={config.embedded_signup_enabled}
                        onCheckedChange={(v) => update('embedded_signup_enabled', v)}
                      />
                    </div>

                    <div className="mt-3 pt-3 border-t border-white/[0.06] light:border-gray-200 grid gap-1.5">
                      <Label className="text-xs font-medium">Button text on Accounts</Label>
                      <Input
                        placeholder="Connect with Facebook"
                        maxLength={40}
                        value={config.embedded_button_label ?? ''}
                        onChange={(e) => update('embedded_button_label', e.target.value)}
                        className={fieldClass}
                      />
                    </div>

                    {config.embedded_signup_enabled && (
                      <div className="pt-3 border-t border-white/[0.06] light:border-gray-200 grid gap-3 sm:grid-cols-2">
                        <div className="grid gap-1.5">
                          <Label className="text-xs font-medium">Meta App ID *</Label>
                          <Input
                            placeholder="e.g. 109283746192837"
                            value={config.meta_app_id}
                            onChange={(e) => update('meta_app_id', e.target.value)}
                            className={fieldClass}
                          />
                        </div>

                        <div className="grid gap-1.5">
                          <Label className="text-xs font-medium">Configuration ID *</Label>
                          <Input
                            placeholder="e.g. 482910471928374"
                            value={config.meta_config_id}
                            onChange={(e) => update('meta_config_id', e.target.value)}
                            className={fieldClass}
                          />
                        </div>

                        <div className="grid gap-1.5 sm:col-span-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs font-medium flex items-center gap-1.5">
                              <KeyRound className="h-3.5 w-3.5 text-white/40 light:text-gray-400" /> Meta App Secret
                            </Label>
                            {config.has_meta_app_secret && !clearSecretFlag && (
                              <div className="flex items-center gap-2">
                                <Badge className="bg-emerald-500/15 text-emerald-400 border-0 text-[10px]">
                                  <CheckCircle2 className="h-3 w-3 mr-1" /> Saved — leave blank to keep
                                </Badge>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setClearSecretFlag(true)}
                                  className="h-6 text-[10px] text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 px-2"
                                >
                                  Clear secret
                                </Button>
                              </div>
                            )}
                            {clearSecretFlag && (
                              <div className="flex items-center gap-2">
                                <Badge className="bg-rose-500/15 text-rose-400 border-0 text-[10px]">
                                  Will be removed on save
                                </Badge>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setClearSecretFlag(false)}
                                  className="h-6 text-[10px] text-white/60 hover:text-white px-2 light:text-gray-600 light:hover:text-gray-900"
                                >
                                  Undo
                                </Button>
                              </div>
                            )}
                          </div>

                          <div className="relative">
                            <Input
                              type={showSecret ? 'text' : 'password'}
                              placeholder={
                                config.has_meta_app_secret && !clearSecretFlag
                                  ? '••••••••••••••••••••••••••••••••'
                                  : 'Enter Meta App Secret'
                              }
                              value={metaSecretInput}
                              onChange={(e) => {
                                setMetaSecretInput(e.target.value);
                                if (clearSecretFlag) setClearSecretFlag(false);
                              }}
                              className={fieldClass}
                            />
                            <button
                              type="button"
                              onClick={() => setShowSecret(!showSecret)}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white light:text-gray-400 light:hover:text-gray-900"
                            >
                              {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                          <p className="text-[11px] text-white/40 light:text-gray-500">
                            Stored securely encrypted at rest. Exchanged by the backend for long-lived system tokens. Never exposed in API responses.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Connect WhatsApp with Facebook shortcut button */}
                  <div className="rounded-xl p-4 bg-white/[0.02] border border-white/[0.06] light:bg-gray-50 light:border-gray-200">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-white light:text-gray-900">
                          "Connect WhatsApp with Facebook" button
                        </p>
                        <p className="text-xs text-white/50 light:text-gray-500 mt-0.5">
                          Blue button in the top bar, Settings, Ads Manager and WhatsApp Setup. It opens Meta's WhatsApp onboarding page. Turn off to hide it for admins and all other users.
                        </p>
                      </div>
                      <Switch
                        checked={!config.hide_connect_button}
                        onCheckedChange={(v) => update('hide_connect_button', !v)}
                        aria-label="Show the Connect WhatsApp with Facebook button"
                      />
                    </div>
                    <div className="mt-3 pt-3 border-t border-white/[0.06] light:border-gray-200 grid gap-1.5">
                      <Label className="text-xs font-medium">Facebook onboarding link</Label>
                      <Input
                        placeholder="https://business.facebook.com/messaging/whatsapp/onboard/?app_id=…&config_id=…"
                        value={config.connect_url ?? ''}
                        onChange={(e) => update('connect_url', e.target.value)}
                        className={fieldClass}
                      />
                      <p className="text-[11px] text-white/40 light:text-gray-500">
                        Leave blank to build it from the Meta App ID and Configuration ID above.
                      </p>
                    </div>
                  </div>

                  {/* Manual Signup Toggle */}
                  <div className="rounded-xl p-4 bg-white/[0.02] border border-white/[0.06] light:bg-gray-50 light:border-gray-200">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-white light:text-gray-900">
                          Manual Signup ("Enter details manually")
                        </p>
                        <p className="text-xs text-white/50 light:text-gray-500 mt-0.5">
                          Allows businesses to manually paste their Phone Number ID, WABA ID, and permanent access token from Meta's developer console.
                        </p>
                      </div>
                      <Switch
                        checked={config.manual_signup_enabled}
                        onCheckedChange={(v) => update('manual_signup_enabled', v)}
                      />
                    </div>

                    <div className="mt-3 pt-3 border-t border-white/[0.06] light:border-gray-200 grid gap-1.5">
                      <Label className="text-xs font-medium">Button text on Accounts</Label>
                      <Input
                        placeholder="Configure WABA API"
                        maxLength={40}
                        value={config.manual_button_label ?? ''}
                        onChange={(e) => update('manual_button_label', e.target.value)}
                        className={fieldClass}
                      />
                    </div>
                  </div>

                  {/* Meta Setup Checklist Card */}
                  <div className="p-4 rounded-xl border border-white/[0.08] bg-white/[0.01] light:bg-gray-50 light:border-gray-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-white/90 light:text-gray-900 flex items-center gap-1.5">
                        <HelpCircle className="h-4 w-4 text-violet-400" /> Meta Embedded Signup Setup Checklist
                      </span>
                      <a
                        href="https://developers.facebook.com"
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1"
                      >
                        developers.facebook.com <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                    <ol className="text-xs text-white/60 light:text-gray-600 space-y-1.5 list-decimal list-inside pl-1">
                      <li>Create a <strong>Business</strong> type app owned by your verified Meta Business account.</li>
                      <li>Add the <strong>WhatsApp</strong> and <strong>Facebook Login for Business</strong> products.</li>
                      <li>In <em>Facebook Login for Business → Configurations</em>, create an Embedded Signup configuration and copy its <strong>Configuration ID</strong>.</li>
                      <li>Add your domain (HTTPS) to the app's allowed domains and valid OAuth redirect URIs.</li>
                      <li>Request advanced access to <code className="text-[11px] text-violet-300 bg-white/[0.04] px-1 py-0.5 rounded light:bg-gray-50">whatsapp_business_management</code> and <code className="text-[11px] text-violet-300 bg-white/[0.04] px-1 py-0.5 rounded light:bg-gray-50">whatsapp_business_messaging</code>.</li>
                      <li>Paste the App ID, Configuration ID, and App Secret into the fields above.</li>
                    </ol>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* TAB 3: SUBSCRIPTIONS */}
            <TabsContent value="subscriptions" className="mt-6 space-y-6">
              <Card className={cardClass}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">Subscription Defaults</CardTitle>
                  <CardDescription className="text-xs text-white/50 light:text-gray-500">
                    Default plans and trial duration applied to new clients
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label className="text-xs font-medium">Default plan for new clients</Label>
                    <Select
                      value={config.default_plan_id || NO_PLAN}
                      onValueChange={(v) => update('default_plan_id', v === NO_PLAN ? '' : v)}
                    >
                      <SelectTrigger className={fieldClass}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_PLAN}>No plan</SelectItem>
                        {plans.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-1.5">
                    <Label className="text-xs font-medium">Currency</Label>
                    <Input value="₹ INR (Indian Rupee)" readOnly disabled className={fieldClass} />
                    <p className="text-[11px] text-white/40 light:text-gray-500">All plans and payments are in rupees.</p>
                  </div>

                  <div className="grid gap-1.5">
                    <Label className="text-xs font-medium">Free trial duration (days)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={365}
                      value={config.trial_days}
                      onChange={(e) => update('trial_days', Number(e.target.value))}
                      className={fieldClass}
                    />
                  </div>

                  <div className="grid gap-1.5">
                    <Label className="text-xs font-medium">Renewal reminder (days before)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={365}
                      value={config.renewal_reminder_days}
                      onChange={(e) => update('renewal_reminder_days', Number(e.target.value))}
                      className={fieldClass}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* TAB 4: ACCESS & MAINTENANCE */}
            <TabsContent value="access" className="mt-6 space-y-6">
              <Card className={cardClass}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">Registration & Maintenance</CardTitle>
                  <CardDescription className="text-xs text-white/50 light:text-gray-500">
                    Control public registration and global platform availability
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Row label="Allow client sign-up" hint="New businesses can register themselves on the pricing / signup page">
                    <Switch
                      checked={config.allow_vendor_signup}
                      onCheckedChange={(v) => update('allow_vendor_signup', v)}
                    />
                  </Row>
                  <Row label="Require email verification" hint="Clients must confirm their email before entering workspace">
                    <Switch
                      checked={config.require_email_verification}
                      onCheckedChange={(v) => update('require_email_verification', v)}
                    />
                  </Row>
                  <Row label="Maintenance mode" hint="Blocks regular client access and displays maintenance banner">
                    <Switch
                      checked={config.maintenance_mode}
                      onCheckedChange={(v) => update('maintenance_mode', v)}
                    />
                  </Row>
                  {config.maintenance_mode && (
                    <div className="grid gap-1.5 pt-4">
                      <Label className="text-xs font-medium text-amber-400 flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5" /> Maintenance Message
                      </Label>
                      <Textarea
                        rows={3}
                        value={config.maintenance_message}
                        onChange={(e) => update('maintenance_message', e.target.value)}
                        className={fieldClass}
                        placeholder="We are performing scheduled maintenance. Please check back shortly."
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </form>
  );
};

export default ConfigurationView;
