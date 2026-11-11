import React from 'react';
import {
  BadgeIndianRupee,
  Building2,
  CheckCircle2,
  Hourglass,
  IndianRupee,
  LifeBuoy,
  MessageSquare,
  Repeat,
  ShieldOff,
  Smartphone,
  UserPlus,
  Wallet,
} from 'lucide-react';
import { formatCount } from '@/components/dashboard';
import type { SuperAdminChartKPIs } from '@/services/superAdminCharts';
import { KpiCard } from './DashboardParts';

/** The headline numbers for the chosen period, each with its change vs the previous period where known. */
export const PlatformKpis: React.FC<{ kpis: SuperAdminChartKPIs; money: (n: number) => string; prevLabel: string }> = ({
  kpis: k,
  money,
  prevLabel,
}) => {
  const cmp = `Compared with ${prevLabel}.`;
  return (
    <div className="grid grid-cols-1 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
      <KpiCard
        label="Revenue collected"
        value={money(k.revenue_collected.value)}
        current={k.revenue_collected.value}
        previous={k.revenue_collected.previous}
        icon={IndianRupee}
        tone="green"
        to="/super-admin/payments"
        info={`Money received in this period: paid invoices plus paid payments without an invoice (each payment is counted once). ${cmp}`}
      />
      <KpiCard
        label="MRR"
        value={money(k.mrr.value)}
        current={k.mrr.value}
        previous={k.mrr.previous}
        icon={Repeat}
        tone="teal"
        note="Today, from active plans"
        info="Monthly recurring revenue right now: each active client's plan price for its billing cycle, divided by the months the cycle covers."
      />
      <KpiCard
        label="Paid payments"
        value={formatCount(k.paid_payments.value)}
        current={k.paid_payments.value}
        previous={k.paid_payments.previous}
        icon={Wallet}
        tone="green"
        info={`Number of paid invoices and payments in this period. ${cmp}`}
      />
      <KpiCard
        label="Pending UPI approvals"
        value={formatCount(k.pending_upi_approvals.value)}
        current={k.pending_upi_approvals.value}
        icon={BadgeIndianRupee}
        tone={k.pending_upi_approvals.value > 0 ? 'amber' : 'slate'}
        highlight={k.pending_upi_approvals.value > 0}
        note={k.pending_upi_approvals.value > 0 ? 'Waiting for you' : 'All clear'}
        to="/super-admin/payments"
        info="UPI payments where the client sent a transaction reference and is waiting for you to approve it."
      />
      <KpiCard
        label="Total clients"
        value={formatCount(k.total_clients.value)}
        current={k.total_clients.value}
        previous={k.total_clients.previous}
        icon={Building2}
        tone="purple"
        to="/super-admin/clients"
        info="All client workspaces (demo workspace excluded). Compared with how many existed when this period began."
      />
      <KpiCard
        label="New sign-ups"
        value={formatCount(k.new_signups.value)}
        current={k.new_signups.value}
        previous={k.new_signups.previous}
        icon={UserPlus}
        tone="blue"
        info={`Workspaces created in this period. ${cmp}`}
      />
      <KpiCard
        label="Active clients"
        value={formatCount(k.active_clients.value)}
        current={k.active_clients.value}
        icon={CheckCircle2}
        tone="green"
        note={`${Math.round((k.active_clients.value / Math.max(1, k.total_clients.value)) * 100)}% of clients, right now`}
        info="Clients on a plan that is paid up and not past its renewal date."
      />
      <KpiCard
        label="Awaiting payment"
        value={formatCount(k.awaiting_payment.value)}
        current={k.awaiting_payment.value}
        icon={Hourglass}
        tone="blue"
        info="Clients who signed up but haven't made their first payment yet."
      />
      <KpiCard
        label="Suspended"
        value={formatCount(k.suspended_clients.value)}
        current={k.suspended_clients.value}
        icon={ShieldOff}
        tone={k.suspended_clients.value > 0 ? 'red' : 'slate'}
        info="Clients whose access is turned off."
      />
      <KpiCard
        label="Open tickets"
        value={formatCount(k.open_tickets.value)}
        current={k.open_tickets.value}
        icon={LifeBuoy}
        tone={k.open_tickets.value > 0 ? 'red' : 'green'}
        note={k.open_tickets.value > 0 ? 'Waiting for a reply' : 'All clear'}
        to="/super-admin/tickets"
        info="Support tickets not yet marked solved."
      />
      <KpiCard
        label="Messages"
        value={formatCount(k.messages.value)}
        current={k.messages.value}
        previous={k.messages.previous}
        icon={MessageSquare}
        tone="purple"
        info={`WhatsApp messages sent and received by all clients in this period. ${cmp}`}
      />
      <KpiCard
        label="WhatsApp numbers"
        value={formatCount(k.connected_numbers.value)}
        current={k.connected_numbers.value}
        previous={k.connected_numbers.previous}
        icon={Smartphone}
        tone="teal"
        info="WhatsApp numbers connected across all clients. Compared with how many were connected when this period began."
      />
    </div>
  );
};

export default PlatformKpis;
