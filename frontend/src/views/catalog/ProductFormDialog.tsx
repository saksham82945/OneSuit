import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ImageOff, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  catalogService,
  describeActionError,
  handleUpgradeError,
  readProduct,
  isHttpUrl,
  toCents,
  fromCents,
  formatPrice,
  COMMON_CURRENCIES,
  DEFAULT_CURRENCY,
  AVAILABILITY_OPTIONS,
  CONDITION_OPTIONS,
  type ActionErrorInfo,
  type CatalogProduct,
  type CatalogProductInput,
} from './catalogApi';
import { ActionErrorBox } from './CatalogNotices';

export interface ProductFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalogId: string;
  /** The product to edit, or null to add a new one. */
  product: CatalogProduct | null;
  onSaved: (product: CatalogProduct, mode: 'create' | 'edit') => void;
}

type FormState = {
  name: string;
  price: string;
  sale_price: string;
  currency: string;
  availability: string;
  condition: string;
  retailer_id: string;
  url: string;
  image_url: string;
  brand: string;
  category: string;
  description: string;
};

type FieldErrors = Partial<Record<keyof FormState, string>>;

const fieldClass =
  'bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/30 light:bg-white light:border-gray-200 light:text-gray-900 light:placeholder:text-gray-400';

const initialState = (p: CatalogProduct | null): FormState => ({
  name: p?.name ?? '',
  price: p?.price ? fromCents(p.price) : '',
  sale_price: p?.sale_price ? fromCents(p.sale_price) : '',
  currency: p?.currency || DEFAULT_CURRENCY,
  availability: p?.availability || 'in stock',
  condition: p?.condition || 'new',
  retailer_id: p?.retailer_id ?? '',
  url: p?.url ?? '',
  image_url: p?.image_url ?? '',
  brand: p?.brand ?? '',
  category: p?.category ?? '',
  description: p?.description ?? '',
});

/** Mirrors the backend's validation (normalizeProduct in catalog.go). */
function validateProductForm(form: FormState): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.name.trim()) errors.name = 'Name is required.';
  else if (form.name.trim().length > 150) errors.name = 'Keep the name to 150 characters.';
  const cents = toCents(form.price);
  if (!form.price.trim()) errors.price = 'Price is required.';
  else if (Number.isNaN(cents)) errors.price = 'Enter an amount like 499.00';
  else if (cents <= 0) errors.price = 'Price must be more than 0.';
  if (form.sale_price.trim()) {
    const sale = toCents(form.sale_price);
    if (Number.isNaN(sale)) errors.sale_price = 'Enter an amount like 399.00';
    else if (!Number.isNaN(cents) && sale >= cents) errors.sale_price = 'Sale price must be lower than the price.';
  }
  if (!/^[A-Za-z]{3}$/.test(form.currency.trim())) errors.currency = 'Use a 3-letter code, e.g. INR.';
  if (/[\t\r\n]/.test(form.retailer_id)) errors.retailer_id = 'No tabs or line breaks.';
  for (const key of ['url', 'image_url'] as const) {
    const value = form[key].trim();
    if (value && !isHttpUrl(value)) errors[key] = 'Enter a full link starting with https://';
  }
  // Meta shows every product with a picture; without one it rejects the item.
  if (!form.image_url.trim()) errors.image_url = 'Meta needs a public image link for every product.';
  return errors;
}

