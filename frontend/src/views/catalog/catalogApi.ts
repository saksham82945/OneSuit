/**
 * Catalogue API (internal/handlers/catalog.go) and helpers shared by the
 * catalogue screens.
 *
 * Catalogues and products are mirrored to Meta's Commerce API. Products are
 * saved here first and then pushed to Meta; each keeps its sync outcome
 * (sync_status / sync_error) so failures can be retried. A catalogue is
 * "connected" to a WhatsApp number's business account, which is what shows
 * it on the WhatsApp profile and lets agents send products in chat.
 */
import { api, accountsService } from '@/services/api';
import { readData, readList } from '@/services/response';
import { requestUpgrade } from '@/lib/pendingPayment';

/** CatalogResponse in catalog.go. */
export interface Catalog {
  id: string;
  meta_catalog_id: string;
  whatsapp_account: string; // the account's name
  name: string;
  is_active: boolean;
  /** Connected to the account's WhatsApp Business Account (shown on the profile, usable in chat). */
  is_connected?: boolean;
  product_count: number;
  /** Products whose last push to Meta failed. */
  sync_error_count?: number;
  last_synced_at?: string | null;
  products?: CatalogProduct[];
  created_at: string;
  updated_at: string;
}

export type ProductSyncStatus = 'synced' | 'pending' | 'error';

/** CatalogProductResponse in catalog.go. Prices are in the smallest currency unit (paise / cents). */
export interface CatalogProduct {
  id: string;
  catalog_id?: string;
  meta_product_id: string;
  name: string;
  description: string;
  price: number;
  sale_price?: number;
  currency: string;
  availability?: string;
  condition?: string;
  brand?: string;
  category?: string;
  url: string;
  image_url: string;
  retailer_id: string;
  is_active: boolean;
  sync_status?: ProductSyncStatus;
  sync_error?: string;
  last_synced_at?: string | null;
  created_at: string;
  updated_at: string;
}

/** CatalogProductRequest in catalog.go (PUT clears fields sent as ""). */
export interface CatalogProductInput {
  name: string;
  description: string;
  price: number; // smallest unit
  sale_price: number; // 0 = none
  currency: string;
  availability: string;
  condition: string;
  brand: string;
  category: string;
  url: string;
  image_url: string;
  retailer_id: string;
}

/** The fields of AccountResponse (accounts.go) the catalogue screens use. */
export interface WhatsAppAccountOption {
  id: string;
  name: string;
  business_id?: string;
  phone_id?: string;
  has_access_token?: boolean;
  phone_number?: string;
  display_name?: string;
}

/** A catalogue the account's token can use in Meta (GET /catalogs/available). */
export interface AvailableCatalog {
  meta_catalog_id: string;
  name: string;
  is_connected: boolean;
  local_id: string | null;
}

export interface CommerceSettings {
  whatsapp_account: string;
  is_catalog_visible: boolean;
  is_cart_enabled: boolean;
}

export interface ProductImportRow {
  line: number;
  retailer_id: string;
  name: string;
  price: number;
  currency: string;
  availability: string;
  image_url: string;
  action: 'create' | 'update' | 'skip';
  error?: string;
  sync_status?: ProductSyncStatus;
  sync_error?: string;
}

export interface ProductImportResult {
  dry_run: boolean;
  rows: ProductImportRow[];
  total: number;
  valid: number;
  invalid: number;
  created?: number;
  updated?: number;
  sync_failed?: number;
}

export interface ProductSet {
  id: string;
  name: string;
  product_count: number;
}

/** GET /catalogs/products/picker — products the chat composer can send. */
export interface ProductPickerItem {
  catalog_id: string; // Meta catalogue ID
  catalog_local_id: string;
  catalog_name: string;
  whatsapp_account: string;
  product_retailer_id: string;
  product_id: string;
  name: string;
  price: number;
  sale_price: number;
  currency: string;
  price_text: string;
  image_url: string;
  availability: string;
}

