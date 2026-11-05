import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';

/** A navbar link that can sit under a collapsible category heading. */
export interface CategorizedNavItem {
  name: string;
  path: string;
  icon: LucideIcon;
  badge?: string;
  badgeVariant?: 'new' | 'ai' | 'popular';
  exact?: boolean;
  /** Id of the NavCategoryDef this link is listed under. */
  category?: string;
}

export interface NavCategoryDef {
  id: string;
  title: string;
  icon?: LucideIcon;
  /** Render the links without a collapsible heading (e.g. a lone Dashboard link). */
  flat?: boolean;
}

export interface NavCategory extends NavCategoryDef {
  items: CategorizedNavItem[];
}

const OTHER: NavCategoryDef = { id: 'other', title: 'More' };

/**
 * Groups (already filtered) links under their categories, in `defs` order.
 * Categories left with no links are dropped, so a plan or permission that
 * hides every page of a category hides its heading too. Links without a
 * known category land in a trailing "More" group.
 */
export function groupByCategory(items: CategorizedNavItem[], defs: NavCategoryDef[]): NavCategory[] {
  const known = new Set(defs.map((d) => d.id));
  const groups = [...defs, OTHER].map((d) => ({
    ...d,
    items: items.filter((i) => (i.category && known.has(i.category) ? i.category === d.id : d.id === OTHER.id)),
  }));
  return groups.filter((g) => g.items.length > 0);
}

/**
 * Whether `item` is the current page. A prefix match yields to a more
 * specific sibling (e.g. /campaigns stays unhighlighted on /campaigns/analytics).
 */
export function isItemActive(item: CategorizedNavItem, siblings: CategorizedNavItem[], pathname: string): boolean {
  const matches = (path: string) => pathname === path || pathname.startsWith(`${path}/`);
  if (item.exact) return pathname === item.path;
  return (
    matches(item.path) &&
    !siblings.some((other) => other.path.length > item.path.length && other.path.startsWith(item.path) && matches(other.path))
  );
}

/** Id of the category holding the current page, if any. */
export function activeCategoryId(categories: NavCategory[], pathname: string): string | null {
  const all = categories.flatMap((c) => c.items);
  return categories.find((c) => c.items.some((i) => isItemActive(i, all, pathname)))?.id ?? null;
}

type OpenMap = Record<string, boolean>;

function readOpenMap(key: string): OpenMap {
  try {
    const raw = localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? (parsed as OpenMap) : {};
  } catch {
    return {};
  }
}

function withActiveOpen(map: OpenMap, activeId: string | null): OpenMap {
  if (!activeId || map[activeId] !== false) return map;
  const next = { ...map };
  delete next[activeId];
  return next;
}

/**
 * Open/closed state of category headings, remembered in localStorage under
 * `storageKey`. Categories start collapsed, except the one holding the
 * current page, which re-opens whenever the user navigates into it.
 */
export function useCategoryOpenState(storageKey: string, activeId: string | null) {
  const [state, setState] = useState(() => ({
    key: storageKey,
    active: activeId,
    map: withActiveOpen(readOpenMap(storageKey), activeId),
  }));

  let map = state.map;
  if (state.key !== storageKey || state.active !== activeId) {
    map = withActiveOpen(state.key !== storageKey ? readOpenMap(storageKey) : state.map, activeId);
    setState({ key: storageKey, active: activeId, map });
  }

  const isOpen = (id: string) => map[id] ?? id === activeId;

  const toggle = (id: string) => {
    const next = { ...map, [id]: !isOpen(id) };
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Not saved; the heading still toggles for this page load.
    }
    setState({ key: storageKey, active: activeId, map: next });
  };

  return { isOpen, toggle };
}
