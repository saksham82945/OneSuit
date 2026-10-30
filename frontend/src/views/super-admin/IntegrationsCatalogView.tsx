import React, { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { ErrorState } from '@/components/shared/ErrorState';
import { DeleteConfirmDialog } from '@/components/shared/DeleteConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Cable, ChevronDown, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  integrationCatalogService,
  LEAD_FIELD_LABELS,
  type IntegrationDefinition,
  type IntegrationDefinitionInput,
  type LeadField,
} from '@/services/integrations';
import { cardClass, fieldClass, LoadingBlock, errorMessage } from './shared';
import { cn } from '@/lib/utils';

const FIELDS = Object.keys(LEAD_FIELD_LABELS) as LeadField[];

type Form = {
  name: string;
  category: string;
  description: string;
  setup_steps: string;
  docs_url: string;
  color: string;
  is_enabled: boolean;
  /** One text box per field, paths separated by commas. */
  map: Record<LeadField, string>;
};

const toForm = (d?: IntegrationDefinition): Form => ({
  name: d?.name ?? '',
  category: d?.category ?? 'Lead sources',
  description: d?.description ?? '',
  setup_steps: d?.setup_steps ?? '',
  docs_url: d?.docs_url ?? '',
  color: d?.color || '#2e7d32',
  is_enabled: d?.is_enabled ?? true,
  map: Object.fromEntries(FIELDS.map((f) => [f, (d?.field_map?.[f] ?? []).join(', ')])) as Record<LeadField, string>,
});

const toInput = (f: Form): IntegrationDefinitionInput => ({
  name: f.name,
  category: f.category,
  description: f.description,
  setup_steps: f.setup_steps,
  docs_url: f.docs_url,
  color: f.color,
  is_enabled: f.is_enabled,
  field_map: Object.fromEntries(
    FIELDS.map((k) => [k, f.map[k].split(',').map((s) => s.trim()).filter(Boolean)])
  ) as IntegrationDefinitionInput['field_map'],
});

/** The editable fields of an integration (used in the panels and the Add dialog). */
const DefinitionFields: React.FC<{ form: Form; set: (f: Form) => void }> = ({ form, set }) => (
  <div className="grid gap-3">
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="grid gap-1.5 sm:col-span-2">
        <Label className="text-xs">Name *</Label>
        <Input value={form.name} onChange={(e) => set({ ...form, name: e.target.value })} className={fieldClass} />
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs">Category</Label>
        <Input value={form.category} onChange={(e) => set({ ...form, category: e.target.value })} className={fieldClass} />
      </div>
    </div>
    <div className="grid gap-1.5">
      <Label className="text-xs">Description (shown to clients)</Label>
      <Textarea rows={2} value={form.description} onChange={(e) => set({ ...form, description: e.target.value })} className={fieldClass} />
    </div>
    <div className="grid gap-1.5">
      <Label className="text-xs">Setup steps for clients (one per line)</Label>
      <Textarea rows={3} value={form.setup_steps} onChange={(e) => set({ ...form, setup_steps: e.target.value })} className={fieldClass} />
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="grid gap-1.5 sm:col-span-2">
        <Label className="text-xs">Help / website link</Label>
        <Input value={form.docs_url} placeholder="https://…" onChange={(e) => set({ ...form, docs_url: e.target.value })} className={fieldClass} />
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs">Color</Label>
        <div className="flex items-center gap-2">
          <input type="color" value={form.color} onChange={(e) => set({ ...form, color: e.target.value })} className="h-9 w-12 rounded border border-white/10 bg-transparent" />
          <Input value={form.color} onChange={(e) => set({ ...form, color: e.target.value })} className={fieldClass} />
        </div>
      </div>
    </div>
    <div className="rounded-lg border border-white/[0.08] light:border-gray-200 p-3 space-y-2">
      <p className="text-xs font-medium">Where each lead detail is in what the source sends</p>
      <p className="text-[11px] text-white/40 light:text-gray-500">
        Field names, with dots for nested ones (e.g. <code>RESPONSE.SENDER_NAME</code>). Separate options with commas; the first one found is used. Common names like name, phone, mobile and email always work.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f} className="grid gap-1">
            <Label className="text-[11px] text-white/60 light:text-gray-600">{LEAD_FIELD_LABELS[f]}</Label>
            <Input value={form.map[f]} onChange={(e) => set({ ...form, map: { ...form.map, [f]: e.target.value } })} className={cn(fieldClass, 'h-8 font-mono text-xs')} />
          </div>
        ))}
      </div>
    </div>
  </div>
);

