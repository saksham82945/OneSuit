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

/** A workspace's subscription status as shown to its users. */
export const planStatusLabel = (status: string) =>
  status === 'pending_payment' ? 'Awaiting payment' : status === 'trial' ? 'Trial (legacy)' : status;

export interface DashboardPlanInfo {
  name: string;
  status: 'active' | 'pending_payment' | 'suspended' | string;
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

/**
 * Dashboard charts (GET /api/dashboard/charts?from=&to=).
 * Sections the caller's role can't read are missing (or null); series are
 * zero-filled per bucket. KPI values are null when there is nothing to compute.
 */
export interface DashboardKPI {
  current: number | null;
  previous: number | null;
}

export type DashboardKPIKey =
  | 'messages_sent'
  | 'messages_received'
  | 'delivery_rate'
  | 'read_rate'
  | 'new_contacts'
  | 'open_conversations'
  | 'campaign_messages'
  | 'bot_sessions'
  | 'avg_first_response_seconds';

export interface DashboardCharts {
  from: string;
  to: string;
  previous_from: string;
  previous_to: string;
  timezone: string;
  granularity: 'hour' | 'day' | 'week';
  agent_scope: 'all' | 'self' | '';
  kpis: Partial<Record<DashboardKPIKey, DashboardKPI>>;
  messages?: { date: string; sent: number; received: number }[];
  funnel?: { total: number; sent: number; delivered: number; read: number; failed: number; pending: number };
  hourly?: number[];
  conversations?: { open_assigned: number; open_unassigned: number; resolved: number; expired: number };
  campaigns: { id: string; name: string; status: string; sent: number; delivered: number; read: number; failed: number }[] | null;
  contacts?: { date: string; new: number; total: number }[];
  agents: { user_id: string; name: string; handled: number; resolved: number; avg_first_response_seconds: number | null }[] | null;
  bot?: {
    sessions: number;
    active: number;
    completed: number;
    cancelled: number;
    timeout: number;
    top_flows: { id: string; name: string; sessions: number; completed: number }[];
  };
  templates: { name: string; sends: number; delivered: number; read: number }[] | null;
}

export const dashboardChartsService = {
  get: (params: { from: string; to: string }) =>
    api.get('/dashboard/charts', { params }).then((r) => r.data.data as DashboardCharts),
};
