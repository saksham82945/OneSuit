import React from 'react';
import { BarChart3, Download, ExternalLink, MapPin, MessageCircle, Navigation, Package, ShoppingCart, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  type ContactCardData,
  type PollOption,
  formatMoney,
  googleMapsLink,
  osmEmbedUrl,
  parseContactsContent,
  parseLocationContent,
  parseOrderContent,
  pollPercent,
} from './richUtils';

interface RichMessage {
  message_type?: string;
  content?: unknown;
  interactive_data?: Record<string, unknown> | null;
  direction: 'incoming' | 'outgoing';
}

const subtle = 'bg-black/5 dark:bg-white/10';

const LocationCard: React.FC<{ m: RichMessage }> = ({ m }) => {
  const loc = parseLocationContent(m.content);
  if (!loc) return null;
  const href = googleMapsLink(loc.latitude, loc.longitude);
  return (
    <div className="-mx-1 mb-1 w-64 max-w-full overflow-hidden rounded-lg">
      <a href={href} target="_blank" rel="noreferrer" className="relative block h-32" aria-label="Open location in Google Maps">
        <iframe title="Location" src={osmEmbedUrl(loc.latitude, loc.longitude, 0.004)} loading="lazy" referrerPolicy="no-referrer" tabIndex={-1} className="pointer-events-none h-full w-full border-0" />
        <span className="absolute inset-0" />
      </a>
      <div className={cn('flex items-start gap-2 px-2.5 py-2', subtle)}>
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold">{loc.name || 'Location'}</p>
          {loc.address && <p className="line-clamp-2 text-[11px] opacity-75">{loc.address}</p>}
          <a href={href} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-teal-700 hover:underline dark:text-teal-300">
            Open in Maps <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </div>
  );
};

