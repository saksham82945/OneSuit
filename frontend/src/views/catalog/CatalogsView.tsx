import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/shared/PageHeader';
import { SearchInput } from '@/components/shared/SearchInput';
import { ErrorState } from '@/components/shared/ErrorState';
import { Skeleton } from '@/components/shared/Skeleton';
import { Button } from '@/components/ui/button';
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
import {
  AlertTriangle,
  ChevronRight,
  Link2,
  Loader2,
  Plug,
  PlugZap,
  Plus,
  RefreshCw,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Store,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { usePlanModules } from '@/lib/planModules';
import { requestUpgrade } from '@/lib/pendingPayment';
import {
  catalogService,
  readCatalogs,
  readCatalog,
  readCommerceSettings,
  readSyncResult,
  loadAccounts,
  errorMessage,
  describeActionError,
  handleUpgradeError,
  formatDate,
  accountLabel,
  accountReadyForCatalogs,
  type Catalog,
  type CommerceSettings,
  type WhatsAppAccountOption,
  type ActionErrorInfo,
} from './catalogApi';
import { ActionErrorBox, WarningBanner, ConnectAccountButton } from './CatalogNotices';
import { CatalogHelpPanel } from './CatalogHelp';
import { LinkCatalogDialog } from './LinkCatalogDialog';

type AccountsState = 'loading' | 'ok' | 'forbidden' | 'error';

const fieldClass =
  'bg-white/[0.04] border-white/[0.08] text-white light:bg-white light:border-gray-200 light:text-gray-900';
const panelClass =
  'rounded-xl border border-white/[0.08] bg-[#141415] text-white light:border-gray-200 light:bg-white light:text-gray-900';
const outlineBtn = 'border-white/10 light:border-gray-200';

const EXPLORE_MESSAGE = 'Upgrade your plan to change catalogues — you’re exploring OneSuit.';

/* ------------------------------------------------------- WhatsApp profile */

const ProfileToggle: React.FC<{
  icon: React.ElementType;
  title: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  busy: boolean;
  onChange: (v: boolean) => void;
}> = ({ icon: Icon, title, description, checked, disabled, busy, onChange }) => (
  <label
    className={cn(
      'flex items-start gap-3 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-3 light:border-gray-200 light:bg-gray-50/60',
      disabled ? 'opacity-60' : 'cursor-pointer'
    )}
  >
    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400 light:text-emerald-600" />
    <span className="min-w-0 flex-1">
      <span className="block text-sm font-medium text-white light:text-gray-900">{title}</span>
      <span className="block text-[11px] leading-snug text-white/50 light:text-gray-500">{description}</span>
    </span>
    {busy ? (
      <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-white/50 light:text-gray-400" />
    ) : (
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} aria-label={title} />
    )}
  </label>
);

/* -------------------------------------------------------------- the page */

