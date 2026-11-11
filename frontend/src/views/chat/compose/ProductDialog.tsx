import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Loader2, Package, Search, ShoppingBag } from 'lucide-react';
import { readList } from '@/services/response';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { type ComposeDialogProps, Field, Note, fieldCls, primaryBtn } from './composeUi';
import { sendRich } from './sendRich';
import { type PickerProduct, composeService } from './richUtils';

const MAX_PRODUCTS = 30;

const priceLabel = (p: PickerProduct) => p.price_text || (p.price != null && p.price !== '' ? String(p.price) : '');

/** Send one catalogue product, or several as a multi-product message. */
export const ProductDialog: React.FC<ComposeDialogProps> = ({ open, onOpenChange, contact, onSent }) => {
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<PickerProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [picked, setPicked] = useState<PickerProduct[]>([]);
  const [header, setHeader] = useState('');
  const [body, setBody] = useState('');
  const [footer, setFooter] = useState('');
  const [sectionTitle, setSectionTitle] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setPicked([]);
    setHeader('');
    setBody('');
    setFooter('');
    setSectionTitle('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const t = window.setTimeout(() => {
      setLoading(true);
      composeService
        .productPicker({ search: query.trim() || undefined, whatsapp_account: contact.whatsapp_account || undefined, limit: 50 })
        .then((res) => {
          if (cancelled) return;
          const list = readList<PickerProduct>(res, 'products');
          setProducts(list.length ? list : readList<PickerProduct>(res, 'items'));
          setUnavailable(false);
        })
        .catch(() => {
          if (cancelled) return;
          setProducts([]);
          setUnavailable(true);
        })
        .finally(() => !cancelled && setLoading(false));
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [open, query, contact.whatsapp_account]);

  const catalogId = picked[0]?.catalog_id;
  const isList = picked.length > 1;
  const key = (p: PickerProduct) => `${p.catalog_id}:${p.product_retailer_id}`;
  const pickedKeys = useMemo(() => new Set(picked.map(key)), [picked]);

  const toggle = (p: PickerProduct) => {
    setPicked((cur) => {
      if (cur.some((x) => key(x) === key(p))) return cur.filter((x) => key(x) !== key(p));
      if (cur.length >= MAX_PRODUCTS) return cur;
      return [...cur, p];
    });
  };

  const canSend = picked.length > 0 && (!isList || (header.trim() && body.trim()));

  const submit = async () => {
    if (!canSend || sending || !catalogId) return;
    setSending(true);
    const display = picked.map((p) => ({ catalog_id: p.catalog_id, product_retailer_id: p.product_retailer_id, name: p.name, price: priceLabel(p), image_url: p.image_url }));
    const interactive = isList
      ? {
          type: 'product_list',
          catalog_id: catalogId,
          header: header.trim(),
          body: body.trim(),
          footer: footer.trim() || undefined,
          sections: [{ title: sectionTitle.trim() || 'Products', product_retailer_ids: picked.map((p) => p.product_retailer_id) }],
          products: display,
        }
      : {
          type: 'product',
          catalog_id: catalogId,
          product_retailer_id: picked[0].product_retailer_id,
          body: body.trim() || undefined,
          footer: footer.trim() || undefined,
          products: display,
        };
    const ok = await sendRich(contact, { type: 'interactive', interactive }, `🛍️ ${isList ? `${picked.length} products` : picked[0].name}`, onSent);
    setSending(false);
    if (ok) onOpenChange(false);
  };

  const noCatalogue = !loading && (unavailable || (products.length === 0 && !query.trim()));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingBag className="h-4 w-4 text-emerald-600" /> Send products
          </DialogTitle>
          <DialogDescription>Pick one product, or up to {MAX_PRODUCTS} from the same catalogue to send a product list.</DialogDescription>
        </DialogHeader>

        {noCatalogue ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-input px-4 py-8 text-center">
            <Package className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-semibold text-foreground">No connected catalogue yet</p>
            <p className="max-w-xs text-xs text-muted-foreground">Set one up under Catalogue and connect it to this WhatsApp number, then products show up here.</p>
            <Button asChild size="sm" variant="outline" className="mt-1">
              <Link to="/catalogs" onClick={() => onOpenChange(false)}>
                Open Catalogue
              </Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products" className={cn(fieldCls, 'pl-8')} autoFocus />
            </div>
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {loading && (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}
              {!loading && products.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">No products match “{query}”.</p>}
              {!loading &&
                products.map((p) => {
                  const on = pickedKeys.has(key(p));
                  const otherCatalog = !!catalogId && p.catalog_id !== catalogId;
                  return (
                    <button
                      key={key(p)}
                      type="button"
                      disabled={otherCatalog}
                      onClick={() => toggle(p)}
                      title={otherCatalog ? 'A product list can only include products from one catalogue' : undefined}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-xl border px-2 py-1.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                        on ? 'border-emerald-500 bg-emerald-500/10' : 'border-transparent hover:bg-black/5 dark:hover:bg-white/5'
                      )}
                    >
                      {p.image_url ? (
                        <img src={p.image_url} alt="" className="h-11 w-11 shrink-0 rounded-lg bg-black/5 object-cover" loading="lazy" />
                      ) : (
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-black/5 dark:bg-white/10">
                          <Package className="h-5 w-5 text-muted-foreground" />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">{p.name}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {priceLabel(p)}
                          {p.catalog_name ? ` · ${p.catalog_name}` : ''}
                        </span>
                      </span>
                      <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full border', on ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-input')}>
                        {on && <Check className="h-3 w-3" />}
                      </span>
                    </button>
                  );
                })}
            </div>

            {picked.length > 0 && (
              <div className="space-y-3 rounded-xl border border-input p-3">
                <p className="text-xs font-semibold text-foreground">
                  {isList ? `Product list · ${picked.length} products` : 'Single product'}
                </p>
                {isList && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Header" hint="required">
                      <input value={header} onChange={(e) => setHeader(e.target.value)} maxLength={60} placeholder="e.g. New arrivals" className={fieldCls} />
                    </Field>
                    <Field label="Section title" hint="optional">
                      <input value={sectionTitle} onChange={(e) => setSectionTitle(e.target.value)} maxLength={24} placeholder="Products" className={fieldCls} />
                    </Field>
                  </div>
                )}
                <Field label="Message" hint={isList ? 'required' : 'optional'}>
                  <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} maxLength={1024} placeholder="Have a look at these…" className={cn(fieldCls, 'h-auto py-2')} />
                </Field>
                <Field label="Footer" hint="optional">
                  <input value={footer} onChange={(e) => setFooter(e.target.value)} maxLength={60} className={fieldCls} />
                </Field>
                {isList && <Note>WhatsApp shows a “View items” button that opens these products; the customer can add them to a cart and send you an order.</Note>}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {!noCatalogue && (
            <Button size="sm" onClick={() => void submit()} disabled={!canSend || sending} className={primaryBtn}>
              {sending ? 'Sending…' : picked.length > 1 ? `Send ${picked.length} products` : 'Send product'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ProductDialog;
