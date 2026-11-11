import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  ChevronDown,
  Clock,
  Filter,
  History,
  Loader2,
  MessageCircle,
  MessagesSquare,
  Search,
  Tag as TagIcon,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { accountsService, tagsService, usersService, type Tag } from '@/services/api';
import { readData, readList, readTotal } from '@/services/response';
import {
  historyService,
  type ExportFormat,
  type HistoryContactInfo,
  type HistoryConversation,
  type HistoryFilters,
  type HistoryMessage,
  type HistoryMessagesPage,
  type HistorySearchHit,
  type HistoryStats,
} from '@/services/historyApi';
import { useAuthStore } from '@/stores/auth';
import { getAvatarColor, getErrorMessage, getInitials, tagChipStyle } from '../chatUtils';
import { HistoryTranscript } from './HistoryTranscript';
import {
  RANGE_PRESETS,
  formatDuration,
  rangeFor,
  rangeLabel,
  splitHighlight,
  toDateInput,
  type RangePreset,
} from './historyUtils';

const PAGE_SIZE = 50;
const MSG_PAGE = 100;

interface Account {
  name: string;
  phone_id?: string;
}
interface Member {
  id: string;
  full_name: string;
}

const shortDate = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleDateString([], {
    day: 'numeric',
    month: 'short',
    year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });
};

const chipBtn =
  'inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors ' +
  'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 ' +
  'dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-200 dark:hover:bg-white/[0.08]';
const chipActive =
  'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300';

const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: React.ReactNode; tone: string }> = ({
  icon,
  label,
  value,
  tone,
}) => (
  <div className="flex min-w-0 items-center gap-2.5 rounded-xl border border-gray-200/80 bg-white px-3 py-2 dark:border-white/[0.07] dark:bg-white/[0.03]">
    <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', tone)}>{icon}</span>
    <div className="min-w-0">
      <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-base font-bold leading-tight text-gray-900 tabular-nums dark:text-white">{value}</p>
    </div>
  </div>
);

