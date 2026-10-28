/**
 * Types and request helpers for the calling screens (call logs, call transfers, IVR flows).
 *
 * Shapes mirror the Go models in internal/models/call.go; endpoints mirror the
 * routes in cmd/whatomate/main.go and services/api.ts.
 */
import { api } from '@/services/api';

// ---- Shared relation shapes -------------------------------------------------

export interface UserRef {
  id: string;
  full_name?: string;
  email?: string;
}

export interface ContactRef {
  id: string;
  profile_name?: string;
  phone_number?: string;
}

export interface TeamRef {
  id: string;
  name: string;
}

// ---- Call logs ---------------------------------------------------------------

export type CallDirection = 'incoming' | 'outgoing';

export type CallStatus =
  | 'ringing'
  | 'answered'
  | 'completed'
  | 'missed'
  | 'rejected'
  | 'failed'
  | 'transferring'
  | 'initiating'
  | 'accepted';

export type DisconnectedBy = 'client' | 'agent' | 'system';

/** One step of the path a caller took through IVR flows (call_logs.ivr_path.steps). */
export interface IVRPathStep {
  node?: string;
  type?: string;
  label?: string;
  digit?: string;
  option_label?: string;
  outcome?: string;
  action?: string;
  flow?: string;
}

export interface CallLog {
  id: string;
  created_at: string;
  updated_at?: string;
  whatsapp_account: string;
  contact_id?: string;
  whatsapp_call_id?: string;
  caller_phone: string;
  direction: CallDirection;
  status: CallStatus | string;
  duration: number;
  ivr_flow_id?: string;
  ivr_path?: { steps?: IVRPathStep[] } | null;
  agent_id?: string;
  started_at?: string;
  answered_at?: string;
  ended_at?: string;
  disconnected_by?: DisconnectedBy | '';
  error_message?: string;
  recording_s3_key?: string;
  recording_duration?: number;
  recording_error?: string;
  contact?: ContactRef | null;
  ivr_flow?: { id: string; name: string } | null;
  agent?: UserRef | null;
}

// ---- Call transfers ----------------------------------------------------------

export type CallTransferStatus = 'waiting' | 'connected' | 'completed' | 'abandoned' | 'no_answer';

export interface CallTransfer {
  id: string;
  created_at: string;
  call_log_id: string;
  caller_phone: string;
  contact_id?: string;
  whatsapp_account: string;
  status: CallTransferStatus | string;
  team_id?: string;
  agent_id?: string;
  initiating_agent_id?: string;
  transferred_at: string;
  connected_at?: string;
  completed_at?: string;
  hold_duration: number;
  talk_duration: number;
  contact?: ContactRef | null;
  agent?: UserRef | null;
  initiating_agent?: UserRef | null;
  team?: TeamRef | null;
}

// ---- IVR flows ---------------------------------------------------------------

export type IVRNodeType =
  | 'greeting'
  | 'menu'
  | 'gather'
  | 'http_callback'
  | 'transfer'
  | 'goto_flow'
  | 'timing'
  | 'hangup';

export type IVRNodeConfig = Record<string, unknown>;

export interface IVRNode {
  id: string;
  type: IVRNodeType;
  label: string;
  position: { x: number; y: number };
  config: IVRNodeConfig;
}

export interface IVREdge {
  from: string;
  to: string;
  condition: string;
}

/** The v2 flow graph stored in ivr_flows.menu. */
export interface IVRFlowData {
  version: 2;
  nodes: IVRNode[];
  edges: IVREdge[];
  entry_node: string;
}

export interface IVRFlow {
  id: string;
  created_at: string;
  updated_at: string;
  whatsapp_account: string;
  name: string;
  description: string;
  is_active: boolean;
  is_call_start: boolean;
  is_outgoing_end: boolean;
  menu: Partial<IVRFlowData> | null;
  created_by?: UserRef | null;
  updated_by?: UserRef | null;
}

export interface IVRFlowPayload {
  name?: string;
  description?: string;
  whatsapp_account?: string;
  is_active: boolean;
  is_call_start: boolean;
  is_outgoing_end: boolean;
  menu?: IVRFlowData;
}

export const emptyFlowData = (): IVRFlowData => ({ version: 2, nodes: [], edges: [], entry_node: '' });

// ---- Requests ----------------------------------------------------------------

type Params = Record<string, string | number | undefined>;

export const callingApi = {
  listCallLogs: (params: Params) => api.get('/call-logs', { params }),
  getCallLog: (id: string) => api.get(`/call-logs/${id}`),
  getRecording: (id: string) => api.get(`/call-logs/${id}/recording`),

  listTransfers: (params: Params) => api.get('/call-transfers', { params }),

  listIVRFlows: (params?: Params) => api.get('/ivr-flows', { params }),
  getIVRFlow: (id: string) => api.get(`/ivr-flows/${id}`),
  createIVRFlow: (data: IVRFlowPayload & { name: string; whatsapp_account: string }) =>
    api.post('/ivr-flows', data),
  // The backend always writes is_active / is_call_start / is_outgoing_end on update,
  // so every update must send all three (see UpdateIVRFlow in internal/handlers/ivr_flows.go).
  updateIVRFlow: (id: string, data: IVRFlowPayload) => api.put(`/ivr-flows/${id}`, data),
  deleteIVRFlow: (id: string) => api.delete(`/ivr-flows/${id}`),
  uploadIVRAudio: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    // The axios instance defaults to JSON, which would serialise the FormData;
    // naming multipart lets the browser set the boundary itself.
    return api.post('/ivr-flows/audio', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  ivrAudioUrl: (filename: string) => `${api.defaults.baseURL}/ivr-flows/audio/${encodeURIComponent(filename)}`,

  listAccounts: () => api.get('/accounts'),
  listTeams: () => api.get('/teams', { params: { limit: 100 } }),
};

// ---- Formatting --------------------------------------------------------------

/** The backend's `{ status: 'error', message }` text, if the request got that far. */
export const apiErrorMessage = (err: unknown, fallback: string): string =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;

export const formatDuration = (seconds?: number): string => {
  if (!seconds) return '-';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
};

export const formatDateTime = (value?: string | null): string => {
  if (!value) return '-';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString();
};

export const humanize = (value?: string): string =>
  (value || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const CALL_STATUS_CLASSES: Record<string, string> = {
  completed: 'bg-emerald-500/15 text-emerald-400',
  answered: 'bg-emerald-500/15 text-emerald-400',
  accepted: 'bg-emerald-500/15 text-emerald-400',
  ringing: 'bg-blue-500/15 text-blue-400',
  initiating: 'bg-blue-500/15 text-blue-400',
  transferring: 'bg-amber-500/15 text-amber-400',
  missed: 'bg-orange-500/15 text-orange-400',
  rejected: 'bg-red-500/15 text-red-400',
  failed: 'bg-red-500/15 text-red-400',
};

export const TRANSFER_STATUS_CLASSES: Record<string, string> = {
  waiting: 'bg-amber-500/15 text-amber-400',
  connected: 'bg-emerald-500/15 text-emerald-400',
  completed: 'bg-white/[0.08] text-white/70',
  abandoned: 'bg-red-500/15 text-red-400',
  no_answer: 'bg-orange-500/15 text-orange-400',
};

export const statusBadgeClass = (map: Record<string, string>, status: string): string =>
  `${map[status] || 'bg-white/[0.08] text-white/60'} border-0 text-[10px] font-medium uppercase tracking-wide`;