export const catalogService = {
  list: (params?: { whatsapp_account?: string }) => api.get('/catalogs', { params }),
  get: (id: string) => api.get(`/catalogs/${id}`),
  /** Creates the catalogue in Meta (in the business that owns the number), then stores it here. */
  create: (data: { whatsapp_account: string; name: string; connect?: boolean }) => api.post('/catalogs', data),
  /** Removes the catalogue here; with deleteInMeta it is also deleted in Commerce Manager. */
  delete: (id: string, opts: { deleteInMeta?: boolean } = {}) =>
    api.delete(`/catalogs/${id}`, { params: opts.deleteInMeta ? { delete_in_meta: 'true' } : undefined }),
  /** Pulls the account's catalogues from Meta and records which one is connected. */
  sync: (whatsappAccount: string) => api.post('/catalogs/sync', { whatsapp_account: whatsappAccount }),
  available: (whatsappAccount: string) => api.get('/catalogs/available', { params: { whatsapp_account: whatsappAccount } }),
  link: (data: { whatsapp_account: string; meta_catalog_id: string; connect?: boolean }) => api.post('/catalogs/link', data),
  connect: (id: string, whatsappAccount?: string) =>
    api.post(`/catalogs/${id}/connect`, whatsappAccount ? { whatsapp_account: whatsappAccount } : {}),
  disconnect: (id: string) => api.delete(`/catalogs/${id}/connect`),
  getCommerceSettings: (whatsappAccount: string) =>
    api.get('/catalogs/commerce-settings', { params: { whatsapp_account: whatsappAccount } }),
  updateCommerceSettings: (data: { whatsapp_account: string; is_catalog_visible?: boolean; is_cart_enabled?: boolean }) =>
    api.post('/catalogs/commerce-settings', data),

  listProducts: (catalogId: string) => api.get(`/catalogs/${catalogId}/products`),
  createProduct: (catalogId: string, data: CatalogProductInput) => api.post(`/catalogs/${catalogId}/products`, data),
  updateProduct: (productId: string, data: Partial<CatalogProductInput> & { is_active?: boolean }) =>
    api.put(`/products/${productId}`, data),
  deleteProduct: (productId: string) => api.delete(`/products/${productId}`),
  /** Pulls the catalogue's products from Meta. */
  syncProducts: (catalogId: string) => api.post(`/catalogs/${catalogId}/products/sync`, {}),
  /** Retries pushing one product to Meta. */
  pushProduct: (catalogId: string, productId: string) => api.post(`/catalogs/${catalogId}/products/${productId}/push`, {}),
  importProducts: (catalogId: string, csv: string, dryRun: boolean) =>
    api.post(`/catalogs/${catalogId}/products/import`, { csv, dry_run: dryRun }),

  listSets: (catalogId: string) => api.get(`/catalogs/${catalogId}/sets`),
  createSet: (catalogId: string, data: { name: string; retailer_ids: string[] }) => api.post(`/catalogs/${catalogId}/sets`, data),
  deleteSet: (catalogId: string, setId: string) => api.delete(`/catalogs/${catalogId}/sets/${setId}`),

  picker: (params?: { search?: string; limit?: number; whatsapp_account?: string }) =>
    api.get('/catalogs/products/picker', { params }),
};

export const readCatalogs = (res: unknown) => readList<Catalog>(res as { data?: unknown }, 'catalogs');
export const readProducts = (res: unknown) => readList<CatalogProduct>(res as { data?: unknown }, 'products');
export const readCatalog = (res: unknown) => readData<Catalog>(res as { data?: unknown });
export const readProduct = (res: unknown) => readData<CatalogProduct>(res as { data?: unknown });
export const readAvailable = (res: unknown) => readList<AvailableCatalog>(res as { data?: unknown }, 'catalogs');
export const readSets = (res: unknown) => readList<ProductSet>(res as { data?: unknown }, 'sets');
export const readCommerceSettings = (res: unknown) => readData<CommerceSettings>(res as { data?: unknown });
export const readImportResult = (res: unknown) => readData<ProductImportResult>(res as { data?: unknown });
export const readSyncResult = (res: unknown) =>
  readData<{ synced?: number; total?: number; created?: number; updated?: number; missing?: number } | null>(
    res as { data?: unknown }
  ) ?? {};

/** WhatsApp accounts, or `forbidden` when the user may not read them (accounts:read). */
export async function loadAccounts(): Promise<WhatsAppAccountOption[] | 'forbidden'> {
  try {
    return readList<WhatsAppAccountOption>(await accountsService.list(), 'accounts');
  } catch (err) {
    if (errorStatus(err) === 403) return 'forbidden';
    throw err;
  }
}

/** "Sales line · +91 98…" — how a WhatsApp number is named in the catalogue screens. */
export function accountLabel(a: WhatsAppAccountOption | undefined, fallbackName = ''): string {
  if (!a) return fallbackName || 'WhatsApp number';
  const phone = a.phone_number || a.display_name;
  return phone && phone !== a.name ? `${a.name} · ${phone}` : a.name;
}

/* ------------------------------------------------------------------ errors */

type AxiosLikeError = {
  response?: { status?: number; data?: { message?: string } };
  message?: string;
};

export const errorStatus = (err: unknown): number | undefined =>
  (err as AxiosLikeError | undefined)?.response?.status;

/** The backend's `{ status: "error", message }` text, or a fallback. */
export function errorMessage(err: unknown, fallback: string): string {
  const e = err as AxiosLikeError | undefined;
  if (e?.response?.data?.message) return e.response.data.message;
  if (e && !e.response && e.message === 'Network Error') return 'Could not reach the server. Check your connection.';
  return fallback;
}

/**
 * Explore-mode workspaces (signed up, not paid) get 402 on changes. The API
 * interceptor only opens the Upgrade dialog for a few send/connect actions, so
 * catalogue screens open it themselves. Returns true when the error was a 402.
 */
export function handleUpgradeError(err: unknown): boolean {
  if (errorStatus(err) !== 402) return false;
  requestUpgrade(errorMessage(err, ''), { force: true });
  return true;
}

