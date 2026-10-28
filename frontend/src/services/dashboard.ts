import { api } from '@/services/api';

/**
 * Role-aware dashboard overview (GET /api/dashboard/overview).
 * Any org-wide figure the caller's role can't read is omitted by the server,
 * so every number here is optional.
 */
export interface DashboardToday {
  messages_today?: number;
  new_contacts_today?: number;
  open_conversations?: number;
  campaign_messages_today?: number;
}

export interface DashboardWorkspaceOverview {
  total_contacts?: number;
  messages_sent_30d?: number;
  messages_received_30d?: number;
  active_campaigns?: number;
  total_campaigns?: number;
  templates_approved?: number;
  templates_total?: number;
  team_members?: number;
  connected_numbers?: number;
  calls_30d?: number;
  chatbot_flows?: number;
  ad_leads_30d?: number;
  ai_responses_30d?: number;
}

export interface DashboardAgentStats {
  my_open_chats: number;
  assigned_to_me: number;
  resolved_today: number;
  my_messages_today: number;
  avg_first_response_seconds: number | null;
}

export interface DashboardQuota {
  key: string;
  label: string;
  used: number;
  /** 0 = unlimited */
  limit: number;
}

export interface DashboardPlanInfo {
  name: string;
  status: 'active' | 'trial' | 'suspended' | string;
  price: number;
  currency: string;
  interval: string;
  renewal_date: string | null;
  days_left: number | null;
  quotas: DashboardQuota[];
}

export interface DashboardActions {
  plan_expiring_soon: boolean;
  plan_expired: boolean;
  no_number_connected?: boolean;
  templates_pending?: number;
  templates_rejected?: number;
  unassigned_conversations?: number;
  open_support_tickets?: number;
}

export interface DashboardOverview {
  role: string;
  is_demo: boolean;
  is_super_admin: boolean;
  timezone: string;
  today: DashboardToday;
  overview: DashboardWorkspaceOverview;
  agent?: DashboardAgentStats;
  plan?: DashboardPlanInfo;
  actions: DashboardActions;
}

export const dashboardService = {
  overview: () =>
    api.get('/dashboard/overview').then((r) => r.data.data as DashboardOverview),
};
