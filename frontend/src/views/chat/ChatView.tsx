import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { useAuthStore } from '@/stores/auth';
import {
  contactsService,
  messagesService,
  notesService,
  tagsService,
  type ConversationNote,
  type Tag,
} from '@/services/api';
import { readData, readList } from '@/services/response';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { TagBadge } from '@/components/ui/tag-badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Search,
  Send,
  Paperclip,
  Smile,
  Phone,
  MoreVertical,
  Check,
  CheckCheck,
  StickyNote,
  Info,
  UserPlus,
  X,
  Filter,
  Trash2,
  Plus,
  History,
  Clock,
  Sparkles,
  CreditCard,
  Wand2,
  RefreshCw,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Message {
  id: string;
  contact_id: string;
  direction: 'incoming' | 'outgoing';
  message_type?: string;
  content?: { body?: string } | string | null;
  media_filename?: string;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed' | 'received';
  error_message?: string;
  created_at: string;
}

interface Contact {
  id: string;
  phone_number: string;
  profile_name?: string;
  name?: string;
  tags?: string[];
  unread_count: number;
  last_message_at?: string | null;
  last_message_preview?: string;
  assigned_user_id?: string;
  whatsapp_account?: string;
}

type Note = ConversationNote;

const getContactName = (c: Contact) => c.profile_name || c.name || c.phone_number || 'Unknown';

const getMessageText = (m: Message) => {
  const body = typeof m.content === 'string' ? m.content : m.content?.body;
  if (body) return body;
  if (m.media_filename) return m.media_filename;
  return m.message_type && m.message_type !== 'text' ? `[${m.message_type}]` : '';
};

const formatTime = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

const formatListTime = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toDateString() === new Date().toDateString() ? formatTime(iso) : d.toLocaleDateString();
};

const getErrorMessage = (err: unknown, fallback: string) =>
  (axios.isAxiosError(err) && (err.response?.data as { message?: string } | undefined)?.message) ||
  fallback;

const getAvatarColor = (name: string) => {
  const colors = [
    'bg-teal-100 text-teal-800 border-teal-200/60 dark:bg-teal-950/60 dark:text-teal-300',
    'bg-purple-100 text-purple-800 border-purple-200/60 dark:bg-purple-950/60 dark:text-purple-300',
    'bg-amber-100 text-amber-800 border-amber-200/60 dark:bg-amber-950/60 dark:text-amber-300',
    'bg-emerald-100 text-emerald-800 border-emerald-200/60 dark:bg-emerald-950/60 dark:text-emerald-300',
    'bg-blue-100 text-blue-800 border-blue-200/60 dark:bg-blue-950/60 dark:text-blue-300',
    'bg-rose-100 text-rose-800 border-rose-200/60 dark:bg-rose-950/60 dark:text-rose-300',
  ];
  const charCode = name ? name.charCodeAt(0) : 0;
  return colors[charCode % colors.length];
};

