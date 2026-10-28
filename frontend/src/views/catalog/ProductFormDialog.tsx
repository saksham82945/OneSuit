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
import { Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  catalogService,
  describeActionError,
  toCents,
  fromCents,
  formatPrice,
  COMMON_CURRENCIES,
  type ActionErrorInfo,
  type CatalogProduct,
  type CatalogProductInput,
} from './catalogApi';
import { ActionErrorBox } from './CatalogNotices';
import { readData } from '@/services/response';

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
  currency: string;
  retailer_id: string;
  url: string;
  image_url: string;
  description: string;
};

type FieldErrors = Partial<Record<keyof FormState, string>>;

const fieldClass =
  'bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/30 light:bg-white light:border-gray-200 light:text-gray-900 light:placeholder:text-gray-400';

const LABELS: Record<keyof FormState, string> = {
  name: 'Name',
  price: 'Price',
  currency: 'Currency',
  retailer_id: 'Retailer ID',
  url: 'Product URL',
  image_url: 'Image URL',
  description: 'Description',
};

const isHttpUrl = (value: string) => {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
};

const initialState = (p: CatalogProduct | null): FormState =>
  p
    ? {
        name: p.name ?? '',
        price: p.price ? fromCents(p.price) : '',
        currency: p.currency || 'USD',
        retailer_id: p.retailer_id ?? '',
        url: p.url ?? '',
        image_url: p.image_url ?? '',
        description: p.description ?? '',
      }
    : { name: '', price: '', currency: 'USD', retailer_id: '', url: '', image_url: '', description: '' };

function validate(form: FormState, creating: boolean): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.name.trim()) errors.name = 'Name is required.';
  const cents = toCents(form.price);
  if (!form.price.trim()) errors.price = 'Price is required.';
  else if (Number.isNaN(cents)) errors.price = 'Enter an amount like 19.99.';
  else if (cents <= 0) errors.price = 'Price must be more than 0.';
  if (!/^[A-Za-z]{3}$/.test(form.currency.trim())) errors.currency = 'Use a 3-letter code, e.g. USD.';

  // Meta's Commerce API needs a retailer ID, a product page and an image for
  // every new item; the backend forwards whatever we send.
  if (creating && !form.retailer_id.trim()) errors.retailer_id = 'Meta needs a retailer ID (SKU).';
  for (const key of ['url', 'image_url'] as const) {
    const value = form[key].trim();
    if (!value) {
      if (creating) errors[key] = `Meta needs ${key === 'url' ? 'a product page link' : 'an image link'}.`;
    } else if (!isHttpUrl(value)) {
      errors[key] = 'Enter a full link starting with https://';
    }
  }
  return errors;
}

