import React, { useCallback, useEffect, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { accountsService } from '@/services/api';
import { readList } from '@/services/response';
import { cn } from '@/lib/utils';
import { ConnectWhatsAppButton, WHATSAPP_CONNECTED_EVENT, useConnectWhatsApp } from './ConnectWhatsAppButton';
import { ManualWhatsAppSetupButton } from './ManualWhatsAppSetup';

/** Whether this workspace has a WhatsApp number connected (null while loading). */
export function useWhatsAppConnected(): boolean | null {
  const [connected, setConnected] = useState<boolean | null>(null);
  const check = useCallback(async () => {
    try {
      const accounts = readList<{ status?: string }>(await accountsService.list(), 'accounts');
      setConnected(accounts.some((a) => (a.status || 'active') === 'active'));
    } catch {
      setConnected(null);
    }
  }, []);
  useEffect(() => {
    void check();
    window.addEventListener(WHATSAPP_CONNECTED_EVENT, check);
    return () => window.removeEventListener(WHATSAPP_CONNECTED_EVENT, check);
  }, [check]);
  return connected;
}

/**
 * "Connect WhatsApp" prompt with the manual and automatic Facebook buttons.
 * Shown only while the workspace has no connected number.
 */
export const ConnectWhatsAppCard: React.FC<{ className?: string }> = ({ className }) => {
  const connected = useWhatsAppConnected();
  const { allowed, visible, manualVisible } = useConnectWhatsApp();
  if (connected !== false || !allowed || (!visible && !manualVisible)) return null;
  return (
    <div
      className={cn(
        'flex flex-col gap-4 rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-emerald-50 to-teal-50 p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:from-emerald-950/40 dark:to-teal-950/30',
        className
      )}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
          <MessageCircle className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-bold text-gray-900 dark:text-white">Connect your WhatsApp number</p>
          <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-300">
            Link your WhatsApp Business number to start chatting with customers and sending campaigns.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ManualWhatsAppSetupButton size="md" />
        <ConnectWhatsAppButton size="md" />
      </div>
    </div>
  );
};
