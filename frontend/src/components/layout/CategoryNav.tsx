import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';
import {
  activeCategoryId,
  isItemActive,
  useCategoryOpenState,
  type CategorizedNavItem,
  type NavCategory,
} from './navCategories';

/** `rail`: white text on the spruce navbar. `surface`: the white / dark sub-menu. */
export type CategoryNavTone = 'rail' | 'surface';

interface CategoryNavProps {
  categories: NavCategory[];
  /** localStorage key prefix; the signed-in user's id is appended. */
  storageKey: string;
  tone: CategoryNavTone;
  /** Called after a link is clicked (e.g. to close the mobile drawer). */
  onNavigate?: () => void;
  className?: string;
}

const styles = {
  rail: {
    header: 'text-white/60 hover:text-white hover:bg-white/[0.08] focus-visible:ring-white/40',
    headerOpen: 'text-white',
    headerIcon: 'text-white/60',
    link: 'text-white/80 hover:text-white hover:bg-white/[0.08] focus-visible:ring-white/40',
    linkActive: 'bg-white text-spruce-dark font-semibold shadow-sm',
    icon: 'text-white/75 group-hover:text-white',
    iconActive: 'text-spruce-dark',
    guide: 'border-white/15',
    badge: 'bg-purple-400/25 text-purple-100',
    badgeActive: 'bg-purple-100 text-purple-900',
  },
  surface: {
    header:
      'text-gray-500 hover:text-gray-900 hover:bg-gray-100/80 dark:text-gray-400 dark:hover:text-white dark:hover:bg-white/[0.06] focus-visible:ring-teal-500/40',
    headerOpen: 'text-gray-900 dark:text-gray-100',
    headerIcon: 'text-gray-400 dark:text-gray-500',
    link:
      'text-gray-700 hover:text-gray-950 hover:bg-gray-100/80 dark:text-gray-300 dark:hover:text-white dark:hover:bg-white/[0.06] focus-visible:ring-teal-500/40',
    linkActive: 'bg-teal-50 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200 font-semibold shadow-sm',
    icon: 'text-gray-500 group-hover:text-gray-800 dark:text-gray-400 dark:group-hover:text-gray-200',
    iconActive: 'text-teal-700 dark:text-teal-300',
    guide: 'border-gray-200 dark:border-white/10',
    badge: 'bg-gray-100 text-gray-700 dark:bg-white/[0.08] dark:text-gray-300',
    badgeActive: 'bg-white/70 text-teal-800 dark:bg-white/10 dark:text-teal-200',
  },
} as const;

const surfaceBadge: Record<string, string> = {
  new: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300',
  ai: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300',
  popular: 'bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-300',
};

/**
 * Links grouped under collapsible category headings. Only the category
 * holding the current page starts open; each heading toggles with a smooth
 * expand/collapse and the choice is remembered per user. A single category
 * without a real heading (or one marked `flat`) renders as plain links.
 */
export const CategoryNav: React.FC<CategoryNavProps> = ({ categories, storageKey, tone, onNavigate, className }) => {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const userId = useAuthStore((s) => s.user?.id);
  const s = styles[tone];
  const allItems = categories.flatMap((c) => c.items);
  const activeId = activeCategoryId(categories, pathname);
  const { isOpen, toggle } = useCategoryOpenState(`${storageKey}:${userId ?? 'anon'}`, activeId);

  const renderLink = (item: CategorizedNavItem, hidden = false) => {
    const active = isItemActive(item, allItems, pathname);
    const Icon = item.icon;
    const label = t(item.name) || item.name;
    return (
      <NavLink
        key={item.path}
        to={item.path}
        end={item.exact}
        title={label}
        tabIndex={hidden ? -1 : undefined}
        aria-current={active ? 'page' : undefined}
        onClick={onNavigate}
        className={cn(
          'group flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium transition-colors outline-none focus-visible:ring-2',
          active ? s.linkActive : s.link
        )}
      >
        <Icon className={cn('h-4 w-4 shrink-0 transition-colors', active ? s.iconActive : s.icon)} />
        <span className="truncate flex-1">{label}</span>
        {item.badge && (
          <span
            className={cn(
              'text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider',
              tone === 'surface' && !active && item.badgeVariant ? surfaceBadge[item.badgeVariant] : active ? s.badgeActive : s.badge
            )}
          >
            {item.badge}
          </span>
        )}
      </NavLink>
    );
  };

  if (categories.length === 1 && categories[0].id === 'other') {
    return <div className={cn('space-y-0.5', className)}>{categories[0].items.map((i) => renderLink(i))}</div>;
  }

  return (
    <div className={cn('space-y-1', className)}>
      {categories.map((cat) => {
        if (cat.flat) return <div key={cat.id} className="space-y-0.5 pb-1">{cat.items.map((i) => renderLink(i))}</div>;
        const open = isOpen(cat.id);
        const CatIcon = cat.icon;
        const panelId = `navcat-${storageKey}-${cat.id}`;
        const holdsActive = cat.id === activeId;
        return (
          <div key={cat.id}>
            <button
              type="button"
              onClick={() => toggle(cat.id)}
              aria-expanded={open}
              aria-controls={panelId}
              className={cn(
                'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors outline-none focus-visible:ring-2',
                s.header,
                (open || holdsActive) && s.headerOpen
              )}
            >
              {CatIcon && <CatIcon className={cn('h-3.5 w-3.5 shrink-0', s.headerIcon)} />}
              <span className="flex-1 truncate text-left">{t(cat.title) || cat.title}</span>
              {!open && holdsActive && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
              <ChevronDown
                className={cn('h-3.5 w-3.5 shrink-0 transition-transform duration-200', open ? 'rotate-0' : '-rotate-90')}
                aria-hidden
              />
            </button>
            <div
              id={panelId}
              className={cn(
                'grid transition-[grid-template-rows,opacity,visibility] duration-200 ease-out',
                open ? 'grid-rows-[1fr] opacity-100 visible' : 'grid-rows-[0fr] opacity-0 invisible'
              )}
            >
              <div className="overflow-hidden">
                <div className={cn('ml-4 mt-0.5 mb-1 space-y-0.5 border-l pl-2', s.guide)}>
                  {cat.items.map((i) => renderLink(i, !open))}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default CategoryNav;