const ProductForm: React.FC<Omit<ProductFormDialogProps, 'open'>> = ({ onOpenChange, catalogId, product, onSaved }) => {
  const creating = product === null;
  const [form, setForm] = useState<FormState>(() => initialState(product));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ActionErrorInfo | null>(null);
  const [imageFailed, setImageFailed] = useState(false);

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
    if (key === 'image_url') setImageFailed(false);
    if (fieldErrors[key]) setFieldErrors((errs) => ({ ...errs, [key]: undefined }));
  };

  // PUT /products/{id} ignores empty fields, so a cleared field keeps its old value.
  const clearedFields = product
    ? (['description', 'url', 'image_url', 'retailer_id'] as const).filter(
        (k) => (product[k] ?? '').trim() !== '' && form[k].trim() === ''
      )
    : [];

  const cents = toCents(form.price);
  const pricePreview =
    !Number.isNaN(cents) && cents > 0 && /^[A-Za-z]{3}$/.test(form.currency.trim())
      ? formatPrice(cents, form.currency.trim())
      : null;
  const imageUrl = form.image_url.trim();
  const showImage = imageUrl !== '' && isHttpUrl(imageUrl) && !imageFailed;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validate(form, creating);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const payload: CatalogProductInput = {
      name: form.name.trim(),
      price: toCents(form.price),
      currency: form.currency.trim().toUpperCase(),
      retailer_id: form.retailer_id.trim(),
      url: form.url.trim(),
      image_url: form.image_url.trim(),
      description: form.description.trim(),
    };

    setSubmitting(true);
    setError(null);
    try {
      const res = creating
        ? await catalogService.createProduct(catalogId, payload)
        : await catalogService.updateProduct(product.id, payload);
      onSaved(readData<CatalogProduct>(res) ?? { ...(product as CatalogProduct), ...payload }, creating ? 'create' : 'edit');
    } catch (err) {
      setError(describeActionError(err, creating ? 'Failed to create product' : 'Failed to update product'));
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
    onChange: set(key),
    'aria-invalid': !!fieldErrors[key] || undefined,
    'aria-describedby': fieldErrors[key] ? `${key}-error` : undefined,
    className: cn(fieldClass, fieldErrors[key] && 'border-red-500/60 light:border-red-400'),
  });

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col min-h-0">
      <DialogHeader>
        <DialogTitle>{creating ? 'Add product' : 'Edit product'}</DialogTitle>
        <DialogDescription>
          {creating
            ? 'The product is created in the Meta catalogue first, then listed here.'
            : 'Changes are sent to the Meta catalogue, then saved here.'}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 py-4 max-h-[65vh] overflow-y-auto pr-1 -mr-1">
        <div className="grid gap-1.5">
          <Label htmlFor="product-name" className="text-xs">Name *</Label>
          <Input {...inputProps('name')} autoFocus maxLength={255} placeholder="e.g. Cotton T-shirt" />
          {fieldError('name')}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px] gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="product-price" className="text-xs">Price *</Label>
            <Input {...inputProps('price')} inputMode="decimal" placeholder="19.99" />
            {fieldError('price') ?? (
              pricePreview && <p className="text-[11px] text-white/40 light:text-gray-500">Shown to customers as {pricePreview}</p>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="product-currency" className="text-xs">Currency *</Label>
            <Input
              {...inputProps('currency')}
              list="catalog-currencies"
              maxLength={3}
              autoCapitalize="characters"
              placeholder="USD"
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

        <div className="grid gap-1.5">
          <Label htmlFor="product-retailer_id" className="text-xs">Retailer ID (SKU){creating ? ' *' : ''}</Label>
          <Input {...inputProps('retailer_id')} maxLength={100} placeholder="e.g. TSHIRT-BLK-M" className={cn(inputProps('retailer_id').className, 'font-mono')} />
          {fieldError('retailer_id') ??
            (!creating && (
              <p className="text-[11px] text-white/40 light:text-gray-500">
                A changed retailer ID is saved here only; Meta keeps the original one.
              </p>
            ))}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="product-url" className="text-xs">Product page URL{creating ? ' *' : ''}</Label>
          <Input {...inputProps('url')} type="url" maxLength={500} placeholder="https://example.com/products/t-shirt" />
          {fieldError('url')}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="product-image_url" className="text-xs">Image URL{creating ? ' *' : ''}</Label>
          <div className="flex items-start gap-3">
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md border border-white/[0.08] bg-white/[0.04] flex items-center justify-center light:border-gray-200 light:bg-gray-100">
              {showImage ? (
                <img src={imageUrl} alt="" className="h-full w-full object-cover" onError={() => setImageFailed(true)} />
              ) : (
                <Package className="h-5 w-5 text-white/30 light:text-gray-400" />
              )}
            </div>
            <div className="grid gap-1.5 flex-1 min-w-0">
              <Input {...inputProps('image_url')} type="url" maxLength={500} placeholder="https://example.com/images/t-shirt.jpg" />
              {fieldError('image_url') ??
                (imageFailed && (
                  <p className="text-[11px] text-amber-400 light:text-amber-700">
                    This image couldn’t be loaded. Meta needs a public image link.
                  </p>
                ))}
            </div>
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="product-description" className="text-xs">Description</Label>
          <Textarea
            {...inputProps('description')}
            rows={3}
            maxLength={5000}
            placeholder="What customers should know about this product"
          />
        </div>

        {clearedFields.length > 0 && (
          <p className="rounded-md border border-amber-500/25 bg-amber-500/[0.08] px-3 py-2 text-[11px] text-amber-200 light:border-amber-200 light:bg-amber-50 light:text-amber-800">
            Fields can’t be emptied once set: {clearedFields.map((k) => LABELS[k]).join(', ')} will keep{' '}
            {clearedFields.length === 1 ? 'its' : 'their'} current value.
          </p>
        )}

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
    <DialogContent className="sm:max-w-[560px]">
      {open && <ProductForm key={rest.product?.id ?? 'new'} onOpenChange={onOpenChange} {...rest} />}
    </DialogContent>
  </Dialog>
);
