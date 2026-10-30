import React, { useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LifeBuoy, Moon, PanelLeftClose, PanelLeftOpen, Sun, type LucideIcon } from 'lucide-react';
import { BrandMark } from '@/views/public/PublicLayout';
import { useBranding } from '@/services/branding';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';
import { UserMenu } from './UserMenu';

export interface SuperAdminNavItem {
  name: string;
  path: string;
  icon: LucideIcon;
  badge?: string;
  exact?: boolean;
}

export interface SuperAdminNavSection {
  title: string;
  items: SuperAdminNavItem[];
}

const STORAGE_KEY = 'onesuit-sa-nav-collapsed';

/**
 * The super admin's single navbar: every Platform Admin and Settings page in
 * one bar (no second sub-menu). Collapses to icons.
 */
export const SuperAdminNavbar: React.FC<{ sections: SuperAdminNavSection[] }> = ({ sections }) => {
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

  const isActive = (item: SuperAdminNavItem) =>
    item.exact ? location.pathname === item.path : location.pathname === item.path || location.pathname.startsWith(item.path + '/');

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
      <nav className="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar space-y-4 py-1">
        {sections.map((section) => (
          <div key={section.title}>
            {collapsed ? (
              <div className="mx-auto mb-1.5 h-px w-8 bg-white/15" />
            ) : (
              <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-white/45">{section.title}</p>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(item);
                const Icon = item.icon;
                const label = t(item.name) || item.name;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.exact}
                    title={label}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'group flex items-center gap-2.5 rounded-xl text-xs font-medium transition-all',
                      collapsed ? 'justify-center p-2' : 'px-3 py-2',
                      active ? 'bg-white text-spruce-dark font-semibold shadow-sm' : 'text-white/80 hover:text-white hover:bg-white/[0.08]'
                    )}
                  >
                    <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-spruce-dark' : 'text-white/80 group-hover:text-white')} />
                    {!collapsed && <span className="truncate flex-1">{label}</span>}
                    {!collapsed && item.badge && (
                      <span
                        className={cn(
                          'text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider',
                          active ? 'bg-purple-100 text-purple-900' : 'bg-purple-400/25 text-purple-200'
                        )}
                      >
                        {item.badge}
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
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