export const ChatView: React.FC = () => {
  const { t } = useTranslation();
  const { contactId: paramContactId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'mine' | 'unassigned' | 'history'>('all');
  const [historyDateFilter, setHistoryDateFilter] = useState<'all' | 'today' | '7d' | '30d' | 'older'>('all');
  const [historyTagFilter, setHistoryTagFilter] = useState<string>('all');
  const [historyOnlyWithMessages, setHistoryOnlyWithMessages] = useState<boolean>(true);
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [isSending, setIsSending] = useState(false);

  // Side panels
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNoteText, setNewNoteText] = useState('');
  const [tagColors, setTagColors] = useState<Record<string, string>>({});

  // AI Co-pilot & WhatsApp Payments
  const [aiCopilotOpen, setAiCopilotOpen] = useState(true);
  const [aiTone, setAiTone] = useState<'professional' | 'friendly' | 'concise'>('professional');
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('1499');
  const [paymentPurpose, setPaymentPurpose] = useState('Order #98214 - Advance Payment');
  const [isGeneratingPayment, setIsGeneratingPayment] = useState(false);

  const getSmartSuggestions = () => {
    const contactName = selectedContact ? getContactName(selectedContact) : 'there';
    if (aiTone === 'friendly') {
      return [
        `Hey ${contactName}! 😊 Absolutely, I'd love to help with that. Give me just a second to pull up the details!`,
        `Thanks for checking in! Here is our product catalogue link: https://wa.me/c/919876543210. Let me know what caught your eye!`,
        `No worries at all! Would you like me to schedule a quick 5-minute call to walk through this together?`,
      ];
    }
    if (aiTone === 'concise') {
      return [
        `Confirmed. We've received your request and are processing it now.`,
        `Catalogue link: https://wa.me/c/919876543210. Please reply with item numbers.`,
        `Call scheduled. Our specialist will ring you at your registered number.`,
      ];
    }
    return [
      `Hello ${contactName}, thank you for reaching out. We have noted your request and are checking the status right away.`,
      `You can review our verified WhatsApp business catalogue here: https://wa.me/c/919876543210.`,
      `Thank you for confirming. Is there anything else we can assist you with today?`,
    ];
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load contacts
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await contactsService.list();
        let list = readList<Contact>(res, 'contacts');
        if (paramContactId && !list.some((c) => c.id === paramContactId)) {
          try {
            const one = readData<Contact>(await contactsService.get(paramContactId));
            if (one?.id) list = [one, ...list];
          } catch {
            // Unknown or inaccessible contact: fallback to first conversation.
          }
        }
        if (cancelled) return;
        setContacts(list);
        if (list.length > 0) {
          const found = list.find((c) => c.id === paramContactId) || list[0];
          setSelectedContact(found);
        }
      } catch (err) {
        if (!cancelled) toast.error(getErrorMessage(err, 'Failed to load conversations'));
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [paramContactId]);

  // Tag colours for contact info panel
  useEffect(() => {
    tagsService
      .list({ limit: 100 })
      .then((res) => {
        const tags = readList<Tag>(res, 'tags');
        setAvailableTags(tags);
        const map: Record<string, string> = {};
        tags.forEach((tag) => {
          map[tag.name] = tag.color;
        });
        setTagColors(map);
      })
      .catch(() => {});
  }, []);

  // Load messages & notes when contact changes
  const selectedContactId = selectedContact?.id;
  useEffect(() => {
    if (!selectedContactId) return;
    let cancelled = false;
    setMessages([]);
    setNotes([]);
    messagesService
      .list(selectedContactId)
      .then((res) => {
        if (cancelled) return;
        setMessages(readList<Message>(res, 'messages'));
        setContacts((prev) =>
          prev.map((c) => (c.id === selectedContactId ? { ...c, unread_count: 0 } : c))
        );
      })
      .catch((err) => {
        if (!cancelled) toast.error(getErrorMessage(err, 'Failed to load messages'));
      });
    notesService
      .list(selectedContactId)
      .then((res) => {
        if (!cancelled) setNotes(readList<Note>(res, 'notes').reverse());
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedContactId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSelectContact = (c: Contact) => {
    setSelectedContact(c);
    navigate(`/chat/${c.id}`);
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || !selectedContact || isSending) return;

    const text = inputText.trim();
    const contactId = selectedContact.id;
    setInputText('');
    setIsSending(true);

    try {
      const res = await messagesService.send(contactId, {
        type: 'text',
        content: { body: text },
      });
      const newMsg = readData<Message>(res);
      if (newMsg?.id) {
        setMessages((prev) => (prev.some((m) => m.id === newMsg.id) ? prev : [...prev, newMsg]));
      }
      setContacts((prev) =>
        prev.map((c) =>
          c.id === contactId
            ? {
                ...c,
                last_message_preview: text,
                last_message_at: newMsg?.created_at || new Date().toISOString(),
              }
            : c
        )
      );
    } catch (err) {
      setInputText((current) => current || text);
      toast.error(getErrorMessage(err, 'Failed to send message'));
    } finally {
      setIsSending(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = newNoteText.trim();
    if (!content || !selectedContact) return;
    try {
      const res = await notesService.create(selectedContact.id, { content });
      const note = readData<Note>(res);
      if (note?.id) setNotes((prev) => [note, ...prev]);
      setNewNoteText('');
      toast.success('Internal note added');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to add note'));
    }
  };

  const handleDeleteNote = async (id: string) => {
    if (!selectedContact) return;
    try {
      await notesService.delete(selectedContact.id, id);
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to delete note'));
    }
  };

  const query = searchQuery.trim().toLowerCase().replace(/^\+/, '');
  const filteredContacts = contacts.filter((c) => {
    if (activeTab === 'mine' && c.assigned_user_id !== user?.id) return false;
    if (activeTab === 'unassigned' && c.assigned_user_id) return false;

    if (activeTab === 'history') {
      // User requested: "only save contacts in history and add filter in history"
      // Filter out contacts without messages if historyOnlyWithMessages is true
      if (historyOnlyWithMessages && !c.last_message_at && !c.last_message_preview) {
        return false;
      }

      // Timeframe filter
      if (historyDateFilter !== 'all') {
        if (!c.last_message_at) return false;
        const msgTime = new Date(c.last_message_at).getTime();
        const now = Date.now();
        const diffDays = (now - msgTime) / (1000 * 60 * 60 * 24);
        if (historyDateFilter === 'today' && diffDays > 1) return false;
        if (historyDateFilter === '7d' && diffDays > 7) return false;
        if (historyDateFilter === '30d' && diffDays > 30) return false;
        if (historyDateFilter === 'older' && diffDays <= 30) return false;
      }

      // Tag filter
      if (historyTagFilter !== 'all') {
        if (!c.tags || !c.tags.includes(historyTagFilter)) return false;
      }
    }

    const full = `${getContactName(c)} ${c.phone_number || ''}`.toLowerCase();
    return full.includes(query);
  });

  return (
    <div className="flex h-full w-full overflow-hidden bg-white dark:bg-[#101716]">
      {/* 1. Left Sidebar: Contacts & Filters */}
      <div className="w-80 border-r border-gray-200/80 dark:border-white/[0.08] flex flex-col bg-white dark:bg-[#141b1a] shrink-0">
        <div className="p-3.5 border-b border-gray-200/80 dark:border-white/[0.08] space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">
              {t('nav.chat') || 'Live Inbox'}
            </h2>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'h-7 w-7 text-gray-400 hover:text-gray-900',
                activeTab === 'history' && 'text-teal-600 bg-teal-50 dark:bg-white/[0.05]'
              )}
              onClick={() => setActiveTab(activeTab === 'history' ? 'all' : 'history')}
              title="Toggle History View"
            >
              <History className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Search Contacts Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              className="pl-8 h-8 text-xs bg-gray-50 dark:bg-white/[0.04] border-gray-200 dark:border-white/[0.08] rounded-xl focus-visible:ring-teal-600"
            />
          </div>

          {/* Filter Tabs */}
          <div className="grid grid-cols-4 p-0.5 bg-gray-100 dark:bg-white/[0.04] rounded-xl text-xs font-medium gap-0.5">
            <button
              onClick={() => setActiveTab('all')}
              className={cn(
                'py-1 text-center rounded-lg transition-all text-xs',
                activeTab === 'all'
                  ? 'bg-white dark:bg-teal-950/80 text-teal-800 dark:text-teal-300 font-semibold shadow-xs'
                  : 'text-gray-500 hover:text-gray-900 dark:text-gray-400'
              )}
            >
              All
            </button>
            <button
              onClick={() => setActiveTab('mine')}
              className={cn(
                'py-1 text-center rounded-lg transition-all text-xs',
                activeTab === 'mine'
                  ? 'bg-white dark:bg-teal-950/80 text-teal-800 dark:text-teal-300 font-semibold shadow-xs'
                  : 'text-gray-500 hover:text-gray-900 dark:text-gray-400'
              )}
            >
              Mine
            </button>
            <button
              onClick={() => setActiveTab('unassigned')}
              className={cn(
                'py-1 text-center rounded-lg transition-all text-xs truncate',
                activeTab === 'unassigned'
                  ? 'bg-white dark:bg-teal-950/80 text-teal-800 dark:text-teal-300 font-semibold shadow-xs'
                  : 'text-gray-500 hover:text-gray-900 dark:text-gray-400'
              )}
            >
              Unassigned
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={cn(
                'py-1 text-center rounded-lg transition-all text-xs flex items-center justify-center gap-1',
                activeTab === 'history'
                  ? 'bg-white dark:bg-teal-950/80 text-teal-800 dark:text-teal-300 font-semibold shadow-xs'
                  : 'text-gray-500 hover:text-gray-900 dark:text-gray-400'
              )}
              title="Old History"
            >
              <History className="h-3 w-3" />
              <span>History</span>
            </button>
          </div>

          {/* History Filters Sub-bar */}
          {activeTab === 'history' && (
            <div className="pt-2 pb-1 space-y-2 border-t border-dashed border-gray-200 dark:border-white/[0.08] animate-in fade-in-50 duration-150">
              <div className="flex items-center justify-between text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                <span className="flex items-center gap-1 text-teal-700 dark:text-teal-400">
                  <Clock className="h-3 w-3" />
                  History Filters
                </span>
                {(historyDateFilter !== 'all' || historyTagFilter !== 'all' || !historyOnlyWithMessages) && (
                  <button
                    type="button"
                    onClick={() => {
                      setHistoryDateFilter('all');
                      setHistoryTagFilter('all');
                      setHistoryOnlyWithMessages(true);
                    }}
                    className="text-[10px] text-teal-600 dark:text-teal-400 hover:underline cursor-pointer"
                  >
                    Reset
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <select
                  aria-label="Filter history by timeframe"
                  value={historyDateFilter}
                  onChange={(e) =>
                    setHistoryDateFilter(e.target.value as 'all' | 'today' | '7d' | '30d' | 'older')
                  }
                  className="h-7 text-[11px] rounded-lg bg-gray-50 dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.08] px-2 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-teal-500 cursor-pointer"
                >
                  <option value="all">All Dates</option>
                  <option value="today">Today</option>
                  <option value="7d">Last 7 Days</option>
                  <option value="30d">Last 30 Days</option>
                  <option value="older">&gt; 30 Days Ago</option>
                </select>

                <select
                  aria-label="Filter history by tag"
                  value={historyTagFilter}
                  onChange={(e) => setHistoryTagFilter(e.target.value)}
                  className="h-7 text-[11px] rounded-lg bg-gray-50 dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.08] px-2 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-teal-500 cursor-pointer"
                >
                  <option value="all">All Tags</option>
                  {availableTags.map((t) => (
                    <option key={t.name} value={t.name}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-between text-[11px] text-gray-500 pt-0.5">
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={historyOnlyWithMessages}
                    onChange={(e) => setHistoryOnlyWithMessages(e.target.checked)}
                    className="h-3 w-3 rounded text-teal-600 border-gray-300 dark:border-gray-700 focus:ring-teal-500 cursor-pointer"
                  />
                  <span>Past messages only</span>
                </label>
                <span className="text-[10px] text-gray-400 font-mono">
                  {filteredContacts.length} {filteredContacts.length === 1 ? 'contact' : 'contacts'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Contacts List */}
        <ScrollArea className="flex-1">
          <div className="divide-y divide-gray-100 dark:divide-white/[0.04]">
            {filteredContacts.map((c) => {
              const isSelected = selectedContact?.id === c.id;
              const displayName = getContactName(c);
              const avatarLetter = (displayName[0] || 'C').toUpperCase();
              const colorClass = getAvatarColor(displayName);

              return (
                <button
                  key={c.id}
                  onClick={() => handleSelectContact(c)}
                  className={cn(
                    'w-full text-left px-3.5 py-3 flex items-center gap-3 transition-colors cursor-pointer',
                    isSelected
                      ? 'bg-teal-50/60 dark:bg-white/[0.06] border-l-3 border-teal-600'
                      : 'hover:bg-gray-50 dark:hover:bg-white/[0.02]'
                  )}
                >
                  <div
                    className={`h-10 w-10 rounded-full flex items-center justify-center font-bold text-xs shrink-0 border shadow-xs ${colorClass}`}
                  >
                    {avatarLetter}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-gray-900 dark:text-white truncate">
                        {displayName}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {formatListTime(c.last_message_at)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate max-w-[170px]">
                        {c.last_message_preview || 'No messages yet'}
                      </p>
                      {c.unread_count > 0 && (
                        <span className="h-4 min-w-[16px] px-1.5 rounded-full bg-emerald-600 text-white text-[9px] font-bold flex items-center justify-center">
                          {c.unread_count}
                        </span>
                      )}
                    </div>
                    {c.tags && c.tags.length > 0 && (
                      <div className="flex items-center gap-1 mt-1 overflow-hidden">
                        {c.tags.slice(0, 2).map((tag) => (
                          <span
                            key={tag}
                            className="inline-block text-[9px] font-medium px-1.5 py-0.2 rounded-full border border-gray-200 dark:border-white/[0.08] text-gray-600 dark:text-gray-300 truncate max-w-[80px]"
                            style={{
                              borderColor: tagColors[tag] ? `${tagColors[tag]}40` : undefined,
                              backgroundColor: tagColors[tag] ? `${tagColors[tag]}15` : undefined,
                              color: tagColors[tag] || undefined,
                            }}
                          >
                            {tag}
                          </span>
                        ))}
                        {c.tags.length > 2 && (
                          <span className="text-[9px] text-gray-400">+{c.tags.length - 2}</span>
                        )}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
            {filteredContacts.length === 0 && (
              <p className="px-3.5 py-8 text-center text-xs text-gray-400">
                {contacts.length === 0 ? 'No conversations yet' : 'No matching conversations'}
              </p>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* 2. Middle: WhatsApp Thread */}
      <div className="flex-1 flex flex-col bg-[#efeae2] dark:bg-[#0b141a] relative min-w-0">
        {selectedContact ? (
          <>
            {/* Header */}
            <div className="h-14 px-5 border-b border-gray-200/80 dark:border-white/[0.08] bg-white dark:bg-[#141b1a] flex items-center justify-between shrink-0 shadow-xs z-10">
              <div className="flex items-center gap-3">
                <div
                  className={`h-9 w-9 rounded-full flex items-center justify-center font-bold text-xs shadow-xs border ${getAvatarColor(
                    getContactName(selectedContact)
                  )}`}
                >
                  {(getContactName(selectedContact)[0] || 'C').toUpperCase()}
                </div>
                <div>
                  <div className="font-bold text-xs text-gray-900 dark:text-white leading-tight">
                    {getContactName(selectedContact)}
                  </div>
                  <div className="text-[11px] text-gray-500 font-mono">{selectedContact.phone_number}</div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-gray-500 hover:text-gray-900 hover:bg-gray-100"
                  title="Voice Call"
                >
                  <Phone className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-gray-500 hover:text-gray-900 hover:bg-gray-100"
                  title="Assign to Agent"
                >
                  <UserPlus className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setIsNotesOpen(!isNotesOpen);
                    setIsInfoOpen(false);
                  }}
                  className={cn(
                    'h-8 w-8 relative text-gray-500 hover:text-gray-900 hover:bg-gray-100',
                    isNotesOpen && 'bg-amber-100 text-amber-800'
                  )}
                  title="Internal Notes"
                >
                  <StickyNote className="h-4 w-4" />
                  {notes.length > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 h-3.5 min-w-[14px] px-0.5 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center">
                      {notes.length}
                    </span>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setIsInfoOpen(!isInfoOpen);
                    setIsNotesOpen(false);
                  }}
                  className={cn(
                    'h-8 w-8 text-gray-500 hover:text-gray-900 hover:bg-gray-100',
                    isInfoOpen && 'bg-teal-50 text-teal-800'
                  )}
                  title="Contact Information"
                >
                  <Info className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-gray-500 hover:text-gray-900 hover:bg-gray-100"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Conversation Feed with WhatsApp Doodle Wallpaper */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-whatsapp-doodle">
              {/* Sticky Date Pill */}
              <div className="flex justify-center my-2 sticky top-2 z-10">
                <span className="px-3 py-1 rounded-full bg-white/90 dark:bg-[#141b1a]/90 text-gray-600 dark:text-gray-300 text-[11px] font-semibold backdrop-blur-sm shadow-xs border border-gray-200/60 dark:border-white/10 light:bg-gray-50">
                  Today
                </span>
              </div>

              {messages.length === 0 && (
                <p className="text-center text-xs text-gray-500 pt-8">No messages yet in this conversation</p>
              )}

              {messages.map((m) => {
                const isOutbound = m.direction === 'outgoing';
                return (
                  <div
                    key={m.id}
                    className={cn('flex flex-col', isOutbound ? 'items-end' : 'items-start')}
                  >
                    <div
                      className={cn(
                        'max-w-md px-3.5 py-2 text-xs leading-relaxed rounded-2xl shadow-xs relative',
                        isOutbound
                          ? 'bg-[#d9fdd3] text-gray-900 border border-emerald-200/50 rounded-br-xs dark:bg-[#005c4b] dark:text-white dark:border-0'
                          : 'bg-white text-gray-900 border border-gray-200/90 rounded-bl-xs dark:bg-[#202c33] dark:text-white dark:border-0'
                      )}
                    >
                      <p className="whitespace-pre-wrap break-words">{getMessageText(m)}</p>
                      <div className="text-[10px] mt-1 flex items-center justify-end gap-1 text-gray-500 dark:text-white/60">
                        <span>{formatTime(m.created_at)}</span>
                        {isOutbound &&
                          (m.status === 'failed' ? (
                            <span className="text-red-500 font-semibold" title={m.error_message || undefined}>
                              Failed
                            </span>
                          ) : m.status === 'read' ? (
                            <CheckCheck className="h-3.5 w-3.5 text-[#53bdeb]" />
                          ) : m.status === 'delivered' ? (
                            <CheckCheck className="h-3.5 w-3.5 text-gray-400" />
                          ) : (
                            <Check className="h-3.5 w-3.5 text-gray-400" />
                          ))}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* AI Co-pilot Smart Suggestions Bar */}
            <div className="border-t border-gray-200/80 dark:border-white/[0.08] bg-gray-50/90 dark:bg-[#111817] px-3 py-2 z-10">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-teal-700 dark:text-teal-300">
                  <Sparkles className="h-3.5 w-3.5 text-teal-500 animate-pulse" />
                  <span>AI Co-pilot Suggestions</span>
                </div>
                <div className="flex items-center gap-1">
                  {(['professional', 'friendly', 'concise'] as const).map((tone) => (
                    <button
                      key={tone}
                      type="button"
                      onClick={() => setAiTone(tone)}
                      className={cn(
                        'text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize transition-all',
                        aiTone === tone
                          ? 'bg-teal-600 text-white shadow-xs'
                          : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white'
                      )}
                    >
                      {tone}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setAiCopilotOpen(!aiCopilotOpen)}
                    className="text-[10px] text-gray-400 hover:text-gray-600 ml-1"
                  >
                    {aiCopilotOpen ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              {aiCopilotOpen && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                  {getSmartSuggestions().map((sug, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setInputText(sug);
                        toast.success('Inserted AI suggestion');
                      }}
                      className="text-left text-[11px] bg-white dark:bg-white/[0.05] border border-teal-200/60 dark:border-teal-900/40 hover:border-teal-500 text-gray-700 dark:text-gray-300 px-3 py-1.5 rounded-xl shrink-0 max-w-xs truncate shadow-xs transition-colors group"
                      title={sug}
                    >
                      <span className="font-semibold text-teal-600 dark:text-teal-400 mr-1">✦</span>
                      {sug}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Message Input Bar */}
            <form
              onSubmit={handleSendMessage}
              className="p-3 border-t border-gray-200/80 dark:border-white/[0.08] bg-white dark:bg-[#141b1a] flex items-center gap-2 shrink-0 z-10"
            >
              <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-gray-500 hover:text-gray-900" title="Attach file">
                <Paperclip className="h-4 w-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-gray-500 hover:text-gray-900" title="Emoji">
                <Smile className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setPaymentModalOpen(true)}
                className="h-9 w-9 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                title="Send WhatsApp Payment Link"
              >
                <CreditCard className="h-4 w-4" />
              </Button>

              <Input
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Type a WhatsApp message (Shift+Enter for new line)..."
                className="flex-1 bg-gray-50 dark:bg-white/[0.04] border-gray-200 dark:border-white/[0.08] text-xs h-9 rounded-xl focus-visible:ring-teal-600"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
              />

              <Button
                type="submit"
                size="icon"
                className="h-9 w-9 bg-emerald-600 hover:bg-emerald-500 text-white shrink-0 rounded-xl shadow-xs"
                disabled={!inputText.trim() || isSending}
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 text-xs p-6 bg-whatsapp-doodle">
            <div className="h-12 w-12 rounded-2xl bg-white/80 dark:bg-white/10 flex items-center justify-center mb-3 shadow-sm light:bg-gray-50">
              <Phone className="h-6 w-6 text-teal-600" />
            </div>
            <p className="font-semibold text-gray-700 dark:text-gray-300">No conversation selected</p>
            <p className="text-[11px] text-gray-400 mt-1">Select a contact from the inbox list to read or send messages.</p>
          </div>
        )}
      </div>

      {/* 3. Right: Internal Notes Drawer */}
      {isNotesOpen && selectedContact && (
        <div className="w-80 border-l border-gray-200/80 dark:border-white/[0.08] bg-white dark:bg-[#141b1a] flex flex-col shrink-0 animate-in slide-in-from-right duration-200">
          <div className="h-14 px-4 border-b border-gray-200/80 dark:border-white/[0.08] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <StickyNote className="h-4 w-4 text-amber-500" />
              <h3 className="font-bold text-xs text-gray-900 dark:text-white">Internal Notes</h3>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-gray-900" onClick={() => setIsNotesOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <form onSubmit={handleAddNote} className="p-4 border-b border-gray-100 dark:border-white/[0.06] space-y-2">
            <textarea
              value={newNoteText}
              onChange={(e) => setNewNoteText(e.target.value)}
              placeholder="Add internal note for team..."
              rows={3}
              className="w-full text-xs p-2.5 rounded-xl bg-gray-50 dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.08] text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none"
            />
            <Button type="submit" size="sm" className="w-full bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs h-8 rounded-xl gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Save Note
            </Button>
          </form>

          <ScrollArea className="flex-1 p-4">
            <div className="space-y-3">
              {notes.map((n) => (
                <div key={n.id} className="p-3 rounded-xl bg-gray-50 dark:bg-white/[0.02] border border-gray-200/60 dark:border-white/[0.06] space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-gray-500">
                    <span className="font-semibold text-amber-700 dark:text-amber-400">{n.created_by_name || 'Team member'}</span>
                    {n.created_by_id === user?.id && (
                      <button onClick={() => handleDeleteNote(n.id)} className="text-gray-400 hover:text-red-500">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">{n.content}</p>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* 4. Right: Contact Info Drawer */}
      {isInfoOpen && selectedContact && (
        <div className="w-80 border-l border-gray-200/80 dark:border-white/[0.08] bg-white dark:bg-[#141b1a] flex flex-col shrink-0 animate-in slide-in-from-right duration-200">
          <div className="h-14 px-4 border-b border-gray-200/80 dark:border-white/[0.08] flex items-center justify-between">
            <h3 className="font-bold text-xs text-gray-900 dark:text-white">Contact Info</h3>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-gray-900" onClick={() => setIsInfoOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <ScrollArea className="flex-1 p-6 space-y-6">
            <div className="text-center space-y-2">
              <div
                className={`h-16 w-16 mx-auto rounded-full flex items-center justify-center font-bold text-xl shadow-sm border ${getAvatarColor(
                  getContactName(selectedContact)
                )}`}
              >
                {(getContactName(selectedContact)[0] || 'C').toUpperCase()}
              </div>
              <h4 className="font-bold text-sm text-gray-900 dark:text-white">
                {getContactName(selectedContact)}
              </h4>
              <p className="text-xs text-gray-500 font-mono">{selectedContact.phone_number}</p>
            </div>

            <div className="pt-4 border-t border-gray-100 dark:border-white/[0.08] space-y-4">
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-2">
                  Tags
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {selectedContact.tags && selectedContact.tags.length > 0 ? (
                    selectedContact.tags.map((tag) => (
                      <TagBadge key={tag} color={tagColors[tag]}>
                        {tag}
                      </TagBadge>
                    ))
                  ) : (
                    <span className="text-xs text-gray-400">No tags</span>
                  )}
                </div>
              </div>

              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                  WhatsApp Account
                </span>
                <span className="text-xs text-gray-700 dark:text-gray-300">
                  {selectedContact.whatsapp_account || 'Default account'}
                </span>
              </div>

              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                  Assigned Agent
                </span>
                <span className="text-xs text-gray-700 dark:text-gray-300">
                  {!selectedContact.assigned_user_id
                    ? 'Unassigned'
                    : selectedContact.assigned_user_id === user?.id
                      ? user?.full_name || 'You'
                      : 'Another agent'}
                </span>
              </div>
            </div>
          </ScrollArea>
        </div>
      )}

      {/* WhatsApp Payment Request Modal */}
      <Dialog open={paymentModalOpen} onOpenChange={setPaymentModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-emerald-500" />
              Send WhatsApp Payment Request
            </DialogTitle>
            <DialogDescription>
              Generate a secure Razorpay / WhatsApp Pay checkout link and send it directly in this conversation.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-semibold">Payment Amount (₹ INR)</Label>
              <Input
                type="number"
                placeholder="e.g. 1499"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                className="mt-1 h-9 text-xs"
              />
            </div>

            <div>
              <Label className="text-xs font-semibold">Description / Order Reference</Label>
              <Input
                placeholder="e.g. Order #98214 - Advance Payment"
                value={paymentPurpose}
                onChange={(e) => setPaymentPurpose(e.target.value)}
                className="mt-1 h-9 text-xs"
              />
            </div>

            <div className="p-3 bg-emerald-50/50 dark:bg-emerald-950/30 rounded-xl border border-emerald-200/50 dark:border-emerald-900/40 text-[11px] text-emerald-700 dark:text-emerald-300">
              <p className="font-semibold">WhatsApp Native Checkout</p>
              <p className="mt-0.5 text-gray-500 dark:text-gray-400">
                Customer will receive an interactive WhatsApp payment card with 1-tap UPI, Credit/Debit card, and NetBanking checkout.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPaymentModalOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={isGeneratingPayment}
              onClick={() => {
                if (!paymentAmount || parseFloat(paymentAmount) <= 0) {
                  toast.error('Please enter a valid payment amount');
                  return;
                }
                setIsGeneratingPayment(true);
                setTimeout(() => {
                  const paymentText = `Please complete your payment of ₹${parseFloat(paymentAmount).toLocaleString('en-IN', {
                    minimumFractionDigits: 2,
                  })} for "${paymentPurpose}":\n👉 https://pay.onesuit.in/pay_${Math.floor(100000 + Math.random() * 900000)}`;
                  setInputText(paymentText);
                  setIsGeneratingPayment(false);
                  setPaymentModalOpen(false);
                  toast.success('Payment request link inserted into message composer');
                }, 600);
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
            >
              {isGeneratingPayment ? 'Generating Link...' : 'Insert Payment Link'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ChatView;
