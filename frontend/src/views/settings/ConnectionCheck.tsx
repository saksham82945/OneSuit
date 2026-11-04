import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, CircleAlert, CircleHelp, Loader2, RefreshCw, TriangleAlert, Wrench } from 'lucide-react';
import { api } from '@/services/api';
import { readData } from '@/services/response';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Connection check: asks Meta whether everything needed for incoming messages
// is in place (token, Cloud API, linked app, app webhook, events received) and
// offers a one-click fix where OneSuit can make the change itself.

interface Check {
  key: string;
  label: string;
  status: 'ok' | 'fail' | 'warn' | 'unknown';
  detail: string;
  fix?: 'subscribe_waba' | 'configure_webhook' | 'register';
  fix_tip?: string;
}

const FIX_LABEL: Record<string, string> = {
  configure_webhook: 'Set up webhook in Meta',
  subscribe_waba: 'Link app to this account',
  register: 'Register number',
};

const icon = (s: Check['status']) =>
  s === 'ok' ? (
    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
  ) : s === 'fail' ? (
    <CircleAlert className="h-4 w-4 text-red-600" />
  ) : s === 'warn' ? (
    <TriangleAlert className="h-4 w-4 text-amber-500" />
  ) : (
    <CircleHelp className="h-4 w-4 text-gray-400" />
  );

const errorMessage = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;

export const ConnectionCheck: React.FC<{ accountId: string; canWrite: boolean; onRegister: () => void }> = ({
  accountId,
  canWrite,
  onRegister,
}) => {
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [fixing, setFixing] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/accounts/${accountId}/diagnose`);
      setChecks(readData<{ checks: Check[] }>(res)?.checks ?? []);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not run the connection check'));
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    void run();
  }, [run]);

  const fix = async (action: string) => {
    if (action === 'register') {
      onRegister();
      return;
    }
    setFixing(action);
    try {
      const res = await api.post(`/accounts/${accountId}/diagnose/fix`, { action });
      setChecks(readData<{ checks: Check[] }>(res)?.checks ?? checks);
      toast.success('Done. Meta has the new settings.');
    } catch (err) {
      toast.error(errorMessage(err, 'Meta refused the change'));
    } finally {
      setFixing(null);
    }
  };

  const failing = checks?.filter((c) => c.status === 'fail').length ?? 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {checks === null
            ? 'Asking Meta…'
            : failing === 0
              ? 'Everything Meta needs is in place.'
              : `${failing} problem${failing > 1 ? 's stop' : ' stops'} messages from reaching Live Chat.`}
        </p>
        <Button size="sm" variant="outline" onClick={run} disabled={loading}>
          {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
          Check again
        </Button>
      </div>
      <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 dark:divide-white/5 dark:border-white/10">
        {(checks ?? []).map((c) => (
          <li key={c.key} className="flex gap-3 p-3">
            <span className="mt-0.5 shrink-0">{icon(c.status)}</span>
            <div className="min-w-0 flex-1 space-y-1">
              <p className={cn('text-sm font-medium', c.status === 'fail' ? 'text-red-700 dark:text-red-300' : 'text-gray-900 dark:text-white')}>
                {c.label}
              </p>
              <p className="break-words text-xs text-gray-600 dark:text-gray-300">{c.detail}</p>
              {c.status !== 'ok' && c.fix_tip && <p className="text-xs text-amber-700 dark:text-amber-300">{c.fix_tip}</p>}
              {c.status !== 'ok' && c.fix && canWrite && (
                <Button
                  size="sm"
                  className="mt-1 bg-emerald-600 text-white hover:bg-emerald-500"
                  onClick={() => fix(c.fix!)}
                  disabled={fixing !== null}
                >
                  {fixing === c.fix ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Wrench className="mr-1.5 h-3.5 w-3.5" />}
                  {FIX_LABEL[c.fix]}
                </Button>
              )}
            </div>
          </li>
        ))}
        {checks === null && (
          <li className="flex justify-center p-4">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </li>
        )}
      </ul>
    </div>
  );
};
