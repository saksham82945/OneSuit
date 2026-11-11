import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate, Link } from 'react-router-dom';
import { VendorAccessBanner } from './VendorAccessBanner';
import { isInsideClient } from '@/services/superAdmin';
import { ExplorerBanner } from './ExplorerBanner';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Menu,
  X,
  PanelLeftOpen,
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
  Ticket,
  Phone,
  Sparkles,
  MessageSquareText,
  Tags,
  Users,
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
  Layers,
  MessageCircle,
  LogIn,
  Cable,
  IndianRupee,
  Building2,
  Code2,
  SlidersHorizontal,
  LifeBuoy,
  UserCircle,
  UserPlus,
  FilePlus2,
  SunMoon,
} from 'lucide-react';
import { PrimaryRail, visibleRailModules } from './PrimaryRail';
import { UserMenu } from './UserMenu';
import { SecondarySidebar, type SecondaryNavGroup } from './SecondarySidebar';
import { TopStatusBar } from './TopStatusBar';
import { SuperAdminNavbar } from './SuperAdminNavbar';
import { CategoryNav } from './CategoryNav';
import { groupByCategory, type NavCategoryDef } from './navCategories';
import { useBrandedTitle, useBranding } from '@/services/branding';
import { BrandMark } from '@/views/public/PublicLayout';
import { usePlanModules } from '@/lib/planModules';
import { PlanLockedNotice } from './PlanLockedNotice';
import { PendingPaymentBanner } from './PendingPaymentBanner';
import { UpgradeDialog } from '@/components/billing/UpgradeDialog';
import { CHECKOUT_PATH } from '@/lib/pendingPayment';
import { useTheme } from '@/hooks/useTheme';
import { CreateContactDialog } from '@/components/shared/CreateContactDialog';
import { CommandPalette } from './CommandPalette';
import { dedupePaletteItems, type PaletteItem } from './commandPaletteSearch';

/** Category headings of the super admin's navbar (and the Platform Admin sub-menu). */
const PLATFORM_CATEGORIES: NavCategoryDef[] = [
  { id: 'overview', title: 'Overview', flat: true },
  { id: 'clients', title: 'Clients & Billing', icon: Handshake },
  { id: 'messaging', title: 'Messaging & WhatsApp', icon: MessageCircle },
  { id: 'marketing', title: 'Marketing & Ads', icon: Megaphone },
  { id: 'website', title: 'Website & Content', icon: Globe },
  { id: 'platform', title: 'Platform', icon: SlidersHorizontal },
];

/** Platform Admin pages (super admin only). */
const PLATFORM_ITEMS: SecondaryNavGroup['items'] = [
  { name: 'nav.superAdminDashboard', path: '/super-admin', icon: ShieldCheck, exact: true, category: 'overview' },
  { name: 'nav.agencies', path: '/super-admin/clients', icon: Handshake, category: 'clients' },
  { name: 'nav.subscriptions', path: '/super-admin/subscriptions', icon: CreditCard, category: 'clients' },
  { name: 'Subscription Plans', path: '/super-admin/plans', icon: Layers, category: 'clients' },
  { name: 'Payments', path: '/super-admin/payments', icon: IndianRupee, category: 'clients' },
  { name: 'WhatsApp Onboarding', path: '/super-admin/whatsapp-onboarding', icon: MessageCircle, category: 'messaging' },
  { name: 'WEBHOOKS', path: '/super-admin/webhooks', icon: Webhook, category: 'messaging' },
  { name: 'nav.aiCallSetup', path: '/super-admin/ai-call-setup', icon: Phone, category: 'messaging' },
  { name: 'nav.aiAgents', path: '/chatbot/ai', icon: Sparkles, badge: 'AI', badgeVariant: 'ai', category: 'messaging' },
  { name: 'Ads Manager', path: '/super-admin/ads', icon: Radio, category: 'marketing' },
  { name: 'Website', path: '/super-admin/website', icon: Globe, category: 'website' },
  { name: 'nav.pagesManagement', path: '/super-admin/pages', icon: FileText, category: 'website' },
  { name: 'Social Login', path: '/super-admin/social-login', icon: LogIn, category: 'website' },
  { name: 'Setup & Integrations', path: '/super-admin/integrations', icon: Cable, category: 'platform' },
  { name: 'nav.manageTickets', path: '/super-admin/tickets', icon: Ticket, category: 'platform' },
];

