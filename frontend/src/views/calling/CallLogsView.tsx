import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { readData, readList, readTotal } from '@/services/response';
import { PageHeader } from '@/components/shared/PageHeader';
import { SearchInput } from '@/components/shared/SearchInput';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { ErrorState } from '@/components/shared/ErrorState';
import { IconButton } from '@/components/shared/IconButton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  ArrowRightLeft,
  ExternalLink,
  Eye,
  Headphones,
  Link as LinkIcon,
  Loader2,
  Mic,
  PhoneCall,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  RefreshCw,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  CALL_STATUS_CLASSES,
  TRANSFER_STATUS_CLASSES,
  apiErrorMessage,
  callingApi,
  formatDateTime,
  formatDuration,
  humanize,
  statusBadgeClass,
  type CallLog,
  type CallTransfer,
  type IVRFlow,
} from './callingApi';
import { IVRPathTree } from './IVRPathTree';

const PAGE_SIZE = 20;

// Values accepted by the `status` filter of GET /api/call-logs (models.CallStatus).
const STATUS_OPTIONS = ['completed', 'missed', 'ringing', 'answered', 'rejected', 'failed', 'transferring', 'initiating', 'accepted'];

const DISCONNECTED_BY_LABELS: Record<string, string> = {
  client: 'Caller',
  agent: 'Agent',
  system: 'System',
};

const callerName = (log: CallLog) => log.contact?.profile_name || log.caller_phone;

const DirectionIcon: React.FC<{ log: CallLog; className?: string }> = ({ log, className = 'h-3.5 w-3.5' }) =>
  log.direction === 'incoming' ? <PhoneIncoming className={className} /> : <PhoneOutgoing className={className} />;

const DetailField: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="min-w-0">
    <p className="text-[11px] text-white/40 light:text-gray-400">{label}</p>
    <div className="text-xs font-medium text-white mt-0.5 break-words light:text-gray-900">{children}</div>
  </div>
);

