import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Activity,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  ExternalLink,
  Loader2,
  Megaphone,
  Phone,
  RefreshCw,
  Save,
  Unplug,
  Users,
  FileText,
} from 'lucide-react';
import { api, accountsService } from '@/services/api';
import { readData } from '@/services/response';
import { useAuthStore } from '@/stores/auth';
import { useBranding } from '@/services/branding';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useEmbeddedSignup, type EmbeddedSignupResult } from './useEmbeddedSignup';
import { ConnectWhatsAppButton, useConnectWhatsApp } from '@/components/whatsapp/ConnectWhatsAppButton';
import { ManualWhatsAppSetupButton } from '@/components/whatsapp/ManualWhatsAppSetup';

// WhatsApp Cloud API Setup: connect a number with Facebook (Embedded Signup),
// set a test contact, and see the number's phone numbers and health.

interface Account {
  id: string;
  name: string;
  phone_id: string;
  business_id: string;
  status: string;
}

interface SyncedNumber {
  phone_id: string;
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
  status?: string;
  connected: boolean;
  account_name?: string;
}

interface Health {
  business_id: string;
  checked_at: string;
  overall_health: string;
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
  account_review_status?: string;
  phone_status?: string;
  webhook_last_at?: string;
  webhook_last_result?: string;
  webhook_url?: string;
}

const errorMessage = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;

const FacebookIcon: React.FC<{ className?: string }> = ({ className = 'h-5 w-5' }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M24 12.07C24 5.41 18.63 0 12 0S0 5.41 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z" />
  </svg>
);

