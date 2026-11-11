import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  RefreshCw,
  ScrollText,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/services/api';
import { readData } from '@/services/response';
import { superAdminService, type Vendor } from '@/services/superAdmin';
import { PageHeader } from '@/components/shared/PageHeader';
import { ErrorState } from '@/components/shared/ErrorState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cardClass, fieldClass, LoadingBlock, errorMessage, StatCard } from '@/views/super-admin/shared';
import { cn } from '@/lib/utils';

// Platform audit log: who changed what, in every workspace (super admin only).
// Backend: GET /api/super-admin/audit-logs (handlers/audit_platform.go).

interface AuditChange {
  field: string;
  old_value: unknown;
  new_value: unknown;
}

interface AuditLog {
  id: string;
  organization_id: string;
  organization_name: string;
  resource_type: string;
  resource_id: string;
  user_id: string;
  user_name: string;
  action: string;
  changes: AuditChange[] | null;
  created_at: string;
}

interface AuditData {
  audit_logs: AuditLog[];
  total: number;
  resource_types: string[];
  summary: { today: number; week: number; deletions_week: number; active_users_week: number };
}

const PAGE_SIZE = 50;
const NIL_ID = '00000000-0000-0000-0000-000000000000';

const ACTIONS: { id: string; label: string; cls: string }[] = [
  { id: 'created', label: 'Created', cls: 'bg-emerald-500/15 text-emerald-400 light:bg-emerald-100 light:text-emerald-700' },
  { id: 'updated', label: 'Updated', cls: 'bg-blue-500/15 text-blue-400 light:bg-blue-100 light:text-blue-700' },
  { id: 'deleted', label: 'Deleted', cls: 'bg-rose-500/15 text-rose-400 light:bg-rose-100 light:text-rose-700' },
  { id: 'approved', label: 'Approved', cls: 'bg-emerald-500/15 text-emerald-400 light:bg-emerald-100 light:text-emerald-700' },
  { id: 'rejected', label: 'Rejected', cls: 'bg-amber-500/15 text-amber-400 light:bg-amber-100 light:text-amber-700' },
  { id: 'accessed', label: 'Entered workspace', cls: 'bg-violet-500/15 text-violet-400 light:bg-violet-100 light:text-violet-700' },
];
const actionInfo = (a: string) => ACTIONS.find((x) => x.id === a) ?? { id: a, label: a, cls: 'bg-white/10 text-white/70 light:bg-gray-100 light:text-gray-700' };

