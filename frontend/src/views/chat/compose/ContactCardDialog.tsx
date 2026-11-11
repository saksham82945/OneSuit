import React, { useEffect, useState } from 'react';
import { Loader2, Search, UserPlus, UserRound } from 'lucide-react';
import { contactsService } from '@/services/api';
import { readList } from '@/services/response';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { type Contact, getAvatarColor, getContactName, getInitials } from '../chatUtils';
import { type ComposeDialogProps, Field, fieldCls, primaryBtn } from './composeUi';
import { sendRich } from './sendRich';

interface CardDraft {
  name: string;
  phone: string;
  email: string;
  company: string;
}

const EMPTY: CardDraft = { name: '', phone: '', email: '', company: '' };

const digits = (s: string) => s.replace(/\D/g, '');

/** Share a contact card: pick one of the workspace's contacts or type one. */
export const ContactCardDialog: React.FC<ComposeDialogProps> = ({ open, onOpenChange, contact, onSent }) => {
  const [tab, setTab] = useState<'pick' | 'new'>('pick');
  const [query, setQuery] = useState('');
  const [list, setList] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<CardDraft>(EMPTY);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTab('pick');
    setQuery('');
    setDraft(EMPTY);
  }, [open]);

  useEffect(() => {
    if (!open || tab !== 'pick') return;
    let cancelled = false;
    setLoading(true);
    const t = window.setTimeout(() => {
      contactsService
        .list({ search: query.trim().replace(/^\+/, '') || undefined, limit: 20 })
        .then((res) => !cancelled && setList(readList<Contact>(res, 'contacts')))
        .catch(() => !cancelled && setList([]))
        .finally(() => !cancelled && setLoading(false));
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [open, tab, query]);

  const pick = (c: Contact) => {
    setDraft({ name: getContactName(c), phone: c.phone_number?.startsWith('+') ? c.phone_number : `+${digits(c.phone_number || '')}`, email: '', company: '' });
    setTab('new');
  };

  const valid = draft.name.trim() && (digits(draft.phone).length >= 6 || /\S+@\S+\.\S+/.test(draft.email));

  const submit = async () => {
    if (!valid || sending) return;
    setSending(true);
    const phone = draft.phone.trim();
    const card = {
      name: draft.name.trim(),
      phones: phone ? [{ phone, type: 'CELL', wa_id: digits(phone) || undefined }] : [],
      emails: draft.email.trim() ? [{ email: draft.email.trim(), type: 'WORK' }] : [],
      company: draft.company.trim() || undefined,
    };
    const ok = await sendRich(contact, { type: 'contacts', contacts: [card] }, `👤 ${card.name}`, onSent);
    setSending(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserRound className="h-4 w-4 text-emerald-600" /> Share a contact
          </DialogTitle>
          <DialogDescription>The customer gets a contact card they can save or message on WhatsApp.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-1 rounded-xl bg-black/5 p-1 dark:bg-white/5">
          {(
            [
              ['pick', 'From contacts'],
              ['new', 'Type details'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={cn('rounded-lg px-3 py-1.5 text-xs font-semibold', tab === k ? 'bg-emerald-600 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground')}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'pick' ? (
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or number" className={cn(fieldCls, 'pl-8')} autoFocus />
            </div>
            <div className="max-h-72 space-y-0.5 overflow-y-auto">
              {loading && (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}
              {!loading && list.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">No contacts found. Use “Type details” to enter one.</p>}
              {!loading &&
                list.map((c) => {
                  const n = getContactName(c);
                  return (
                    <button key={c.id} type="button" onClick={() => pick(c)} className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left hover:bg-emerald-500/10">
                      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold', getAvatarColor(n))}>{getInitials(n)}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-foreground">{n}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">{c.phone_number}</span>
                      </span>
                    </button>
                  );
                })}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Field label="Name">
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Priya Sharma" className={fieldCls} />
            </Field>
            <Field label="Phone" hint="with country code">
              <input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} placeholder="+91 98765 43210" inputMode="tel" className={fieldCls} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Email" hint="optional">
                <input value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} placeholder="name@company.com" inputMode="email" className={fieldCls} />
              </Field>
              <Field label="Company" hint="optional">
                <input value={draft.company} onChange={(e) => setDraft({ ...draft, company: e.target.value })} className={fieldCls} />
              </Field>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {tab === 'new' && (
            <Button size="sm" onClick={() => void submit()} disabled={!valid || sending} className={primaryBtn}>
              <UserPlus className="mr-1.5 h-3.5 w-3.5" />
              {sending ? 'Sending…' : 'Send contact'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ContactCardDialog;
