import React from 'react';
import { ChevronDown, Search, Tag as TagIcon, X, Loader2, MessageCircle, Check, History } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Tag } from '@/services/api';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
  type Contact,
  type InboxCounts,
  type InboxView,
  formatRelative,
  getAvatarColor,
  getContactName,
  getInitials,
  isWindowOpen,
  tagChipStyle,
} from './chatUtils';

const OTHER_VIEWS: { id: InboxView; label: string; countKey?: keyof InboxCounts; hint: string }[] = [
  { id: 'others', label: 'Assigned to others', countKey: 'others', hint: 'Chats a teammate owns' },
  { id: 'unread', label: 'Unread', countKey: 'unread', hint: 'Waiting for a reply' },
  { id: 'open', label: 'Reply window open', hint: 'Customer wrote in the last 24 hours' },
  { id: 'expired', label: 'Reply window closed', hint: 'Needs a template to restart' },
];

interface InboxListProps {
  contacts: Contact[];
  counts: InboxCounts | null;
  total: number;
  loading: boolean;
  selectedId?: string;
  view: InboxView;
  onViewChange: (v: InboxView) => void;
  showAll: boolean;
  onShowAllChange: (v: boolean) => void;
  labels: string[];
  onLabelsChange: (labels: string[]) => void;
  availableTags: Tag[];
  tagColors: Record<string, string>;
  search: string;
  onSearchChange: (v: string) => void;
  onSelect: (c: Contact) => void;
  onLoadMore: () => void;
  loadingMore: boolean;
  teamNames: Record<string, string>;
  currentUserId?: string;
  className?: string;
}

