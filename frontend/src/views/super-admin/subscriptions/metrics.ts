import { cycleInfo, subscriptionState, type BillingInterval, type SubscriptionState, type Vendor } from '@/services/superAdmin';

const DAY = 86400000;

/** Whole days from `now` until the renewal date (negative once it has passed); null with no date. */
export const daysLeft = (iso: string | null | undefined, now = Date.now()): number | null =>
  iso ? Math.ceil((new Date(iso).getTime() - now) / DAY) : null;

export type ExpiryFilter = 'all' | '7' | '30' | 'expired' | 'none';
export type StateFilter = 'all' | SubscriptionState;

export interface SubscriptionFilters {
  search: string;
  state: StateFilter;
  planId: string; // 'all' or a plan id
  cycle: 'all' | BillingInterval;
  expiry: ExpiryFilter;
}

export const DEFAULT_FILTERS: SubscriptionFilters = { search: '', state: 'all', planId: 'all', cycle: 'all', expiry: 'all' };

/** Clients worth listing on the subscriptions panel: everyone except active clients with no plan. */
export const isSubscriptionRow = (c: Vendor) => !!c.plan_id || subscriptionState(c) !== 'idle';

/** True when the renewal falls within the next `days` days (today included) and hasn't passed. */
export const expiresWithin = (c: Vendor, days: number, now = Date.now()) => {
  if (c.status === 'suspended') return false;
  const d = daysLeft(c.renewal_date, now);
  return d !== null && d >= 0 && d <= days;
};

export const matchesFilters = (c: Vendor, f: SubscriptionFilters, now = Date.now()) => {
  const q = f.search.trim().toLowerCase();
  if (q && ![c.name, c.owner_name, c.owner_email, c.plan_name, c.phone].join(' ').toLowerCase().includes(q)) return false;
  if (f.state !== 'all' && subscriptionState(c) !== f.state) return false;
  if (f.planId !== 'all' && (f.planId === 'none' ? !!c.plan_id : c.plan_id !== f.planId)) return false;
  if (f.cycle !== 'all' && (c.billing_cycle ?? 'monthly') !== f.cycle) return false;
  if (f.expiry === '7' && !expiresWithin(c, 7, now)) return false;
  if (f.expiry === '30' && !expiresWithin(c, 30, now)) return false;
  if (f.expiry === 'expired' && subscriptionState(c) !== 'expired') return false;
  if (f.expiry === 'none' && c.renewal_date) return false;
  return true;
};

export interface SubscriptionSummary {
  active: number;
  /** Signed up for a paid plan, first payment not made yet. */
  pendingPayment: number;
  /** Older workspaces still on a free trial (trials are gone). */
  trial: number;
  suspended: number;
  expired: number;
  expiring7: number;
  expiring30: number;
  /** Monthly recurring revenue estimate (INR) from active paying clients. */
  mrr: number;
  payingClients: number;
}

/** Counts and an MRR estimate (cycle price ÷ months in the cycle, active non-expired clients only). */
export const summarize = (clients: Vendor[], now = Date.now()): SubscriptionSummary => {
  const s: SubscriptionSummary = { active: 0, pendingPayment: 0, trial: 0, suspended: 0, expired: 0, expiring7: 0, expiring30: 0, mrr: 0, payingClients: 0 };
  for (const c of clients) {
    const state = subscriptionState(c);
    if (state === 'active') s.active++;
    else if (state === 'pending_payment') s.pendingPayment++;
    else if (state === 'trial') s.trial++;
    else if (state === 'suspended') s.suspended++;
    else if (state === 'expired') s.expired++;
    if (expiresWithin(c, 7, now)) s.expiring7++;
    if (expiresWithin(c, 30, now)) s.expiring30++;
    if (state === 'active' && c.plan_id && (c.plan_amount ?? 0) > 0) {
      s.mrr += (c.plan_amount ?? 0) / cycleInfo(c.billing_cycle).months;
      s.payingClients++;
    }
  }
  s.mrr = Math.round(s.mrr);
  return s;
};

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Next renewal date after adding one billing cycle: counted from the current
 * renewal date, or from today when there is none or it has already passed.
 */
export const nextRenewalDate = (c: Pick<Vendor, 'renewal_date' | 'billing_cycle'>, now = Date.now()): string => {
  const current = c.renewal_date ? new Date(c.renewal_date) : null;
  const base = current && current.getTime() > now ? current : new Date(now);
  const next = new Date(base);
  next.setMonth(next.getMonth() + cycleInfo(c.billing_cycle).months);
  return ymd(next);
};

/** Text and colour for the "x days left / expired" label. */
export const expiryLabel = (c: Vendor, now = Date.now()): { text: string; tone: 'red' | 'amber' | 'yellow' | 'green' | 'muted' } => {
  const d = daysLeft(c.renewal_date, now);
  if (d === null) return { text: 'No expiry date', tone: 'muted' };
  if (d < 0) return { text: `Expired ${-d} day${d === -1 ? '' : 's'} ago`, tone: 'red' };
  if (d === 0) return { text: 'Expires today', tone: 'red' };
  const text = `${d} day${d === 1 ? '' : 's'} left`;
  if (d <= 7) return { text, tone: 'amber' };
  if (d <= 30) return { text, tone: 'yellow' };
  return { text, tone: 'green' };
};
