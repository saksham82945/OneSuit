import React, { useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate, Link } from 'react-router-dom';
import { VendorAccessBanner } from './VendorAccessBanner';
import { ExplorerBanner } from './ExplorerBanner';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth';
import { Button } from '@/components/ui/button';
import {
  Menu,
  X,
  PanelLeftOpen,
  PanelLeftClose,
  LayoutDashboard,
  ShieldCheck,
  MessageSquare,
  Contact,
  Megaphone,
  FileText,
  Workflow,
  ShoppingBag,
  BarChart3,
  Settings,
  Handshake,
  CreditCard,
  SlidersHorizontal,
  Ticket,
  Phone,
  Sparkles,
  MessageSquareText,
  Tags,
  Users,
  Shield,
  Key,
  Webhook,
  Zap,
  ScrollText,
  LineChart,
  Bot,
  UserX,
  Globe,
  Radio,
  UsersRound,
  ClipboardList,
  Activity,
  Settings2,
} from 'lucide-react';
import { PrimaryRail } from './PrimaryRail';
import { SecondarySidebar, type SecondaryNavGroup } from './SecondarySidebar';
import { TopStatusBar } from './TopStatusBar';
import { useBrandedTitle, useBranding } from '@/services/branding';
import { BrandMark } from '@/views/public/PublicLayout';

