import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { ErrorState } from '@/components/shared/ErrorState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  LayoutDashboard,
  Building2,
  CheckCircle2,
  CalendarClock,
  LifeBuoy,
  CreditCard,
  ArrowRight,
  Sun,
  UserPlus,
  IndianRupee,
  MessageSquare,
  Receipt,
  LayoutGrid,
  Layers,
  Send,
  Inbox,
  Sparkles,
  Megaphone,
  Hourglass,
  CalendarX,
  AlertTriangle,
  Settings,
  Mail,
  Smartphone,
  PhoneCall,
  FileText,
} from 'lucide-react';
import {
  superAdminService,
  formatDate,
  formatPrice,
  daysUntil,
  ticketRef,
  type SuperAdminDashboard,
  type SupportTicket,
} from '@/services/superAdmin';
import {
  Panel,
  PanelEmpty,
  PanelRow,
  QuickLinkTile,
  SectionTitle,
  StatCard,
  StatGrid,
  dashCardClass,
  formatCount,
  formatMoney,
  formatShortDate,
} from '@/components/dashboard';
import { LoadingBlock, errorMessage } from './shared';
import { cn } from '@/lib/utils';

const priorityStyles = {
  high: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  medium: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  low: 'bg-gray-100 text-gray-600 dark:bg-white/[0.08] dark:text-white/60',
};

const statusStyles: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  trial: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  suspended: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
};

const StatusPill: React.FC<{ status: string }> = ({ status }) => (
  <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize', statusStyles[status] ?? statusStyles.active)}>
    {status}
  </span>
);

const reminderHref = (email: string, client: string, plan: string, date: string) =>
  `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(`Your ${plan || 'plan'} renews soon`)}&body=${encodeURIComponent(
    `Hi ${client},\n\nA quick reminder that your ${plan || ''} subscription ends on ${formatShortDate(date)}. Renew to keep your WhatsApp workspace running without interruption.\n\nThanks!`
  )}`;

