import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  AlertTriangle,
  BookOpen,
  Check,
  CheckCircle2,
  ExternalLink,
  Facebook,
  FileCheck2,
  Flag,
  Loader2,
  LogOut,
  MessageCircle,
  PlayCircle,
  Settings2,
  ShieldAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ErrorState } from '@/components/shared/ErrorState';
import { useAuthStore } from '@/stores/auth';
import { cn } from '@/lib/utils';
import { adsApi, errorMessage, formatDate, useAdsSetup, type AdsSetup } from './adsApi';
import { AdsPage, Field, cardCls, inputCls, nativeSelectCls, outlineBtnCls, primaryBtnCls } from './AdsShared';

const STEPS: { key: keyof AdsSetup['steps']; label: string; icon: React.ElementType }[] = [
  { key: 'connect_facebook', label: 'Connect your Facebook account', icon: Facebook },
  { key: 'select_page', label: 'Select your ad page', icon: Flag },
  { key: 'link_whatsapp', label: 'Link WhatsApp number', icon: MessageCircle },
  { key: 'accept_terms', label: 'Accept Lead Form terms', icon: FileCheck2 },
];

export const AdsSetupView: React.FC = () => {
  const { setup, error, loading, reload } = useAdsSetup();
  const { hasPermission } = useAuthStore();
  const canWrite = hasPermission('campaigns', 'write');

  if (error && !setup) {
    return (
      <AdsPage title="Ads Manager Setup" subtitle="Connect Facebook, your ad page and WhatsApp" icon={Settings2}>
        <div className={cardCls}>
          <ErrorState title="Couldn't load setup" description={error} onRetry={reload} />
        </div>
      </AdsPage>
    );
  }

  if (loading && !setup) {
    return (
      <AdsPage title="Ads Manager Setup" subtitle="Connect Facebook, your ad page and WhatsApp" icon={Settings2}>
        <div className="flex items-center justify-center py-24 text-sm text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading setup…
        </div>
      </AdsPage>
    );
  }

  if (!setup) return null;
  const doneCount = STEPS.filter((s) => setup.steps[s.key]).length;

  return (
    <AdsPage title="Ads Manager Setup" subtitle="Connect Facebook, your ad page and WhatsApp" icon={Settings2} setup={setup}>
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl bg-spruce-dark text-white shadow-sm">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/[0.06]" />
        <div className="absolute right-24 -bottom-20 h-40 w-40 rounded-full bg-white/[0.04]" />
        <div className="relative p-5 sm:p-7">
          <span className="inline-flex items-center rounded-full bg-white/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
            {doneCount}/4 steps complete
          </span>
          <h2 className="mt-3 text-xl sm:text-2xl font-bold tracking-tight">Set up Ads Manager</h2>
          <p className="mt-1 text-sm sm:text-base font-medium text-white/90">
            Run ads on Facebook &amp; Instagram that land on WhatsApp
          </p>
          <p className="mt-2 max-w-2xl text-xs leading-relaxed text-white/70">
            Click-to-WhatsApp ads open a chat with your business in one tap, so every click becomes a conversation you can follow up on with
            templates, chatbots and your team. Connect your accounts once and launch ads directly from here.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-spruce-dark hover:bg-white/90"
            >
              <PlayCircle className="h-4 w-4" /> Watch tutorial
            </a>
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/30 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10"
            >
              <BookOpen className="h-4 w-4" /> Read the setup guide
            </a>
          </div>

          {/* Stepper */}
          <ol className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => {
              const done = setup.steps[s.key];
              return (
                <li
                  key={s.key}
                  className={cn(
                    'flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs',
                    done ? 'bg-white text-spruce-dark' : 'bg-white/[0.08] text-white/85'
                  )}
                >
                  <span
                    className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                      done ? 'bg-emerald-500 text-white' : 'border border-white/40 text-white'
                    )}
                  >
                    {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </span>
                  <span className="font-semibold leading-tight">{s.label}</span>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      {!setup.meta_ready && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 dark:bg-amber-950/30 dark:border-amber-900/60 dark:text-amber-200">
          <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
          <p className="leading-relaxed">
            <span className="font-semibold">The platform's Meta app isn't configured for ads yet.</span> Your platform administrator needs to set up
            and get the Meta app approved for ads before Facebook can be connected. You can still link WhatsApp, accept terms and prepare drafts.
          </p>
        </div>
      )}

      <ConnectFacebookSection setup={setup} canWrite={canWrite} onChanged={reload} />
      <SelectPageSection setup={setup} canWrite={canWrite} reload={reload} />
      <LinkWhatsAppSection setup={setup} canWrite={canWrite} reload={reload} />
      <AcceptTermsSection setup={setup} canWrite={canWrite} reload={reload} />
    </AdsPage>
  );
};

