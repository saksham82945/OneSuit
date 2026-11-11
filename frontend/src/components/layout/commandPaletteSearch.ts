import type { LucideIcon } from 'lucide-react';

export interface PaletteItem {
  /** Stable id (used for "Recent"): the path for pages, `action:…` for actions. */
  id: string;
  label: string;
  /** Heading the item is listed under. */
  group: string;
  icon: LucideIcon;
  /** Extra words that should match (e.g. "broadcast" for campaigns). */
  keywords?: string;
  path?: string;
  run?: () => void;
}

/**
 * Items matching every word of `query` (in the label, group or keywords),
 * best first: label starts with the query, then a label word does, then any match.
 */
export function filterPaletteItems(items: PaletteItem[], query: string): PaletteItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  const words = q.split(/\s+/);
  const scored: { item: PaletteItem; score: number; order: number }[] = [];
  items.forEach((item, order) => {
    const label = item.label.toLowerCase();
    const haystack = `${label} ${item.group.toLowerCase()} ${(item.keywords || '').toLowerCase()} ${(item.path || '').toLowerCase()}`;
    if (!words.every((w) => haystack.includes(w))) return;
    let score = 3;
    if (label.startsWith(q)) score = 0;
    else if (label.split(/[\s&/-]+/).some((part) => part.startsWith(words[0]))) score = 1;
    else if (label.includes(words[0])) score = 2;
    scored.push({ item, score, order });
  });
  scored.sort((a, b) => a.score - b.score || a.order - b.order);
  return scored.map((s) => s.item);
}

/** Keeps the first item for each id (several menus can list the same page). */
export function dedupePaletteItems(items: PaletteItem[]): PaletteItem[] {
  const seen = new Set<string>();
  return items.filter((i) => {
    if (seen.has(i.id)) return false;
    seen.add(i.id);
    return true;
  });
}
