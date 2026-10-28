/**
 * Catalogue API (internal/handlers/catalog.go) and helpers shared by the
 * catalogue screens.
 *
 * Catalogues and products are mirrored to Meta's Commerce API: every create,
 * update, delete and sync resolves the catalogue's WhatsApp account and calls
 * Meta with that account's Business ID and access token. Only the GET
 * endpoints are purely local.
 */
import { api, accountsService } from '@/services/api';
import { readData, readList } from '@/services/response';

/** CatalogResponse in catalog.go. */
export interface Catalog {
  id: string;
  meta_catalog_id: string;
  whatsapp_account: string; // the account's name
  name: string;
  is_active: boolean;
  product_count: number;
  products?: CatalogProduct[];
  created_at: string;
  updated_at: string;
}

/** CatalogProductResponse in catalog.go. `price` is in the smallest currency unit (cents). */
export interface CatalogProduct {
  id: string;
  meta_product_id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  url: string;
  image_url: string;
  retailer_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** CatalogProductRequest in catalog.go. */
export interface CatalogProductInput {
  name: string;
  description: string;
  price: number; // cents
  currency: string;
  url: string;
  image_url: string;
  retailer_id: string;
}

/** The fields of AccountResponse (accounts.go) the catalogue screens use. */
export interface WhatsAppAccountOption {
  id: string;
  name: string;
  business_id?: string;
  has_access_token?: boolean;
  phone_number?: string;
  display_name?: string;
}

export const catalogService = {
  list: (params?: { whatsapp_account?: string }) => api.get('/catalogs', { params }),
  get: (id: string) => api.get(`/catalogs/${id}`),
  /** Creates the catalogue in Meta first, then stores it locally. */
  create: (data: { whatsapp_account: string; name: string }) => api.post('/catalogs', data),
  /** Deletes in Meta (a Meta failure is ignored), then deletes the catalogue and its products locally. */
  delete: (id: string) => api.delete(`/catalogs/${id}`),
  /** Pulls the account's catalogues from Meta and creates/updates the local copies. */
  sync: (whatsappAccount: string) => api.post('/catalogs/sync', { whatsapp_account: whatsappAccount }),
  listProducts: (catalogId: string) => api.get(`/catalogs/${catalogId}/products`),
  createProduct: (catalogId: string, data: CatalogProductInput) =>
    api.post(`/catalogs/${catalogId}/products`, data),
  updateProduct: (productId: string, data: Partial<CatalogProductInput>) =>
    api.put(`/products/${productId}`, data),
  deleteProduct: (productId: string) => api.delete(`/products/${productId}`),
};

export const readCatalogs = (res: unknown) => readList<Catalog>(res as { data?: unknown }, 'catalogs');
export const readProducts = (res: unknown) => readList<CatalogProduct>(res as { data?: unknown }, 'products');
export const readCatalog = (res: unknown) => readData<Catalog>(res as { data?: unknown });
export const readSyncResult = (res: unknown) =>
  readData<{ synced?: number; total?: number } | null>(res as { data?: unknown }) ?? {};

/** WhatsApp accounts, or `forbidden` when the user may not read them (accounts:read). */
export async function loadAccounts(): Promise<WhatsAppAccountOption[] | 'forbidden'> {
  try {
    return readList<WhatsAppAccountOption>(await accountsService.list(), 'accounts');
  } catch (err) {
    if (errorStatus(err) === 403) return 'forbidden';
    throw err;
  }
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

export interface ActionErrorInfo {
  message: string;
  hint?: string;
}

/**
 * Turns an error from a catalogue/product mutation into the backend's message
 * plus a hint explaining the likely cause. The handlers log Meta's own error
 * and return a generic message ("Failed to create catalog", ...), so the hint
 * is what tells the user that Meta, not this app, rejected the request.
 */
export function describeActionError(err: unknown, fallback: string): ActionErrorInfo {
  const message = errorMessage(err, fallback);
  const status = errorStatus(err);

  if (/whatsapp account not found/i.test(message)) {
    return {
      message,
      hint: 'The WhatsApp account linked to this catalogue isn’t connected to your organization. Connect it under Settings → Accounts.',
    };
  }
  if (status === 500 && /^failed to (create|update|fetch)/i.test(message)) {
    return {
      message,
      hint: 'Meta’s Commerce API rejected the request. Check that the WhatsApp account has a valid access token and Business ID, and that the token has catalog_management permission.',
    };
  }
  if (status === 500 && /^failed to (save|delete)/i.test(message)) {
    return { message, hint: 'The server could not update its local copy. Try again.' };
  }
  if (status === 403) {
    return { message, hint: 'Your role doesn’t allow this action.' };
  }
  return { message };
}

/* ------------------------------------------------------------------ prices */

/** Currencies offered in the product form; any 3-letter ISO 4217 code is accepted. */
export const COMMON_CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'AED', 'SAR', 'BRL', 'MXN', 'IDR', 'NGN', 'ZAR', 'AUD', 'CAD', 'SGD'];

/** Formats a price stored in cents (the backend's and Meta's convention) for display. */
export function formatPrice(cents: number, currency: string): string {
  const amount = (Number(cents) || 0) / 100;
  const code = (currency || 'USD').toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, {
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

export function formatDate(value: string | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Whether an account has what Meta needs for catalogue calls. */
export const accountReadyForCatalogs = (a: WhatsAppAccountOption | undefined): boolean =>
  !!a && !!a.business_id && a.has_access_token !== false;
