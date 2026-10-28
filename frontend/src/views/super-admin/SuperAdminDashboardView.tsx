import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { ErrorState } from '@/components/shared/ErrorState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  LayoutDashboard,
  Building2,
  CheckCircle2,
  CalendarClock,
  LifeBuoy,
  Inbox,
  CreditCard,
  ArrowRight,
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
import { StatCard, cardClass, LoadingBlock, errorMessage } from './shared';
import { cn } from '@/lib/utils';

const priorityStyles = {
  high: 'bg-rose-500/15 text-rose-400',
  medium: 'bg-amber-500/15 text-amber-400',
  low: 'bg-white/[0.08] text-white/60 light:bg-gray-100 light:text-gray-600',
};

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

  return (
    <div className="flex flex-col min-h-full bg-[#0a0a0b] light:bg-gray-50">
      <PageHeader
        title="Dashboard"
        subtitle="Platform overview across all vendors"
        icon={LayoutDashboard}
        iconGradient="bg-gradient-to-br from-violet-500 to-indigo-600 shadow-violet-500/20"
      />

      {error ? (
        <div className="p-6">
          <ErrorState title="Couldn't load the dashboard" description={error} onRetry={load} />
        </div>
      ) : !data ? (
        <LoadingBlock />
      ) : (
        <div className="p-6 space-y-6">
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
            <StatCard
              label="Total vendors"
              value={data.total_vendors}
              icon={Building2}
              tone="violet"
              hint={`${data.trial_vendors} on trial · ${data.suspended_vendors} suspended`}
            />
            <StatCard
              label="Active vendors"
              value={data.active_vendors}
              icon={CheckCircle2}
              tone="emerald"
              hint={`${Math.round((data.active_vendors / Math.max(1, data.total_vendors)) * 100)}% of all vendors`}
            />
            <StatCard
              label="Next renewal"
              value={next ? next.name : '—'}
              icon={CalendarClock}
              tone="amber"
              hint={
                next
                  ? `${formatDate(next.renewal_date)} · in ${daysUntil(next.renewal_date)} days · ${data.renewals_next_30_days} due in 30 days`
                  : 'No upcoming renewals'
              }
            />
            <StatCard
              label="Subscription plans"
              value={data.plans.filter((p) => p.is_active).length}
              icon={CreditCard}
              tone="blue"
              hint={`${data.plans.length} plans in total`}
            />
            <StatCard label="Support tickets solved" value={data.tickets_solved} icon={LifeBuoy} tone="emerald" />
            <StatCard label="New support tickets" value={data.tickets_new} icon={Inbox} tone="rose" hint="Waiting for a reply" />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Upcoming renewals */}
            <Card className={cardClass}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Upcoming renewals</CardTitle>
                <CardDescription className="text-xs text-white/50 light:text-gray-500">Vendors whose subscription renews next</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1">
                {data.upcoming_renewals.length === 0 && <p className="text-xs text-white/40 light:text-gray-400">Nothing due.</p>}
                {data.upcoming_renewals.map((v) => {
                  const days = daysUntil(v.renewal_date);
                  return (
                    <div key={v.id} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-white/[0.03] light:hover:bg-gray-100">
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium truncate">{v.name}</p>
                        <p className="text-[11px] text-white/40 light:text-gray-400">{v.plan_name}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs">{formatDate(v.renewal_date)}</p>
                        <p className={cn('text-[11px]', days <= 7 ? 'text-amber-400' : 'text-white/40 light:text-gray-400')}>in {days} days</p>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Plans */}
            <Card className={cardClass}>
              <CardHeader className="pb-3 flex-row items-start justify-between space-y-0">
                <div>
                  <CardTitle className="text-sm font-semibold">Subscription plans</CardTitle>
                  <CardDescription className="text-xs text-white/50 light:text-gray-500">Vendors on each plan</CardDescription>
                </div>
                <Link to="/super-admin/subscriptions" className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1">
                  Manage <ArrowRight className="h-3 w-3" />
                </Link>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.plans.map((p) => (
                  <div key={p.id}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-medium">
                        {p.name}
                        <span className="ml-2 text-white/40 light:text-gray-400">
                          {formatPrice(p.price, p.currency)}/{p.interval === 'yearly' ? 'yr' : 'mo'}
                        </span>
                      </span>
                      <span className="tabular-nums text-white/60 light:text-gray-600">{p.vendor_count} vendors</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden light:bg-gray-100">
                      <div className="h-full rounded-full bg-violet-500" style={{ width: `${(p.vendor_count / maxPlanCount) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* New tickets */}
          <Card className={cardClass}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">New support tickets</CardTitle>
              <CardDescription className="text-xs text-white/50 light:text-gray-500">Open tickets from vendors</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              {data.recent_tickets.length === 0 && <p className="text-xs text-white/40 light:text-gray-400">No open tickets.</p>}
              {data.recent_tickets.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-white/[0.03] light:hover:bg-gray-100">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium truncate">{t.subject}</p>
                    <p className="text-[11px] text-white/40 light:text-gray-400">
                      {ticketRef(t.id)} · {t.vendor_name} · {formatDate(t.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge className={cn('border-0 shadow-none text-[11px] capitalize', priorityStyles[t.priority])}>
                      {t.priority}
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs border-white/10 light:border-gray-200"
                      disabled={solvingId !== null}
                      onClick={() => markSolved(t)}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                      {solvingId === t.id ? 'Saving…' : 'Mark solved'}
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default SuperAdminDashboardView;
