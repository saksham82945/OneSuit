import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DeliveryBar, DeliveryLegend, StatCard, StatusBadge, ConfirmDialog } from './campaignUi';
import {
  AlertCircle,
  ArrowLeft,
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Eye,
  FileText,
  Loader2,
  Megaphone,
  Pause,
  Percent,
  Phone,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { campaignsService } from '@/services/api';
import { readData, readList } from '@/services/response';
import { useAuthStore } from '@/stores/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  type CampaignRow,
  cardCls,
  downloadCsv,
  errorMessage,
  fmtDate,
  fmtNum,
  fmtPct,
  pct,
} from './campaignFormat';

/** models.BulkMessageRecipient as returned by GET /api/campaigns/{id}/recipients */
interface Recipient {
  id: string;
  phone_number: string;
  recipient_name?: string;
  status?: string;
  error_message?: string;
  whatsapp_message_id?: string;
  sent_at?: string;
  delivered_at?: string;
  read_at?: string;
  created_at?: string;
}

const RECIPIENT_STATUSES = ['pending', 'sent', 'delivered', 'read', 'failed'] as const;
const PAGE_SIZE = 25;
const POLL_MS = 5000;
const LIVE_STATUSES = ['processing', 'queued', 'running'];

type Confirm = null | 'cancel' | 'delete';

