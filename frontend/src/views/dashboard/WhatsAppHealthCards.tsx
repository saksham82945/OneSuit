import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Gauge, Phone, RefreshCw, ShieldCheck } from 'lucide-react';
import { api } from '@/services/api';
import { readData } from '@/services/response';
import { primaryAccount, useWhatsAppAccounts } from '@/hooks/useWhatsAppAccounts';
import { Skeleton } from '@/components/shared/Skeleton';
import { cn } from '@/lib/utils';
import { describeMessagingTier, describeQuality, describeSendHealth, type Tone } from './whatsappHealth';

/** GET /api/accounts/{id}/health (handlers/whatsapp_setup.go GetAccountHealth). */
interface AccountHealth {
  checked_at: string;
  overall_health?: string;
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
  phone_status?: string;
  name_status?: string;
  messaging_limit_tier?: string;
}

// Health is a live call to Meta: reuse a recent answer instead of asking on every visit.
const HEALTH_TTL_MS = 5 * 60 * 1000;
const healthCache = new Map<string, { at: number; health: AccountHealth }>();

const toneClass: Record<Tone, string> = {
  good: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300',
  warn: 'bg-amber-500/15 text-amber-800 border-amber-500/30 dark:text-amber-300',
  bad: 'bg-red-500/15 text-red-700 border-red-500/30 dark:text-red-300',
  neutral: 'bg-gray-500/10 text-gray-700 border-gray-400/30 dark:text-gray-300',
};

const Pill: React.FC<{ tone: Tone; children: React.ReactNode }> = ({ tone, children }) => (
  <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold', toneClass[tone])}>
    {children}
  </span>
);

const Card: React.FC<{ title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }> = ({
  title,
  icon: Icon,
  children,
}) => (
  <div className="flex min-w-0 flex-col justify-between rounded-2xl border border-gray-200/90 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#141b1a]">
    <div className="flex items-center justify-between gap-2">
      <span className="truncate text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{title}</span>
      <Icon className="h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400" />
    </div>
    <div className="mt-2 min-w-0">{children}</div>
  </div>
);

const LoadingBody = () => (
  <div className="space-y-2" role="status" aria-label="Loading">
    <Skeleton className="h-5 w-24" />
    <Skeleton className="h-3 w-32" />
  </div>
);

/**
 * Live status of the workspace's sending number from Meta: number and send
 * status, quality rating and messaging-limit tier. Nothing is shown for users
 * who can't read accounts or before a number is connected (the Connect
 * WhatsApp card covers that).
 */
export const WhatsAppHealthCards: React.FC = () => {
  const { accounts, loading: accountsLoading } = useWhatsAppAccounts();
  const account = primaryAccount(accounts);
  const accountId = account?.id;

  const [health, setHealth] = useState<AccountHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (force = false) => {
      if (!accountId) return;
      const cached = healthCache.get(accountId);
      if (!force && cached && Date.now() - cached.at < HEALTH_TTL_MS) {
        setHealth(cached.health);
        setError(null);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await api.get(`/accounts/${accountId}/health`);
        const data = readData<AccountHealth>(res);
        healthCache.set(accountId, { at: Date.now(), health: data });
        setHealth(data);
      } catch (err) {
        const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
        setError(message || "Couldn't reach Meta");
      } finally {
        setLoading(false);
      }
    },
    [accountId]
  );

  useEffect(() => {
    setHealth(null);
    load();
  }, [load]);

  if (accountsLoading) {
    return (
      <>
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-2xl border border-gray-200/90 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#141b1a]">
            <Skeleton className="h-3 w-28" />
            <div className="mt-3">
              <LoadingBody />
            </div>
          </div>
        ))}
      </>
    );
  }
  if (!account) return null;

  const busy = loading && !health;
  const send = describeSendHealth(health?.overall_health);
  const quality = describeQuality(health?.quality_rating);
  const tier = describeMessagingTier(health?.messaging_limit_tier);
  const checked = health?.checked_at ? new Date(health.checked_at) : null;

  const errorBody = (
    <div>
      <p className="text-xs font-semibold text-gray-900 dark:text-white">Status unavailable</p>
      <p className="mt-0.5 line-clamp-2 text-[11px] text-gray-500 dark:text-gray-400">{error}</p>
    </div>
  );

  return (
    <>
      <Card title="WhatsApp number" icon={Phone}>
        {busy ? (
          <LoadingBody />
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-bold text-gray-900 dark:text-white">
                {health?.verified_name || account.display_name || account.name}
              </span>
              {health && <Pill tone={send.tone}>{send.label}</Pill>}
            </div>
            <p className="mt-0.5 truncate text-[11px] text-gray-500 dark:text-gray-400">
              {health?.display_phone_number || account.phone_number || 'Number pending'}
              {health?.phone_status ? ` · ${health.phone_status.toLowerCase()}` : ''}
            </p>
            <div className="mt-1.5 flex items-center gap-2 text-[10px] text-gray-400">
              {error ? (
                <span className="truncate text-amber-700 dark:text-amber-300">{error}</span>
              ) : checked && !Number.isNaN(checked.getTime()) ? (
                <span>Checked {checked.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              ) : null}
              <button
                type="button"
                onClick={() => load(true)}
                disabled={loading}
                className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold text-teal-700 hover:bg-teal-50 disabled:opacity-50 dark:text-teal-300 dark:hover:bg-teal-500/10"
              >
                <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} /> Refresh
              </button>
            </div>
          </>
        )}
      </Card>

      <Card title="Quality rating" icon={ShieldCheck}>
        {busy ? (
          <LoadingBody />
        ) : error && !health ? (
          errorBody
        ) : (
          <>
            <Pill tone={quality.tone}>{quality.label}</Pill>
            <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">{quality.hint}</p>
          </>
        )}
      </Card>

      <Card title="Messaging limit" icon={Gauge}>
        {busy ? (
          <LoadingBody />
        ) : error && !health ? (
          errorBody
        ) : (
          <>
            <div className="text-sm font-bold text-gray-900 dark:text-white">{tier.label}</div>
            <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">{tier.hint}</p>
            <Link to="/settings/whatsapp-setup" className="mt-1 inline-block text-[10px] font-semibold text-teal-700 hover:underline dark:text-teal-300">
              Number health details
            </Link>
          </>
        )}
      </Card>
    </>
  );
};
