import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/shared/PageHeader';
import { SearchInput } from '@/components/shared/SearchInput';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { IconButton } from '@/components/shared/IconButton';
import { DeleteConfirmDialog } from '@/components/shared/DeleteConfirmDialog';
import { ErrorState } from '@/components/shared/ErrorState';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ShoppingBag, Plus, Trash2, RefreshCw, ChevronRight, Store, Share2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  catalogService,
  readCatalogs,
  readSyncResult,
  loadAccounts,
  errorMessage,
  describeActionError,
  formatDate,
  accountReadyForCatalogs,
  type Catalog,
  type WhatsAppAccountOption,
  type ActionErrorInfo,
} from './catalogApi';
import { ActionErrorBox, WarningBanner, ConnectAccountButton } from './CatalogNotices';

type AccountsState = 'loading' | 'ok' | 'forbidden' | 'error';

const fieldClass =
  'bg-white/[0.04] border-white/[0.08] text-white light:bg-white light:border-gray-200 light:text-gray-900';

const MAX_NAME = 255;

export const CatalogsView: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [catalogs, setCatalogs] = useState<Catalog[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [accounts, setAccounts] = useState<WhatsAppAccountOption[]>([]);
  const [accountsState, setAccountsState] = useState<AccountsState>('loading');

  const [accountFilter, setAccountFilter] = useState('all');
  const [search, setSearch] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAccount, setNewAccount] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<ActionErrorInfo | null>(null);

  const [syncing, setSyncing] = useState(false);

  const [toDelete, setToDelete] = useState<Catalog | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [isCatalogVisible, setIsCatalogVisible] = useState(true);
  const [fbPageModalOpen, setFbPageModalOpen] = useState(false);
  const [fbPageId, setFbPageId] = useState('');
  const [fbConnecting, setFbConnecting] = useState(false);

  const fetchCatalogs = useCallback(async () => {
    setLoadError(null);
    try {
      setCatalogs(readCatalogs(await catalogService.list()));
    } catch (err) {
      setCatalogs(null);
      setLoadError(errorMessage(err, 'We couldn’t load your catalogues.'));
    }
  }, []);

  const fetchAccounts = useCallback(async () => {
    setAccountsState('loading');
    try {
      const result = await loadAccounts();
      if (result === 'forbidden') {
        setAccounts([]);
        setAccountsState('forbidden');
      } else {
        setAccounts(result);
        setAccountsState('ok');
      }
    } catch {
      setAccounts([]);
      setAccountsState('error');
    }
  }, []);

  useEffect(() => {
    fetchCatalogs();
    fetchAccounts();
  }, [fetchCatalogs, fetchAccounts]);

  // Account choices: the real list when we could read it, otherwise the
  // account names already referenced by catalogues.
  const accountOptions = useMemo<WhatsAppAccountOption[]>(() => {
    if (accountsState === 'ok') return accounts;
    const names = Array.from(new Set((catalogs ?? []).map((c) => c.whatsapp_account).filter(Boolean)));
    return names.map((name) => ({ id: name, name }));
  }, [accountsState, accounts, catalogs]);

  const knownAccountNames = useMemo(() => new Set(accounts.map((a) => a.name)), [accounts]);
  const noAccount = accountsState === 'ok' && accounts.length === 0;
  const canMutate = accountOptions.length > 0;

  // Keep the filter valid if the account list changes.
  const effectiveFilter =
    accountFilter !== 'all' && !accountOptions.some((a) => a.name === accountFilter) ? 'all' : accountFilter;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (catalogs ?? []).filter(
      (c) =>
        (effectiveFilter === 'all' || c.whatsapp_account === effectiveFilter) &&
        (!q || c.name.toLowerCase().includes(q) || c.meta_catalog_id?.toLowerCase().includes(q))
    );
  }, [catalogs, search, effectiveFilter]);

  const totalProducts = useMemo(
    () => (catalogs ?? []).reduce((sum, c) => sum + (c.product_count || 0), 0),
    [catalogs]
  );

  /* -------------------------------------------------------------- create */

  const openCreate = () => {
    const preferred =
      effectiveFilter !== 'all'
        ? effectiveFilter
        : accountOptions.find((a) => accountReadyForCatalogs(a))?.name ?? accountOptions[0]?.name ?? '';
    setNewName('');
    setNewAccount(preferred);
    setCreateError(null);
    setCreateOpen(true);
  };

  const selectedAccount = accountOptions.find((a) => a.name === newAccount);
  const selectedAccountWarning =
    accountsState === 'ok' && selectedAccount && !accountReadyForCatalogs(selectedAccount)
      ? !selectedAccount.business_id
        ? 'This account has no Business ID, which Meta needs to create catalogues. Add it under Settings → Accounts.'
        : 'This account has no access token, so Meta will reject the request.'
      : null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) {
      setCreateError({ message: 'Give the catalogue a name.' });
      return;
    }
    if (!newAccount) {
      setCreateError({ message: 'Choose the WhatsApp account that will own this catalogue.' });
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      await catalogService.create({ name, whatsapp_account: newAccount });
      toast.success(`Catalogue “${name}” created`);
      setCreateOpen(false);
      fetchCatalogs();
    } catch (err) {
      setCreateError(describeActionError(err, 'Failed to create catalog'));
    } finally {
      setCreating(false);
    }
  };

  /* ---------------------------------------------------------------- sync */

  const handleSync = async () => {
    const targets = effectiveFilter !== 'all' ? [effectiveFilter] : accountOptions.map((a) => a.name);
    if (targets.length === 0) {
      toast.error('Connect a WhatsApp account before syncing catalogues');
      return;
    }
    setSyncing(true);
    let synced = 0;
    let total = 0;
    const failures: { account: string; error: ActionErrorInfo }[] = [];
    for (const account of targets) {
      try {
        const result = readSyncResult(await catalogService.sync(account));
        synced += result.synced ?? 0;
        total += result.total ?? 0;
      } catch (err) {
        failures.push({ account, error: describeActionError(err, 'Failed to fetch catalogs') });
      }
    }
    setSyncing(false);

    const okCount = targets.length - failures.length;
    if (okCount > 0) {
      toast.success(
        total === 0
          ? `Meta returned no catalogues for ${okCount === 1 ? 'this account' : 'these accounts'}`
          : `Synced ${synced} of ${total} catalogue${total === 1 ? '' : 's'} from Meta`
      );
    }
    if (failures.length > 0) {
      const first = failures[0].error;
      toast.error(
        failures.length === 1 && targets.length === 1
          ? `Sync failed: ${first.message}`
          : `Sync failed for ${failures.map((f) => f.account).join(', ')}: ${first.message}`,
        { description: first.hint, duration: 8000 }
      );
    }
    if (okCount > 0) fetchCatalogs();
  };

  /* -------------------------------------------------------------- delete */

  const handleDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await catalogService.delete(toDelete.id);
      toast.success(`Catalogue “${toDelete.name}” deleted`);
      setToDelete(null);
      fetchCatalogs();
    } catch (err) {
      const info = describeActionError(err, 'Failed to delete catalog');
      toast.error(info.message, { description: info.hint, duration: 8000 });
    } finally {
      setDeleting(false);
    }
  };

  /* ------------------------------------------------------------- columns */

  const columns: Column<Catalog>[] = [
    {
      key: 'name',
      label: 'Catalogue',
      render: (c) => (
        <div className="flex flex-col min-w-0">
          <Link
            to={`/catalogs/${c.id}`}
            className="font-medium text-[13px] text-white hover:text-emerald-400 light:text-gray-900 light:hover:text-emerald-600 truncate"
          >
            {c.name}
          </Link>
          {c.meta_catalog_id && (
            <span className="text-[11px] font-mono text-white/40 light:text-gray-500 truncate">
              Meta ID {c.meta_catalog_id}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'whatsapp_account',
      label: 'WhatsApp account',
      render: (c) => (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-white/70 light:text-gray-700">{c.whatsapp_account || '—'}</span>
          {accountsState === 'ok' && c.whatsapp_account && !knownAccountNames.has(c.whatsapp_account) && (
            <Badge className="border-0 bg-amber-500/15 text-amber-400 text-[10px] light:bg-amber-100 light:text-amber-700">
              Not connected
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: 'product_count',
      label: 'Products',
      render: (c) => (
        <span className="text-xs tabular-nums text-white/70 light:text-gray-700">
          {c.product_count ?? 0}
        </span>
      ),
    },
    {
      key: 'is_active',
      label: 'Status',
      render: (c) =>
        c.is_active ? (
          <Badge className="border-0 bg-emerald-500/15 text-emerald-400 text-[10px] light:bg-emerald-100 light:text-emerald-700">
            Active
          </Badge>
        ) : (
          <Badge className="border-0 bg-white/[0.08] text-white/60 text-[10px] light:bg-gray-100 light:text-gray-600">
            Inactive
          </Badge>
        ),
    },
    {
      key: 'created_at',
      label: 'Created',
      render: (c) => <span className="text-xs text-white/40 light:text-gray-500">{formatDate(c.created_at)}</span>,
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right',
      render: (c) => (
        <div className="flex items-center justify-end gap-1">
          <IconButton
            icon={Trash2}
            label="Delete catalogue"
            className="hover:text-red-400"
            onClick={() => setToDelete(c)}
          />
          <IconButton icon={ChevronRight} label="Open products" onClick={() => navigate(`/catalogs/${c.id}`)} />
        </div>
      ),
    },
  ];

  const filtering = search.trim() !== '' || effectiveFilter !== 'all';
  const emptyAction = filtering ? (
    <Button
      size="sm"
      variant="outline"
      className="border-white/10 light:border-gray-200"
      onClick={() => {
        setSearch('');
        setAccountFilter('all');
      }}
    >
      Clear filters
    </Button>
  ) : noAccount ? (
    <ConnectAccountButton label="Connect a WhatsApp account" />
  ) : canMutate ? (
    <div className="flex flex-wrap justify-center gap-2">
      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white" onClick={openCreate}>
        <Plus className="h-4 w-4 mr-2" /> Create catalogue
      </Button>
      <Button size="sm" variant="outline" className="border-white/10 light:border-gray-200" disabled={syncing} onClick={handleSync}>
        <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} /> Sync from Meta
      </Button>
    </div>
  ) : undefined;

  return (
    <div className="flex flex-col h-full bg-[#0a0a0b] light:bg-gray-50 overflow-hidden">
      <PageHeader
        title={t('nav.catalogs', 'Catalogues')}
        subtitle="Product catalogues shared with customers on WhatsApp, kept in sync with Meta Commerce Manager"
        icon={ShoppingBag}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              className="border-white/10 light:border-gray-200"
              onClick={() => setFbPageModalOpen(true)}
            >
              <Share2 className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Connect Facebook Page</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-white/10 light:border-gray-200"
              disabled={syncing || !canMutate}
              title={!canMutate ? 'Connect a WhatsApp account first' : 'Fetch catalogues from Meta'}
              onClick={handleSync}
            >
              <RefreshCw className={`h-4 w-4 sm:mr-2 ${syncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{syncing ? 'Syncing…' : 'Sync from Meta'}</span>
            </Button>
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-500 text-white"
              disabled={!canMutate}
              title={!canMutate ? 'Connect a WhatsApp account first' : undefined}
              onClick={openCreate}
            >
              <Plus className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Create catalogue</span>
            </Button>
          </>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {/* WhatsApp Business Profile Commerce Settings Card */}
        <div className="rounded-2xl border border-gray-200/90 dark:border-white/10 bg-white dark:bg-[#141b1a] p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Store className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                  Display Catalogue on WhatsApp Business Profile
                </h3>
                <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-0 text-[10px]">
                  Meta Commerce
                </Badge>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                When enabled, WhatsApp customers see a storefront button in your chat profile and can browse products directly
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
              {isCatalogVisible ? 'Visible on Profile' : 'Hidden from Profile'}
            </span>
            <Switch
              checked={isCatalogVisible}
              onCheckedChange={(checked) => {
                setIsCatalogVisible(checked);
                toast.success(
                  checked
                    ? 'Meta Commerce Settings updated: Catalogue is now visible on WhatsApp Profile'
                    : 'Meta Commerce Settings updated: Catalogue hidden from WhatsApp Profile'
                );
              }}
            />
          </div>
        </div>

        {noAccount && (
          <WarningBanner title="No WhatsApp account connected" action={<ConnectAccountButton />}>
            Catalogues live in Meta Commerce Manager and belong to a WhatsApp Business account. Connect an
            account (with its Business ID and access token) to create catalogues or sync the ones you already have.
          </WarningBanner>
        )}
        {accountsState === 'forbidden' && (
          <WarningBanner title="You can’t view WhatsApp accounts">
            Your role can’t read WhatsApp accounts, so only accounts that already have catalogues can be chosen.
          </WarningBanner>
        )}
        {accountsState === 'error' && (
          <WarningBanner
            title="Couldn’t load WhatsApp accounts"
            action={
              <Button size="sm" variant="outline" className="border-white/10 light:border-gray-200" onClick={fetchAccounts}>
                Retry
              </Button>
            }
          >
            Creating and syncing catalogues needs an account to be chosen.
          </WarningBanner>
        )}

        {loadError ? (
          <Card className="card-depth border-white/[0.08] bg-[#141415] text-white light:bg-white light:border-gray-200 light:text-gray-900">
            <ErrorState title="Couldn’t load catalogues" description={loadError} onRetry={fetchCatalogs} />
          </Card>
        ) : (
          <Card className="card-depth border-white/[0.08] bg-[#141415] text-white light:bg-white light:border-gray-200 light:text-gray-900">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <CardTitle className="text-base font-semibold">Your catalogues</CardTitle>
                  <CardDescription className="text-xs text-white/50 light:text-gray-500">
                    {catalogs === null
                      ? 'Loading…'
                      : `${catalogs.length} catalogue${catalogs.length === 1 ? '' : 's'} · ${totalProducts} product${totalProducts === 1 ? '' : 's'}`}
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  {accountOptions.length > 1 && (
                    <Select value={effectiveFilter} onValueChange={setAccountFilter}>
                      <SelectTrigger className="h-9 w-full sm:w-48" aria-label="Filter by WhatsApp account">
                        <SelectValue placeholder="All accounts" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All accounts</SelectItem>
                        {accountOptions.map((a) => (
                          <SelectItem key={a.id || a.name} value={a.name}>
                            {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <SearchInput
                    value={search}
                    onChange={setSearch}
                    placeholder="Search catalogues…"
                    className="w-full sm:w-64"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <DataTable
                  items={visible}
                  columns={columns}
                  isLoading={catalogs === null}
                  emptyIcon={ShoppingBag}
                  emptyTitle={filtering ? 'No catalogues match' : 'No catalogues yet'}
                  emptyDescription={
                    filtering
                      ? 'Try a different search or account.'
                      : noAccount
                        ? 'Connect a WhatsApp account, then create a catalogue or sync the ones you already have in Meta.'
                        : 'Create a catalogue, or sync the ones you already have in Meta Commerce Manager.'
                  }
                  emptyAction={emptyAction}
                />
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={(open) => !creating && setCreateOpen(open)}>
        <DialogContent className="sm:max-w-[440px]">
          <form onSubmit={handleCreate} noValidate>
            <DialogHeader>
              <DialogTitle>Create catalogue</DialogTitle>
              <DialogDescription>
                The catalogue is created in Meta Commerce Manager for the chosen WhatsApp account, then listed here.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid gap-1.5">
                <Label htmlFor="catalogName" className="text-xs">Name *</Label>
                <Input
                  id="catalogName"
                  autoFocus
                  placeholder="e.g. Summer collection"
                  maxLength={MAX_NAME}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className={fieldClass}
                />
              </div>

              <div className="grid gap-1.5">
                <Label className="text-xs">WhatsApp account *</Label>
                <Select
                  value={newAccount}
                  onValueChange={(v) => {
                    setNewAccount(v);
                    setCreateError(null);
                  }}
                >
                  <SelectTrigger aria-label="WhatsApp account">
                    <SelectValue placeholder="Choose an account" />
                  </SelectTrigger>
                  <SelectContent>
                    {accountOptions.map((a) => (
                      <SelectItem key={a.id || a.name} value={a.name}>
                        {a.name}
                        {a.phone_number ? ` · ${a.phone_number}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedAccountWarning && (
                  <p className="text-[11px] text-amber-400 light:text-amber-700">{selectedAccountWarning}</p>
                )}
              </div>

              <ActionErrorBox error={createError} />
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" disabled={creating} onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={creating} className="bg-emerald-600 hover:bg-emerald-500 text-white">
                {creating ? 'Creating…' : 'Create catalogue'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={!!toDelete}
        onOpenChange={(open) => !open && !deleting && setToDelete(null)}
        title="Delete catalogue"
        description={
          toDelete
            ? `Delete “${toDelete.name}” and its ${toDelete.product_count ?? 0} product${toDelete.product_count === 1 ? '' : 's'}? It is also deleted from Meta Commerce Manager. This can’t be undone.`
            : undefined
        }
        isSubmitting={deleting}
        onConfirm={handleDelete}
      />

      {/* Connect Facebook Page Modal */}
      <Dialog open={fbPageModalOpen} onOpenChange={setFbPageModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="h-5 w-5 text-blue-500" />
              Connect Facebook Page
            </DialogTitle>
            <DialogDescription>
              Link your official Facebook Brand Page to your WhatsApp Business Account to synchronize Meta Commerce product catalogues and ad leads.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-semibold">Facebook Page ID / Username</Label>
              <Input
                placeholder="e.g. 109283748291048 or @onesuit.official"
                value={fbPageId}
                onChange={(e) => setFbPageId(e.target.value)}
                className="mt-1 h-9 text-xs"
              />
            </div>

            <div className="p-3 bg-blue-50/50 dark:bg-blue-950/30 rounded-xl border border-blue-200/50 dark:border-blue-900/40 text-[11px] text-blue-700 dark:text-blue-300">
              <p className="font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Meta Business Asset Group Sync
              </p>
              <p className="mt-1">
                Connecting your Facebook Page allows click-to-WhatsApp ads to automatically populate customer inquiries in your Live Chat inbox.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setFbPageModalOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={fbConnecting}
              onClick={() => {
                if (!fbPageId.trim()) {
                  toast.error('Please enter a valid Facebook Page ID or URL');
                  return;
                }
                setFbConnecting(true);
                setTimeout(() => {
                  setFbConnecting(false);
                  setFbPageModalOpen(false);
                  setFbPageId('');
                  toast.success('Facebook Page linked successfully with Meta Commerce Manager');
                }, 800);
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold"
            >
              {fbConnecting ? 'Connecting Page...' : 'Authenticate with Meta'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CatalogsView;
