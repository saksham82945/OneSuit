import { api } from '@/services/api';

/** One contact that had messages in the range. GET /api/history/conversations */
export interface HistoryConversation {
  contact_id: string;
  name: string;
  phone_number: string;
  whatsapp_account?: string;
  tags: string[];
  assigned_user_id?: string | null;
  assigned_user_name?: string;
  incoming_count: number;
  outgoing_count: number;
  message_count: number;
  first_message_at: string;
  last_message_at: string;
  last_message_preview: string;
  last_message_type: string;
  last_direction: 'incoming' | 'outgoing' | '';
}

/** Range summary. GET /api/history/stats */
export interface HistoryStats {
  conversations: number;
  messages_in: number;
  messages_out: number;
  median_first_response_seconds: number | null;
}

/** A message in a history transcript. GET /api/history/messages */
export interface HistoryMessage {
  id: string;
  contact_id: string;
  direction: 'incoming' | 'outgoing';
  message_type?: string;
  content?: { body?: string } | string | null;
  media_url?: string;
  media_mime_type?: string;
  media_filename?: string;
  status: string;
  error_message?: string;
  reply_to_message?: { id: string; content?: unknown; message_type?: string; direction?: string } | null;
  reactions?: { emoji: string }[];
  sender_name?: string;
  whatsapp_account?: string;
  created_at: string;
}

export interface HistoryContactInfo {
  id: string;
  name: string;
  phone_number: string;
  whatsapp_account?: string;
  tags: string[];
}

export interface HistoryMessagesPage {
  contact: HistoryContactInfo;
  messages: HistoryMessage[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}

/** A message matching a full-text search. GET /api/history/search */
export interface HistorySearchHit {
  message_id: string;
  contact_id: string;
  contact_name: string;
  phone_number: string;
  direction: 'incoming' | 'outgoing';
  message_type: string;
  snippet: string;
  created_at: string;
}

/** Filters shared by the conversation list and the stats strip. */
export interface HistoryFilters {
  from: string;
  to: string;
  search?: string;
  tags?: string[];
  assigned?: string;
  account?: string;
  direction?: '' | 'incoming' | 'outgoing';
}

export type ExportFormat = 'csv' | 'txt';

/** Query params for the list/stats endpoints, without empty values. */
export function historyParams(f: HistoryFilters, extra: Record<string, string | number> = {}) {
  const params: Record<string, string | number> = { from: f.from, to: f.to, ...extra };
  const q = f.search?.trim();
  if (q) params.search = q.replace(/^\+/, '');
  if (f.tags && f.tags.length > 0) params.tags = f.tags.join(',');
  if (f.assigned) params.assigned = f.assigned;
  if (f.account) params.account = f.account;
  if (f.direction) params.direction = f.direction;
  return params;
}

/** File name from a Content-Disposition header, if there is one. */
export function filenameFromDisposition(header: string | undefined | null, fallback: string) {
  if (!header) return fallback;
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header);
  return m ? decodeURIComponent(m[1]) : fallback;
}

export const historyService = {
  conversations: (f: HistoryFilters, page = 1, limit = 50) =>
    api.get('/history/conversations', { params: historyParams(f, { page, limit }) }),
  stats: (f: HistoryFilters) => api.get('/history/stats', { params: historyParams(f) }),
  messages: (params: {
    contact_id: string;
    from: string;
    to: string;
    page?: number;
    limit?: number;
    around?: string;
    type?: string;
    direction?: string;
  }) => api.get('/history/messages', { params }),
  search: (params: { q: string; from: string; to: string; page?: number; limit?: number; account?: string; direction?: string }) =>
    api.get('/history/search', { params }),
  /** Downloads a transcript through the API client (auth cookies + org header) and saves it. */
  exportTranscript: async (params: { contact_id: string; from: string; to: string; format: ExportFormat }) => {
    const res = await api.get('/history/export', { params, responseType: 'blob' });
    const name = filenameFromDisposition(
      (res.headers as Record<string, string | undefined>)['content-disposition'],
      `chat_transcript.${params.format}`
    );
    const url = URL.createObjectURL(res.data as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return name;
  },
};