const RESOURCE_LABELS: Record<string, string> = {
  organization: 'Workspace',
  organization_member: 'Team member',
  platform_config: 'Platform settings',
  payment_settings: 'Payment settings',
  plan: 'Subscription plan',
  payment: 'Payment',
  invite: 'Invite link',
  user: 'User',
  role: 'Role',
  team: 'Team',
  template: 'Template',
  campaign: 'Campaign',
  contact: 'Contact',
  contact_group: 'Contact group',
  broadcast_list: 'Broadcast list',
  chatbot_flow: 'Bot flow',
  keyword_rule: 'Keyword reply',
  ai_context: 'AI context',
  account: 'WhatsApp number',
  webhook: 'Webhook',
  canned_response: 'Canned reply',
  ivr_flow: 'IVR flow',
};
const humanize = (s: string) => s.replace(/[_.]/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const resourceLabel = (r: string) => RESOURCE_LABELS[r] ?? humanize(r);

const fmtTime = (s: string) => new Date(s).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
const ago = (s: string) => {
  const sec = Math.round((Date.now() - new Date(s).getTime()) / 1000);
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} h ago`;
  if (sec < 86400 * 7) return `${Math.floor(sec / 86400)} d ago`;
  return new Date(s).toLocaleDateString('en-IN', { dateStyle: 'medium' });
};

const show = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v);
};

/** "name: Old → New, +2 more" for the table. */
const changeSummary = (log: AuditLog) => {
  const ch = log.changes ?? [];
  if (ch.length === 0) return '';
  const first = ch[0];
  const text =
    log.action === 'created' || log.action === 'deleted' || first.old_value == null
      ? `${humanize(first.field)}: ${show(first.new_value ?? first.old_value)}`
      : `${humanize(first.field)}: ${show(first.old_value)} → ${show(first.new_value)}`;
  return ch.length > 1 ? `${text}  +${ch.length - 1} more` : text;
};

const muted = 'text-white/50 light:text-gray-500';
const selectClass = cn(fieldClass, 'h-9 rounded-md border px-2 text-sm');

const ActionBadge: React.FC<{ action: string }> = ({ action }) => {
  const a = actionInfo(action);
  return <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold', a.cls)}>{a.label}</span>;
};

export const AuditLogsView: React.FC = () => {
  const [data, setData] = useState<AuditData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [org, setOrg] = useState('');
  const [resource, setResource] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [details, setDetails] = useState<AuditLog | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    document.title = 'Audit Logs · OneSuit';
    superAdminService
      .listVendors()
      .then((v) => setVendors([...(v ?? [])].sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => setPage(1), [search, org, resource, action, from, to]);

  const params = useCallback(
    () => ({ search, organization_id: org, resource_type: resource, action, from, to }),
    [search, org, resource, action, from, to]
  );

  const reqId = useRef(0);
  const load = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    try {
      const res = await api.get('/super-admin/audit-logs', { params: { ...params(), page, limit: PAGE_SIZE } });
      if (id !== reqId.current) return;
      setData(readData<AuditData>(res) ?? null);
      setError(null);
    } catch (err) {
      if (id === reqId.current) setError(errorMessage(err, 'Could not load the audit log'));
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [params, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const exportCSV = async () => {
    setExporting(true);
    try {
      const res = await api.get('/super-admin/audit-logs', { params: { ...params(), format: 'csv' }, responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not export the audit log'));
    } finally {
      setExporting(false);
    }
  };

  const filtered = !!(search || org || resource || action || from || to);
  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setOrg('');
    setResource('');
    setAction('');
    setFrom('');
    setTo('');
  };

  const logs = data?.audit_logs ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const summary = data?.summary;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#0a0a0b] light:bg-gray-50">
      <PageHeader
        title="Audit Logs"
        subtitle="Who changed what, and when, across every workspace"
        icon={ScrollText}
        iconGradient="bg-gradient-to-br from-zinc-500 to-slate-600 shadow-zinc-500/20"
      />

      <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Actions today" value={summary ? summary.today.toLocaleString('en-IN') : '—'} icon={Activity} tone="emerald" />
          <StatCard label="Last 7 days" value={summary ? summary.week.toLocaleString('en-IN') : '—'} icon={CalendarDays} tone="blue" />
          <StatCard label="Deletions (7 days)" value={summary ? summary.deletions_week.toLocaleString('en-IN') : '—'} icon={Trash2} tone="rose" />
          <StatCard label="Active people (7 days)" value={summary ? summary.active_users_week.toLocaleString('en-IN') : '—'} icon={Users} tone="violet" />
        </div>

        <section className={cn(cardClass, 'overflow-hidden p-0')}>
          {/* Filters */}
          <div className="space-y-3 border-b border-white/[0.06] p-4 light:border-gray-100">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] flex-1">
                <Search className={cn('pointer-events-none absolute left-2.5 top-2.5 h-4 w-4', muted)} />
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search person, workspace or change"
                  className={cn(fieldClass, 'h-9 pl-8')}
                  aria-label="Search the audit log"
                />
              </div>
              <Button size="sm" variant="outline" className="h-9" onClick={() => void load()} disabled={loading} aria-label="Refresh">
                <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
              </Button>
              <Button size="sm" variant="outline" className="h-9" onClick={exportCSV} disabled={exporting || total === 0}>
                <Download className="mr-1.5 h-3.5 w-3.5" /> {exporting ? 'Exporting…' : 'Export CSV'}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
              <select value={org} onChange={(e) => setOrg(e.target.value)} className={selectClass} aria-label="Workspace">
                <option value="" className="bg-[#141415] light:bg-white">All workspaces</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id} className="bg-[#141415] light:bg-white">
                    {v.name}
                  </option>
                ))}
              </select>
              <select value={resource} onChange={(e) => setResource(e.target.value)} className={selectClass} aria-label="What changed">
                <option value="" className="bg-[#141415] light:bg-white">Everything</option>
                {(data?.resource_types ?? []).map((r) => (
                  <option key={r} value={r} className="bg-[#141415] light:bg-white">
                    {resourceLabel(r)}
                  </option>
                ))}
              </select>
              <select value={action} onChange={(e) => setAction(e.target.value)} className={selectClass} aria-label="Action">
                <option value="" className="bg-[#141415] light:bg-white">All actions</option>
                {ACTIONS.map((a) => (
                  <option key={a.id} value={a.id} className="bg-[#141415] light:bg-white">
                    {a.label}
                  </option>
                ))}
              </select>
              <Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={cn(fieldClass, 'h-9')} aria-label="From date" />
              <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={cn(fieldClass, 'h-9')} aria-label="To date" />
              <Button size="sm" variant="ghost" className="h-9" onClick={clearFilters} disabled={!filtered}>
                <X className="mr-1 h-3.5 w-3.5" /> Clear filters
              </Button>
            </div>
          </div>

          {error ? (
            <div className="p-6">
              <ErrorState title="Couldn't load the audit log" description={error} onRetry={() => void load()} />
            </div>
          ) : !data ? (
            <LoadingBlock />
          ) : logs.length === 0 ? (
            <p className={cn('p-10 text-center text-sm', muted)}>
              {filtered ? 'Nothing matches these filters.' : 'No activity recorded yet. Changes appear here as people use the platform.'}
            </p>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className={cn('border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wide light:border-gray-100', muted)}>
                      <th className="px-4 py-2.5 font-medium">When</th>
                      <th className="px-4 py-2.5 font-medium">Who</th>
                      <th className="px-4 py-2.5 font-medium">Action</th>
                      <th className="px-4 py-2.5 font-medium">What</th>
                      <th className="px-4 py-2.5 font-medium">Workspace</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.05] light:divide-gray-100">
                    {logs.map((l) => (
                      <tr key={l.id} onClick={() => setDetails(l)} className="cursor-pointer hover:bg-white/[0.03] light:hover:bg-gray-50">
                        <td className="whitespace-nowrap px-4 py-3" title={fmtTime(l.created_at)}>
                          <p className="text-xs">{ago(l.created_at)}</p>
                          <p className={cn('text-[11px]', muted)}>{fmtTime(l.created_at)}</p>
                        </td>
                        <td className="max-w-[180px] truncate px-4 py-3 font-medium">{l.user_name}</td>
                        <td className="px-4 py-3"><ActionBadge action={l.action} /></td>
                        <td className="max-w-[360px] px-4 py-3">
                          <p className="font-medium">{resourceLabel(l.resource_type)}</p>
                          <p className={cn('truncate text-xs', muted)}>{changeSummary(l)}</p>
                        </td>
                        <td className="max-w-[200px] truncate px-4 py-3">{l.organization_name || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Phone cards */}
              <ul className="divide-y divide-white/[0.05] lg:hidden light:divide-gray-100">
                {logs.map((l) => (
                  <li key={l.id} className="cursor-pointer space-y-1.5 p-4" onClick={() => setDetails(l)}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate font-medium">{l.user_name}</p>
                      <ActionBadge action={l.action} />
                    </div>
                    <p className="text-sm">
                      {resourceLabel(l.resource_type)}
                      <span className={muted}> · {l.organization_name || '—'}</span>
                    </p>
                    {changeSummary(l) && <p className={cn('truncate text-xs', muted)}>{changeSummary(l)}</p>}
                    <p className={cn('text-[11px]', muted)}>{fmtTime(l.created_at)}</p>
                  </li>
                ))}
              </ul>

              {/* Paging */}
              <div className={cn('flex items-center justify-between gap-3 border-t border-white/[0.06] px-4 py-3 text-xs light:border-gray-100', muted)}>
                <span>
                  {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total.toLocaleString('en-IN')}
                </span>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" className="h-7 px-2" disabled={page <= 1} onClick={() => setPage((n) => n - 1)} aria-label="Previous page">
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <span>
                    Page {page} of {pages}
                  </span>
                  <Button size="sm" variant="outline" className="h-7 px-2" disabled={page >= pages} onClick={() => setPage((n) => n + 1)} aria-label="Next page">
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      {/* Details */}
      <Dialog open={!!details} onOpenChange={(o) => !o && setDetails(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          {details && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  {resourceLabel(details.resource_type)} <ActionBadge action={details.action} />
                </DialogTitle>
                <DialogDescription>
                  By <b>{details.user_name}</b> in <b>{details.organization_name || 'a deleted workspace'}</b> · {fmtTime(details.created_at)}
                </DialogDescription>
              </DialogHeader>
              {details.resource_id && details.resource_id !== NIL_ID && (
                <p className={cn('text-xs', muted)}>
                  Record ID <span className="font-mono">{details.resource_id}</span>
                </p>
              )}
              {(details.changes ?? []).length === 0 ? (
                <p className={cn('text-sm', muted)}>No field details were recorded for this action.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-white/[0.08] light:border-gray-200">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className={cn('border-b border-white/[0.06] text-left light:border-gray-100', muted)}>
                        <th className="px-3 py-2 font-medium">Field</th>
                        <th className="px-3 py-2 font-medium">Before</th>
                        <th className="px-3 py-2 font-medium">After</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.05] light:divide-gray-100">
                      {(details.changes ?? []).map((c, i) => (
                        <tr key={`${c.field}-${i}`}>
                          <td className="whitespace-nowrap px-3 py-2 font-medium">{humanize(c.field)}</td>
                          <td className="max-w-[240px] break-words px-3 py-2 text-rose-400 light:text-rose-700">{show(c.old_value)}</td>
                          <td className="max-w-[240px] break-words px-3 py-2 text-emerald-400 light:text-emerald-700">{show(c.new_value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AuditLogsView;