const Panel: React.FC<{ def: IntegrationDefinition; onSaved: (d: IntegrationDefinition) => void; onDelete: () => void }> = ({ def, onSaved, onDelete }) => {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => toForm(def));
  const [saving, setSaving] = useState(false);
  useEffect(() => setForm(toForm(def)), [def]);

  const save = async (patch?: Partial<Form>) => {
    const next = { ...form, ...patch };
    setSaving(true);
    try {
      const updated = await integrationCatalogService.update(def.key, toInput(next));
      onSaved({ ...def, ...updated });
      toast.success(`${updated.name} saved`);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <fieldset className="rounded-xl border border-white/[0.08] light:border-gray-200">
      <legend className="ml-4 px-1">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 rounded-lg border border-white/[0.08] light:border-gray-200 bg-white/[0.02] light:bg-white px-3 py-2 text-left"
        >
          <span className="h-3 w-3 rounded-full shrink-0" style={{ background: def.color || '#2e7d32' }} />
          <span className="text-base text-sky-300 light:text-sky-700">{def.name}</span>
          {!def.is_enabled && <span className="text-xs font-medium text-rose-400">off</span>}
          <span className="text-xs text-white/40 light:text-gray-500">Click to expand/collapse</span>
          <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
        </button>
      </legend>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 pb-4 pt-1 text-xs text-white/50 light:text-gray-500">
        <span>{def.category}</span>
        <span>{def.connections ?? 0} clients connected</span>
        <span>{def.leads ?? 0} leads received</span>
        <label className="ml-auto flex items-center gap-2 text-white/70 light:text-gray-700">
          Available to clients
          <Switch checked={def.is_enabled} disabled={saving} onCheckedChange={(v) => save({ is_enabled: v })} />
        </label>
      </div>
      {open && (
        <div className="border-t border-white/[0.06] light:border-gray-200 p-5 space-y-4">
          <DefinitionFields form={form} set={setForm} />
          <div className="flex flex-wrap gap-2">
            <Button className="bg-emerald-600 hover:bg-emerald-500 text-white" disabled={saving} onClick={() => save()}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
            {!def.is_builtin && (
              <Button variant="outline" className="border-white/10 light:border-gray-200 hover:text-rose-400" onClick={onDelete}>
                <Trash2 className="h-4 w-4 mr-1.5" /> Delete
              </Button>
            )}
          </div>
        </div>
      )}
    </fieldset>
  );
};

/** Super admin: the lead integrations clients can connect (IndiaMART, JustDial, ...). */
export const IntegrationsCatalogView: React.FC = () => {
  const [defs, setDefs] = useState<IntegrationDefinition[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newForm, setNewForm] = useState(() => toForm());
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<IntegrationDefinition | null>(null);

  const load = () => {
    setError(null);
    integrationCatalogService.list().then(setDefs).catch((e) => setError(errorMessage(e)));
  };
  useEffect(load, []);

  const grouped = useMemo(() => {
    const g = new Map<string, IntegrationDefinition[]>();
    (defs ?? []).forEach((d) => g.set(d.category, [...(g.get(d.category) ?? []), d]));
    return [...g.entries()];
  }, [defs]);

  const replace = (d: IntegrationDefinition) => setDefs((list) => (list ?? []).map((x) => (x.key === d.key ? { ...x, ...d } : x)));

  const create = async () => {
    setCreating(true);
    try {
      const created = await integrationCatalogService.create(toInput(newForm));
      setDefs((list) => [...(list ?? []), { ...created, connections: 0, leads: 0 }]);
      setAdding(false);
      setNewForm(toForm());
      toast.success(`${created.name} added`);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not add the integration'));
    } finally {
      setCreating(false);
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    try {
      await integrationCatalogService.remove(toDelete.key);
      setDefs((list) => (list ?? []).filter((d) => d.key !== toDelete.key));
      toast.success('Integration deleted');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not delete'));
    } finally {
      setToDelete(null);
    }
  };

  return (
    <div className="flex flex-col min-h-full bg-[#0a0a0b] light:bg-gray-50">
      <PageHeader
        title="Setup & Integrations"
        subtitle="Lead sources your clients can connect: their leads arrive straight in their contacts"
        icon={Cable}
        iconGradient="bg-gradient-to-br from-orange-500 to-rose-500 shadow-orange-500/20"
        actions={
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4 mr-2" /> Add integration
          </Button>
        }
      />
      {error ? (
        <div className="p-6"><ErrorState title="Couldn't load integrations" description={error} onRetry={load} /></div>
      ) : !defs ? (
        <LoadingBlock />
      ) : (
        <div className="p-4 sm:p-6 max-w-5xl w-full">
          <div className={cn('rounded-xl border p-5 sm:p-7 space-y-8', cardClass)}>
            <div>
              <h2 className="text-2xl font-medium text-indigo-200 light:text-indigo-900">Setup & Integrations</h2>
              <p className="mt-1 text-xs text-white/50 light:text-gray-500">
                Each client gets a private lead URL for every integration they connect (Settings → Integrations). Turn an integration off to hide it from clients; add your own for any other source.
              </p>
            </div>
            {grouped.map(([category, list]) => (
              <div key={category} className="space-y-5">
                <p className="text-xs font-bold uppercase tracking-wider text-white/40 light:text-gray-500">{category}</p>
                {list.map((d) => (
                  <Panel key={d.key} def={d} onSaved={replace} onDelete={() => setToDelete(d)} />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="sm:max-w-[680px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add integration</DialogTitle>
            <DialogDescription>Any lead source that can send leads to a web link (webhook) can be added here.</DialogDescription>
          </DialogHeader>
          <DefinitionFields form={newForm} set={setNewForm} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-500 text-white" disabled={creating || !newForm.name.trim()} onClick={create}>
              {creating ? 'Adding…' : 'Add integration'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)} title="Delete integration" itemName={toDelete?.name} onConfirm={remove} />
    </div>
  );
};

export default IntegrationsCatalogView;
