import React, { useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LifeBuoy, Moon, PanelLeftClose, PanelLeftOpen, Sun } from 'lucide-react';
import { BrandMark } from '@/views/public/PublicLayout';
import { useBranding } from '@/services/branding';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';
import { UserMenu } from './UserMenu';
import { CategoryNav } from './CategoryNav';
import { isItemActive, type NavCategory } from './navCategories';

const STORAGE_KEY = 'onesuit-sa-nav-collapsed';

/**
 * The super admin's single navbar: every Platform Admin and Settings page in
 * one bar (no second sub-menu), grouped under collapsible categories.
 * Collapses to icons (then every link shows, with a divider per category).
 */
export const SuperAdminNavbar: React.FC<{ categories: NavCategory[] }> = ({ categories }) => {
  const { t } = useTranslation();
  const location = useLocation();
  const { isDark, toggleTheme } = useTheme();
  const { platform_name: platformName } = useBranding();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const toggle = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(STORAGE_KEY, String(!c));
      } catch {
        // Not saved; the bar still toggles for this page load.
      }
      return !c;
    });

  const allItems = categories.flatMap((c) => c.items);

  const footerButton = cn(
    'w-full flex items-center gap-2.5 rounded-xl py-1.5 text-xs text-white/75 hover:text-white hover:bg-white/[0.08] transition-colors',
    collapsed ? 'justify-center px-1' : 'px-3'
  );

  return (
    <aside
      className={cn(
        'primary-rail shrink-0 h-full flex flex-col py-3 select-none z-30 transition-all duration-300',
        collapsed ? 'w-[76px] px-2' : 'w-64 px-3'
      )}
    >
      {/* Brand */}
      <div className={cn('mb-3 flex items-center shrink-0', collapsed ? 'justify-center' : 'justify-between px-1')}>
        <Link to="/super-admin" className="flex items-center gap-2.5 min-w-0" title={platformName}>
          <span className="h-10 w-10 rounded-xl bg-white/[0.1] flex items-center justify-center p-1.5 shrink-0">
            <BrandMark className="h-full w-full rounded-lg" iconClassName="h-5 w-5" />
          </span>
          {!collapsed && (
            <span className="flex flex-col min-w-0">
              <span className="font-bold text-sm text-white truncate leading-tight">{platformName}</span>
              <span className="text-[10px] uppercase tracking-wider font-semibold text-white/60">Platform Admin</span>
            </span>
          )}
        </Link>
        {!collapsed && (
          <button type="button" onClick={toggle} aria-label="Collapse navbar" title="Collapse navbar" className="rounded-lg p-1.5 text-white/70 hover:text-white hover:bg-white/[0.12]">
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Links */}
      <nav aria-label="Platform admin" className="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar py-1">
        {collapsed ? (
          <div className="space-y-1.5">
            {categories.map((cat, idx) => (
              <div key={cat.id} className="space-y-0.5">
                {idx > 0 && <div className="mx-auto mb-1.5 h-px w-8 bg-white/15" />}
                {cat.items.map((item) => {
                  const active = isItemActive(item, allItems, location.pathname);
                  const Icon = item.icon;
                  const label = t(item.name) || item.name;
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      end={item.exact}
                      title={label}
                      aria-label={label}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'group flex items-center justify-center rounded-xl p-2 transition-all',
                        active ? 'bg-white text-spruce-dark shadow-sm' : 'text-white/80 hover:text-white hover:bg-white/[0.08]'
                      )}
                    >
                      <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-spruce-dark' : 'text-white/80 group-hover:text-white')} />
                    </NavLink>
                  );
                })}
              </div>
            ))}
          </div>
        ) : (
          <CategoryNav categories={categories} storageKey="onesuit-sa-nav-cats" tone="rail" />
        )}
      </nav>

      {/* Footer */}
      <div className="mt-2 pt-2 border-t border-white/[0.1] flex flex-col gap-1 shrink-0">
        {collapsed && (
          <button type="button" onClick={toggle} aria-label="Expand navbar" title="Expand navbar" className={footerButton}>
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        )}
        <button type="button" onClick={toggleTheme} aria-label="Toggle theme" title={isDark ? 'Light theme' : 'Dark theme'} className={footerButton}>
          {isDark ? <Sun className="h-4 w-4 text-amber-300 shrink-0" /> : <Moon className="h-4 w-4 text-emerald-200 shrink-0" />}
          {!collapsed && <span>{isDark ? 'Light theme' : 'Dark theme'}</span>}
        </button>
        <Link to="/support" title="Support" className={footerButton}>
          <LifeBuoy className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Support</span>}
        </Link>
        <div className="mt-1 rounded-xl bg-white dark:bg-[#111817] overflow-hidden">
          <UserMenu collapsed={collapsed} />
        </div>
      </div>
    </aside>
  );
};

export default SuperAdminNavbar;
