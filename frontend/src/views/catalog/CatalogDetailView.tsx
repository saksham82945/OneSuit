import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { SearchInput } from '@/components/shared/SearchInput';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { IconButton } from '@/components/shared/IconButton';
import { DeleteConfirmDialog } from '@/components/shared/DeleteConfirmDialog';
import { ErrorState } from '@/components/shared/ErrorState';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ShoppingBag, Package, Plus, Pencil, Trash2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import {
  catalogService,
  readCatalog,
  readProducts,
  loadAccounts,
  errorMessage,
  errorStatus,
  describeActionError,
  formatPrice,
  formatDate,
  type Catalog,
  type CatalogProduct,
  type WhatsAppAccountOption,
} from './catalogApi';
import { WarningBanner, ConnectAccountButton } from './CatalogNotices';
import { ProductFormDialog } from './ProductFormDialog';

type LoadError = { message: string; notFound: boolean };

const cardClass =
  'card-depth border-white/[0.08] bg-[#141415] text-white light:bg-white light:border-gray-200 light:text-gray-900';

/** Product image with a placeholder when there is none or it fails to load. */
const ProductThumb: React.FC<{ src: string; alt: string }> = ({ src, alt }) => {
  const [failed, setFailed] = useState(false);
  return (
    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md border border-white/[0.08] bg-white/[0.04] flex items-center justify-center light:border-gray-200 light:bg-gray-100">
      {src && !failed ? (
        <img src={src} alt={alt} loading="lazy" className="h-full w-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <Package className="h-4 w-4 text-white/30 light:text-gray-400" />
      )}
    </div>
  );
};