// ---------------------------------------------------------------------------

const SectionCard: React.FC<{
  step: number;
  title: string;
  description: string;
  done: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}> = ({ step, title, description, done, disabled, children }) => (
  <section className={cn(cardCls, 'p-5', disabled && 'opacity-60')}>
    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      <div className="flex items-start gap-3 min-w-0">
        <span
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold',
            done ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-spruce-light text-spruce-dark dark:bg-teal-950/60 dark:text-teal-300'
          )}
        >
          {done ? <CheckCircle2 className="h-4 w-4" /> : step}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold">{title}</h3>
            {done ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                Done
              </span>
            ) : (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600 dark:bg-white/[0.08] dark:text-gray-300">
                Pending
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{description}</p>
        </div>
      </div>
    </div>
    <div className="mt-4 md:pl-11">{children}</div>
  </section>
);

const ConnectFacebookSection: React.FC<{ setup: AdsSetup; canWrite: boolean; onChanged: () => void }> = ({
  setup,
  canWrite,
  onChanged,
}) => {
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);

  const connect = async () => {
    setBusy(true);
    setBlocked(null);
    try {
      await adsApi.connectFacebook();
      toast.success('Facebook connected');
      onChanged();
    } catch (err) {
      const msg = errorMessage(err, 'Could not connect Facebook');
      setBlocked(msg);
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await adsApi.disconnectFacebook();
      toast.success('Facebook disconnected');
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not disconnect Facebook'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard
      step={1}
      title="Connect Facebook"
      description="Log in with the Facebook account that manages your business page and ad account."
      done={setup.steps.connect_facebook}
    >
      {setup.facebook_connected ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:bg-white/[0.03] dark:border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1877F2] text-white">
              <Facebook className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-semibold">{setup.facebook_user_name || 'Facebook account'}</p>
              <p className="text-[11px] text-emerald-700 dark:text-emerald-400">Connected</p>
            </div>
          </div>
          {canWrite && (
            <Button variant="outline" size="sm" className={outlineBtnCls} disabled={busy} onClick={disconnect}>
              <LogOut className="h-3.5 w-3.5 mr-1.5" /> Disconnect
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <Button
            size="sm"
            disabled={!canWrite || busy}
            onClick={connect}
            className="h-9 rounded-xl bg-[#1877F2] hover:bg-[#166fe5] text-white text-xs font-semibold px-4 shadow-sm"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Facebook className="h-3.5 w-3.5 mr-1.5" />}
            Connect with Facebook
          </Button>
          {blocked && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs text-rose-900 dark:bg-rose-950/30 dark:border-rose-900/60 dark:text-rose-200"
            >
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div className="space-y-1 leading-relaxed">
                <p className="font-semibold">Facebook can't be connected yet</p>
                <p>{blocked}</p>
                <p className="text-rose-800/80 dark:text-rose-200/70">
                  Ask your platform super admin to configure the Meta app (App ID, secret and ads permissions) and get it approved by Meta.
                </p>
              </div>
            </div>
          )}
          {!canWrite && <p className="text-[11px] text-gray-400">You need campaign write access to change setup.</p>}
        </div>
      )}
    </SectionCard>
  );
};

const SelectPageSection: React.FC<{
  setup: AdsSetup;
  canWrite: boolean;
  reload: () => void;
}> = ({ setup, canWrite, reload }) => {
  const [pageId, setPageId] = useState(setup.page_id || '');
  const [pageName, setPageName] = useState(setup.page_name || '');
  const [busy, setBusy] = useState(false);
  const enabled = setup.facebook_connected;

  useEffect(() => {
    setPageId(setup.page_id || '');
    setPageName(setup.page_name || '');
  }, [setup.page_id, setup.page_name]);

  const save = async () => {
    setBusy(true);
    try {
      await adsApi.updateSetup({ page_id: pageId.trim(), page_name: pageName.trim() });
      toast.success('Ad page saved');
      reload();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save the page'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard
      step={2}
      title="Choose Facebook page"
      description="Ads run from a Facebook page. Pick the page your customers know you by."
      done={setup.steps.select_page}
      disabled={!enabled}
    >
      {!enabled ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">Connect Facebook first to choose a page.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="Page name" htmlFor="ads-page-name">
            <Input id="ads-page-name" className={inputCls} value={pageName} onChange={(e) => setPageName(e.target.value)} placeholder="My Business" disabled={!canWrite} />
          </Field>
          <Field label="Page ID" htmlFor="ads-page-id">
            <Input id="ads-page-id" className={inputCls} value={pageId} onChange={(e) => setPageId(e.target.value)} placeholder="1234567890" disabled={!canWrite} />
          </Field>
          <Button size="sm" className={primaryBtnCls} disabled={!canWrite || busy || !pageId.trim()} onClick={save}>
            {busy && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />} Save page
          </Button>
        </div>
      )}
    </SectionCard>
  );
};