export const AppLayout: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { hasPermission, user, refreshUser } = useAuthStore();
  const isSuperAdmin = Boolean(user?.is_super_admin);
  const { platform_name: platformName } = useBranding();
  useBrandedTitle();

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const [isRailExpanded, setIsRailExpanded] = useState<boolean>(() => {
    try {
      return localStorage.getItem('onesuit-rail-expanded') === 'true';
    } catch {
      return false;
    }
  });

  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('onesuit-subnav-collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const toggleRailExpanded = () => {
    setIsRailExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('onesuit-rail-expanded', String(next));
      } catch {}
      return next;
    });
  };

  const toggleSecondaryCollapsed = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('onesuit-subnav-collapsed', String(next));
      } catch {}
      return next;
    });
  };

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Determine active module based on current URL
  const activeModuleId = useMemo(() => {
    const path = location.pathname;
    if (path.startsWith('/super-admin')) return 'super-admin';
    if (path === '/') return 'dashboard';
    if (path.startsWith('/flows') || path.startsWith('/chatbot')) return 'flows';
    if (path === '/chat' || path.startsWith('/chat/')) return 'chat';
    // /settings/contacts and /settings/tags stay in Settings; the Contacts menu uses /contacts and /tags.
    if (path.startsWith('/contacts') || path.startsWith('/tags')) return 'contacts';
    if (path.startsWith('/campaigns')) return 'campaigns';
    if (path === '/ads' || path.startsWith('/ads/')) return 'ads';
    if (path.startsWith('/templates')) return 'templates';
    if (path.startsWith('/catalogs')) return 'catalogs';
    if (path.startsWith('/analytics')) return 'analytics';
    if (path.startsWith('/settings')) return 'settings';
    if (path.startsWith('/support')) return 'support';
    return isSuperAdmin ? 'super-admin' : 'dashboard';
  }, [location.pathname, isSuperAdmin]);

  // Construct context-aware secondary nav groups with full permission checking
  const currentNavGroup: SecondaryNavGroup | null = useMemo(() => {
    if (activeModuleId === 'super-admin') {
      return {
        moduleId: 'super-admin',
        title: 'nav.sectionSuperAdmin',
        subtitle: 'Platform Operations',
        items: [
          { name: 'nav.superAdminDashboard', path: '/super-admin', icon: ShieldCheck, exact: true },
          { name: 'nav.agencies', path: '/super-admin/vendors', icon: Handshake },
          { name: 'nav.subscriptions', path: '/super-admin/subscriptions', icon: CreditCard },
          { name: 'nav.pagesManagement', path: '/super-admin/pages', icon: FileText },
          { name: 'nav.configuration', path: '/super-admin/configuration', icon: SlidersHorizontal },
          { name: 'nav.manageTickets', path: '/super-admin/tickets', icon: Ticket },
          { name: 'nav.aiCallSetup', path: '/super-admin/ai-call-setup', icon: Phone },
          { name: 'nav.aiAgents', path: '/chatbot/ai', icon: Sparkles, badge: 'AI', badgeVariant: 'ai' },
        ],
      };
    }

    if (activeModuleId === 'dashboard') {
      const items = [
        { name: 'nav.dashboard', path: '/', icon: LayoutDashboard, exact: true },
        hasPermission('analytics.agents', 'read') ? { name: 'nav.agentAnalytics', path: '/analytics/agents', icon: BarChart3 } : null,
        hasPermission('analytics', 'read') ? { name: 'nav.metaInsights', path: '/analytics/meta-insights', icon: LineChart } : null,
      ].filter(Boolean) as SecondaryNavGroup['items'];

      return {
        moduleId: 'dashboard',
        title: 'nav.sectionMain',
        subtitle: 'Workspace Overview',
        items,
      };
    }

    if (activeModuleId === 'chat') {
      const items = [
        { name: 'nav.chat', path: '/chat', icon: MessageSquare },
      ].filter(Boolean) as SecondaryNavGroup['items'];

      return {
        moduleId: 'chat',
        title: 'nav.chat',
        subtitle: 'Live Inbox',
        items,
      };
    }

    if (activeModuleId === 'contacts') {
      const items = [
        hasPermission('contacts', 'read') ? { name: 'nav.contacts', path: '/contacts', icon: Contact } : null,
        hasPermission('tags', 'read') ? { name: 'nav.tags', path: '/tags', icon: Tags } : null,
      ].filter(Boolean) as SecondaryNavGroup['items'];

      return {
        moduleId: 'contacts',
        title: 'nav.contacts',
        subtitle: 'Audience & Tags',
        items,
      };
    }

    if (activeModuleId === 'campaigns') {
      const items = [
        { name: 'nav.campaigns', path: '/campaigns', icon: Megaphone },
      ].filter(Boolean) as SecondaryNavGroup['items'];

      return {
        moduleId: 'campaigns',
        title: 'nav.campaigns',
        subtitle: 'Broadcasts & Messaging',
        items,
      };
    }

    if (activeModuleId === 'ads') {
      const items: SecondaryNavGroup['items'] = hasPermission('campaigns', 'read')
        ? [
            { name: 'Ads Manager', path: '/ads', icon: Radio, exact: true },
            { name: 'Ads Agent', path: '/ads/agent', icon: Sparkles, badge: 'AI', badgeVariant: 'ai' },
            { name: 'Leads', path: '/ads/leads', icon: Users },
            { name: 'Forms', path: '/ads/forms', icon: ClipboardList },
            { name: 'Audiences', path: '/ads/audiences', icon: UsersRound },
            { name: 'Events', path: '/ads/events', icon: Activity },
            { name: 'Setup', path: '/ads/setup', icon: Settings2 },
          ]
        : [];

      return {
        moduleId: 'ads',
        title: 'Ads Manager',
        subtitle: 'Facebook & Instagram Ads',
        items,
      };
    }

    if (activeModuleId === 'templates') {
      const items = [
        { name: 'nav.templates', path: '/templates', icon: FileText },
      ].filter(Boolean) as SecondaryNavGroup['items'];

      return {
        moduleId: 'templates',
        title: 'nav.templates',
        subtitle: 'Meta Cloud API',
        items,
      };
    }

    if (activeModuleId === 'flows') {
      const items = [
        hasPermission('flows.whatsapp', 'read')
          ? { name: 'nav.flows', path: '/flows', icon: Workflow, badge: 'Popular', badgeVariant: 'popular' as const }
          : null,
        // 'nav.overview' (/chatbot) removed per request — flows overview removed from chat support section
        hasPermission('chatbot.keywords', 'read') ? { name: 'nav.keywords', path: '/chatbot/keywords', icon: Key } : null,
        hasPermission('flows.chatbot', 'read') ? { name: 'nav.flows', path: '/chatbot/flows', icon: Workflow } : null,
        hasPermission('transfers', 'read') ? { name: 'nav.transfers', path: '/chatbot/transfers', icon: UserX } : null,
      ].filter(Boolean) as SecondaryNavGroup['items'];

      return {
        moduleId: 'flows',
        title: 'nav.flows',
        subtitle: 'Automation Studio',
        items,
      };
    }


    if (activeModuleId === 'catalogs') {
      return {
        moduleId: 'catalogs',
        title: 'nav.catalogue',
        subtitle: 'Product Collections',
        items: [
          { name: 'nav.catalogue', path: '/catalogs', icon: ShoppingBag },
        ],
      };
    }

    if (activeModuleId === 'analytics') {
      const items = [
        hasPermission('analytics.agents', 'read') ? { name: 'nav.agentAnalytics', path: '/analytics/agents', icon: BarChart3 } : null,
        hasPermission('analytics', 'read') ? { name: 'nav.metaInsights', path: '/analytics/meta-insights', icon: LineChart } : null,
      ].filter(Boolean) as SecondaryNavGroup['items'];

      return {
        moduleId: 'analytics',
        title: 'nav.sectionAnalytics',
        subtitle: 'Performance Insights',
        items,
      };
    }

    if (activeModuleId === 'settings') {
      const items = [
        hasPermission('settings.general', 'read') ? { name: 'nav.general', path: '/settings', icon: Settings, exact: true } : null,
        hasPermission('accounts', 'read') ? { name: 'nav.accounts', path: '/settings/accounts', icon: Users, badge: 'Meta', badgeVariant: 'popular' as const, exact: true } : null,
        hasPermission('accounts', 'read') ? { name: 'WhatsApp Setup', path: '/settings/whatsapp-setup', icon: Phone } : null,
        hasPermission('contacts', 'read') ? { name: 'nav.contacts', path: '/settings/contacts', icon: Contact } : null,
        hasPermission('canned_responses', 'read') ? { name: 'nav.cannedResponses', path: '/settings/canned-responses', icon: MessageSquareText } : null,
        hasPermission('tags', 'read') ? { name: 'nav.tags', path: '/settings/tags', icon: Tags } : null,
        hasPermission('settings.chatbot', 'read') ? { name: 'nav.chatbot', path: '/settings/chatbot', icon: Bot } : null,
        hasPermission('teams', 'read') ? { name: 'nav.teams', path: '/settings/teams', icon: Users } : null,
        // Team users are managed by each business's admin; the super admin doesn't need this page.
        !isSuperAdmin && hasPermission('users', 'read') ? { name: 'nav.users', path: '/settings/users', icon: Users } : null,
        // Roles and audit logs are platform controls: super admin only.
        isSuperAdmin ? { name: 'nav.roles', path: '/settings/roles', icon: Shield } : null,
        hasPermission('api_keys', 'read') ? { name: 'nav.apiKeys', path: '/settings/api-keys', icon: Key } : null,
        hasPermission('webhooks', 'read') ? { name: 'nav.webhooks', path: '/settings/webhooks', icon: Webhook } : null,
        hasPermission('custom_actions', 'read') ? { name: 'nav.customActions', path: '/settings/custom-actions', icon: Zap } : null,
        hasPermission('settings.sso', 'read') ? { name: 'nav.sso', path: '/settings/sso', icon: ShieldCheck } : null,
        isSuperAdmin ? { name: 'nav.auditLogs', path: '/settings/audit-logs', icon: ScrollText } : null,
        { name: 'nav.billing', path: '/settings/billing', icon: CreditCard, badge: 'Plan', badgeVariant: 'popular' as const },
        { name: 'nav.optIn', path: '/settings/opt-in', icon: Globe },
      ].filter(Boolean) as SecondaryNavGroup['items'];

      return {
        moduleId: 'settings',
        title: 'nav.settings',
        subtitle: 'Workspace Settings',
        items,
      };
    }

    return null;
  }, [activeModuleId, hasPermission, isSuperAdmin]);

  const handleSelectPrimaryModule = (_id: string, defaultPath: string) => {
    navigate(defaultPath);
  };

  return (
    <div className="flex h-screen bg-[#f8faf9] dark:bg-[#0a0f0e] text-gray-900 dark:text-gray-100 overflow-hidden font-sans">
      {/* Mobile Header (<md) */}
      <header className="fixed top-0 left-0 right-0 z-50 flex h-13 items-center justify-between border-b border-gray-200 dark:border-gray-800 bg-spruce-dark px-3 md:hidden text-white">
        <Link to="/" className="flex items-center gap-2 min-w-0">
          <BrandMark className="h-7 w-7 rounded-lg" iconClassName="h-4 w-4" />
          <span className="font-semibold text-sm truncate max-w-[60vw]">{platformName}</span>
        </Link>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/[0.08]"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        >
          {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </header>

      {/* Mobile Drawer Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Dual Rail Navigation Structure for Desktop (>=md) */}
      <div className="hidden md:flex shrink-0 h-full relative">
        {/* Rail 1: Expandable Primary Navigation Rail */}
        <PrimaryRail
          activeModuleId={activeModuleId}
          onSelectModule={handleSelectPrimaryModule}
          isExpanded={isRailExpanded}
          onToggleExpand={toggleRailExpanded}
        />

        {/* Rail 2: Contextual Subnavbar (Secondary Sidebar) */}
        <SecondarySidebar
          currentGroup={currentNavGroup}
          collapsed={isCollapsed}
          onToggleCollapse={toggleSecondaryCollapsed}
        />

        {/* Floating Expand Button when Subnavbar is Collapsed */}
        {isCollapsed && (
          <Button
            variant="outline"
            size="sm"
            onClick={toggleSecondaryCollapsed}
            style={{ left: isRailExpanded ? '232px' : '92px' }}
            className="absolute top-3.5 z-30 h-8 px-2.5 rounded-xl bg-white dark:bg-[#111817] shadow-lg border border-gray-200/90 dark:border-gray-800 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:text-spruce-dark dark:hover:text-emerald-400 hover:bg-gray-50 dark:hover:bg-white/[0.06] transition-all flex items-center gap-1.5 animate-in fade-in slide-in-from-left-2 duration-150"
            title="Expand subnavbar"
            aria-label="Expand subnavbar"
          >
            <PanelLeftOpen className="h-4 w-4 text-spruce-dark dark:text-emerald-400" />
            <span className="text-[11px] hidden sm:inline">Subnavbar</span>
          </Button>
        )}
      </div>

      {/* Mobile Sidebar Drawer (<md) */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-white dark:bg-[#111817] shadow-2xl transition-transform duration-300 md:hidden ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-14 items-center justify-between border-b border-gray-100 dark:border-gray-800 px-4 bg-spruce-dark text-white">
          <div className="flex items-center gap-2">
            <BrandMark className="h-7 w-7 rounded-lg" iconClassName="h-4 w-4" />
            <span className="font-semibold text-sm">{platformName}</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white/80 hover:text-white"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {currentNavGroup && (
            <div className="mb-4">
              <h3 className="px-3 text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400">
                {t(currentNavGroup.title) || currentNavGroup.title}
              </h3>
              <div className="mt-2 space-y-1">
                {currentNavGroup.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.path}
                      type="button"
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        navigate(item.path);
                      }}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/[0.06]"
                    >
                      <Icon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                      <span>{t(item.name) || item.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden pt-13 md:pt-0">
        {/* Top Status & Telemetry Bar */}
        <TopStatusBar />

        {/* Global Access / Trial Banners */}
        <VendorAccessBanner />
        <ExplorerBanner />

        {/* Page Content Scroll Container */}
        <main className="flex-1 min-w-0 overflow-y-auto bg-[#f8faf9] dark:bg-[#0a0f0e] relative">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
