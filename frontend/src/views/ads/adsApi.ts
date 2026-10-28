/**
 * Ads Manager — types, API calls and small helpers shared by the views in
 * `src/views/ads`. Every endpoint lives under `/api/ads` and uses the usual
 * `{ status, data }` envelope; errors carry a `message` we always surface.
 */
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/services/api';
import { readData, readList } from '@/services/response';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AdType = 'click_to_whatsapp' | 'whatsapp_status' | 'website_to_whatsapp' | 'website' | 'lead_form';
export type AdStatus = 'draft' | 'active' | 'paused' | 'ended';
export type QuestionType = 'full_name' | 'phone' | 'email' | 'city' | 'short_text';
export type LeadSource = 'lead_form' | 'click_to_whatsapp' | 'manual';
export type AudienceSource = 'all_contacts' | 'contacts_tag' | 'leads';
export type AudienceType = 'website' | 'custom' | 'lookalike';
export type EventSource = 'website' | 'whatsapp' | 'server' | 'offline';
export type MediaType = 'image' | 'video';

export interface AdsSetupSteps {
  connect_facebook: boolean;
  select_page: boolean;
  link_whatsapp: boolean;
  accept_terms: boolean;
}

export interface AdsSetup {
  facebook_connected: boolean;
  facebook_user_name?: string;
  page_id?: string;
  page_name?: string;
  whatsapp_account?: string;
  lead_terms_accepted: boolean;
  lead_terms_accepted_at?: string | null;
  ad_credit: number;
  currency: string;
  meta_ready: boolean;
  steps: AdsSetupSteps;
}

export interface AdCreative {
  headline: string;
  primary_text: string;
  image_url: string;
  cta: string;
  welcome_message: string;
  website_url: string;
}

export interface AdCampaign {
  id: string;
  name: string;
  type: AdType;
  status: AdStatus;
  daily_budget: number;
  currency: string;
  start_date?: string | null;
  end_date?: string | null;
  audience_id?: string | null;
  form_id?: string | null;
  creative: AdCreative;
  impressions: number;
  clicks: number;
  leads: number;
  spend: number;
  created_at: string;
}

export interface AdCampaignInput {
  name: string;
  type: AdType;
  status?: AdStatus;
  daily_budget: number;
  start_date?: string | null;
  end_date?: string | null;
  audience_id?: string | null;
  form_id?: string | null;
  creative: AdCreative;
}

export interface FormQuestion {
  key: string;
  label: string;
  type: QuestionType;
}

export interface LeadForm {
  id: string;
  name: string;
  headline: string;
  description: string;
  questions: FormQuestion[];
  privacy_url: string;
  thank_you_message: string;
  status: 'draft' | 'published';
  leads_count: number;
  created_at: string;
}

export type LeadFormInput = Omit<LeadForm, 'id' | 'leads_count' | 'created_at'>;

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email?: string;
  source: LeadSource;
  campaign_id?: string | null;
  campaign_name?: string;
  form_id?: string | null;
  form_name?: string;
  answers?: Record<string, string>;
  contact_id?: string | null;
  created_at: string;
}

export interface LeadInput {
  name: string;
  phone: string;
  email?: string;
  source: 'manual';
  form_id?: string;
  answers?: Record<string, string>;
}

export interface Audience {
  id: string;
  name: string;
  source: AudienceSource;
  type: AudienceType;
  tags: string[];
  description: string;
  size: number;
  created_at: string;
}

export type AudienceInput = Pick<Audience, 'name' | 'source' | 'tags' | 'description'> & { type?: AudienceType };

export interface AdEventSummary {
  name: string;
  description: string;
  count_7d: number;
  count_30d: number;
  last_seen_at?: string | null;
}

export interface AdEventRecord {
  id: string;
  event_name: string;
  contact_name?: string;
  value?: number | null;
  currency?: string;
  campaign_name?: string;
  created_at: string;
}

export interface AdCreditTransaction {
  id: string;
  amount: number;
  currency: string;
  type: 'credit' | 'debit';
  status: 'pending' | 'completed' | 'rejected';
  pack_name?: string;
  note?: string;
  created_at: string;
}

