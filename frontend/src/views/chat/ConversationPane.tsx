import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Send,
  Paperclip,
  Smile,
  Check,
  CheckCheck,
  Clock,
  StickyNote,
  Info,
  CreditCard,
  FileText,
  MessageSquareText,
  Reply,
  SmilePlus,
  X,
  Download,
  Loader2,
  Sparkles,
  AlertCircle,
  Lock,
} from 'lucide-react';
import { messagesService, type CannedResponse } from '@/services/api';
import { readData } from '@/services/response';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  type Contact,
  type Message,
  formatDayLabel,
  formatTime,
  getAvatarColor,
  getContactName,
  getErrorMessage,
  getInitials,
  getMessageText,
  inboxService,
  isWindowOpen,
  windowTimeLeft,
} from './chatUtils';
import { TemplatePickerDialog } from './TemplatePickerDialog';
import { AttachMenu, type FileKind } from './compose/AttachMenu';
import { RichBubble } from './compose/RichBubble';
import { ScheduledStrip } from './compose/ScheduledStrip';
import { isRichMessage } from './compose/richUtils';

const FILE_ACCEPT: Record<FileKind, string> = {
  document: 'application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv',
  media: 'image/*,video/*',
  audio: 'audio/*',
};

const EMOJIS = ['😀', '😂', '😊', '😍', '🙏', '👍', '👏', '🎉', '🔥', '❤️', '✅', '👋', '🤝', '😅', '🤔', '😢', '😮', '💯', '🙌', '⭐', '📦', '💰', '📞', '⏰'];
const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

// Blob URLs for media already fetched, so polling doesn't refetch them.
const mediaCache = new Map<string, string>();