const healthTone: Record<string, string> = {
  AVAILABLE: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  LIMITED: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  BLOCKED: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

const Section: React.FC<{ title: React.ReactNode; className?: string; children: React.ReactNode }> = ({
  title,
  className,
  children,
}) => (
  <section
    className={cn(
      'relative rounded-xl border border-gray-200 bg-white p-5 pt-8 shadow-sm dark:border-white/10 dark:bg-white/[0.03]',
      className
    )}
  >
    <div className="absolute -top-4 left-5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-[#0f5c62] shadow-sm dark:border-white/10 dark:bg-[#0b1215] dark:text-teal-300">
      {title}
    </div>
    {children}
  </section>
);

export const WhatsAppSetupView: React.FC = () => {
  const navigate = useNavigate();
  const branding = useBranding();
  const { hasPermission } = useAuthStore();
  const canWrite = hasPermission('accounts', 'write');
  const { visible: connectVisible } = useConnectWhatsApp();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string>('');
  const selected = accounts.find((a) => a.id === selectedId) ?? accounts[0];

  const [result, setResult] = useState<EmbeddedSignupResult | null>(null);

  const [numbers, setNumbers] = useState<SyncedNumber[] | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);

  const [testOpen, setTestOpen] = useState(true);
  const [testPhone, setTestPhone] = useState('');
  const [testConfigured, setTestConfigured] = useState(false);
  const [savingTest, setSavingTest] = useState(false);

  const [registering, setRegistering] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const loadAccounts = useCallback(async () => {
    setAccountsLoading(true);
    try {
      const res = await accountsService.list();
      const list = readData<{ accounts?: Account[] }>(res)?.accounts ?? [];
      setAccounts(list);
      setSelectedId((prev) => (list.some((a) => a.id === prev) ? prev : list[0]?.id ?? ''));
    } catch (err) {
      toast.error(errorMessage(err, 'Could not load your WhatsApp numbers'));
    } finally {
      setAccountsLoading(false);
    }
  }, []);

  const onConnected = useCallback(
    (r: EmbeddedSignupResult) => {
      setResult(r);
      void loadAccounts();
    },
    [loadAccounts]
  );
  const { loading: cfgLoading, connecting, embeddedAvailable, manualAvailable, embeddedLabel, launch } =
    useEmbeddedSignup(onConnected);

  const refreshHealth = useCallback(async (id: string) => {
    setHealthLoading(true);
    setHealthError(null);
    try {
      const res = await api.get(`/accounts/${id}/health`);
      setHealth(readData<Health>(res));
    } catch (err) {
      setHealth(null);
      setHealthError(errorMessage(err, 'Could not check the status with Meta'));
    } finally {
      setHealthLoading(false);
    }
  }, []);

  const resync = async () => {
    if (!selected) return;
    setSyncing(true);
    try {
      const res = await api.post(`/accounts/${selected.id}/sync-phone-numbers`, {});
      setNumbers(readData<{ phone_numbers?: SyncedNumber[] }>(res)?.phone_numbers ?? []);
      toast.success('Phone numbers synced from Meta');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not sync phone numbers'));
    } finally {
      setSyncing(false);
    }
  };

  const saveTestContact = async () => {
    setSavingTest(true);
    try {
      const res = await api.put('/whatsapp-setup/test-contact', { phone: testPhone });
      const data = readData<{ phone: string; configured: boolean }>(res);
      setTestPhone(data?.phone ?? '');
      setTestConfigured(Boolean(data?.configured));
      toast.success(data?.configured ? 'Test contact saved' : 'Test contact removed');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save the test contact'));
    } finally {
      setSavingTest(false);
    }
  };

  const registerNumber = async () => {
    if (!selected) return;
    const pin = window.prompt(
      'If this number already has a two-step verification PIN, enter it. Leave empty to set a new one.',
      ''
    );
    if (pin === null) return;
    setRegistering(true);
    try {
      const res = await api.post(`/accounts/${selected.id}/register`, pin.trim() ? { pin: pin.trim() } : {});
      const data = readData<{ pin?: string }>(res);
      toast.success(data?.pin ? `Number registered. PIN: ${data.pin} (keep it safe)` : 'Number registered');
      void loadAccounts();
      void refreshHealth(selected.id);
    } catch (err) {
      toast.error(errorMessage(err, 'Meta could not register this number'));
    } finally {
      setRegistering(false);
    }
  };

  const disconnect = async () => {
    if (!selected) return;
    setDisconnecting(true);
    try {
      await accountsService.delete(selected.id);
      toast.success(`${selected.name} disconnected`);
      setDisconnectOpen(false);
      setHealth(null);
      setNumbers(null);
      await loadAccounts();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not disconnect this number'));
    } finally {
      setDisconnecting(false);
    }
  };

  useEffect(() => {
    void loadAccounts();
    api
      .get('/whatsapp-setup/test-contact')
      .then((res) => {
        const data = readData<{ phone: string; configured: boolean }>(res);
        setTestPhone(data?.phone ?? '');
        setTestConfigured(Boolean(data?.configured));
        setTestOpen(!data?.configured);
      })
      .catch(() => {
        // Leave the field empty.
      });
  }, [loadAccounts]);

  useEffect(() => {
    setNumbers(null);
    if (selected?.id) void refreshHealth(selected.id);
    else setHealth(null);
  }, [selected?.id, refreshHealth]);

  const wabaQuery = selected?.business_id ? `?waba_id=${encodeURIComponent(selected.business_id)}` : '';
  const ready = Boolean(selected);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="WhatsApp Cloud API Setup"
        description="Connect your WhatsApp Business number directly with your Facebook account"
        icon={Phone}
        backLink="/settings/accounts"
      />

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-3">
          {/* Left: connect, test contact, next steps */}
          <div className="space-y-8 pt-4 lg:col-span-2">
            <Section title="WhatsApp Setup with Facebook">
              {cfgLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                </div>
              ) : connectVisible ? (
                <div className="flex flex-col items-center gap-3 py-4 text-center">
                  <div className="flex w-full flex-wrap items-center justify-center gap-3">
                    <ManualWhatsAppSetupButton size="lg" className="w-auto max-w-full px-5" onConnected={loadAccounts} />
                    <ConnectWhatsAppButton size="lg" className="w-auto max-w-full px-5" />
                  </div>
                  <p className="max-w-md text-xs text-gray-500 dark:text-gray-400">
                    Facebook opens in a new tab. Log in, pick or create your Business portfolio, WhatsApp Business
                    Account and phone number, and finish. Then come back and click “Re-sync Phone Numbers”.
                  </p>
                  {embeddedAvailable && canWrite && (
                    <button
                      type="button"
                      onClick={() => launch()}
                      disabled={connecting}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-[#1877F2] hover:underline disabled:opacity-60"
                    >
                      {connecting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Or connect in a popup and add the number here automatically
                    </button>
                  )}
                </div>
              ) : embeddedAvailable ? (
                <div className="flex flex-col items-center gap-3 py-4 text-center">
                  <div className="flex w-full flex-wrap items-center justify-center gap-3">
                    <ManualWhatsAppSetupButton size="lg" className="w-auto max-w-full px-5" onConnected={loadAccounts} />
                    <Button
                      size="lg"
                      onClick={() => launch()}
                      disabled={connecting || !canWrite}
                      className="h-14 w-full max-w-md bg-[#1877F2] px-8 text-base font-semibold text-white shadow-md shadow-blue-500/20 hover:bg-[#166fe5] w-auto max-w-full px-5"
                    >
                      {connecting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <FacebookIcon className="mr-2.5 h-5 w-5" />}
                      {embeddedLabel}
                    </Button>
                  </div>
                  <p className="max-w-md text-xs text-gray-500 dark:text-gray-400">
                    A Facebook window opens. Log in, pick or create your Business portfolio, WhatsApp Business Account
                    and phone number, then confirm. The number is added here automatically.
                  </p>
                  {!canWrite && (
                    <p className="text-xs text-amber-600">Only an admin can connect a number.</p>
                  )}
                </div>
              ) : (
                <div className="flex items-start gap-3 py-2 text-sm">
                  <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                  <div className="space-y-2">
                    <p className="font-medium text-gray-900 dark:text-white">Connect with Facebook isn’t turned on yet</p>
                    <p className="text-gray-500 dark:text-gray-400">
                      The platform administrator needs to finish the Meta setup.
                      {branding.support_email && ` Contact ${branding.support_email} for help.`}
                    </p>
                    {manualAvailable && <ManualWhatsAppSetupButton size="md" onConnected={loadAccounts} />}
                  </div>
                </div>
              )}

              {result && (
                <div
                  className={cn(
                    'mt-4 flex items-start gap-2 rounded-lg p-3 text-sm',
                    result.status === 'connected'
                      ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200'
                      : 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200'
                  )}
                >
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    {result.status === 'connected'
                      ? `${result.name || 'Your number'} is connected and ready.`
                      : 'Number added. Finish phone registration on Settings → Accounts before sending.'}
                    {result.pin && (
                      <div className="mt-1">
                        Two-step verification PIN: <code className="font-mono font-semibold">{result.pin}</code>. Keep it safe.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Section>

            <Section
              title={
                <button type="button" onClick={() => setTestOpen((o) => !o)} className="flex items-center gap-2">
                  Test Contact for Campaign
                  <span className="text-xs font-normal text-gray-500 dark:text-gray-400">Click to expand/collapse</span>
                  <ChevronDown className={cn('h-4 w-4 transition-transform', testOpen && 'rotate-180')} />
                </button>
              }
            >
              {testOpen && (
                <div className="mb-4 space-y-2">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Campaign test messages go to this WhatsApp number. Include the country code, e.g. 919876543210.
                  </p>
                  <div className="flex max-w-md gap-2">
                    <Input
                      value={testPhone}
                      onChange={(e) => setTestPhone(e.target.value)}
                      placeholder="919876543210"
                      inputMode="tel"
                      disabled={!canWrite || savingTest}
                    />
                    <Button onClick={saveTestContact} disabled={!canWrite || savingTest}>
                      {savingTest ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
                      Save
                    </Button>
                  </div>
                </div>
              )}
              {testConfigured ? (
                <Badge className="gap-1.5 border-0 bg-emerald-500 px-3 py-1.5 text-sm font-bold uppercase text-white hover:bg-emerald-500">
                  <CheckCircle2 className="h-4 w-4" /> Configured
                </Badge>
              ) : (
                <Badge variant="outline" className="px-3 py-1.5 text-sm font-semibold uppercase text-gray-500">
                  Not set
                </Badge>
              )}
            </Section>

            <div className={cn('relative rounded-xl p-2 transition', !ready && 'pointer-events-none select-none opacity-50 blur-[2px]')}>
              <h3 className="text-2xl font-semibold text-gray-900 dark:text-white">It’s ready</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                To send template messages, create templates and get them approved for WhatsApp Business.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => navigate('/templates')}>
                  <FileText className="mr-1.5 h-4 w-4" /> Manage Templates
                </Button>
                <Button variant="outline" onClick={() => navigate('/contacts')}>
                  <Users className="mr-1.5 h-4 w-4" /> Manage Contacts
                </Button>
                <Button className="bg-[#0f5c62] text-white hover:bg-[#0b4a4f]" onClick={() => navigate('/campaigns')}>
                  <Megaphone className="mr-1.5 h-4 w-4" /> Create New Campaign
                </Button>
                {canWrite && (
                  <Button variant="destructive" onClick={() => setDisconnectOpen(true)}>
                    <Unplug className="mr-1.5 h-4 w-4" /> Disconnect Account
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Right: business info */}
          <div className="pt-4">
            <Section title="WhatsApp Business Info" className="space-y-8">
              {accountsLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                </div>
              ) : !selected ? (
                <p className="py-4 text-sm text-gray-500 dark:text-gray-400">
                  No WhatsApp number connected yet. Use “{embeddedLabel}” to connect one.
                </p>
              ) : (
                <>
                  {accounts.length > 1 && (
                    <select
                      value={selected.id}
                      onChange={(e) => setSelectedId(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-transparent"
                      aria-label="WhatsApp number"
                    >
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  )}

                  <Section title="Phone Numbers" className="mt-2">
                    <div className="space-y-3">
                      {numbers === null ? (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          <span className="font-medium text-gray-800 dark:text-gray-200">{selected.name}</span> · Phone ID{' '}
                          {selected.phone_id}
                        </p>
                      ) : numbers.length === 0 ? (
                        <p className="text-xs text-gray-500">Meta returned no phone numbers for this account.</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {numbers.map((n) => (
                            <li key={n.phone_id} className="flex items-center justify-between gap-2 text-sm">
                              <span className="min-w-0 truncate">
                                {n.display_phone_number || n.phone_id}
                                {n.verified_name && <span className="text-xs text-gray-500"> · {n.verified_name}</span>}
                              </span>
                              <Badge variant="outline" className="shrink-0 text-[10px]">
                                {n.connected ? 'Connected' : n.status || 'Not added'}
                              </Badge>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" onClick={resync} disabled={syncing} className="bg-emerald-500 text-white hover:bg-emerald-600">
                          {syncing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
                          Re-sync Phone Numbers
                        </Button>
                        <MetaLink href={`https://business.facebook.com/wa/manage/phone-numbers/${wabaQuery}`}>Manage Phone Numbers</MetaLink>
                        <MetaLink href="https://business.facebook.com/billing_hub/payment_settings">Manage Payments</MetaLink>
                        <MetaLink href={`https://business.facebook.com/wa/manage/home/${wabaQuery}`}>WhatsApp Manager</MetaLink>
                      </div>
                    </div>
                  </Section>

                  {health?.phone_status && health.phone_status !== 'CONNECTED' && (
                    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700/50 dark:bg-amber-900/30 dark:text-amber-100">
                      <p className="font-medium">Number is {health.phone_status.toLowerCase()} in Meta</p>
                      <p className="mt-1 text-xs">
                        It isn’t registered for the Cloud API yet, so messages can’t be sent or received.
                      </p>
                      {canWrite && (
                        <Button size="sm" className="mt-2 bg-amber-600 text-white hover:bg-amber-500" onClick={registerNumber} disabled={registering}>
                          {registering && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                          Register number
                        </Button>
                      )}
                    </div>
                  )}

                  <Section title="Overall Health">
                    <dl className="space-y-3 text-sm">
                      <div>
                        <dt className="font-semibold text-gray-900 dark:text-white">WhatsApp Business ID</dt>
                        <dd className="break-all text-gray-600 dark:text-gray-300">{selected.business_id || '—'}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-gray-900 dark:text-white">Status as at</dt>
                        <dd className="text-gray-600 dark:text-gray-300">
                          {health ? new Date(health.checked_at).toLocaleString() : '—'}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-gray-900 dark:text-white">Overall Health</dt>
                        <dd className="mt-1">
                          {healthLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                          ) : health ? (
                            <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', healthTone[health.overall_health] ?? 'bg-gray-100 text-gray-700')}>
                              {health.overall_health}
                            </span>
                          ) : (
                            <span className="text-xs text-red-600 dark:text-red-400">{healthError ?? '—'}</span>
                          )}
                        </dd>
                      </div>
                      {health && (
                        <div>
                          <dt className="font-semibold text-gray-900 dark:text-white">Messages from Meta</dt>
                          {health.webhook_last_at ? (
                            <dd
                              className={cn(
                                'text-gray-600 dark:text-gray-300',
                                health.webhook_last_result?.startsWith('rejected') && 'text-red-600 dark:text-red-400'
                              )}
                            >
                              {new Date(health.webhook_last_at).toLocaleString()} · {health.webhook_last_result}
                            </dd>
                          ) : (
                            <dd className="space-y-1.5 text-xs text-amber-700 dark:text-amber-300">
                              <p>
                                Nothing received from Meta yet, so messages won’t show in Live Chat. In your Facebook App →
                                WhatsApp → Configuration, set this callback URL and subscribe to the “messages” field:
                              </p>
                              <code className="block break-all rounded bg-gray-100 px-2 py-1 font-mono text-[11px] text-gray-800 dark:bg-white/10 dark:text-gray-200">
                                {health.webhook_url}
                              </code>
                            </dd>
                          )}
                        </div>
                      )}
                      {health?.quality_rating && (
                        <div>
                          <dt className="font-semibold text-gray-900 dark:text-white">Quality rating</dt>
                          <dd className="text-gray-600 dark:text-gray-300">{health.quality_rating}</dd>
                        </div>
                      )}
                    </dl>
                    <Button
                      size="sm"
                      className="mt-4 bg-emerald-500 text-white hover:bg-emerald-600"
                      onClick={() => refreshHealth(selected.id)}
                      disabled={healthLoading}
                    >
                      <Activity className="mr-1.5 h-3.5 w-3.5" /> Refresh Status
                    </Button>
                  </Section>
                </>
              )}
            </Section>
          </div>
        </div>
      </div>

      <Dialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect {selected?.name}?</DialogTitle>
            <DialogDescription>
              Messages, campaigns and chatbots stop using this number here. The number stays in your Meta account and can
              be connected again later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisconnectOpen(false)} disabled={disconnecting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={disconnect} disabled={disconnecting}>
              {disconnecting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const MetaLink: React.FC<{ href: string; children: React.ReactNode }> = ({ href, children }) => (
  <Button asChild size="sm" variant="secondary" className="bg-gray-600 text-white hover:bg-gray-700 dark:bg-white/10 dark:hover:bg-white/20">
    <a href={href} target="_blank" rel="noreferrer">
      {children} <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
    </a>
  </Button>
);

export default WhatsAppSetupView;
