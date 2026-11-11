import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCheck,
  Download,
  ExternalLink,
  FileText,
  History,
  Loader2,
  MessageSquareText,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { ExportFormat, HistoryContactInfo, HistoryMessage } from '@/services/historyApi';
import { formatDayLabel, formatTime, getAvatarColor, getInitials, getMessageText, inboxService } from '../chatUtils';
import { groupByDay, splitHighlight } from './historyUtils';

// Blob URLs of media already fetched in this session.
const mediaCache = new Map<string, string>();

/** Read-only media preview: thumbnails load on demand, files download on click. */
const HistoryMedia: React.FC<{ m: HistoryMessage }> = ({ m }) => {
  const kind = m.message_type || '';
  const visual = kind === 'image' || kind === 'sticker' || kind === 'video';
  const [url, setUrl] = useState<string | null>(() => mediaCache.get(m.id) || null);
  const [state, setState] = useState<'idle' | 'loading' | 'failed'>('idle');

  useEffect(() => {
    if (!m.media_url || url || !visual) return;
    let cancelled = false;
    setState('loading');
    inboxService
      .fetchMedia(m.media_url)
      .then((u) => {
        mediaCache.set(m.id, u);
        if (!cancelled) {
          setUrl(u);
          setState('idle');
        }
      })
      .catch(() => !cancelled && setState('failed'));
    return () => {
      cancelled = true;
    };
  }, [m.id, m.media_url, url, visual]);

  if (!m.media_url) return null;
  if (state === 'failed') return <p className="mb-1 text-[11px] italic opacity-70">Media unavailable</p>;

  const open = async () => {
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

  if (kind === 'image' || kind === 'sticker') {
    return url ? (
      <a href={url} target="_blank" rel="noreferrer" className="mb-1 block">
        <img
          src={url}
          alt={m.media_filename || 'Image'}
          loading="lazy"
          className={cn('max-h-56 rounded-lg object-cover', kind === 'sticker' ? 'w-28' : 'w-full max-w-[240px]')}
        />
      </a>
    ) : (
      <div className="mb-1 flex h-32 w-48 items-center justify-center rounded-lg bg-black/5 dark:bg-white/5">
        <Loader2 className="h-4 w-4 animate-spin opacity-50" />
      </div>
    );
  }
  if (kind === 'video') {
    return url ? (
      <video src={url} controls preload="metadata" className="mb-1 max-h-56 w-full max-w-[260px] rounded-lg" />
    ) : (
      <div className="mb-1 flex h-32 w-48 items-center justify-center rounded-lg bg-black/5 dark:bg-white/5">
        <Loader2 className="h-4 w-4 animate-spin opacity-50" />
      </div>
    );
  }
  if (kind === 'audio' && url) return <audio src={url} controls className="mb-1 w-56 max-w-full" />;
  return (
    <button
      type="button"
      onClick={open}
      className="mb-1 flex w-full max-w-[260px] items-center gap-2 rounded-lg bg-black/5 p-2 text-left hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/15"
    >
      <FileText className="h-6 w-6 shrink-0 text-rose-500" />
      <span className="min-w-0 flex-1 truncate text-xs font-medium">
        {m.media_filename || (kind === 'audio' ? 'Voice message' : 'Document')}
      </span>
      <Download className="h-4 w-4 shrink-0 opacity-60" />
    </button>
  );
};

const Highlighted: React.FC<{ text: string; q: string }> = ({ text, q }) => (
  <>
    {splitHighlight(text, q).map((part, i) =>
      part.match ? (
        <mark key={i} className="rounded bg-amber-200 px-0.5 text-gray-900 dark:bg-amber-400/80">
          {part.text}
        </mark>
      ) : (
        <React.Fragment key={i}>{part.text}</React.Fragment>
      )
    )}
  </>
);

const Bubble: React.FC<{ m: HistoryMessage; highlight: string; focused: boolean }> = ({ m, highlight, focused }) => {
  const out = m.direction === 'outgoing';
  const body = getMessageText(m);
  const showText = body && !(m.media_url && body === m.media_filename);
  return (
    <div id={`hmsg-${m.id}`} className={cn('flex px-3 py-0.5 sm:px-6', out ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm transition-shadow sm:max-w-[70%]',
          out
            ? 'rounded-br-md bg-emerald-100 text-gray-900 dark:bg-emerald-900/60 dark:text-emerald-50'
            : 'rounded-bl-md bg-white text-gray-900 dark:bg-white/[0.07] dark:text-gray-100',
          focused && 'ring-2 ring-amber-400 ring-offset-2 ring-offset-gray-50 dark:ring-offset-[#0b1312]'
        )}
      >
        {out && m.sender_name && (
          <p className="mb-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">{m.sender_name}</p>
        )}
        {m.reply_to_message && (
          <div className="mb-1 rounded-md border-l-2 border-emerald-500 bg-black/5 px-2 py-1 text-[11px] opacity-80 dark:bg-white/5">
            {getMessageText({
              content: m.reply_to_message.content as HistoryMessage['content'],
              message_type: m.reply_to_message.message_type,
            }) || 'Message'}
          </div>
        )}
        <HistoryMedia m={m} />
        {showText && (
          <p className="whitespace-pre-wrap break-words leading-snug">
            <Highlighted text={body} q={highlight} />
          </p>
        )}
        {m.reactions && m.reactions.length > 0 && (
          <p className="mt-0.5 text-xs">{m.reactions.map((r) => r.emoji).join(' ')}</p>
        )}
        <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-gray-500 dark:text-gray-400">
          {formatTime(m.created_at)}
          {out &&
            (m.status === 'failed' ? (
              <span className="flex items-center gap-0.5 font-semibold text-red-500" title={m.error_message || 'Not delivered'}>
                <AlertCircle className="h-3 w-3" /> Failed
              </span>
            ) : m.status === 'read' ? (
              <CheckCheck className="h-3.5 w-3.5 text-sky-500" />
            ) : m.status === 'delivered' ? (
              <CheckCheck className="h-3.5 w-3.5" />
            ) : (
              <Check className="h-3 w-3" />
            ))}
        </div>
      </div>
    </div>
  );
};

interface HistoryTranscriptProps {
  contact: HistoryContactInfo | null;
  messages: HistoryMessage[];
  total: number;
  loading: boolean;
  loadingMore: 'earlier' | 'later' | null;
  canLoadEarlier: boolean;
  canLoadLater: boolean;
  onLoadEarlier: () => void;
  onLoadLater: () => void;
  focusId: string | null;
  highlight: string;
  rangeText: string;
  onBack: () => void;
  onExport: (format: ExportFormat) => Promise<void>;
  className?: string;
}

export const HistoryTranscript: React.FC<HistoryTranscriptProps> = ({
  contact,
  messages,
  total,
  loading,
  loadingMore,
  canLoadEarlier,
  canLoadLater,
  onLoadEarlier,
  onLoadLater,
  focusId,
  highlight,
  rangeText,
  onBack,
  onExport,
  className,
}) => {
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  // Jump to the focused message, or start at the top of a freshly opened chat.
  useEffect(() => {
    if (loading) return;
    if (focusId) {
      const el = document.getElementById(`hmsg-${focusId}`);
      if (el) {
        el.scrollIntoView({ block: 'center' });
        return;
      }
    }
  }, [focusId, loading, contact?.id]);

  useEffect(() => {
    if (!focusId && scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [contact?.id, focusId]);

  if (!contact && !loading) {
    return (
      <div className={cn('flex flex-col items-center justify-center gap-3 p-8 text-center', className)}>
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
          <History className="h-7 w-7" />
        </span>
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">Pick a conversation</p>
          <p className="mt-1 max-w-xs text-xs text-gray-500 dark:text-gray-400">
            Choose a chat on the left, or search message text to jump straight to what was said.
          </p>
        </div>
      </div>
    );
  }

  const name = contact?.name || contact?.phone_number || '';
  const doExport = async (format: ExportFormat) => {
    setExporting(true);
    try {
      await onExport(format);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div className="flex items-center gap-2 border-b border-gray-200/80 bg-white px-3 py-2.5 dark:border-white/[0.07] dark:bg-[#111a19]">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 md:hidden dark:text-gray-400 dark:hover:bg-white/10"
          aria-label="Back to conversations"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        {contact && (
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
            style={{ backgroundColor: getAvatarColor(name) }}
          >
            {getInitials(name)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{name || 'Loading…'}</p>
          <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">
            {contact?.name ? `${contact.phone_number} · ` : ''}
            {total} message{total === 1 ? '' : 's'} · {rangeText}
          </p>
        </div>
        {contact && (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 px-2.5 text-xs" disabled={exporting || total === 0}>
                  {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  <span className="hidden sm:inline">Export</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => doExport('csv')}>Transcript as CSV (spreadsheet)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => doExport('txt')}>Transcript as TXT (plain text)</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              size="sm"
              className="h-8 gap-1.5 bg-emerald-600 px-2.5 text-xs text-white hover:bg-emerald-700"
              onClick={() => navigate(`/chat/${contact.id}`)}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Open in Live Chat</span>
            </Button>
          </>
        )}
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto bg-gray-50 py-3 dark:bg-[#0b1312]">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-gray-500 dark:text-gray-400">
            <MessageSquareText className="h-6 w-6 opacity-60" />
            No messages in this range.
          </div>
        ) : (
          <>
            {canLoadEarlier && (
              <div className="flex justify-center pb-2">
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onLoadEarlier} disabled={!!loadingMore}>
                  {loadingMore === 'earlier' && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                  Load earlier messages
                </Button>
              </div>
            )}
            {groupByDay(messages).map((g) => (
              <div key={g.day}>
                <div className="sticky top-0 z-10 flex justify-center py-2">
                  <span className="rounded-full border border-gray-200 bg-white/95 px-3 py-0.5 text-[11px] font-medium text-gray-600 shadow-sm dark:border-white/10 dark:bg-[#16211f]/95 dark:text-gray-300">
                    {formatDayLabel(g.items[0].created_at)}
                  </span>
                </div>
                {g.items.map((m) => (
                  <Bubble key={m.id} m={m} highlight={highlight} focused={m.id === focusId} />
                ))}
              </div>
            ))}
            {canLoadLater && (
              <div className="flex justify-center pt-2">
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onLoadLater} disabled={!!loadingMore}>
                  {loadingMore === 'later' && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                  Load later messages
                </Button>
              </div>
            )}
          </>
        )}
      </div>
      <p className="border-t border-gray-200/80 bg-white px-4 py-1.5 text-center text-[11px] text-gray-500 dark:border-white/[0.07] dark:bg-[#111a19] dark:text-gray-400">
        Read-only history. Open in Live Chat to reply.
      </p>
    </div>
  );
};

export default HistoryTranscript;
