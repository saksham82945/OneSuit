import { useCallback, useEffect, useState } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import { api } from '@/services/api';
import { readData } from '@/services/response';
import { useAuthStore, type User } from '@/stores/auth';

/** A plan as returned by GET /public/plans. Limits of 0 or -1 mean unlimited. */
export interface PublicPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  interval: 'monthly' | 'yearly' | string;
  max_users: number;
  max_contacts: number;
  max_accounts: number;
  features: string[];
  /** Offers (% off) for longer billing cycles. */
  quarterly_discount?: number;
  half_yearly_discount?: number;
  yearly_discount?: number;
}

export interface PublicPlansInfo {
  plans: PublicPlan[];
  trial_days: number;
  default_plan: string;
  signup_enabled: boolean;
  /** Visitors can open the shared demo workspace without a plan (POST /auth/explore). */
  explore_enabled: boolean;
}

// The platform name, logo and contact details come from GET /public/branding.
export { DEFAULT_PLATFORM_NAME, useBranding } from '@/services/branding';

function normalizeInfo(raw: Partial<PublicPlansInfo> | null | undefined): PublicPlansInfo {
  return {
    plans: Array.isArray(raw?.plans)
      ? raw.plans.map((p) => ({ ...p, features: Array.isArray(p.features) ? p.features : [] }))
      : [],
    trial_days: typeof raw?.trial_days === 'number' ? raw.trial_days : 0,
    default_plan: raw?.default_plan || '',
    signup_enabled: raw?.signup_enabled !== false,
    explore_enabled: raw?.explore_enabled === true,
  };
}

/** Loads the public plans and sign-up settings (no login needed). */
export function usePublicPlans() {
  const [info, setInfo] = useState<PublicPlansInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/public/plans');
      setInfo(normalizeInfo(readData<Partial<PublicPlansInfo>>(res)));
    } catch (err) {
      setError(apiErrorMessage(err, "We couldn't load plans. Please try again."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { info, loading, error, reload: load };
}

/** "$49", "₹1,999", or "Free" for a zero price. */
export function formatPrice(plan: Pick<PublicPlan, 'price' | 'currency'>): string {
  if (!plan.price) return 'Free';
  const fractionDigits = Number.isInteger(plan.price) ? 0 : 2;
  // The platform bills in rupees only.
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(plan.price);
}

/** "/mo" or "/yr"; empty for free plans. */
export function intervalSuffix(plan: Pick<PublicPlan, 'price' | 'interval'>): string {
  if (!plan.price) return '';
  return plan.interval === 'yearly' ? '/yr' : '/mo';
}

/** "$49/mo" */
export function formatPriceWithInterval(plan: PublicPlan): string {
  return `${formatPrice(plan)}${intervalSuffix(plan)}`;
}

/** 0 or -1 means unlimited. */
export function formatLimit(value: number): string {
  if (!value || value <= 0) return 'Unlimited';
  return value.toLocaleString();
}

export function planLimits(plan: PublicPlan): { label: string; value: string }[] {
  return [
    { label: 'Users', value: formatLimit(plan.max_users) },
    { label: 'Contacts', value: formatLimit(plan.max_contacts) },
    { label: 'WhatsApp numbers', value: formatLimit(plan.max_accounts) },
  ];
}

/** HTTP status of an axios error, if any. */
export function apiErrorStatus(err: unknown): number | undefined {
  return (err as { response?: { status?: number } })?.response?.status;
}

/** The backend's `{status: "error", message}` text, or a fallback. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  const message = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  return typeof message === 'string' && message.trim() ? message : fallback;
}

/**
 * Finish sign-up / join: store the signed-in user (cookies were already set by
 * the backend), drop org-switching state left over from a previous session and
 * open the dashboard.
 */
export function completeSignIn(user: User, navigate: NavigateFunction) {
  localStorage.removeItem('selected_organization_id');
  localStorage.removeItem('super_admin_return_org');
  localStorage.removeItem('super_admin_vendor_name');
  useAuthStore.getState().setAuth(user);
  navigate('/', { replace: true });
}

/** Role name of accounts that are looking around the shared demo workspace. */
export const EXPLORER_ROLE = 'explorer';

export function isExplorer(user: User | null | undefined): boolean {
  return user?.role?.name === EXPLORER_ROLE;
}

/**
 * The signed-in user on a public page. Public routes don't go through
 * ProtectedRoute, so after a full page load the store is still empty: restore
 * the cached session from localStorage once (same as ProtectedRoute does).
 */
export function useSignedInUser(): User | null {
  const storeUser = useAuthStore((s) => s.user);
  // Read the cache synchronously so the first render already knows who this is
  // (no flash of the wrong form), then put it in the store after render.
  const [cached] = useState<User | null>(() => (storeUser ? null : readCachedUser()));
  useEffect(() => {
    const state = useAuthStore.getState();
    if (!state.isAuthenticated) state.restoreSession();
  }, []);
  return storeUser ?? cached;
}

function readCachedUser(): User | null {
  try {
    const parsed = JSON.parse(localStorage.getItem('user') || 'null');
    return parsed && typeof parsed === 'object' && parsed.id && parsed.email ? (parsed as User) : null;
  } catch {
    return null;
  }
}

export const MIN_PASSWORD_LENGTH = 8;

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** Sets the tab title while the page is open and restores the previous one after. */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