export const CatalogsView: React.FC = () => {
  const { t } = useTranslation();
  const { pendingPayment } = usePlanModules();

  const [catalogs, setCatalogs] = useState<Catalog[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [accounts, setAccounts] = useState<WhatsAppAccountOption[]>([]);
  const [accountsState, setAccountsState] = useState<AccountsState>('loading');
  const [selected, setSelected] = useState('');
  const [search, setSearch] = useState('');

  const [settings, setSettings] = useState<CommerceSettings | null>(null);
  const [settingsError, setSettingsError] = useState<ActionErrorInfo | null>(null);
  const [savingSetting, setSavingSetting] = useState<'visible' | 'cart' | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newConnect, setNewConnect] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<ActionErrorInfo | null>(null);

  const [linkOpen, setLinkOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [busyCatalog, setBusyCatalog] = useState<string | null>(null);

  const [toDelete, setToDelete] = useState<Catalog | null>(null);
  const [deleteInMeta, setDeleteInMeta] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
    void fetchCatalogs();
    void fetchAccounts();
  }, [fetchCatalogs, fetchAccounts]);

  const accountByName = useMemo(() => new Map(accounts.map((a) => [a.name, a])), [accounts]);
  // Selected WhatsApp number: the user's choice, else the first one that can talk to Meta.
  const current =
    accountByName.get(selected) ?? accounts.find((a) => accountReadyForCatalogs(a)) ?? accounts[0];
  const currentName = current?.name ?? '';
  const noAccount = accountsState === 'ok' && accounts.length === 0;
  const readOnly = !current;

  const connectedCatalog = useMemo(
    () => (catalogs ?? []).find((c) => c.is_connected && c.whatsapp_account === currentName),
    [catalogs, currentName]
  );

  /* ----------------------------------------------------- commerce settings */

  const fetchSettings = useCallback(async (account: string) => {
    setSettings(null);
    setSettingsError(null);
    if (!account) return;
    try {
      setSettings(readCommerceSettings(await catalogService.getCommerceSettings(account)));
    } catch (err) {
      setSettingsError(describeActionError(err, 'Couldn’t read the WhatsApp profile settings'));
    }
  }, []);

  useEffect(() => {
    void fetchSettings(currentName);
  }, [currentName, fetchSettings]);

  /** Explore mode and read-only checks before any change. */
  const canWrite = (): boolean => {
    if (pendingPayment) {
      requestUpgrade(EXPLORE_MESSAGE, { force: true });
      return false;
    }
    if (readOnly) {
      toast.error('Connect a WhatsApp number first', { description: 'Catalogues are connected through a WhatsApp number.' });
      return false;
    }
    return true;
  };

  const reportError = (err: unknown, fallback: string) => {
    if (handleUpgradeError(err)) return;
    const info = describeActionError(err, fallback);
    toast.error(info.message, { description: info.hint, duration: 8000 });
  };

  const updateSetting = async (key: 'visible' | 'cart', value: boolean) => {
    if (!canWrite() || !settings) return;
    setSavingSetting(key);
    try {
      const res = await catalogService.updateCommerceSettings({
        whatsapp_account: currentName,
        ...(key === 'visible' ? { is_catalog_visible: value } : { is_cart_enabled: value }),
      });
      setSettings(readCommerceSettings(res));
      toast.success(
        key === 'visible'
          ? value
            ? 'Catalogue now shows on your WhatsApp profile'
            : 'Catalogue hidden from your WhatsApp profile'
          : value
            ? 'Customers can now add products to a cart'
            : 'Cart turned off'
      );
    } catch (err) {
      reportError(err, 'Failed to update commerce settings');
    } finally {
      setSavingSetting(null);
    }
  };

  /* ------------------------------------------------------------ actions */

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (catalogs ?? [])
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.meta_catalog_id?.toLowerCase().includes(q))
      .sort((a, b) => Number(!!b.is_connected) - Number(!!a.is_connected) || a.name.localeCompare(b.name));
  }, [catalogs, search]);

  const openCreate = () => {
    if (!canWrite()) return;
    setNewName('');
    setNewConnect(!connectedCatalog);
    setCreateError(null);
    setCreateOpen(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) {
      setCreateError({ message: 'Give the catalogue a name.' });
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const created = readCatalog(await catalogService.create({ name, whatsapp_account: currentName, connect: newConnect }));
      toast.success(`Catalogue “${name}” created`, {
        description: newConnect && !created?.is_connected ? 'Meta didn’t allow connecting it yet — use Connect on its card.' : undefined,
      });
      setCreateOpen(false);
      void fetchCatalogs();
    } catch (err) {
      if (handleUpgradeError(err)) setCreateError({ message: EXPLORE_MESSAGE });
      else setCreateError(describeActionError(err, 'Failed to create catalog'));
    } finally {
      setCreating(false);
    }
  };

  const handleSync = async () => {
    if (!canWrite()) return;
    setSyncing(true);
    try {
      const result = readSyncResult(await catalogService.sync(currentName));
      toast.success(
        (result.total ?? 0) === 0
          ? 'Meta returned no catalogues for this number’s business'
          : `Synced ${result.synced ?? 0} catalogue${result.total === 1 ? '' : 's'} from Meta`
      );
      void fetchCatalogs();
      void fetchSettings(currentName);
    } catch (err) {
      reportError(err, 'Failed to fetch catalogs');
    } finally {
      setSyncing(false);
    }
  };

  const toggleConnection = async (c: Catalog) => {
    if (!canWrite()) return;
    setBusyCatalog(c.id);
    try {
      if (c.is_connected) {
        await catalogService.disconnect(c.id);
        toast.success(`“${c.name}” disconnected`, { description: 'It no longer shows on the WhatsApp profile.' });
      } else {
        await catalogService.connect(c.id, accountByName.has(c.whatsapp_account) ? undefined : currentName);
        toast.success(`“${c.name}” connected`, { description: 'Customers can browse it from your WhatsApp profile.' });
      }
      void fetchCatalogs();
    } catch (err) {
      reportError(err, c.is_connected ? 'Failed to disconnect catalog' : 'Failed to connect catalog');
    } finally {
      setBusyCatalog(null);
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await catalogService.delete(toDelete.id, { deleteInMeta });
      toast.success(deleteInMeta ? `“${toDelete.name}” deleted here and in Meta` : `“${toDelete.name}” removed`);
      setToDelete(null);
      void fetchCatalogs();
    } catch (err) {
      reportError(err, 'Failed to delete catalog');
    } finally {
      setDeleting(false);
    }
  };

  const totalProducts = (catalogs ?? []).reduce((sum, c) => sum + (c.product_count || 0), 0);
  const currentText = accountLabel(current);

  return (
    <div className="flex flex-col h-full bg-[#0a0a0b] light:bg-gray-50 overflow-hidden">
      <PageHeader
        title={t('nav.catalogs', 'Catalogue')}
        subtitle="Show your products on your WhatsApp profile and share them in chats — kept in sync with Meta Commerce Manager"
        icon={ShoppingBag}
        actions={
          <>
            <Button variant="outline" size="sm" className={outlineBtn} disabled={syncing || readOnly} onClick={handleSync}>
              <RefreshCw className={cn('h-4 w-4 sm:mr-2', syncing && 'animate-spin')} />
              <span className="hidden sm:inline">{syncing ? 'Syncing…' : 'Sync from Meta'}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className={outlineBtn}
              disabled={readOnly}
              onClick={() => canWrite() && setLinkOpen(true)}
            >
              <Link2 className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Link catalogue</span>
            </Button>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white" disabled={readOnly} onClick={openCreate}>
              <Plus className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Create catalogue</span>
            </Button>
          </>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {noAccount && (
          <WarningBanner title="Read-only: no WhatsApp number connected" action={<ConnectAccountButton label="Connect a number" />}>
            A catalogue is connected through a WhatsApp number (its business account and access token). Connect a number
            to link, create or edit catalogues — until then this page only shows what’s already here.
          </WarningBanner>
        )}
        {accountsState === 'forbidden' && (
          <WarningBanner title="Read-only: your role can’t see WhatsApp numbers">
            Ask an admin for access to WhatsApp accounts to connect catalogues.
          </WarningBanner>
        )}
        {accountsState === 'error' && (
          <WarningBanner
            title="Couldn’t load your WhatsApp numbers"
            action={
              <Button size="sm" variant="outline" className={outlineBtn} onClick={fetchAccounts}>
                Retry
              </Button>
            }
          >
            Connecting and editing catalogues needs a WhatsApp number.
          </WarningBanner>
        )}
        {pendingPayment && !readOnly && (
          <WarningBanner
            title="You’re exploring OneSuit"
            action={
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white shrink-0" onClick={() => requestUpgrade(EXPLORE_MESSAGE, { force: true })}>
                Upgrade
              </Button>
            }
          >
            Look around freely — connecting catalogues and changing products needs a paid plan.
          </WarningBanner>
        )}

        {/* WhatsApp number + profile settings */}
        {current && (
          <section className={cn(panelClass, 'p-4 sm:p-5')}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 text-emerald-400 light:text-emerald-600">
                  <Smartphone className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold">WhatsApp profile</h2>
                  <p className="text-xs text-white/50 light:text-gray-500">
                    {connectedCatalog ? (
                      <>
                        Showing <b className="text-white/80 light:text-gray-800">{connectedCatalog.name}</b> on {currentText}
                      </>
                    ) : (
                      <>No catalogue connected to {currentText} yet — link or create one below.</>
                    )}
                  </p>
                </div>
              </div>
              {accounts.length > 1 && (
                <Select value={currentName} onValueChange={setSelected}>
                  <SelectTrigger className="h-9 w-full sm:w-64" aria-label="WhatsApp number">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id || a.name} value={a.name}>
                        {accountLabel(a)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {!accountReadyForCatalogs(current) && (
              <p className="mt-3 text-[11px] text-amber-400 light:text-amber-700">
                This number has no {current.business_id ? 'access token' : 'business account ID'}, so Meta will refuse
                catalogue changes. Fix it under Settings → Accounts.
              </p>
            )}

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <ProfileToggle
                icon={Store}
                title="Show catalogue on WhatsApp profile"
                description="Adds the shop button to your business profile and chats so customers can browse products."
                checked={!!settings?.is_catalog_visible}
                disabled={!settings || !!savingSetting}
                busy={savingSetting === 'visible' || (!settings && !settingsError)}
                onChange={(v) => updateSetting('visible', v)}
              />
              <ProfileToggle
                icon={ShoppingCart}
                title="Allow cart"
                description="Customers can add products to a cart and send you the order in the chat."
                checked={!!settings?.is_cart_enabled}
                disabled={!settings || !!savingSetting}
                busy={savingSetting === 'cart' || (!settings && !settingsError)}
                onChange={(v) => updateSetting('cart', v)}
              />
            </div>
            {settingsError && (
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start">
                <ActionErrorBox error={settingsError} className="flex-1" />
                <Button size="sm" variant="outline" className={outlineBtn} onClick={() => fetchSettings(currentName)}>
                  Retry
                </Button>
              </div>
            )}
            {settings?.is_catalog_visible && !connectedCatalog && (
              <p className="mt-3 text-[11px] text-amber-400 light:text-amber-700">
                The shop button is on, but no catalogue is connected, so customers will see an empty shop.
              </p>
            )}
          </section>
        )}

        {/* Catalogue list */}
        {loadError ? (
          <div className={panelClass}>
            <ErrorState title="Couldn’t load catalogues" description={loadError} onRetry={fetchCatalogs} />
          </div>
        ) : (
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-white light:text-gray-900">Your catalogues</h2>
                <p className="text-xs text-white/50 light:text-gray-500">
                  {catalogs === null
                    ? 'Loading…'
                    : `${catalogs.length} catalogue${catalogs.length === 1 ? '' : 's'} · ${totalProducts} product${totalProducts === 1 ? '' : 's'}`}
                </p>
              </div>
              {(catalogs?.length ?? 0) > 3 && (
                <SearchInput value={search} onChange={setSearch} placeholder="Search catalogues…" className="w-full sm:w-64" />
              )}
            </div>

            {catalogs === null ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-40 rounded-xl" />
                ))}
              </div>
            ) : visible.length === 0 ? (
              <div className={cn(panelClass, 'flex flex-col items-center px-6 py-10 text-center')}>
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 light:text-emerald-600">
                  <ShoppingBag className="h-6 w-6" />
                </div>
                <p className="text-sm font-semibold">{search.trim() ? 'No catalogues match' : 'No catalogues yet'}</p>
                <p className="mt-1 max-w-md text-xs text-white/50 light:text-gray-500">
                  {search.trim()
                    ? 'Try a different name or ID.'
                    : readOnly
                      ? 'Connect a WhatsApp number, then link your Commerce Manager catalogue or create a new one.'
                      : 'Link the catalogue you already have in Commerce Manager, pull it in with Sync from Meta, or create a new one.'}
                </p>
                {!search.trim() && !readOnly && (
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white" onClick={() => canWrite() && setLinkOpen(true)}>
                      <Link2 className="h-4 w-4 mr-2" /> Link catalogue
                    </Button>
                    <Button size="sm" variant="outline" className={outlineBtn} onClick={openCreate}>
                      <Plus className="h-4 w-4 mr-2" /> Create catalogue
                    </Button>
                  </div>
                )}
                {noAccount && (
                  <div className="mt-4">
                    <ConnectAccountButton label="Connect a WhatsApp number" />
                  </div>
                )}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {visible.map((c) => {
                  const acc = accountByName.get(c.whatsapp_account);
                  const accountMissing = accountsState === 'ok' && !acc;
                  return (
                    <article
                      key={c.id}
                      className={cn(
                        panelClass,
                        'flex flex-col p-4 transition-colors',
                        c.is_connected && 'border-emerald-500/40 light:border-emerald-300'
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={cn(
                            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                            c.is_connected
                              ? 'bg-emerald-500/15 text-emerald-400 light:bg-emerald-100 light:text-emerald-700'
                              : 'bg-white/[0.06] text-white/50 light:bg-gray-100 light:text-gray-500'
                          )}
                        >
                          <Store className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <Link
                            to={`/catalogs/${c.id}`}
                            className="block truncate text-sm font-semibold hover:text-emerald-400 light:hover:text-emerald-700"
                          >
                            {c.name}
                          </Link>
                          <p className="truncate font-mono text-[11px] text-white/40 light:text-gray-500">ID {c.meta_catalog_id}</p>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
                        {c.is_connected ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 font-medium text-emerald-400 light:bg-emerald-100 light:text-emerald-700">
                            <PlugZap className="h-3 w-3" /> Connected to {accountLabel(acc, c.whatsapp_account)}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2 py-0.5 text-white/60 light:bg-gray-100 light:text-gray-600">
                            <Plug className="h-3 w-3" /> Not connected
                          </span>
                        )}
                        {accountMissing && (
                          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-400 light:bg-amber-100 light:text-amber-700">
                            Number not in workspace
                          </span>
                        )}
                        {(c.sync_error_count ?? 0) > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-red-400 light:bg-red-100 light:text-red-700">
                            <AlertTriangle className="h-3 w-3" /> {c.sync_error_count} not in Meta
                          </span>
                        )}
                      </div>

                      <p className="mt-2 text-xs text-white/50 light:text-gray-500">
                        {c.product_count ?? 0} product{c.product_count === 1 ? '' : 's'}
                        {c.last_synced_at ? ` · synced ${formatDate(c.last_synced_at)}` : ''}
                      </p>

                      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
                        <Button asChild size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white">
                          <Link to={`/catalogs/${c.id}`}>
                            Products <ChevronRight className="h-4 w-4 ml-1" />
                          </Link>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className={outlineBtn}
                          disabled={readOnly || busyCatalog === c.id}
                          onClick={() => toggleConnection(c)}
                        >
                          {busyCatalog === c.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : c.is_connected ? (
                            'Disconnect'
                          ) : (
                            'Connect'
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="ml-auto text-white/50 hover:text-red-400 light:text-gray-500"
                          aria-label={`Remove ${c.name}`}
                          onClick={() => {
                            if (pendingPayment) {
                              requestUpgrade(EXPLORE_MESSAGE, { force: true });
                              return;
                            }
                            setDeleteInMeta(false);
                            setToDelete(c);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        <CatalogHelpPanel key={catalogs?.length === 0 ? 'open' : 'closed'} defaultOpen={catalogs?.length === 0} />
      </div>

      {/* Create */}
      <Dialog open={createOpen} onOpenChange={(open) => !creating && setCreateOpen(open)}>
        <DialogContent className="sm:max-w-[440px]">
          <form onSubmit={handleCreate} noValidate>
            <DialogHeader>
              <DialogTitle>Create catalogue</DialogTitle>
              <DialogDescription>
                Made in Meta Commerce Manager, in the business that owns {currentText}.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-1.5">
                <Label htmlFor="catalogName" className="text-xs">Name *</Label>
                <Input
                  id="catalogName"
                  autoFocus
                  placeholder="e.g. Summer collection"
                  maxLength={255}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className={fieldClass}
                />
              </div>
              <label className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.08] px-3 py-2 light:border-gray-200">
                <span className="text-xs text-white/80 light:text-gray-700">
                  Connect to {currentText}
                  {connectedCatalog && <span className="block text-[11px] text-white/40 light:text-gray-500">Replaces “{connectedCatalog.name}”</span>}
                </span>
                <Switch checked={newConnect} onCheckedChange={setNewConnect} />
              </label>
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

      {current && (
        <LinkCatalogDialog
          open={linkOpen}
          onOpenChange={setLinkOpen}
          account={currentName}
          accountText={currentText}
          onLinked={(c) => {
            toast.success(`“${c.name}” linked${c.is_connected ? ' and connected' : ''}`);
            setLinkOpen(false);
            void fetchCatalogs();
          }}
        />
      )}

      {/* Delete */}
      <Dialog open={!!toDelete} onOpenChange={(open) => !open && !deleting && setToDelete(null)}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Remove catalogue</DialogTitle>
            <DialogDescription>
              {toDelete &&
                `Remove “${toDelete.name}” and its ${toDelete.product_count ?? 0} product${toDelete.product_count === 1 ? '' : 's'} from OneSuit?`}
            </DialogDescription>
          </DialogHeader>
          <label className="flex items-start gap-3 rounded-lg border border-red-500/25 bg-red-500/[0.06] px-3 py-2 light:border-red-200 light:bg-red-50">
            <input
              type="checkbox"
              className="mt-0.5 accent-red-600"
              checked={deleteInMeta}
              onChange={(e) => setDeleteInMeta(e.target.checked)}
            />
            <span className="text-xs text-white/80 light:text-gray-700">
              Also delete it in Meta Commerce Manager
              <span className="block text-[11px] text-white/50 light:text-gray-500">
                Permanently deletes the catalogue and all its products for every app and shop. Can’t be undone.
              </span>
            </span>
          </label>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" disabled={deleting} onClick={() => setToDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={deleting} onClick={handleDelete}>
              {deleting ? 'Removing…' : deleteInMeta ? 'Delete everywhere' : 'Remove'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CatalogsView;
