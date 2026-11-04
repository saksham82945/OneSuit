import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { MessageCircle } from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import {
  cannedResponsesService,
  contactsService,
  messagesService,
  notesService,
  tagsService,
  usersService,
  type CannedResponse,
  type ConversationNote,
  type Tag,
} from '@/services/api';
import { readData, readList, readTotal } from '@/services/response';
import { cn } from '@/lib/utils';
import {
  type Contact,
  type InboxCounts,
  type InboxView,
  type Message,
  type TeamMember,
  getErrorMessage,
  inboxParams,
  inboxService,
  readCounts,
} from './chatUtils';
import { InboxList } from './InboxList';
import { ConversationPane } from './ConversationPane';
import { ContactPanel } from './ContactPanel';

const PAGE_SIZE = 50;
const POLL_MS = 5000;
const SHOW_ALL_KEY = 'onesuit-chat-show-all';

const readPref = (key: string, fallback: boolean) => {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === 'true';
  } catch {
    return fallback;
  }
};

const isDesktop = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches;
const isWide = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1280px)').matches;

export const ChatView: React.FC = () => {
  const { contactId } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  // Inbox filters
  const [view, setView] = useState<InboxView>('all');
  const [showAll, setShowAll] = useState(() => readPref(SHOW_ALL_KEY, false));
  const [labels, setLabels] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Inbox data
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [counts, setCounts] = useState<InboxCounts | null>(null);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Open conversation
  const [opened, setOpened] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [notes, setNotes] = useState<ConversationNote[]>([]);
  const [panel, setPanel] = useState<'info' | 'notes' | null>(() => (isWide() ? 'info' : null));

  // Lookups
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [canned, setCanned] = useState<CannedResponse[]>([]);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(id);
  }, [search]);

  useEffect(() => {
    try {
      localStorage.setItem(SHOW_ALL_KEY, String(showAll));
    } catch {
      // Preference only.
    }
  }, [showAll]);

  useEffect(() => {
    tagsService
      .list({ limit: 100 })
      .then((res) => setAvailableTags(readList<Tag>(res, 'tags')))
      .catch(() => {});
    usersService
      .list({ limit: 100 })
      .then((res) => setTeam(readList<TeamMember>(res, 'users')))
      .catch(() => {}); // Agents without users:read can still assign to themselves.
    cannedResponsesService
      .list({ active_only: 'true', limit: 100 })
      .then((res) => setCanned(readList<CannedResponse>(res, 'canned_responses')))
      .catch(() => {});
  }, []);

  const tagColors = useMemo(() => {
    const map: Record<string, string> = {};
    for (const t of availableTags) map[t.name] = t.color;
    return map;
  }, [availableTags]);

  const teamNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of team) map[m.id] = m.full_name;
    if (user) map[user.id] = user.full_name || 'You';
    return map;
  }, [team, user]);

  // ---- Inbox loading (filters → first page; polling refreshes what's loaded) ----
  const filterKey = JSON.stringify({ view, showAll, labels, q: debouncedSearch });
  const filterKeyRef = useRef(filterKey);
  filterKeyRef.current = filterKey;
  const pagesRef = useRef(pages);
  pagesRef.current = pages;

  const fetchInbox = useCallback(
    async (opts: { page?: number; limit?: number } = {}) => {
      const key = filterKeyRef.current;
      const res = await inboxService.list(
        inboxParams({ view, showAll, labels, search: debouncedSearch, page: opts.page, limit: opts.limit })
      );
      // Filters changed while this was in flight: drop it.
      if (key !== filterKeyRef.current) return null;
      return { list: readList<Contact>(res, 'contacts'), total: readTotal(res, 'contacts'), counts: readCounts(res) };
    },
    [view, showAll, labels, debouncedSearch]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPages(1);
    fetchInbox({ page: 1, limit: PAGE_SIZE })
      .then((r) => {
        if (!r || cancelled) return;
        setContacts(r.list);
        setTotal(r.total);
        setCounts(r.counts);
      })
      .catch((err) => !cancelled && toast.error(getErrorMessage(err, 'Failed to load conversations')))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [fetchInbox]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const next = pages + 1;
      const r = await fetchInbox({ page: next, limit: PAGE_SIZE });
      if (!r) return;
      setContacts((prev) => [...prev, ...r.list.filter((c) => !prev.some((p) => p.id === c.id))]);
      setTotal(r.total);
      setCounts(r.counts);
      setPages(next);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load more chats'));
    } finally {
      setLoadingMore(false);
    }
  };

  // ---- Selected conversation ----
  const listed = contacts.find((c) => c.id === contactId);
  const selected: Contact | null = listed || (opened?.id === contactId ? opened : null);

  // A chat opened by link that the current filters don't list.
  useEffect(() => {
    if (!contactId || contacts.some((c) => c.id === contactId) || opened?.id === contactId) return;
    let cancelled = false;
    contactsService
      .get(contactId)
      .then((res) => {
        const c = readData<Contact>(res);
        if (!cancelled && c?.id) setOpened(c);
      })
      .catch(() => !cancelled && toast.error('That conversation is not available'));
    return () => {
      cancelled = true;
    };
  }, [contactId, contacts, opened?.id]);

  // Desktop opens the newest chat when none is chosen.
  useEffect(() => {
    if (!contactId && !loading && contacts.length > 0 && isDesktop()) {
      navigate(`/chat/${contacts[0].id}`, { replace: true });
    }
  }, [contactId, loading, contacts, navigate]);

  const selectedId = selected?.id;
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setMessages([]);
    setNotes([]);
    setLoadingMessages(true);
    messagesService
      .list(selectedId)
      .then((res) => {
        if (cancelled) return;
        setMessages(readList<Message>(res, 'messages'));
        setContacts((prev) => prev.map((c) => (c.id === selectedId ? { ...c, unread_count: 0 } : c)));
      })
      .catch((err) => !cancelled && toast.error(getErrorMessage(err, 'Failed to load messages')))
      .finally(() => !cancelled && setLoadingMessages(false));
    notesService
      .list(selectedId)
      .then((res) => !cancelled && setNotes(readList<ConversationNote>(res, 'notes').reverse()))
      .catch(() => {});
    contactsService.markRead(selectedId).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const reloadMessages = useCallback(async () => {
    if (!selectedId) return;
    try {
      const list = readList<Message>(await messagesService.list(selectedId), 'messages');
      setMessages((prev) => {
        const a = prev[prev.length - 1];
        const b = list[list.length - 1];
        const same =
          prev.length === list.length &&
          a?.id === b?.id &&
          a?.status === b?.status &&
          JSON.stringify(prev.map((m) => m.reactions?.length || 0)) === JSON.stringify(list.map((m) => m.reactions?.length || 0));
        return same ? prev : list;
      });
    } catch {
      // Next tick retries.
    }
  }, [selectedId]);

  // ---- Polling (Vercel can't proxy WebSockets, so the inbox polls) ----
  useEffect(() => {
    let busy = false;
    const tick = async () => {
      if (busy || document.visibilityState !== 'visible') return;
      busy = true;
      try {
        const r = await fetchInbox({ page: 1, limit: Math.min(100, PAGE_SIZE * pagesRef.current) });
        if (r) {
          setContacts((prev) => {
            const keep = prev.filter((c) => !r.list.some((f) => f.id === c.id) && pagesRef.current > 2);
            return [
              ...r.list.map((c) => (c.id === selectedId ? { ...c, unread_count: 0 } : c)),
              ...keep,
            ];
          });
          setTotal(r.total);
          setCounts(r.counts);
        }
        await reloadMessages();
      } catch {
        // Try again on the next tick.
      } finally {
        busy = false;
      }
    };
    const id = window.setInterval(tick, POLL_MS);
    const onVisible = () => document.visibilityState === 'visible' && void tick();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fetchInbox, reloadMessages, selectedId]);

  const patchContact = (id: string, patch: Partial<Contact>) => {
    setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    setOpened((prev) => (prev && prev.id === id ? { ...prev, ...patch } : prev));
  };

  const onMessageSent = (m: Message, preview: string) => {
    setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
    if (selectedId) patchContact(selectedId, { last_message_preview: preview, last_message_at: m.created_at || new Date().toISOString() });
    // Failed sends come back with status "failed"; refresh shortly to pick up the final status.
    window.setTimeout(() => void reloadMessages(), 1500);
  };

  const assigneeName = selected?.assigned_user_id
    ? selected.assigned_user_id === user?.id
      ? 'Assigned to you'
      : `Assigned to ${teamNames[selected.assigned_user_id] || 'a teammate'}`
    : 'Unassigned';

  return (
    <div className="relative flex h-full w-full overflow-hidden bg-white dark:bg-[#0c1312]">
      <InboxList
        className={cn(
          'w-full shrink-0 border-r border-gray-200/80 md:flex md:w-[330px] lg:w-[360px] dark:border-white/[0.07]',
          contactId ? 'hidden md:flex' : 'flex'
        )}
        contacts={contacts}
        counts={counts}
        total={total}
        loading={loading}
        selectedId={selectedId}
        view={view}
        onViewChange={setView}
        showAll={showAll}
        onShowAllChange={setShowAll}
        labels={labels}
        onLabelsChange={setLabels}
        availableTags={availableTags}
        tagColors={tagColors}
        search={search}
        onSearchChange={setSearch}
        onSelect={(c) => navigate(`/chat/${c.id}`)}
        onLoadMore={loadMore}
        loadingMore={loadingMore}
        teamNames={teamNames}
        currentUserId={user?.id}
      />

      {selected ? (
        <ConversationPane
          key={selected.id}
          className={cn('flex-1', contactId ? 'flex' : 'hidden md:flex')}
          contact={selected}
          messages={messages}
          loadingMessages={loadingMessages}
          onMessageSent={onMessageSent}
          onReload={() => void reloadMessages()}
          notesCount={notes.length}
          panel={panel}
          onTogglePanel={(p) => setPanel((cur) => (cur === p ? null : p))}
          onBack={() => navigate('/chat')}
          cannedResponses={canned}
          assigneeName={assigneeName}
        />
      ) : (
        <div className={cn('bg-whatsapp-doodle flex-1 flex-col items-center justify-center p-6 text-center', contactId ? 'flex' : 'hidden md:flex')}>
          <div className="rounded-3xl bg-white/90 px-8 py-7 shadow-sm dark:bg-[#17211f]/90">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-white">
              <MessageCircle className="h-6 w-6" />
            </span>
            <p className="mt-3 text-sm font-semibold text-gray-800 dark:text-gray-100">
              {contactId ? 'Opening conversation…' : 'Pick a chat to start'}
            </p>
            <p className="mt-1 max-w-xs text-xs text-gray-500 dark:text-gray-400">
              Reply to customers, assign chats to your team and label leads — all from one inbox.
            </p>
          </div>
        </div>
      )}

      {selected && panel && (
        <>
          {/* Below xl the panel slides over the conversation. */}
          <div className="absolute inset-0 z-30 bg-black/30 xl:hidden" onClick={() => setPanel(null)} aria-hidden />
          <ContactPanel
            className="absolute inset-y-0 right-0 z-40 w-full max-w-[340px] border-l border-gray-200/80 shadow-2xl xl:static xl:z-auto xl:w-[320px] xl:shadow-none dark:border-white/[0.07]"
            contact={selected}
            team={team}
            currentUser={user}
            availableTags={availableTags}
            tagColors={tagColors}
            notes={notes}
            onNotesChange={setNotes}
            onContactChange={(patch) => patchContact(selected.id, patch)}
            initialTab={panel}
            onClose={() => setPanel(null)}
          />
        </>
      )}
    </div>
  );
};

export default ChatView;