export const CampaignManageView: React.FC<{ id: string }> = ({ id }) => {
  const navigate = useNavigate();
  const { hasPermission } = useAuthStore();
  const canManage = hasPermission('campaigns', 'write') || hasPermission('campaigns', 'execute');
  const canDelete = hasPermission('campaigns', 'delete') || hasPermission('campaigns', 'write');

  const [campaign, setCampaign] = useState<CampaignRow | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [isExporting, setIsExporting] = useState(false);

  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [recTotal, setRecTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [recLoading, setRecLoading] = useState(true);
  const [recStatus, setRecStatus] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const loadCampaign = useCallback(async () => {
    try {
      setCampaign(readData<CampaignRow>(await campaignsService.get(id)));
      setNotFound(false);
      setLastUpdated(new Date());
    } catch (err) {
      if ((err as { response?: { status?: number } })?.response?.status === 404) setNotFound(true);
      else toast.error(errorMessage(err, 'Failed to load campaign'));
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  // Track the latest request so slow responses don't overwrite newer filters.
  const recReq = useRef(0);
  const loadRecipients = useCallback(async (quiet = false) => {
    const req = ++recReq.current;
    if (!quiet) setRecLoading(true);
    try {
      const res = await campaignsService.getRecipients(id, {
        status: recStatus === 'all' ? undefined : recStatus,
        search: search || undefined,
        page,
        limit: PAGE_SIZE,
      });
      if (req !== recReq.current) return;
      const data = readData<{ total?: number; status_counts?: Record<string, number> }>(res);
      const list = readList<Recipient>(res, 'recipients');
      // An older backend ignores page/limit and returns everything: page on the client.
      const serverPaged = typeof (data as { page?: unknown })?.page === 'number';
      setRecipients(serverPaged ? list : list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE));
      setRecTotal(typeof data?.total === 'number' ? data.total : list.length);
      setStatusCounts(data?.status_counts || {});
    } catch (err) {
      if (req === recReq.current && !quiet) toast.error(errorMessage(err, 'Failed to load recipients'));
    } finally {
      if (req === recReq.current) setRecLoading(false);
    }
  }, [id, recStatus, search, page]);

  useEffect(() => { void loadCampaign(); }, [loadCampaign]);
  useEffect(() => { void loadRecipients(); }, [loadRecipients]);

  const status = (campaign?.status || '').toLowerCase();
  const isLive = LIVE_STATUSES.includes(status);

  // Auto-refresh while the campaign is sending.
  useEffect(() => {
    if (!isLive) return;
    const t = setInterval(() => {
      if (document.hidden) return;
      void loadCampaign();
      void loadRecipients(true);
    }, POLL_MS);
    return () => clearInterval(t);
  }, [isLive, loadCampaign, loadRecipients]);

  const refreshAll = async () => {
    await Promise.all([loadCampaign(), loadRecipients(true)]);
  };

  const total = campaign?.total_recipients || 0;
  const pending = statusCounts.pending ?? Math.max(total - (campaign?.sent_count || 0) - (campaign?.failed_count || 0), 0);
  const failed = campaign?.failed_count || 0;
  const canStart = canManage && ['draft', 'scheduled', 'paused'].includes(status) && total > 0;
  const canPause = canManage && isLive;
  const canCancel = canManage && !!status && !['completed', 'cancelled'].includes(status);
  const canRetry = canManage && ['completed', 'paused', 'failed'].includes(status) && (failed > 0 || (statusCounts.failed || 0) > 0);
  const canRemove = canDelete && !!status && !isLive;

  const act = async (kind: 'start' | 'pause' | 'cancel' | 'retry' | 'delete') => {
    if (!campaign) return;
    setActing(kind);
    try {
      if (kind === 'delete') {
        await campaignsService.delete(campaign.id);
        toast.success('Campaign deleted');
        navigate('/campaigns');
        return;
      }
      const call = {
        start: campaignsService.start,
        pause: campaignsService.pause,
        cancel: campaignsService.cancel,
        retry: campaignsService.retryFailed,
      }[kind];
      const res = await call(campaign.id);
      const fallback = { start: 'Campaign started', pause: 'Campaign paused', cancel: 'Campaign cancelled', retry: 'Retrying failed messages' }[kind];
      toast.success(readData<{ message?: string }>(res)?.message || fallback);
      await refreshAll();
    } catch (err) {
      toast.error(errorMessage(err, `Could not ${kind === 'retry' ? 'retry failed messages' : `${kind} the campaign`}`));
    } finally {
      setActing(null);
      setConfirm(null);
    }
  };

  const removeRecipient = async (r: Recipient) => {
    if (!campaign) return;
    try {
      await campaignsService.deleteRecipient(campaign.id, r.id);
      toast.success('Recipient removed');
      await refreshAll();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to remove recipient'));
    }
  };

  const exportCsv = async () => {
    if (!campaign) return;
    setIsExporting(true);
    try {
      // No page/limit → the backend returns every recipient (status/search still apply).
      const res = await campaignsService.getRecipients(campaign.id, {
        status: recStatus === 'all' ? undefined : recStatus,
        search: search || undefined,
      });
      const list = readList<Recipient>(res, 'recipients');
      const safe = campaign.name.replace(/[^\w-]+/g, '_').slice(0, 60) || 'campaign';
      downloadCsv(`${safe}-recipients.csv`, [
        ['Phone number', 'Name', 'Status', 'Error', 'Sent at', 'Delivered at', 'Read at', 'WhatsApp message ID'],
        ...list.map((r) => [r.phone_number, r.recipient_name, r.status, r.error_message, r.sent_at, r.delivered_at, r.read_at, r.whatsapp_message_id]),
      ]);
      toast.success(`Exported ${list.length} recipient${list.length === 1 ? '' : 's'}`);
    } catch (err) {
      toast.error(errorMessage(err, 'Export failed'));
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-[#f8faf9] p-8 text-sm text-gray-500 dark:bg-[#0b1110] dark:text-gray-400">
        <Loader2 className="mr-2 h-4 w-4 animate-spin text-emerald-500" /> Loading campaign…
      </div>
    );
  }

  if (!campaign || notFound) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-[#f8faf9] p-8 text-center dark:bg-[#0b1110]">
        <AlertCircle className="h-8 w-8 text-gray-400" />
        <p className="text-sm text-gray-600 dark:text-gray-300">This campaign could not be found.</p>
        <Button variant="outline" size="sm" onClick={() => navigate('/campaigns')}>Back to campaigns</Button>
      </div>
    );
  }

  const pageCount = Math.max(1, Math.ceil(recTotal / PAGE_SIZE));
  const processed = (campaign.sent_count || 0) + failed;
  const progress = total ? Math.min(100, Math.round((processed / total) * 100)) : 0;

  const timeline: Array<{ label: string; at?: string; done: boolean; icon: React.ComponentType<{ className?: string }> }> = [
    { label: 'Created', at: campaign.created_at, done: !!campaign.created_at, icon: FileText },
    ...(campaign.scheduled_at ? [{ label: 'Scheduled for', at: campaign.scheduled_at, done: true, icon: Clock }] : []),
    { label: 'Started', at: campaign.started_at, done: !!campaign.started_at, icon: Play },
    {
      label: status === 'cancelled' ? 'Cancelled' : status === 'failed' ? 'Failed' : 'Completed',
      at: campaign.completed_at,
      done: !!campaign.completed_at || ['completed', 'cancelled', 'failed'].includes(status),
      icon: status === 'cancelled' ? Ban : status === 'failed' ? AlertCircle : CheckCircle2,
    },
  ];

  const busy = acting !== null;

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[#f8faf9] text-gray-900 dark:bg-[#0b1110] dark:text-gray-100">
      <div className="mx-auto w-full max-w-6xl space-y-5 p-4 sm:p-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <Link
              to="/campaigns"
              aria-label="Back to campaigns"
              className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm shadow-emerald-500/20 sm:flex">
              <Megaphone className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="break-words text-lg font-bold text-gray-900 dark:text-white">{campaign.name}</h1>
                <StatusBadge status={campaign.status} />
              </div>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                {isLive ? 'Sending now · refreshes every 5 seconds' : lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : ''}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            {canStart && (
              <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-500" disabled={busy} onClick={() => void act('start')}>
                {acting === 'start' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
                {status === 'paused' ? 'Resume' : 'Start broadcast'}
              </Button>
            )}
            {canPause && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void act('pause')}>
                {acting === 'pause' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Pause className="mr-1.5 h-3.5 w-3.5" />}
                Pause
              </Button>
            )}
            {canRetry && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void act('retry')}>
                {acting === 'retry' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="mr-1.5 h-3.5 w-3.5" />}
                Retry failed ({fmtNum(statusCounts.failed ?? failed)})
              </Button>
            )}
            <Button size="sm" variant="outline" disabled={isExporting || total === 0} onClick={() => void exportCsv()}>
              {isExporting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1.5 h-3.5 w-3.5" />}
              Export CSV
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void refreshAll()} aria-label="Refresh">
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
            {canCancel && (
              <Button size="sm" variant="ghost" className="text-amber-700 hover:bg-amber-50 hover:text-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/40" disabled={busy} onClick={() => setConfirm('cancel')}>
                <Ban className="mr-1.5 h-3.5 w-3.5" /> Cancel
              </Button>
            )}
            {canRemove && (
              <Button size="sm" variant="ghost" className="text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-950/40" disabled={busy} onClick={() => setConfirm('delete')}>
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
              </Button>
            )}
          </div>
        </div>

        {status === 'draft' && total === 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
            This draft has no recipients yet, so it can't be started.
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Recipients" value={fmtNum(total)} hint={`${fmtNum(pending)} pending`} icon={Users} />
          <StatCard label="Sent" value={fmtNum(campaign.sent_count)} hint={total ? `${fmtPct(pct(campaign.sent_count, total))} of recipients` : undefined} icon={Send} tone="sky" />
          <StatCard label="Delivered" value={fmtNum(campaign.delivered_count)} hint={campaign.sent_count ? `${fmtPct(pct(campaign.delivered_count, campaign.sent_count))} delivery rate` : undefined} icon={CheckCircle2} tone="emerald" />
          <StatCard label="Read" value={fmtNum(campaign.read_count)} hint={campaign.delivered_count ? `${fmtPct(pct(campaign.read_count, campaign.delivered_count))} read rate` : undefined} icon={Eye} tone="teal" />
          <StatCard label="Failed" value={fmtNum(failed)} hint={processed ? `${fmtPct(pct(failed, processed))} of attempts` : undefined} icon={AlertCircle} tone="rose" />
          <StatCard label="Delivery rate" value={fmtPct(pct(campaign.delivered_count, campaign.sent_count))} hint="Delivered ÷ sent" icon={Percent} tone="emerald" />
          <StatCard label="Read rate" value={fmtPct(pct(campaign.read_count, campaign.delivered_count))} hint="Read ÷ delivered" icon={Percent} tone="violet" />
          <StatCard label="Progress" value={`${progress}%`} hint={`${fmtNum(processed)} of ${fmtNum(total)} processed`} icon={Clock} tone="sky" />
        </div>

        <div className={cn(cardCls, 'p-4')}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Delivery progress</h2>
            <DeliveryLegend />
          </div>
          <DeliveryBar c={campaign} className="h-2.5" />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Details */}
          <div className={cn(cardCls, 'p-4')}>
            <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">Details</h2>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-xs">
              <dt className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400"><FileText className="h-3.5 w-3.5" /> Template</dt>
              <dd className="truncate font-medium text-gray-900 dark:text-white">
                {campaign.template_id ? (
                  <Link to={`/templates/${campaign.template_id}`} className="hover:text-emerald-700 hover:underline dark:hover:text-emerald-400">
                    {campaign.template_name || campaign.template_id}
                  </Link>
                ) : '—'}
              </dd>
              <dt className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400"><Phone className="h-3.5 w-3.5" /> WhatsApp number</dt>
              <dd className="truncate font-medium text-gray-900 dark:text-white">{campaign.whatsapp_account || '—'}</dd>
              {campaign.header_media_filename && (
                <>
                  <dt className="text-gray-500 dark:text-gray-400">Header media</dt>
                  <dd className="truncate text-gray-900 dark:text-white">{campaign.header_media_filename}</dd>
                </>
              )}
              <dt className="text-gray-500 dark:text-gray-400">Created by</dt>
              <dd className="truncate text-gray-900 dark:text-white">{campaign.created_by_name || '—'}</dd>
              {campaign.updated_by_name && (
                <>
                  <dt className="text-gray-500 dark:text-gray-400">Last edited by</dt>
                  <dd className="truncate text-gray-900 dark:text-white">{campaign.updated_by_name}</dd>
                </>
              )}
              <dt className="text-gray-500 dark:text-gray-400">Campaign ID</dt>
              <dd className="truncate font-mono text-[11px] text-gray-500 dark:text-gray-400">{campaign.id}</dd>
            </dl>
          </div>

          {/* Timeline */}
          <div className={cn(cardCls, 'p-4')}>
            <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">Timeline</h2>
            <ol className="relative space-y-4 border-l border-gray-200 pl-5 dark:border-white/10">
              {timeline.map((step) => {
                const Icon = step.icon;
                return (
                  <li key={step.label} className="relative">
                    <span
                      className={cn(
                        'absolute -left-[31px] flex h-5 w-5 items-center justify-center rounded-full ring-4 ring-white dark:ring-[#141b1a]',
                        step.done ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-400 dark:bg-white/10 dark:text-gray-500'
                      )}
                    >
                      <Icon className="h-3 w-3" />
                    </span>
                    <p className={cn('text-xs font-semibold', step.done ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500')}>{step.label}</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">{step.at ? fmtDate(step.at) : step.done ? '—' : 'Not yet'}</p>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>

        {/* Recipients */}
        <div className={cn(cardCls, 'overflow-hidden')}>
          <div className="space-y-3 border-b border-gray-100 px-4 py-3 dark:border-white/[0.06]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Recipients</h2>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">{fmtNum(recTotal)} {recStatus !== 'all' || search ? 'matching' : 'total'}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(['all', ...RECIPIENT_STATUSES] as const).map((st) => {
                  const n = st === 'all' ? Object.values(statusCounts).reduce((a, b) => a + b, 0) : statusCounts[st] || 0;
                  return (
                    <button
                      key={st}
                      type="button"
                      onClick={() => { setRecStatus(st); setPage(1); }}
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-[11px] font-medium capitalize transition-colors',
                        recStatus === st
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:border-emerald-500/70 dark:bg-emerald-950/50 dark:text-emerald-300'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/[0.04]'
                      )}
                    >
                      {st} <span className="tabular-nums text-gray-400">{fmtNum(n)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <Input
                  aria-label="Search recipients"
                  placeholder="Search phone number or name"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="h-9 pl-8 pr-8 text-sm"
                />
                {searchInput && (
                  <button type="button" aria-label="Clear search" onClick={() => setSearchInput('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <Select value={recStatus} onValueChange={(v) => { setRecStatus(v); setPage(1); }}>
                <SelectTrigger aria-label="Recipient status" className="h-9 text-sm sm:w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {RECIPIENT_STATUSES.map((st) => <SelectItem key={st} value={st} className="capitalize">{st}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {recLoading && recipients.length === 0 ? (
            <div className="flex items-center justify-center gap-2 p-10 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin text-emerald-500" /> Loading recipients…
            </div>
          ) : recipients.length === 0 ? (
            <div className="p-10 text-center text-sm text-gray-500 dark:text-gray-400">
              {recStatus !== 'all' || search ? 'No recipients match.' : 'No recipients in this campaign.'}
            </div>
          ) : (
            <>
              {/* Phone: cards */}
              <ul className="divide-y divide-gray-100 md:hidden dark:divide-white/[0.06]">
                {recipients.map((r) => (
                  <li key={r.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{r.phone_number}</p>
                        {r.recipient_name && <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">{r.recipient_name}</p>}
                      </div>
                      <div className="flex items-center gap-1">
                        <StatusBadge status={r.status} />
                        {status === 'draft' && canManage && (
                          <button type="button" aria-label={`Remove ${r.phone_number}`} onClick={() => void removeRecipient(r)} className="rounded p-1 text-gray-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    {r.error_message && <p className="mt-1 break-words text-[11px] text-rose-600 dark:text-rose-400">{r.error_message}</p>}
                    <p className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">
                      Sent {fmtDate(r.sent_at)} · Delivered {fmtDate(r.delivered_at)} · Read {fmtDate(r.read_at)}
                    </p>
                  </li>
                ))}
              </ul>

              {/* Desktop: table */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500 dark:bg-white/[0.03] dark:text-gray-400">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">Recipient</th>
                      <th className="px-3 py-2.5 font-semibold">Status</th>
                      <th className="px-3 py-2.5 font-semibold">Error</th>
                      <th className="px-3 py-2.5 font-semibold">Sent</th>
                      <th className="px-3 py-2.5 font-semibold">Delivered</th>
                      <th className="px-3 py-2.5 font-semibold">Read</th>
                      {status === 'draft' && canManage && <th className="w-10 px-3 py-2.5" />}
                    </tr>
                  </thead>
                  <tbody className={cn('divide-y divide-gray-100 dark:divide-white/[0.06]', recLoading && 'opacity-60')}>
                    {recipients.map((r) => (
                      <tr key={r.id} className="align-top hover:bg-gray-50/60 dark:hover:bg-white/[0.02]">
                        <td className="px-4 py-2.5">
                          <p className="font-medium text-gray-900 dark:text-white">{r.phone_number}</p>
                          {r.recipient_name && <p className="text-[11px] text-gray-500 dark:text-gray-400">{r.recipient_name}</p>}
                        </td>
                        <td className="px-3 py-2.5"><StatusBadge status={r.status} /></td>
                        <td className="max-w-[280px] px-3 py-2.5 text-[11px] text-rose-600 dark:text-rose-400">
                          {r.error_message ? <span className="line-clamp-2 break-words" title={r.error_message}>{r.error_message}</span> : <span className="text-gray-300 dark:text-gray-600">—</span>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-gray-600 dark:text-gray-300">{fmtDate(r.sent_at)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-gray-600 dark:text-gray-300">{fmtDate(r.delivered_at)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-gray-600 dark:text-gray-300">{fmtDate(r.read_at)}</td>
                        {status === 'draft' && canManage && (
                          <td className="px-3 py-2.5">
                            <button type="button" aria-label={`Remove ${r.phone_number}`} title="Remove recipient" onClick={() => void removeRecipient(r)} className="rounded p-1 text-gray-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {pageCount > 1 && (
                <div className="flex items-center justify-between border-t border-gray-100 px-4 py-2.5 text-xs text-gray-500 dark:border-white/[0.06] dark:text-gray-400">
                  <span>Page {page} of {pageCount}</span>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" className="h-7 px-2" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 px-2" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirm === 'cancel'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Cancel campaign?"
        description={`"${campaign.name}" will stop sending. Messages already sent stay sent; pending recipients will not be messaged. This can't be undone.`}
        confirmLabel="Cancel campaign"
        busyLabel="Cancelling…"
        cancelLabel="Keep it"
        isSubmitting={acting === 'cancel'}
        onConfirm={() => void act('cancel')}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Delete campaign?"
        description={`"${campaign.name}" and its ${fmtNum(total)} recipient record${total === 1 ? '' : 's'} will be deleted permanently.`}
        confirmLabel="Delete"
        busyLabel="Deleting…"
        isSubmitting={acting === 'delete'}
        onConfirm={() => void act('delete')}
      />
    </div>
  );
};

export default CampaignManageView;
