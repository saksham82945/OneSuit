import React, { useState } from 'react';
import { BarChart3, CalendarClock, FileText, Headphones, Image as ImageIcon, MapPin, Plus, ShoppingBag, UserRound } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { Contact, Message } from '../chatUtils';
import { ContactCardDialog } from './ContactCardDialog';
import { LocationDialog } from './LocationDialog';
import { PollDialog } from './PollDialog';
import { ProductDialog } from './ProductDialog';
import { ScheduleDialog } from './ScheduleDialog';

type DialogKind = 'location' | 'contact' | 'product' | 'poll' | 'schedule' | null;

/** File pickers the composer opens: `accept` for the hidden file input. */
export type FileKind = 'document' | 'media' | 'audio';

interface Item {
  key: FileKind | Exclude<DialogKind, null>;
  label: string;
  icon: React.ElementType;
  tint: string;
  /** Needs the 24-hour window open (everything but scheduling). */
  needsWindow: boolean;
}

const ITEMS: Item[] = [
  { key: 'document', label: 'Document', icon: FileText, tint: 'bg-indigo-500', needsWindow: true },
  { key: 'media', label: 'Photo & video', icon: ImageIcon, tint: 'bg-sky-500', needsWindow: true },
  { key: 'audio', label: 'Audio', icon: Headphones, tint: 'bg-orange-500', needsWindow: true },
  { key: 'location', label: 'Location', icon: MapPin, tint: 'bg-emerald-600', needsWindow: true },
  { key: 'contact', label: 'Contact', icon: UserRound, tint: 'bg-cyan-600', needsWindow: true },
  { key: 'product', label: 'Product', icon: ShoppingBag, tint: 'bg-rose-500', needsWindow: true },
  { key: 'poll', label: 'Poll', icon: BarChart3, tint: 'bg-amber-500', needsWindow: true },
  { key: 'schedule', label: 'Schedule message', icon: CalendarClock, tint: 'bg-teal-600', needsWindow: false },
];

export interface AttachMenuProps {
  contact: Contact;
  windowOpen: boolean;
  /** Text in the composer; becomes the starting text of a scheduled message. */
  composerText: string;
  onPickFile: (kind: FileKind) => void;
  onSent: (m: Message | null, preview: string) => void;
  onScheduled: () => void;
}

/** The composer's "+" menu: files plus location, contact, product, poll and scheduling. */
export const AttachMenu: React.FC<AttachMenuProps> = ({ contact, windowOpen, composerText, onPickFile, onSent, onScheduled }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogKind>(null);

  const pick = (item: Item) => {
    setMenuOpen(false);
    if (item.key === 'document' || item.key === 'media' || item.key === 'audio') onPickFile(item.key);
    else setDialog(item.key);
  };

  const dialogProps = (kind: Exclude<DialogKind, null>) => ({
    open: dialog === kind,
    onOpenChange: (o: boolean) => setDialog(o ? kind : null),
    contact,
    onSent,
  });

  return (
    <>
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            title="Attach"
            aria-label="Attach"
            className={cn(
              'inline-flex h-10 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-200/70 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.08] dark:hover:text-white',
              menuOpen && 'text-teal-600 dark:text-teal-400'
            )}
          >
            <Plus className={cn('h-5 w-5 transition-transform', menuOpen && 'rotate-45')} />
          </button>
        </PopoverTrigger>
        <PopoverContent side="top" align="start" className="w-[min(18rem,calc(100vw-1.5rem))] p-2">
          <div className="grid grid-cols-4 gap-1">
            {ITEMS.map((item) => {
              const Icon = item.icon;
              const disabled = item.needsWindow && !windowOpen;
              return (
                <button
                  key={item.key}
                  type="button"
                  disabled={disabled}
                  onClick={() => pick(item)}
                  title={disabled ? 'Reply window closed — send a template, or schedule one' : item.label}
                  className="flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-center hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-white/[0.06]"
                >
                  <span className={cn('flex h-10 w-10 items-center justify-center rounded-full text-white shadow-sm', item.tint)}>
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="text-[10.5px] font-medium leading-tight text-foreground">{item.label}</span>
                </button>
              );
            })}
          </div>
          {!windowOpen && <p className="mt-1.5 px-1 text-[10.5px] leading-snug text-muted-foreground">The 24-hour reply window is closed. You can still schedule an approved template.</p>}
        </PopoverContent>
      </Popover>

      <LocationDialog {...dialogProps('location')} />
      <ContactCardDialog {...dialogProps('contact')} />
      <ProductDialog {...dialogProps('product')} />
      <PollDialog {...dialogProps('poll')} />
      <ScheduleDialog
        open={dialog === 'schedule'}
        onOpenChange={(o) => setDialog(o ? 'schedule' : null)}
        contact={contact}
        editing={null}
        initialText={composerText.trim()}
        onSaved={onScheduled}
      />
    </>
  );
};

export default AttachMenu;
