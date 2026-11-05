import { describe, it, expect } from 'vitest';
import { Settings } from 'lucide-react';
import { activeCategoryId, groupByCategory, isItemActive, type CategorizedNavItem } from './navCategories';

const item = (path: string, category?: string, exact?: boolean): CategorizedNavItem => ({ name: path, path, icon: Settings, category, exact });
const defs = [
  { id: 'workspace', title: 'Workspace' },
  { id: 'developer', title: 'Developer' },
  { id: 'logs', title: 'Logs' },
];

describe('navCategories', () => {
  it('groups items in category order and drops empty categories', () => {
    const groups = groupByCategory([item('/settings/api-keys', 'developer'), item('/settings', 'workspace', true)], defs);
    expect(groups.map((g) => g.id)).toEqual(['workspace', 'developer']);
  });

  it('hides a category once filtering removes all its items', () => {
    const items = [item('/settings', 'workspace', true), item('/settings/teams', 'workspace')];
    const allowed = (p: string) => p !== '/settings/teams';
    expect(groupByCategory(items.filter((i) => allowed(i.path)), defs)[0].items).toHaveLength(1);
    expect(groupByCategory([item('/settings/teams', 'logs')].filter((i) => allowed(i.path)), defs)).toEqual([]);
  });

  it('puts uncategorised items in a trailing group', () => {
    const groups = groupByCategory([item('/ads'), item('/settings', 'workspace')], defs);
    expect(groups.map((g) => g.id)).toEqual(['workspace', 'other']);
  });

  it('finds the active item and its category, preferring the more specific sibling', () => {
    const items = [item('/campaigns', 'workspace'), item('/campaigns/analytics', 'developer')];
    expect(isItemActive(items[0], items, '/campaigns/analytics')).toBe(false);
    expect(isItemActive(items[1], items, '/campaigns/analytics')).toBe(true);
    expect(activeCategoryId(groupByCategory(items, defs), '/campaigns/analytics')).toBe('developer');
    expect(activeCategoryId(groupByCategory(items, defs), '/nowhere')).toBeNull();
  });
});