export const ChatHistoryView: React.FC = () => {
  const user = useAuthStore((s) => s.user);
  const [searchParams] = useSearchParams();

  // ---- Range ----
  const [preset, setPreset] = useState<RangePreset>('7d');
  const [custom, setCustom] = useState(() => {
    const r = rangeFor('7d');
    return { from: toDateInput(r.from), to: toDateInput(new Date(r.to.getTime() - 86400000)) };
  });
  const range = useMemo(() => rangeFor(preset, new Date(), custom), [preset, custom]);
  const fromISO = range.from.toISOString();
  const toISO = range.to.toISOString();

  // ---- Filters ----
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [assigned, setAssigned] = useState('');
  const [account, setAccount] = useState('');
  const [direction, setDirection] = useState<'' | 'incoming' | 'outgoing'>('');
  const [leftTab, setLeftTab] = useState<'chats' | 'messages'>('chats');

  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  // ---- Lookups for filter menus ----
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [team, setTeam] = useState<Member[]>([]);
  useEffect(() => {
    tagsService.list({ limit: 100 }).then((r) => setAvailableTags(readList<Tag>(r, 'tags'))).catch(() => {});
    accountsService.list().then((r) => setAccounts(readList<Account>(r, 'accounts'))).catch(() => {});
    usersService.list({ limit: 100 }).then((r) => setTeam(readList<Member>(r, 'users'))).catch(() => {});
  }, []);
  const tagColors = useMemo(() => Object.fromEntries(availableTags.map((t) => [t.name, t.color])), [availableTags]);

  const filters: HistoryFilters = useMemo(
    () => ({ from: fromISO, to: toISO, search, tags, assigned, account, direction }),
    [fromISO, toISO, search, tags, assigned, account, direction]
  );
  const filterKey = JSON.stringify(filters);
  const filterKeyRef = useRef(filterKey);
  filterKeyRef.current = filterKey;

  // ---- Conversations + stats ----
  const [convs, setConvs] = useState<HistoryConversation[]>([]);
  const [convTotal, setConvTotal] = useState(0);
  const [convPage, setConvPage] = useState(1);
  const [convLoading, setConvLoading] = useState(true);
  const [convMore, setConvMore] = useState(false);
  const [stats, setStats] = useState<HistoryStats | null>(null);

  useEffect(() => {
    const key = filterKey;
    setConvLoading(true);
    setConvPage(1);
    historyService
      .conversations(filters, 1, PAGE_SIZE)
      .then((res) => {
        if (filterKeyRef.current !== key) return;
        setConvs(readList<HistoryConversation>(res, 'conversations'));
        setConvTotal(readTotal(res, 'conversations'));
      })
      .catch((err) => {
        if (filterKeyRef.current !== key) return;
        setConvs([]);
        setConvTotal(0);
        toast.error(getErrorMessage(err, 'Could not load chat history'));
      })
      .finally(() => filterKeyRef.current === key && setConvLoading(false));
    historyService
      .stats(filters)
      .then((res) => filterKeyRef.current === key && setStats(readData<HistoryStats>(res)))
      .catch(() => filterKeyRef.current === key && setStats(null));
    // filterKey captures every field of filters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  const loadMoreConvs = async () => {
    const key = filterKey;
    setConvMore(true);
    try {
      const res = await historyService.conversations(filters, convPage + 1, PAGE_SIZE);
      if (filterKeyRef.current !== key) return;
      setConvs((prev) => [...prev, ...readList<HistoryConversation>(res, 'conversations')]);
      setConvPage((p) => p + 1);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not load more'));
    } finally {
      setConvMore(false);
    }
  };

  // ---- Message search ("jump to message") ----
  const [hits, setHits] = useState<HistorySearchHit[]>([]);
  const [hitTotal, setHitTotal] = useState(0);
  const [hitPage, setHitPage] = useState(1);
  const [hitLoading, setHitLoading] = useState(false);
  const searchable = search.replace(/^\+/, '').length >= 2;
  const hitKey = JSON.stringify({ q: search, fromISO, toISO, account, direction });
  const hitKeyRef = useRef(hitKey);
  hitKeyRef.current = hitKey;

  useEffect(() => {
    if (!searchable) {
      setHits([]);
      setHitTotal(0);
      setLeftTab('chats');
      return;
    }
    const key = hitKey;
    setHitLoading(true);
    setHitPage(1);
    historyService
      .search({ q: search, from: fromISO, to: toISO, page: 1, limit: 30, account: account || undefined, direction: direction || undefined })
      .then((res) => {
        if (hitKeyRef.current !== key) return;
        setHits(readList<HistorySearchHit>(res, 'results'));
        setHitTotal(readTotal(res, 'results'));
      })
      .catch(() => hitKeyRef.current === key && setHits([]))
      .finally(() => hitKeyRef.current === key && setHitLoading(false));
    // hitKey captures the inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hitKey, searchable]);

  const loadMoreHits = async () => {
    const key = hitKey;
    setHitLoading(true);
    try {
      const res = await historyService.search({
        q: search,
        from: fromISO,
        to: toISO,
        page: hitPage + 1,
        limit: 30,
        account: account || undefined,
        direction: direction || undefined,
      });
      if (hitKeyRef.current !== key) return;
      setHits((prev) => [...prev, ...readList<HistorySearchHit>(res, 'results')]);
      setHitPage((p) => p + 1);
    } finally {
      setHitLoading(false);
    }
  };

  // ---- Transcript ----
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get('contact'));
  const [focusId, setFocusId] = useState<string | null>(null);
  const [contact, setContact] = useState<HistoryContactInfo | null>(null);
  const [messages, setMessages] = useState<HistoryMessage[]>([]);
  const [msgTotal, setMsgTotal] = useState(0);
  const [pages, setPages] = useState<{ min: number; max: number }>({ min: 1, max: 1 });
  const [msgLoading, setMsgLoading] = useState(false);
  const [msgMore, setMsgMore] = useState<'earlier' | 'later' | null>(null);
  const transcriptKey = `${selectedId}|${focusId}|${fromISO}|${toISO}`;
  const transcriptKeyRef = useRef(transcriptKey);
  transcriptKeyRef.current = transcriptKey;

  useEffect(() => {
    if (!selectedId) {
      setContact(null);
      setMessages([]);
      return;
    }
    const key = transcriptKey;
    setMsgLoading(true);
    historyService
      .messages({ contact_id: selectedId, from: fromISO, to: toISO, limit: MSG_PAGE, around: focusId || undefined })
      .then((res) => {
        if (transcriptKeyRef.current !== key) return;
        const data = readData<HistoryMessagesPage>(res);
        setContact(data.contact);
        setMessages(data.messages || []);
        setMsgTotal(data.total || 0);
        setPages({ min: data.page || 1, max: data.page || 1 });
      })
      .catch((err) => {
        if (transcriptKeyRef.current !== key) return;
        setContact(null);
        setMessages([]);
        toast.error(getErrorMessage(err, 'Could not load this conversation'));
      })
      .finally(() => transcriptKeyRef.current === key && setMsgLoading(false));
    // transcriptKey captures the inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcriptKey]);

  const loadPage = useCallback(
    async (which: 'earlier' | 'later') => {
      if (!selectedId) return;
      const key = transcriptKeyRef.current;
      const page = which === 'earlier' ? pages.min - 1 : pages.max + 1;
      setMsgMore(which);
      try {
        const res = await historyService.messages({ contact_id: selectedId, from: fromISO, to: toISO, limit: MSG_PAGE, page });
        if (transcriptKeyRef.current !== key) return;
        const data = readData<HistoryMessagesPage>(res);
        const list = data.messages || [];
        setMessages((prev) => (which === 'earlier' ? [...list, ...prev] : [...prev, ...list]));
        setPages((p) => (which === 'earlier' ? { ...p, min: page } : { ...p, max: page }));
      } catch (err) {
        toast.error(getErrorMessage(err, 'Could not load messages'));
      } finally {
        setMsgMore(null);
      }
    },
    [selectedId, pages, fromISO, toISO]
  );

  const openConversation = (id: string, messageId: string | null = null) => {
    setSelectedId(id);
    setFocusId(messageId);
  };

  const exportTranscript = async (format: ExportFormat) => {
    if (!selectedId) return;
    try {
      const name = await historyService.exportTranscript({ contact_id: selectedId, from: fromISO, to: toISO, format });
      toast.success(`Downloaded ${name}`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Export failed'));
    }
  };

  const activeFilterCount = (tags.length ? 1 : 0) + (assigned ? 1 : 0) + (account ? 1 : 0) + (direction ? 1 : 0);
  const clearFilters = () => {
    setTags([]);
    setAssigned('');
    setAccount('');
    setDirection('');
  };
  const assignedLabel =
    assigned === ''
      ? 'Anyone'
      : assigned === 'me'
        ? 'Assigned to me'
        : assigned === 'unassigned'
          ? 'Unassigned'
          : team.find((m) => m.id === assigned)?.full_name || 'Agent';
  const rangeText = rangeLabel(range);

  // ---- Render ----
  const filterBar = (
    <div className="flex flex-wrap items-center gap-2">
      {/* Range */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={cn(chipBtn, chipActive)}>
            <CalendarDays className="h-3.5 w-3.5" />
            {RANGE_PRESETS.find((p) => p.id === preset)?.label}
            <ChevronDown className="h-3 w-3 opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          {RANGE_PRESETS.map((p) => (
            <DropdownMenuItem key={p.id} onClick={() => setPreset(p.id)} className={cn(preset === p.id && 'font-semibold')}>
              {p.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {preset === 'custom' && (
        <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
          <input
            type="date"
            aria-label="From date"
            value={custom.from}
            max={custom.to || undefined}
            onChange={(e) => e.target.value && setCustom((c) => ({ ...c, from: e.target.value }))}
            className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-800 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-100 dark:[color-scheme:dark]"
          />
          <span>to</span>
          <input
            type="date"
            aria-label="To date"
            value={custom.to}
            min={custom.from || undefined}
            onChange={(e) => e.target.value && setCustom((c) => ({ ...c, to: e.target.value }))}
            className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-800 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-100 dark:[color-scheme:dark]"
          />
        </div>
      )}
      <span className="hidden text-xs text-gray-500 sm:inline dark:text-gray-400">{rangeText}</span>

      <span className="mx-1 hidden h-5 w-px bg-gray-200 sm:block dark:bg-white/10" />

      {/* Tags */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={cn(chipBtn, tags.length > 0 && chipActive)}>
            <TagIcon className="h-3.5 w-3.5" />
            {tags.length ? `${tags.length} label${tags.length > 1 ? 's' : ''}` : 'Labels'}
            <ChevronDown className="h-3 w-3 opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-72 w-52 overflow-y-auto">
          <DropdownMenuLabel>Has any of</DropdownMenuLabel>
          {availableTags.length === 0 && <p className="px-2 py-1.5 text-xs opacity-60">No labels yet</p>}
          {availableTags.map((t) => (
            <DropdownMenuCheckboxItem
              key={t.name}
              checked={tags.includes(t.name)}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={(on) => setTags((prev) => (on ? [...prev, t.name] : prev.filter((x) => x !== t.name)))}
            >
              <span className="mr-2 h-2 w-2 rounded-full" style={{ backgroundColor: tagChipStyle(t.color).color as string }} />
              {t.name}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Assigned */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={cn(chipBtn, assigned && chipActive)}>
            {assignedLabel}
            <ChevronDown className="h-3 w-3 opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-72 w-52 overflow-y-auto">
          <DropdownMenuItem onClick={() => setAssigned('')}>Anyone</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setAssigned('me')}>Assigned to me</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setAssigned('unassigned')}>Unassigned</DropdownMenuItem>
          {team.filter((m) => m.id !== user?.id).length > 0 && <DropdownMenuSeparator />}
          {team
            .filter((m) => m.id !== user?.id)
            .map((m) => (
              <DropdownMenuItem key={m.id} onClick={() => setAssigned(m.id)}>
                {m.full_name}
              </DropdownMenuItem>
            ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* WhatsApp number */}
      {accounts.length > 1 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={cn(chipBtn, account && chipActive)}>
              <MessageCircle className="h-3.5 w-3.5" />
              {account || 'All numbers'}
              <ChevronDown className="h-3 w-3 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuItem onClick={() => setAccount('')}>All numbers</DropdownMenuItem>
            {accounts.map((a) => (
              <DropdownMenuItem key={a.name} onClick={() => setAccount(a.name)}>
                {a.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Direction */}
      <div role="radiogroup" aria-label="Direction" className="inline-flex h-8 rounded-lg border border-gray-200 bg-white p-0.5 dark:border-white/10 dark:bg-white/[0.04]">
        {(
          [
            ['', 'All'],
            ['incoming', 'Incoming'],
            ['outgoing', 'Outgoing'],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v || 'all'}
            type="button"
            role="radio"
            aria-checked={direction === v}
            onClick={() => setDirection(v)}
            className={cn(
              'rounded-md px-2.5 text-xs font-medium transition-colors',
              direction === v
                ? 'bg-emerald-600 text-white'
                : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {activeFilterCount > 0 && (
        <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">
          <X className="h-3 w-3" /> Clear filters
        </button>
      )}
    </div>
  );

  const conversationList = (
    <>
      {convLoading ? (
        <div className="flex flex-1 items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
        </div>
      ) : convs.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 text-gray-500 dark:bg-white/[0.05] dark:text-gray-400">
            <MessagesSquare className="h-6 w-6" />
          </span>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">No conversations in this range</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {activeFilterCount || search ? 'Try clearing filters or picking a wider range.' : 'Try a wider date range.'}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-white/[0.05]">
          {convs.map((c) => {
            const name = c.name || c.phone_number;
            const active = c.contact_id === selectedId;
            return (
              <li key={c.contact_id}>
                <button
                  type="button"
                  onClick={() => openConversation(c.contact_id)}
                  className={cn(
                    'flex w-full gap-3 px-3.5 py-3 text-left transition-colors',
                    active
                      ? 'bg-emerald-50 dark:bg-emerald-500/10'
                      : 'hover:bg-gray-50 dark:hover:bg-white/[0.03]'
                  )}
                >
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{ backgroundColor: getAvatarColor(name) }}
                  >
                    {getInitials(name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-gray-900 dark:text-white">{name}</span>
                      <span className="shrink-0 text-[11px] text-gray-500 dark:text-gray-400">{shortDate(c.last_message_at)}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-gray-600 dark:text-gray-400">
                      {c.last_direction === 'outgoing' && <span className="text-gray-400 dark:text-gray-500">You: </span>}
                      {c.last_message_preview || '—'}
                    </span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center gap-0.5 rounded-md bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 dark:bg-sky-500/10 dark:text-sky-300" title="Incoming in range">
                        <ArrowDownLeft className="h-3 w-3" />
                        {c.incoming_count}
                      </span>
                      <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" title="Outgoing in range">
                        <ArrowUpRight className="h-3 w-3" />
                        {c.outgoing_count}
                      </span>
                      {c.assigned_user_name && (
                        <span className="truncate text-[10px] text-gray-500 dark:text-gray-400">· {c.assigned_user_name}</span>
                      )}
                      {c.tags.slice(0, 2).map((t) => (
                        <span key={t} className="rounded-full border px-1.5 text-[10px] font-medium" style={tagChipStyle(tagColors[t])}>
                          {t}
                        </span>
                      ))}
                      {c.tags.length > 2 && <span className="text-[10px] text-gray-400">+{c.tags.length - 2}</span>}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {!convLoading && convs.length < convTotal && (
        <div className="p-3 text-center">
          <button type="button" onClick={loadMoreConvs} disabled={convMore} className="text-xs font-semibold text-emerald-700 hover:underline disabled:opacity-60 dark:text-emerald-400">
            {convMore ? 'Loading…' : `Show more (${convTotal - convs.length} left)`}
          </button>
        </div>
      )}
    </>
  );

  const hitList = (
    <>
      {hitLoading && hits.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
        </div>
      ) : hits.length === 0 ? (
        <div className="px-6 py-12 text-center text-sm text-gray-500 dark:text-gray-400">No messages contain “{search}” in this range.</div>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-white/[0.05]">
          {hits.map((h) => (
            <li key={h.message_id}>
              <button
                type="button"
                onClick={() => openConversation(h.contact_id, h.message_id)}
                className={cn(
                  'w-full px-3.5 py-3 text-left transition-colors',
                  focusId === h.message_id ? 'bg-amber-50 dark:bg-amber-500/10' : 'hover:bg-gray-50 dark:hover:bg-white/[0.03]'
                )}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1 truncate text-xs font-semibold text-gray-900 dark:text-white">
                    {h.direction === 'incoming' ? (
                      <ArrowDownLeft className="h-3 w-3 shrink-0 text-sky-600" />
                    ) : (
                      <ArrowUpRight className="h-3 w-3 shrink-0 text-emerald-600" />
                    )}
                    {h.contact_name || h.phone_number}
                  </span>
                  <span className="shrink-0 text-[11px] text-gray-500 dark:text-gray-400">
                    {new Date(h.created_at).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                  </span>
                </span>
                <span className="mt-1 line-clamp-2 block text-xs text-gray-600 dark:text-gray-300">
                  {splitHighlight(h.snippet, search).map((p, i) =>
                    p.match ? (
                      <mark key={i} className="rounded bg-amber-200 px-0.5 text-gray-900 dark:bg-amber-400/80">
                        {p.text}
                      </mark>
                    ) : (
                      <React.Fragment key={i}>{p.text}</React.Fragment>
                    )
                  )}
                </span>
                <span className="mt-1 block text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">Jump to message →</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {hits.length > 0 && hits.length < hitTotal && (
        <div className="p-3 text-center">
          <button type="button" onClick={loadMoreHits} disabled={hitLoading} className="text-xs font-semibold text-emerald-700 hover:underline disabled:opacity-60 dark:text-emerald-400">
            {hitLoading ? 'Loading…' : `Show more (${hitTotal - hits.length} left)`}
          </button>
        </div>
      )}
    </>
  );

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-gray-50 dark:bg-[#0c1312]">
      {/* Header */}
      <div className="space-y-3 border-b border-gray-200/80 bg-white px-4 pb-3 pt-3.5 dark:border-white/[0.07] dark:bg-[#111a19]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <Link
              to="/chat"
              className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/10"
              aria-label="Back to Live Chat"
              title="Back to Live Chat"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm">
              <History className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-bold text-gray-900 dark:text-white">Chat History</h1>
              <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">Look back at past conversations by date</p>
            </div>
          </div>
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search messages, names, numbers"
              aria-label="Search chat history"
              className="h-8 w-full rounded-lg border border-gray-200 bg-gray-50 pl-8 pr-7 text-xs text-gray-900 placeholder:text-gray-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
            />
            {searchInput && (
              <button type="button" onClick={() => setSearchInput('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        <div className="flex items-start gap-2">
          <Filter className="mt-2 hidden h-3.5 w-3.5 shrink-0 text-gray-400 sm:block" />
          {filterBar}
        </div>
        {/* Stats strip */}
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <StatCard
            icon={<MessagesSquare className="h-4 w-4" />}
            label="Conversations"
            value={stats ? stats.conversations.toLocaleString() : '—'}
            tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
          />
          <StatCard
            icon={<ArrowDownLeft className="h-4 w-4" />}
            label="Messages in"
            value={stats ? stats.messages_in.toLocaleString() : '—'}
            tone="bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400"
          />
          <StatCard
            icon={<ArrowUpRight className="h-4 w-4" />}
            label="Messages out"
            value={stats ? stats.messages_out.toLocaleString() : '—'}
            tone="bg-teal-50 text-teal-600 dark:bg-teal-500/10 dark:text-teal-400"
          />
          <StatCard
            icon={<Clock className="h-4 w-4" />}
            label="Median first response"
            value={formatDuration(stats?.median_first_response_seconds)}
            tone="bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400"
          />
        </div>
      </div>

      {/* Body: list + transcript */}
      <div className="flex min-h-0 flex-1">
        <aside
          className={cn(
            'min-h-0 w-full shrink-0 flex-col border-r border-gray-200/80 bg-white md:flex md:w-[340px] lg:w-[380px] dark:border-white/[0.07] dark:bg-[#111a19]',
            selectedId ? 'hidden md:flex' : 'flex'
          )}
        >
          {searchable && (
            <div role="tablist" className="m-2 grid grid-cols-2 gap-0.5 rounded-xl bg-gray-100 p-0.5 dark:bg-white/[0.05]">
              {(
                [
                  ['chats', `Chats (${convTotal})`],
                  ['messages', `Messages (${hitTotal})`],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={leftTab === id}
                  onClick={() => setLeftTab(id)}
                  className={cn(
                    'rounded-lg py-1.5 text-xs font-semibold transition-colors',
                    leftTab === id
                      ? 'bg-white text-emerald-700 shadow-sm dark:bg-white/10 dark:text-emerald-300'
                      : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {!searchable && (
            <p className="px-3.5 pb-1 pt-2.5 text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {convTotal} conversation{convTotal === 1 ? '' : 's'}
            </p>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto">{searchable && leftTab === 'messages' ? hitList : conversationList}</div>
        </aside>

        <HistoryTranscript
          className={cn('min-w-0 flex-1', selectedId ? 'flex' : 'hidden md:flex')}
          contact={contact}
          messages={messages}
          total={msgTotal}
          loading={msgLoading}
          loadingMore={msgMore}
          canLoadEarlier={pages.min > 1}
          canLoadLater={pages.max * MSG_PAGE < msgTotal}
          onLoadEarlier={() => loadPage('earlier')}
          onLoadLater={() => loadPage('later')}
          focusId={focusId}
          highlight={searchable ? search : ''}
          rangeText={rangeText}
          onBack={() => {
            setSelectedId(null);
            setFocusId(null);
          }}
          onExport={exportTranscript}
        />
      </div>
    </div>
  );
};

export default ChatHistoryView;
