// Shared campaign types and formatting helpers (non-component exports).

/** Shape of handlers.CampaignResponse (GET /api/campaigns, GET /api/campaigns/{id}). */
export interface CampaignRow {
  id: string;
  name: string;
  whatsapp_account?: string;
  template_id?: string;
  template_name?: string;
  header_media_filename?: string;
  status?: string;
  total_recipients?: number;
  sent_count?: number;
  delivered_count?: number;
  read_count?: number;
  failed_count?: number;
  scheduled_at?: string;
  started_at?: string;
  completed_at?: string;
  created_by_name?: string;
  updated_by_name?: string;
  created_at?: string;
  updated_at?: string;
}

export const CAMPAIGN_STATUSES = ['draft', 'scheduled', 'queued', 'processing', 'paused', 'completed', 'cancelled', 'failed'] as const;

/** Percentage of part/whole, or null when whole is 0. */
export function pct(part: number | undefined, whole: number | undefined): number | null {
  if (!whole) return null;
  return Math.round(((part || 0) / whole) * 1000) / 10;
}

export function fmtPct(v: number | null): string {
  return v === null ? '—' : `${v}%`;
}

export function fmtNum(n: number | undefined): string {
  return (n || 0).toLocaleString();
}

export function fmtDate(iso?: string | null, withTime = true): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime()) || d.getFullYear() < 2000) return '—';
  return withTime
    ? d.toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

export const cardCls =
  'rounded-2xl border border-gray-200/90 bg-white shadow-sm dark:border-[#1e2a28] dark:bg-[#141b1a]';

export function errorMessage(err: unknown, fallback: string): string {
  const message = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  return typeof message === 'string' && message ? message : fallback;
}

/** Quote a value for CSV. */
export function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCsv(filename: string, rows: unknown[][]) {
  const csv = rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