const LinkWhatsAppSection: React.FC<{ setup: AdsSetup; canWrite: boolean; reload: () => void }> = ({ setup, canWrite, reload }) => {
  const [accounts, setAccounts] = useState<string[] | null>(null);
  const [selected, setSelected] = useState(setup.whatsapp_account || '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    adsApi
      .listAccountNames()
      .then((names) => alive && setAccounts(names))
      .catch((err) => {
        if (!alive) return;
        setAccounts([]);
        toast.error(errorMessage(err, 'Failed to load WhatsApp accounts'));
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => setSelected(setup.whatsapp_account || ''), [setup.whatsapp_account]);

  const save = async () => {
    setBusy(true);
    try {
      await adsApi.updateSetup({ whatsapp_account: selected });
      toast.success('WhatsApp number linked');
      reload();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not link the WhatsApp number'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard
      step={3}
      title="Link WhatsApp number"
      description="Chats started from your ads land on this WhatsApp Business number."
      done={setup.steps.link_whatsapp}
    >
      {accounts === null ? (
        <p className="text-xs text-gray-400 flex items-center gap-1.5">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading accounts…
        </p>
      ) : accounts.length === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-gray-300 px-4 py-3 dark:border-white/15">
          <p className="text-xs text-gray-500 dark:text-gray-400">No WhatsApp accounts connected yet.</p>
          <Link to="/settings/accounts" className="inline-flex items-center gap-1 text-xs font-semibold text-spruce-dark hover:underline dark:text-teal-300">
            Connect a WhatsApp account <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,320px)_auto] sm:items-end">
          <Field label="WhatsApp account" htmlFor="ads-wa-account">
            <select
              id="ads-wa-account"
              className={nativeSelectCls}
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              disabled={!canWrite}
            >
              <option value="">Select an account…</option>
              {accounts.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </Field>
          <Button
            size="sm"
            className={cn(primaryBtnCls, 'sm:justify-self-start')}
            disabled={!canWrite || busy || !selected || selected === setup.whatsapp_account}
            onClick={save}
          >
            {busy && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />} {setup.whatsapp_account ? 'Update number' : 'Link number'}
          </Button>
        </div>
      )}
    </SectionCard>
  );
};

const AcceptTermsSection: React.FC<{ setup: AdsSetup; canWrite: boolean; reload: () => void }> = ({ setup, canWrite, reload }) => {
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);

  const accept = async () => {
    setBusy(true);
    try {
      await adsApi.acceptTerms();
      toast.success('Lead Form terms accepted');
      reload();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not accept the terms'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard
      step={4}
      title="Accept Lead Form terms"
      description="Meta requires you to accept its Lead Ads terms before you collect leads with instant forms."
      done={setup.steps.accept_terms}
    >
      {setup.lead_terms_accepted ? (
        <p className="text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
          <CheckCircle2 className="h-4 w-4" /> Accepted {setup.lead_terms_accepted_at ? `on ${formatDate(setup.lead_terms_accepted_at, true)}` : ''}
        </p>
      ) : (
        <div className="space-y-3">
          <label className="flex items-start gap-2.5 text-xs leading-relaxed text-gray-700 dark:text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-[#0b4a4f]"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              disabled={!canWrite}
            />
            <span>
              I agree to Meta's{' '}
              <a href="#" onClick={(e) => e.preventDefault()} className="font-semibold text-spruce-dark underline dark:text-teal-300">
                Lead Ads Terms
              </a>{' '}
              and will only use collected information as described in my privacy policy.
            </span>
          </label>
          <Button size="sm" className={primaryBtnCls} disabled={!canWrite || !checked || busy} onClick={accept}>
            {busy && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />} Accept terms
          </Button>
        </div>
      )}
    </SectionCard>
  );
};

export default AdsSetupView;
