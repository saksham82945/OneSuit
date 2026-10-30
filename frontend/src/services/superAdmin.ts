import { api } from '@/services/api';
import { useAuthStore } from '@/stores/auth';
import type { Branding } from '@/services/branding';

export type VendorStatus = 'active' | 'trial' | 'suspended';
export type BillingInterval = 'monthly' | 'quarterly' | 'half_yearly' | 'yearly';

export interface Vendor {
  id: string;
  name: string;
  slug: string;
  owner_name: string;
  owner_email: string;
  phone?: string;
  status: VendorStatus;
  plan_id: string | null;
  plan_name?: string;
  /** How often the client pays for its plan. */
  billing_cycle?: BillingInterval;
  /** Price of one billing cycle after its offer (INR). */
  plan_amount?: number;
  /** When the subscription record was created. */
  subscribed_at?: string | null;
  /** Whether the owner's login is active. */
  owner_active?: boolean;
  users_count: number;
  contacts_count: number;
  created_at: string;
  renewal_date: string | null;
}

/** Fields accepted when creating or updating a vendor. Empty plan_id/renewal_date clear them. */
export interface VendorInput {
  name?: string;
  owner_name?: string;
  owner_email?: string;
  phone?: string;
  status?: VendorStatus;
  plan_id?: string;
  renewal_date?: string;
  billing_cycle?: BillingInterval;
  /** Create only: also creates the owner's admin login. */
  owner_password?: string;
}

export interface Plan {
  id: string;
  name: string;
  description?: string;
  price: number;
  currency: string;
  interval: BillingInterval;
  /** 0 means unlimited */
  max_users: number;
  max_contacts: number;
  max_accounts: number;
  features: string[];
  is_active: boolean;
  /** Offers for longer billing cycles, as % off the monthly price. */
  quarterly_discount?: number;
  half_yearly_discount?: number;
  yearly_discount?: number;
}

export interface SupportTicketReply {
  id: string;
  ticket_id: string;
  user_id?: string;
  sender_role: 'super_admin' | 'user';
  sender_name: string;
  message: string;
  image_url?: string;
  created_at: string;
}

export interface SupportTicket {
  id: string;
  subject: string;
  description?: string;
  image_url?: string;
  organization_id: string;
  vendor_name?: string;
  creator_name?: string;
  creator_email?: string;
  priority: 'low' | 'medium' | 'high';
  status: 'open' | 'solved';
  created_at: string;
  solved_at?: string | null;
  replies?: SupportTicketReply[];
}

export interface CmsPage {
  id: string;
  title: string;
  slug: string;
  content: string;
  is_published: boolean;
  updated_at: string;
}

export interface PlatformConfig {
  platform_name: string;
  support_email: string;
  support_phone: string;
  default_currency: string;
  /** Empty string = no default plan */
  default_plan_id: string;
  trial_days: number;
  renewal_reminder_days: number;
  allow_vendor_signup: boolean;
  require_email_verification: boolean;
  maintenance_mode: boolean;
  maintenance_message: string;
  contact_address: string;
  website_url: string;
  /** IANA time zone used for new businesses and platform dates, e.g. "Asia/Kolkata". */
  timezone: string;
  /** Businesses can connect a number with Facebook (Meta Embedded Signup). */
  embedded_signup_enabled: boolean;
  /** Businesses can type in Phone Number ID, WABA ID and access token themselves. */
  manual_signup_enabled: boolean;
  meta_app_id: string;
  meta_config_id: string;
  /** Button text businesses see on Settings → Accounts (max 40 chars; blank = default). */
  embedded_button_label?: string;
  manual_button_label?: string;
  /** Hide the "Connect WhatsApp with Facebook" shortcut button for business users. */
  hide_connect_button?: boolean;
  /** Meta hosted WhatsApp onboarding link that button opens (blank = built from the Meta IDs). */
  connect_url?: string;
  /** Read-only: whether an App Secret is stored (the secret itself is never returned). */
  has_meta_app_secret: boolean;
}

/** PUT /super-admin/config body: any config fields plus the write-only secret controls. */
export type PlatformConfigUpdate = Partial<Omit<PlatformConfig, 'has_meta_app_secret'>> & {
  /** Send only when a new secret was typed. */
  meta_app_secret?: string;
  clear_meta_app_secret?: boolean;
};

