import { api } from '@/services/api';
import { readData } from '@/services/response';

/** A metric for the chosen period; `previous` is the period before it (null when there's no history). */
export interface ChartKPI {
  value: number;
  previous: number | null;
}

export interface SuperAdminChartKPIs {
  total_clients: ChartKPI;
  active_clients: ChartKPI;
  awaiting_payment: ChartKPI;
  suspended_clients: ChartKPI;
  new_signups: ChartKPI;
  mrr: ChartKPI;
  revenue_collected: ChartKPI;
  paid_payments: ChartKPI;
  pending_upi_approvals: ChartKPI;
  open_tickets: ChartKPI;
  messages: ChartKPI;
  connected_numbers: ChartKPI;
}

export interface SuperAdminCharts {
  from: string;
  to: string;
  prev_from: string;
  prev_to: string;
  granularity: 'day' | 'month';
  timezone: string;
  currency: string;
  kpis: SuperAdminChartKPIs;
  revenue: { bucket: string; razorpay: number; upi: number; manual: number; ad_credit: number }[];
  signups: { bucket: string; count: number }[];
  messages: { bucket: string; sent: number; received: number }[];
  tickets: { bucket: string; opened: number; solved: number }[];
  mrr_trend: { bucket: string; mrr: number }[];
  clients_by_status: { key: string; label: string; count: number }[];
  clients_by_plan: { key: string; label: string; count: number; mrr?: number }[];
  renewals_next_30: { date: string; count: number; amount: number }[];
  payment_funnel: {
    started: number;
    created: number;
    pending_verification: number;
    paid: number;
    failed: number;
    rejected: number;
    paid_amount: number;
  };
  top_clients: { id: string; name: string; messages: number; sent: number; received: number }[];
}

/** A payment as the super admin payments list returns it (only the fields the dashboard uses). */
export interface DashboardPayment {
  id: string;
  organization_id: string;
  organization_name?: string;
  plan_name?: string;
  billing_cycle: string;
  amount: number;
  currency: string;
  method: 'razorpay' | 'upi';
  status: 'created' | 'pending_verification' | 'paid' | 'failed' | 'rejected';
  upi_reference?: string;
  created_at: string;
  submitted_at?: string;
  paid_at?: string;
}

export const superAdminChartsService = {
  /** from/to are YYYY-MM-DD (inclusive) in the platform time zone. */
  charts: async (from: string, to: string) =>
    readData<SuperAdminCharts>(await api.get('/super-admin/dashboard/charts', { params: { from, to } })),
  payments: async (status: DashboardPayment['status'], limit = 5) =>
    readData<{ payments: DashboardPayment[]; total: number }>(
      await api.get('/super-admin/payments', { params: { status, page: 1, limit } })
    ) ?? { payments: [], total: 0 },
};
