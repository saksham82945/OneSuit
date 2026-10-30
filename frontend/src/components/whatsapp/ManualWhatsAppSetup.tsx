import React, { useState } from 'react';
import { Check, Copy, ExternalLink, Eye, EyeOff, KeyRound, Loader2, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/services/api';
import { readData } from '@/services/response';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { FacebookIcon, useConnectWhatsApp } from './ConnectWhatsAppButton';

// Manual WhatsApp setup: the client enters their own Facebook App and WhatsApp
// Business Account details; the server checks them with Meta and connects the
// number. Sits to the left of the automatic "Connect WhatsApp with Facebook".

interface Phone {
  phone_id: string;
  display_phone_number: string;
  verified_name: string;
  status: string;
}

interface Connected {
  display_phone_number: string;
  webhook_subscribed: boolean;
  webhook_url: string;
  verify_token: string;
  updated: boolean;
}

const errorMessage = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;

const HelpLink: React.FC<{ href: string; children: React.ReactNode }> = ({ href, children }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400">
    {children} <ExternalLink className="h-3 w-3" />
  </a>
);

const CopyRow: React.FC<{ label: string; value: string }> = ({ label, value }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Copy failed; select the text and copy it');
    }
  };
  return (
    <div className="grid gap-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-2">
        <Input readOnly value={value} className="font-mono text-xs" />
        <Button type="button" variant="outline" size="sm" className="h-9" onClick={copy} aria-label={`Copy ${label}`}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
};

export const ManualWhatsAppSetupDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnected?: () => void;
}> = ({ open, onOpenChange, onConnected }) => {
  const [appId, setAppId] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [token, setToken] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [phones, setPhones] = useState<Phone[] | null>(null);
  const [phoneId, setPhoneId] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<Connected | null>(null);

  const reset = () => {
    setAppId('');
    setAppSecret('');
    setToken('');
    setWabaId('');
    setPhones(null);
    setPhoneId('');
    setDone(null);
  };

  const close = (o: boolean) => {
    onOpenChange(o);
    if (!o) setTimeout(reset, 200);
  };

  const submit = async () => {
    if (!token.trim() || !wabaId.trim()) {
      toast.error('Enter the access token and the WhatsApp Business Account ID');
      return;
    }
    setSaving(true);
    try {
      const res = await api.post('/whatsapp-setup/manual', {
        app_id: appId,
        app_secret: appSecret,
        access_token: token,
        business_id: wabaId,
        phone_id: phoneId || undefined,
      });
      const data = readData<{ status: string; phone_numbers?: Phone[] } & Connected>(res);
      if (data?.status === 'choose_phone') {
        setPhones(data.phone_numbers ?? []);
        setPhoneId(data.phone_numbers?.[0]?.phone_id ?? '');
        toast.info('This account has more than one number. Pick one and save again.');
        return;
      }
      if (data) {
        setDone(data);
        toast.success(data.updated ? 'Number details updated' : 'WhatsApp number connected');
        onConnected?.();
      }
    } catch (err) {
      toast.error(errorMessage(err, 'Could not connect this number'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FacebookIcon className="h-5 w-5 text-[#1877F2]" /> Manual setup with Facebook
          </DialogTitle>
          <DialogDescription>
            Use your own Facebook App and WhatsApp Business Account. We check the details with Meta and connect your number.
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">
              {done.display_phone_number || 'Your number'} is connected.
              {done.webhook_subscribed
                ? ' Messages will start arriving here.'
                : ' Meta did not confirm the webhook yet; add the details below in your Facebook App.'}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              In your Facebook App → WhatsApp → Configuration, set the callback URL and verify token below, then subscribe to the
              “messages” field.
            </p>
            <CopyRow label="Callback URL" value={done.webhook_url} />
            <CopyRow label="Verify token" value={done.verify_token} />
            <DialogFooter>
              <Button onClick={() => close(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-5">
            <section className="space-y-3 rounded-lg border border-gray-200 p-4 dark:border-white/10">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-[#0f5c62] dark:text-teal-300">1. Facebook App</h3>
                <HelpLink href="https://developers.facebook.com/apps">Create or select Facebook App</HelpLink>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Choose “Business” as the app type. You’ll find the App ID and App Secret in App settings → Basic.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label className="text-xs">Facebook App ID</Label>
                  <Input value={appId} onChange={(e) => setAppId(e.target.value)} placeholder="Your Facebook App ID" autoComplete="off" />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Facebook App Secret</Label>
                  <Input
                    type="password"
                    value={appSecret}
                    onChange={(e) => setAppSecret(e.target.value)}
                    placeholder="Your Facebook App Secret"
                    autoComplete="new-password"
                  />
                </div>
              </div>
            </section>

            <section className="space-y-3 rounded-lg border border-gray-200 p-4 dark:border-white/10">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-[#0f5c62] dark:text-teal-300">2. WhatsApp integration</h3>
                <HelpLink href="https://developers.facebook.com/tools/debug/accesstoken/">Debug token</HelpLink>
              </div>
              <div className="grid gap-1.5">
                <Label className="flex items-center gap-1 text-xs">
                  <KeyRound className="h-3.5 w-3.5" /> Access token *
                </Label>
                <div className="relative">
                  <Input
                    type={showToken ? 'text' : 'password'}
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="Your access token"
                    autoComplete="off"
                    className="pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400"
                    aria-label={showToken ? 'Hide token' : 'Show token'}
                  >
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  A temporary token expires in 24 hours. Use a permanent (System User) token so the number keeps working.
                </p>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">WhatsApp Business Account ID *</Label>
                <Input
                  value={wabaId}
                  onChange={(e) => {
                    setWabaId(e.target.value);
                    setPhones(null);
                    setPhoneId('');
                  }}
                  placeholder="Your WhatsApp Business Account ID"
                  autoComplete="off"
                />
              </div>
              {phones && phones.length > 1 && (
                <div className="grid gap-1.5">
                  <Label className="text-xs">Phone number</Label>
                  <select
                    value={phoneId}
                    onChange={(e) => setPhoneId(e.target.value)}
                    className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm dark:border-white/10 dark:bg-transparent"
                  >
                    {phones.map((p) => (
                      <option key={p.phone_id} value={p.phone_id}>
                        {p.display_phone_number || p.phone_id}
                        {p.verified_name ? ` · ${p.verified_name}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </section>

            <DialogFooter>
              <Button variant="outline" onClick={() => close(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={saving} className="bg-emerald-600 text-white hover:bg-emerald-500">
                {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Save and connect
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

const sizes = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
  md: 'h-9 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-14 w-full max-w-md px-8 text-base gap-2.5 rounded-xl font-semibold',
};

/** "Manual setup" button that opens the dialog. Hidden when the super admin turned manual connection off. */
export const ManualWhatsAppSetupButton: React.FC<{
  size?: keyof typeof sizes;
  className?: string;
  onConnected?: () => void;
}> = ({ size = 'sm', className, onConnected }) => {
  const { manualVisible } = useConnectWhatsApp();
  const [open, setOpen] = useState(false);
  if (!manualVisible) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'inline-flex shrink-0 items-center justify-center whitespace-nowrap border border-[#1877F2]/40 bg-white font-medium text-[#1877F2] shadow-sm transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:bg-transparent dark:hover:bg-blue-950/40',
          sizes[size],
          className
        )}
        title="Enter your Facebook App and WhatsApp Business Account details yourself"
      >
        <Wrench className={size === 'lg' ? 'h-5 w-5' : 'h-3.5 w-3.5'} />
        Manual setup with Facebook
      </button>
      <ManualWhatsAppSetupDialog open={open} onOpenChange={setOpen} onConnected={onConnected} />
    </>
  );
};
