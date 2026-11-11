import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { Layers, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  catalogService,
  describeActionError,
  handleUpgradeError,
  readSets,
  type ActionErrorInfo,
  type CatalogProduct,
  type ProductSet,
} from './catalogApi';
import { ActionErrorBox } from './CatalogNotices';

export interface ProductSetsPanelProps {
  catalogId: string;
  products: CatalogProduct[];
  /** Returns false (and shows why) when changes aren't allowed right now. */
  canWrite: () => boolean;
}

/** Product sets ("collections") live only in Meta; this lists, creates and deletes them. */
export const ProductSetsPanel: React.FC<ProductSetsPanelProps> = ({ catalogId, products, canWrite }) => {
  const [sets, setSets] = useState<ProductSet[] | null>(null);
  const [loadError, setLoadError] = useState<ActionErrorInfo | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<ActionErrorInfo | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    setSets(null);
    try {
      setSets(readSets(await catalogService.listSets(catalogId)));
    } catch (err) {
      setSets([]);
      setLoadError(describeActionError(err, 'Couldn’t load collections from Meta'));
    }
  }, [catalogId]);

  useEffect(() => {
    void load();
  }, [load]);

  const inMeta = useMemo(() => products.filter((p) => p.meta_product_id && p.retailer_id), [products]);
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? inMeta.filter((p) => p.name.toLowerCase().includes(q) || p.retailer_id.toLowerCase().includes(q)) : inMeta;
  }, [inMeta, filter]);

  const openCreate = () => {
    if (!canWrite()) return;
    setName('');
    setPicked(new Set());
    setFilter('');
    setSaveError(null);
    setCreateOpen(true);
  };

  const save = async () => {
    if (!name.trim()) {
      setSaveError({ message: 'Name the collection.' });
      return;
    }
    if (picked.size === 0) {
      setSaveError({ message: 'Choose at least one product.' });
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await catalogService.createSet(catalogId, { name: name.trim(), retailer_ids: Array.from(picked) });
      toast.success(`Collection “${name.trim()}” created`);
      setCreateOpen(false);
      void load();
    } catch (err) {
      if (handleUpgradeError(err)) setSaveError({ message: 'Upgrade your plan to create collections.' });
      else setSaveError(describeActionError(err, 'Failed to create product set'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (s: ProductSet) => {
    if (!canWrite()) return;
    if (!window.confirm(`Delete the collection “${s.name}” in Meta? Its products stay in the catalogue.`)) return;
    setDeleting(s.id);
    try {
      await catalogService.deleteSet(catalogId, s.id);
      toast.success(`Collection “${s.name}” deleted`);
      setSets((list) => (list ?? []).filter((x) => x.id !== s.id));
    } catch (err) {
      if (!handleUpgradeError(err)) {
        const info = describeActionError(err, 'Failed to delete product set');
        toast.error(info.message, { description: info.hint });
      }
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-white/50 light:text-gray-500 max-w-xl">
          Collections group products (e.g. “Summer sale”) for multi-product messages and your WhatsApp shop.
        </p>
        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" /> New collection
        </Button>
      </div>

      {sets === null ? (
        <div className="flex items-center gap-2 py-6 text-xs text-white/50 light:text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading collections…
        </div>
      ) : loadError ? (
        <div className="space-y-2">
          <ActionErrorBox error={loadError} />
          <Button size="sm" variant="outline" className="border-white/10 light:border-gray-200" onClick={load}>
            Retry
          </Button>
        </div>
      ) : sets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/[0.12] px-4 py-8 text-center text-xs text-white/50 light:border-gray-300 light:text-gray-500">
          <Layers className="mx-auto mb-2 h-6 w-6 opacity-60" />
          No collections yet.
        </div>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {sets.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-3 rounded-lg border border-white/[0.08] bg-[#141415] px-3 py-2 light:border-gray-200 light:bg-white"
            >
              <Layers className="h-4 w-4 shrink-0 text-teal-400 light:text-teal-600" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white light:text-gray-900">{s.name}</p>
                <p className="text-[11px] text-white/40 light:text-gray-500">
                  {s.product_count} product{s.product_count === 1 ? '' : 's'} · ID {s.id}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Delete ${s.name}`}
                disabled={deleting === s.id}
                onClick={() => remove(s)}
                className="text-white/50 hover:text-red-400 light:text-gray-500"
              >
                {deleting === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={createOpen} onOpenChange={(o) => !saving && setCreateOpen(o)}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>New collection</DialogTitle>
            <DialogDescription>Pick products that are already in Meta (synced).</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="set-name" className="text-xs">Name *</Label>
              <Input
                id="set-name"
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Festive offers"
                className="bg-white/[0.04] border-white/[0.08] text-white light:bg-white light:border-gray-200 light:text-gray-900"
              />
            </div>
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter products…"
              className="h-8 text-xs bg-white/[0.04] border-white/[0.08] text-white light:bg-white light:border-gray-200 light:text-gray-900"
            />
            <div className="max-h-60 overflow-y-auto rounded-lg border border-white/[0.08] light:border-gray-200">
              {shown.length === 0 ? (
                <p className="p-4 text-center text-xs text-white/50 light:text-gray-500">No synced products to choose.</p>
              ) : (
                shown.map((p) => (
                  <label key={p.id} className="flex cursor-pointer items-center gap-2 border-b border-white/[0.05] px-3 py-2 last:border-0 light:border-gray-100">
                    <input
                      type="checkbox"
                      className="accent-emerald-600"
                      checked={picked.has(p.retailer_id)}
                      onChange={(e) =>
                        setPicked((cur) => {
                          const next = new Set(cur);
                          if (e.target.checked) next.add(p.retailer_id);
                          else next.delete(p.retailer_id);
                          return next;
                        })
                      }
                    />
                    <span className="min-w-0 flex-1 truncate text-xs text-white light:text-gray-900">{p.name}</span>
                    <span className="font-mono text-[10px] text-white/40 light:text-gray-500">{p.retailer_id}</span>
                  </label>
                ))
              )}
            </div>
            <p className="text-[11px] text-white/40 light:text-gray-500">{picked.size} selected</p>
            <ActionErrorBox error={saveError} />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" disabled={saving} onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button disabled={saving} onClick={save} className="bg-emerald-600 hover:bg-emerald-500 text-white">
              {saving ? 'Creating…' : 'Create collection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