/** Category headings of the Settings sub-menu. */
const SETTINGS_CATEGORIES: NavCategoryDef[] = [
  { id: 'workspace', title: 'Workspace', icon: Building2 },
  { id: 'whatsapp', title: 'WhatsApp', icon: MessageCircle },
  { id: 'contacts', title: 'nav.contacts', icon: Contact },
  { id: 'automation', title: 'Automation', icon: Bot },
  { id: 'developer', title: 'Developer', icon: Code2 },
  { id: 'logs', title: 'Logs', icon: ScrollText },
];

/**
 * Settings pages, tagged with their SETTINGS_CATEGORIES heading. `business`
 * adds the pages only a business needs (WhatsApp setup, contacts, tags,
 * billing...); the super admin's own Settings skip them.
 */
function settingsItems(
  hasPermission: (resource: string, action: string) => boolean,
  isSuperAdmin: boolean,
  business: boolean
): SecondaryNavGroup['items'] {
  return [
    // Workspace
    hasPermission('settings.general', 'read') ? { name: 'nav.general', path: '/settings', icon: Settings, exact: true, category: 'workspace' } : null,
    business ? { name: 'nav.billing', path: '/settings/billing', icon: CreditCard, badge: 'Plan', badgeVariant: 'popular' as const, category: 'workspace' } : null,
    // Team users are managed by each business's admin; the super admin doesn't need this page.
    !isSuperAdmin && hasPermission('users', 'read') ? { name: 'nav.users', path: '/settings/users', icon: Users, category: 'workspace' } : null,
    hasPermission('teams', 'read') ? { name: 'nav.teams', path: '/settings/teams', icon: UsersRound, category: 'workspace' } : null,
    // WhatsApp
    hasPermission('accounts', 'read') ? { name: 'nav.accounts', path: '/settings/accounts', icon: Users, badge: 'Meta', badgeVariant: 'popular' as const, exact: true, category: 'whatsapp' } : null,
    business && hasPermission('accounts', 'read') ? { name: 'WhatsApp Setup', path: '/settings/whatsapp-setup', icon: Phone, category: 'whatsapp' } : null,
    business ? { name: 'nav.optIn', path: '/settings/opt-in', icon: Globe, category: 'whatsapp' } : null,
    // Contacts
    business && hasPermission('contacts', 'read') ? { name: 'nav.contacts', path: '/settings/contacts', icon: Contact, category: 'contacts' } : null,
    business && hasPermission('tags', 'read') ? { name: 'nav.tags', path: '/settings/tags', icon: Tags, category: 'contacts' } : null,
    business && hasPermission('canned_responses', 'read') ? { name: 'nav.cannedResponses', path: '/settings/canned-responses', icon: MessageSquareText, category: 'contacts' } : null,
    // Automation
    business && hasPermission('settings.chatbot', 'read') ? { name: 'nav.chatbot', path: '/settings/chatbot', icon: Bot, category: 'automation' } : null,
    hasPermission('custom_actions', 'read') ? { name: 'nav.customActions', path: '/settings/custom-actions', icon: Zap, category: 'automation' } : null,
    // Developer
    hasPermission('api_keys', 'read') ? { name: 'nav.apiKeys', path: '/settings/api-keys', icon: Key, category: 'developer' } : null,
    hasPermission('webhooks', 'read') ? { name: 'nav.webhooks', path: '/settings/webhooks', icon: Webhook, category: 'developer' } : null,
    business && hasPermission('contacts', 'read') ? { name: 'Integrations', path: '/settings/integrations', icon: Cable, badge: 'Leads', badgeVariant: 'new' as const, category: 'developer' } : null,
    hasPermission('settings.sso', 'read') ? { name: 'nav.sso', path: '/settings/sso', icon: ShieldCheck, category: 'developer' } : null,
    // Logs
    isSuperAdmin ? { name: 'nav.auditLogs', path: '/settings/audit-logs', icon: ScrollText, category: 'logs' } : null,
  ].filter(Boolean) as SecondaryNavGroup['items'];
}

/**
 * The sub-menu of one primary-rail module, with permission checks (plan
 * switches are applied by the caller). Also feeds the command palette.
 */
