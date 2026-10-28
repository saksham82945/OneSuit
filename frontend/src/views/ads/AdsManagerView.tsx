import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { Columns3, Download, Facebook, Info, Loader2, Megaphone, Pencil, RefreshCw, Rocket, Settings2, SlidersHorizontal, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { SearchInput } from '@/components/shared/SearchInput';
import { IconButton } from '@/components/shared/IconButton';
import { DeleteConfirmDialog } from '@/components/shared/DeleteConfirmDialog';
import { ErrorState } from '@/components/shared/ErrorState';
import { useBranding } from '@/services/branding';
import { useAuthStore } from '@/stores/auth';
import { cn } from '@/lib/utils';
import {
  adTypeLabel,
  adsApi,
  daysAgoISO,
  downloadCsv,
  errorMessage,
  formatDate,
  formatMoney,
  formatNumber,
  readStored,
  useAdsSetup,
  writeStored,
  type AdCampaign,
  type AdType,
  type AdsSummary,
  type FetchedList,
} from './adsApi';
import { SetupNotice, StatusBadge, TablePager, UnderlineTabs, cardCls, outlineBtnCls, primaryBtnCls, tdCls, thCls } from './AdsShared';
import { AdsPage } from './AdsPageShell';
import { AdCampaignDialog } from './AdCampaignDialog';
import { AdGenerator } from './AdGenerator';

type Tab = 'ours' | 'fetched';
type ColumnKey = 'actions' | 'name' | 'start_date' | 'status' | 'type' | 'budget' | 'leads' | 'spend';
type MetricKey = 'leads' | 'ctr' | 'cpl' | 'spend' | 'capi';

const COLUMNS: { key: ColumnKey; label: string; align?: 'right' }[] = [
  { key: 'actions', label: 'Actions' },
  { key: 'name', label: 'Ad Name' },
  { key: 'start_date', label: 'Start Date' },
  { key: 'status', label: 'Status' },
  { key: 'type', label: 'Ad Type' },
  { key: 'budget', label: 'Budget', align: 'right' },
  { key: 'leads', label: 'Leads', align: 'right' },
  { key: 'spend', label: 'Spend', align: 'right' },
];

const METRICS: { key: MetricKey; label: string; info: string }[] = [
  { key: 'leads', label: 'Number of Leads', info: 'Leads collected from your ads (lead forms and WhatsApp chats) in the selected period.' },
  { key: 'ctr', label: 'Click-Through Rate', info: 'Clicks ÷ impressions. Shows how often people who see your ad tap it.' },
  { key: 'cpl', label: 'Cost Per Lead', info: 'Total spend ÷ number of leads.' },
  { key: 'spend', label: 'Total Spend', info: 'Amount spent on your ads, paid from your ad credit.' },
  { key: 'capi', label: 'Total CAPI Signals', info: 'Conversion events (Lead, Purchase…) shared with Meta through the Conversions API to optimise delivery.' },
];

const STATUSES = [
  { value: '', label: 'Select Status' },
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'ended', label: 'Ended' },
];

const RANGES = [
  { value: 0, label: 'All time' },
  { value: 7, label: 'Last 7 days' },
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 90 days' },
];

const COLS_KEY = 'ads_manager_columns';
const METRICS_KEY = 'ads_manager_metrics';
const allOn = <K extends string>(keys: K[]) => Object.fromEntries(keys.map((k) => [k, true])) as Record<K, boolean>;

const toolSelectCls =
  'h-9 rounded-xl border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-700 focus:outline-none focus:ring-1 focus:ring-spruce dark:bg-white/[0.04] dark:border-white/10 dark:text-gray-200';