export const InboxList: React.FC<InboxListProps> = ({
  contacts,
  counts,
  total,
  loading,
  selectedId,
  view,
  onViewChange,
  showAll,
  onShowAllChange,
  labels,
  onLabelsChange,
  availableTags,
  tagColors,
  search,
  onSearchChange,
  onSelect,
  onLoadMore,
  loadingMore,
  teamNames,
  currentUserId,
  className,
}) => {
  const otherView = OTHER_VIEWS.find((o) => o.id === view);
  const now = Date.now();

  const toggleLabel = (name: string) =>
    onLabelsChange(labels.includes(name) ? labels.filter((l) => l !== name) : [...labels, name]);

  const tab = (id: InboxView, label: string, count?: number) => (
    <button
      type="button"
      role="tab"
      aria-selected={view === id}
      onClick={() => onViewChange(id)}
      className={cn(
        'relative flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors',
        view === id
          ? 'bg-white text-teal-800 shadow-sm dark:bg-teal-900/50 dark:text-teal-100'
          : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
      )}
    >
      <span>{label}</span>
      {typeof count === 'number' && (
        <span
          className={cn(
            'min-w-[18px] rounded-full px-1 text-[10px] font-semibold leading-4',
            view === id
              ? 'bg-teal-600 text-white'
              : 'bg-gray-200 text-gray-700 dark:bg-white/10 dark:text-gray-300'
          )}
        >
          {count > 999 ? '999+' : count}
        </span>
      )}
    </button>
  );

  return (
    <div className={cn('flex min-h-0 flex-col bg-white dark:bg-[#111a19]', className)}>
      <div className="space-y-3 border-b border-gray-200/80 px-3.5 pb-3 pt-3.5 dark:border-white/[0.07]">
        {/* Title + Show all */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
              <MessageCircle className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-bold text-gray-900 dark:text-white">WhatsApp Chat</h2>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                {total} {showAll ? 'contacts' : 'conversations'}
              </p>
            </div>
          </div>
          <Link
            to="/chat/history"
            className="ml-auto flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
            title="Chat history: past conversations by date, search and export"
          >
            <History className="h-3.5 w-3.5" />
            History
          </Link>
          <label
            className="flex cursor-pointer select-none items-center gap-2 text-xs font-medium text-gray-600 dark:text-gray-300"
            title="Include contacts you haven't chatted with yet"
          >
            Show all
            <Switch checked={showAll} onCheckedChange={onShowAllChange} aria-label="Show all contacts" />
          </label>
        </div>

        {/* Tabs */}
        <div role="tablist" className="grid grid-cols-4 gap-0.5 rounded-xl bg-gray-100 p-0.5 dark:bg-white/[0.05]">
          {tab('all', 'All', counts?.all)}
          {tab('mine', 'Mine', counts?.mine)}
          {tab('unassigned', 'Unassigned', counts?.unassigned)}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  'flex items-center justify-center gap-0.5 rounded-lg px-1.5 py-1.5 text-xs font-medium transition-colors',
                  otherView
                    ? 'bg-white text-teal-800 shadow-sm dark:bg-teal-900/50 dark:text-teal-100'
                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                )}
              >
                <span className="truncate">{otherView ? otherView.label.split(' ')[0] : 'Others'}</span>
                <ChevronDown className="h-3 w-3 shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel className="text-xs">More views</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {OTHER_VIEWS.map((o) => (
                <DropdownMenuItem key={o.id} onSelect={() => onViewChange(o.id)} className="flex items-start gap-2 text-xs">
                  <Check className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', view === o.id ? 'opacity-100' : 'opacity-0')} />
                  <span className="flex-1">
                    <span className="block font-medium">{o.label}</span>
                    <span className="block text-[11px] opacity-60">{o.hint}</span>
                  </span>
                  {o.countKey && counts && <span className="text-[11px] font-semibold opacity-70">{counts[o.countKey]}</span>}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Filter by labels */}
        {availableTags.length > 0 && (
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                <TagIcon className="h-3 w-3" /> Filter by labels
              </span>
              {labels.length > 0 && (
                <button
                  type="button"
                  onClick={() => onLabelsChange([])}
                  className="flex items-center gap-0.5 text-[11px] font-medium text-teal-700 hover:underline dark:text-teal-300"
                >
                  <X className="h-3 w-3" /> Clear
                </button>
              )}
            </div>
            <div className="flex max-h-[60px] flex-wrap gap-1.5 overflow-y-auto pr-1">
              {availableTags.map((tag) => {
                const active = labels.includes(tag.name);
                return (
                  <button
                    key={tag.name}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleLabel(tag.name)}
                    style={tagChipStyle(tag.color, active)}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors',
                      !active && 'text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.05]'
                    )}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tagChipStyle(tag.color).color }} />
                    {tag.name}
                    {active && <X className="h-3 w-3" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search name or number"
            aria-label="Search conversations"
            className="h-9 w-full rounded-xl border border-gray-200 bg-gray-50 pl-8 pr-8 text-xs text-gray-900 placeholder:text-gray-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:text-gray-700 dark:hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Contact list */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && contacts.length === 0 && (
          <div className="flex items-center justify-center gap-2 py-10 text-xs text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading chats…
          </div>
        )}
        {!loading && contacts.length === 0 && (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">No chats here</p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {search || labels.length > 0 || view !== 'all'
                ? 'Try another tab, label or search.'
                : showAll
                  ? 'Add contacts to start chatting.'
                  : 'Conversations appear here when customers message you. Turn on “Show all” to see every contact.'}
            </p>
          </div>
        )}
        <ul className="divide-y divide-gray-100 dark:divide-white/[0.04]">
          {contacts.map((c) => {
            const name = getContactName(c);
            const selected = c.id === selectedId;
            const unread = c.unread_count > 0;
            const open = isWindowOpen(c, now);
            const assignee = c.assigned_user_id
              ? c.assigned_user_id === currentUserId
                ? 'You'
                : teamNames[c.assigned_user_id]
              : '';
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onSelect(c)}
                  className={cn(
                    'relative flex w-full items-start gap-3 px-3.5 py-3 text-left transition-colors',
                    selected
                      ? 'bg-teal-50 dark:bg-teal-900/25'
                      : 'hover:bg-gray-50 dark:hover:bg-white/[0.03]'
                  )}
                >
                  {selected && <span className="absolute inset-y-0 left-0 w-[3px] rounded-r bg-teal-600" />}
                  <span className="relative shrink-0">
                    <span
                      className={cn(
                        'flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold',
                        getAvatarColor(name)
                      )}
                    >
                      {getInitials(name)}
                    </span>
                    {open && (
                      <span
                        className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500 dark:border-[#111a19]"
                        title="Reply window open"
                      />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span
                        className={cn(
                          'truncate text-[13px] text-gray-900 dark:text-white',
                          unread ? 'font-bold' : 'font-semibold'
                        )}
                      >
                        {name}
                        {name !== c.phone_number && (
                          <span className="font-normal text-gray-500 dark:text-gray-400"> – {c.phone_number}</span>
                        )}
                      </span>
                      <span
                        className={cn(
                          'shrink-0 text-[11px]',
                          unread ? 'font-semibold text-emerald-600 dark:text-emerald-400' : 'text-gray-400'
                        )}
                        title={c.last_message_at ? new Date(c.last_message_at).toLocaleString() : undefined}
                      >
                        {formatRelative(c.last_message_at, now)}
                      </span>
                    </span>
                    <span className="mt-0.5 flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          'truncate text-xs',
                          unread ? 'font-medium text-gray-800 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'
                        )}
                      >
                        {c.last_message_preview || 'No messages yet'}
                      </span>
                      {unread && (
                        <span className="flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-[10px] font-bold text-white">
                          {c.unread_count > 99 ? '99+' : c.unread_count}
                        </span>
                      )}
                    </span>
                    {((c.tags && c.tags.length > 0) || assignee) && (
                      <span className="mt-1.5 flex items-center gap-1 overflow-hidden">
                        {(c.tags || []).slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            style={tagChipStyle(tagColors[tag])}
                            className="max-w-[90px] truncate rounded-full border px-1.5 text-[10px] font-medium leading-4"
                          >
                            {tag}
                          </span>
                        ))}
                        {(c.tags?.length || 0) > 3 && (
                          <span className="text-[10px] text-gray-400">+{(c.tags?.length || 0) - 3}</span>
                        )}
                        {assignee && (
                          <span className="ml-auto shrink-0 truncate text-[10px] text-gray-400" title="Assigned to">
                            → {assignee}
                          </span>
                        )}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {contacts.length > 0 && contacts.length < total && (
          <div className="p-3">
            <button
              type="button"
              onClick={onLoadMore}
              disabled={loadingMore}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-white/[0.08] dark:text-gray-200 dark:hover:bg-white/[0.04]"
            >
              {loadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Load more ({total - contacts.length} left)
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default InboxList;