export interface ActionErrorInfo {
  message: string;
  hint?: string;
}

/** Turns an error from a catalogue/product action into a message plus a hint about the likely cause. */
export function describeActionError(err: unknown, fallback: string): ActionErrorInfo {
  const message = errorMessage(err, fallback);
  const status = errorStatus(err);

  if (status === 402) {
    return { message, hint: 'Upgrade your plan to make changes — you’re exploring OneSuit.' };
  }
  if (/whatsapp account not found/i.test(message)) {
    return {
      message,
      hint: 'The WhatsApp number linked to this catalogue isn’t connected to your workspace. Connect it under Settings → Accounts.',
    };
  }
  if (status === 502) {
    return {
      message,
      hint: /permission|access token|oauth|\(#(10|200|190)\)|code 190|code 200/i.test(message)
        ? 'Meta refused the access token. It needs the catalog_management and business_management permissions.'
        : 'Meta Commerce rejected the request — the message above is Meta’s own explanation.',
    };
  }
  if (status === 409) return { message, hint: 'Each product in a catalogue needs its own SKU.' };
  if (status === 500 && /^failed to (save|delete)/i.test(message)) {
    return { message, hint: 'The server could not update its local copy. Try again.' };
  }
  if (status === 403) {
    return { message, hint: 'Your role or plan doesn’t allow this action.' };
  }
  return { message };
}

/* ------------------------------------------------------------- product fields */

/** Currencies offered in the product form; any 3-letter ISO 4217 code is accepted. */
export const COMMON_CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SAR', 'SGD', 'AUD', 'CAD', 'BRL', 'MXN', 'IDR', 'NGN', 'ZAR'];

export const DEFAULT_CURRENCY = 'INR';

/** Meta's availability values (what the backend accepts). */
export const AVAILABILITY_OPTIONS = [
  { value: 'in stock', label: 'In stock' },
  { value: 'out of stock', label: 'Out of stock' },
  { value: 'preorder', label: 'Pre-order' },
  { value: 'available for order', label: 'Available to order' },
  { value: 'discontinued', label: 'Discontinued' },
] as const;

export const CONDITION_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'refurbished', label: 'Refurbished' },
  { value: 'used', label: 'Used' },
] as const;

export function availabilityLabel(value: string | undefined): string {
  return AVAILABILITY_OPTIONS.find((o) => o.value === (value || 'in stock'))?.label ?? value ?? 'In stock';
}

/** Whether customers can order the product right now. */
export const isOrderable = (availability: string | undefined) =>
  !availability || availability === 'in stock' || availability === 'available for order' || availability === 'preorder';

/** CSV columns for bulk import (the backend also accepts sale_price, brand, category, condition). */
export const CSV_COLUMNS = ['sku', 'name', 'description', 'price', 'currency', 'image_url', 'url', 'availability'] as const;

export const CSV_TEMPLATE =
  CSV_COLUMNS.join(',') +
  '\n' +
  'TSHIRT-BLK-M,Black cotton T-shirt (M),"Soft 100% cotton, regular fit",499.00,INR,https://example.com/images/tshirt.jpg,https://example.com/products/tshirt,in stock\n';

/* ------------------------------------------------------------------ prices */

/** Formats a price stored in the smallest unit (the backend's and Meta's convention) for display. */
export function formatPrice(minor: number, currency: string): string {
  const amount = (Number(minor) || 0) / 100;
  const code = (currency || DEFAULT_CURRENCY).toUpperCase();
  try {
    return new Intl.NumberFormat(code === 'INR' ? 'en-IN' : undefined, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // Unknown currency code.
    return `${amount.toFixed(2)} ${code}`;
  }
}

/** "19.99" -> 1999. Returns NaN for anything that isn't a non-negative amount with up to 2 decimals. */
export function toCents(value: string): number {
  const trimmed = value.trim().replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return NaN;
  return Math.round(parseFloat(trimmed) * 100);
}

/** 1999 -> "19.99" (for pre-filling the price input). */
export const fromCents = (cents: number): string => ((Number(cents) || 0) / 100).toFixed(2);

export function formatDate(value: string | undefined | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export const isHttpUrl = (value: string) => {
  try {
    const u = new URL(value);
    return (u.protocol === 'http:' || u.protocol === 'https:') && !!u.host;
  } catch {
    return false;
  }
};

/** Whether an account has what Meta needs for catalogue calls. */
export const accountReadyForCatalogs = (a: WhatsAppAccountOption | undefined): boolean =>
  !!a && !!a.business_id && a.has_access_token !== false;

/** Links for people who don't have a catalogue yet. */
export const COMMERCE_LINKS = {
  commerceManager: 'https://business.facebook.com/commerce',
  businessSettings: 'https://business.facebook.com/settings/whatsapp-business-accounts',
  guide: 'https://developers.facebook.com/docs/whatsapp/cloud-api/guides/sell-products-and-services',
};