/** Logo upload limits enforced by POST /super-admin/logo. */
export const LOGO_MAX_BYTES = 512 * 1024;
export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export interface SuperAdminDashboard {
  total_vendors: number;
  active_vendors: number;
  trial_vendors: number;
  suspended_vendors: number;
  next_renewal: Vendor | null;
  renewals_next_30_days: number;
  upcoming_renewals: Vendor[];
  plans: (Pick<Plan, 'id' | 'name' | 'price' | 'currency' | 'interval' | 'is_active'> & {
    vendor_count: number;
    monthly_price?: number;
    quarterly_price?: number;
    half_yearly_price?: number;
    yearly_price?: number;
  })[];
  tickets_solved: number;
  tickets_new: number;
  recent_tickets: SupportTicket[];

  // Platform overview (revenue figures are derived from plan prices of paying vendors)
  currency: string;
  new_signups_today: number;
  revenue_today: number;
  payments_today: number;
  messages_today: number;
  total_revenue: number;
  revenue_by_currency: Record<string, number>;
  active_plans: number;
  workspaces: number;
  connected_numbers: number;
  messages_sent_30d: number;
  messages_received_30d: number;
  ai_calls_30d: number;
  calls_30d: number;
  total_campaigns: number;
  wallets_available: boolean;
  wallets_total: number;
  pending_topups: number;
  expiring_soon: number;
  expired_plans: number;
  expiring_plans: SuperAdminExpiringPlan[];
  recent_subscriptions: SuperAdminRecentSubscription[];
}

export interface SuperAdminExpiringPlan {
  id: string;
  name: string;
  plan_name: string;
  status: VendorStatus;
  owner_email: string;
  renewal_date: string;
  days_left: number;
}

export interface SuperAdminRecentSubscription {
  id: string;
  name: string;
  plan_name: string;
  status: VendorStatus;
  amount: number;
  currency: string;
  interval: string;
  updated_at: string;
  is_new: boolean;
}

const unwrap = <T>(p: Promise<{ data: { data: T } }>) => p.then((r) => r.data.data);

export const superAdminService = {
  dashboard: () => unwrap<SuperAdminDashboard>(api.get('/super-admin/dashboard')),

  listVendors: () => unwrap<Vendor[]>(api.get('/super-admin/vendors')),
  createVendor: (data: VendorInput) => unwrap<Vendor>(api.post('/super-admin/vendors', data)),
  updateVendor: (id: string, data: VendorInput) => unwrap<Vendor>(api.put(`/super-admin/vendors/${id}`, data)),

  listPlans: () => unwrap<Plan[]>(api.get('/super-admin/plans')),
  createPlan: (data: Partial<Plan>) => unwrap<Plan>(api.post('/super-admin/plans', data)),
  updatePlan: (id: string, data: Partial<Plan>) => unwrap<Plan>(api.put(`/super-admin/plans/${id}`, data)),
  deletePlan: (id: string) => api.delete(`/super-admin/plans/${id}`),

  listPages: () => unwrap<CmsPage[]>(api.get('/super-admin/pages')),
  createPage: (data: Partial<CmsPage>) => unwrap<CmsPage>(api.post('/super-admin/pages', data)),
  updatePage: (id: string, data: Partial<CmsPage>) => unwrap<CmsPage>(api.put(`/super-admin/pages/${id}`, data)),
  deletePage: (id: string) => api.delete(`/super-admin/pages/${id}`),

  listTickets: (status?: SupportTicket['status']) =>
    unwrap<SupportTicket[]>(api.get('/super-admin/tickets', { params: status ? { status } : undefined })),
  getTicket: (id: string) => unwrap<SupportTicket>(api.get(`/super-admin/tickets/${id}`)),
  replyTicket: (id: string, data: { message: string; image_url?: string }) =>
    unwrap<SupportTicketReply>(api.post(`/super-admin/tickets/${id}/reply`, data)),
  updateTicket: (id: string, data: Partial<Pick<SupportTicket, 'status' | 'priority'>>) =>
    unwrap<SupportTicket>(api.put(`/super-admin/tickets/${id}`, data)),

  getConfig: () => unwrap<PlatformConfig>(api.get('/super-admin/config')),
  updateConfig: (data: PlatformConfigUpdate) => unwrap<PlatformConfig>(api.put('/super-admin/config', data)),

  /** Upload the platform logo (PNG, JPEG or WebP, max 512 KB); returns the new branding. */
  uploadLogo: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return unwrap<Branding>(
      api.post('/super-admin/logo', form, { headers: { 'Content-Type': 'multipart/form-data' } })
    );
  },
  removeLogo: () => unwrap<Branding>(api.delete('/super-admin/logo')),
};

// --- Vendor account access ---------------------------------------------------
// The super admin "enters" a vendor by switching their session into that org.
// We remember the org they came from so the app can offer a way back.

const RETURN_ORG_KEY = 'super_admin_return_org';
const VENDOR_NAME_KEY = 'super_admin_vendor_name';

const readKey = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

export const getImpersonationReturnOrg = () => readKey(RETURN_ORG_KEY);

