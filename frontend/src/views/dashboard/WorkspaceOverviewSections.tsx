import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Bot,
  CalendarClock,
  CheckCircle2,
  Clock,
  Compass,
  CreditCard,
  FileText,
  Gauge,
  Headphones,
  Inbox,
  LayoutGrid,
  LifeBuoy,
  Megaphone,
  MessageCircle,
  MessageSquare,
  PhoneCall,
  PhoneOff,
  RefreshCw,
  Send,
  Smartphone,
  Sparkles,
  Sun,
  Target,
  UserCheck,
  UserPlus,
  Users,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { dashboardService, type DashboardOverview } from '@/services/dashboard';
import {
  Panel,
  PanelEmpty,
  PanelRow,
  QuickLinkTile,
  SectionTitle,
  StatCard,
  StatGrid,
  formatCount,
  formatDuration,
  formatMoney,
  formatShortDate,
  dashCardClass,
  type Tone,
} from '@/components/dashboard';
import { cn } from '@/lib/utils';

interface CardDef {
  key: string;
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  tone: Tone;
  hint?: React.ReactNode;
  to?: string;
  progress?: number;
}

const ADMIN_ROLES = ['admin'];

/** Explorer banner: the workspace is sample data and read-only. */
const DemoBanner: React.FC = () => (
  <div className="rounded-2xl border border-[#0f5c62]/20 bg-[#e6f2f1] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 dark:border-teal-400/20 dark:bg-teal-500/10">
    <div className="flex items-start gap-3">
      <span className="h-10 w-10 rounded-xl bg-[#0f5c62] text-white flex items-center justify-center shrink-0">
        <Compass className="h-5 w-5" />
      </span>
      <div>
        <p className="text-sm font-bold text-[#0b4a4f] dark:text-teal-100">
          You're exploring a demo workspace — data is sample and read-only
        </p>
        <p className="text-xs text-[#0b4a4f]/75 dark:text-teal-100/70 mt-0.5">
          Look around freely. Pick a plan to get your own workspace with your WhatsApp number.
        </p>
      </div>
    </div>
    <Link
      to="/pricing"
      className="self-start sm:self-auto inline-flex items-center gap-1.5 rounded-xl bg-[#0f5c62] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0b4a4f] shrink-0"
    >
      <Sparkles className="h-3.5 w-3.5" /> Choose a plan
    </Link>
  </div>
);

const SkeletonGrid: React.FC<{ count?: number; tall?: boolean }> = ({ count = 4, tall }) => (
  <StatGrid>
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className={cn(dashCardClass, 'animate-pulse', tall ? 'h-[104px]' : 'h-[68px]')} />
    ))}
  </StatGrid>
);

/**
 * "Today at a Glance", "Workspace Overview" and "Action Needed" sections at the
 * top of the main dashboard. Content adapts to the caller's role: the server
 * omits org-wide numbers the role can't read, and agents see their own work.
 */
