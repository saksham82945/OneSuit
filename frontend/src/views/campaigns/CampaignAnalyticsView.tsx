import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DeliveryBar, DeliveryLegend, StatCard, StatusBadge } from './campaignUi';
import {
  BarChart3,
  Megaphone,
  Users,
  Send,
  CheckCircle2,
  Eye,
  AlertCircle,
  Percent,
  RefreshCw,
  Download,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { accountsService, campaignsService } from '@/services/api';
import { readData, readList, readTotal } from '@/services/response';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  CAMPAIGN_STATUSES,
  type CampaignRow,
  cardCls,
  downloadCsv,
  errorMessage,
  fmtDate,
  fmtNum,
  fmtPct,
  pct,
} from './campaignFormat';

/** handlers.CampaignListSummary — aggregates over every campaign matching the filters. */
interface CampaignSummary {
  campaigns: number;
  total_recipients: number;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  failed_count: number;
  [status: string]: number;
}

const FETCH_PAGE = 100; // backend max page size
const MAX_PAGES = 10; // load at most 1,000 campaigns for the table/chart
const TABLE_PAGE = 20;

function sumRows(rows: CampaignRow[]): CampaignSummary {
  const s: CampaignSummary = { campaigns: rows.length, total_recipients: 0, sent_count: 0, delivered_count: 0, read_count: 0, failed_count: 0 };
  for (const c of rows) {
    s.total_recipients += c.total_recipients || 0;
    s.sent_count += c.sent_count || 0;
    s.delivered_count += c.delivered_count || 0;
    s.read_count += c.read_count || 0;
    s.failed_count += c.failed_count || 0;
    const st = (c.status || '').toLowerCase();
    s[st] = (s[st] || 0) + 1;
  }
  return s;
}