function buildNavGroup(
  moduleId: string,
  hasPermission: (resource: string, action: string) => boolean,
  isSuperAdmin: boolean,
  insideClient: boolean
): SecondaryNavGroup | null {
  if (moduleId === 'super-admin') {
    return {
      moduleId: 'super-admin',
      title: 'nav.sectionSuperAdmin',
      subtitle: 'Platform Operations',
      items: PLATFORM_ITEMS,
      categories: PLATFORM_CATEGORIES,
    };
  }

  if (moduleId === 'dashboard') {
    const items = [
      // Agent Analytics and Meta Insights live in the Analytics section only.
      { name: 'nav.dashboard', path: '/', icon: LayoutDashboard, exact: true },
    ].filter(Boolean) as SecondaryNavGroup['items'];

    return {
      moduleId: 'dashboard',
      title: 'nav.sectionMain',
      subtitle: 'Workspace Overview',
      items,
    };
  }

  if (moduleId === 'chat') {
    // Live Chat's own inbox column (views, labels, search) is its sub-navigation,
    // so it gets no sub-navbar; see `hideSubnav` below.
    return {
      moduleId: 'chat',
      title: 'nav.chat',
      subtitle: 'Live Inbox',
      items: [{ name: 'nav.chat', path: '/chat', icon: MessageSquare }],
    };
  }

  if (moduleId === 'contacts') {
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

  if (moduleId === 'campaigns') {
    const items = [
      { name: 'nav.campaigns', path: '/campaigns', icon: Megaphone },
      hasPermission('campaigns', 'read') && { name: 'Campaign Analytics', path: '/campaigns/analytics', icon: BarChart3 },
    ].filter(Boolean) as SecondaryNavGroup['items'];

    return {
      moduleId: 'campaigns',
      title: 'nav.campaigns',
      subtitle: 'Broadcasts & Messaging',
      items,
    };
  }

  if (moduleId === 'ads') {
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

  if (moduleId === 'templates') {
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

  if (moduleId === 'flows') {
    const items = [
      hasPermission('flows.chatbot', 'read')
        ? { name: 'Bot Flows', path: '/chatbot/flows', icon: Workflow, badge: 'Popular', badgeVariant: 'popular' as const }
        : null,
      hasPermission('chatbot.keywords', 'read') ? { name: 'nav.keywords', path: '/chatbot/keywords', icon: Key } : null,
      hasPermission('flows.whatsapp', 'read') ? { name: 'WhatsApp Forms (Meta)', path: '/flows', icon: Workflow } : null,
      hasPermission('transfers', 'read') ? { name: 'nav.transfers', path: '/chatbot/transfers', icon: UserX } : null,
    ].filter(Boolean) as SecondaryNavGroup['items'];

    return {
      moduleId: 'flows',
      title: 'nav.flows',
      subtitle: 'Automation Studio',
      items,
    };
  }


  if (moduleId === 'catalogs') {
    return {
      moduleId: 'catalogs',
      title: 'nav.catalogue',
      subtitle: 'Product Collections',
      items: [
        { name: 'nav.catalogue', path: '/catalogs', icon: ShoppingBag },
      ],
    };
  }

  if (moduleId === 'analytics') {
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

  if (moduleId === 'settings') {
    // The super admin's own Settings skip the business-only pages (they're
    // still there while the super admin is inside a client's account).
    const business = !isSuperAdmin || insideClient;
    const items = settingsItems(hasPermission, isSuperAdmin, business);

    return {
      moduleId: 'settings',
      title: 'nav.settings',
      subtitle: 'Workspace Settings',
      items,
      categories: SETTINGS_CATEGORIES,
    };
  }

  return null;
}

export const AppLayout: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { hasPermission, user, refreshUser } = useAuthStore();
  const isSuperAdmin = Boolean(user?.is_super_admin);
  const insideClient = isInsideClient(user);
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
      } catch {
        // Not saved; the toggle still applies for this page load.
      }
      return next;
    });
  };

  const toggleSecondaryCollapsed = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('onesuit-subnav-collapsed', String(next));
      } catch {
        // Not saved; the toggle still applies for this page load.
      }
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

  const currentNavGroup = useMemo(
    () => buildNavGroup(activeModuleId, hasPermission, isSuperAdmin, insideClient),
    [activeModuleId, hasPermission, isSuperAdmin, insideClient]
  );

  // The super admin (outside a client's account) gets one navbar with every
  // Platform Admin and Settings page instead of the rail + sub-menu.
  const singleNav = isSuperAdmin && !insideClient;
  const superAdminItems = useMemo<SecondaryNavGroup['items']>(
    () => [
      ...PLATFORM_ITEMS,
      // Configuration and General are one Settings page for the super admin.
      { name: 'Settings', path: '/super-admin/settings', icon: Settings, category: 'platform' },
      ...settingsItems(hasPermission, true, false)
        .filter((i) => i.path !== '/settings')
        .map((i) => ({ ...i, category: i.path === '/settings/accounts' ? 'messaging' : 'platform' })),
    ],
    [hasPermission]
  );

  const handleSelectPrimaryModule = (_id: string, defaultPath: string) => {
    navigate(defaultPath);
  };

  // Live Chat needs the width for its three columns and already has its own
  // inbox navigation, so its one-link sub-navbar is replaced by the slim strip.
  const hideSubnav = activeModuleId === 'chat';
  const subnavCollapsed = isCollapsed || hideSubnav;
  const { pathAllowed, railAllowed } = usePlanModules();
  const railModules = visibleRailModules(isSuperAdmin, insideClient, hasPermission).filter((m) => railAllowed(m.id));
  // Hide pages the workspace's plan switches off.
  const navGroup: SecondaryNavGroup | null = currentNavGroup
    ? { ...currentNavGroup, items: currentNavGroup.items.filter((i) => pathAllowed(i.path)) }
    : null;
  // Same plan / platform switches for the super admin's navbar; categories left empty drop out.
  const superAdminCategories = groupByCategory(superAdminItems.filter((i) => pathAllowed(i.path)), PLATFORM_CATEGORIES);
  const closeMobileMenu = () => setIsMobileMenuOpen(false);
  const pageLocked = !singleNav && !pathAllowed(location.pathname);

  // Fade the page in on navigation (opacity only: a transform would shift fixed
  // elements inside the page) and start it at the top. Skipped between chats;
  // no fade for reduced motion.
  const mainRef = useRef<HTMLElement>(null);
  const prevPath = useRef(location.pathname);
  useEffect(() => {
    const from = prevPath.current;
    const to = location.pathname;
    prevPath.current = to;
    if (from === to) return;
    const inChat = (p: string) => p === '/chat' || p.startsWith('/chat/');
    if (inChat(from) && inChat(to)) return;
    const el = mainRef.current;
    if (!el) return;
    el.scrollTop = 0;
    if (typeof el.animate !== 'function') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    el.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' });
  }, [location.pathname]);

  // ---- Command palette (Ctrl/Cmd+K): every page this user can open, plus quick actions ----
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [createContactOpen, setCreateContactOpen] = useState(false);
  const { isDark, toggleTheme } = useTheme();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const label = (name: string) => t(name) || name;
  const railIds = new Set(railModules.map((m) => m.id));
  const pageEntries: { item: SecondaryNavGroup['items'][number]; group: string }[] = singleNav
    ? superAdminItems.map((item) => ({
        item,
        group: label(PLATFORM_CATEGORIES.find((c) => c.id === item.category && !c.flat)?.title ?? 'Platform Admin'),
      }))
    : railModules.flatMap((m) => {
        const items = buildNavGroup(m.id, hasPermission, isSuperAdmin, insideClient)?.items ?? [];
        const list = items.length ? items : [{ name: m.label, path: m.path, icon: m.icon }];
        return list.map((item) => ({ item, group: m.label }));
      });
  const accountPages = [
    { item: { name: 'Support', path: '/support', icon: LifeBuoy }, group: 'Account' },
    { item: { name: 'My profile', path: '/profile', icon: UserCircle }, group: 'Account' },
  ];
  // Same plan switches as the menus, so hidden pages never show.
  const pageVisible = (path: string) => pathAllowed(path);
  const quickActions: (PaletteItem | false)[] = [
    railIds.has('campaigns') && hasPermission('campaigns', 'write') && pageVisible('/campaigns/new') && {
      id: 'action:new-campaign', label: 'New campaign', group: 'Quick actions', icon: Megaphone, path: '/campaigns/new', keywords: 'create broadcast send',
    },
    railIds.has('contacts') && hasPermission('contacts', 'write') && pageVisible('/contacts') && {
      id: 'action:new-contact', label: 'New contact', group: 'Quick actions', icon: UserPlus, run: () => setCreateContactOpen(true), keywords: 'create add customer',
    },
    railIds.has('templates') && hasPermission('templates', 'write') && pageVisible('/templates/new') && {
      id: 'action:new-template', label: 'New template', group: 'Quick actions', icon: FilePlus2, path: '/templates/new', keywords: 'create message template',
    },
    railIds.has('flows') && hasPermission('flows.chatbot', 'write') && pageVisible('/chatbot/flows/new') && {
      id: 'action:new-bot-flow', label: 'New bot flow', group: 'Quick actions', icon: Workflow, path: '/chatbot/flows/new', keywords: 'create chatbot automation',
    },
    {
      id: 'action:toggle-theme', label: isDark ? 'Switch to light mode' : 'Switch to dark mode', group: 'Quick actions', icon: SunMoon, run: toggleTheme, keywords: 'theme dark light appearance',
    },
  ];
  const paletteItems: PaletteItem[] = [
    ...quickActions.filter((a): a is PaletteItem => Boolean(a)),
    ...dedupePaletteItems(
      [...pageEntries, ...accountPages]
        .filter(({ item }) => pageVisible(item.path))
        .map(({ item, group }) => ({ id: item.path, label: label(item.name), group, icon: item.icon, path: item.path }))
    ),
  ];
  const runPaletteItem = (item: PaletteItem) => {
    setIsMobileMenuOpen(false);
    if (item.run) item.run();
    else if (item.path) navigate(item.path);
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

      {/* Super admin: one navbar with every Platform Admin and Settings page */}
      {singleNav && (
        <div className="hidden md:flex shrink-0 h-full">
          <SuperAdminNavbar categories={superAdminCategories} />
        </div>
      )}

      {/* Dual Rail Navigation Structure for Desktop (>=md) */}
      <div className={cn('hidden md:flex shrink-0 h-full relative', singleNav && 'md:hidden')}>
        {/* Rail 1: Expandable Primary Navigation Rail */}
        <PrimaryRail
          activeModuleId={activeModuleId}
          onSelectModule={handleSelectPrimaryModule}
          isExpanded={isRailExpanded}
          onToggleExpand={toggleRailExpanded}
        />

        {/* Rail 2: Contextual Subnavbar (Secondary Sidebar) */}
        {!hideSubnav && (
          <SecondarySidebar
            currentGroup={navGroup}
            collapsed={isCollapsed}
            onToggleCollapse={toggleSecondaryCollapsed}
          />
        )}

        {/* Collapsed subnavbar: a slim strip in the layout flow (it used to float
            over the page and cover the top bar), keeping the account menu reachable. */}
        {subnavCollapsed && navGroup && (
          <div className="flex w-14 shrink-0 flex-col items-center justify-between border-r border-gray-200/80 bg-white py-3 dark:border-[#1c2725] dark:bg-[#111817]">
            {hideSubnav ? (
              <span className="h-8" aria-hidden />
            ) : (
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleSecondaryCollapsed}
                className="h-8 w-8 rounded-lg text-spruce-dark hover:bg-gray-100 dark:text-emerald-400 dark:hover:bg-white/[0.06]"
                title="Expand subnavbar"
                aria-label="Expand subnavbar"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </Button>
            )}
            <UserMenu collapsed />
          </div>
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
          {singleNav && (
            <nav aria-label="Platform admin" className="mb-4">
              <CategoryNav categories={superAdminCategories} storageKey="onesuit-sa-nav-cats" tone="surface" onNavigate={closeMobileMenu} />
            </nav>
          )}
          {!singleNav && (
            <div className="mb-4">
              <h3 className="px-3 text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400">Menu</h3>
              <div className="mt-2 grid grid-cols-2 gap-1">
                {railModules.map((m) => {
                  const Icon = m.icon;
                  const active = m.id === activeModuleId;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        navigate(m.path);
                      }}
                      className={cn(
                        'flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-medium',
                        active
                          ? 'bg-teal-50 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200'
                          : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-white/[0.06]'
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{m.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {!singleNav && navGroup && !hideSubnav && (
            <div className="mb-4">
              <h3 className="px-3 text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400">
                {t(navGroup.title) || navGroup.title}
              </h3>
              <nav aria-label={t(navGroup.title) || navGroup.title} className="mt-2">
                <CategoryNav
                  categories={groupByCategory(navGroup.items, navGroup.categories ?? [])}
                  storageKey={`onesuit-subnav-cats-${navGroup.moduleId}`}
                  tone="surface"
                  onNavigate={closeMobileMenu}
                />
              </nav>
            </div>
          )}
        </div>
        <div className="shrink-0 border-t border-gray-100 p-2 dark:border-gray-800">
          <UserMenu collapsed={false} />
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden pt-13 md:pt-0">
        {/* Top Status & Telemetry Bar */}
        <TopStatusBar onOpenSearch={() => setPaletteOpen(true)} />

        {/* Global Access Banners */}
        <VendorAccessBanner />
        <ExplorerBanner />
        <PendingPaymentBanner hidden={isSuperAdmin || location.pathname === CHECKOUT_PATH} />

        {/* Page Content Scroll Container */}
        <main ref={mainRef} className="flex-1 min-w-0 overflow-y-auto max-md:overflow-x-hidden bg-[#f8faf9] dark:bg-[#0a0f0e] relative">
          {pageLocked ? <PlanLockedNotice /> : <Outlet />}
        </main>
      </div>

      <UpgradeDialog />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} items={paletteItems} onSelect={runPaletteItem} />
      <CreateContactDialog
        open={createContactOpen}
        onOpenChange={setCreateContactOpen}
        onCreated={(c) => navigate(`/contacts/${c.id}`)}
      />
    </div>
  );
};

export default AppLayout;
