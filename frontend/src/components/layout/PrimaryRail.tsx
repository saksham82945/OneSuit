import React from 'react';
import { Link } from 'react-router-dom';
import {
  LayoutDashboard,
  MessageSquare,
  Contact,
  Megaphone,
  Radio,
  FileText,
  Workflow,
  BarChart3,
  ShoppingBag,
  Settings,
  ShieldCheck,
  LifeBuoy,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  Moon,
  type LucideIcon,
} from 'lucide-react';
import { BrandMark } from '@/views/public/PublicLayout';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/hooks/useTheme';

export interface PrimaryModule {
  id: string;
  label: string;
  icon: LucideIcon;
  path: string;
  matcher: (pathname: string) => boolean;
  permission?: string;
  superAdminOnly?: boolean;
}

export const primaryModules: PrimaryModule[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    path: '/',
    matcher: (p) => p === '/',
    permission: 'analytics',
  },
  {
    id: 'super-admin',
    label: 'Platform Admin',
    icon: ShieldCheck,
    path: '/super-admin',
    matcher: (p) => p.startsWith('/super-admin'),
    superAdminOnly: true,
  },
  {
    id: 'chat',
    label: 'Live Chat',
    icon: MessageSquare,
    path: '/chat',
    matcher: (p) => p === '/chat' || p.startsWith('/chat/'),
    permission: 'chat',
  },
  {
    id: 'contacts',
    label: 'Contacts',
    icon: Contact,
    path: '/contacts',
    matcher: (p) => p.startsWith('/contacts') || p.startsWith('/tags'),
    permission: 'contacts',
  },
  {
    id: 'campaigns',
    label: 'Campaigns',
    icon: Megaphone,
    path: '/campaigns',
    matcher: (p) => p.startsWith('/campaigns'),
  },
  {
    id: 'ads',
    label: 'Ads Manager',
    icon: Radio,
    path: '/ads',
    matcher: (p) => p === '/ads' || p.startsWith('/ads/'),
    permission: 'campaigns',
  },
  {
    id: 'templates',
    label: 'Templates',
    icon: FileText,
    path: '/templates',
    matcher: (p) => p.startsWith('/templates'),
  },
  {
    id: 'flows',
    label: 'Flows',
    icon: Workflow,
    path: '/flows',
    matcher: (p) => p.startsWith('/flows') || p.startsWith('/chatbot'),
    permission: 'flows.whatsapp',
  },

  {
    id: 'catalogs',
    label: 'Catalogue',
    icon: ShoppingBag,
    path: '/catalogs',
    matcher: (p) => p.startsWith('/catalogs'),
  },
  {
    id: 'analytics',
    label: 'Analytics',
    icon: BarChart3,
    path: '/analytics/agents',
    matcher: (p) => p.startsWith('/analytics'),
    permission: 'analytics',
  },
  {
    id: 'settings',
    label: 'Manage & Settings',
    icon: Settings,
    path: '/settings',
    matcher: (p) => p.startsWith('/settings'),
    permission: 'settings.general',
  },
];

interface PrimaryRailProps {
  activeModuleId: string;
  onSelectModule: (id: string, defaultPath: string) => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  className?: string;
}

