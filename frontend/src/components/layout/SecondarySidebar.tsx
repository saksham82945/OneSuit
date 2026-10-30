import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { PanelLeftClose, ChevronLeft, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { useAuthStore } from '@/stores/auth';
import { useBranding } from '@/services/branding';
import { getImpersonatedVendorName, isInsideClient } from '@/services/superAdmin';
import { UserMenu } from './UserMenu';

export interface SecondaryNavItem {
  name: string;
  path: string;
  icon: LucideIcon;
  badge?: string;
  badgeVariant?: 'new' | 'ai' | 'popular';
  exact?: boolean;
}

export interface SecondaryNavGroup {
  moduleId: string;
  title: string;
  subtitle?: string;
  items: SecondaryNavItem[];
}

interface SecondarySidebarProps {
  currentGroup: SecondaryNavGroup | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
  className?: string;
}

export const SecondarySidebar: React.FC<SecondarySidebarProps> = ({
  currentGroup,
  collapsed,
  onToggleCollapse,
  className,
}) => {
  const { t } = useTranslation();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const { platform_name: platformName } = useBranding();

  if (!currentGroup) return null;

  // Workspace name only: switching between organizations from here was removed.
  const workspaceName =
    user?.is_super_admin && !isInsideClient(user)
      ? platformName
      : getImpersonatedVendorName() || user?.organization_name || platformName;

  return (
    <aside
      className={cn(
        'flex flex-col secondary-sidebar transition-all duration-300 ease-in-out select-none z-20 bg-white dark:bg-[#111817] border-r border-gray-200/80 dark:border-[#1c2725]',
        collapsed ? 'w-0 overflow-hidden opacity-0 border-r-0' : 'w-64 opacity-100',
        className
      )}
    >
      {/* Top Header: workspace name */}
      <div className="h-14 border-b border-gray-200/80 dark:border-[#1c2725] flex items-center justify-between gap-2 px-3 shrink-0">
        <span className="min-w-0 truncate px-1 text-sm font-semibold text-gray-900 dark:text-gray-100" title={workspaceName}>
          {workspaceName}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleCollapse}
          title="Collapse subnavbar"
          aria-label="Collapse subnavbar"
          className="h-8 w-8 text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-white/[0.08] rounded-lg transition-colors"
        >
          <PanelLeftClose className="h-4 w-4" />
        </Button>
      </div>

      {/* Module Title Header */}
      <div className="px-4 pt-4 pb-2">
        <h2 className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          {t(currentGroup.title) || currentGroup.title}
        </h2>
        {currentGroup.subtitle && (
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5 font-medium">
            {currentGroup.subtitle}
          </p>
        )}
      </div>

      {/* Navigation Sub-Items */}
      <ScrollArea className="flex-1 px-2.5 py-1">
        <div className="space-y-1">
          {currentGroup.items.map((item) => {
            const Icon = item.icon;
            const isMatch = item.exact
              ? location.pathname === item.path
              : location.pathname.startsWith(item.path);

            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.exact}
                className={({ isActive }) =>
                  cn(
                    'group flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-150',
                    isActive || isMatch
                      ? 'bg-teal-50 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200 font-semibold shadow-sm'
                      : 'text-gray-700 hover:text-gray-950 hover:bg-gray-100/80 dark:text-gray-300 dark:hover:text-white dark:hover:bg-white/[0.06]'
                  )
                }
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Icon
                    className={cn(
                      'h-4 w-4 shrink-0 transition-colors',
                      isMatch
                        ? 'text-teal-700 dark:text-teal-300'
                        : 'text-gray-500 group-hover:text-gray-800 dark:text-gray-400 dark:group-hover:text-gray-200'
                    )}
                  />
                  <span className="truncate">{t(item.name) || item.name}</span>
                </div>

                {item.badge && (
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[9px] uppercase px-1.5 py-0 font-bold border-0 tracking-wider',
                      item.badgeVariant === 'new' &&
                        'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300',
                      item.badgeVariant === 'ai' &&
                        'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300',
                      item.badgeVariant === 'popular' &&
                        'bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-300',
                      !item.badgeVariant &&
                        'bg-gray-100 text-gray-700 dark:bg-white/[0.08] dark:text-gray-300'
                    )}
                  >
                    {item.badge}
                  </Badge>
                )}
              </NavLink>
            );
          })}
        </div>
      </ScrollArea>

      {/* Downside My Account Bar with Theme Toggle */}
      <div className="p-2 border-t border-gray-200/80 dark:border-[#1c2725] shrink-0 bg-transparent">
        <UserMenu collapsed={false} />
      </div>
    </aside>
  );
};

export default SecondarySidebar;
