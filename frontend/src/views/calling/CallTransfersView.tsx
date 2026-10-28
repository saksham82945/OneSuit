import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { readList, readTotal } from '@/services/response';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { ErrorState } from '@/components/shared/ErrorState';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Clock, Info, Phone, PhoneForwarded, PhoneOff, RefreshCw } from 'lucide-react';
import {
  TRANSFER_STATUS_CLASSES,
  apiErrorMessage,
  callingApi,
  formatDateTime,
  formatDuration,
  humanize,
  statusBadgeClass,
  type CallTransfer,
} from './callingApi';

const PAGE_SIZE = 20;
// The waiting queue is short-lived; poll it while the page is open.
const WAITING_POLL_MS = 15000;

const HISTORY_STATUSES = ['connected', 'completed', 'abandoned', 'no_answer', 'waiting'];

const callerName = (tr: CallTransfer) => tr.contact?.profile_name || tr.caller_phone;

const CallerCell: React.FC<{ transfer: CallTransfer }> = ({ transfer }) => {
  const ok = transfer.status === 'waiting' || transfer.status === 'connected' || transfer.status === 'completed';
  const Icon = ok ? Phone : PhoneOff;
  return (
    <div className="flex items-center gap-2.5">
      <Icon className={`h-4 w-4 shrink-0 ${ok ? 'text-emerald-400' : 'text-red-400'}`} />
      <div className="min-w-0">
        <p className="font-medium text-white text-xs light:text-gray-900">{callerName(transfer)}</p>
        {transfer.contact?.profile_name && <p className="text-[11px] font-mono text-white/40 light:text-gray-400">{transfer.caller_phone}</p>}
      </div>
    </div>
  );
};

const CallLink: React.FC<{ transfer: CallTransfer }> = ({ transfer }) =>
  transfer.call_log_id ? (
    <Link to={`/calling/logs?id=${transfer.call_log_id}`} className="text-xs text-emerald-400 hover:underline whitespace-nowrap">
      View call
    </Link>
  ) : (
    <span className="text-xs text-white/30 light:text-gray-400">-</span>
  );