export const CallLogsView: React.FC = () => {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const detailId = searchParams.get('id');

  // List + filters
  const [logs, setLogs] = useState<CallLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [phoneInput, setPhoneInput] = useState('');
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState('all');
  const [direction, setDirection] = useState('all');
  const [ivrFlowId, setIvrFlowId] = useState('all');
  const [account, setAccount] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Filter option sources
  const [accounts, setAccounts] = useState<{ name: string }[]>([]);
  const [ivrFlows, setIvrFlows] = useState<IVRFlow[]>([]);

  // Detail dialog (?id= in the URL so a call can be shared as a link)
  const [detail, setDetail] = useState<CallLog | null>(null);
  const [detailTransfers, setDetailTransfers] = useState<CallTransfer[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [recordingLoading, setRecordingLoading] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);

  const logsRef = useRef<CallLog[]>([]);
  logsRef.current = logs;

  // Debounce the phone search.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      setPhone(phoneInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [phoneInput]);

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await callingApi.listCallLogs({
        page,
        limit: PAGE_SIZE,
        status: status !== 'all' ? status : undefined,
        direction: direction !== 'all' ? direction : undefined,
        ivr_flow_id: ivrFlowId !== 'all' ? ivrFlowId : undefined,
        account: account !== 'all' ? account : undefined,
        phone: phone || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      });
      setLogs(readList<CallLog>(res, 'call_logs'));
      setTotal(readTotal(res, 'call_logs'));
    } catch (err) {
      setLoadError(apiErrorMessage(err, 'Failed to load call logs.'));
    } finally {
      setIsLoading(false);
    }
  }, [page, status, direction, ivrFlowId, account, phone, startDate, endDate]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    callingApi
      .listAccounts()
      .then((res) => setAccounts(readList<{ name: string }>(res, 'accounts')))
      .catch(() => undefined);
    callingApi
      .listIVRFlows({ limit: 100 })
      .then((res) => setIvrFlows(readList<IVRFlow>(res, 'ivr_flows')))
      .catch(() => undefined);
  }, []);

  // Load the call named in ?id= (from a row click or a shared link).
  useEffect(() => {
    if (!detailId) {
      setDetail(null);
      setDetailTransfers([]);
      setRecordingUrl(null);
      setRecordingError(null);
      return;
    }
    let cancelled = false;
    setDetail(logsRef.current.find((l) => l.id === detailId) ?? null);
    setDetailTransfers([]);
    setRecordingUrl(null);
    setRecordingError(null);
    setDetailLoading(true);

    (async () => {
      let log: CallLog | null = null;
      try {
        const res = await callingApi.getCallLog(detailId);
        const data = readData<{ call_log?: CallLog; transfers?: CallTransfer[] }>(res);
        if (cancelled) return;
        log = data?.call_log ?? null;
        setDetail(log);
        setDetailTransfers(data?.transfers ?? []);
      } catch (err) {
        if (cancelled) return;
        toast.error(apiErrorMessage(err, 'Call log not found'));
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.delete('id');
            return next;
          },
          { replace: true }
        );
        return;
      } finally {
        if (!cancelled) setDetailLoading(false);
      }

      if (!log?.recording_s3_key) return;
      setRecordingLoading(true);
      try {
        const res = await callingApi.getRecording(detailId);
        const data = readData<{ url?: string }>(res);
        if (!cancelled) setRecordingUrl(data?.url ?? null);
      } catch (err) {
        if (!cancelled) setRecordingError(apiErrorMessage(err, 'Recording is not available'));
      } finally {
        if (!cancelled) setRecordingLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [detailId, setSearchParams]);

  const openDetail = (log: CallLog) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('id', log.id);
      return next;
    });
  };

  const closeDetail = () => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('id');
        return next;
      },
      { replace: true }
    );
  };

  const copyDetailLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success('Link copied to clipboard');
    } catch {
      toast.error('Could not copy the link');
    }
  };

  const setFilter = (setter: (v: string) => void) => (value: string) => {
    setter(value);
    setPage(1);
  };

  const hasFilters =
    phoneInput !== '' || status !== 'all' || direction !== 'all' || ivrFlowId !== 'all' || account !== 'all' || startDate !== '' || endDate !== '';

  const clearFilters = () => {
    setPhoneInput('');
    setPhone('');
    setStatus('all');
    setDirection('all');
    setIvrFlowId('all');
    setAccount('all');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  const columns: Column<CallLog>[] = [
    {
      key: 'caller',
      label: 'Caller',
      render: (log) => (
        <button type="button" className="flex items-center gap-2.5 text-left" onClick={() => openDetail(log)}>
          <span
            className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${
              log.status === 'missed'
                ? 'bg-orange-500/10 text-orange-400'
                : log.direction === 'incoming'
                  ? 'bg-blue-500/10 text-blue-400'
                  : 'bg-emerald-500/10 text-emerald-400'
            }`}
          >
            {log.status === 'missed' ? <PhoneMissed className="h-3.5 w-3.5" /> : <DirectionIcon log={log} />}
          </span>
          <span className="min-w-0">
            <span className="block font-medium text-white text-xs hover:underline light:text-gray-900">{callerName(log)}</span>
            {log.contact?.profile_name && (
              <span className="block text-[11px] font-mono text-white/40 light:text-gray-400">{log.caller_phone}</span>
            )}
          </span>
        </button>
      ),
    },
    {
      key: 'direction',
      label: 'Direction',
      render: (log) => (
        <span className="inline-flex items-center gap-1.5 text-xs text-white/60 light:text-gray-600">
          <DirectionIcon log={log} />
          {log.direction === 'incoming' ? 'Incoming' : 'Outgoing'}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (log) => <Badge className={statusBadgeClass(CALL_STATUS_CLASSES, log.status)}>{humanize(log.status)}</Badge>,
    },
    {
      key: 'duration',
      label: 'Duration',
      render: (log) => (
        <span className="inline-flex items-center gap-1.5 font-mono text-xs text-white/70 light:text-gray-600">
          {formatDuration(log.duration)}
          {log.recording_s3_key && <Mic className="h-3.5 w-3.5 text-emerald-400" aria-label="Has recording" />}
        </span>
      ),
    },
    {
      key: 'agent',
      label: 'Agent',
      render: (log) => <span className="text-xs text-white/60 light:text-gray-600">{log.agent?.full_name || '-'}</span>,
    },
    {
      key: 'disconnected_by',
      label: 'Ended By',
      render: (log) => (
        <span className="text-xs text-white/60 light:text-gray-600">
          {log.disconnected_by ? DISCONNECTED_BY_LABELS[log.disconnected_by] || humanize(log.disconnected_by) : '-'}
        </span>
      ),
    },
    {
      key: 'ivr_flow',
      label: 'IVR Flow',
      render: (log) => <span className="text-xs text-white/60 light:text-gray-600">{log.ivr_flow?.name || '-'}</span>,
    },
    {
      key: 'whatsapp_account',
      label: 'Account',
      render: (log) => <span className="text-xs text-white/60 light:text-gray-600">{log.whatsapp_account || '-'}</span>,
    },
    {
      key: 'started_at',
      label: 'Time',
      render: (log) => <span className="text-xs text-white/40 whitespace-nowrap light:text-gray-400">{formatDateTime(log.started_at || log.created_at)}</span>,
    },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (log) => <IconButton icon={Eye} label="View call details" onClick={() => openDetail(log)} />,
    },
  ];

  return (
    <div className="flex flex-col h-full bg-[#0a0a0b] light:bg-gray-50 overflow-hidden">
      <PageHeader
        title={t('nav.callLogs') || 'Call Logs'}
        subtitle="WhatsApp voice calls with their status, duration, IVR path and recordings"
        icon={PhoneCall}
        iconGradient="bg-gradient-to-br from-blue-500 to-indigo-600 shadow-blue-500/20"
        actions={
          <Button variant="outline" size="sm" onClick={fetchLogs} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-6">
        <Card className="card-depth border-white/[0.08] bg-[#141415] text-white light:border-gray-200 light:bg-white light:text-gray-900">
          <CardHeader className="pb-4 space-y-4">
            <div>
              <CardTitle className="text-base font-semibold">Call History</CardTitle>
              <CardDescription className="text-xs text-white/50 light:text-gray-500">
                {total > 0 ? `${total} call${total === 1 ? '' : 's'}` : 'Incoming and outgoing WhatsApp calls'}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <SearchInput value={phoneInput} onChange={setPhoneInput} placeholder="Search by phone..." className="w-52" />
              <Select value={status} onValueChange={setFilter(setStatus)}>
                <SelectTrigger className="w-40" aria-label="Filter by status">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {humanize(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={direction} onValueChange={setFilter(setDirection)}>
                <SelectTrigger className="w-36" aria-label="Filter by direction">
                  <SelectValue placeholder="Direction" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All directions</SelectItem>
                  <SelectItem value="incoming">Incoming</SelectItem>
                  <SelectItem value="outgoing">Outgoing</SelectItem>
                </SelectContent>
              </Select>
              <Select value={ivrFlowId} onValueChange={setFilter(setIvrFlowId)}>
                <SelectTrigger className="w-44" aria-label="Filter by IVR flow">
                  <SelectValue placeholder="IVR flow" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All IVR flows</SelectItem>
                  {ivrFlows.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={account} onValueChange={setFilter(setAccount)}>
                <SelectTrigger className="w-44" aria-label="Filter by account">
                  <SelectValue placeholder="Account" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All accounts</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.name} value={a.name}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1.5">
                <Input
                  type="date"
                  aria-label="From date"
                  value={startDate}
                  max={endDate || undefined}
                  onChange={(e) => setFilter(setStartDate)(e.target.value)}
                  className="h-9 w-36 text-xs [color-scheme:dark] light:[color-scheme:light]"
                />
                <span className="text-xs text-white/40 light:text-gray-400">to</span>
                <Input
                  type="date"
                  aria-label="To date"
                  value={endDate}
                  min={startDate || undefined}
                  onChange={(e) => setFilter(setEndDate)(e.target.value)}
                  className="h-9 w-36 text-xs [color-scheme:dark] light:[color-scheme:light]"
                />
              </div>
              {hasFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs text-white/60 hover:text-white light:text-gray-600 light:hover:text-gray-900">
                  <X className="h-3.5 w-3.5 mr-1" /> Clear
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {loadError && !isLoading ? (
              <ErrorState title="Couldn't load call logs" description={loadError} onRetry={fetchLogs} />
            ) : (
              <DataTable
                items={logs}
                columns={columns}
                isLoading={isLoading}
                currentPage={page}
                totalItems={total}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
                emptyIcon={PhoneCall}
                emptyTitle={hasFilters ? 'No calls match these filters' : 'No calls yet'}
                emptyDescription={
                  hasFilters
                    ? 'Try a different status, date range or phone number.'
                    : 'Calls appear here once WhatsApp calling is enabled and customers call your business number.'
                }
                emptyAction={
                  hasFilters ? (
                    <Button variant="outline" size="sm" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  ) : undefined
                }
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!detailId} onOpenChange={(open) => !open && closeDetail()}>
        <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-y-auto text-white light:text-gray-900">
          <DialogHeader>
            <DialogTitle>Call Details</DialogTitle>
            <DialogDescription className="flex items-center justify-between gap-2 pr-6">
              <span className="truncate">{detail ? callerName(detail) : 'Loading…'}</span>
              <Button variant="outline" size="sm" onClick={copyDetailLink} className="h-7 text-xs shrink-0">
                <LinkIcon className="h-3.5 w-3.5 mr-1.5" /> Copy link
              </Button>
            </DialogDescription>
          </DialogHeader>

          {!detail && detailLoading ? (
            <div className="flex items-center justify-center py-10 text-white/50 light:text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : detail ? (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <DetailField label="Caller">{detail.caller_phone}</DetailField>
                <DetailField label="Direction">
                  <span className="inline-flex items-center gap-1.5">
                    <DirectionIcon log={detail} />
                    {detail.direction === 'incoming' ? 'Incoming' : 'Outgoing'}
                  </span>
                </DetailField>
                <DetailField label="Status">
                  <Badge className={statusBadgeClass(CALL_STATUS_CLASSES, detail.status)}>{humanize(detail.status)}</Badge>
                </DetailField>
                <DetailField label="Duration">{formatDuration(detail.duration)}</DetailField>
                <DetailField label="Account">{detail.whatsapp_account || '-'}</DetailField>
                <DetailField label="Started">{formatDateTime(detail.started_at || detail.created_at)}</DetailField>
                <DetailField label="Answered">{formatDateTime(detail.answered_at)}</DetailField>
                <DetailField label="Ended">{formatDateTime(detail.ended_at)}</DetailField>
                {detail.disconnected_by && (
                  <DetailField label="Ended by">
                    {DISCONNECTED_BY_LABELS[detail.disconnected_by] || humanize(detail.disconnected_by)}
                  </DetailField>
                )}
                {detail.agent && (
                  <DetailField label="Picked up by">
                    <span className="inline-flex items-center gap-1.5">
                      <Headphones className="h-3.5 w-3.5 text-white/50 light:text-gray-500" />
                      {detail.agent.full_name || detail.agent.email}
                    </span>
                  </DetailField>
                )}
                {detail.contact_id && (
                  <DetailField label="Contact">
                    <Link to={`/contacts/${detail.contact_id}`} className="text-emerald-400 hover:underline inline-flex items-center gap-1">
                      Open contact <ExternalLink className="h-3 w-3" />
                    </Link>
                  </DetailField>
                )}
              </div>

              {detailTransfers.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] text-white/40 flex items-center gap-1.5 light:text-gray-400">
                    <ArrowRightLeft className="h-3.5 w-3.5" /> Transfer history
                  </p>
                  {detailTransfers.map((tr) => (
                    <div key={tr.id} className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3 space-y-1 text-xs light:border-gray-200 light:bg-gray-50">
                      <div className="flex items-center justify-between">
                        <Badge className={statusBadgeClass(TRANSFER_STATUS_CLASSES, tr.status)}>{humanize(tr.status)}</Badge>
                        <span className="text-[11px] text-white/40 light:text-gray-400">{formatDateTime(tr.transferred_at)}</span>
                      </div>
                      {tr.team && (
                        <p className="text-white/50 light:text-gray-500">
                          Team: <span className="text-white light:text-gray-900">{tr.team.name}</span>
                        </p>
                      )}
                      {tr.initiating_agent && (
                        <p className="text-white/50 light:text-gray-500">
                          Transferred by: <span className="text-white light:text-gray-900">{tr.initiating_agent.full_name}</span>
                        </p>
                      )}
                      {tr.agent && (
                        <p className="text-white/50 light:text-gray-500">
                          Picked up by: <span className="text-white light:text-gray-900">{tr.agent.full_name}</span>
                        </p>
                      )}
                      {(tr.hold_duration > 0 || tr.talk_duration > 0) && (
                        <p className="text-white/50 light:text-gray-500">
                          Hold {formatDuration(tr.hold_duration)} · Talk {formatDuration(tr.talk_duration)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {detail.ivr_flow && <DetailField label="IVR flow">{detail.ivr_flow.name}</DetailField>}

              {detail.ivr_path?.steps && detail.ivr_path.steps.length > 0 && (
                <div>
                  <p className="text-[11px] text-white/40 mb-2 light:text-gray-400">IVR path</p>
                  <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3 light:border-gray-200 light:bg-gray-50">
                    <IVRPathTree steps={detail.ivr_path.steps} />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <p className="text-[11px] text-white/40 flex items-center gap-1.5 light:text-gray-400">
                  <Mic className="h-3.5 w-3.5" /> Recording
                </p>
                {!detail.recording_s3_key ? (
                  <p className="text-xs text-white/40 italic light:text-gray-400">
                    {detail.recording_error ? `Recording failed: ${detail.recording_error}` : 'No recording for this call.'}
                  </p>
                ) : recordingLoading ? (
                  <div className="flex items-center gap-2 text-xs text-white/50 light:text-gray-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading recording…
                  </div>
                ) : recordingUrl ? (
                  <div className="space-y-1.5">
                    <audio src={recordingUrl} controls preload="none" className="w-full" />
                    <div className="flex items-center justify-between text-[11px] text-white/40 light:text-gray-400">
                      <span>{detail.recording_duration ? formatDuration(detail.recording_duration) : ''}</span>
                      <a href={recordingUrl} target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline inline-flex items-center gap-1">
                        Open recording <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                    <p className="text-[10px] text-white/30 light:text-gray-400">The link expires 15 minutes after opening this call.</p>
                  </div>
                ) : (
                  <p className="text-xs text-red-400">{recordingError || 'Recording is not available.'}</p>
                )}
              </div>

              {detail.error_message && (
                <div>
                  <p className="text-[11px] text-white/40 mb-1 light:text-gray-400">Error</p>
                  <p className="text-xs text-red-400">{detail.error_message}</p>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CallLogsView;