/**
 * True only while a super admin is really inside a client's account: the
 * marker is set and the session's organization is a different one. A marker
 * left over from an old session (e.g. it expired while inside a client) is
 * ignored, so the super admin keeps their own platform-only menu.
 */
export const isInsideClient = (user: { is_super_admin?: boolean; organization_id?: string } | null | undefined) => {
  const returnOrg = getImpersonationReturnOrg();
  return Boolean(user?.is_super_admin && returnOrg && user.organization_id && returnOrg !== user.organization_id);
};
/** Name of the vendor the super admin is currently inside. */
export const getImpersonatedVendorName = () => readKey(VENDOR_NAME_KEY);

export async function accessVendorAccount(vendor: Pick<Vendor, 'id' | 'name'>) {
  const { organizationId, switchOrg } = useAuthStore.getState();
  if (!getImpersonationReturnOrg()) {
    localStorage.setItem(RETURN_ORG_KEY, organizationId);
  }
  await switchOrg(vendor.id);
  localStorage.setItem(VENDOR_NAME_KEY, vendor.name);
}

export async function exitVendorAccount() {
  const returnOrg = getImpersonationReturnOrg();
  if (returnOrg) {
    await useAuthStore.getState().switchOrg(returnOrg);
  }
  localStorage.removeItem(RETURN_ORG_KEY);
  localStorage.removeItem(VENDOR_NAME_KEY);
}

// --- Formatting helpers ------------------------------------------------------

export const formatDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

/** Short display ID for a ticket UUID, e.g. #3F9A12C0. */
export const ticketRef = (id: string) => '#' + id.slice(0, 8).toUpperCase();

/** Radix Select can't use '' as an item value, so "no plan" uses this sentinel. */
export const NO_PLAN = 'none';

export const daysUntil = (iso: string | null) =>
  iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000) : 0;

/** Prices are always shown in rupees (the platform bills in INR only). */
export const formatPrice = (price: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(price);

// --- Billing cycles and offers -----------------------------------------------

export const BILLING_CYCLES: { id: BillingInterval; label: string; short: string; months: number }[] = [
  { id: 'monthly', label: 'Monthly', short: 'month', months: 1 },
  { id: 'quarterly', label: 'Quarterly', short: '3 months', months: 3 },
  { id: 'half_yearly', label: 'Half-yearly', short: '6 months', months: 6 },
  { id: 'yearly', label: 'Yearly', short: 'year', months: 12 },
];

export const cycleInfo = (cycle: string | undefined) => BILLING_CYCLES.find((c) => c.id === cycle) ?? BILLING_CYCLES[0];

type PricedPlan = Pick<Plan, 'price' | 'interval'> & Partial<Pick<Plan, 'quarterly_discount' | 'half_yearly_discount' | 'yearly_discount'>>;

/** The plan's price for one month (older plans priced per year are spread over 12 months). */
export const planMonthlyPrice = (p: PricedPlan) => (p.interval === 'yearly' ? p.price / 12 : p.price);

/** The offer (% off) a plan gives for a billing cycle. */
export const cycleDiscount = (p: PricedPlan, cycle: BillingInterval) =>
  cycle === 'quarterly'
    ? p.quarterly_discount ?? 0
    : cycle === 'half_yearly'
      ? p.half_yearly_discount ?? 0
      : cycle === 'yearly'
        ? p.yearly_discount ?? 0
        : 0;

/** What one billing cycle costs: full price, price after the offer and the saving. Matches the backend. */
export const cyclePrice = (p: PricedPlan, cycle: BillingInterval) => {
  const full = Math.round(planMonthlyPrice(p) * cycleInfo(cycle).months);
  const discount = cycleDiscount(p, cycle);
  const total = Math.round(planMonthlyPrice(p) * cycleInfo(cycle).months * (1 - discount / 100));
  return { full, total, discount, saving: Math.max(0, full - total), perMonth: Math.round(total / cycleInfo(cycle).months) };
};

// --- Client subscription state ------------------------------------------------

export type SubscriptionState = 'active' | 'trial' | 'idle' | 'expired' | 'suspended';

/** Active: paid plan running. Trial: on trial. Idle: no plan. Expired: renewal date passed. */
export const subscriptionState = (v: Pick<Vendor, 'status' | 'plan_id' | 'renewal_date'>): SubscriptionState => {
  if (v.status === 'suspended') return 'suspended';
  if (v.renewal_date && new Date(v.renewal_date).getTime() < Date.now()) return 'expired';
  if (v.status === 'trial') return 'trial';
  if (!v.plan_id) return 'idle';
  return 'active';
};

/** -1 (or 0 on older plans) means unlimited. */
export const formatLimit = (n: number) => (n <= 0 ? 'Unlimited' : n.toLocaleString());