const MediaBlock: React.FC<{ m: Message }> = ({ m }) => {
  const kind = m.message_type || '';
  const [url, setUrl] = useState<string | null>(() => mediaCache.get(m.id) || null);
  const [failed, setFailed] = useState(false);
  const autoLoad = kind === 'image' || kind === 'sticker' || kind === 'video' || kind === 'audio';

  useEffect(() => {
    if (!m.media_url || url || !autoLoad) return;
    let cancelled = false;
    inboxService
      .fetchMedia(m.media_url)
      .then((u) => {
        mediaCache.set(m.id, u);
        if (!cancelled) setUrl(u);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [m.id, m.media_url, url, autoLoad]);

  if (!m.media_url) return null;

  const download = async () => {
    try {
      const u = url || (await inboxService.fetchMedia(m.media_url!));
      mediaCache.set(m.id, u);
      setUrl(u);
      const a = document.createElement('a');
      a.href = u;
      a.download = m.media_filename || 'file';
      a.click();
    } catch {
      toast.error('Could not download this file');
    }
  };

  if (failed) return <p className="text-[11px] italic opacity-70">Media unavailable</p>;
  if (kind === 'image' || kind === 'sticker') {
    return url ? (
      <a href={url} target="_blank" rel="noreferrer">
        <img src={url} alt={m.media_filename || 'Image'} className={cn('mb-1 max-h-72 rounded-lg object-cover', kind === 'sticker' ? 'w-32' : 'w-full')} />
      </a>
    ) : (
      <div className="mb-1 flex h-40 w-56 items-center justify-center rounded-lg bg-black/5 dark:bg-white/5">
        <Loader2 className="h-5 w-5 animate-spin opacity-50" />
      </div>
    );
  }
  if (kind === 'video') return url ? <video src={url} controls className="mb-1 max-h-72 w-full rounded-lg" /> : <Loader2 className="h-5 w-5 animate-spin opacity-50" />;
  if (kind === 'audio') return url ? <audio src={url} controls className="mb-1 w-60 max-w-full" /> : <Loader2 className="h-5 w-5 animate-spin opacity-50" />;
  return (
    <button type="button" onClick={download} className="mb-1 flex w-full items-center gap-2.5 rounded-lg bg-black/5 p-2.5 text-left hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/15">
      <FileText className="h-7 w-7 shrink-0 text-rose-500" />
      <span className="min-w-0 flex-1 truncate text-xs font-medium">{m.media_filename || 'Document'}</span>
      <Download className="h-4 w-4 shrink-0 opacity-60" />
    </button>
  );
};

const StatusTick: React.FC<{ m: Message }> = ({ m }) => {
  if (m.status === 'failed')
    return (
      <span className="flex items-center gap-0.5 font-semibold text-red-500" title={m.error_message || 'Not delivered'}>
        <AlertCircle className="h-3 w-3" /> Failed
      </span>
    );
  if (m.status === 'pending') return <Clock className="h-3 w-3" />;
  if (m.status === 'read') return <CheckCheck className="h-3.5 w-3.5 text-sky-500 dark:text-sky-400" />;
  if (m.status === 'delivered') return <CheckCheck className="h-3.5 w-3.5" />;
  return <Check className="h-3.5 w-3.5" />;
};

interface ConversationPaneProps {
  contact: Contact;
  messages: Message[];
  loadingMessages: boolean;
  onMessageSent: (m: Message, preview: string) => void;
  onReload: () => void;
  notesCount: number;
  panel: 'info' | 'notes' | null;
  onTogglePanel: (p: 'info' | 'notes') => void;
  onBack: () => void;
  cannedResponses: CannedResponse[];
  assigneeName: string;
  className?: string;
}

export const ConversationPane: React.FC<ConversationPaneProps> = ({
  contact,
  messages,
  loadingMessages,
  onMessageSent,
  onReload,
  notesCount,
  panel,
  onTogglePanel,
  onBack,
  cannedResponses,
  assigneeName,
  className,
}) => {
  const name = getContactName(contact);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [cannedOpen, setCannedOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentPurpose, setPaymentPurpose] = useState('');
  const [scheduledVersion, setScheduledVersion] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const windowOpen = isWindowOpen(contact);
  const timeLeft = windowTimeLeft(contact);

  // New contact: reset the composer.
  useEffect(() => {
    setText('');
    setReplyTo(null);
    setFile(null);
    stickToBottom.current = true;
  }, [contact.id]);

  // Keep the newest message in view unless the agent scrolled up to read.
  const lastId = messages[messages.length - 1]?.id;
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [lastId, messages.length, contact.id]);

  // Auto-grow the composer.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [text]);

  // "/" at the start opens canned responses filtered by what follows.
  const slashQuery = text.startsWith('/') ? text.slice(1).toLowerCase() : null;
  const cannedMatches = useMemo(() => {
    const q = (slashQuery ?? '').trim();
    return cannedResponses
      .filter((c) => c.is_active !== false)
      .filter((c) => !q || c.shortcut?.toLowerCase().includes(q) || c.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [cannedResponses, slashQuery]);
  const showSlash = slashQuery !== null && cannedMatches.length > 0;

  const groups = useMemo(() => {
    const out: { day: string; items: Message[] }[] = [];
    for (const m of messages) {
      const day = formatDayLabel(m.created_at);
      const last = out[out.length - 1];
      if (last && last.day === day) last.items.push(m);
      else out.push({ day, items: [m] });
    }
    return out;
  }, [messages]);

  const insertCanned = (c: CannedResponse) => {
    const body = c.content.replace(/\{\{\s*(name|contact_name)\s*\}\}/gi, name);
    setText(body);
    setCannedOpen(false);
    inputRef.current?.focus();
  };

  const send = async () => {
    if (sending) return;
    const body = text.trim();
    if (!file && !body) return;
    setSending(true);
    try {
      if (file) {
        const res = await inboxService.sendMedia(contact.id, file, body || undefined, contact.whatsapp_account);
        const msg = readData<Message>(res);
        setFile(null);
        setText('');
        if (msg?.id) onMessageSent(msg, body || `📎 ${file.name}`);
        else onReload();
      } else {
        const res = await messagesService.send(contact.id, {
          type: 'text',
          content: { body },
          reply_to_message_id: replyTo?.id,
        });
        setText('');
        const msg = readData<Message>(res);
        if (msg?.id) onMessageSent(msg, body);
        else onReload();
      }
      setReplyTo(null);
      stickToBottom.current = true;
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to send message'));
    } finally {
      setSending(false);
    }
  };

  const react = async (m: Message, emoji: string) => {
    try {
      await messagesService.sendReaction(contact.id, m.id, emoji);
      onReload();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to react'));
    }
  };

  const suggestions = [
    `Hi ${name}, thanks for reaching out! How can we help you today?`,
    `Thank you for your patience, ${name}. Let me check this for you right away.`,
    `Is there anything else we can help you with?`,
  ];

  const headerBtn = (active: boolean) =>
    cn('relative h-9 w-9 rounded-full text-white/85 hover:bg-white/15 hover:text-white', active && 'bg-white/20 text-white');

  return (
    <section className={cn('relative flex min-h-0 min-w-0 flex-col', className)}>
      {/* Header */}
      <header className="z-10 flex h-14 shrink-0 items-center gap-2 bg-gradient-to-r from-emerald-700 to-teal-700 px-2 text-white shadow-sm sm:px-3 dark:from-emerald-900 dark:to-teal-900">
        <button type="button" onClick={onBack} aria-label="Back to chats" className="rounded-full p-1.5 hover:bg-white/15 md:hidden">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <button type="button" onClick={() => onTogglePanel('info')} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
          <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ring-2 ring-white/30', getAvatarColor(name))}>
            {getInitials(name)}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold leading-tight">{name}</span>
            <span className="block truncate text-[11px] text-white/75">
              {contact.phone_number}
              {assigneeName ? ` · ${assigneeName}` : ''}
            </span>
          </span>
        </button>
        <span
          className={cn(
            'hidden shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium lg:inline-flex',
            windowOpen ? 'bg-white/15 text-white' : 'bg-black/20 text-white/80'
          )}
          title="WhatsApp lets you send free-form replies for 24 hours after the customer's last message"
        >
          <Clock className="h-3 w-3" />
          {windowOpen ? `${timeLeft || '24h'} left to reply` : 'Window closed'}
        </span>
        <Button variant="ghost" size="icon" onClick={() => onTogglePanel('notes')} className={headerBtn(panel === 'notes')} title="Internal notes" aria-label="Internal notes">
          <StickyNote className="h-4 w-4" />
          {notesCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-400 px-1 text-[9px] font-bold text-amber-950">
              {notesCount}
            </span>
          )}
        </Button>
        <Button variant="ghost" size="icon" onClick={() => onTogglePanel('info')} className={headerBtn(panel === 'info')} title="Contact info" aria-label="Contact info">
          <Info className="h-4 w-4" />
        </Button>
      </header>

      {!windowOpen && (
        <div className="z-10 flex shrink-0 items-center gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1">
            You can't reply, they need to reply back to start conversation. Send an approved template to reopen the chat.
          </span>
          <Button size="sm" onClick={() => setTemplateOpen(true)} className="h-7 shrink-0 rounded-lg bg-amber-600 px-2.5 text-[11px] font-semibold text-white hover:bg-amber-500">
            Send template
          </Button>
        </div>
      )}

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="bg-whatsapp-doodle min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-6"
      >
        {loadingMessages && messages.length === 0 && (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
          </div>
        )}
        {!loadingMessages && messages.length === 0 && (
          <div className="mx-auto mt-10 max-w-xs rounded-2xl bg-white/90 p-4 text-center text-xs text-gray-600 shadow-sm dark:bg-[#1b2624]/90 dark:text-gray-300">
            No messages yet. {windowOpen ? 'Say hello!' : 'Start the conversation with an approved template.'}
          </div>
        )}
        {groups.map((g) => (
          <div key={g.day + g.items[0].id} className="space-y-1.5">
            <div className="sticky top-1 z-[5] flex justify-center py-2">
              <span className="rounded-lg bg-white/95 px-3 py-1 text-[11px] font-medium text-gray-600 shadow-sm dark:bg-[#1b2624]/95 dark:text-gray-300">
                {g.day}
              </span>
            </div>
            {g.items.map((m) => {
              const out = m.direction === 'outgoing';
              const body = getMessageText(m);
              const rich = isRichMessage(m);
              const showText = body && !rich && !(m.media_url && body === m.media_filename);
              const replyText = m.reply_to_message ? getMessageText(m.reply_to_message as Message) : '';
              return (
                <div key={m.id} className={cn('group flex items-end gap-1', out ? 'justify-end' : 'justify-start')}>
                  {out && <MessageActions onReply={() => setReplyTo(m)} onReact={(e) => react(m, e)} />}
                  <div
                    className={cn(
                      'relative max-w-[85%] rounded-xl px-2.5 pb-1 pt-1.5 text-[13px] leading-relaxed text-gray-900 shadow-sm sm:max-w-[65%] dark:text-gray-50',
                      out ? 'rounded-tr-sm bg-[#d9fdd3] dark:bg-[#005c4b]' : 'rounded-tl-sm bg-white dark:bg-[#202c33]',
                      m.status === 'failed' && 'ring-1 ring-red-400/60'
                    )}
                  >
                    {m.reply_to_message && (
                      <div className="mb-1 rounded-md border-l-4 border-emerald-500 bg-black/5 px-2 py-1 text-[11px] text-gray-600 dark:bg-white/10 dark:text-gray-300">
                        <span className="line-clamp-2">{replyText || 'Message'}</span>
                      </div>
                    )}
                    <MediaBlock m={m} />
                    {rich && <RichBubble m={m} />}
                    {showText && <p className="whitespace-pre-wrap break-words">{body}</p>}
                    <div className="-mb-0.5 mt-0.5 flex items-center justify-end gap-1 text-[10px] text-gray-500 dark:text-white/60">
                      <span>{formatTime(m.created_at)}</span>
                      {out && <StatusTick m={m} />}
                    </div>
                    {m.reactions && m.reactions.length > 0 && (
                      <div className={cn('absolute -bottom-3 flex gap-0.5 rounded-full bg-white px-1.5 py-0.5 text-xs shadow dark:bg-[#2a3942]', out ? 'right-2' : 'left-2')}>
                        {Array.from(new Set(m.reactions.map((r) => r.emoji))).map((e) => (
                          <span key={e}>{e}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  {!out && <MessageActions onReply={() => setReplyTo(m)} onReact={(e) => react(m, e)} />}
                </div>
              );
            })}
          </div>
        ))}
        <ScheduledStrip contact={contact} version={scheduledVersion + messages.length} onChange={() => setScheduledVersion((v) => v + 1)} />
        <div className="h-3" />
      </div>

      {/* AI suggestions (opt-in) */}
      {copilotOpen && windowOpen && (
        <div className="z-10 flex shrink-0 gap-2 overflow-x-auto border-t border-gray-200/80 bg-white/95 px-3 py-2 dark:border-white/[0.07] dark:bg-[#111a19]">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setText(s);
                inputRef.current?.focus();
              }}
              title={s}
              className="max-w-[260px] shrink-0 truncate rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-[11px] text-teal-800 hover:border-teal-400 dark:border-teal-800/60 dark:bg-teal-900/30 dark:text-teal-200"
            >
              ✦ {s}
            </button>
          ))}
        </div>
      )}

      {/* Composer */}
      <div className="z-10 shrink-0 border-t border-gray-200/80 bg-gray-50 px-2 py-2 sm:px-3 dark:border-white/[0.07] dark:bg-[#111a19]">
        {replyTo && (
          <div className="mb-2 flex items-center gap-2 rounded-xl border-l-4 border-emerald-500 bg-white px-3 py-1.5 text-xs dark:bg-white/[0.05]">
            <Reply className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
            <span className="min-w-0 flex-1 truncate text-gray-600 dark:text-gray-300">
              Replying to {replyTo.direction === 'outgoing' ? 'yourself' : name}: {getMessageText(replyTo)}
            </span>
            <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply" className="text-gray-400 hover:text-gray-700 dark:hover:text-white">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {file && (
          <div className="mb-2 flex items-center gap-2 rounded-xl bg-white px-3 py-1.5 text-xs dark:bg-white/[0.05]">
            <Paperclip className="h-3.5 w-3.5 shrink-0 text-teal-600" />
            <span className="min-w-0 flex-1 truncate text-gray-700 dark:text-gray-200">
              {file.name} <span className="text-gray-400">({Math.max(1, Math.round(file.size / 1024))} KB) — the message becomes its caption</span>
            </span>
            <button type="button" onClick={() => setFile(null)} aria-label="Remove attachment" className="text-gray-400 hover:text-gray-700 dark:hover:text-white">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {showSlash && (
          <div className="mb-2 max-h-48 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-lg dark:border-white/[0.08] dark:bg-[#17211f]">
            {cannedMatches.map((c) => (
              <button key={c.id} type="button" onClick={() => insertCanned(c)} className="flex w-full flex-col rounded-lg px-2.5 py-1.5 text-left hover:bg-gray-100 dark:hover:bg-white/[0.06]">
                <span className="text-xs font-semibold text-gray-900 dark:text-white">
                  {c.shortcut ? <span className="mr-1 text-teal-600 dark:text-teal-400">/{c.shortcut}</span> : null}
                  {c.name}
                </span>
                <span className="truncate text-[11px] text-gray-500 dark:text-gray-400">{c.content}</span>
              </button>
            ))}
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setFile(f);
            e.target.value = '';
          }}
        />
        <div className="flex items-end gap-1">
          <div className="flex shrink-0 items-center">
            <AttachMenu
              contact={contact}
              windowOpen={windowOpen}
              composerText={text}
              onPickFile={(kind) => {
                const el = fileRef.current;
                if (!el) return;
                el.accept = FILE_ACCEPT[kind];
                el.click();
              }}
              onSent={(m, preview) => {
                stickToBottom.current = true;
                if (m) onMessageSent(m, preview);
                else onReload();
              }}
              onScheduled={() => {
                setScheduledVersion((v) => v + 1);
                stickToBottom.current = true;
              }}
            />
            <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
              <PopoverTrigger asChild>
                <ComposerIcon title="Emoji" disabled={!windowOpen} className="hidden sm:inline-flex">
                  <Smile className="h-[18px] w-[18px]" />
                </ComposerIcon>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64 p-2">
                <div className="grid grid-cols-8 gap-1">
                  {EMOJIS.map((e) => (
                    <button key={e} type="button" className="rounded p-1 text-lg hover:bg-black/5 dark:hover:bg-white/10" onClick={() => setText((t) => t + e)}>
                      {e}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <Popover open={cannedOpen} onOpenChange={setCannedOpen}>
              <PopoverTrigger asChild>
                <ComposerIcon title="Canned responses (or type /)" disabled={!windowOpen}>
                  <MessageSquareText className="h-[18px] w-[18px]" />
                </ComposerIcon>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72 p-1">
                <div className="max-h-64 overflow-y-auto">
                  {cannedResponses.length === 0 && <p className="p-3 text-xs opacity-70">No canned responses yet. Add them in Settings → Canned responses.</p>}
                  {cannedResponses.map((c) => (
                    <button key={c.id} type="button" onClick={() => insertCanned(c)} className="flex w-full flex-col rounded-lg px-2.5 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/[0.06]">
                      <span className="text-xs font-semibold">
                        {c.shortcut ? <span className="mr-1 text-teal-600 dark:text-teal-400">/{c.shortcut}</span> : null}
                        {c.name}
                      </span>
                      <span className="truncate text-[11px] opacity-60">{c.content}</span>
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <ComposerIcon title="Send template" onClick={() => setTemplateOpen(true)}>
              <FileText className="h-[18px] w-[18px]" />
            </ComposerIcon>
            <ComposerIcon title="Payment link" disabled={!windowOpen} onClick={() => setPaymentOpen(true)} className="hidden sm:inline-flex">
              <CreditCard className="h-[18px] w-[18px]" />
            </ComposerIcon>
            <ComposerIcon title="Reply suggestions" disabled={!windowOpen} onClick={() => setCopilotOpen((v) => !v)} className={cn('hidden sm:inline-flex', copilotOpen && 'text-teal-600 dark:text-teal-400')}>
              <Sparkles className="h-[18px] w-[18px]" />
            </ComposerIcon>
          </div>
          <textarea
            ref={inputRef}
            rows={1}
            value={text}
            disabled={!windowOpen}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (showSlash) insertCanned(cannedMatches[0]);
                else void send();
              }
              if (e.key === 'Escape' && slashQuery !== null) setText('');
            }}
            placeholder={windowOpen ? 'Type a message  ·  / for canned replies' : "Reply window closed — send a template"}
            aria-label="Message"
            className="max-h-[140px] min-h-[40px] min-w-0 flex-1 resize-none rounded-2xl border border-gray-200 bg-white px-3.5 py-2.5 text-[13px] text-gray-900 placeholder:text-gray-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/[0.08] dark:bg-[#1b2624] dark:text-white"
          />
          <Button
            type="button"
            size="icon"
            onClick={() => void send()}
            disabled={sending || !windowOpen || (!text.trim() && !file)}
            aria-label="Send"
            className="h-10 w-10 shrink-0 rounded-full bg-emerald-600 text-white shadow-sm hover:bg-emerald-500"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <TemplatePickerDialog
        open={templateOpen}
        onOpenChange={setTemplateOpen}
        contact={contact}
        onSent={() => {
          stickToBottom.current = true;
          onReload();
        }}
      />

      {/* Payment link helper: fills the composer with a link message */}
      {paymentOpen && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 p-4" onClick={() => setPaymentOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl dark:bg-[#17211f]" onClick={(e) => e.stopPropagation()}>
            <h3 className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white">
              <CreditCard className="h-4 w-4 text-emerald-600" /> Payment request
            </h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Adds a payment message to the composer so you can review it before sending.</p>
            <label className="mt-3 block text-xs font-medium text-gray-700 dark:text-gray-200">
              Amount (₹)
              <input type="number" min="1" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} className="mt-1 h-9 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm dark:border-white/[0.1] dark:bg-[#0f1716] dark:text-white" />
            </label>
            <label className="mt-2 block text-xs font-medium text-gray-700 dark:text-gray-200">
              For
              <input value={paymentPurpose} onChange={(e) => setPaymentPurpose(e.target.value)} placeholder="e.g. Order #1024" className="mt-1 h-9 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm dark:border-white/[0.1] dark:bg-[#0f1716] dark:text-white" />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setPaymentOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-emerald-600 text-white hover:bg-emerald-500"
                onClick={() => {
                  const amount = parseFloat(paymentAmount);
                  if (!amount || amount <= 0) {
                    toast.error('Enter a valid amount');
                    return;
                  }
                  const amt = amount.toLocaleString('en-IN', { minimumFractionDigits: 2 });
                  setText(`Please complete your payment of ₹${amt}${paymentPurpose ? ` for ${paymentPurpose}` : ''}.\nPayment link: `);
                  setPaymentOpen(false);
                  inputRef.current?.focus();
                }}
              >
                Insert
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

type ComposerIconProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { title: string };

const ComposerIcon = React.forwardRef<HTMLButtonElement, ComposerIconProps>(({ title, className, children, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    title={title}
    aria-label={title}
    {...props}
    className={cn(
      'inline-flex h-10 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-200/70 hover:text-gray-900 disabled:pointer-events-none disabled:opacity-40 dark:text-gray-400 dark:hover:bg-white/[0.08] dark:hover:text-white',
      className
    )}
  >
    {children}
  </button>
));
ComposerIcon.displayName = 'ComposerIcon';

const MessageActions: React.FC<{ onReply: () => void; onReact: (emoji: string) => void }> = ({ onReply, onReact }) => (
  <div className="mb-2 flex shrink-0 gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label="React" className="rounded-full bg-white/90 p-1 text-gray-500 shadow-sm hover:text-gray-900 dark:bg-[#202c33] dark:text-gray-300">
          <SmilePlus className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" className="flex w-auto gap-1 rounded-full p-1.5">
        {QUICK_REACTIONS.map((e) => (
          <button key={e} type="button" onClick={() => onReact(e)} className="rounded-full p-1 text-lg transition-transform hover:scale-125">
            {e}
          </button>
        ))}
      </PopoverContent>
    </Popover>
    <button type="button" onClick={onReply} aria-label="Reply" className="rounded-full bg-white/90 p-1 text-gray-500 shadow-sm hover:text-gray-900 dark:bg-[#202c33] dark:text-gray-300">
      <Reply className="h-3.5 w-3.5" />
    </button>
  </div>
);

export default ConversationPane;
