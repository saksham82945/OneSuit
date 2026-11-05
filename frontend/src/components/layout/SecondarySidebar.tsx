import React from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { PanelLeftClose } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';
import { useBranding } from '@/services/branding';
import { getImpersonatedVendorName, isInsideClient } from '@/services/superAdmin';
import { UserMenu } from './UserMenu';
import { CategoryNav } from './CategoryNav';
import { groupByCategory, type CategorizedNavItem, type NavCategoryDef } from './navCategories';

export type SecondaryNavItem = CategorizedNavItem;

export interface SecondaryNavGroup {
  moduleId: string;
  title: string;
  subtitle?: string;
  items: SecondaryNavItem[];
  /** Collapsible headings the items are grouped under (by `item.category`). */
  categories?: NavCategoryDef[];
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

      {/* Navigation Sub-Items, grouped under collapsible category headings */}
      <ScrollArea className="flex-1 px-2.5 py-1">
        <nav aria-label={t(currentGroup.title) || currentGroup.title}>
          <CategoryNav
            categories={groupByCategory(currentGroup.items, currentGroup.categories ?? [])}
            storageKey={`onesuit-subnav-cats-${currentGroup.moduleId}`}
            tone="surface"
          />
        </nav>
      </ScrollArea>

      {/* Downside My Account Bar with Theme Toggle */}
      <div className="p-2 border-t border-gray-200/80 dark:border-[#1c2725] shrink-0 bg-transparent">
        <UserMenu collapsed={false} />
      </div>
    </aside>
  );
};

export default SecondarySidebar;
