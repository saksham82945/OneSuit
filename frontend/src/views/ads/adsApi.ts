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
  tags: string[];
  description: string;
  size: number;
  created_at: string;
}

export type AudienceInput = Pick<Audience, 'name' | 'source' | 'tags' | 'description'>;

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

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

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
  listAudiences: async () => readList<Audience>(await api.get('/ads/audiences'), 'audiences'),
  createAudience: (body: AudienceInput) => api.post('/ads/audiences', body),
  updateAudience: (id: string, body: Partial<AudienceInput>) => api.put(`/ads/audiences/${id}`, body),
  deleteAudience: (id: string) => api.delete(`/ads/audiences/${id}`),

  // Events
  getEvents: async () => {
    const payload = readData<{ events?: AdEventSummary[]; recent?: AdEventRecord[] }>(await api.get('/ads/events'));
    return {
      events: Array.isArray(payload?.events) ? payload.events : [],
      recent: Array.isArray(payload?.recent) ? payload.recent : [],
    };
  },

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