const ProductForm: React.FC<Omit<ProductFormDialogProps, 'open'>> = ({ onOpenChange, catalogId, product, onSaved }) => {
  const creating = product === null;
  const [form, setForm] = useState<FormState>(() => initialState(product));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ActionErrorInfo | null>(null);
  const [imageFailed, setImageFailed] = useState(false);

  const setValue = (key: keyof FormState, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (key === 'image_url') setImageFailed(false);
    if (fieldErrors[key]) setFieldErrors((errs) => ({ ...errs, [key]: undefined }));
  };
  const onInput = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValue(key, e.target.value);

  const cents = toCents(form.price);
  const saleCents = form.sale_price.trim() ? toCents(form.sale_price) : NaN;
  const currencyOk = /^[A-Za-z]{3}$/.test(form.currency.trim());
  const pricePreview = !Number.isNaN(cents) && cents > 0 && currencyOk ? formatPrice(cents, form.currency.trim()) : null;
  const salePreview =
    pricePreview && !Number.isNaN(saleCents) && saleCents > 0 && saleCents < cents
      ? formatPrice(saleCents, form.currency.trim())
      : null;
  const imageUrl = form.image_url.trim();
  const showImage = imageUrl !== '' && isHttpUrl(imageUrl) && !imageFailed;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validateProductForm(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const payload: CatalogProductInput = {
      name: form.name.trim(),
      price: toCents(form.price),
      sale_price: form.sale_price.trim() ? toCents(form.sale_price) : 0,
      currency: form.currency.trim().toUpperCase(),
      availability: form.availability,
      condition: form.condition,
      retailer_id: form.retailer_id.trim(),
      url: form.url.trim(),
      image_url: form.image_url.trim(),
      brand: form.brand.trim(),
      category: form.category.trim(),
      description: form.description.trim(),
    };

    setSubmitting(true);
    setError(null);
    try {
      const res = creating
        ? await catalogService.createProduct(catalogId, payload)
        : await catalogService.updateProduct(product.id, payload);
      onSaved(readProduct(res) ?? { ...(product as CatalogProduct), ...payload }, creating ? 'create' : 'edit');
    } catch (err) {
      if (handleUpgradeError(err)) {
        setError({ message: 'Upgrade your plan to add or edit products.' });
      } else {
        setError(describeActionError(err, creating ? 'Failed to create product' : 'Failed to update product'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const fieldError = (key: keyof FormState) =>
    fieldErrors[key] ? (
      <p id={`${key}-error`} className="text-[11px] text-red-400 light:text-red-600">
        {fieldErrors[key]}
      </p>
    ) : null;

  const inputProps = (key: keyof FormState) => ({
    id: `product-${key}`,
    value: form[key],
    onChange: onInput(key),
    'aria-invalid': !!fieldErrors[key] || undefined,
    'aria-describedby': fieldErrors[key] ? `${key}-error` : undefined,
    className: cn(fieldClass, fieldErrors[key] && 'border-red-500/60 light:border-red-400'),
  });

  const hint = (text: React.ReactNode) => <p className="text-[11px] text-white/40 light:text-gray-500">{text}</p>;

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col min-h-0">
      <DialogHeader>
        <DialogTitle>{creating ? 'Add product' : 'Edit product'}</DialogTitle>
        <DialogDescription>
          Saved here, then sent to your Meta catalogue. If Meta rejects it, the product stays here marked “Not in Meta”
          so you can fix it and retry.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 py-4 max-h-[68vh] overflow-y-auto pr-1 -mr-1">
        {/* Image + name */}
        <div className="grid grid-cols-1 sm:grid-cols-[132px_1fr] gap-4">
          <div className="mx-auto sm:mx-0 h-32 w-32 overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.04] flex items-center justify-center light:border-gray-200 light:bg-gray-50">
            {showImage ? (
              <img src={imageUrl} alt="Product preview" className="h-full w-full object-cover" onError={() => setImageFailed(true)} />
            ) : imageFailed ? (
              <div className="flex flex-col items-center gap-1 px-2 text-center text-[10px] text-amber-400 light:text-amber-700">
                <ImageOff className="h-6 w-6" /> Can’t load image
              </div>
            ) : (
              <Package className="h-8 w-8 text-white/25 light:text-gray-300" />
            )}
          </div>
          <div className="grid gap-3 content-start min-w-0">
            <div className="grid gap-1.5">
              <Label htmlFor="product-name" className="text-xs">Name *</Label>
              <Input {...inputProps('name')} autoFocus maxLength={150} placeholder="e.g. Black cotton T-shirt" />
              {fieldError('name')}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="product-image_url" className="text-xs">Image link *</Label>
              <Input {...inputProps('image_url')} type="url" maxLength={500} placeholder="https://example.com/images/tshirt.jpg" />
              {fieldError('image_url') ??
                (imageFailed
                  ? <p className="text-[11px] text-amber-400 light:text-amber-700">This image couldn’t be loaded. Meta needs a public JPG or PNG link.</p>
                  : hint('A public JPG/PNG link, at least 500×500 px.'))}
            </div>
          </div>
        </div>

        {/* Prices */}
        <div className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_100px] gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="product-price" className="text-xs">Price *</Label>
            <Input {...inputProps('price')} inputMode="decimal" placeholder="499.00" />
            {fieldError('price') ?? (pricePreview && hint(<>Shows as {pricePreview}</>))}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="product-sale_price" className="text-xs">Sale price</Label>
            <Input {...inputProps('sale_price')} inputMode="decimal" placeholder="Optional" />
            {fieldError('sale_price') ?? (salePreview && hint(<>Discounted to {salePreview}</>))}
          </div>
          <div className="grid gap-1.5 col-span-2 sm:col-span-1">
            <Label htmlFor="product-currency" className="text-xs">Currency *</Label>
            <Input
              {...inputProps('currency')}
              list="catalog-currencies"
              maxLength={3}
              autoCapitalize="characters"
              placeholder="INR"
              className={cn(inputProps('currency').className, 'uppercase font-mono')}
            />
            <datalist id="catalog-currencies">
              {COMMON_CURRENCIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            {fieldError('currency')}
          </div>
        </div>

        {/* Availability / condition */}
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label className="text-xs">Availability</Label>
            <Select value={form.availability} onValueChange={(v) => setValue('availability', v)}>
              <SelectTrigger aria-label="Availability"><SelectValue /></SelectTrigger>
              <SelectContent>
                {AVAILABILITY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Condition</Label>
            <Select value={form.condition} onValueChange={(v) => setValue('condition', v)}>
              <SelectTrigger aria-label="Condition"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CONDITION_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="product-retailer_id" className="text-xs">SKU (retailer ID)</Label>
          <Input
            {...inputProps('retailer_id')}
            maxLength={100}
            placeholder={creating ? 'Leave empty to generate one' : 'e.g. TSHIRT-BLK-M'}
            className={cn(inputProps('retailer_id').className, 'font-mono')}
          />
          {fieldError('retailer_id') ?? hint('Unique in this catalogue. Agents send products in chat by this SKU.')}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="product-url" className="text-xs">Website link</Label>
          <Input {...inputProps('url')} type="url" maxLength={500} placeholder="https://example.com/products/tshirt" />
          {fieldError('url')}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="product-brand" className="text-xs">Brand</Label>
            <Input {...inputProps('brand')} maxLength={100} placeholder="Optional" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="product-category" className="text-xs">Category</Label>
            <Input {...inputProps('category')} maxLength={250} placeholder="e.g. Clothing > T-shirts" />
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="product-description" className="text-xs">Description</Label>
          <Textarea
            {...inputProps('description')}
            rows={3}
            maxLength={9999}
            placeholder="What customers should know about this product"
          />
        </div>

        <ActionErrorBox error={error} />
      </div>

      <DialogFooter className="gap-2 sm:gap-0">
        <Button type="button" variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting} className="bg-emerald-600 hover:bg-emerald-500 text-white">
          {submitting ? 'Saving…' : creating ? 'Add product' : 'Save changes'}
        </Button>
      </DialogFooter>
    </form>
  );
};

/** Add / edit a catalogue product (POST /catalogs/{id}/products, PUT /products/{id}). */
export const ProductFormDialog: React.FC<ProductFormDialogProps> = ({ open, onOpenChange, ...rest }) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-[620px]">
      {open && <ProductForm key={rest.product?.id ?? 'new'} onOpenChange={onOpenChange} {...rest} />}
    </DialogContent>
  </Dialog>
);