const vcard = (c: ContactCardData) =>
  [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${c.name}`,
    ...(c.company ? [`ORG:${c.company}`] : []),
    ...(c.phones || []).map((p) => `TEL;TYPE=CELL:${p}`),
    ...(c.emails || []).map((e) => `EMAIL:${e}`),
    'END:VCARD',
  ].join('\r\n');

const saveVCard = (c: ContactCardData) => {
  const url = URL.createObjectURL(new Blob([vcard(c)], { type: 'text/vcard' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${c.name.replace(/[^\w\s-]/g, '').trim() || 'contact'}.vcf`;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const ContactsCard: React.FC<{ m: RichMessage }> = ({ m }) => {
  const cards = parseContactsContent(m.content);
  return (
    <div className="mb-1 w-64 max-w-full space-y-1.5">
      {cards.map((c, i) => {
        const phone = c.phones?.[0];
        const wa = phone ? phone.replace(/\D/g, '') : '';
        return (
          <div key={`${c.name}-${i}`} className={cn('overflow-hidden rounded-lg', subtle)}>
            <div className="flex items-center gap-2.5 px-2.5 py-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-600/15 text-emerald-700 dark:text-emerald-300">
                <UserRound className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold">{c.name}</p>
                {phone && <p className="truncate text-[11px] opacity-75">{phone}</p>}
                {!phone && c.emails?.[0] && <p className="truncate text-[11px] opacity-75">{c.emails[0]}</p>}
                {c.company && <p className="truncate text-[11px] opacity-60">{c.company}</p>}
              </div>
            </div>
            <div className="grid grid-cols-2 border-t border-black/10 text-[12px] font-medium text-teal-700 dark:border-white/10 dark:text-teal-300">
              <button type="button" onClick={() => saveVCard(c)} className="flex items-center justify-center gap-1 py-1.5 hover:bg-black/5 dark:hover:bg-white/5">
                <Download className="h-3.5 w-3.5" /> Save
              </button>
              {wa ? (
                <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1 border-l border-black/10 py-1.5 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5">
                  <MessageCircle className="h-3.5 w-3.5" /> Message
                </a>
              ) : (
                <span className="flex items-center justify-center border-l border-black/10 py-1.5 opacity-40 dark:border-white/10">Message</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const OrderCard: React.FC<{ m: RichMessage }> = ({ m }) => {
  const order = parseOrderContent(m.content);
  if (!order) return null;
  const count = order.items.reduce((n, it) => n + (Number(it.quantity) || 0), 0);
  return (
    <div className={cn('mb-1 w-64 max-w-full rounded-lg px-2.5 py-2', subtle)}>
      <p className="flex items-center gap-1.5 text-[13px] font-semibold">
        <ShoppingCart className="h-4 w-4 text-emerald-600" /> Order · {count} item{count === 1 ? '' : 's'}
      </p>
      <ul className="mt-1.5 space-y-1 text-[12px]">
        {order.items.map((it, i) => (
          <li key={`${it.product_retailer_id}-${i}`} className="flex justify-between gap-2">
            <span className="min-w-0 truncate opacity-85">
              {it.quantity} × {it.product_retailer_id}
            </span>
            <span className="shrink-0 tabular-nums">{formatMoney((Number(it.item_price) || 0) * (Number(it.quantity) || 0), it.currency || order.currency)}</span>
          </li>
        ))}
      </ul>
      {order.total != null && (
        <p className="mt-1.5 flex justify-between border-t border-black/10 pt-1.5 text-[12px] font-semibold dark:border-white/10">
          <span>Total</span>
          <span className="tabular-nums">{formatMoney(Number(order.total) || 0, order.currency)}</span>
        </p>
      )}
      {order.text && <p className="mt-1.5 whitespace-pre-wrap text-[12px] opacity-85">{order.text}</p>}
    </div>
  );
};

interface ProductItem {
  product_retailer_id?: string;
  name?: string;
  price?: string;
  image_url?: string;
}

const ProductCards: React.FC<{ d: Record<string, unknown> }> = ({ d }) => {
  const products = (Array.isArray(d.products) ? d.products : []) as ProductItem[];
  const isList = d.type === 'product_list';
  const shown = isList ? products.slice(0, 4) : products.slice(0, 1);
  const fallbackId = typeof d.product_retailer_id === 'string' ? d.product_retailer_id : '';
  return (
    <div className="mb-1 w-64 max-w-full">
      {isList && typeof d.header === 'string' && d.header && <p className="mb-1 text-[13px] font-semibold">{d.header}</p>}
      {shown.length === 0 && (
        <div className={cn('flex items-center gap-2 rounded-lg px-2.5 py-2', subtle)}>
          <Package className="h-5 w-5 opacity-70" />
          <span className="truncate text-[12px]">{fallbackId || 'Product'}</span>
        </div>
      )}
      {!isList && shown[0] && (
        <div className={cn('overflow-hidden rounded-lg', subtle)}>
          {shown[0].image_url ? (
            <img src={shown[0].image_url} alt={shown[0].name || ''} className="h-36 w-full object-cover" loading="lazy" />
          ) : (
            <div className="flex h-24 items-center justify-center">
              <Package className="h-8 w-8 opacity-40" />
            </div>
          )}
          <div className="px-2.5 py-1.5">
            <p className="truncate text-[13px] font-semibold">{shown[0].name || shown[0].product_retailer_id}</p>
            {shown[0].price && <p className="text-[12px] opacity-75">{shown[0].price}</p>}
          </div>
        </div>
      )}
      {isList && shown.length > 0 && (
        <div className="grid grid-cols-2 gap-1">
          {shown.map((p, i) => (
            <div key={`${p.product_retailer_id}-${i}`} className={cn('overflow-hidden rounded-md', subtle)}>
              {p.image_url ? (
                <img src={p.image_url} alt={p.name || ''} className="h-16 w-full object-cover" loading="lazy" />
              ) : (
                <div className="flex h-16 items-center justify-center">
                  <Package className="h-5 w-5 opacity-40" />
                </div>
              )}
              <p className="truncate px-1.5 pt-1 text-[11px] font-medium">{p.name || p.product_retailer_id}</p>
              <p className="truncate px-1.5 pb-1 text-[10px] opacity-70">{p.price}</p>
            </div>
          ))}
        </div>
      )}
      {typeof d.body === 'string' && d.body && <p className="mt-1.5 whitespace-pre-wrap break-words text-[13px]">{d.body}</p>}
      {typeof d.footer === 'string' && d.footer && <p className="mt-0.5 text-[11px] opacity-60">{d.footer}</p>}
      <div className="mt-1.5 flex items-center justify-center gap-1.5 border-t border-black/10 pt-1.5 text-[12px] font-medium text-teal-700 dark:border-white/10 dark:text-teal-300">
        <ShoppingCart className="h-3.5 w-3.5" /> {isList ? `View items${products.length > 4 ? ` (${products.length})` : ''}` : 'View'}
      </div>
    </div>
  );
};

const PollCard: React.FC<{ d: Record<string, unknown> }> = ({ d }) => {
  const options = (Array.isArray(d.options) ? d.options : []) as PollOption[];
  const votes = (d.votes && typeof d.votes === 'object' ? d.votes : {}) as Record<string, number>;
  const total = Number(d.total_votes) || 0;
  const last = typeof d.last_vote === 'string' ? d.last_vote : '';
  return (
    <div className="mb-1 w-64 max-w-full">
      <p className="flex items-start gap-1.5 text-[13px] font-semibold">
        <BarChart3 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        <span className="whitespace-pre-wrap break-words">{String(d.question || d.body || 'Poll')}</span>
      </p>
      <ul className="mt-2 space-y-1.5">
        {options.map((o) => {
          const n = Number(votes[o.id]) || 0;
          const pct = pollPercent(n, total);
          const chosen = o.id === last;
          return (
            <li key={o.id}>
              <div className="flex items-baseline justify-between gap-2 text-[12px]">
                <span className={cn('min-w-0 truncate', chosen && 'font-semibold')}>
                  {o.title}
                  {chosen && <span className="ml-1 text-emerald-700 dark:text-emerald-300">✓</span>}
                </span>
                <span className="shrink-0 tabular-nums opacity-70">{n}</span>
              </div>
              <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/15">
                <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${pct}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-1.5 text-[10px] opacity-60">
        WhatsApp button poll · {total} vote{total === 1 ? '' : 's'}
      </p>
    </div>
  );
};

const LocationRequestCard: React.FC<{ d: Record<string, unknown> }> = ({ d }) => (
  <div className="mb-1 w-60 max-w-full">
    <p className="whitespace-pre-wrap break-words text-[13px]">{String(d.body || 'Please share your location.')}</p>
    <div className="mt-1.5 flex items-center justify-center gap-1.5 border-t border-black/10 pt-1.5 text-[12px] font-medium text-teal-700 dark:border-white/10 dark:text-teal-300">
      <Navigation className="h-3.5 w-3.5" /> Send location
    </div>
  </div>
);

/** Bubble body for location, contact, order, product, poll and location-request messages. */
export const RichBubble: React.FC<{ m: RichMessage }> = ({ m }) => {
  switch (m.message_type) {
    case 'location':
      return <LocationCard m={m} />;
    case 'contacts':
      return <ContactsCard m={m} />;
    case 'order':
      return <OrderCard m={m} />;
    case 'interactive': {
      const d = m.interactive_data || {};
      if (d.type === 'poll') return <PollCard d={d} />;
      if (d.type === 'product' || d.type === 'product_list') return <ProductCards d={d} />;
      if (d.type === 'location_request') return <LocationRequestCard d={d} />;
      return null;
    }
    default:
      return null;
  }
};

export default RichBubble;
