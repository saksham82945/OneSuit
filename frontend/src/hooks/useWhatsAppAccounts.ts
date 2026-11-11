import { useEffect, useState } from 'react';
import { accountsService } from '@/services/api';
import { readList } from '@/services/response';
import { useAuthStore } from '@/stores/auth';

/** The fields of GET /api/accounts the app shell and dashboard read. */
export interface WhatsAppAccountSummary {
  id: string;
  name: string;
  status: string;
  phone_number?: string;
  display_name?: string;
  is_default_outgoing?: boolean;
}

interface AccountsState {
  accounts: WhatsAppAccountSummary[];
  loading: boolean;
  /** The request failed (or the user can't read accounts). */
  failed: boolean;
}

// One request per signed-in user, shared by every mounted hook (top bar + dashboard).
let cache: { userId: string; accounts: WhatsAppAccountSummary[] } | null = null;
let inflight: { userId: string; promise: Promise<WhatsAppAccountSummary[]> } | null = null;

function fetchAccounts(userId: string): Promise<WhatsAppAccountSummary[]> {
  if (!inflight || inflight.userId !== userId) {
    const promise = accountsService
      .list()
      .then((res) => {
        const accounts = readList<WhatsAppAccountSummary>(res, 'accounts');
        cache = { userId, accounts };
        return accounts;
      })
      .finally(() => {
        if (inflight?.promise === promise) inflight = null;
      });
    inflight = { userId, promise };
  }
  return inflight.promise;
}

/** The account messages go out from: the default outgoing one, else the first active one. */
export function primaryAccount(accounts: WhatsAppAccountSummary[]): WhatsAppAccountSummary | undefined {
  const active = accounts.filter((a) => (a.status || 'active') === 'active');
  return active.find((a) => a.is_default_outgoing) ?? active[0] ?? accounts[0];
}

/**
 * The workspace's connected WhatsApp numbers (GET /api/accounts). Skipped
 * for users without `accounts:read`, who get an empty list.
 */
export function useWhatsAppAccounts(): AccountsState {
  // Keyed by user and organization: the super admin can switch into a client's workspace.
  const userId = useAuthStore((s) => (s.user ? `${s.user.id}:${s.user.organization_id}` : ''));
  const canRead = useAuthStore((s) => s.hasPermission('accounts', 'read'));
  const cached = cache && cache.userId === userId ? cache.accounts : null;
  const [state, setState] = useState<AccountsState>(() => ({
    accounts: cached ?? [],
    loading: canRead && !cached,
    failed: false,
  }));

  useEffect(() => {
    if (!userId || !canRead) {
      setState({ accounts: [], loading: false, failed: !canRead });
      return;
    }
    if (cache && cache.userId === userId) {
      setState({ accounts: cache.accounts, loading: false, failed: false });
      return;
    }
    let cancelled = false;
    fetchAccounts(userId)
      .then((accounts) => {
        if (!cancelled) setState({ accounts, loading: false, failed: false });
      })
      .catch(() => {
        if (!cancelled) setState({ accounts: [], loading: false, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [userId, canRead]);

  return state;
}
