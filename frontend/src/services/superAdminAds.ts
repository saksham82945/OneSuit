import { api } from '@/services/api';

// Super admin Ads Manager: every client's ads, pages and wallet top-ups.

export type AdStatus = 'draft' | 'active' | 'paused' | 'ended';

export interface PlatformAd {
  id: string;
  organization_id: string;
  client_name: string;
  page_name: string;
  name: string;
  type: string;
  status: AdStatus;
  daily_budget: number;
  currency: string;
  start_date: string | null;
  end_date: string | null;
  impressions: number;
  clicks: number;
  leads: number;
  spend: number;
  created_by_name: string;
  created_at: string;
  updated_at: string;
}

export interface PlatformAdClient {
  organization_id: string;
  client_name: string;
  facebook_connected: boolean;
  facebook_user_name: string;
  page_id: string;
  page_name: string;
  whatsapp_account: string;
  ads: number;
  active_ads: number;
  spend: number;
  leads: number;
  wallet_balance: number;
}

export interface PlatformAdsOverview {
  ads: PlatformAd[];
  clients: PlatformAdClient[];
  totals: { ads: number; active: number; paused: number; draft: number; spend: number; leads: number; clicks: number; impressions: number };
  pages: number;
  pending_topups: number;
}

export interface AdTopup {
  id: string;
  organization_id: string;
  organization_name: string;
  amount: number;
  currency: string;
  type: 'credit' | 'debit';
  status: 'pending' | 'completed' | 'rejected';
  pack_name: string;
  note: string;
  created_at: string;
  completed_at?: string | null;
}

const unwrap = <T>(p: Promise<{ data: { data: T } }>) => p.then((r) => r.data.data);

export const AD_TYPE_LABELS: Record<string, string> = {
  click_to_whatsapp: 'Click to WhatsApp',
  whatsapp_status: 'WhatsApp Status',
  website_to_whatsapp: 'Website to WhatsApp',
  website: 'Website',
  lead_form: 'Lead form',
};

export const superAdminAdsService = {
  overview: (params?: { status?: string; org_id?: string; search?: string }) =>
    unwrap<PlatformAdsOverview>(api.get('/super-admin/ads', { params })),
  setStatus: (id: string, status: 'active' | 'paused' | 'ended') =>
    unwrap<PlatformAd>(api.put(`/super-admin/ads/${id}/status`, { status })),
  remove: (id: string) => api.delete(`/super-admin/ads/${id}`),
  disconnectPage: (orgId: string) =>
    unwrap<{ success: boolean; paused_ads: number }>(api.post(`/super-admin/ads/clients/${orgId}/disconnect`, {})),
  topups: (status?: string) =>
    unwrap<{ transactions: AdTopup[] }>(api.get('/super-admin/ad-credits', { params: status ? { status } : undefined })).then(
      (d) => d.transactions ?? []
    ),
  approveTopup: (id: string) => unwrap<{ balance: number }>(api.post(`/super-admin/ad-credits/${id}/approve`, {})),
};