export const CallTransfersView: React.FC = () => {
  const { t } = useTranslation();
  const [tab, setTab] = useState('waiting');

  // Waiting queue
  const [waiting, setWaiting] = useState<CallTransfer[]>([]);
  const [waitingLoading, setWaitingLoading] = useState(true);
  const [waitingError, setWaitingError] = useState<string | null>(null);

  // History
  const [history, setHistory] = useState<CallTransfer[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyStatus, setHistoryStatus] = useState('all');
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const fetchWaiting = useCallback(async (quiet = false) => {
    if (!quiet) setWaitingLoading(true);
    try {
      const res = await callingApi.listTransfers({ status: 'waiting', limit: 100 });
      setWaiting(readList<CallTransfer>(res, 'call_transfers'));
      setWaitingError(null);
    } catch (err) {
      setWaitingError(apiErrorMessage(err, 'Failed to load waiting transfers.'));
    } finally {
      if (!quiet) setWaitingLoading(false);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const res = await callingApi.listTransfers({
        page: historyPage,
        limit: PAGE_SIZE,
        status: historyStatus !== 'all' ? historyStatus : undefined,
      });
      setHistory(readList<CallTransfer>(res, 'call_transfers'));
      setHistoryTotal(readTotal(res, 'call_transfers'));
    } catch (err) {
      setHistoryError(apiErrorMessage(err, 'Failed to load call transfers.'));
    } finally {
      setHistoryLoading(false);
    }
  }, [historyPage, historyStatus]);

  useEffect(() => {
    fetchWaiting();
    const handle = window.setInterval(() => {
      if (document.visibilityState === 'visible') fetchWaiting(true);
    }, WAITING_POLL_MS);
    return () => window.clearInterval(handle);
  }, [fetchWaiting]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const refreshAll = () => {
    fetchWaiting();
    fetchHistory();
  };

  const waitingColumns: Column<CallTransfer>[] = [
    { key: 'caller', label: 'Caller', render: (tr) => <CallerCell transfer={tr} /> },
    {
      key: 'target',
      label: 'Waiting For',
      render: (tr) => (
        <span className="text-xs text-white/70 light:text-gray-600">{tr.team?.name || tr.agent?.full_name || 'Any agent'}</span>
      ),
    },
    {
      key: 'initiating_agent',
      label: 'Transferred By',
      render: (tr) => <span className="text-xs text-white/60 light:text-gray-600">{tr.initiating_agent?.full_name || 'IVR'}</span>,
    },
    { key: 'account', label: 'Account', render: (tr) => <span className="text-xs text-white/60 light:text-gray-600">{tr.whatsapp_account}</span> },
    {
      key: 'transferred_at',
      label: 'Waiting Since',
      render: (tr) => <span className="text-xs text-white/40 whitespace-nowrap light:text-gray-400">{formatDateTime(tr.transferred_at)}</span>,
    },
    { key: 'call', label: '', align: 'right', render: (tr) => <CallLink transfer={tr} /> },
  ];

  const historyColumns: Column<CallTransfer>[] = [
    { key: 'caller', label: 'Caller', render: (tr) => <CallerCell transfer={tr} /> },
    {
      key: 'status',
      label: 'Status',
      render: (tr) => <Badge className={statusBadgeClass(TRANSFER_STATUS_CLASSES, tr.status)}>{humanize(tr.status)}</Badge>,
    },
    { key: 'team', label: 'Team', render: (tr) => <span className="text-xs text-white/60 light:text-gray-600">{tr.team?.name || '-'}</span> },
    {
      key: 'initiating_agent',
      label: 'Transferred By',
      render: (tr) => <span className="text-xs text-white/60 light:text-gray-600">{tr.initiating_agent?.full_name || 'IVR'}</span>,
    },
    {
      key: 'agent',
      label: 'Picked Up By',
      render: (tr) => <span className="text-xs text-white/60 light:text-gray-600">{tr.agent?.full_name || '-'}</span>,
    },
    {
      key: 'hold_duration',
      label: 'Hold',
      render: (tr) => <span className="font-mono text-xs text-white/70 light:text-gray-600">{formatDuration(tr.hold_duration)}</span>,
    },
    {
      key: 'talk_duration',
      label: 'Talk',
      render: (tr) => <span className="font-mono text-xs text-white/70 light:text-gray-600">{formatDuration(tr.talk_duration)}</span>,
    },
    {
      key: 'transferred_at',
      label: 'Transferred At',
      render: (tr) => <span className="text-xs text-white/40 whitespace-nowrap light:text-gray-400">{formatDateTime(tr.transferred_at)}</span>,
    },
    { key: 'call', label: '', align: 'right', render: (tr) => <CallLink transfer={tr} /> },
  ];

  return (
    <div className="flex flex-col h-full bg-[#0a0a0b] light:bg-gray-50 overflow-hidden">
      <PageHeader
        title={t('nav.callTransfers') || 'Call Transfers'}
        subtitle="Calls handed from the IVR or an agent to a team, and how each transfer ended"
        icon={PhoneForwarded}
        iconGradient="bg-gradient-to-br from-blue-500 to-indigo-600 shadow-blue-500/20"
        actions={
          <Button variant="outline" size="sm" onClick={refreshAll} disabled={waitingLoading || historyLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${waitingLoading || historyLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-6">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="waiting">
              Waiting
              {waiting.length > 0 && (
                <span className="ml-2 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-black">
                  {waiting.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="waiting" className="mt-4">
            <Card className="card-depth border-white/[0.08] bg-[#141415] text-white light:border-gray-200 light:bg-white light:text-gray-900">
              <CardHeader className="pb-4">
                <CardTitle className="text-base font-semibold">Waiting for an agent</CardTitle>
                <CardDescription className="text-xs text-white/50 light:text-gray-500">
                  Callers on hold right now. This list refreshes every 15 seconds.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-2 rounded-lg border border-blue-500/20 bg-blue-500/[0.06] px-3 py-2.5 text-xs text-blue-200/80">
                  <Info className="h-4 w-4 shrink-0 text-blue-400 mt-px" />
                  <span>
                    Picking up a transfer needs the in-browser call panel (microphone and WebRTC audio), which this app
                    doesn't have yet, so transfers can't be accepted from this screen.
                  </span>
                </div>
                {waitingError && !waitingLoading ? (
                  <ErrorState title="Couldn't load waiting transfers" description={waitingError} onRetry={() => fetchWaiting()} />
                ) : (
                  <DataTable
                    items={waiting}
                    columns={waitingColumns}
                    isLoading={waitingLoading}
                    emptyIcon={PhoneForwarded}
                    emptyTitle="No callers waiting"
                    emptyDescription="When the IVR or an agent transfers a call to a team, it waits here until someone picks up."
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <Card className="card-depth border-white/[0.08] bg-[#141415] text-white light:border-gray-200 light:bg-white light:text-gray-900">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <CardTitle className="text-base font-semibold">Transfer history</CardTitle>
                    <CardDescription className="text-xs text-white/50 light:text-gray-500">
                      {historyTotal > 0 ? `${historyTotal} transfer${historyTotal === 1 ? '' : 's'}` : 'Every call transfer, newest first'}
                    </CardDescription>
                  </div>
                  <Select
                    value={historyStatus}
                    onValueChange={(v) => {
                      setHistoryStatus(v);
                      setHistoryPage(1);
                    }}
                  >
                    <SelectTrigger className="w-44" aria-label="Filter by status">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      {HISTORY_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {humanize(s)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {historyError && !historyLoading ? (
                  <ErrorState title="Couldn't load call transfers" description={historyError} onRetry={fetchHistory} />
                ) : (
                  <DataTable
                    items={history}
                    columns={historyColumns}
                    isLoading={historyLoading}
                    currentPage={historyPage}
                    totalItems={historyTotal}
                    pageSize={PAGE_SIZE}
                    onPageChange={setHistoryPage}
                    emptyIcon={Clock}
                    emptyTitle={historyStatus === 'all' ? 'No call transfers yet' : 'No transfers with this status'}
                    emptyDescription="Transfers are recorded when an IVR transfer step or an agent hands a call to a team."
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default CallTransfersView;