export const PrimaryRail: React.FC<PrimaryRailProps> = ({
  activeModuleId,
  onSelectModule,
  isExpanded = false,
  onToggleExpand,
  className,
}) => {
  const { user, hasPermission } = useAuthStore();
  const { isDark, toggleTheme } = useTheme();
  const isSuperAdmin = Boolean(user?.is_super_admin);

  const visibleModules = primaryModules.filter((m) => {
    if (m.superAdminOnly && !isSuperAdmin) return false;
    if (!isSuperAdmin && m.permission && !hasPermission(m.permission, 'read')) return false;
    return true;
  });

  return (
    <aside
      className={cn(
        'shrink-0 flex flex-col py-3 select-none primary-rail z-30 transition-all duration-300 ease-in-out',
        isExpanded ? 'w-56 px-3' : 'w-[84px] items-center px-1.5',
        className
      )}
    >
      {/* Brand & Expand / Collapse Header */}
      <div
        className={cn(
          'mb-3 flex items-center shrink-0 w-full',
          isExpanded ? 'justify-between px-1' : 'justify-center'
        )}
      >
        <Link
          to="/"
          className="flex items-center gap-2.5 focus:outline-none group"
          aria-label="Home"
          title="onesuit Platform"
        >
          <div className="h-10 w-10 rounded-xl bg-white/[0.1] group-hover:bg-white/[0.16] flex items-center justify-center p-1.5 transition-all shadow-sm">
            <BrandMark className="h-full w-full rounded-lg" iconClassName="h-5 w-5" />
          </div>
          {isExpanded && (
            <div className="flex flex-col overflow-hidden">
              <span className="font-bold text-sm tracking-tight text-white leading-tight">onesuit</span>
              <span className="text-[10px] text-white/60 tracking-wider uppercase font-semibold">Workspace</span>
            </div>
          )}
        </Link>

        {onToggleExpand && (
          <button
            type="button"
            onClick={onToggleExpand}
            title={isExpanded ? 'Collapse navbar' : 'Expand navbar'}
            className={cn(
              'rounded-lg p-1.5 text-white/70 hover:text-white hover:bg-white/[0.12] transition-colors focus:outline-none',
              !isExpanded && 'hidden'
            )}
            aria-label="Toggle navbar"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Navigation Modules */}
      <nav className="flex-1 flex flex-col gap-1 w-full overflow-y-auto overflow-x-hidden no-scrollbar py-1">
        {visibleModules.map((m) => {
          const isActive = activeModuleId === m.id;
          const Icon = m.icon;

          if (isExpanded) {
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onSelectModule(m.id, m.path)}
                aria-current={isActive ? 'page' : undefined}
                title={m.label}
                className={cn(
                  'relative w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all group focus:outline-none',
                  isActive
                    ? 'bg-white text-spruce-dark shadow-sm font-semibold'
                    : 'text-white/80 hover:text-white hover:bg-white/[0.08]'
                )}
              >
                <span
                  className={cn(
                    'h-7 w-7 rounded-lg flex items-center justify-center shrink-0 transition-colors',
                    isActive ? 'bg-spruce-dark/10 text-spruce-dark' : 'text-white/80 group-hover:text-white'
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>

                <span className="truncate flex-1 text-left">{m.label}</span>

                {m.superAdminOnly && (
                  <span
                    className={cn(
                      'text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider shrink-0',
                      isActive ? 'bg-purple-100 text-purple-900' : 'bg-purple-400/25 text-purple-200'
                    )}
                  >
                    Admin
                  </span>
                )}
              </button>
            );
          }

          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onSelectModule(m.id, m.path)}
              aria-current={isActive ? 'page' : undefined}
              title={m.superAdminOnly ? `${m.label} (Platform Admin)` : m.label}
              className={cn(
                'relative w-full flex flex-col items-center gap-1 px-1 py-1.5 text-[10px] leading-tight font-medium transition-all focus:outline-none rounded-xl',
                isActive ? 'text-white' : 'text-white/75 hover:text-white hover:bg-white/[0.06]'
              )}
            >
              {isActive && (
                <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-white shadow-sm" />
              )}
              <span
                className={cn(
                  'h-8 w-8 rounded-full flex items-center justify-center transition-all',
                  isActive ? 'bg-white text-spruce-dark shadow-sm scale-105' : 'text-white/85'
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="text-center px-0.5 line-clamp-1 truncate max-w-[76px]">
                {m.id === 'super-admin' ? 'Platform' : m.label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Bottom Section: Expand Navbar Toggle + Theme Quick Toggle + Support */}
      <div className="mt-auto w-full pt-2 border-t border-white/[0.1] flex flex-col gap-1 shrink-0">
        {/* Expand / Collapse Navbar Toggle Button */}
        {onToggleExpand && (
          <button
            type="button"
            onClick={onToggleExpand}
            title={isExpanded ? 'Collapse navbar' : 'Expand navbar'}
            className={cn(
              'w-full flex items-center gap-2.5 rounded-xl py-1.5 text-xs text-white/75 hover:text-white hover:bg-white/[0.08] transition-colors focus:outline-none',
              isExpanded ? 'px-3 justify-start' : 'justify-center px-1'
            )}
            aria-label={isExpanded ? 'Collapse navbar' : 'Expand navbar'}
          >
            {isExpanded ? (
              <>
                <PanelLeftClose className="h-4 w-4 shrink-0 text-white/80" />
                <span className="truncate">Collapse Navbar</span>
              </>
            ) : (
              <PanelLeftOpen className="h-4 w-4 shrink-0 text-white/80" />
            )}
          </button>
        )}

        {/* Quick Theme Toggle Button */}
        <button
          type="button"
          onClick={toggleTheme}
          title={isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
          className={cn(
            'w-full flex items-center gap-2.5 rounded-xl py-1.5 text-xs text-white/75 hover:text-white hover:bg-white/[0.08] transition-colors focus:outline-none',
            isExpanded ? 'px-3 justify-start' : 'justify-center px-1'
          )}
          aria-label="Toggle theme"
        >
          {isDark ? (
            <Sun className="h-4 w-4 text-amber-300 shrink-0" />
          ) : (
            <Moon className="h-4 w-4 text-emerald-200 shrink-0" />
          )}
          {isExpanded && <span className="truncate">{isDark ? 'Light Theme' : 'Dark Theme'}</span>}
        </button>

        {/* Support Link */}
        <Link
          to="/support"
          title="Support & Docs"
          className={cn(
            'w-full flex items-center gap-2.5 rounded-xl py-1.5 text-xs text-white/75 hover:text-white hover:bg-white/[0.08] transition-colors focus:outline-none',
            isExpanded ? 'px-3 justify-start' : 'justify-center px-1'
          )}
        >
          <LifeBuoy className="h-4 w-4 shrink-0" />
          {isExpanded && <span className="truncate">Support</span>}
        </Link>
      </div>
    </aside>
  );
};

export default PrimaryRail;
