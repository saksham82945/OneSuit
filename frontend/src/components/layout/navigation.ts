import {
  LayoutDashboard,
  MessageSquare,
  Bot,
  FileText,
  Megaphone,
  Settings,
  Users,
  Contact,
  Workflow,
  Sparkles,
  Key,
  UserX,
  MessageSquareText,
  Webhook,
  BarChart3,
  ShieldCheck,
  Zap,
  Shield,
  LineChart,
  Tags,
  ScrollText,
  LifeBuoy,
  CreditCard,
  SlidersHorizontal,
  ShoppingBag,
  Ticket,
  Handshake,
  Phone,
  Globe,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  name: string;
  path: string;
  icon: LucideIcon;
  permission?: string;
  childPermissions?: string[];
  children?: NavItem[];
  /** Only shown to super admins */
  superAdminOnly?: boolean;
  /** Hidden from super admins (admin/user only) */
  superAdminHidden?: boolean;
  /** Highlight only on this exact path (not its sub-paths) */
  exact?: boolean;
}

export interface NavSection {
  label: string;
  items: NavItem[];
  permissions: string[];
  pinBottom?: boolean;
  /** This entire section is hidden from super admins */
  superAdminHidden?: boolean;
}

export const navigationSections: NavSection[] = [
  {
    // Platform management, visible to super admins only.
    label: 'nav.sectionSuperAdmin',
    permissions: [],
    items: [
      { name: 'nav.superAdminDashboard', path: '/super-admin', icon: ShieldCheck, superAdminOnly: true, exact: true },
      { name: 'nav.agencies', path: '/super-admin/vendors', icon: Handshake, superAdminOnly: true },
      { name: 'nav.subscriptions', path: '/super-admin/subscriptions', icon: CreditCard, superAdminOnly: true },
      { name: 'nav.pagesManagement', path: '/super-admin/pages', icon: FileText, superAdminOnly: true },
      { name: 'nav.configuration', path: '/super-admin/configuration', icon: SlidersHorizontal, superAdminOnly: true },
      { name: 'nav.manageTickets', path: '/super-admin/tickets', icon: Ticket, superAdminOnly: true },
      { name: 'nav.aiCallSetup', path: '/super-admin/ai-call-setup', icon: Phone, superAdminOnly: true },
      { name: 'nav.aiAgents', path: '/chatbot/ai', icon: Sparkles, superAdminOnly: true },
    ],
  },
  {
    label: 'nav.sectionMain',
    permissions: ['analytics', 'chat'],
    items: [
      {
        name: 'nav.dashboard',
        path: '/',
        icon: LayoutDashboard,
        permission: 'analytics',
      },
      {
        name: 'nav.chat',
        path: '/chat',
        icon: MessageSquare,
        permission: 'chat',
      },
    ],
  },
  {
    label: 'nav.sectionMessaging',
    permissions: [
      'settings.chatbot',
      'chatbot.keywords',
      'flows.chatbot',
      'chatbot.ai',
      'transfers',
      'campaigns',
      'templates',
      'flows.whatsapp',
    ],
    items: [
      {
        name: 'nav.chatbot',
        path: '/chatbot',
        icon: Bot,
        permission: 'settings.chatbot',
        childPermissions: [
          'settings.chatbot',
          'chatbot.keywords',
          'flows.chatbot',
          'chatbot.ai',
          'transfers',
        ],
        children: [
          { name: 'nav.keywords', path: '/chatbot/keywords', icon: Key, permission: 'chatbot.keywords' },
          { name: 'nav.flows', path: '/chatbot/flows', icon: Workflow, permission: 'flows.chatbot' },
          { name: 'nav.aiContexts', path: '/chatbot/ai', icon: Sparkles, permission: 'chatbot.ai', superAdminOnly: true },
          { name: 'nav.transfers', path: '/chatbot/transfers', icon: UserX, permission: 'transfers' },
        ],
      },
      {
        name: 'nav.campaigns',
        path: '/campaigns',
        icon: Megaphone,
        permission: 'campaigns',
      },
      {
        name: 'nav.templates',
        path: '/templates',
        icon: FileText,
        permission: 'templates',
      },
      {
        name: 'nav.flows',
        path: '/flows',
        icon: Workflow,
        permission: 'flows.whatsapp',
      },
      {
        name: 'nav.catalogue',
        path: '/catalogs',
        icon: ShoppingBag,
      },
    ],
  },
  {
    label: 'nav.sectionAnalytics',
    permissions: ['analytics.agents', 'analytics'],
    items: [
      {
        name: 'nav.agentAnalytics',
        path: '/analytics/agents',
        icon: BarChart3,
        permission: 'analytics.agents',
      },
      {
        name: 'nav.metaInsights',
        path: '/analytics/meta-insights',
        icon: LineChart,
        permission: 'analytics',
      },
    ],
  },
  {
    // Pinned above Settings; no permission so every signed-in user sees it.
    label: 'nav.sectionHelp',
    permissions: [],
    pinBottom: true,
    items: [{ name: 'nav.support', path: '/support', icon: LifeBuoy }],
  },
  {
    label: '',
    permissions: [
      'settings.general',
      'settings.chatbot',
      'accounts',
      'contacts',
      'canned_responses',
      'tags',
      'teams',
      'users',
      'roles',
      'api_keys',
      'webhooks',
      'custom_actions',
      'settings.sso',
      'audit_logs',
    ],
    pinBottom: true,
    items: [
      {
        name: 'nav.settings',
        path: '/settings',
        icon: Settings,
        permission: 'settings.general',
        childPermissions: [
          'settings.general',
          'settings.chatbot',
          'accounts',
          'contacts',
          'canned_responses',
          'tags',
          'teams',
          'users',
          'roles',
          'api_keys',
          'webhooks',
          'custom_actions',
          'settings.sso',
          'audit_logs',
        ],
        children: [
          { name: 'nav.general', path: '/settings', icon: Settings, permission: 'settings.general' },
          { name: 'nav.chatbot', path: '/settings/chatbot', icon: Bot, permission: 'settings.chatbot' },
          { name: 'nav.accounts', path: '/settings/accounts', icon: Users, permission: 'accounts' },
          { name: 'nav.contacts', path: '/settings/contacts', icon: Contact, permission: 'contacts' },
          { name: 'nav.cannedResponses', path: '/settings/canned-responses', icon: MessageSquareText, permission: 'canned_responses' },
          { name: 'nav.tags', path: '/settings/tags', icon: Tags, permission: 'tags' },
          { name: 'nav.teams', path: '/settings/teams', icon: Users, permission: 'teams' },
          { name: 'nav.users', path: '/settings/users', icon: Users, permission: 'users' },
          { name: 'nav.roles', path: '/settings/roles', icon: Shield, permission: 'roles' },
          { name: 'nav.apiKeys', path: '/settings/api-keys', icon: Key, permission: 'api_keys' },
          { name: 'nav.webhooks', path: '/settings/webhooks', icon: Webhook, permission: 'webhooks' },
          { name: 'nav.customActions', path: '/settings/custom-actions', icon: Zap, permission: 'custom_actions' },
          { name: 'nav.sso', path: '/settings/sso', icon: ShieldCheck, permission: 'settings.sso' },
          { name: 'nav.auditLogs', path: '/settings/audit-logs', icon: ScrollText, permission: 'audit_logs' },
          { name: 'nav.billing', path: '/settings/billing', icon: CreditCard },
          { name: 'nav.optIn', path: '/settings/opt-in', icon: Globe },
        ],
      },
    ],
  },
];

export const navigationItems: NavItem[] = navigationSections.flatMap((s) => s.items);
