import { api } from '@/services/api';
import { useAuthStore } from '@/stores/auth';
import type { Branding } from '@/services/branding';

export type VendorStatus = 'active' | 'trial' | 'suspended';
export type BillingInterval = 'monthly' | 'yearly';

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
  plans: (Pick<Plan, 'id' | 'name' | 'price' | 'currency' | 'interval' | 'is_active'> & { vendor_count: number })[];
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

export const formatPrice = (price: number, currency = 'USD') =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(price);

export const formatLimit = (n: number) => (n === 0 ? 'Unlimited' : n.toLocaleString());
