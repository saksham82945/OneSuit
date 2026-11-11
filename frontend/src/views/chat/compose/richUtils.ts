import { api } from '@/services/api';

/** A location pin, as sent and as stored in a message's content. */
export interface LocationData {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

/** A contact card as stored in a message's content. */
export interface ContactCardData {
  name: string;
  phones?: string[];
  emails?: string[];
  company?: string;
}

export interface OrderItem {
  product_retailer_id: string;
  quantity: number;
  item_price: number;
  currency?: string;
}

export interface OrderData {
  catalog_id?: string;
  text?: string;
  items: OrderItem[];
  total?: number;
  currency?: string;
}

export interface PollOption {
  id: string;
  title: string;
}

/** A product from GET /catalogs/products/picker. */
export interface PickerProduct {
  catalog_id: string;
  catalog_name?: string;
  product_retailer_id: string;
  name: string;
  price?: number | string;
  price_text?: string;
  currency?: string;
  image_url?: string;
}

export interface ScheduledMessage {
  id: string;
  contact_id: string;
  kind: 'text' | 'template';
  content: string;
  template_id?: string;
  template_name?: string;
  template_params?: Record<string, string>;
  scheduled_at: string;
  status: 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled';
  error_message?: string;
  window_warning?: string;
}

const num = (s: string) => {
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};

const valid = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

/**
 * Reads a location from what an agent pastes: "12.97, 77.59", a Google Maps
 * link (…/@12.97,77.59,15z, ?q=12.97,77.59, !3d12.97!4d77.59) or an
 * OpenStreetMap link (?mlat=…&mlon=… or #map=15/12.97/77.59).
 */
export const parseLocationInput = (raw: string): { latitude: number; longitude: number; name?: string } | null => {
  const s = raw.trim();
  if (!s) return null;
  const pair = (a: string, b: string) => {
    const lat = num(a);
    const lng = num(b);
    return valid(lat, lng) ? { latitude: lat, longitude: lng } : null;
  };
  const D = '(-?\\d{1,3}(?:\\.\\d+)?)';
  const plain = s.match(new RegExp(`^${D}\\s*[,\\s]\\s*${D}$`));
  if (plain) return pair(plain[1], plain[2]);

  const d34 = s.match(new RegExp(`!3d${D}!4d${D}`));
  if (d34) return pair(d34[1], d34[2]);
  const at = s.match(new RegExp(`@${D},${D}`));
  let name: string | undefined;
  const place = s.match(/\/place\/([^/@?]+)/);
  if (place) {
    try {
      name = decodeURIComponent(place[1].replace(/\+/g, ' '));
    } catch {
      name = place[1].replace(/\+/g, ' ');
    }
  }
  if (at) {
    const p = pair(at[1], at[2]);
    return p ? { ...p, name } : null;
  }
  const q = s.match(new RegExp(`[?&](?:q|query|ll|daddr|destination)=${D}(?:,|%2C)\\s*${D}`, 'i'));
  if (q) return pair(q[1], q[2]);
  const osm = s.match(new RegExp(`mlat=${D}.*?mlon=${D}`));
  if (osm) return pair(osm[1], osm[2]);
  const osmHash = s.match(new RegExp(`#map=\\d+/${D}/${D}`));
  if (osmHash) return pair(osmHash[1], osmHash[2]);
  return null;
};

export const googleMapsLink = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

export const osmEmbedUrl = (lat: number, lng: number, delta = 0.005) =>
  `https://www.openstreetmap.org/export/embed.html?bbox=${lng - delta},${lat - delta},${lng + delta},${lat + delta}&layer=mapnik&marker=${lat},${lng}`;

const bodyOf = (content: unknown) => (typeof content === 'string' ? content : (content as { body?: string } | null | undefined)?.body || '');

const parseJSON = (s: string): unknown => {
  if (!s || (s[0] !== '{' && s[0] !== '[')) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};

export const parseLocationContent = (content: unknown): LocationData | null => {
  const v = parseJSON(bodyOf(content)) as Partial<LocationData> | null;
  if (!v || typeof v !== 'object' || typeof v.latitude !== 'number' || typeof v.longitude !== 'number') return null;
  return { latitude: v.latitude, longitude: v.longitude, name: v.name, address: v.address };
};

export const parseContactsContent = (content: unknown): ContactCardData[] => {
  const v = parseJSON(bodyOf(content));
  if (!Array.isArray(v)) return [];
  return v
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
    .map((c) => ({
      name: String(c.name || 'Contact'),
      phones: Array.isArray(c.phones) ? c.phones.map(String) : [],
      emails: Array.isArray(c.emails) ? c.emails.map(String) : [],
      company: typeof c.company === 'string' ? c.company : undefined,
    }));
};

export const parseOrderContent = (content: unknown): OrderData | null => {
  const v = parseJSON(bodyOf(content)) as Partial<OrderData> | null;
  if (!v || typeof v !== 'object' || !Array.isArray(v.items)) return null;
  return { ...v, items: v.items } as OrderData;
};

export const formatMoney = (amount: number, currency?: string) => {
  if (!currency) return amount.toLocaleString();
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
};

/** Percent of total for a poll bar, 0–100. */
export const pollPercent = (votes: number, total: number) => (total > 0 ? Math.round((votes / total) * 100) : 0);

/** Message types / interactive types that render as a rich bubble. */
export const RICH_INTERACTIVE = ['poll', 'product', 'product_list', 'location_request'];

export const isRichMessage = (m: { message_type?: string; interactive_data?: Record<string, unknown> | null; content?: unknown }) => {
  if (m.message_type === 'location') return !!parseLocationContent(m.content);
  if (m.message_type === 'contacts') return parseContactsContent(m.content).length > 0;
  if (m.message_type === 'order') return !!parseOrderContent(m.content);
  if (m.message_type === 'interactive') return RICH_INTERACTIVE.includes(String(m.interactive_data?.type || ''));
  return false;
};

/** Default value for a datetime-local input: now + minutes, in local time. */
export const localDateTimeValue = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const formatScheduled = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
};

export const composeService = {
  /** POST a chat message (location, contacts, product, poll, location request). */
  send: (contactId: string, data: object) => api.post(`/contacts/${contactId}/messages`, data),
  productPicker: (params: { search?: string; whatsapp_account?: string; limit?: number }) =>
    api.get('/catalogs/products/picker', { params }),
  listScheduled: (contactId: string) => api.get(`/contacts/${contactId}/scheduled-messages`),
  createScheduled: (contactId: string, data: object) => api.post(`/contacts/${contactId}/scheduled-messages`, data),
  updateScheduled: (id: string, data: object) => api.put(`/scheduled-messages/${id}`, data),
  cancelScheduled: (id: string) => api.delete(`/scheduled-messages/${id}`),
};
