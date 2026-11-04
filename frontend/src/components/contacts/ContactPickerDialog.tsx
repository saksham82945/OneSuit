import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { Loader2, Search, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { contactsService } from '@/services/api';
import { apiErrorMessage } from '@/services/groupsApi';
import { readList, readTotal } from '@/services/response';

interface PickerContact {
  id: string;
  phone_number?: string;
  name?: string;
  profile_name?: string;
}

interface ContactPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  onConfirm: (contactIds: string[]) => Promise<void> | void;
}

const PAGE = 50;

/** Search contacts and tick the ones to add. */
export const ContactPickerDialog: React.FC<ContactPickerDialogProps> = ({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Add',
  onConfirm,
}) => {
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<PickerContact[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async (q: string, p: number) => {
    const mine = ++seq.current;
    setLoading(true);
    try {
      const res = await contactsService.list({ search: q.trim() || undefined, page: p, limit: PAGE });
      if (mine !== seq.current) return;
      const list = readList<PickerContact>(res, 'contacts');
      setItems((prev) => (p === 1 ? list : [...prev, ...list]));
      setTotal(readTotal(res, 'contacts'));
      setPage(p);
    } catch (err) {
      if (mine === seq.current) toast.error(apiErrorMessage(err, 'Failed to load contacts'));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setPicked(new Set());
      setSearch('');
      setItems([]);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => load(search, 1), search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [search, open, load]);

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allShownPicked = items.length > 0 && items.every((c) => picked.has(c.id));
  const toggleAllShown = () =>
    setPicked((prev) => {
      const next = new Set(prev);
      items.forEach((c) => (allShownPicked ? next.delete(c.id) : next.add(c.id)));
      return next;
    });

  const confirm = async () => {
    setSaving(true);
    try {
      await onConfirm([...picked]);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-emerald-500" />
            {title}
          </DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/40 light:text-gray-400" />
          <Input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or phone…"
            className="pl-8 h-9 text-xs"
          />
        </div>

        <div className="flex items-center justify-between text-[11px] text-white/50 light:text-gray-500">
          <button type="button" onClick={toggleAllShown} className="font-semibold hover:underline disabled:opacity-40" disabled={items.length === 0}>
            {allShownPicked ? 'Clear shown' : 'Select all shown'}
          </button>
          <span>{picked.size} selected</span>
        </div>

        <div className="max-h-72 overflow-y-auto -mx-1 px-1 space-y-1">
          {items.map((c) => {
            const name = c.profile_name || c.name || c.phone_number || 'Unnamed contact';
            const on = picked.has(c.id);
            return (
              <label
                key={c.id}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-2.5 py-2 cursor-pointer transition-colors',
                  on ? 'bg-emerald-500/10 light:bg-emerald-50' : 'hover:bg-white/[0.04] light:hover:bg-gray-50'
                )}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(c.id)}
                  className="h-4 w-4 rounded border-gray-300 accent-emerald-600 cursor-pointer"
                />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium truncate">{name}</span>
                  <span className="block text-[11px] font-mono text-white/50 light:text-gray-500">{c.phone_number}</span>
                </span>
              </label>
            );
          })}
          {loading && (
            <div className="flex items-center justify-center py-6 text-xs text-white/50 light:text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
            </div>
          )}
          {!loading && items.length === 0 && (
            <p className="py-6 text-center text-xs text-white/50 light:text-gray-500">No contacts found.</p>
          )}
          {!loading && items.length < total && (
            <button
              type="button"
              onClick={() => load(search, page + 1)}
              className="w-full py-2 text-xs font-semibold text-emerald-400 light:text-emerald-700 hover:underline"
            >
              Load more ({total - items.length} more)
            </button>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={saving || picked.size === 0}
            onClick={confirm}
            className="bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            {confirmLabel} {picked.size > 0 ? picked.size : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
