import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { CornerDownLeft, Search, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { filterPaletteItems, type PaletteItem } from './commandPaletteSearch';

export type { PaletteItem } from './commandPaletteSearch';

const RECENT_KEY = 'onesuit-palette-recent';
const RECENT_MAX = 5;

function readRecent(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function pushRecent(id: string) {
  try {
    const next = [id, ...readRecent().filter((r) => r !== id)].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Recents are a convenience; ignore storage errors.
  }
}

interface Section {
  title: string;
  items: PaletteItem[];
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Everything the user may open or run; callers filter out hidden pages. */
  items: PaletteItem[];
  onSelect: (item: PaletteItem) => void;
}

/** Ctrl/Cmd+K search over pages and quick actions. */
export const CommandPalette: React.FC<CommandPaletteProps> = ({ open, onOpenChange, items, onSelect }) => {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      setRecent(readRecent());
    }
  }, [open]);

  const sections: Section[] = useMemo(() => {
    if (query.trim()) {
      const hits = filterPaletteItems(items, query);
      return hits.length ? [{ title: 'Results', items: hits }] : [];
    }
    const byId = new Map(items.map((i) => [i.id, i]));
    // Only recents that are still visible to this user.
    const recentItems = recent.map((id) => byId.get(id)).filter((i): i is PaletteItem => !!i);
    const groups: Section[] = recentItems.length ? [{ title: 'Recent', items: recentItems }] : [];
    for (const item of items) {
      const last = groups[groups.length - 1];
      if (last && last.title === item.group && last.title !== 'Recent') last.items.push(item);
      else groups.push({ title: item.group, items: [item] });
    }
    return groups;
  }, [items, query, recent]);

  const flat = useMemo(() => sections.flatMap((s) => s.items), [sections]);
  const activeIndex = Math.min(active, Math.max(flat.length - 1, 0));

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const choose = (item: PaletteItem | undefined) => {
    if (!item) return;
    pushRecent(item.id);
    onOpenChange(false);
    onSelect(item);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((activeIndex + 1) % Math.max(flat.length, 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((activeIndex - 1 + flat.length) % Math.max(flat.length, 1));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActive(flat.length - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(flat[activeIndex]);
    }
  };

  let index = -1;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onKeyDown={onKeyDown}
          className="fixed left-1/2 top-[12vh] z-[60] w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-gray-200 bg-white text-gray-900 shadow-2xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 dark:border-white/10 dark:bg-[#141b1a] dark:text-gray-100"
        >
          <DialogPrimitive.Title className="sr-only">Search pages and actions</DialogPrimitive.Title>
          <div className="flex items-center gap-2 border-b border-gray-100 px-4 dark:border-white/[0.08]">
            <Search className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              placeholder="Search pages and actions…"
              role="combobox"
              aria-expanded
              aria-controls="command-palette-list"
              aria-activedescendant={flat.length ? `command-palette-item-${activeIndex}` : undefined}
              className="h-12 w-full bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400 dark:text-gray-100"
            />
            <kbd className="hidden shrink-0 rounded-md border border-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 sm:inline dark:border-white/10 dark:text-gray-400">
              Esc
            </kbd>
          </div>

          <div ref={listRef} id="command-palette-list" role="listbox" aria-label="Results" className="max-h-[min(60vh,420px)] overflow-y-auto p-2">
            {flat.length === 0 && (
              <p className="px-3 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                No pages or actions match “{query}”.
              </p>
            )}
            {sections.map((section) => (
              <div key={section.title} role="group" aria-label={section.title} className="mb-1 last:mb-0">
                <div className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  {section.title}
                </div>
                {section.items.map((item) => {
                  index += 1;
                  const i = index;
                  const selected = i === activeIndex;
                  const Icon: LucideIcon = item.icon;
                  return (
                    <div
                      key={`${section.title}-${item.id}`}
                      id={`command-palette-item-${i}`}
                      data-index={i}
                      role="option"
                      aria-selected={selected}
                      onMouseMove={() => active !== i && setActive(i)}
                      onClick={() => choose(item)}
                      className={cn(
                        'flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors',
                        selected
                          ? 'bg-teal-50 text-teal-900 dark:bg-teal-500/15 dark:text-teal-100'
                          : 'text-gray-700 dark:text-gray-300'
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                          selected
                            ? 'bg-teal-600 text-white dark:bg-teal-500'
                            : 'bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-gray-400'
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">{item.label}</span>
                      {query.trim() && (
                        <span className="hidden shrink-0 truncate text-[11px] text-gray-400 sm:inline dark:text-gray-500">
                          {item.group}
                        </span>
                      )}
                      {selected && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-teal-600 dark:text-teal-300" aria-hidden />}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="hidden items-center gap-4 border-t border-gray-100 px-4 py-2 text-[11px] text-gray-400 sm:flex dark:border-white/[0.08] dark:text-gray-500">
            <span>↑↓ to move</span>
            <span>↵ to open</span>
            <span className="ml-auto">Ctrl / ⌘ K anywhere</span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

export default CommandPalette;
