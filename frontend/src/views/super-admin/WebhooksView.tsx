import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Webhook, Loader2, ChevronDown, Search, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/services/api';
import { readData } from '@/services/response';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CopyRow } from '@/components/whatsapp/ManualWhatsAppSetup';
import { ConnectionCheck } from '@/views/settings/ConnectionCheck';
import { cn } from '@/lib/utils';

// Super admin: Meta webhook settings for every client's WhatsApp number.

interface WebhookAccount {
  id: string;
  organization_id: string;
  organization_name: string;
  name: string;
  phone_id: string;
  business_id: string;
  app_id: string;
  status: string;
  webhook_verify_token: string;
  last_event_at?: string;
  last_event_result?: string;
}

interface WebhooksData {
  accounts: WebhookAccount[];
  callback_url: string;
  global_verify_token: string;
}

export const SuperAdminWebhooksView: React.FC = () => {
  const [data, setData] = useState<WebhooksData | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(readData<WebhooksData>(await api.get('/super-admin/webhooks')) ?? null);
    } catch {
      toast.error('Could not load webhook settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const accounts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = data?.accounts ?? [];
    return q
      ? list.filter((a) => [a.organization_name, a.name, a.phone_id, a.business_id].some((v) => v?.toLowerCase().includes(q)))
      : list;
  }, [data, search]);

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[#f8faf9] text-gray-900 dark:bg-[#0a0f0e] dark:text-gray-100">
      <PageHeader
        title="Webhooks"
        subtitle="Meta webhook settings for every client's WhatsApp number"
        icon={Webhook}
        iconGradient="bg-gradient-to-br from-violet-500 to-indigo-600 shadow-violet-500/20"
        actions={
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', loading && 'animate-spin')} /> Refresh
          </Button>
        }
      />

      <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
        <section className="space-y-3 rounded-2xl border border-gray-200/90 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#141b1a]">
          <h3 className="text-sm font-bold">Meta app webhook</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            In developers.facebook.com → your app → Webhooks, pick <b>Whatsapp Business Account</b>, paste the callback URL and a
            verify token, click “Verify and save”, then subscribe to the <b>messages</b> field. Keep the app in <b>Live</b> mode.
            Any number’s own verify token below also works.
          </p>
          {data ? (
            <>
              <CopyRow label="Callback URL" value={data.callback_url} />
              {data.global_verify_token && <CopyRow label="Platform verify token" value={data.global_verify_token} />}
            </>
          ) : (
            loading && <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          )}
        </section>

        <section className="rounded-2xl border border-gray-200/90 bg-white shadow-sm dark:border-white/10 dark:bg-[#141b1a]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 p-4 dark:border-white/5">
            <div>
              <h3 className="text-sm font-bold">Client numbers</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">{data ? `${data.accounts.length} connected` : 'Loading…'}</p>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search client or number" className="h-9 pl-8 text-xs" />
            </div>
          </div>

          {data && accounts.length === 0 && (
            <p className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
              {data.accounts.length === 0 ? 'No client has connected a number yet.' : 'No numbers match your search.'}
            </p>
          )}

          <ul className="divide-y divide-gray-100 dark:divide-white/5">
            {accounts.map((a) => {
              const isOpen = open === a.id;
              const receiving = !!a.last_event_at && !a.last_event_result?.startsWith('rejected');
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : a.id)}
                    className="flex w-full items-center gap-3 p-4 text-left hover:bg-gray-50/70 dark:hover:bg-white/[0.02]"
                    aria-expanded={isOpen}
                  >
                    <span
                      className={cn('h-2.5 w-2.5 shrink-0 rounded-full', receiving ? 'bg-emerald-500' : a.last_event_at ? 'bg-red-500' : 'bg-amber-400')}
                      title={receiving ? 'Receiving events from Meta' : a.last_event_at ? 'Meta events are being rejected' : 'Nothing received from Meta yet'}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {a.organization_name || 'Unknown client'} <span className="font-normal text-gray-500">· {a.name}</span>
                      </p>
                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                        Phone ID {a.phone_id} · WABA {a.business_id || '—'} ·{' '}
                        {a.last_event_at ? `last event ${new Date(a.last_event_at).toLocaleString()} (${a.last_event_result})` : 'no events yet'}
                      </p>
                    </div>
                    <ChevronDown className={cn('h-4 w-4 shrink-0 text-gray-400 transition-transform', isOpen && 'rotate-180')} />
                  </button>
                  {isOpen && (
                    <div className="space-y-4 border-t border-gray-100 bg-gray-50/50 p-4 dark:border-white/5 dark:bg-white/[0.02]">
                      {a.webhook_verify_token && <CopyRow label="This number's verify token" value={a.webhook_verify_token} />}
                      <div>
                        <p className="mb-2 text-xs font-semibold text-gray-700 dark:text-gray-300">Connection check</p>
                        <ConnectionCheck
                          accountId={a.id}
                          canWrite
                          onRegister={() =>
                            toast.info('Registering needs the number’s two-step PIN. Open the client’s workspace → WhatsApp Setup → Register number.')
                          }
                        />
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
};

export default SuperAdminWebhooksView;