export const WorkspaceOverviewSections: React.FC = () => {
  const { hasPermission, user } = useAuthStore();
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(false);
    dashboardService
      .overview()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const isExplorer = data?.is_demo || user?.role?.name === 'explorer';

  if (error) {
    return (
      <div className={cn(dashCardClass, 'p-4 flex items-center justify-between gap-3')}>
        <p className="text-xs text-gray-500 dark:text-gray-400">Couldn't load your workspace overview.</p>
        <button
          type="button"
          onClick={() => setReloadKey((k) => k + 1)}
          className="text-xs font-semibold text-[#0f5c62] dark:text-teal-300 inline-flex items-center gap-1"
        >
          <RefreshCw className="h-3 w-3" /> Retry
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <SectionTitle icon={Sun} title="Today at a Glance" tone="amber" />
        <SkeletonGrid />
        <SectionTitle icon={LayoutGrid} title="Workspace Overview" tone="teal" />
        <SkeletonGrid tall />
      </div>
    );
  }

  const { today, overview, agent, plan, actions } = data;
  const isAdmin = ADMIN_ROLES.includes(data.role) || data.is_super_admin || isExplorer;
  const has = (v: number | undefined): v is number => v !== undefined && v !== null;

  // --- Today at a Glance ---
  const orgToday: CardDef[] = [
    has(today.messages_today) && { key: 'msgs', label: 'Messages Today', value: formatCount(today.messages_today), icon: MessageSquare, tone: 'green' as Tone, hint: 'Sent + received' },
    has(today.new_contacts_today) && { key: 'contacts', label: 'New Contacts Today', value: formatCount(today.new_contacts_today), icon: UserPlus, tone: 'blue' as Tone },
    has(today.open_conversations) && { key: 'open', label: 'Open Conversations', value: formatCount(today.open_conversations), icon: MessageCircle, tone: 'purple' as Tone, hint: 'Customer wrote in last 24h', to: '/chat' },
    has(today.campaign_messages_today) && { key: 'camp', label: 'Campaign Messages Sent', value: formatCount(today.campaign_messages_today), icon: Megaphone, tone: 'orange' as Tone, to: '/campaigns' },
  ].filter(Boolean) as CardDef[];

  const myCards: CardDef[] = agent
    ? [
        { key: 'mine-open', label: 'My Open Chats', value: formatCount(agent.my_open_chats), icon: Inbox, tone: 'green', to: '/chat' },
        { key: 'mine-assigned', label: 'Assigned to Me', value: formatCount(agent.assigned_to_me), icon: UserCheck, tone: 'blue', to: '/chat' },
        { key: 'mine-resolved', label: 'Resolved Today', value: formatCount(agent.resolved_today), icon: CheckCircle2, tone: 'purple' },
        { key: 'mine-frt', label: 'Avg First Response', value: formatDuration(agent.avg_first_response_seconds), icon: Clock, tone: 'orange', hint: 'Last 30 days' },
      ]
    : [];

  // Team members without org-wide analytics get their own work as "today".
  const todayCards = orgToday.length >= 2 ? orgToday : [...orgToday, ...myCards].slice(0, 4);
  const showMyWork = !isAdmin && myCards.length > 0 && orgToday.length >= 2;

  // --- Overview ---
  const quotaContacts = plan?.quotas.find((q) => q.key === 'contacts');
  const daysLeft = plan?.days_left ?? null;
  const overviewCards: CardDef[] = [
    has(overview.total_contacts) && {
      key: 'contacts', label: 'Total Contacts', value: formatCount(overview.total_contacts), icon: Users, tone: 'blue' as Tone, to: '/contacts',
    },
    has(overview.messages_sent_30d) && {
      key: 'sent', label: 'Messages Sent (30d)', value: formatCount(overview.messages_sent_30d), icon: Send, tone: 'green' as Tone,
    },
    has(overview.messages_received_30d) && {
      key: 'recv', label: 'Messages Received (30d)', value: formatCount(overview.messages_received_30d), icon: Inbox, tone: 'purple' as Tone,
    },
    has(overview.active_campaigns) && {
      key: 'campaigns', label: 'Active Campaigns', value: formatCount(overview.active_campaigns), icon: Megaphone, tone: 'orange' as Tone,
      hint: has(overview.total_campaigns) ? `${formatCount(overview.total_campaigns)} campaigns in total` : undefined, to: '/campaigns',
    },
    has(overview.templates_total) && {
      key: 'templates', label: 'Templates Approved', icon: FileText, tone: 'teal' as Tone, to: '/templates',
      value: (
        <>
          {formatCount(overview.templates_approved)}
          <span className="text-sm font-medium text-gray-400"> / {formatCount(overview.templates_total)}</span>
        </>
      ),
    },
    has(overview.team_members) && {
      key: 'team', label: 'Team Members', value: formatCount(overview.team_members), icon: UsersRound, tone: 'blue' as Tone,
      to: hasPermission('users', 'read') ? '/settings/users' : undefined,
    },
    has(overview.connected_numbers) && {
      key: 'numbers', label: 'Connected Numbers', value: formatCount(overview.connected_numbers), icon: Smartphone,
      tone: (overview.connected_numbers === 0 ? 'red' : 'green') as Tone,
      hint: overview.connected_numbers === 0 ? 'No WhatsApp number yet' : undefined,
      to: hasPermission('accounts', 'read') ? '/settings/accounts' : undefined,
    },
    has(overview.calls_30d) && {
      key: 'calls', label: 'Calls (30d)', value: formatCount(overview.calls_30d), icon: PhoneCall, tone: 'purple' as Tone, to: '/calling/logs',
    },
    has(overview.chatbot_flows) && {
      key: 'flows', label: 'Chatbot Flows', value: formatCount(overview.chatbot_flows), icon: Bot, tone: 'teal' as Tone, to: '/chatbot/flows',
    },
    has(overview.ad_leads_30d) && {
      key: 'leads', label: 'Ad Leads (30d)', value: formatCount(overview.ad_leads_30d), icon: Target, tone: 'orange' as Tone,
    },
    has(overview.ai_responses_30d) && {
      key: 'ai', label: 'AI Replies (30d)', value: formatCount(overview.ai_responses_30d), icon: Sparkles, tone: 'purple' as Tone,
    },
    plan && {
      key: 'plan', label: plan.status === 'trial' ? 'Trial Plan' : 'Current Plan', value: plan.name || 'No plan', icon: CreditCard,
      tone: (actions.plan_expired ? 'red' : actions.plan_expiring_soon ? 'amber' : 'green') as Tone,
      hint:
        daysLeft === null
          ? 'No renewal date'
          : daysLeft < 0
            ? `Expired ${formatShortDate(plan.renewal_date)}`
            : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left${plan.status === 'trial' ? ' in trial' : ''}`,
      to: '/settings/billing',
    },
    quotaContacts && {
      key: 'quota', label: 'Contact Quota', icon: Gauge, tone: 'slate' as Tone,
      value: quotaContacts.limit > 0 ? `${Math.round((quotaContacts.used / quotaContacts.limit) * 100)}%` : 'Unlimited',
      progress: quotaContacts.limit > 0 ? (quotaContacts.used / quotaContacts.limit) * 100 : undefined,
      hint: plan!.quotas
        .map((q) => `${q.label}: ${formatCount(q.used)}${q.limit > 0 ? `/${formatCount(q.limit)}` : ''}`)
        .join(' · '),
    },
  ].filter(Boolean) as CardDef[];

  // --- Action needed ---
  const todos: { key: string; title: string; subtitle: string; to: string; tone: 'red' | 'amber' }[] = [];
  if (actions.plan_expired) {
    todos.push({ key: 'expired', title: 'Your plan has expired', subtitle: 'Renew to keep sending messages', to: '/settings/billing', tone: 'red' });
  } else if (actions.plan_expiring_soon && plan) {
    todos.push({
      key: 'expiring',
      title: plan.status === 'trial' ? 'Your free trial ends soon' : 'Your plan renews soon',
      subtitle: `${daysLeft} day${daysLeft === 1 ? '' : 's'} left · ${formatShortDate(plan.renewal_date)}`,
      to: '/settings/billing',
      tone: 'amber',
    });
  }
  if (actions.no_number_connected && !isExplorer) {
    todos.push({ key: 'number', title: 'No WhatsApp number connected', subtitle: 'Connect a number to start messaging', to: '/settings/accounts', tone: 'red' });
  }
  if ((actions.templates_rejected ?? 0) > 0) {
    todos.push({ key: 'rejected', title: `${actions.templates_rejected} template${actions.templates_rejected === 1 ? '' : 's'} rejected or paused`, subtitle: 'Review and resubmit', to: '/templates', tone: 'red' });
  }
  if ((actions.templates_pending ?? 0) > 0) {
    todos.push({ key: 'pending', title: `${actions.templates_pending} template${actions.templates_pending === 1 ? '' : 's'} awaiting approval`, subtitle: 'Meta is reviewing them', to: '/templates', tone: 'amber' });
  }
  if ((actions.unassigned_conversations ?? 0) > 0) {
    todos.push({ key: 'unassigned', title: `${actions.unassigned_conversations} unassigned conversation${actions.unassigned_conversations === 1 ? '' : 's'}`, subtitle: 'Waiting in the agent queue', to: '/chatbot/transfers', tone: 'amber' });
  }
  if ((actions.open_support_tickets ?? 0) > 0) {
    todos.push({ key: 'tickets', title: `${actions.open_support_tickets} open support ticket${actions.open_support_tickets === 1 ? '' : 's'}`, subtitle: 'Our team will reply soon', to: '/support', tone: 'amber' });
  }

  const quickLinks = [
    hasPermission('chat', 'read') && { label: 'Chats', to: '/chat', icon: MessageSquare, tone: 'green' as Tone, meta: agent ? formatCount(agent.my_open_chats) : 'Open' },
    hasPermission('contacts', 'read') && { label: 'Contacts', to: '/contacts', icon: Users, tone: 'blue' as Tone, meta: has(overview.total_contacts) ? formatCount(overview.total_contacts) : 'View' },
    hasPermission('campaigns', 'read') && { label: 'Campaigns', to: '/campaigns', icon: Megaphone, tone: 'orange' as Tone, meta: isExplorer ? 'View' : 'Manage' },
    hasPermission('templates', 'read') && { label: 'Templates', to: '/templates', icon: FileText, tone: 'teal' as Tone, meta: has(overview.templates_total) ? formatCount(overview.templates_total) : 'View' },
    !isExplorer && hasPermission('settings.general', 'read') && { label: 'Billing', to: '/settings/billing', icon: CreditCard, tone: 'purple' as Tone, meta: 'Manage' },
    !isExplorer && hasPermission('accounts', 'read') && { label: 'WhatsApp Numbers', to: '/settings/accounts', icon: Smartphone, tone: 'green' as Tone, meta: has(overview.connected_numbers) ? formatCount(overview.connected_numbers) : undefined },
    { label: 'Support', to: '/support', icon: LifeBuoy, tone: 'red' as Tone, meta: has(actions.open_support_tickets) && actions.open_support_tickets > 0 ? `${actions.open_support_tickets} open` : 'Help' },
    isExplorer && { label: 'Choose a plan', to: '/pricing', icon: Sparkles, tone: 'teal' as Tone, meta: 'Pricing' },
  ].filter(Boolean) as { label: string; to: string; icon: LucideIcon; tone: Tone; meta?: string }[];

  return (
    <div className="space-y-6">
      {isExplorer && <DemoBanner />}

      {todayCards.length > 0 && (
        <section className="space-y-3">
          <SectionTitle icon={Sun} title="Today at a Glance" tone="amber" />
          <StatGrid>
            {todayCards.map(({ key, ...c }) => (
              <StatCard key={key} variant="compact" {...c} />
            ))}
          </StatGrid>
        </section>
      )}

      {showMyWork && (
        <section className="space-y-3">
          <SectionTitle icon={Headphones} title="My Work" tone="green" />
          <StatGrid>
            {myCards.map(({ key, ...c }) => (
              <StatCard key={key} variant="compact" {...c} />
            ))}
          </StatGrid>
        </section>
      )}

      {overviewCards.length > 0 && (
        <section className="space-y-3">
          <SectionTitle icon={LayoutGrid} title="Workspace Overview" tone="teal" />
          <StatGrid>
            {overviewCards.map(({ key, ...c }) => (
              <StatCard key={key} {...c} />
            ))}
          </StatGrid>
        </section>
      )}

      <section className="space-y-3">
        <SectionTitle
          icon={AlertTriangle}
          title="Action Needed"
          tone="red"
          action={
            todos.length > 0 ? (
              <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">
                {todos.length}
              </span>
            ) : undefined
          }
        />
        <div className="grid gap-4 lg:grid-cols-3">
          <Panel title="Needs your attention" icon={AlertTriangle} tone="red" className="lg:col-span-2">
            {todos.length === 0 ? (
              <PanelEmpty>
                <CheckCircle2 className="h-5 w-5 mx-auto mb-1 text-emerald-500" />
                All caught up — nothing needs your attention.
              </PanelEmpty>
            ) : (
              todos.map((t) => (
                <PanelRow
                  key={t.key}
                  to={t.to}
                  title={
                    <span className="flex items-center gap-2">
                      <span className={cn('h-2 w-2 rounded-full shrink-0', t.tone === 'red' ? 'bg-rose-500' : 'bg-amber-500')} />
                      {t.title}
                    </span>
                  }
                  subtitle={t.subtitle}
                  right={<span className="text-[11px] font-semibold text-[#0f5c62] dark:text-teal-300">Open →</span>}
                />
              ))
            )}
          </Panel>

          {plan ? (
            <Panel
              title={plan.status === 'trial' ? 'Free trial' : 'Subscription'}
              icon={actions.plan_expired ? PhoneOff : CalendarClock}
              tone={actions.plan_expired ? 'red' : actions.plan_expiring_soon ? 'amber' : 'green'}
              linkLabel="Billing"
              linkTo="/settings/billing"
            >
              <PanelRow
                title={plan.name || 'No plan'}
                subtitle={plan.price > 0 ? `${formatMoney(plan.price, plan.currency)} / ${plan.interval === 'yearly' ? 'year' : 'month'}` : 'Free'}
                right={
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize',
                      plan.status === 'active'
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                        : plan.status === 'trial'
                          ? 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300'
                          : 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
                    )}
                  >
                    {plan.status}
                  </span>
                }
              />
              <PanelRow
                title={plan.renewal_date ? formatShortDate(plan.renewal_date) : 'No renewal date'}
                subtitle={plan.status === 'trial' ? 'Trial ends' : 'Renews on'}
                right={
                  daysLeft !== null ? (
                    <span className={cn('text-xs font-semibold', daysLeft < 0 ? 'text-rose-600' : daysLeft <= 7 ? 'text-amber-600' : 'text-gray-500')}>
                      {daysLeft < 0 ? 'Expired' : `${daysLeft}d left`}
                    </span>
                  ) : undefined
                }
              />
            </Panel>
          ) : agent ? (
            <Panel title="My queue" icon={Headphones} tone="green" linkLabel="Open chats" linkTo="/chat">
              <PanelRow title="Open chats" right={<span className="text-sm font-bold tabular-nums">{formatCount(agent.my_open_chats)}</span>} />
              <PanelRow title="Assigned to me" right={<span className="text-sm font-bold tabular-nums">{formatCount(agent.assigned_to_me)}</span>} />
              <PanelRow title="My messages today" right={<span className="text-sm font-bold tabular-nums">{formatCount(agent.my_messages_today)}</span>} />
            </Panel>
          ) : (
            <Panel title="Get started" icon={Sparkles} tone="teal">
              <PanelEmpty>Explore the sample chats, campaigns and templates.</PanelEmpty>
            </Panel>
          )}
        </div>

        {quickLinks.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {quickLinks.map((q) => (
              <QuickLinkTile key={q.to + q.label} {...q} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default WorkspaceOverviewSections;
