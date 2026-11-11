import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { SearchInput } from '@/components/shared/SearchInput';
import { DeleteConfirmDialog } from '@/components/shared/DeleteConfirmDialog';
import { ErrorState } from '@/components/shared/ErrorState';
import { Skeleton } from '@/components/shared/Skeleton';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileUp,
  Loader2,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  ShoppingBag,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { usePlanModules } from '@/lib/planModules';
import { requestUpgrade } from '@/lib/pendingPayment';
import {
  catalogService,
  readCatalog,
  readProduct,
  readProducts,
  readSyncResult,
  loadAccounts,
  errorMessage,
  errorStatus,
  describeActionError,
  handleUpgradeError,
  formatPrice,
  formatDate,
  availabilityLabel,
  isOrderable,
  accountLabel,
  AVAILABILITY_OPTIONS,
  type Catalog,
  type CatalogProduct,
  type WhatsAppAccountOption,
} from './catalogApi';
import { WarningBanner, ConnectAccountButton } from './CatalogNotices';
import { ProductFormDialog } from './ProductFormDialog';
import { ImportProductsDialog } from './ImportProductsDialog';
import { ProductSetsPanel } from './ProductSetsPanel';

type LoadError = { message: string; notFound: boolean };

const panelClass =
  'rounded-xl border border-white/[0.08] bg-[#141415] text-white light:border-gray-200 light:bg-white light:text-gray-900';
const outlineBtn = 'border-white/10 light:border-gray-200';
const EXPLORE_MESSAGE = 'Upgrade your plan to change products — you’re exploring OneSuit.';

/** Product image with a placeholder when there is none or it fails to load. */
const ProductImage: React.FC<{ src: string; alt: string }> = ({ src, alt }) => {
  const [failed, setFailed] = useState(false);
  return (
    <div className="aspect-square w-full overflow-hidden bg-white/[0.04] flex items-center justify-center light:bg-gray-100">
      {src && !failed ? (
        <img src={src} alt={alt} loading="lazy" className="h-full w-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <Package className="h-8 w-8 text-white/20 light:text-gray-300" />
      )}
    </div>
  );
};

const SyncBadge: React.FC<{ p: CatalogProduct }> = ({ p }) => {
  if (p.sync_status === 'error') {
    return (
      <span
        title={p.sync_error}
        className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-medium text-red-400 light:bg-red-100 light:text-red-700"
      >
        <AlertTriangle className="h-3 w-3" /> Not in Meta
      </span>
    );
  }
  if (p.sync_status === 'pending') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-400 light:bg-amber-100 light:text-amber-700">
        Pending
      </span>
    );
  }
  return (
    <span
      title={p.last_synced_at ? `Synced ${formatDate(p.last_synced_at)}` : 'In Meta'}
      className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400 light:bg-emerald-50 light:text-emerald-700"
    >
      <CheckCircle2 className="h-3 w-3" /> Synced
    </span>
  );
};

