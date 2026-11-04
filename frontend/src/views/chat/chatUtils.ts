import type { CSSProperties } from 'react';
import axios from 'axios';
import { api } from '@/services/api';
import { readData } from '@/services/response';

export interface Reaction {
  emoji: string;
  from_phone?: string;
  from_user?: string;
}

export interface Message {
  id: string;
  contact_id: string;
  direction: 'incoming' | 'outgoing';
  message_type?: string;
  content?: { body?: string } | string | null;
  media_url?: string;
  media_mime_type?: string;
  media_filename?: string;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed' | 'received';
  error_message?: string;
  reply_to_message?: { id: string; content?: unknown; message_type?: string; direction?: string } | null;
  reactions?: Reaction[];
  created_at: string;
}

export interface Contact {
  id: string;
  phone_number: string;
  profile_name?: string;
  name?: string;
  tags?: string[];
  metadata?: Record<string, unknown> | null;
  unread_count: number;
  last_message_at?: string | null;
  last_message_preview?: string;
  last_inbound_at?: string | null;
  service_window_open?: boolean;
  assigned_user_id?: string | null;
  whatsapp_account?: string;
}

export interface TeamMember {
  id: string;
  full_name: string;
  email?: string;
  is_available?: boolean;
}

/** Inbox views: the tabs plus the "Others" dropdown entries. */
export type InboxView = 'all' | 'mine' | 'unassigned' | 'others' | 'unread' | 'open' | 'expired';

export interface InboxCounts {
  all: number;
  mine: number;
  unassigned: number;
  others: number;
  unread: number;
}

export const getContactName = (c: Pick<Contact, 'profile_name' | 'name' | 'phone_number'>) =>
  c.profile_name || c.name || c.phone_number || 'Unknown';

export const getInitials = (name: string) => {
  const parts = name.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '#';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const AVATAR_COLORS = [
  'bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-200',
  'bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200',
  'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
  'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200',
  'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200',
  'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200',
];

export const getAvatarColor = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

/** Tag colours: Settings → Tags stores a name (green, blue...) or a hex. */
const TAG_HEX: Record<string, string> = {
  green: '#10b981',
  blue: '#3b82f6',
  purple: '#8b5cf6',
  yellow: '#f59e0b',
  red: '#ef4444',
  gray: '#6b7280',
};

export const tagHex = (color?: string) => {
  if (!color) return TAG_HEX.gray;
  if (color.startsWith('#')) return color;
  return TAG_HEX[color.toLowerCase()] || TAG_HEX.gray;
};

/** Inline style for a coloured tag chip that reads in light and dark mode. */
export const tagChipStyle = (color?: string, active = true): CSSProperties => {
  const hex = tagHex(color);
  return active
    ? { backgroundColor: `${hex}1f`, borderColor: `${hex}66`, color: hex }
    : { borderColor: `${hex}40` };
};

export const getMessageText = (m: Pick<Message, 'content' | 'media_filename' | 'message_type'>) => {
  const body = typeof m.content === 'string' ? m.content : m.content?.body;
  if (body) return body;
  if (m.media_filename) return m.media_filename;
  return m.message_type && m.message_type !== 'text' ? `[${m.message_type}]` : '';
};

export const formatTime = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

/** "now", "5m", "3h", "Yesterday", "Mon", "12 Oct". */
export const formatRelative = (iso?: string | null, now = Date.now()) => {
  if (!iso) return '';
  const d = new Date(iso);
  const t = d.getTime();
  if (Number.isNaN(t)) return '';
  const diff = Math.max(0, now - t) / 1000;
  if (diff < 60) return 'now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  const today = new Date(now);
  if (d.toDateString() === today.toDateString()) return `${Math.floor(diff / 3600)}h`;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  if (diff < 6 * 86400) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
};

/** Day separator label for the conversation: Today, Yesterday or a date. */
export const formatDayLabel = (iso: string, now = Date.now()) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date(now);
  if (d.toDateString() === today.toDateString()) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], {
    day: 'numeric',
    month: 'long',
    year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });
};

/** Whether the 24-hour customer service window is open for free-form replies. */
export const isWindowOpen = (c: Pick<Contact, 'service_window_open' | 'last_inbound_at'>, now = Date.now()) => {
  if (c.last_inbound_at) {
    const t = new Date(c.last_inbound_at).getTime();
    if (!Number.isNaN(t)) return now - t < 24 * 3600 * 1000;
  }
  return Boolean(c.service_window_open);
};

/** Time left in the service window, e.g. "18h 20m", or '' when closed. */
export const windowTimeLeft = (c: Pick<Contact, 'last_inbound_at'>, now = Date.now()) => {
  if (!c.last_inbound_at) return '';
  const left = new Date(c.last_inbound_at).getTime() + 24 * 3600 * 1000 - now;
  if (Number.isNaN(left) || left <= 0) return '';
  const h = Math.floor(left / 3600000);
  const m = Math.floor((left % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

export const metaString = (c: Contact, key: string) => {
  const v = c.metadata?.[key];
  return typeof v === 'string' ? v : '';
};

export const getErrorMessage = (err: unknown, fallback: string) =>
  (axios.isAxiosError(err) && (err.response?.data as { message?: string } | undefined)?.message) || fallback;

/** Query params for GET /contacts for an inbox view. */
export const inboxParams = (opts: {
  view: InboxView;
  showAll: boolean;
  labels: string[];
  search: string;
  page?: number;
  limit?: number;
}) => {
  const params: Record<string, string | number> = {
    include_counts: 'true',
    limit: opts.limit ?? 50,
    page: opts.page ?? 1,
  };
  if (!opts.showAll) params.has_messages = 'true';
  if (opts.labels.length > 0) params.tags = opts.labels.join(',');
  const q = opts.search.trim();
  if (q) params.search = q.replace(/^\+/, '');
  switch (opts.view) {
    case 'mine':
      params.assigned = 'me';
      break;
    case 'unassigned':
      params.assigned = 'unassigned';
      break;
    case 'others':
      params.assigned = 'others';
      break;
    case 'unread':
      params.unread = 'true';
      break;
    case 'open':
      params.window = 'open';
      break;
    case 'expired':
      params.window = 'expired';
      break;
  }
  return params;
};

export const inboxService = {
  list: (params: Record<string, string | number>) => api.get('/contacts', { params }),
  sendMedia: (contactId: string, file: File, caption?: string, account?: string) => {
    const form = new FormData();
    form.append('contact_id', contactId);
    form.append('file', file);
    form.append('type', mediaKind(file.type));
    if (caption) form.append('caption', caption);
    if (account) form.append('whatsapp_account', account);
    return api.post('/messages/media', form, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  /** Media is served behind auth, so fetch it with the API client and show a blob URL. */
  fetchMedia: async (mediaUrl: string) => {
    const path = mediaUrl.replace(/^\/api/, '');
    const res = await api.get(path, { responseType: 'blob' });
    return URL.createObjectURL(res.data as Blob);
  },
};

export const mediaKind = (mime: string): 'image' | 'video' | 'audio' | 'document' => {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'document';
};

export const readCounts = (res: { data?: unknown }): InboxCounts | null => {
  const data = readData<{ counts?: InboxCounts }>(res);
  return data?.counts ?? null;
};
