import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth';
import { widgetsService, type DashboardWidget, type WidgetData } from '@/services/api';
import { readList } from '@/services/response';
import { Button } from '@/components/ui/button';
import { HeroBanner } from '@/components/shared/HeroBanner';
import {
  LayoutDashboard,
  Plus,
  GripVertical,
  MessageSquare,
  Users,
  Bot,
  Send,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Calendar,
  FileText,
  Megaphone,
  Workflow,
  Contact,
  ArrowRight,
  UserX,
  LineChart,
  Settings,
  MessageSquareText,
  Tags,
  Shield,
  Key,
  Webhook,
  Zap,
  ShieldCheck,
  CreditCard,
  LifeBuoy,
  Globe,
  Activity,
  Play,
  Video,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const LARGE_DISPLAY_TYPES = ['chart', 'table', 'shortcuts'];

const formatDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const getDateRange = (range: string): { from: string; to: string } => {
  const now = new Date();
  const today = formatDay(now);
  const daysAgo = (n: number) => formatDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - n));
  switch (range) {
    case 'today':
      return { from: today, to: today };
    case '7days':
      return { from: daysAgo(7), to: today };
    case '30days':
      return { from: daysAgo(30), to: today };
    case 'this_month':
    default:
      return { from: formatDay(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
  }
};

const formatRowTime = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString();
};