export const CatalogDetailView: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [products, setProducts] = useState<CatalogProduct[] | null>(null);
  const [loadError, setLoadError] = useState<LoadError | null>(null);

  const [accounts, setAccounts] = useState<WhatsAppAccountOption[] | null>(null);
  const [search, setSearch] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogProduct | null>(null);

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
      setCatalog((c) => (c ? { ...c, product_count: list.length } : c));
    } catch (err) {
      toast.error(errorMessage(err, 'Couldn’t refresh the product list'));
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Only used to warn when the catalogue's account is missing; a role without
  // accounts:read simply gets no warning.
  useEffect(() => {
    loadAccounts()
      .then((result) => setAccounts(result === 'forbidden' ? null : result))
      .catch(() => setAccounts(null));
  }, []);

  const account = useMemo(
    () => (catalog && accounts ? accounts.find((a) => a.name === catalog.whatsapp_account) : undefined),
    [catalog, accounts]
  );
  const accountMissing = !!catalog && accounts !== null && !account;
  const accountWithoutToken = !!account && account.has_access_token === false;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products ?? [];
    return (products ?? []).filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.retailer_id?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q)
    );
  }, [products, search]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (p: CatalogProduct) => {
    setEditing(p);
    setFormOpen(true);
  };

  const handleSaved = (saved: CatalogProduct, mode: 'create' | 'edit') => {
    toast.success(mode === 'create' ? `“${saved.name}” added to the catalogue` : `“${saved.name}” updated`);
    setFormOpen(false);
    refreshProducts();
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await catalogService.deleteProduct(toDelete.id);
      toast.success(`“${toDelete.name}” deleted`);
      setToDelete(null);
      refreshProducts();
    } catch (err) {
      const info = describeActionError(err, 'Failed to delete product');
      toast.error(info.message, { description: info.hint, duration: 8000 });
    } finally {
      setDeleting(false);
    }
  };

  const columns: Column<CatalogProduct>[] = [
    {
      key: 'name',
      label: 'Product',
      render: (p) => (
        <div className="flex items-center gap-3 min-w-[220px] max-w-[420px]">
          <ProductThumb key={p.image_url} src={p.image_url} alt={p.name} />
          <div className="min-w-0">
            <p className="font-medium text-[13px] text-white light:text-gray-900 truncate">{p.name}</p>
            {p.description && (
              <p className="text-[11px] text-white/40 light:text-gray-500 truncate" title={p.description}>
                {p.description}
              </p>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'retailer_id',
      label: 'Retailer ID (SKU)',
      render: (p) =>
        p.retailer_id ? (
          <code className="font-mono text-[11px] text-white/60 light:text-gray-600">{p.retailer_id}</code>
        ) : (
          <span className="text-xs text-white/30 light:text-gray-400">—</span>
        ),
    },
    {
      key: 'price',
      label: 'Price',
      render: (p) => (
        <span className="text-xs tabular-nums font-medium text-white/80 light:text-gray-800">
          {formatPrice(p.price, p.currency)}
        </span>
      ),
    },
    {
      key: 'url',
      label: 'Link',
      render: (p) =>
        p.url ? (
          <a
            href={p.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 light:text-emerald-600 max-w-[180px]"
            title={p.url}
          >
            <span className="truncate">{p.url.replace(/^https?:\/\//, '')}</span>
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        ) : (
          <span className="text-xs text-white/30 light:text-gray-400">—</span>
        ),
    },
    {
      key: 'is_active',
      label: 'Status',
      render: (p) =>
        p.is_active ? (
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
      key: 'actions',
      label: 'Actions',
      align: 'right',
      render: (p) => (
        <div className="flex items-center justify-end gap-1">
          <IconButton icon={Pencil} label="Edit product" onClick={() => openEdit(p)} />
          <IconButton
            icon={Trash2}
            label="Delete product"
            className="hover:text-red-400"
            onClick={() => setToDelete(p)}
          />
        </div>
      ),
    },
  ];

  const subtitle = catalog
    ? [catalog.whatsapp_account, catalog.meta_catalog_id && `Meta ID ${catalog.meta_catalog_id}`].filter(Boolean).join(' · ')
    : loadError
      ? undefined
      : 'Loading…';

  return (
    <div className="flex flex-col h-full bg-[#0a0a0b] light:bg-gray-50 overflow-hidden">
      <PageHeader
        title={catalog?.name ?? (loadError?.notFound ? 'Catalogue not found' : 'Catalogue')}
        subtitle={subtitle}
        icon={ShoppingBag}
        backLink="/catalogs"
        actions={
          catalog && (
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-500 text-white"
              disabled={accountMissing}
              title={accountMissing ? 'The catalogue’s WhatsApp account isn’t connected' : undefined}
              onClick={openCreate}
            >
              <Plus className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Add product</span>
            </Button>
          )
        }
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {loadError ? (
          <Card className={cardClass}>
            {loadError.notFound ? (
              <ErrorState
                title="Catalogue not found"
                description="It may have been deleted, or the link is wrong."
                retryLabel="Back to catalogues"
                onRetry={() => navigate('/catalogs')}
              />
            ) : (
              <ErrorState title="Couldn’t load this catalogue" description={loadError.message} onRetry={load} />
            )}
          </Card>
        ) : (
          <>
            {accountMissing && catalog && (
              <WarningBanner
                title={
                  catalog.whatsapp_account
                    ? `WhatsApp account “${catalog.whatsapp_account}” isn’t connected`
                    : 'This catalogue has no WhatsApp account'
                }
                action={<ConnectAccountButton />}
              >
                Products are added, edited and deleted in Meta through the catalogue’s WhatsApp account, so these
                actions will fail until the account is connected again.
              </WarningBanner>
            )}
            {accountWithoutToken && (
              <WarningBanner title={`“${account?.name}” has no access token`} action={<ConnectAccountButton label="Open accounts" />}>
                Meta will reject product changes until the account has a valid access token.
              </WarningBanner>
            )}

            <Card className={cardClass}>
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <CardTitle className="text-base font-semibold">Products</CardTitle>
                    <CardDescription className="text-xs text-white/50 light:text-gray-500">
                      {products === null
                        ? 'Loading…'
                        : `${products.length} product${products.length === 1 ? '' : 's'}${
                            catalog ? ` · created ${formatDate(catalog.created_at)}` : ''
                          }`}
                    </CardDescription>
                  </div>
                  <SearchInput
                    value={search}
                    onChange={setSearch}
                    placeholder="Search name, SKU or description…"
                    className="w-full sm:w-72"
                  />
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <DataTable
                    items={visible}
                    columns={columns}
                    isLoading={products === null}
                    emptyIcon={Package}
                    emptyTitle={search.trim() ? 'No products match' : 'No products yet'}
                    emptyDescription={
                      search.trim()
                        ? 'Try a different name or SKU.'
                        : 'Add products with a price, image and link so customers can browse them on WhatsApp.'
                    }
                    emptyAction={
                      search.trim() ? (
                        <Button size="sm" variant="outline" className="border-white/10 light:border-gray-200" onClick={() => setSearch('')}>
                          Clear search
                        </Button>
                      ) : catalog && !accountMissing ? (
                        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white" onClick={openCreate}>
                          <Plus className="h-4 w-4 mr-2" /> Add product
                        </Button>
                      ) : undefined
                    }
                  />
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {catalog && (
        <ProductFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          catalogId={catalog.id}
          product={editing}
          onSaved={handleSaved}
        />
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