export const CatalogDetailView: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { pendingPayment } = usePlanModules();

  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [products, setProducts] = useState<CatalogProduct[] | null>(null);
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [accounts, setAccounts] = useState<WhatsAppAccountOption[] | null>(null);

  const [tab, setTab] = useState('products');
  const [search, setSearch] = useState('');
  const [availability, setAvailability] = useState('all');
  const [onlyProblems, setOnlyProblems] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogProduct | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pushing, setPushing] = useState<string | null>(null);

  const [toDelete, setToDelete] = useState<CatalogProduct | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    setCatalog(null);
    setProducts(null);
    try {
      const [catalogRes, productsRes] = await Promise.all([catalogService.get(id), catalogService.listProducts(id)]);
      setCatalog(readCatalog(catalogRes));
      setProducts(readProducts(productsRes));
    } catch (err) {
      const status = errorStatus(err);
      setLoadError({
        notFound: status === 404 || status === 400,
        message: errorMessage(err, 'We couldn’t load this catalogue.'),
      });
    }
  }, [id]);

  const refreshProducts = useCallback(async () => {
    try {
      const list = readProducts(await catalogService.listProducts(id));
      setProducts(list);
      setCatalog((c) =>
        c ? { ...c, product_count: list.length, sync_error_count: list.filter((p) => p.sync_status === 'error').length } : c
      );
    } catch (err) {
      toast.error(errorMessage(err, 'Couldn’t refresh the product list'));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    loadAccounts()
      .then((result) => setAccounts(result === 'forbidden' ? null : result))
      .catch(() => setAccounts(null));
  }, []);

  const account = useMemo(
    () => (catalog && accounts ? accounts.find((a) => a.name === catalog.whatsapp_account) : undefined),
    [catalog, accounts]
  );
  // Without the catalogue's WhatsApp number nothing can reach Meta: read-only.
  const accountMissing = !!catalog && accounts !== null && !account;
  const readOnly = accountMissing;

  const canWrite = useCallback((): boolean => {
    if (pendingPayment) {
      requestUpgrade(EXPLORE_MESSAGE, { force: true });
      return false;
    }
    if (readOnly) {
      toast.error('This catalogue is read-only', { description: 'Its WhatsApp number isn’t connected to your workspace.' });
      return false;
    }
    return true;
  }, [pendingPayment, readOnly]);

  const reportError = (err: unknown, fallback: string) => {
    if (handleUpgradeError(err)) return;
    const info = describeActionError(err, fallback);
    toast.error(info.message, { description: info.hint, duration: 8000 });
  };

  const problemCount = (products ?? []).filter((p) => p.sync_status === 'error').length;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (products ?? []).filter(
      (p) =>
        (availability === 'all' || (p.availability || 'in stock') === availability) &&
        (!onlyProblems || p.sync_status === 'error') &&
        (!q ||
          p.name.toLowerCase().includes(q) ||
          p.retailer_id?.toLowerCase().includes(q) ||
          p.brand?.toLowerCase().includes(q) ||
          p.category?.toLowerCase().includes(q))
    );
  }, [products, search, availability, onlyProblems]);

  const openCreate = () => {
    if (!canWrite()) return;
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (p: CatalogProduct) => {
    if (!canWrite()) return;
    setEditing(p);
    setFormOpen(true);
  };

  const handleSaved = (saved: CatalogProduct, mode: 'create' | 'edit') => {
    if (saved.sync_status === 'error') {
      toast.warning(`“${saved.name}” saved here, but Meta rejected it`, { description: saved.sync_error, duration: 10000 });
    } else {
      toast.success(mode === 'create' ? `“${saved.name}” added to the catalogue` : `“${saved.name}” updated`);
    }
    setFormOpen(false);
    void refreshProducts();
  };

  const handleSyncFromMeta = async () => {
    if (!canWrite()) return;
    setSyncing(true);
    try {
      const r = readSyncResult(await catalogService.syncProducts(id));
      toast.success(`Synced ${r.total ?? 0} product${r.total === 1 ? '' : 's'} from Meta`, {
        description: [
          r.created ? `${r.created} new` : '',
          r.updated ? `${r.updated} updated` : '',
          r.missing ? `${r.missing} no longer in Meta` : '',
        ]
          .filter(Boolean)
          .join(' · ') || undefined,
      });
      void refreshProducts();
    } catch (err) {
      reportError(err, 'Failed to fetch products');
    } finally {
      setSyncing(false);
    }
  };

  const retryPush = async (p: CatalogProduct) => {
    if (!canWrite()) return;
    setPushing(p.id);
    try {
      const saved = readProduct(await catalogService.pushProduct(id, p.id));
      if (saved?.sync_status === 'error') toast.error('Meta still rejects it', { description: saved.sync_error, duration: 10000 });
      else toast.success(`“${p.name}” is now in Meta`);
      void refreshProducts();
    } catch (err) {
      reportError(err, 'Failed to send product to Meta');
    } finally {
      setPushing(null);
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await catalogService.deleteProduct(toDelete.id);
      toast.success(`“${toDelete.name}” deleted`);
      setToDelete(null);
      void refreshProducts();
    } catch (err) {
      reportError(err, 'Failed to delete product');
    } finally {
      setDeleting(false);
    }
  };

  const subtitle = catalog
    ? [
        catalog.is_connected ? `Connected to ${accountLabel(account, catalog.whatsapp_account)}` : 'Not connected to a WhatsApp number',
        `ID ${catalog.meta_catalog_id}`,
      ].join(' · ')
    : loadError
      ? undefined
      : 'Loading…';

  const filtering = search.trim() !== '' || availability !== 'all' || onlyProblems;

  return (
    <div className="flex flex-col h-full bg-[#0a0a0b] light:bg-gray-50 overflow-hidden">
      <PageHeader
        title={catalog?.name ?? (loadError?.notFound ? 'Catalogue not found' : 'Catalogue')}
        subtitle={subtitle}
        icon={ShoppingBag}
        backLink="/catalogs"
        actions={
          catalog && (
            <>
              <Button variant="outline" size="sm" className={outlineBtn} disabled={syncing || readOnly} onClick={handleSyncFromMeta}>
                <RefreshCw className={cn('h-4 w-4 sm:mr-2', syncing && 'animate-spin')} />
                <span className="hidden sm:inline">{syncing ? 'Syncing…' : 'Sync from Meta'}</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className={outlineBtn}
                disabled={readOnly}
                onClick={() => canWrite() && setImportOpen(true)}
              >
                <FileUp className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Import CSV</span>
              </Button>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white" disabled={readOnly} onClick={openCreate}>
                <Plus className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Add product</span>
              </Button>
            </>
          )
        }
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {loadError ? (
          <div className={panelClass}>
            {loadError.notFound ? (
              <ErrorState
                title="Catalogue not found"
                description="It may have been removed, or the link is wrong."
                retryLabel="Back to catalogues"
                onRetry={() => navigate('/catalogs')}
              />
            ) : (
              <ErrorState title="Couldn’t load this catalogue" description={loadError.message} onRetry={load} />
            )}
          </div>
        ) : (
          <>
            {accountMissing && catalog && (
              <WarningBanner
                title={
                  catalog.whatsapp_account
                    ? `Read-only: WhatsApp number “${catalog.whatsapp_account}” isn’t connected`
                    : 'Read-only: this catalogue has no WhatsApp number'
                }
                action={<ConnectAccountButton label="Connect a number" />}
              >
                Products are sent to Meta through the catalogue’s WhatsApp number, so you can look but not change
                anything until it’s connected.
              </WarningBanner>
            )}
            {account && account.has_access_token === false && (
              <WarningBanner title={`“${account.name}” has no access token`} action={<ConnectAccountButton label="Open accounts" />}>
                Meta will reject product changes until the number has a valid access token.
              </WarningBanner>
            )}
            {pendingPayment && !readOnly && (
              <WarningBanner title="You’re exploring OneSuit">Adding and editing products needs a paid plan.</WarningBanner>
            )}
            {catalog && !catalog.is_connected && !readOnly && (
              <WarningBanner title="Not shown on WhatsApp yet">
                Connect this catalogue to a WhatsApp number on the Catalogue page so customers can see it and agents can
                send its products in chat.
              </WarningBanner>
            )}
            {problemCount > 0 && (
              <div className="flex flex-col gap-2 rounded-lg border border-red-500/25 bg-red-500/[0.06] px-4 py-3 sm:flex-row sm:items-center light:border-red-200 light:bg-red-50">
                <AlertTriangle className="hidden h-4 w-4 shrink-0 text-red-400 sm:block light:text-red-600" />
                <p className="flex-1 text-xs text-red-200 light:text-red-800">
                  {problemCount} product{problemCount === 1 ? ' is' : 's are'} saved here but not in Meta. Open each to see
                  Meta’s reason, fix it and retry.
                </p>
                <Button size="sm" variant="outline" className={outlineBtn} onClick={() => setOnlyProblems((v) => !v)}>
                  {onlyProblems ? 'Show all' : 'Show only these'}
                </Button>
              </div>
            )}

            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="products">Products{products ? ` (${products.length})` : ''}</TabsTrigger>
                <TabsTrigger value="sets">Collections</TabsTrigger>
              </TabsList>

              <TabsContent value="products" className="mt-4 space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <SearchInput value={search} onChange={setSearch} placeholder="Search name, SKU, brand…" className="w-full sm:w-72" />
                  <Select value={availability} onValueChange={setAvailability}>
                    <SelectTrigger className="h-9 w-full sm:w-48" aria-label="Filter by availability">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All availability</SelectItem>
                      {AVAILABILITY_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {products && (
                    <span className="text-xs text-white/40 light:text-gray-500 sm:ml-auto">
                      {visible.length} of {products.length}
                    </span>
                  )}
                </div>

                {products === null ? (
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                    {[0, 1, 2, 3].map((i) => (
                      <Skeleton key={i} className="aspect-[3/4] rounded-xl" />
                    ))}
                  </div>
                ) : visible.length === 0 ? (
                  <div className={cn(panelClass, 'flex flex-col items-center px-6 py-12 text-center')}>
                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 light:text-emerald-600">
                      <Package className="h-6 w-6" />
                    </div>
                    <p className="text-sm font-semibold">{filtering ? 'No products match' : 'No products yet'}</p>
                    <p className="mt-1 max-w-md text-xs text-white/50 light:text-gray-500">
                      {filtering
                        ? 'Try a different search or filter.'
                        : 'Add products with a price and photo, import a CSV, or pull the ones already in Meta.'}
                    </p>
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      {filtering ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className={outlineBtn}
                          onClick={() => {
                            setSearch('');
                            setAvailability('all');
                            setOnlyProblems(false);
                          }}
                        >
                          Clear filters
                        </Button>
                      ) : (
                        !readOnly && (
                          <>
                            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white" onClick={openCreate}>
                              <Plus className="h-4 w-4 mr-2" /> Add product
                            </Button>
                            <Button size="sm" variant="outline" className={outlineBtn} onClick={() => canWrite() && setImportOpen(true)}>
                              <FileUp className="h-4 w-4 mr-2" /> Import CSV
                            </Button>
                            <Button size="sm" variant="outline" className={outlineBtn} disabled={syncing} onClick={handleSyncFromMeta}>
                              <RefreshCw className="h-4 w-4 mr-2" /> Sync from Meta
                            </Button>
                          </>
                        )
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                    {visible.map((p) => {
                      const onSale = (p.sale_price ?? 0) > 0 && (p.sale_price ?? 0) < p.price;
                      return (
                        <article key={p.id} className={cn(panelClass, 'flex flex-col overflow-hidden')}>
                          <div className="relative">
                            <ProductImage key={p.image_url} src={p.image_url} alt={p.name} />
                            {!isOrderable(p.availability) && (
                              <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-medium text-white">
                                {availabilityLabel(p.availability)}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-1 flex-col gap-1 p-3">
                            <p className="line-clamp-2 text-[13px] font-medium leading-snug" title={p.name}>
                              {p.name}
                            </p>
                            <p className="truncate font-mono text-[10px] text-white/40 light:text-gray-500">{p.retailer_id || '—'}</p>
                            <p className="text-sm font-semibold tabular-nums">
                              {onSale ? (
                                <>
                                  {formatPrice(p.sale_price ?? 0, p.currency)}{' '}
                                  <span className="text-[11px] font-normal text-white/40 line-through light:text-gray-400">
                                    {formatPrice(p.price, p.currency)}
                                  </span>
                                </>
                              ) : (
                                formatPrice(p.price, p.currency)
                              )}
                            </p>
                            <div className="flex flex-wrap items-center gap-1">
                              <SyncBadge p={p} />
                              {isOrderable(p.availability) && p.availability && p.availability !== 'in stock' && (
                                <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-white/60 light:bg-gray-100 light:text-gray-600">
                                  {availabilityLabel(p.availability)}
                                </span>
                              )}
                            </div>
                            {p.sync_status === 'error' && p.sync_error && (
                              <p className="line-clamp-3 text-[10px] leading-snug text-red-400 light:text-red-600" title={p.sync_error}>
                                {p.sync_error}
                              </p>
                            )}
                            <div className="mt-auto flex items-center gap-1 pt-2">
                              {p.sync_status === 'error' && !readOnly && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className={cn(outlineBtn, 'h-7 px-2 text-[11px]')}
                                  disabled={pushing === p.id}
                                  onClick={() => retryPush(p)}
                                >
                                  {pushing === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Retry'}
                                </Button>
                              )}
                              {p.url && (
                                <a
                                  href={p.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  aria-label="Open product page"
                                  className="flex h-7 w-7 items-center justify-center rounded-md text-white/50 hover:bg-white/[0.06] hover:text-white light:text-gray-500 light:hover:bg-gray-100 light:hover:text-gray-900"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              )}
                              <div className="ml-auto flex items-center">
                                <button
                                  type="button"
                                  aria-label={`Edit ${p.name}`}
                                  disabled={readOnly}
                                  onClick={() => openEdit(p)}
                                  className="flex h-7 w-7 items-center justify-center rounded-md text-white/50 hover:bg-white/[0.06] hover:text-white disabled:opacity-40 light:text-gray-500 light:hover:bg-gray-100 light:hover:text-gray-900"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  aria-label={`Delete ${p.name}`}
                                  disabled={readOnly}
                                  onClick={() => canWrite() && setToDelete(p)}
                                  className="flex h-7 w-7 items-center justify-center rounded-md text-white/50 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40 light:text-gray-500 light:hover:bg-red-50 light:hover:text-red-600"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="sets" className="mt-4">
                {tab === 'sets' &&
                  (readOnly ? (
                    <p className="text-xs text-white/50 light:text-gray-500">Collections need the catalogue’s WhatsApp number to be connected.</p>
                  ) : (
                    <ProductSetsPanel catalogId={id} products={products ?? []} canWrite={canWrite} />
                  ))}
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>

      {catalog && (
        <>
          <ProductFormDialog open={formOpen} onOpenChange={setFormOpen} catalogId={catalog.id} product={editing} onSaved={handleSaved} />
          <ImportProductsDialog
            open={importOpen}
            onOpenChange={setImportOpen}
            catalogId={catalog.id}
            onImported={() => void refreshProducts()}
          />
        </>
      )}

      <DeleteConfirmDialog
        open={!!toDelete}
        onOpenChange={(open) => !open && !deleting && setToDelete(null)}
        title="Delete product"
        description={
          toDelete
            ? `Delete “${toDelete.name}”? It is also removed from the catalogue in Meta Commerce Manager. This can’t be undone.`
            : undefined
        }
        isSubmitting={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
};

export default CatalogDetailView;