export const SuperAdminDashboardView: React.FC = () => {
  const [data, setData] = useState<SuperAdminDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [solvingId, setSolvingId] = useState<string | null>(null);

  const markSolved = async (t: SupportTicket) => {
    setSolvingId(t.id);
    try {
      await superAdminService.updateTicket(t.id, { status: 'solved' });
      toast.success(`Ticket ${ticketRef(t.id)} marked solved`);
      setData(await superAdminService.dashboard());
    } catch (err) {
      toast.error(errorMessage(err, 'Could not update ticket'));
    } finally {
      setSolvingId(null);
    }
  };

  const load = () => {
    setError(null);
    superAdminService.dashboard().then(setData).catch((e) => setError(errorMessage(e)));
  };
  useEffect(load, []);

  const next = data?.next_renewal;
  const maxPlanCount = Math.max(1, ...(data?.plans.map((p) => p.vendor_count) ?? [1]));
  const currency = 'INR'; // the platform bills in rupees only
  const money = (n: number | undefined) => formatMoney(n ?? 0, currency);
  const expiringPlans = data?.expiring_plans ?? [];
  const recentSubs = data?.recent_subscriptions ?? [];
  const actionCount = (data?.expiring_soon ?? 0) + (data?.expired_plans ?? 0) + (data?.tickets_new ?? 0) + (data?.pending_topups ?? 0);

  return (
    <div className="flex flex-col min-h-full bg-[#f8faf9] dark:bg-[#0a0a0b]">
      <PageHeader
        title="Platform Dashboard"
        subtitle="Platform overview across all clients"
        icon={LayoutDashboard}
        iconGradient="bg-gradient-to-br from-[#0f5c62] to-[#0b4a4f] shadow-teal-900/20"
      />

      {error ? (
        <div className="p-6">
          <ErrorState title="Couldn't load the dashboard" description={error} onRetry={load} />
        </div>
      ) : !data ? (
        <LoadingBlock />
      ) : (
        <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto w-full text-gray-900 dark:text-white">
          {/* 1. Today at a Glance */}
          <section className="space-y-3">
            <SectionTitle icon={Sun} title="Today at a Glance" tone="amber" />
            <StatGrid>
              <StatCard variant="compact" label="New Signups Today" value={formatCount(data.new_signups_today)} icon={UserPlus} tone="blue" to="/super-admin/clients" />
              <StatCard variant="compact" label="Revenue Today" value={money(data.revenue_today)} icon={IndianRupee} tone="green" hint="New paid subscriptions" />
              <StatCard variant="compact" label="Messages Today" value={formatCount(data.messages_today)} icon={MessageSquare} tone="purple" />
              <StatCard variant="compact" label="Payments Today" value={formatCount(data.payments_today)} icon={Receipt} tone="orange" />
            </StatGrid>
          </section>

          {/* 2. Platform Overview */}
          <section className="space-y-3">
            <SectionTitle icon={LayoutGrid} title="Platform Overview" tone="teal" />
            <StatGrid>
              <StatCard
                label="Total Clients"
                value={formatCount(data.total_vendors)}
                icon={Building2}
                tone="purple"
                hint={`${data.trial_vendors} on trial · ${data.suspended_vendors} suspended`}
                to="/super-admin/clients"
              />
              <StatCard
                label="Active Clients"
                value={formatCount(data.active_vendors)}
                icon={CheckCircle2}
                tone="green"
                hint={`${Math.round((data.active_vendors / Math.max(1, data.total_vendors)) * 100)}% of all clients`}
              />
              <StatCard label="Total Revenue" value={money(data.total_revenue)} icon={IndianRupee} tone="green" hint="Current billing cycle, paying clients" />
              <StatCard
                label="Active Plans"
                value={formatCount(data.active_plans)}
                icon={Layers}
                tone="blue"
                hint={`${data.plans.filter((p) => p.is_active).length} of ${data.plans.length} plans on sale`}
                to="/super-admin/plans"
              />
              <StatCard label="Workspaces" value={formatCount(data.workspaces)} icon={LayoutGrid} tone="teal" hint={`${formatCount(data.connected_numbers)} WhatsApp numbers`} />
              <StatCard label="Messages Sent (30d)" value={formatCount(data.messages_sent_30d)} icon={Send} tone="green" />
              <StatCard label="Messages Received (30d)" value={formatCount(data.messages_received_30d)} icon={Inbox} tone="purple" />
              <StatCard label="AI Calls (30d)" value={formatCount(data.ai_calls_30d)} icon={Sparkles} tone="blue" hint={`${formatCount(data.calls_30d)} voice calls`} />
              <StatCard label="Total Campaigns" value={formatCount(data.total_campaigns)} icon={Megaphone} tone="orange" />
              <StatCard
                label="Expiring Soon (7d)"
                value={formatCount(data.expiring_soon)}
                icon={Hourglass}
                tone={data.expiring_soon > 0 ? 'amber' : 'slate'}
                hint={next ? `Next: ${next.name} · ${formatDate(next.renewal_date)}` : 'No upcoming renewals'}
              />
              <StatCard label="Expired Plans" value={formatCount(data.expired_plans)} icon={CalendarX} tone={data.expired_plans > 0 ? 'red' : 'slate'} />
            </StatGrid>
          </section>

          {/* 3. Action Needed */}
          <section className="space-y-3">
            <SectionTitle
              icon={AlertTriangle}
              title="Action Needed"
              tone="red"
              action={
                actionCount > 0 ? (
                  <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">
                    {actionCount}
                  </span>
                ) : undefined
              }
            />
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title="Plans Expiring (7 days)" icon={Hourglass} tone="amber" linkLabel="All clients" linkTo="/super-admin/clients">
                {expiringPlans.length === 0 ? (
                  <PanelEmpty>No plans expire in the next 7 days.</PanelEmpty>
                ) : (
                  expiringPlans.map((v) => (
                    <PanelRow
                      key={v.id}
                      title={v.name}
                      subtitle={`${v.plan_name || 'No plan'} · ${formatShortDate(v.renewal_date)}`}
                      right={
                        <>
                          <span className={cn('text-[11px] font-semibold', v.days_left <= 2 ? 'text-rose-600 dark:text-rose-300' : 'text-amber-600 dark:text-amber-300')}>
                            {v.days_left <= 0 ? 'Today' : `${v.days_left}d`}
                          </span>
                          {v.owner_email ? (
                            <a
                              href={reminderHref(v.owner_email, v.name, v.plan_name, v.renewal_date)}
                              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-semibold text-[#0f5c62] hover:bg-[#e6f2f1] dark:border-white/10 dark:text-teal-300 dark:hover:bg-white/5"
                            >
                              <Mail className="h-3 w-3" /> Remind
                            </a>
                          ) : (
                            <Link to="/super-admin/clients" className="text-[11px] font-semibold text-[#0f5c62] dark:text-teal-300">
                              View
                            </Link>
                          )}
                        </>
                      }
                    />
                  ))
                )}
              </Panel>

              <Panel title="Recent Subscriptions" icon={Receipt} tone="green" linkLabel="All subscriptions" linkTo="/super-admin/subscriptions">
                {recentSubs.length === 0 ? (
                  <PanelEmpty>No subscriptions yet.</PanelEmpty>
                ) : (
                  recentSubs.map((s) => (
                    <PanelRow
                      key={s.id}
                      title={
                        <span className="flex items-center gap-2">
                          {s.name}
                          {s.is_new && (
                            <span className="rounded bg-sky-50 px-1.5 text-[9px] font-bold uppercase text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
                              New
                            </span>
                          )}
                        </span>
                      }
                      subtitle={`${s.plan_name || 'No plan'} · ${formatShortDate(s.updated_at)}`}
                      right={
                        <>
                          <span className="text-xs font-semibold tabular-nums">
                            {s.amount > 0 ? formatMoney(s.amount, currency) : 'Free'}
                          </span>
                          <StatusPill status={s.status} />
                        </>
                      }
                    />
                  ))
                )}
              </Panel>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <QuickLinkTile label="Subscriptions" meta="Manage" to="/super-admin/subscriptions" icon={CreditCard} tone="purple" />
              <QuickLinkTile label="Clients" meta={formatCount(data.total_vendors)} to="/super-admin/clients" icon={Building2} tone="blue" />
              <QuickLinkTile label="Configuration" meta="Config" to="/super-admin/settings" icon={Settings} tone="slate" />
              <QuickLinkTile
                label="Support Tickets"
                meta={data.tickets_new > 0 ? `${data.tickets_new} open` : 'All clear'}
                to="/super-admin/tickets"
                icon={LifeBuoy}
                tone={data.tickets_new > 0 ? 'red' : 'green'}
              />
              <QuickLinkTile label="Pages" meta="CMS" to="/super-admin/pages" icon={FileText} tone="teal" />
              <QuickLinkTile label="AI Call Setup" meta="Calls" to="/super-admin/ai-call-setup" icon={PhoneCall} tone="orange" />
              <QuickLinkTile label="WhatsApp Numbers" meta={formatCount(data.connected_numbers)} to="/super-admin/clients" icon={Smartphone} tone="green" />
              <QuickLinkTile label="Tickets Solved" meta={formatCount(data.tickets_solved)} to="/super-admin/tickets" icon={CheckCircle2} tone="green" />
            </div>
          </section>

          {/* Details: renewals & plans (kept from the previous dashboard) */}
          <section className="space-y-3">
            <SectionTitle icon={CalendarClock} title="Renewals & Plans" tone="blue" />
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title="Upcoming renewals" icon={CalendarClock} tone="blue">
                {data.upcoming_renewals.length === 0 && <PanelEmpty>Nothing due.</PanelEmpty>}
                {data.upcoming_renewals.map((v) => {
                  const days = daysUntil(v.renewal_date);
                  return (
                    <PanelRow
                      key={v.id}
                      title={v.name}
                      subtitle={v.plan_name}
                      right={
                        <div className="text-right">
                          <p className="text-xs">{formatDate(v.renewal_date)}</p>
                          <p className={cn('text-[11px]', days <= 7 ? 'text-amber-600 dark:text-amber-300' : 'text-gray-400')}>in {days} days</p>
                        </div>
                      }
                    />
                  );
                })}
                <p className="px-2 pt-2 text-[11px] text-gray-400">{data.renewals_next_30_days} renewals due in the next 30 days</p>
              </Panel>

              <Panel title="Subscription plans" icon={CreditCard} tone="purple" linkLabel="Manage" linkTo="/super-admin/plans">
                <div className="space-y-3 px-2 py-1">
                  {data.plans.length === 0 && <PanelEmpty>No plans yet.</PanelEmpty>}
                  {data.plans.map((p) => (
                    <div key={p.id}>
                      <div className="flex items-center justify-between text-xs mb-1 gap-2">
                        <span className="font-medium truncate">
                          {p.name}
                          <span className="ml-2 text-gray-400">
                            {formatPrice(p.monthly_price ?? p.price)}/mo
                          </span>
                        </span>
                        <span className="tabular-nums text-gray-500 dark:text-white/60 shrink-0">{p.vendor_count} clients</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden dark:bg-white/[0.06]">
                        <div className="h-full rounded-full bg-[#0f5c62] dark:bg-teal-400" style={{ width: `${(p.vendor_count / maxPlanCount) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
          </section>

          {/* Open tickets */}
          <section className="space-y-3">
            <SectionTitle
              icon={LifeBuoy}
              title="New Support Tickets"
              tone="red"
              action={
                <Link to="/super-admin/tickets" className="text-xs font-semibold text-[#0f5c62] dark:text-teal-300 flex items-center gap-1">
                  All tickets <ArrowRight className="h-3 w-3" />
                </Link>
              }
            />
            <div className={cn(dashCardClass, 'p-3')}>
              {data.recent_tickets.length === 0 && <PanelEmpty>No open tickets.</PanelEmpty>}
              {data.recent_tickets.map((t) => (
                <PanelRow
                  key={t.id}
                  title={t.subject}
                  subtitle={`${ticketRef(t.id)} · ${t.vendor_name} · ${formatDate(t.created_at)}`}
                  right={
                    <>
                      <Badge className={cn('border-0 shadow-none text-[11px] capitalize', priorityStyles[t.priority])}>{t.priority}</Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs border-gray-200 dark:border-white/10"
                        disabled={solvingId !== null}
                        onClick={() => markSolved(t)}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                        <span className="hidden sm:inline">{solvingId === t.id ? 'Saving…' : 'Mark solved'}</span>
                      </Button>
                    </>
                  }
                />
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default SuperAdminDashboardView;