const dayKey = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const CampaignAnalyticsView: React.FC = () => {
  const navigate = useNavigate();

  const [status, setStatus] = useState('all');
  const [account, setAccount] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const [accounts, setAccounts] = useState<string[]>([]);
  const [rows, setRows] = useState<CampaignRow[]>([]);
  const [matched, setMatched] = useState(0);
  const [summary, setSummary] = useState<CampaignSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);

  // Debounce the name search.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    accountsService
      .list()
      .then((res) => setAccounts(readList<{ name?: string }>(res, 'accounts').map((a) => a.name).filter((n): n is string => !!n)))
      .catch(() => setAccounts([]));
  }, []);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = {
        status: status === 'all' ? undefined : status,
        whatsapp_account: account === 'all' ? undefined : account,
        search: search || undefined,
        from: from || undefined,
        to: to || undefined,
        limit: FETCH_PAGE,
      };
      const all: CampaignRow[] = [];
      let total = 0;
      let sum: CampaignSummary | null = null;
      for (let p = 1; p <= MAX_PAGES; p++) {
        const res = await campaignsService.list({ ...params, page: p });
        const items = readList<CampaignRow>(res, 'campaigns');
        all.push(...items);
        total = readTotal(res, 'campaigns');
        if (p === 1) sum = readData<{ summary?: CampaignSummary }>(res)?.summary || null;
        if (items.length < FETCH_PAGE || all.length >= total) break;
      }
      setRows(all);
      setMatched(total);
      // Older backends don't send a summary: fall back to what we loaded.
      setSummary(sum && typeof sum.campaigns === 'number' ? sum : sumRows(all));
      setPage(1);
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to load campaign analytics'));
    } finally {
      setIsLoading(false);
    }
  }, [status, account, search, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const s = summary || sumRows([]);
  const deliveryRate = pct(s.delivered_count, s.sent_count);
  const readRate = pct(s.read_count, s.delivered_count);
  const failRate = pct(s.failed_count, s.sent_count + s.failed_count);

  // Messages per day (by start date, else creation date) for the loaded campaigns.
  const daily = useMemo(() => {
    const m = new Map<string, { sent: number; delivered: number; read: number; failed: number }>();
    for (const c of rows) {
      const k = dayKey(c.started_at || c.created_at);
      if (!k) continue;
      const b = m.get(k) || { sent: 0, delivered: 0, read: 0, failed: 0 };
      b.sent += c.sent_count || 0;
      b.delivered += c.delivered_count || 0;
      b.read += c.read_count || 0;
      b.failed += c.failed_count || 0;
      m.set(k, b);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-30);
  }, [rows]);
  const dailyMax = Math.max(1, ...daily.map(([, b]) => b.sent + b.failed));

  const pageCount = Math.max(1, Math.ceil(rows.length / TABLE_PAGE));
  const pageRows = rows.slice((page - 1) * TABLE_PAGE, page * TABLE_PAGE);
  const hasFilters = status !== 'all' || account !== 'all' || !!from || !!to || !!searchInput;

  const clearFilters = () => {
    setStatus('all');
    setAccount('all');
    setFrom('');
    setTo('');
    setSearchInput('');
  };

  const exportCsv = () => {
    downloadCsv(`campaign-analytics-${new Date().toISOString().slice(0, 10)}.csv`, [
      ['Campaign', 'Status', 'WhatsApp number', 'Template', 'Created', 'Started', 'Completed', 'Recipients', 'Sent', 'Delivered', 'Read', 'Failed', 'Delivery rate %', 'Read rate %'],
      ...rows.map((c) => [
        c.name, c.status, c.whatsapp_account, c.template_name, c.created_at, c.started_at, c.completed_at,
        c.total_recipients || 0, c.sent_count || 0, c.delivered_count || 0, c.read_count || 0, c.failed_count || 0,
        pct(c.delivered_count, c.sent_count) ?? '', pct(c.read_count, c.delivered_count) ?? '',
      ]),
    ]);
  };

  const funnel = [
    { label: 'Recipients', value: s.total_recipients, cls: 'bg-gray-400 dark:bg-gray-500' },
    { label: 'Sent', value: s.sent_count, cls: 'bg-sky-500' },
    { label: 'Delivered', value: s.delivered_count, cls: 'bg-emerald-500' },
    { label: 'Read', value: s.read_count, cls: 'bg-teal-600 dark:bg-teal-400' },
    { label: 'Failed', value: s.failed_count, cls: 'bg-rose-500' },
  ];
  const funnelMax = Math.max(1, ...funnel.map((f) => f.value));

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[#f8faf9] text-gray-900 dark:bg-[#0b1110] dark:text-gray-100">
      <div className="mx-auto w-full max-w-7xl space-y-5 p-4 sm:p-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm shadow-emerald-500/20">
              <BarChart3 className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-gray-900 dark:text-white">Campaign Analytics</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">Delivery, read and failure numbers across your broadcasts</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={isLoading}>
              <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', isLoading && 'animate-spin')} /> Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
              <Download className="mr-1.5 h-3.5 w-3.5" /> Export CSV
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className={cn(cardCls, 'p-3 sm:p-4')}>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:min-w-[220px] sm:flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <Input
                aria-label="Search campaigns by name"
                placeholder="Search by campaign name"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="h-9 pl-8 text-sm"
              />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger aria-label="Status" className="h-9 w-full text-sm sm:w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {CAMPAIGN_STATUSES.map((st) => (
                  <SelectItem key={st} value={st} className="capitalize">{st}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={account} onValueChange={setAccount}>
              <SelectTrigger aria-label="WhatsApp number" className="h-9 w-full text-sm sm:w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All WhatsApp numbers</SelectItem>
                {accounts.map((a) => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="flex w-full items-center gap-1.5 text-[11px] text-gray-500 sm:w-auto dark:text-gray-400">
              <span className="w-8 shrink-0">From</span>
              <Input type="date" aria-label="Created from" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="h-9 text-sm sm:w-40" />
            </label>
            <label className="flex w-full items-center gap-1.5 text-[11px] text-gray-500 sm:w-auto dark:text-gray-400">
              <span className="w-8 shrink-0">To</span>
              <Input type="date" aria-label="Created to" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="h-9 text-sm sm:w-40" />
            </label>
            <Button variant="ghost" size="sm" className="h-9" onClick={clearFilters} disabled={!hasFilters}>
              <X className="mr-1 h-3.5 w-3.5" /> Clear
            </Button>
          </div>
        </div>

        {/* Totals */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Campaigns" value={fmtNum(s.campaigns)} icon={Megaphone} tone="emerald" />
          <StatCard label="Recipients" value={fmtNum(s.total_recipients)} icon={Users} />
          <StatCard label="Sent" value={fmtNum(s.sent_count)} icon={Send} tone="sky" />
          <StatCard label="Delivered" value={fmtNum(s.delivered_count)} icon={CheckCircle2} tone="emerald" />
          <StatCard label="Read" value={fmtNum(s.read_count)} icon={Eye} tone="teal" />
          <StatCard label="Failed" value={fmtNum(s.failed_count)} hint={failRate === null ? undefined : `${failRate}% of attempts`} icon={AlertCircle} tone="rose" />
          <StatCard label="Delivery rate" value={fmtPct(deliveryRate)} hint="Delivered ÷ sent" icon={Percent} tone="emerald" />
          <StatCard label="Read rate" value={fmtPct(readRate)} hint="Read ÷ delivered" icon={Percent} tone="violet" />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <div className={cn(cardCls, 'p-4 lg:col-span-2')}>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Delivery funnel</h2>
            <p className="mb-3 text-[11px] text-gray-500 dark:text-gray-400">All matching campaigns</p>
            <div className="space-y-2.5">
              {funnel.map((f) => (
                <div key={f.label}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-gray-600 dark:text-gray-300">{f.label}</span>
                    <span className="tabular-nums font-semibold text-gray-900 dark:text-white">
                      {fmtNum(f.value)}
                      {f.label !== 'Recipients' && s.total_recipients > 0 && (
                        <span className="ml-1 font-normal text-gray-400">({fmtPct(pct(f.value, s.total_recipients))})</span>
                      )}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-white/[0.06]">
                    <div className={cn('h-full rounded-full transition-all', f.cls)} style={{ width: `${(f.value / funnelMax) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5 border-t border-gray-100 pt-3 dark:border-white/[0.06]">
              {CAMPAIGN_STATUSES.filter((st) => (s[st] || 0) > 0).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatus(st)}
                  className="inline-flex items-center gap-1 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                  title={`Show only ${st} campaigns`}
                >
                  <StatusBadge status={st} />
                  <span className="text-xs font-semibold tabular-nums text-gray-700 dark:text-gray-300">{s[st]}</span>
                </button>
              ))}
            </div>
          </div>

          <div className={cn(cardCls, 'p-4 lg:col-span-3 min-w-0')}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Messages by day</h2>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">By campaign start date · last {daily.length || 0} active day{daily.length === 1 ? '' : 's'}</p>
              </div>
              <DeliveryLegend />
            </div>
            {daily.length === 0 ? (
              <div className="flex h-44 items-center justify-center text-xs text-gray-400">No sends in this range yet</div>
            ) : (
              <div className="mt-3 flex h-44 items-end gap-1 overflow-x-auto pb-5">
                {daily.map(([day, b]) => {
                  const h = (n: number) => `${(n / dailyMax) * 100}%`;
                  const readN = b.read;
                  const delN = Math.max(b.delivered - b.read, 0);
                  const sentN = Math.max(b.sent - b.delivered, 0);
                  const d = new Date(`${day}T00:00:00`);
                  return (
                    <div
                      key={day}
                      className="group relative flex h-full min-w-[14px] max-w-[56px] flex-1 flex-col justify-end"
                      title={`${d.toLocaleDateString()} — sent ${b.sent}, delivered ${b.delivered}, read ${b.read}, failed ${b.failed}`}
                    >
                      <div className="flex w-full flex-col-reverse overflow-hidden rounded-t-md" style={{ height: h(b.sent + b.failed) }}>
                        <div className="bg-teal-600 dark:bg-teal-400" style={{ height: `${(readN / Math.max(b.sent + b.failed, 1)) * 100}%` }} />
                        <div className="bg-emerald-500" style={{ height: `${(delN / Math.max(b.sent + b.failed, 1)) * 100}%` }} />
                        <div className="bg-sky-400" style={{ height: `${(sentN / Math.max(b.sent + b.failed, 1)) * 100}%` }} />
                        <div className="bg-rose-500" style={{ height: `${(b.failed / Math.max(b.sent + b.failed, 1)) * 100}%` }} />
                      </div>
                      <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] text-gray-400">
                        {d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Campaign table */}
        <div className={cn(cardCls, 'overflow-hidden')}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3 dark:border-white/[0.06]">
            <div>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Campaigns</h2>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                {matched} matching{rows.length < matched ? ` · showing the latest ${rows.length}` : ''} · click a campaign to manage it
              </p>
            </div>
            <DeliveryLegend />
          </div>

          {isLoading && rows.length === 0 ? (
            <div className="flex items-center justify-center gap-2 p-10 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin text-emerald-500" /> Loading campaigns…
            </div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center text-sm text-gray-500 dark:text-gray-400">
              {hasFilters ? 'No campaigns match these filters.' : 'No campaigns yet.'}
            </div>
          ) : (
            <>
              {/* Phone: cards */}
              <ul className="divide-y divide-gray-100 xl:hidden dark:divide-white/[0.06]">
                {pageRows.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => navigate(`/campaigns/${c.id}`)} className="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-white/[0.03]">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{c.name}</p>
                          <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">
                            {c.template_name || 'No template'} · {c.whatsapp_account || '—'} · {fmtDate(c.created_at, false)}
                          </p>
                        </div>
                        <StatusBadge status={c.status} />
                      </div>
                      <DeliveryBar c={c} className="mt-2" />
                      <div className="mt-1.5 grid grid-cols-5 gap-1 text-center text-[10px] text-gray-500 dark:text-gray-400">
                        {([['To', c.total_recipients], ['Sent', c.sent_count], ['Deliv.', c.delivered_count], ['Read', c.read_count], ['Failed', c.failed_count]] as const).map(([l, v]) => (
                          <div key={l}>
                            <div className="font-semibold tabular-nums text-gray-800 dark:text-gray-200">{fmtNum(v)}</div>
                            {l}
                          </div>
                        ))}
                      </div>
                      <p className="mt-1.5 text-[10px] text-gray-500 dark:text-gray-400">
                        Started {fmtDate(c.started_at)} · Done {fmtDate(c.completed_at)} · Delivery {fmtPct(pct(c.delivered_count, c.sent_count))} · Read {fmtPct(pct(c.read_count, c.delivered_count))}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>

              {/* Desktop: table */}
              <div className="hidden overflow-x-auto xl:block">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500 dark:bg-white/[0.03] dark:text-gray-400">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">Campaign</th>
                      <th className="px-3 py-2.5 font-semibold">Status</th>
                      <th className="px-3 py-2.5 font-semibold">Dates</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Recipients</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Sent</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Delivered</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Read</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Failed</th>
                      <th className="w-44 px-4 py-2.5 font-semibold">Progress</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-white/[0.06]">
                    {pageRows.map((c) => (
                      <tr
                        key={c.id}
                        tabIndex={0}
                        onClick={() => navigate(`/campaigns/${c.id}`)}
                        onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/campaigns/${c.id}`); }}
                        className="cursor-pointer align-top transition-colors hover:bg-emerald-50/40 focus:bg-emerald-50/60 focus:outline-none dark:hover:bg-white/[0.03] dark:focus:bg-white/[0.05]"
                      >
                        <td className="max-w-[220px] px-4 py-3">
                          <p className="truncate font-semibold text-gray-900 dark:text-white">{c.name}</p>
                          <p className="truncate text-[11px] text-gray-500 dark:text-gray-400" title="Template · WhatsApp number">
                            {c.template_name || 'No template'} · {c.whatsapp_account || '—'}
                          </p>
                        </td>
                        <td className="px-3 py-3"><StatusBadge status={c.status} /></td>
                        <td className="whitespace-nowrap px-3 py-3 text-[11px] leading-5 text-gray-500 dark:text-gray-400">
                          <div><span className="text-gray-400 dark:text-gray-500">Created</span> {fmtDate(c.created_at)}</div>
                          {c.scheduled_at && !c.started_at && <div><span className="text-gray-400 dark:text-gray-500">Scheduled</span> {fmtDate(c.scheduled_at)}</div>}
                          <div><span className="text-gray-400 dark:text-gray-500">Started</span> {fmtDate(c.started_at)}</div>
                          <div><span className="text-gray-400 dark:text-gray-500">Done</span> {fmtDate(c.completed_at)}</div>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums font-medium">{fmtNum(c.total_recipients)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{fmtNum(c.sent_count)}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-emerald-700 dark:text-emerald-400">{fmtNum(c.delivered_count)}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-teal-700 dark:text-teal-300">{fmtNum(c.read_count)}</td>
                        <td className={cn('px-3 py-3 text-right tabular-nums', (c.failed_count || 0) > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-gray-400')}>{fmtNum(c.failed_count)}</td>
                        <td className="px-4 py-3">
                          <DeliveryBar c={c} />
                          <div className="mt-1.5 flex justify-between text-[10px] text-gray-500 dark:text-gray-400">
                            <span>Deliv. {fmtPct(pct(c.delivered_count, c.sent_count))}</span>
                            <span>Read {fmtPct(pct(c.read_count, c.delivered_count))}</span>
                          </div>
                        </td>
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
    </div>
  );
};

export default CampaignAnalyticsView;
