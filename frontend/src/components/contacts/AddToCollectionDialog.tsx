import React, { useEffect, useMemo, useState } from 'react';
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
import { Check, FolderPlus, ListPlus, Loader2, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { apiErrorMessage, colorFor } from '@/services/groupsApi';
import { readData, readList } from '@/services/response';
import { adapterFor, type Collection, type CollectionKind } from './collections';

interface AddToCollectionDialogProps {
  kind: CollectionKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactIds: string[];
  onDone?: () => void;
}

/** Bulk "Add to group" / "Add to list" for selected contacts, with inline create. */
export const AddToCollectionDialog: React.FC<AddToCollectionDialogProps> = ({
  kind,
  open,
  onOpenChange,
  contactIds,
  onDone,
}) => {
  const adapter = adapterFor(kind);
  const [items, setItems] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFilter('');
    setSelectedId(null);
    setNewName('');
    setCreating(false);
    setLoading(true);
    adapter
      .list()
      .then((res) => {
        const list = readList<Collection>(res, adapter.listKey);
        setItems(list);
        if (list.length === 0) setCreating(true);
      })
      .catch((err) => toast.error(apiErrorMessage(err, `Failed to load ${adapter.noun}s`)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kind]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items;
  }, [items, filter]);

  const count = contactIds.length;
  const plural = `${count} contact${count === 1 ? '' : 's'}`;

  const submit = async () => {
    setSaving(true);
    try {
      let target: Collection | undefined = items.find((i) => i.id === selectedId);
      if (creating) {
        const name = newName.trim();
        if (!name) {
          toast.error(`Give the new ${adapter.noun} a name`);
          return;
        }
        target = readData<Collection>(await adapter.create({ name }));
      }
      if (!target) {
        toast.error(`Choose a ${adapter.noun}`);
        return;
      }
      const res = await adapter.addContacts(target.id, contactIds);
      const added = readData<{ added?: number }>(res)?.added ?? count;
      const already = count - added;
      toast.success(
        `Added ${added} to “${target.name}”` + (already > 0 ? ` · ${already} already in it` : '')
      );
      onDone?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(apiErrorMessage(err, `Failed to add to ${adapter.noun}`));
    } finally {
      setSaving(false);
    }
  };

  const Icon = kind === 'group' ? FolderPlus : ListPlus;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-emerald-500" />
            Add {plural} to a {adapter.noun}
          </DialogTitle>
          <DialogDescription>
            {kind === 'group'
              ? 'Contacts stay in any other groups they already belong to.'
              : 'Use this list later as the audience of a campaign.'}
          </DialogDescription>
        </DialogHeader>

        {!creating && (
          <div className="space-y-3">
            {items.length > 6 && (
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/40 light:text-gray-400" />
                <Input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder={`Find a ${adapter.noun}…`}
                  className="pl-8 h-8 text-xs"
                />
              </div>
            )}
            <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1" role="listbox" aria-label={adapter.title}>
              {loading ? (
                <div className="flex items-center justify-center py-8 text-xs text-white/50 light:text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
                </div>
              ) : visible.length === 0 ? (
                <p className="py-6 text-center text-xs text-white/50 light:text-gray-500">No {adapter.noun}s match.</p>
              ) : (
                visible.map((item) => {
                  const active = item.id === selectedId;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => setSelectedId(item.id)}
                      className={cn(
                        'w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
                        active
                          ? 'border-emerald-500/70 bg-emerald-500/10 light:bg-emerald-50'
                          : 'border-white/[0.08] hover:bg-white/[0.04] light:border-gray-200 light:hover:bg-gray-50'
                      )}
                    >
                      <span
                        className={cn(
                          'h-2.5 w-2.5 rounded-full shrink-0',
                          kind === 'group' ? colorFor(item.color).dot : 'bg-emerald-500'
                        )}
                      />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium truncate">{item.name}</span>
                        <span className="block text-[11px] text-white/50 light:text-gray-500">
                          {item.member_count} contact{item.member_count === 1 ? '' : 's'}
                        </span>
                      </span>
                      {active && <Check className="h-4 w-4 text-emerald-500 shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 light:text-emerald-700 hover:underline"
            >
              <Plus className="h-3.5 w-3.5" /> Create a new {adapter.noun}
            </button>
          </div>
        )}

        {creating && (
          <div className="space-y-2">
            <label htmlFor="new-collection-name" className="text-xs font-medium">
              New {adapter.noun} name
            </label>
            <Input
              id="new-collection-name"
              autoFocus
              maxLength={100}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder={kind === 'group' ? 'e.g. VIP customers' : 'e.g. Weekend sale'}
            />
            {items.length > 0 && (
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="text-xs text-white/60 light:text-gray-500 hover:underline"
              >
                Choose an existing {adapter.noun} instead
              </button>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={saving || (!creating && !selectedId) || (creating && !newName.trim())}
            onClick={submit}
            className="bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Add {plural}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