export interface AdWallet {
  balance: number;
  currency: string;
  free_generations_left: number;
  free_generations_total: number;
  pending_amount: number;
  transactions: AdCreditTransaction[];
  packs: { key: string; name: string; amount: number }[];
}

export type CreditPack = 'starter' | 'growth';

export interface GenerateAdsInput {
  business_name: string;
  website_url?: string;
  audience?: string;
  ad_type: AdType | 'auto';
  media_type: MediaType;
  size: string;
  count: number;
}

export interface GeneratedAd {
  id: string;
  angle: string;
  name: string;
  headline: string;
  primary_text: string;
  cta: string;
  welcome_message: string;
  website_url: string;
  suggested_ad_type: AdType;
  suggested_audience: string;
  media_type: MediaType;
  size: string;
}

export interface AdsSummary {
  leads: number;
  ctr: number;
  cost_per_lead: number;
  total_spend: number;
  capi_signals: number;
  impressions: number;
  clicks: number;
  currency: string;
}

export interface FetchedList<T> {
  items: T[];
  total: number;
  meta_connected: boolean;
  message: string;
}

export interface AdEventDefinition {
  id: string;
  name: string;
  description: string;
  source: EventSource;
  created_at: string;
  count_today: number;
  count_7d: number;
  count_30d: number;
  last_seen_at?: string | null;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

function readFetched<T>(res: Parameters<typeof readData>[0], key: string): FetchedList<T> {
  const payload = readData<Record<string, unknown>>(res) || {};
  const items = Array.isArray(payload[key]) ? (payload[key] as T[]) : [];
  return {
    items,
    total: typeof payload.total === 'number' ? payload.total : items.length,
    meta_connected: Boolean(payload.meta_connected),
    message: typeof payload.message === 'string' ? payload.message : '',
  };
}

export const adsApi = {
  // Setup
  getSetup: async () => readData<AdsSetup>(await api.get('/ads/setup')),
  connectFacebook: () => api.post('/ads/setup/connect-facebook'),
  disconnectFacebook: () => api.post('/ads/setup/disconnect'),
  updateSetup: (body: { page_id?: string; page_name?: string; whatsapp_account?: string }) => api.put('/ads/setup', body),
  acceptTerms: () => api.post('/ads/setup/accept-terms'),

  // Campaigns
  listCampaigns: async (params: { type?: string; status?: string; search?: string } = {}) =>
    readList<AdCampaign>(await api.get('/ads/campaigns', { params }), 'campaigns'),
  createCampaign: (body: AdCampaignInput) => api.post('/ads/campaigns', body),
  updateCampaign: (id: string, body: Partial<AdCampaignInput>) => api.put(`/ads/campaigns/${id}`, body),
  deleteCampaign: (id: string) => api.delete(`/ads/campaigns/${id}`),
  launchCampaign: (id: string) => api.post(`/ads/campaigns/${id}/launch`),

  // Forms
  listForms: async () => readList<LeadForm>(await api.get('/ads/forms'), 'forms'),
  createForm: (body: LeadFormInput) => api.post('/ads/forms', body),
  updateForm: (id: string, body: Partial<LeadFormInput>) => api.put(`/ads/forms/${id}`, body),
  deleteForm: (id: string) => api.delete(`/ads/forms/${id}`),

  // Leads
  listLeads: async (params: { search?: string; form_id?: string; source?: string; page?: number; limit?: number }) => {
    const payload = readData<{ leads?: Lead[]; total?: number }>(await api.get('/ads/leads', { params }));
    const leads = Array.isArray(payload?.leads) ? payload.leads : [];
    return { leads, total: typeof payload?.total === 'number' ? payload.total : leads.length };
  },
  createLead: (body: LeadInput) => api.post('/ads/leads', body),
  deleteLead: (id: string) => api.delete(`/ads/leads/${id}`),
  leadToContact: async (id: string) => readData<{ contact_id: string }>(await api.post(`/ads/leads/${id}/to-contact`)),

  // Audiences
  listAudiences: async (params: { type?: AudienceType; search?: string } = {}) =>
    readList<Audience>(await api.get('/ads/audiences', { params }), 'audiences'),
  listFetchedAudiences: async () => readFetched<Audience>(await api.get('/ads/audiences/fetched'), 'audiences'),
  createAudience: (body: AudienceInput) => api.post('/ads/audiences', body),
  updateAudience: (id: string, body: Partial<AudienceInput>) => api.put(`/ads/audiences/${id}`, body),
  deleteAudience: (id: string) => api.delete(`/ads/audiences/${id}`),

  // Events
  getEvents: async (params: { event_name?: string } = {}) => {
    const payload = readData<{ events?: AdEventSummary[]; recent?: AdEventRecord[] }>(await api.get('/ads/events', { params }));
    return {
      events: Array.isArray(payload?.events) ? payload.events : [],
      recent: Array.isArray(payload?.recent) ? payload.recent : [],
    };
  },

  listEventDefinitions: async (params: { search?: string } = {}) =>
    readList<AdEventDefinition>(await api.get('/ads/event-definitions', { params }), 'events'),
  createEventDefinition: async (body: { name: string; description?: string; source: EventSource }) =>
    readData<AdEventDefinition>(await api.post('/ads/event-definitions', body)),
  deleteEventDefinition: (id: string) => api.delete(`/ads/event-definitions/${id}`),

  // Wallet, AI generation, metrics, Meta sync
  getWallet: async () => readData<AdWallet>(await api.get('/ads/wallet')),
  topupWallet: async (body: { pack?: CreditPack; amount?: number; note?: string }) =>
    readData<{ message: string; transaction: AdCreditTransaction }>(await api.post('/ads/wallet/topup', body)),
  generateAds: async (body: GenerateAdsInput) => {
    const payload = readData<{ variants?: GeneratedAd[]; free_generations_left?: number }>(await api.post('/ads/generate', body));
    return {
      variants: Array.isArray(payload?.variants) ? payload.variants : [],
      free_generations_left: Number(payload?.free_generations_left) || 0,
    };
  },
  getSummary: async (params: { from?: string; to?: string; status?: string } = {}) =>
    readData<AdsSummary>(await api.get('/ads/summary', { params })),
  listFetchedAds: async () => readFetched<AdCampaign>(await api.get('/ads/fetched'), 'ads'),
  sync: () => api.post('/ads/sync'),

  // Lookups from the rest of the app
  listAccountNames: async () =>
    readList<{ name: string; status?: string }>(await api.get('/accounts'), 'accounts').map((a) => a.name).filter(Boolean),
  listTagNames: async () =>
    readList<{ name: string }>(await api.get('/tags', { params: { limit: 500 } }), 'tags').map((t) => t.name).filter(Boolean),
};

// ---------------------------------------------------------------------------
// Hooks & helpers
// ---------------------------------------------------------------------------

/** Loads the Ads setup state; `setup` stays null until the first load finishes. */
export function useAdsSetup() {
  const [setup, setSetup] = useState<AdsSetup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setSetup(await adsApi.getSetup());
      setError(null);
    } catch (err) {
      setError(errorMessage(err, 'Failed to load Ads Manager setup'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { setup, error, loading, reload, setSetup };
}

/** Loads the org's ad credit wallet. */
export function useAdWallet() {
  const [wallet, setWallet] = useState<AdWallet | null>(null);
  const reload = useCallback(async () => {
    try {
      setWallet(await adsApi.getWallet());
    } catch {
      // The header just hides the balance when the wallet can't be loaded.
    }
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);
  return { wallet, reload, setWallet };
}

export const isSetupComplete = (s: AdsSetup | null | undefined) =>
  Boolean(s && s.steps.connect_facebook && s.steps.select_page && s.steps.link_whatsapp && s.steps.accept_terms);

/** Pull a readable message out of an axios error (backend sends `{status:"error", message}`). */
export function errorMessage(err: unknown, fallback = 'Something went wrong'): string {
  const e = err as { response?: { status?: number; data?: { message?: string } }; message?: string } | undefined;
  const msg = e?.response?.data?.message;
  if (msg) return msg;
  if (e?.response?.status === 404) {
    return 'Ads Manager isn’t available on the server yet. Please try again shortly or ask your administrator to update the backend.';
  }
  if (e?.response?.status === 403) return 'You don’t have permission to do this.';
  return e?.message || fallback;
}

export function formatMoney(amount: number | null | undefined, currency = 'INR'): string {
  const value = Number(amount) || 0;
  try {
    return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : undefined, {
      style: 'currency',
      currency: currency || 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

export function formatNumber(n: number | null | undefined): string {
  return new Intl.NumberFormat('en-IN').format(Number(n) || 0);
}

export function formatDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return withTime
    ? d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** `2026-10-28T00:00:00Z` → `2026-10-28` for <input type="date">. */
export const toDateInput = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '');

export const AD_TYPES: { value: AdType; label: string; short: string; description: string }[] = [
  {
    value: 'click_to_whatsapp',
    label: 'Click to WhatsApp',
    short: 'CTWA',
    description: 'Ad opens a WhatsApp chat with your business.',
  },
  {
    value: 'whatsapp_status',
    label: 'WhatsApp Status',
    short: 'Status',
    description: 'Run ads in WhatsApp Status updates.',
  },
  {
    value: 'website_to_whatsapp',
    label: 'Website to WhatsApp',
    short: 'Web → WA',
    description: 'Visitors land on your website with a WhatsApp chat button.',
  },
  { value: 'website', label: 'Website', short: 'Website', description: 'Drive traffic to your website.' },
  {
    value: 'lead_form',
    label: 'Lead Form',
    short: 'Lead form',
    description: 'Collect leads with an instant form on Facebook & Instagram.',
  },
];

export const adTypeLabel = (t: string) => AD_TYPES.find((a) => a.value === t)?.label || t;

export const CTA_OPTIONS = ['Send WhatsApp message', 'Learn more', 'Shop now', 'Sign up', 'Book now', 'Get quote', 'Contact us'];

export const QUESTION_TYPES: { value: QuestionType; label: string; placeholder: string }[] = [
  { value: 'full_name', label: 'Full name', placeholder: 'Enter your full name' },
  { value: 'phone', label: 'Phone number', placeholder: '+91 98765 43210' },
  { value: 'email', label: 'Email', placeholder: 'you@example.com' },
  { value: 'city', label: 'City', placeholder: 'Enter your city' },
  { value: 'short_text', label: 'Short answer', placeholder: 'Your answer' },
];

export const questionTypeLabel = (t: string) => QUESTION_TYPES.find((q) => q.value === t)?.label || t;

export const LEAD_SOURCES: { value: LeadSource; label: string }[] = [
  { value: 'lead_form', label: 'Lead form' },
  { value: 'click_to_whatsapp', label: 'Click to WhatsApp' },
  { value: 'manual', label: 'Manual' },
];

export const leadSourceLabel = (s: string) => LEAD_SOURCES.find((l) => l.value === s)?.label || s;

export const AUDIENCE_SOURCES: { value: AudienceSource; label: string; description: string }[] = [
  { value: 'all_contacts', label: 'All contacts', description: 'Everyone in your contact list.' },
  { value: 'contacts_tag', label: 'Contacts with tags', description: 'Contacts that carry any of the selected tags.' },
  { value: 'leads', label: 'Ad leads', description: 'People who submitted a lead from your ads.' },
];

export const AUDIENCE_TYPES: { value: AudienceType; label: string; description: string }[] = [
  { value: 'website', label: 'Website', description: 'People who visited your website.' },
  { value: 'custom', label: 'Custom', description: 'Your own list: contacts, tags or leads.' },
  { value: 'lookalike', label: 'Lookalike', description: 'New people similar to your best customers.' },
];

export const audienceTypeLabel = (t: string) => AUDIENCE_TYPES.find((a) => a.value === t)?.label || 'Custom';

/** YYYY-MM-DD for `days` days ago (local time). */
export function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** localStorage read/write that never throws (private mode, blocked storage…). */
export function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

export function writeStored(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

export const audienceSourceLabel = (s: string) => AUDIENCE_SOURCES.find((a) => a.value === s)?.label || s;

/** Download rows as a CSV file (client-side). */
export function downloadCsv(filename: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const escape = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [header, ...rows].map((r) => r.map(escape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