export const DashboardView: React.FC = () => {
  const { t } = useTranslation();
  const { hasPermission } = useAuthStore();

  const [widgets, setWidgets] = useState<DashboardWidget[]>([]);
  const [widgetData, setWidgetData] = useState<Record<string, WidgetData>>({});
  const [selectedRange, setSelectedRange] = useState('30days');
  const [isDragMode, setIsDragMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // OneSuit Meta Platform & Wallet state
  const [walletRechargeOpen, setWalletRechargeOpen] = useState(false);
  const [tutorialsOpen, setTutorialsOpen] = useState(false);
  const [walletBalance, setWalletBalance] = useState(4850.0);
  const [selectedRecharge, setSelectedRecharge] = useState<number>(2000);
  const [customRecharge, setCustomRecharge] = useState('');
  const [isRecharging, setIsRecharging] = useState(false);

  const canCreateWidget = hasPermission('analytics', 'write');
  const canEditWidget = hasPermission('analytics', 'write');

  useEffect(() => {
    let cancelled = false;
    widgetsService
      .list()
      .then((res) => {
        if (!cancelled) setWidgets(readList<DashboardWidget>(res, 'widgets'));
      })
      .catch(() => {
        if (!cancelled) setWidgets([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (widgets.length === 0) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    const { from, to } = getDateRange(selectedRange);
    widgetsService
      .getAllData({ from, to })
      .then((res) => {
        if (!cancelled && res.data?.data) {
          setWidgetData(res.data.data);
        }
        setIsLoading(false);
      })
      .catch(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [widgets, selectedRange]);

  const getWidgetIcon = (dataSource?: string) => {
    switch (dataSource) {
      case 'messages':
        return MessageSquare;
      case 'contacts':
        return Users;
      case 'chatbot':
        return Bot;
      case 'campaigns':
        return Megaphone;
      default:
        return BarChart3;
    }
  };

  const getWidgetColor = (dataSource?: string) => {
    switch (dataSource) {
      case 'messages':
        return {
          bg: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400',
          border: 'border-emerald-200/60',
        };
      case 'contacts':
        return {
          bg: 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400',
          border: 'border-blue-200/60',
        };
      case 'chatbot':
        return {
          bg: 'bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-400',
          border: 'border-purple-200/60',
        };
      case 'campaigns':
        return {
          bg: 'bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-400',
          border: 'border-teal-200/60',
        };
      default:
        return {
          bg: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400',
          border: 'border-amber-200/60',
        };
    }
  };

  const shortcutRegistry: Record<
    string,
    { label: string; to: string; icon: React.ComponentType<{ className?: string }>; gradient: string }
  > = {
    chat: { label: t('nav.chat'), to: '/chat', icon: MessageSquare, gradient: 'from-emerald-500 to-green-600' },
    campaigns: { label: t('nav.campaigns'), to: '/campaigns', icon: Megaphone, gradient: 'from-rose-500 to-pink-600' },
    templates: { label: t('nav.templates'), to: '/templates', icon: FileText, gradient: 'from-amber-500 to-orange-600' },
    flows: { label: t('nav.flows'), to: '/flows', icon: Workflow, gradient: 'from-indigo-500 to-violet-600' },
    contacts: { label: t('nav.contacts'), to: '/contacts', icon: Contact, gradient: 'from-blue-500 to-cyan-600' },
    chatbot_overview: { label: t('nav.overview'), to: '/chatbot', icon: Bot, gradient: 'from-teal-500 to-emerald-600' },
    chatbot_keywords: { label: t('nav.keywords'), to: '/chatbot/keywords', icon: Key, gradient: 'from-sky-500 to-blue-600' },
    chatbot_flows: { label: t('nav.flows'), to: '/chatbot/flows', icon: Workflow, gradient: 'from-purple-500 to-pink-600' },
    chatbot_transfers: { label: t('nav.transfers'), to: '/chatbot/transfers', icon: UserX, gradient: 'from-red-500 to-rose-600' },
    analytics_agents: { label: t('nav.agentAnalytics'), to: '/analytics/agents', icon: BarChart3, gradient: 'from-cyan-500 to-teal-600' },
    analytics_meta: { label: t('nav.metaInsights'), to: '/analytics/meta-insights', icon: LineChart, gradient: 'from-blue-600 to-indigo-600' },
    settings_general: { label: t('nav.general'), to: '/settings', icon: Settings, gradient: 'from-gray-600 to-gray-700' },
    settings_accounts: { label: t('nav.accounts'), to: '/settings/accounts', icon: Users, gradient: 'from-emerald-600 to-teal-700' },
    settings_canned: { label: t('nav.cannedResponses'), to: '/settings/canned-responses', icon: MessageSquareText, gradient: 'from-amber-600 to-yellow-600' },
    settings_tags: { label: t('nav.tags'), to: '/settings/tags', icon: Tags, gradient: 'from-purple-600 to-indigo-600' },
    settings_teams: { label: t('nav.teams'), to: '/settings/teams', icon: Users, gradient: 'from-blue-600 to-cyan-700' },
    settings_users: { label: t('nav.users'), to: '/settings/users', icon: Users, gradient: 'from-teal-600 to-green-700' },
    settings_roles: { label: t('nav.roles'), to: '/settings/roles', icon: Shield, gradient: 'from-rose-600 to-pink-700' },
    settings_api_keys: { label: t('nav.apiKeys'), to: '/settings/api-keys', icon: Key, gradient: 'from-orange-500 to-amber-600' },
    settings_webhooks: { label: t('nav.webhooks'), to: '/settings/webhooks', icon: Webhook, gradient: 'from-violet-600 to-purple-700' },
    settings_custom_actions: { label: t('nav.customActions'), to: '/settings/custom-actions', icon: Zap, gradient: 'from-yellow-500 to-amber-600' },
    settings_sso: { label: t('nav.sso'), to: '/settings/sso', icon: ShieldCheck, gradient: 'from-emerald-600 to-green-700' },
    support: { label: t('nav.support') || 'Raise Support Ticket', to: '/support', icon: LifeBuoy, gradient: 'from-rose-500 to-pink-600' },
    billing: { label: 'Billing & Wallet', to: '/settings/billing', icon: CreditCard, gradient: 'from-teal-600 to-emerald-700' },
    opt_in: { label: 'Website Chat Widget', to: '/settings/opt-in', icon: Globe, gradient: 'from-blue-600 to-cyan-700' },
  };

  const defaultShortcutKeys = ['chat', 'campaigns', 'templates', 'support', 'billing', 'contacts'];

  const statWidgets = widgets.filter((w) => !LARGE_DISPLAY_TYPES.includes(w.display_type));
  const tableWidget = widgets.find((w) => w.display_type === 'table');
  const shortcutsWidget = widgets.find((w) => w.display_type === 'shortcuts');

  const tableRows = (tableWidget && widgetData[tableWidget.id]?.table_rows) || [];
  const configuredShortcuts = shortcutsWidget?.config?.shortcuts;
  const shortcutKeys: string[] = Array.isArray(configuredShortcuts) ? configuredShortcuts : defaultShortcutKeys;
  const shortcuts = shortcutKeys
    .map((key) => shortcutRegistry[key])
    .filter((sc): sc is (typeof shortcutRegistry)[string] => !!sc);

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return Math.round(num).toString();
  };

  return (
    <div className="flex flex-col h-full bg-[#f8faf9] text-gray-900 overflow-y-auto">
      {/* Header Bar */}
      <header className="border-b border-gray-200/80 bg-white dark:bg-[#141b1a] px-6 py-4 shrink-0 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 max-w-7xl mx-auto w-full">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white leading-tight">
              {t('dashboard.title') || 'Dashboard Overview'}
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('dashboard.subtitle') || 'Monitor your Meta WhatsApp business metrics and active conversations'}
            </p>
          </div>

          {/* Time Range Filter & Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            {canCreateWidget && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-xl border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                <Plus className="h-3.5 w-3.5 mr-1 text-gray-500" />
                {t('dashboard.addWidget') || 'Add Widget'}
              </Button>
            )}

            {canEditWidget && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsDragMode(!isDragMode)}
                className={cn(
                  'h-8 rounded-xl border-gray-200 text-xs font-semibold transition-all',
                  isDragMode
                    ? 'bg-teal-50 border-teal-300 text-teal-800'
                    : 'text-gray-700 hover:bg-gray-50'
                )}
              >
                <GripVertical className="h-3.5 w-3.5 mr-1" />
                {isDragMode ? t('common.done') || 'Done' : t('dashboard.editLayout') || 'Edit Layout'}
              </Button>
            )}

            {/* Range Selector */}
            <div className="relative">
              <select
                value={selectedRange}
                onChange={(e) => setSelectedRange(e.target.value)}
                className="h-8 pl-3 pr-8 text-xs bg-gray-50 dark:bg-white/[0.04] border border-gray-200 dark:border-white/10 rounded-xl text-gray-700 dark:text-gray-200 font-medium appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-teal-600"
              >
                <option value="today">Today</option>
                <option value="7days">Last 7 Days</option>
                <option value="30days">Last 30 Days</option>
                <option value="this_month">This Month</option>
              </select>
              <Calendar className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="p-6 space-y-6 max-w-7xl mx-auto w-full">
        {/* Nebula AI Hero Banner */}
        <HeroBanner
          title="Meet Campaign Agent, your AI campaign manager"
          description="Describe your audience & goal once. AI writes high-converting copy and optimizes broadcast scheduling for maximum response rate."
          badge="AI AGENT"
          actionText="Explore Agent"
          onAction={() => {}}
        />

        {/* Meta WhatsApp Platform Telemetry & Health Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Meta WhatsApp API Status */}
          <div className="rounded-2xl border border-gray-200/90 dark:border-white/10 bg-white dark:bg-[#141b1a] p-4 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Meta WhatsApp API
              </span>
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
              </span>
            </div>
            <div className="mt-2">
              <div className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                Operational
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Ping: 94 ms · Uptime: 99.98%
              </p>
            </div>
          </div>

          {/* 2. Quality Rating */}
          <div className="rounded-2xl border border-gray-200/90 dark:border-white/10 bg-white dark:bg-[#141b1a] p-4 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                WABA Quality Rating
              </span>
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="mt-2">
              <div className="flex items-center gap-2">
                <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-[11px] font-bold">
                  HIGH QUALITY
                </Badge>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">
                0 flagged templates · Green health tier
              </p>
            </div>
          </div>

          {/* 3. 24h Message Limit Tier */}
          <div className="rounded-2xl border border-gray-200/90 dark:border-white/10 bg-white dark:bg-[#141b1a] p-4 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Daily Message Quota
              </span>
              <span className="text-[10px] font-semibold text-teal-600 dark:text-teal-400">Tier 3 (100k/day)</span>
            </div>
            <div className="mt-2">
              <div className="text-xs font-bold text-gray-900 dark:text-white">
                14,280 <span className="text-[11px] font-normal text-gray-400">/ 100,000 sent</span>
              </div>
              <div className="w-full bg-gray-100 dark:bg-white/10 rounded-full h-1.5 mt-2 overflow-hidden">
                <div className="bg-gradient-to-r from-teal-500 to-emerald-500 h-1.5 rounded-full" style={{ width: '14.3%' }} />
              </div>
              <p className="text-[10px] text-gray-400 mt-1">
                14.3% consumed · Resets at midnight UTC
              </p>
            </div>
          </div>

          {/* 4. Prepaid Wallet & Tutorials */}
          <div className="rounded-2xl border border-gray-200/90 dark:border-white/10 bg-white dark:bg-[#141b1a] p-4 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Prepaid Wallet
              </span>
              <CreditCard className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            </div>
            <div className="mt-1">
              <div className="text-base font-black text-emerald-600 dark:text-emerald-400">
                ₹{walletBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
              <div className="flex items-center gap-1.5 mt-2">
                <Button
                  size="sm"
                  onClick={() => setWalletRechargeOpen(true)}
                  className="h-7 px-2 text-[10px] font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  + Recharge
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setTutorialsOpen(true)}
                  className="h-7 px-2 text-[10px] font-semibold rounded-lg border-teal-500/30 text-teal-700 dark:text-teal-300 hover:bg-teal-50"
                >
                  <Video className="h-3 w-3 mr-1" />
                  Tutorials
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Small Stat Cards Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {statWidgets.map((widget) => {
            const data = widgetData[widget.id];
            const Icon = getWidgetIcon(widget.data_source);
            const colors = getWidgetColor(widget.data_source);
            const change = data?.change ?? 0;

            return (
              <div
                key={widget.id}
                className="rounded-2xl border border-gray-200/90 bg-white dark:bg-[#141b1a] dark:border-[#1e2a28] shadow-sm p-5 hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {widget.name}
                  </span>
                  <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center shadow-xs', colors.bg)}>
                    <Icon className="h-5 w-5" />
                  </div>
                </div>

                <div className="pt-3">
                  <div className="text-2xl font-extrabold text-gray-900 dark:text-white tracking-tight">
                    {data ? formatNumber(data.value) : '0'}
                  </div>

                  {widget.show_change && (
                    <div className="flex items-center text-xs mt-1.5">
                      {change >= 0 ? (
                        <TrendingUp className="h-3 w-3 mr-1 text-emerald-600" />
                      ) : (
                        <TrendingDown className="h-3 w-3 mr-1 text-rose-600" />
                      )}
                      <span className={change >= 0 ? 'text-emerald-700 font-semibold' : 'text-rose-700 font-semibold'}>
                        {Math.abs(change).toFixed(1)}%
                      </span>
                      <span className="ml-1 text-gray-400">vs prev period</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Large Widgets: Recent Messages & Quick Actions */}
        <div className="grid gap-6 md:grid-cols-12">
          {/* Recent Messages (Table Widget) */}
          <div className="md:col-span-6 rounded-2xl border border-gray-200/90 bg-white dark:bg-[#141b1a] dark:border-[#1e2a28] shadow-sm p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-white/[0.06]">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                    {tableWidget?.name || 'Recent Messages'}
                  </h3>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    {tableWidget?.description || 'Latest conversations across WhatsApp business lines'}
                  </p>
                </div>
                <Link to="/chat" className="text-xs text-teal-700 dark:text-teal-400 hover:underline font-semibold flex items-center gap-1">
                  View all <ArrowRight className="h-3 w-3" />
                </Link>
              </div>

              <div className="divide-y divide-gray-100 dark:divide-white/[0.04] pt-2">
                {!isLoading && tableRows.length === 0 && (
                  <p className="py-8 text-center text-xs text-gray-400">
                    No recent message activity
                  </p>
                )}
                {tableRows.map((row) => (
                  <div key={row.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="h-9 w-9 rounded-full bg-teal-50 text-teal-700 font-bold flex items-center justify-center shrink-0 border border-teal-200/60 text-xs">
                        {row.label?.[0]?.toUpperCase() || 'C'}
                      </div>
                      <div className="overflow-hidden">
                        <div className="text-xs font-semibold text-gray-900 dark:text-white truncate">{row.label}</div>
                        <div className="text-[11px] text-gray-400 truncate max-w-xs">{row.sub_label}</div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[10px] text-gray-400 block">{formatRowTime(row.created_at)}</span>
                      {row.status && (
                        <span className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200/60">
                          {row.status}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Quick Actions (Shortcuts Widget) */}
          <div className="md:col-span-6 rounded-2xl border border-gray-200/90 bg-white dark:bg-[#141b1a] dark:border-[#1e2a28] shadow-sm p-6">
            <div className="pb-4 border-b border-gray-100 dark:border-white/[0.06]">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                {shortcutsWidget?.name || 'Quick Actions'}
              </h3>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {shortcutsWidget?.description || 'Instant shortcuts to standard daily operations'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-4">
              {shortcuts.map((sc) => {
                const Icon = sc.icon;
                return (
                  <Link
                    key={sc.to}
                    to={sc.to}
                    className="p-3.5 rounded-2xl border border-gray-200/80 bg-gray-50/50 hover:bg-teal-50/50 dark:bg-white/[0.02] dark:hover:bg-white/[0.06] transition-all flex items-center gap-3 group"
                  >
                    <div className={cn('h-10 w-10 rounded-xl bg-gradient-to-br flex items-center justify-center text-white shrink-0 shadow-sm', sc.gradient)}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="overflow-hidden">
                      <div className="text-xs font-bold text-gray-800 dark:text-gray-200 group-hover:text-teal-700 dark:group-hover:text-teal-300 transition-colors truncate">
                        {sc.label}
                      </div>
                      <div className="text-[10px] text-gray-400">Launch workflow</div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Recharge Wallet Modal */}
      <Dialog open={walletRechargeOpen} onOpenChange={setWalletRechargeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-emerald-500" />
              Recharge Prepaid Wallet
            </DialogTitle>
            <DialogDescription>
              Add funds to pay for WhatsApp conversation messages, marketing broadcasts and AI automation.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                Select Amount (INR)
              </Label>
              <div className="grid grid-cols-4 gap-2 mt-2">
                {[500, 1000, 2000, 5000].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => {
                      setSelectedRecharge(amt);
                      setCustomRecharge('');
                    }}
                    className={`py-2 text-xs font-bold rounded-xl border transition-all ${
                      selectedRecharge === amt && !customRecharge
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-500'
                        : 'border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/[0.05]'
                    }`}
                  >
                    ₹{amt.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="dash-custom-amount" className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                Or Custom Amount (₹)
              </Label>
              <Input
                id="dash-custom-amount"
                type="number"
                placeholder="e.g. 10000"
                value={customRecharge}
                onChange={(e) => {
                  setCustomRecharge(e.target.value);
                  setSelectedRecharge(0);
                }}
                className="mt-1 h-9 text-xs"
              />
            </div>

            <div className="p-3 bg-gray-50 dark:bg-white/[0.03] rounded-xl border border-gray-100 dark:border-white/5 text-[11px] text-gray-500 space-y-1">
              <div className="flex justify-between">
                <span>Current Balance:</span>
                <span className="font-semibold text-gray-900 dark:text-white">₹{walletBalance.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Recharge Amount:</span>
                <span className="font-bold text-gray-900 dark:text-white">
                  ₹{(customRecharge ? parseFloat(customRecharge) || 0 : selectedRecharge).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between pt-1 border-t border-gray-200/50 dark:border-white/5 font-bold text-gray-900 dark:text-white">
                <span>New Balance:</span>
                <span className="text-emerald-600 dark:text-emerald-400">
                  ₹{(walletBalance + (customRecharge ? parseFloat(customRecharge) || 0 : selectedRecharge)).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setWalletRechargeOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                const amt = customRecharge ? parseFloat(customRecharge) : selectedRecharge;
                if (!amt || amt <= 0) {
                  toast.error('Please enter a valid amount');
                  return;
                }
                setIsRecharging(true);
                setTimeout(() => {
                  setWalletBalance((prev) => prev + amt);
                  setIsRecharging(false);
                  setWalletRechargeOpen(false);
                  setCustomRecharge('');
                  toast.success(`Successfully added ₹${amt.toLocaleString()} to your wallet!`);
                }, 800);
              }}
              disabled={isRecharging}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
            >
              {isRecharging ? 'Processing...' : 'Proceed to Pay with Razorpay / UPI'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Video Tutorials Modal */}
      <Dialog open={tutorialsOpen} onOpenChange={setTutorialsOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Video className="h-5 w-5 text-teal-600" />
              OneSuit Training & Video Tutorials
            </DialogTitle>
            <DialogDescription>
              Watch step-by-step masterclasses to get the most out of your WhatsApp business automation.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-3">
            {[
              {
                title: '1. Connect Meta Cloud API & WABA',
                duration: '6 mins',
                level: 'Beginner',
                description: 'Complete Meta embedded signup, verify phone number, and generate permanent system access tokens.',
              },
              {
                title: '2. Launch Targeted Broadcast Campaigns',
                duration: '8 mins',
                level: 'Intermediate',
                description: 'Upload contact CSVs, choose approved templates, map custom variables, and schedule broadcasts.',
              },
              {
                title: '3. Build Drag-and-Drop Flow Chatbots',
                duration: '12 mins',
                level: 'Advanced',
                description: 'Create multi-step conversational flows, interactive buttons, webhook integrations, and human agent transfers.',
              },
              {
                title: '4. Omnichannel Live Chat Mastery',
                duration: '5 mins',
                level: 'Beginner',
                description: 'Organize chats by tags, use canned text templates, manage internal notes, and transfer conversations.',
              },
            ].map((v, i) => (
              <div
                key={i}
                className="p-3.5 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50/50 dark:bg-white/[0.02] hover:bg-teal-50/40 dark:hover:bg-white/[0.06] transition-all flex flex-col justify-between group cursor-pointer"
                onClick={() => toast.success(`Opening tutorial: "${v.title}"`)}
              >
                <div>
                  <div className="flex items-center justify-between text-[10px] text-gray-400 mb-1.5">
                    <span className="font-bold uppercase text-teal-600 dark:text-teal-400">{v.level}</span>
                    <span>{v.duration}</span>
                  </div>
                  <h4 className="text-xs font-bold text-gray-900 dark:text-white group-hover:text-teal-600 transition-colors">
                    {v.title}
                  </h4>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 leading-snug">
                    {v.description}
                  </p>
                </div>
                <div className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-teal-600 dark:text-teal-400">
                  <Play className="h-3 w-3 fill-current" /> Watch Video
                </div>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setTutorialsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DashboardView;
