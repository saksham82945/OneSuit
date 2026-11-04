import React, { useEffect, useState } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { GROUP_COLORS, apiErrorMessage, colorFor } from '@/services/groupsApi';
import { readData } from '@/services/response';
import { adapterFor, type Collection, type CollectionKind } from './collections';

interface CollectionFormDialogProps {
  kind: CollectionKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the dialog edits this group/list; otherwise it creates one. */
  editing?: Collection | null;
  onSaved: (saved: Collection) => void;
}

/** Create or edit a contact group / broadcast list. */
export const CollectionFormDialog: React.FC<CollectionFormDialogProps> = ({
  kind,
  open,
  onOpenChange,
  editing,
  onSaved,
}) => {
  const adapter = adapterFor(kind);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState<string>('teal');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(editing?.name || '');
    setDescription(editing?.description || '');
    setColor(editing?.color || 'teal');
  }, [open, editing]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error(`Give the ${adapter.noun} a name`);
      return;
    }
    setSaving(true);
    try {
      const body = { name: trimmed, description: description.trim(), ...(kind === 'group' ? { color } : {}) };
      const res = editing ? await adapter.update(editing.id, body) : await adapter.create(body);
      const saved = readData<Collection>(res);
      toast.success(editing ? `${capitalize(adapter.noun)} updated` : `${capitalize(adapter.noun)} “${saved.name}” created`);
      onSaved(saved);
      onOpenChange(false);
    } catch (err) {
      toast.error(apiErrorMessage(err, `Failed to save ${adapter.noun}`));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>
              {editing ? `Edit ${adapter.noun}` : kind === 'group' ? 'New contact group' : 'New broadcast list'}
            </DialogTitle>
            <DialogDescription>
              {kind === 'group'
                ? 'Groups organise your contacts. A contact can belong to many groups.'
                : 'Lists are saved audiences you can pick when sending a campaign.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-1.5">
            <Label htmlFor="collection-name" className="text-xs">Name *</Label>
            <Input
              id="collection-name"
              autoFocus
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={kind === 'group' ? 'e.g. VIP customers' : 'e.g. Diwali offer – Mumbai'}
            />
          </div>

          {kind === 'group' && (
            <div className="grid gap-1.5">
              <Label className="text-xs">Colour</Label>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Group colour">
                {GROUP_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={color === c}
                    aria-label={c}
                    title={c}
                    onClick={() => setColor(c)}
                    className={cn(
                      'h-7 w-7 rounded-full flex items-center justify-center ring-offset-2 ring-offset-[#141415] light:ring-offset-white transition-all',
                      colorFor(c).dot,
                      color === c ? 'ring-2 ring-emerald-500 scale-105' : 'opacity-80 hover:opacity-100'
                    )}
                  >
                    {color === c && <Check className="h-3.5 w-3.5 text-white" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="collection-desc" className="text-xs">Description</Label>
            <Textarea
              id="collection-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional – what is this for?"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving} className="bg-emerald-600 hover:bg-emerald-500 text-white">
              {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              {editing ? 'Save changes' : `Create ${adapter.noun}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
