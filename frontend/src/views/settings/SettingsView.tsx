import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore, type CallRingtone, type User, type UserSettings } from '@/stores/auth';
import { organizationService, usersService } from '@/services/api';
import { readData } from '@/services/response';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Settings, Bell, Phone, Globe, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

/** GET /org/settings -> data: { name, settings: {...} } */
interface OrgSettingsResponse {
  name?: string;
  settings?: {
    mask_phone_numbers?: boolean;
    timezone?: string;
    date_format?: string;
    calling_enabled?: boolean;
    max_call_duration?: number;
    transfer_timeout_secs?: number;
    meta_app_id?: string;
    meta_config_id?: string;
    has_meta_app_secret?: boolean;
  };
}

// Values offered in the selects; a saved value outside these is shown as an extra option.
const KNOWN_TIMEZONES = ['UTC', 'America/New_York', 'Europe/London', 'Asia/Kolkata', 'Asia/Tokyo'];
const KNOWN_DATE_FORMATS = ['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY'];

/** The backend's `{ status: "error", message }` text, if there is one. */
const errorMessage = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;

export const SettingsView: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { hasPermission } = useAuthStore();
  // Meta App credentials are gated on accounts:write by PUT /org/settings.
  const canWriteAccounts = hasPermission('accounts', 'write');

  const [activeTab, setActiveTab] = useState('general');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // General Settings
  const [orgName, setOrgName] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [dateFormat, setDateFormat] = useState('YYYY-MM-DD');
  const [maskPhone, setMaskPhone] = useState(false);
  const [metaAppId, setMetaAppId] = useState('');
  const [metaConfigId, setMetaConfigId] = useState('');

  // Notification Settings
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [messageAlerts, setMessageAlerts] = useState(true);
  const [campaignAlerts, setCampaignAlerts] = useState(true);
  const [callRingtone, setCallRingtone] = useState<CallRingtone>('ring');

  // Calling Settings
  const [callingEnabled, setCallingEnabled] = useState(false);
  const [maxDuration, setMaxDuration] = useState(300);
  const [transferTimeout, setTransferTimeout] = useState(120);

  useEffect(() => {
    organizationService.getSettings().then((res) => {
      const data = readData<OrgSettingsResponse | null>(res);
      if (!data) return;
      const s = data.settings || {};
      if (data.name) setOrgName(data.name);
      if (s.timezone) setTimezone(s.timezone);
      if (s.date_format) setDateFormat(s.date_format);
      if (s.mask_phone_numbers !== undefined) setMaskPhone(s.mask_phone_numbers);
      setMetaAppId(s.meta_app_id || '');
      setMetaConfigId(s.meta_config_id || '');
      if (s.calling_enabled !== undefined) setCallingEnabled(s.calling_enabled);
      if (s.max_call_duration) setMaxDuration(s.max_call_duration);
      if (s.transfer_timeout_secs) setTransferTimeout(s.transfer_timeout_secs);
    }).catch(() => {});

    // Notification preferences live on the user (GET /me -> data: user, settings omitted when empty).
    usersService.me().then((res) => {
      const settings = readData<User | null>(res)?.settings;
      if (!settings) return;
      setEmailAlerts(settings.email_notifications ?? true);
      setMessageAlerts(settings.new_message_alerts ?? true);
      setCampaignAlerts(settings.campaign_updates ?? true);
      setCallRingtone(settings.call_ringtone ?? 'ring');
    }).catch(() => {});
  }, []);

  const saveGeneral = async () => {
    setIsSubmitting(true);
    try {
      await organizationService.updateSettings({
        name: orgName.trim() || undefined,
        timezone,
        date_format: dateFormat,
        mask_phone_numbers: maskPhone,
        // Sending these without accounts:write makes the whole save fail with 403.
        ...(canWriteAccounts ? { meta_app_id: metaAppId.trim(), meta_config_id: metaConfigId.trim() } : {}),
      });
      toast.success(t('settings.generalSaved') || 'Organization settings saved');
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to save settings'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const saveNotifications = async () => {
    setIsSubmitting(true);
    try {
      const res = await usersService.updateSettings({
        email_notifications: emailAlerts,
        new_message_alerts: messageAlerts,
        campaign_updates: campaignAlerts,
        call_ringtone: callRingtone,
      });
      // Keep the signed-in user's cached settings in step (PUT /me/settings -> data: { settings }).
      const saved = readData<{ settings?: UserSettings } | null>(res)?.settings;
      const { user: currentUser, setAuth } = useAuthStore.getState();
      if (saved && currentUser) setAuth({ ...currentUser, settings: saved });
      toast.success('Notification preferences saved');
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to save preferences'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const saveCalling = async () => {
    setIsSubmitting(true);
    try {
      await organizationService.updateSettings({
        calling_enabled: callingEnabled,
        max_call_duration: maxDuration,
        transfer_timeout_secs: transferTimeout,
      });
      toast.success('Calling settings saved');
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to save calling settings'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const changeLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('locale', lang);
    if (lang === 'ar') {
      document.documentElement.dir = 'rtl';
    } else {
      document.documentElement.dir = 'ltr';
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0a0b] light:bg-gray-50 overflow-hidden">
      <PageHeader
        title={t('settings.title') || 'Workspace Settings'}
        subtitle={t('settings.subtitle') || 'Configure organization parameters, credentials and alerts'}
        icon={Settings}
        iconGradient="bg-gradient-to-br from-gray-500 to-gray-600 shadow-gray-500/20"
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-4xl mx-auto w-full">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 mb-6 bg-white/[0.04] border border-white/[0.08] light:bg-gray-50 light:border-gray-200">
            <TabsTrigger value="general">
              <Settings className="h-4 w-4 mr-2" />
              General
            </TabsTrigger>
            <TabsTrigger value="notifications">
              <Bell className="h-4 w-4 mr-2" />
              Notifications
            </TabsTrigger>
            <TabsTrigger value="calling">
              <Phone className="h-4 w-4 mr-2" />
              Calling & Voice
            </TabsTrigger>
          </TabsList>

          {/* General Tab */}
          <TabsContent value="general" className="space-y-6">
            <Card className="card-depth border-white/[0.08] bg-[#141415] text-white light:border-gray-200 light:bg-white light:text-gray-900">
              <CardHeader>
                <CardTitle className="text-base font-semibold">General Information</CardTitle>
                <CardDescription className="text-xs text-white/50 light:text-gray-500">
                  Default organization preferences and locale options
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="orgName" className="text-xs">Organization Name</Label>
                  <Input
                    id="orgName"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-1.5">
                    <Label className="text-xs">Default Timezone</Label>
                    <Select value={timezone} onValueChange={setTimezone}>
                      <SelectTrigger>
                        <SelectValue placeholder="Timezone" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="UTC">UTC (Coordinated Universal Time)</SelectItem>
                        <SelectItem value="America/New_York">Eastern Time (US & Canada)</SelectItem>
                        <SelectItem value="Europe/London">London (GMT / BST)</SelectItem>
                        <SelectItem value="Asia/Kolkata">India Standard Time (IST)</SelectItem>
                        <SelectItem value="Asia/Tokyo">Tokyo (JST)</SelectItem>
                        {!KNOWN_TIMEZONES.includes(timezone) && (
                          <SelectItem value={timezone}>{timezone}</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-1.5">
                    <Label className="text-xs">Date Format</Label>
                    <Select value={dateFormat} onValueChange={setDateFormat}>
                      <SelectTrigger>
                        <SelectValue placeholder="Format" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                        <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                        <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                        {!KNOWN_DATE_FORMATS.includes(dateFormat) && (
                          <SelectItem value={dateFormat}>{dateFormat}</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-1.5">
                  <Label className="text-xs flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5 text-white/60 light:text-gray-600" /> Interface Language
                  </Label>
                  <Select value={i18n.language} onValueChange={changeLanguage}>
                    <SelectTrigger className="max-w-xs">
                      <SelectValue placeholder="Select Language" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="es">Español</SelectItem>
                      <SelectItem value="hi">हिन्दी</SelectItem>
                      <SelectItem value="pt">Português</SelectItem>
                      <SelectItem value="ta">தமிழ்</SelectItem>
                      <SelectItem value="ar">العربية (RTL)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Separator className="bg-white/[0.08] light:bg-gray-100" />

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-xs text-white light:text-gray-900">Mask Customer Phone Numbers</p>
                    <p className="text-[11px] text-white/40 light:text-gray-400">
                      Hide middle digits for privacy compliance (e.g. +1 (555) ***-5678)
                    </p>
                  </div>
                  <Switch checked={maskPhone} onCheckedChange={setMaskPhone} />
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-500 text-white"
                    disabled={isSubmitting}
                    onClick={saveGeneral}
                  >
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save General Settings
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Meta App Credentials */}
            <Card className="card-depth border-white/[0.08] bg-[#141415] text-white light:border-gray-200 light:bg-white light:text-gray-900">
              <CardHeader>
                <CardTitle className="text-base font-semibold">Meta Developer Credentials</CardTitle>
                <CardDescription className="text-xs text-white/50 light:text-gray-500">
                  Configure WhatsApp Cloud API App ID and Embedded Signup configuration
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-1.5">
                    <Label htmlFor="metaAppId" className="text-xs">Meta App ID</Label>
                    <Input
                      id="metaAppId"
                      placeholder="e.g. 10293847561029"
                      value={metaAppId}
                      onChange={(e) => setMetaAppId(e.target.value)}
                      disabled={!canWriteAccounts}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="metaConfigId" className="text-xs">Embedded Config ID</Label>
                    <Input
                      id="metaConfigId"
                      placeholder="e.g. 982347102938"
                      value={metaConfigId}
                      onChange={(e) => setMetaConfigId(e.target.value)}
                      disabled={!canWriteAccounts}
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-500 text-white"
                    disabled={isSubmitting || !canWriteAccounts}
                    onClick={saveGeneral}
                  >
                    Save Credentials
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications">
            <Card className="card-depth border-white/[0.08] bg-[#141415] text-white light:border-gray-200 light:bg-white light:text-gray-900">
              <CardHeader>
                <CardTitle className="text-base font-semibold">Notification Preferences</CardTitle>
                <CardDescription className="text-xs text-white/50 light:text-gray-500">
                  Control alert banners, sound notifications and email digests
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-xs text-white light:text-gray-900">Email Notification Digests</p>
                    <p className="text-[11px] text-white/40 light:text-gray-400">Receive summaries for unread messages and system alerts</p>
                  </div>
                  <Switch checked={emailAlerts} onCheckedChange={setEmailAlerts} />
                </div>

                <Separator className="bg-white/[0.08] light:bg-gray-100" />

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-xs text-white light:text-gray-900">New Message In-App Alerts</p>
                    <p className="text-[11px] text-white/40 light:text-gray-400">Play audio ping and desktop toast when customers message</p>
                  </div>
                  <Switch checked={messageAlerts} onCheckedChange={setMessageAlerts} />
                </div>

                <Separator className="bg-white/[0.08] light:bg-gray-100" />

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-xs text-white light:text-gray-900">Campaign Progress Updates</p>
                    <p className="text-[11px] text-white/40 light:text-gray-400">Notify when broadcast campaigns complete or encounter errors</p>
                  </div>
                  <Switch checked={campaignAlerts} onCheckedChange={setCampaignAlerts} />
                </div>

                <Separator className="bg-white/[0.08] light:bg-gray-100" />

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-xs text-white light:text-gray-900">Incoming Call Ringtone</p>
                    <p className="text-[11px] text-white/40 light:text-gray-400">Audio sound played for inbound WebRTC voice calls</p>
                  </div>
                  <Select value={callRingtone} onValueChange={(v) => setCallRingtone(v as CallRingtone)}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Ringtone" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ring">Classic Ring</SelectItem>
                      <SelectItem value="beep">Chime & Beep</SelectItem>
                      <SelectItem value="none">Silent (No Audio)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-500 text-white"
                    disabled={isSubmitting}
                    onClick={saveNotifications}
                  >
                    Save Preferences
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Calling & Voice Tab */}
          <TabsContent value="calling">
            <Card className="card-depth border-white/[0.08] bg-[#141415] text-white light:border-gray-200 light:bg-white light:text-gray-900">
              <CardHeader>
                <CardTitle className="text-base font-semibold">VoIP Voice Calling Service</CardTitle>
                <CardDescription className="text-xs text-white/50 light:text-gray-500">
                  Manage WebRTC voice calling and call queues
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-xs text-white light:text-gray-900">Enable Inbound / Outbound Calling</p>
                    <p className="text-[11px] text-white/40 light:text-gray-400">Activate WebRTC phone dialing for support agents</p>
                  </div>
                  <Switch checked={callingEnabled} onCheckedChange={setCallingEnabled} />
                </div>

                <Separator className="bg-white/[0.08] light:bg-gray-100" />

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-1.5">
                    <Label htmlFor="maxDur" className="text-xs">Max Call Duration (Seconds)</Label>
                    <Input
                      id="maxDur"
                      type="number"
                      value={maxDuration}
                      onChange={(e) => setMaxDuration(Number(e.target.value))}
                    />
                  </div>

                  <div className="grid gap-1.5">
                    <Label htmlFor="transTimeout" className="text-xs">Transfer Timeout (Seconds)</Label>
                    <Input
                      id="transTimeout"
                      type="number"
                      value={transferTimeout}
                      onChange={(e) => setTransferTimeout(Number(e.target.value))}
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-500 text-white"
                    disabled={isSubmitting}
                    onClick={saveCalling}
                  >
                    Save Calling Settings
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};
export default SettingsView;