export const AdsManagerView: React.FC = () => {
  const { setup } = useAdsSetup();
  const { platform_name } = useBranding();
  const { hasPermission } = useAuthStore();
  const canWrite = hasPermission('campaigns', 'write');
  const location = useLocation();

  const [tab, setTab] = useState<Tab>('ours');
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [summary, setSummary] = useState<AdsSummary | null>(null);
  const [fetched, setFetched] = useState<FetchedList<AdCampaign> | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState('');
  const [range, setRange] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [cols, setCols] = useState<Record<ColumnKey, boolean>>(() => readStored(COLS_KEY, allOn(COLUMNS.map((c) => c.key))));
  const [metrics, setMetrics] = useState<Record<MetricKey, boolean>>(() => readStored(METRICS_KEY, allOn(METRICS.map((m) => m.key))));
  const [syncing, setSyncing] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AdCampaign | null>(null);
  const [createType, setCreateType] = useState<AdType | undefined>();
  const [toDelete, setToDelete] = useState<AdCampaign | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [launchBlocked, setLaunchBlocked] = useState<{ name: string; message: string } | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // /ads#generate (from the quick guide) jumps to the generator.
  useEffect(() => {
    if (location.hash === '#generate') {
      document.getElementById('generate')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [location.hash]);

  const from = range ? daysAgoISO(range) : undefined;

  const load = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true);
    try {
      const [list, sum] = await Promise.all([
        adsApi.listCampaigns({ search: debouncedSearch || undefined, status: status || undefined }),
        adsApi.getSummary({ from, status: status || undefined }).catch(() => null),
      ]);
      if (id !== seq.current) return;
      setCampaigns(list);
      setSummary(sum);
      setLoadError(null);
    } catch (err) {
      if (id === seq.current) setLoadError(errorMessage(err, 'Failed to load ads'));
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [debouncedSearch, status, from]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (tab !== 'fetched' || fetched) return;
    adsApi
      .listFetchedAds()
      .then(setFetched)
      .catch((err) => toast.error(errorMessage(err, 'Failed to load fetched ads')));
  }, [tab, fetched]);

  const visible = useMemo(() => {
    const rows = tab === 'fetched' ? fetched?.items || [] : campaigns;
    if (!from) return rows;
    const since = new Date(`${from}T00:00:00`).getTime();
    return rows.filter((c) => new Date(c.start_date || c.created_at).getTime() >= since);
  }, [tab, fetched, campaigns, from]);
  const paged = useMemo(() => visible.slice((page - 1) * pageSize, page * pageSize), [visible, page, pageSize]);

  const currency = summary?.currency || setup?.currency || 'INR';

  const toggleCol = (k: ColumnKey) =>
    setCols((c) => {
      const next = { ...c, [k]: !c[k] };
      writeStored(COLS_KEY, next);
      return next;
    });
  const toggleMetric = (k: MetricKey) =>
    setMetrics((m) => {
      const next = { ...m, [k]: !m[k] };
      writeStored(METRICS_KEY, next);
      return next;
    });

  const openCreate = useCallback((type?: AdType) => {
    setEditing(null);
    setCreateType(type);
    setDialogOpen(true);
  }, []);

  const sync = async () => {
    setSyncing(true);
    try {
      await adsApi.sync();
      toast.success('Ads synced from Meta');
      setFetched(null);
      load();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not sync with Meta'));
    } finally {
      setSyncing(false);
    }
  };

  const downloadReport = () => {
    if (visible.length === 0) {
      toast.info('No ads to export');
      return;
    }
    downloadCsv(
      `ads-report-${daysAgoISO(0)}.csv`,
      ['Ad Name', 'Start Date', 'Status', 'Ad Type', 'Daily Budget', 'Currency', 'Impressions', 'Clicks', 'Leads', 'Spend'],
      visible.map((c) => [
        c.name,
        c.start_date ? c.start_date.slice(0, 10) : '',
        c.status,
        adTypeLabel(c.type),
        c.daily_budget,
        c.currency || currency,
        c.impressions,
        c.clicks,
        c.leads,
        c.spend,
      ])
    );
  };

  const launch = async (c: AdCampaign) => {
    setLaunchingId(c.id);
    try {
      await adsApi.launchCampaign(c.id);
      toast.success(`"${c.name}" is launching`);
      load();
    } catch (err) {
      setLaunchBlocked({ name: c.name, message: errorMessage(err, 'This ad could not be launched') });
    } finally {
      setLaunchingId(null);
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await adsApi.deleteCampaign(toDelete.id);
      toast.success('Ad deleted');
      setToDelete(null);
      load();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to delete ad'));
    } finally {
      setDeleting(false);
    }
  };

  const metricValue = (k: MetricKey): string => {
    const s = summary;
    switch (k) {
      case 'leads':
        return formatNumber(s?.leads);
      case 'ctr':
        return `${(s?.ctr ?? 0).toFixed(2)}%`;
      case 'cpl':
        return formatMoney(s?.cost_per_lead, currency);
      case 'spend':
        return formatMoney(s?.total_spend, currency);
      case 'capi':
        return formatNumber(s?.capi_signals);
    }
  };

  const cell = (c: AdCampaign, k: ColumnKey): React.ReactNode => {
    switch (k) {
      case 'actions':
        return tab === 'fetched' || !canWrite ? (
          <span className="text-gray-400">—</span>
        ) : (
          <div className="flex items-center gap-0.5">
            {c.status !== 'active' && c.status !== 'ended' && (
              <IconButton
                icon={launchingId === c.id ? Loader2 : Rocket}
                label="Launch"
                className={cn('text-spruce hover:bg-spruce-light dark:text-teal-300', launchingId === c.id && '[&_svg]:animate-spin')}
                disabled={launchingId === c.id}
                onClick={() => launch(c)}
              />
            )}
            <IconButton
              icon={Pencil}
              label="Edit"
              className="text-gray-500 hover:text-gray-900 dark:hover:text-white"
              onClick={() => {
                setEditing(c);
                setDialogOpen(true);
              }}
            />
            <IconButton
              icon={Trash2}
              label="Delete"
              className="text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
              onClick={() => setToDelete(c)}
            />
          </div>
        );
      case 'name':
        return <span className="block max-w-[260px] truncate font-semibold text-gray-900 dark:text-white">{c.name}</span>;
      case 'start_date':
        return <span className="whitespace-nowrap">{c.start_date ? formatDate(c.start_date) : '—'}</span>;
      case 'status':
        return <StatusBadge status={c.status} />;
      case 'type':
        return <span className="whitespace-nowrap">{adTypeLabel(c.type)}</span>;
      case 'budget':
        return (
          <span className="whitespace-nowrap">
            {formatMoney(c.daily_budget, c.currency || currency)}
            <span className="text-gray-400"> /day</span>
          </span>
        );
      case 'leads':
        return <span className="tabular-nums">{formatNumber(c.leads)}</span>;
      case 'spend':
        return <span className="whitespace-nowrap font-semibold">{formatMoney(c.spend, c.currency || currency)}</span>;
    }
  };

  const shownCols = COLUMNS.filter((c) => cols[c.key]);
  const shownMetrics = METRICS.filter((m) => metrics[m.key]);
  const fetchedNotConnected = tab === 'fetched' && fetched && !fetched.meta_connected;

  return (
    <AdsPage title="Ads Manager" setup={setup} onCreateAd={openCreate}>
      <SetupNotice setup={setup} />

      <AdGenerator id="generate" hero pageName={setup?.page_name} onSaved={load} />

      <section className={cn(cardCls, 'overflow-hidden')}>
        <div className="space-y-4 px-4 pt-4 sm:px-5">
          <UnderlineTabs
            value={tab}
            onChange={(v) => {
              setTab(v);
              setPage(1);
            }}
            options={[
              { value: 'ours', label: `${platform_name} Ads` },
              { value: 'fetched', label: 'Fetched Ads' },
            ]}
          />

          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
              placeholder="Search by ad name"
              className="w-full sm:w-60"
            />
            <Button variant="outline" size="sm" className={outlineBtnCls} onClick={sync} disabled={syncing || !canWrite}>
              <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', syncing && 'animate-spin')} /> Sync
            </Button>
            <Button variant="outline" size="sm" className={outlineBtnCls} onClick={downloadReport}>
              <Download className="h-3.5 w-3.5 mr-1.5" /> Download Report
            </Button>
            <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
              <select
                aria-label="Status"
                className={toolSelectCls}
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
              >
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <select
                aria-label="Date range"
                className={toolSelectCls}
                value={range}
                onChange={(e) => {
                  setRange(Number(e.target.value));
                  setPage(1);
                }}
              >
                {RANGES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <ToggleMenu
                label="Customize Metrics"
                icon={SlidersHorizontal}
                items={METRICS.map((m) => ({ key: m.key, label: m.label, on: metrics[m.key] }))}
                onToggle={(k) => toggleMetric(k as MetricKey)}
              />
              <ToggleMenu
                label="Columns"
                icon={Columns3}
                items={COLUMNS.map((c) => ({ key: c.key, label: c.label, on: cols[c.key] }))}
                onToggle={(k) => toggleCol(k as ColumnKey)}
              />
            </div>
          </div>

          {shownMetrics.length > 0 && (
            <TooltipProvider delayDuration={150}>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
                {shownMetrics.map((m) => (
                  <div key={m.key} className="rounded-xl border border-gray-200 bg-white p-3.5 dark:border-white/10 dark:bg-white/[0.02]">
                    <div className="flex items-center gap-1 text-[11px] font-medium text-gray-500 dark:text-gray-400">
                      {m.label}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" aria-label={`About ${m.label}`} className="text-gray-400 hover:text-gray-600">
                            <Info className="h-3 w-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[240px] text-xs">{m.info}</TooltipContent>
                      </Tooltip>
                    </div>
                    <p className="mt-1.5 text-lg font-bold tabular-nums">{loading && !summary ? '…' : metricValue(m.key)}</p>
                  </div>
                ))}
              </div>
            </TooltipProvider>
          )}
        </div>

        {loadError && tab === 'ours' ? (
          <ErrorState title="Couldn't load ads" description={loadError} onRetry={load} />
        ) : (
          <>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[760px] border-t border-gray-100 dark:border-white/[0.06]">
                <thead className="bg-gray-50/80 dark:bg-white/[0.03]">
                  <tr>
                    {shownCols.map((c) => (
                      <th key={c.key} className={cn(thCls, c.align === 'right' && 'text-right')}>
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-white/[0.06]">
                  {loading && tab === 'ours' && campaigns.length === 0 ? (
                    [0, 1, 2].map((i) => (
                      <tr key={i}>
                        <td colSpan={shownCols.length || 1} className="px-4 py-3">
                          <div className="h-5 animate-pulse rounded bg-gray-100 dark:bg-white/[0.06]" />
                        </td>
                      </tr>
                    ))
                  ) : paged.length === 0 ? (
                    <tr>
                      <td colSpan={shownCols.length || 1} className="px-4 py-12 text-center">
                        <Megaphone className="mx-auto h-8 w-8 text-gray-300" />
                        <p className="mt-2 text-sm font-semibold">
                          {fetchedNotConnected ? 'Facebook is not connected' : debouncedSearch || status || range ? 'No ads match your filters' : 'No ads yet'}
                        </p>
                        <p className="mx-auto mt-1 max-w-sm text-xs text-gray-500 dark:text-gray-400">
                          {tab === 'fetched'
                            ? fetched?.message || 'Ads from your Meta ad account appear here.'
                            : 'Generate ads with AI above, or create one yourself.'}
                        </p>
                        <div className="mt-3 flex justify-center gap-2">
                          {fetchedNotConnected ? (
                            <Link to="/ads/setup">
                              <Button size="sm" className="h-9 rounded-xl bg-[#1877F2] hover:bg-[#166fe5] text-white text-xs font-semibold px-4">
                                <Facebook className="h-3.5 w-3.5 mr-1.5" /> Connect Facebook
                              </Button>
                            </Link>
                          ) : (
                            tab === 'ours' &&
                            canWrite &&
                            !debouncedSearch && (
                              <Button size="sm" className={primaryBtnCls} onClick={() => openCreate()}>
                                Create Ad
                              </Button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paged.map((c) => (
                      <tr key={c.id} className="hover:bg-gray-50/70 dark:hover:bg-white/[0.02]">
                        {shownCols.map((col) => (
                          <td key={col.key} className={cn(tdCls, col.align === 'right' && 'text-right')}>
                            {cell(c, col.key)}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <TablePager
              page={page}
              pageSize={pageSize}
              total={visible.length}
              onPageChange={setPage}
              onPageSizeChange={(n) => {
                setPageSize(n);
                setPage(1);
              }}
            />
          </>
        )}
      </section>

      <AdCampaignDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        campaign={editing}
        defaultType={createType}
        currency={currency}
        pageName={setup?.page_name}
        onSaved={load}
      />

      <DeleteConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Delete ad"
        itemName={toDelete?.name}
        isSubmitting={deleting}
        onConfirm={remove}
      />

      <Dialog open={Boolean(launchBlocked)} onOpenChange={(o) => !o && setLaunchBlocked(null)}>
        <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-md rounded-2xl">
          <DialogHeader className="text-left">
            <DialogTitle className="text-base flex items-center gap-2">
              <Rocket className="h-4 w-4 text-amber-600" /> Can't launch yet
            </DialogTitle>
            <DialogDescription className="text-xs">“{launchBlocked?.name}” is still saved as a draft.</DialogDescription>
          </DialogHeader>
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs leading-relaxed text-amber-900 dark:bg-amber-950/30 dark:border-amber-900/60 dark:text-amber-200">
            {launchBlocked?.message}
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" className={outlineBtnCls} onClick={() => setLaunchBlocked(null)}>
              Close
            </Button>
            <Link to="/ads/setup">
              <Button size="sm" className={cn(primaryBtnCls, 'w-full')}>
                <Settings2 className="h-3.5 w-3.5 mr-1.5" /> Open setup
              </Button>
            </Link>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdsPage>
  );
};

const ToggleMenu: React.FC<{
  label: string;
  icon: React.ElementType;
  items: { key: string; label: string; on: boolean }[];
  onToggle: (key: string) => void;
}> = ({ label, icon: Icon, items, onToggle }) => (
  <Popover>
    <PopoverTrigger asChild>
      <Button variant="outline" size="sm" className={outlineBtnCls}>
        <Icon className="h-3.5 w-3.5 mr-1.5" /> {label}
      </Button>
    </PopoverTrigger>
    <PopoverContent align="end" className="w-56 p-2">
      <p className="px-2 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      {items.map((i) => (
        <label key={i.key} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-gray-50 dark:hover:bg-white/[0.04]">
          <input type="checkbox" className="h-3.5 w-3.5 accent-[#0f5c62]" checked={i.on} onChange={() => onToggle(i.key)} />
          {i.label}
        </label>
      ))}
    </PopoverContent>
  </Popover>
);

export default AdsManagerView;
