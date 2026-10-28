import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Eye, Wallet, Loader2, Megaphone, MousePointerClick, Pencil, Plus, Rocket, Settings2, Trash2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { SearchInput } from '@/components/shared/SearchInput';
import { IconButton } from '@/components/shared/IconButton';
import { DeleteConfirmDialog } from '@/components/shared/DeleteConfirmDialog';
import { ErrorState } from '@/components/shared/ErrorState';
import { useAuthStore } from '@/stores/auth';
import { cn } from '@/lib/utils';
import {
  AD_TYPES,
  adTypeLabel,
  adsApi,
  errorMessage,
  formatDate,
  formatMoney,
  formatNumber,
  isSetupComplete,
  useAdsSetup,
  type AdCampaign,
  type AdType,
} from './adsApi';
import { AdsPage, EmptyCard, Pill, SetupNotice, StatTile, StatusBadge, cardCls, outlineBtnCls, primaryBtnCls } from './AdsShared';
import { AdCampaignDialog } from './AdCampaignDialog';

type Tab = 'all' | AdType;

export const AdsManagerView: React.FC = () => {
  const { setup } = useAdsSetup();
  const { hasPermission } = useAuthStore();
  const canWrite = hasPermission('campaigns', 'write');

  const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AdCampaign | null>(null);
  const [toDelete, setToDelete] = useState<AdCampaign | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [launchBlocked, setLaunchBlocked] = useState<{ name: string; message: string } | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true);
    try {
      const list = await adsApi.listCampaigns({ search: debouncedSearch || undefined });
      if (id !== seq.current) return;
      setCampaigns(list);
      setLoadError(null);
    } catch (err) {
      if (id === seq.current) setLoadError(errorMessage(err, 'Failed to load ads'));
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: campaigns.length };
    for (const t of AD_TYPES) c[t.value] = campaigns.filter((x) => x.type === t.value).length;
    return c;
  }, [campaigns]);

  const visible = useMemo(() => (tab === 'all' ? campaigns : campaigns.filter((c) => c.type === tab)), [campaigns, tab]);
  const paged = useMemo(() => visible.slice((page - 1) * pageSize, page * pageSize), [visible, page]);

  const totals = useMemo(
    () =>
      visible.reduce(
        (acc, c) => ({
          spend: acc.spend + (Number(c.spend) || 0),
          impressions: acc.impressions + (Number(c.impressions) || 0),
          clicks: acc.clicks + (Number(c.clicks) || 0),
          leads: acc.leads + (Number(c.leads) || 0),
        }),
        { spend: 0, impressions: 0, clicks: 0, leads: 0 }
      ),
    [visible]
  );

  const currency = setup?.currency || campaigns[0]?.currency || 'INR';
  const setupDone = isSetupComplete(setup);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
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

  const columns: Column<AdCampaign>[] = [
    {
      key: 'name',
      label: 'Ad',
      render: (c) => (
        <div className="flex flex-col gap-1 min-w-[180px]">
          <span className="font-semibold text-gray-900 dark:text-white truncate max-w-[260px]">{c.name}</span>
          <div className="flex items-center gap-1.5">
            <Pill>{adTypeLabel(c.type)}</Pill>
            <span className="text-[11px] text-gray-400">Created {formatDate(c.created_at)}</span>
          </div>
        </div>
      ),
    },
    { key: 'status', label: 'Status', render: (c) => <StatusBadge status={c.status} /> },
    {
      key: 'daily_budget',
      label: 'Budget',
      render: (c) => (
        <div className="whitespace-nowrap">
          <span className="font-semibold">{formatMoney(c.daily_budget, c.currency || currency)}</span>
          <span className="text-gray-400"> /day</span>
        </div>
      ),
    },
    {
      key: 'schedule',
      label: 'Schedule',
      render: (c) => (
        <span className="text-gray-500 dark:text-gray-400 whitespace-nowrap">
          {c.start_date ? formatDate(c.start_date) : 'Not set'}
          {c.end_date ? ` → ${formatDate(c.end_date)}` : c.start_date ? ' → ongoing' : ''}
        </span>
      ),
    },
    {
      key: 'results',
      label: 'Results',
      render: (c) => (
        <div className="text-[11px] leading-relaxed whitespace-nowrap">
          <div>
            <span className="font-semibold text-gray-900 dark:text-white">{formatNumber(c.leads)}</span>{' '}
            <span className="text-gray-400">{c.type === 'lead_form' ? 'leads' : 'conversations'}</span>
          </div>
          <div className="text-gray-400">
            {formatNumber(c.impressions)} impr. · {formatNumber(c.clicks)} clicks
          </div>
        </div>
      ),
    },
    {
      key: 'spend',
      label: 'Spend',
      align: 'right',
      render: (c) => <span className="font-semibold whitespace-nowrap">{formatMoney(c.spend, c.currency || currency)}</span>,
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right',
      render: (c) => (
        <div className="flex items-center justify-end gap-1">
          {canWrite && c.status !== 'active' && c.status !== 'ended' && (
            <Button
              size="sm"
              variant="outline"
              disabled={launchingId === c.id}
              onClick={() => launch(c)}
              className="h-8 rounded-lg border-teal-200 bg-white text-[11px] font-semibold text-spruce-dark hover:bg-spruce-light dark:bg-transparent dark:border-teal-900 dark:text-teal-300"
            >
              {launchingId === c.id ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Rocket className="h-3.5 w-3.5 mr-1" />}
              Launch
            </Button>
          )}
          {canWrite && (
            <IconButton
              icon={Pencil}
              label="Edit"
              className="text-gray-500 hover:text-gray-900 dark:hover:text-white"
              onClick={() => {
                setEditing(c);
                setDialogOpen(true);
              }}
            />
          )}
          {canWrite && (
            <IconButton
              icon={Trash2}
              label="Delete"
              className="text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
              onClick={() => setToDelete(c)}
            />
          )}
        </div>
      ),
    },
  ];

  return (
    <AdsPage
      title="Ads Manager"
      subtitle="Facebook & Instagram ads that start WhatsApp conversations"
      icon={Megaphone}
      setup={setup}
      actions={
        canWrite && (
          <Button size="sm" className={primaryBtnCls} onClick={openCreate}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Create ad
          </Button>
        )
      }
    >
      <SetupNotice setup={setup} />

      {/* Tabs */}
      <div className="-mx-4 sm:mx-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max gap-1.5 px-4 sm:px-0" role="tablist" aria-label="Ad type">
          {[{ value: 'all' as Tab, label: 'All' }, ...AD_TYPES].map((t) => {
            const active = tab === t.value;
            return (
              <button
                key={t.value}
                role="tab"
                aria-selected={active}
                type="button"
                onClick={() => {
                  setTab(t.value);
                  setPage(1);
                }}
                className={cn(
                  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors',
                  active
                    ? 'border-spruce-dark bg-spruce-dark text-white'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-teal-300 hover:text-gray-900 dark:bg-transparent dark:border-white/10 dark:text-gray-300'
                )}
              >
                {t.label}
                <span
                  className={cn(
                    'rounded-full px-1.5 text-[10px] tabular-nums',
                    active ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400'
                  )}
                >
                  {counts[t.value] ?? 0}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Amount spent" value={formatMoney(totals.spend, currency)} icon={Wallet} tone="teal" />
        <StatTile label="Impressions" value={formatNumber(totals.impressions)} icon={Eye} tone="blue" />
        <StatTile label="Clicks" value={formatNumber(totals.clicks)} icon={MousePointerClick} tone="amber" />
        <StatTile label="Leads & chats" value={formatNumber(totals.leads)} icon={UserPlus} tone="violet" />
      </div>

      {/* Table */}
      {loadError ? (
        <div className={cardCls}>
          <ErrorState title="Couldn't load ads" description={loadError} onRetry={load} />
        </div>
      ) : !loading && campaigns.length === 0 && !debouncedSearch ? (
        <EmptyCard
          icon={Megaphone}
          title="No ads yet"
          description={
            setupDone
              ? 'Create your first Click-to-WhatsApp ad and start conversations with people who tap it.'
              : 'Complete Ads Manager setup to run ads on Facebook & Instagram. You can already build ad drafts while you finish.'
          }
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {!setupDone && (
                <Link to="/ads/setup">
                  <Button size="sm" className={primaryBtnCls}>
                    <Settings2 className="h-3.5 w-3.5 mr-1.5" /> Complete setup
                  </Button>
                </Link>
              )}
              {canWrite && (
                <Button size="sm" variant={setupDone ? 'default' : 'outline'} className={setupDone ? primaryBtnCls : outlineBtnCls} onClick={openCreate}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> {setupDone ? 'Create ad' : 'Create a draft'}
                </Button>
              )}
            </div>
          }
        />
      ) : (
        <div className={cn(cardCls, 'p-4 sm:p-5 space-y-4')}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold">{tab === 'all' ? 'All ads' : adTypeLabel(tab)}</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">{visible.length} ads</p>
            </div>
            <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search ads…" className="w-full sm:w-64" />
          </div>
          <DataTable
            items={paged}
            columns={columns}
            isLoading={loading}
            emptyIcon={Megaphone}
            emptyTitle={debouncedSearch ? 'No ads match your search' : `No ${adTypeLabel(tab)} ads yet`}
            emptyDescription={debouncedSearch ? 'Try another name.' : 'Create one to see it here.'}
            emptyAction={
              canWrite && !debouncedSearch ? (
                <Button size="sm" className={primaryBtnCls} onClick={openCreate}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> Create ad
                </Button>
              ) : undefined
            }
            currentPage={page}
            totalItems={visible.length}
            pageSize={pageSize}
            onPageChange={setPage}
          />
        </div>
      )}

      <AdCampaignDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        campaign={editing}
        defaultType={tab === 'all' ? undefined : tab}
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

export default AdsManagerView;
