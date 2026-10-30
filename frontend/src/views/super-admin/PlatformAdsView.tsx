import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { ErrorState } from '@/components/shared/ErrorState';
import { SearchInput } from '@/components/shared/SearchInput';
import { DeleteConfirmDialog } from '@/components/shared/DeleteConfirmDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Radio,
  Pause,
  Play,
  Square,
  Trash2,
  LogIn,
  Unplug,
  Facebook,
  IndianRupee,
  Users,
  MousePointerClick,
  Eye,
  Wallet,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  superAdminAdsService,
  AD_TYPE_LABELS,
  type PlatformAd,
  type PlatformAdClient,
  type PlatformAdsOverview,
  type AdTopup,
} from '@/services/superAdminAds';
import { accessVendorAccount, formatDate, formatPrice } from '@/services/superAdmin';
import { StatCard, cardClass, fieldClass, LoadingBlock, errorMessage } from './shared';
import { cn } from '@/lib/utils';

const statusStyles: Record<string, string> = {
  active: 'bg-emerald-500/15 text-emerald-400 light:bg-emerald-100 light:text-emerald-700',
  paused: 'bg-amber-500/15 text-amber-400 light:bg-amber-100 light:text-amber-700',
  draft: 'bg-gray-500/15 text-gray-300 light:bg-gray-100 light:text-gray-600',
  ended: 'bg-rose-500/15 text-rose-400 light:bg-rose-100 light:text-rose-700',
  pending: 'bg-amber-500/15 text-amber-400 light:bg-amber-100 light:text-amber-700',
  completed: 'bg-emerald-500/15 text-emerald-400 light:bg-emerald-100 light:text-emerald-700',
  rejected: 'bg-rose-500/15 text-rose-400 light:bg-rose-100 light:text-rose-700',
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => (
  <Badge className={cn('border-0 shadow-none text-[11px] capitalize', statusStyles[status] ?? statusStyles.draft)}>{status}</Badge>
);

const th = 'text-left px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-white/40 light:text-gray-500';
const td = 'px-3 py-3 align-middle';
const count = (n: number) => n.toLocaleString('en-IN');

export const PlatformAdsView: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<PlatformAdsOverview | null>(null);
  const [topups, setTopups] = useState<AdTopup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [client, setClient] = useState('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<PlatformAd | null>(null);
  const [toDisconnect, setToDisconnect] = useState<PlatformAdClient | null>(null);

  const load = () => {
    setError(null);
    Promise.all([superAdminAdsService.overview(), superAdminAdsService.topups()])
      .then(([o, t]) => {
        setData(o);
        setTopups(t);
      })
      .catch((e) => setError(errorMessage(e)));
  };
  useEffect(load, []);

  const ads = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.ads ?? []).filter(
      (a) =>
        (status === 'all' || a.status === status) &&
        (client === 'all' || a.organization_id === client) &&
        (!q || [a.name, a.client_name, a.page_name, a.created_by_name].some((f) => f?.toLowerCase().includes(q)))
    );
  }, [data, search, status, client]);

  /** Sign in to the client's account and open their Ads Manager. */
  const openClient = async (orgId: string, name: string) => {
    setBusy(`open:${orgId}`);
    try {
      await accessVendorAccount({ id: orgId, name });
      toast.success(`Opened ${name}'s Ads Manager`);
      navigate('/ads');
    } catch (err) {
      toast.error(errorMessage(err, `Could not open ${name}`));
    } finally {
      setBusy(null);
    }
  };

  const changeStatus = async (ad: PlatformAd, next: 'active' | 'paused' | 'ended') => {
    setBusy(ad.id);
    try {
      const updated = await superAdminAdsService.setStatus(ad.id, next);
      setData((d) => (d ? { ...d, ads: d.ads.map((x) => (x.id === ad.id ? { ...x, status: updated.status } : x)) } : d));
      toast.success(next === 'paused' ? `${ad.name} paused` : next === 'active' ? `${ad.name} resumed` : `${ad.name} ended`);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not change the ad'));
    } finally {
      setBusy(null);
    }
  };

  const deleteAd = async () => {
    if (!toDelete) return;
    try {
      await superAdminAdsService.remove(toDelete.id);
      setData((d) => (d ? { ...d, ads: d.ads.filter((x) => x.id !== toDelete.id) } : d));
      toast.success('Ad deleted');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not delete the ad'));
    } finally {
      setToDelete(null);
    }
  };

  const disconnect = async () => {
    if (!toDisconnect) return;
    setBusy(`dis:${toDisconnect.organization_id}`);
    try {
      const res = await superAdminAdsService.disconnectPage(toDisconnect.organization_id);
      toast.success(
        `${toDisconnect.client_name}'s page disconnected${res.paused_ads ? ` and ${res.paused_ads} running ad(s) paused` : ''}`
      );
      setToDisconnect(null);
      load();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not disconnect the page'));
    } finally {
      setBusy(null);
    }
  };

  const approve = async (t: AdTopup) => {
    setBusy(t.id);
    try {
      await superAdminAdsService.approveTopup(t.id);
      toast.success(`${formatPrice(t.amount)} added to ${t.organization_name}'s ad wallet`);
      load();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not approve the top-up'));
    } finally {
      setBusy(null);
    }
  };

  const pendingTopups = (topups ?? []).filter((t) => t.status === 'pending').length;

  return (
    <div className="flex flex-col min-h-full bg-[#0a0a0b] light:bg-gray-50">
      <PageHeader
        title="Ads Manager"
        subtitle="Every ad your clients run, their Facebook pages and ad wallet top-ups"
        icon={Radio}
        iconGradient="bg-gradient-to-br from-blue-500 to-indigo-600 shadow-blue-500/20"
        actions={
          <Button size="sm" variant="outline" className="border-white/10 light:border-gray-200" onClick={load}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
        }
      />

      {error ? (
        <div className="p-6"><ErrorState title="Couldn't load ads" description={error} onRetry={load} /></div>
      ) : !data ? (
        <LoadingBlock />
      ) : (
        <div className="p-4 sm:p-6 space-y-6">
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <StatCard label="Ads" value={count(data.totals.ads)} icon={Radio} tone="blue"
              hint={`${data.totals.active} running · ${data.totals.paused} paused · ${data.totals.draft} drafts`} />
            <StatCard label="Ad spend" value={formatPrice(data.totals.spend)} icon={IndianRupee} tone="emerald" hint="All clients" />
            <StatCard label="Leads" value={count(data.totals.leads)} icon={Users} tone="violet"
              hint={`${count(data.totals.clicks)} clicks · ${count(data.totals.impressions)} views`} />
            <StatCard label="Connected pages" value={count(data.pages)} icon={Facebook} tone="amber"
              hint={pendingTopups ? `${pendingTopups} wallet top-up(s) waiting` : 'No top-ups waiting'} />
          </div>

          <Tabs defaultValue="ads" className="space-y-4">
            <TabsList>
              <TabsTrigger value="ads">All ads ({data.ads.length})</TabsTrigger>
              <TabsTrigger value="pages">Client pages ({data.clients.length})</TabsTrigger>
              <TabsTrigger value="topups">
                Wallet top-ups{pendingTopups > 0 && <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-black">{pendingTopups}</span>}
              </TabsTrigger>
            </TabsList>

            {/* All ads */}
            <TabsContent value="ads">
              <div className={cn('rounded-xl border', cardClass)}>
                <div className="flex flex-wrap items-center gap-3 p-4 border-b border-white/[0.06] light:border-gray-200">
                  <SearchInput value={search} onChange={setSearch} placeholder="Search ad, client or page…" className="w-full sm:w-72" />
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className={cn(fieldClass, 'w-[140px] h-9')}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="active">Running</SelectItem>
                      <SelectItem value="paused">Paused</SelectItem>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="ended">Ended</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={client} onValueChange={setClient}>
                    <SelectTrigger className={cn(fieldClass, 'w-[200px] h-9')}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All clients</SelectItem>
                      {data.clients.map((c) => (
                        <SelectItem key={c.organization_id} value={c.organization_id}>{c.client_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="ml-auto text-xs text-white/40 light:text-gray-400">{ads.length} ads</span>
                </div>
                {ads.length === 0 ? (
                  <div className="p-12 text-center">
                    <Radio className="mx-auto h-8 w-8 text-white/20 light:text-gray-300" />
                    <p className="mt-2 text-sm font-medium">No ads found</p>
                    <p className="text-xs text-white/40 light:text-gray-500">Ads your clients create in their Ads Manager show up here.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b border-white/[0.06] light:border-gray-200">
                        <tr>
                          <th className={th}>Ad</th>
                          <th className={th}>Client · Page</th>
                          <th className={th}>Status</th>
                          <th className={th}>Budget / day</th>
                          <th className={th}>Results</th>
                          <th className={th}>Updated</th>
                          <th className={cn(th, 'text-right')}>Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.04] light:divide-gray-100">
                        {ads.map((a) => (
                          <tr key={a.id} className="hover:bg-white/[0.02] light:hover:bg-gray-50">
                            <td className={td}>
                              <p className="font-medium text-[13px]">{a.name}</p>
                              <p className="text-[11px] text-white/40 light:text-gray-500">
                                {AD_TYPE_LABELS[a.type] ?? a.type}
                                {a.created_by_name && ` · by ${a.created_by_name}`}
                              </p>
                            </td>
                            <td className={td}>
                              <p className="text-xs">{a.client_name}</p>
                              <p className="text-[11px] text-white/40 light:text-gray-500">{a.page_name || 'No page connected'}</p>
                            </td>
                            <td className={td}><StatusBadge status={a.status} /></td>
                            <td className={cn(td, 'text-xs tabular-nums')}>{formatPrice(a.daily_budget)}</td>
                            <td className={cn(td, 'text-[11px] tabular-nums text-white/60 light:text-gray-600 whitespace-nowrap')}>
                              <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" />{count(a.impressions)}</span>{' '}
                              <span className="inline-flex items-center gap-1 ml-2"><MousePointerClick className="h-3 w-3" />{count(a.clicks)}</span>{' '}
                              <span className="inline-flex items-center gap-1 ml-2"><Users className="h-3 w-3" />{count(a.leads)}</span>
                              <p className="mt-0.5">Spent {formatPrice(a.spend)}</p>
                            </td>
                            <td className={cn(td, 'text-xs whitespace-nowrap')}>{formatDate(a.updated_at)}</td>
                            <td className={cn(td, 'text-right whitespace-nowrap')}>
                              <div className="inline-flex items-center gap-1">
                                {a.status === 'active' && (
                                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs border-white/10 light:border-gray-200" disabled={busy !== null} onClick={() => changeStatus(a, 'paused')}>
                                    <Pause className="h-3.5 w-3.5 mr-1" /> Pause
                                  </Button>
                                )}
                                {a.status === 'paused' && (
                                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs border-white/10 light:border-gray-200" disabled={busy !== null} onClick={() => changeStatus(a, 'active')}>
                                    <Play className="h-3.5 w-3.5 mr-1" /> Resume
                                  </Button>
                                )}
                                {a.status !== 'ended' && (
                                  <Button size="icon" variant="ghost" className="h-7 w-7" title="End ad" disabled={busy !== null} onClick={() => changeStatus(a, 'ended')}>
                                    <Square className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                <Button size="icon" variant="ghost" className="h-7 w-7" title={`Open ${a.client_name}'s Ads Manager`} disabled={busy !== null} onClick={() => openClient(a.organization_id, a.client_name)}>
                                  <LogIn className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7 hover:text-rose-400" title={a.status === 'active' ? 'Pause before deleting' : 'Delete ad'} disabled={busy !== null || a.status === 'active'} onClick={() => setToDelete(a)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Client pages */}
            <TabsContent value="pages">
              {data.clients.length === 0 ? (
                <div className={cn('rounded-xl border p-12 text-center', cardClass)}>
                  <Facebook className="mx-auto h-8 w-8 text-white/20 light:text-gray-300" />
                  <p className="mt-2 text-sm font-medium">No client has set up ads yet</p>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {data.clients.map((c) => (
                    <div key={c.organization_id} className={cn('rounded-xl border p-5 flex flex-col gap-4', cardClass)}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{c.client_name}</p>
                          <p className="text-xs text-white/50 light:text-gray-500 flex items-center gap-1.5 mt-0.5">
                            <Facebook className="h-3.5 w-3.5 text-[#1877F2]" />
                            {c.page_name || 'No page chosen'}
                          </p>
                        </div>
                        <Badge className={cn('border-0 shadow-none text-[11px]', c.facebook_connected ? statusStyles.active : statusStyles.draft)}>
                          {c.facebook_connected ? 'Connected' : 'Not connected'}
                        </Badge>
                      </div>
                      <dl className="grid grid-cols-4 gap-2 text-center">
                        {[
                          ['Ads', count(c.ads)],
                          ['Running', count(c.active_ads)],
                          ['Leads', count(c.leads)],
                          ['Wallet', formatPrice(c.wallet_balance)],
                        ].map(([label, value]) => (
                          <div key={label} className="rounded-lg bg-white/[0.03] light:bg-gray-50 py-2">
                            <dt className="text-[10px] uppercase tracking-wide text-white/40 light:text-gray-400">{label}</dt>
                            <dd className="text-xs font-medium mt-0.5 tabular-nums">{value}</dd>
                          </div>
                        ))}
                      </dl>
                      {c.facebook_user_name && (
                        <p className="text-[11px] text-white/40 light:text-gray-500">Facebook account: {c.facebook_user_name}</p>
                      )}
                      <div className="mt-auto flex flex-wrap gap-2">
                        <Button size="sm" className="bg-blue-600 hover:bg-blue-500 text-white" disabled={busy !== null} onClick={() => openClient(c.organization_id, c.client_name)}>
                          <LogIn className="h-4 w-4 mr-1.5" /> {busy === `open:${c.organization_id}` ? 'Opening…' : 'Open their Ads Manager'}
                        </Button>
                        {c.facebook_connected && (
                          <Button size="sm" variant="outline" className="border-white/10 light:border-gray-200 hover:text-rose-400" disabled={busy !== null} onClick={() => setToDisconnect(c)}>
                            <Unplug className="h-4 w-4 mr-1.5" /> Disconnect page
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Wallet top-ups */}
            <TabsContent value="topups">
              <div className={cn('rounded-xl border', cardClass)}>
                {!topups || topups.length === 0 ? (
                  <div className="p-12 text-center">
                    <Wallet className="mx-auto h-8 w-8 text-white/20 light:text-gray-300" />
                    <p className="mt-2 text-sm font-medium">No top-up requests yet</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b border-white/[0.06] light:border-gray-200">
                        <tr>
                          <th className={th}>Client</th>
                          <th className={th}>Amount</th>
                          <th className={th}>Pack · Note</th>
                          <th className={th}>Status</th>
                          <th className={th}>Requested</th>
                          <th className={cn(th, 'text-right')}>Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.04] light:divide-gray-100">
                        {topups.map((t) => (
                          <tr key={t.id}>
                            <td className={cn(td, 'text-xs')}>{t.organization_name}</td>
                            <td className={cn(td, 'text-xs font-medium tabular-nums')}>{formatPrice(t.amount)}</td>
                            <td className={cn(td, 'text-[11px] text-white/60 light:text-gray-600')}>{[t.pack_name, t.note].filter(Boolean).join(' · ') || '—'}</td>
                            <td className={td}><StatusBadge status={t.status} /></td>
                            <td className={cn(td, 'text-xs whitespace-nowrap')}>{formatDate(t.created_at)}</td>
                            <td className={cn(td, 'text-right')}>
                              {t.status === 'pending' && t.type === 'credit' && (
                                <Button size="sm" className="h-7 px-2 text-xs bg-emerald-600 hover:bg-emerald-500 text-white" disabled={busy !== null} onClick={() => approve(t)}>
                                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> {busy === t.id ? 'Approving…' : 'Mark paid'}
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      )}

      <DeleteConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Delete ad"
        itemName={toDelete ? `${toDelete.name} (${toDelete.client_name})` : undefined}
        onConfirm={deleteAd}
      />

      <Dialog open={!!toDisconnect} onOpenChange={(o) => !o && setToDisconnect(null)}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Disconnect {toDisconnect?.client_name}'s page?</DialogTitle>
            <DialogDescription>
              Their Facebook account and page ({toDisconnect?.page_name || 'none chosen'}) are disconnected from the platform and their
              running ads are paused. They can connect again from their Ads Manager.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setToDisconnect(null)}>Cancel</Button>
            <Button className="bg-rose-600 hover:bg-rose-500 text-white" disabled={busy !== null} onClick={disconnect}>
              {busy?.startsWith('dis:') ? 'Disconnecting…' : 'Disconnect page'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PlatformAdsView;
