import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Loader2, LocateFixed, MapPin, Navigation, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { type ComposeDialogProps, Field, Note, fieldCls, primaryBtn } from './composeUi';
import { sendRich } from './sendRich';
import { googleMapsLink, osmEmbedUrl, parseLocationInput } from './richUtils';

type Mode = 'send' | 'ask';

interface PlaceResult {
  display_name: string;
  lat: string;
  lon: string;
  name?: string;
}

/** Free place search (OpenStreetMap Nominatim, no API key). */
const searchPlaces = async (q: string): Promise<PlaceResult[]> => {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('search failed');
  return (await res.json()) as PlaceResult[];
};

/** Send a location pin, or ask the customer to share theirs. */
export const LocationDialog: React.FC<ComposeDialogProps> = ({ open, onOpenChange, contact, onSent }) => {
  const [mode, setMode] = useState<Mode>('send');
  const [input, setInput] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [askText, setAskText] = useState('Please share your location so we can help you faster.');
  const [locating, setLocating] = useState(false);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<PlaceResult[] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode('send');
    setInput('');
    setName('');
    setAddress('');
    setResults(null);
  }, [open]);

  const runSearch = async () => {
    const q = input.trim();
    if (!q || searching) return;
    setSearching(true);
    try {
      setResults(await searchPlaces(q));
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const pickPlace = (p: PlaceResult) => {
    setInput(`${Number(p.lat).toFixed(6)}, ${Number(p.lon).toFixed(6)}`);
    const [first, ...rest] = p.display_name.split(',');
    setName(p.name || first.trim());
    setAddress(rest.join(',').trim());
    setResults(null);
  };

  const parsed = useMemo(() => parseLocationInput(input), [input]);
  const placeName = name.trim() || parsed?.name || '';

  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setInput(`${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`);
        setLocating(false);
      },
      () => setLocating(false),
      { timeout: 10000 }
    );
  };

  const submit = async () => {
    if (sending) return;
    setSending(true);
    let ok = false;
    if (mode === 'ask') {
      ok = await sendRich(contact, { type: 'interactive', interactive: { type: 'location_request', body: askText.trim() } }, '📍 Location request', onSent);
    } else if (parsed) {
      ok = await sendRich(
        contact,
        { type: 'location', location: { latitude: parsed.latitude, longitude: parsed.longitude, name: placeName || undefined, address: address.trim() || undefined } },
        `📍 ${placeName || 'Location'}`,
        onSent
      );
    }
    setSending(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-emerald-600" /> Location
          </DialogTitle>
          <DialogDescription>Share a place on the map, or ask the customer to send their location.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-1 rounded-xl bg-black/5 p-1 dark:bg-white/5">
          {(
            [
              ['send', 'Send a location'],
              ['ask', 'Ask for location'],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                mode === m ? 'bg-emerald-600 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === 'send' ? (
          <div className="space-y-3">
            <Field label="Search a place, paste a Google Maps link or lat, lng" hint="e.g. 28.6129, 77.2295">
              <div className="flex gap-2">
                <input
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    setResults(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !parsed) {
                      e.preventDefault();
                      void runSearch();
                    }
                  }}
                  placeholder="e.g. India Gate, New Delhi"
                  className={fieldCls}
                  autoFocus
                />
                {!parsed && input.trim() && (
                  <Button type="button" variant="outline" size="icon" onClick={() => void runSearch()} disabled={searching} title="Search" aria-label="Search places" className="h-9 w-9 shrink-0">
                    {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                )}
                <Button type="button" variant="outline" size="icon" onClick={useMyLocation} disabled={locating} title="Use my current location" aria-label="Use my current location" className="h-9 w-9 shrink-0">
                  <LocateFixed className={cn('h-4 w-4', locating && 'animate-pulse')} />
                </Button>
              </div>
            </Field>
            {results && results.length > 0 && (
              <div className="max-h-48 space-y-0.5 overflow-y-auto rounded-xl border border-input p-1">
                {results.map((p) => (
                  <button
                    key={`${p.lat},${p.lon}`}
                    type="button"
                    onClick={() => pickPlace(p)}
                    className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-emerald-500/10"
                  >
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    <span className="line-clamp-2 text-foreground">{p.display_name}</span>
                  </button>
                ))}
              </div>
            )}
            {input.trim() && !parsed && results !== null && results.length === 0 && !searching && (
              <Note tone="warn">
                No places found. Paste a Google Maps link that shows coordinates (open the place, then copy the URL), or type them like “19.0760, 72.8777”.
              </Note>
            )}
            {input.trim() && !parsed && results === null && !searching && (
              <p className="text-[11px] text-muted-foreground">Press Enter or the search button to look this place up.</p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Place name" hint="optional">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder={parsed?.name || 'e.g. OneSuit Store'} className={fieldCls} />
              </Field>
              <Field label="Address" hint="optional">
                <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, city" className={fieldCls} />
              </Field>
            </div>
            {parsed && (
              <div className="overflow-hidden rounded-xl border border-input">
                <iframe
                  title="Map preview"
                  src={osmEmbedUrl(parsed.latitude, parsed.longitude)}
                  className="h-40 w-full border-0"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
                <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                  <span className="min-w-0 truncate text-muted-foreground">
                    {parsed.latitude.toFixed(5)}, {parsed.longitude.toFixed(5)}
                  </span>
                  <a href={googleMapsLink(parsed.latitude, parsed.longitude)} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 font-medium text-teal-600 hover:underline dark:text-teal-400">
                    Open in Maps <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <Field label="Message">
              <textarea value={askText} onChange={(e) => setAskText(e.target.value)} rows={3} maxLength={1024} className={cn(fieldCls, 'h-auto py-2')} />
            </Field>
            <Note>
              The customer gets a <b>Send location</b> button. When they tap it, their pin appears here in the chat.
            </Note>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => void submit()} disabled={sending || (mode === 'send' ? !parsed : !askText.trim())} className={primaryBtn}>
            {mode === 'ask' ? <Navigation className="mr-1.5 h-3.5 w-3.5" /> : <MapPin className="mr-1.5 h-3.5 w-3.5" />}
            {sending ? 'Sending…' : mode === 'ask' ? 'Ask for location' : 'Send location'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default LocationDialog;
