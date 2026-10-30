import React, { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { ErrorState } from '@/components/shared/ErrorState';
import { DeleteConfirmDialog } from '@/components/shared/DeleteConfirmDialog';
import { IconButton } from '@/components/shared/IconButton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { CreditCard, Plus, Pencil, Trash2, Check, Tag } from 'lucide-react';
import { toast } from 'sonner';
import {
  superAdminService,
  formatPrice,
  formatLimit,
  BILLING_CYCLES,
  cycleInfo,
  cyclePrice,
  cycleDiscount,
  planMonthlyPrice,
  type Plan,
  type Vendor,
  type BillingInterval,
} from '@/services/superAdmin';
import { cardClass, fieldClass, LoadingBlock, errorMessage } from './shared';
import { cn } from '@/lib/utils';

// Number fields are kept as text while typing, so they can be cleared
// (a controlled number input that falls back to 0 can't be emptied).
const emptyPlan = {
  name: '',
  description: '',
  price: '',
  quarterly_discount: '',
  half_yearly_discount: '',
  yearly_discount: '',
  max_users: '-1',
  max_contacts: '-1',
  max_accounts: '-1',
  features: '',
  is_active: true,
};
type PlanForm = typeof emptyPlan;
type NumberField = Exclude<keyof PlanForm, 'name' | 'description' | 'features' | 'is_active'>;

const toNumber = (v: string) => {
  const n = Number(v);
  return Number.isFinite(n) && v.trim() !== '' ? n : 0;
};
const numberText = (n: number | undefined) => (n ? String(n) : '');
/** Limits: -1 means unlimited; an empty box is unlimited too. */
const toLimit = (v: string) => (v.trim() === '' || v.trim() === '-' ? -1 : Math.max(-1, Math.trunc(toNumber(v))));
const limitText = (n: number | undefined) => (n === undefined || n <= 0 ? '-1' : String(n));
const LIMIT_FIELDS: NumberField[] = ['max_users', 'max_contacts', 'max_accounts'];

/** The offer fields in the plan form, one per longer billing cycle. */
const OFFER_FIELDS: { key: NumberField; cycle: BillingInterval }[] = [
  { key: 'quarterly_discount', cycle: 'quarterly' },
  { key: 'half_yearly_discount', cycle: 'half_yearly' },
  { key: 'yearly_discount', cycle: 'yearly' },
];

/** Plan as the form currently describes it, for live price previews. */
const formAsPlan = (f: PlanForm) => ({
  price: toNumber(f.price),
  interval: 'monthly' as const,
  quarterly_discount: toNumber(f.quarterly_discount),
  half_yearly_discount: toNumber(f.half_yearly_discount),
  yearly_discount: toNumber(f.yearly_discount),
});

export const SubscriptionsView: React.FC = () => {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [clients, setClients] = useState<Vendor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cycle, setCycle] = useState<BillingInterval>('monthly');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [form, setForm] = useState<PlanForm>(emptyPlan);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<Plan | null>(null);

  const load = () => {
    setError(null);
    Promise.all([superAdminService.listPlans(), superAdminService.listVendors()])
      .then(([p, v]) => {
        setPlans(p);
        setClients(v);
      })
      .catch((e) => setError(errorMessage(e)));
  };
  useEffect(load, []);

  const clientCount = (planId: string) => clients.filter((v) => v.plan_id === planId).length;

  /** Biggest offer any plan gives for each cycle, for the "Save up to" badges. */
  const bestOffer = useMemo(() => {
    const best: Record<BillingInterval, number> = { monthly: 0, quarterly: 0, half_yearly: 0, yearly: 0 };
    (plans ?? []).forEach((p) => BILLING_CYCLES.forEach((c) => (best[c.id] = Math.max(best[c.id], cycleDiscount(p, c.id)))));
    return best;
  }, [plans]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyPlan);
    setDialogOpen(true);
  };

  const openEdit = (p: Plan) => {
    setEditing(p);
    setForm({
      name: p.name,
      description: p.description ?? '',
      price: numberText(Math.round(planMonthlyPrice(p))),
      quarterly_discount: numberText(p.quarterly_discount),
      half_yearly_discount: numberText(p.half_yearly_discount),
      yearly_discount: numberText(p.yearly_discount),
      max_users: limitText(p.max_users),
      max_contacts: limitText(p.max_contacts),
      max_accounts: limitText(p.max_accounts),
      features: p.features.join('\n'),
      is_active: p.is_active,
    });
    setDialogOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const payload: Partial<Plan> = {
      name: form.name,
      description: form.description,
      price: toNumber(form.price), // per month
      currency: 'INR',
      interval: 'monthly',
      quarterly_discount: toNumber(form.quarterly_discount),
      half_yearly_discount: toNumber(form.half_yearly_discount),
      yearly_discount: toNumber(form.yearly_discount),
      max_users: toLimit(form.max_users),
      max_contacts: toLimit(form.max_contacts),
      max_accounts: toLimit(form.max_accounts),
      features: form.features.split('\n').map((f) => f.trim()).filter(Boolean),
      is_active: form.is_active,
    };
    try {
      if (editing) {
        const updated = await superAdminService.updatePlan(editing.id, payload);
        setPlans((list) => (list ?? []).map((p) => (p.id === updated.id ? updated : p)));
        toast.success('Plan updated');
      } else {
        const created = await superAdminService.createPlan(payload);
        setPlans((list) => [...(list ?? []), created]);
        toast.success('Plan created');
      }
      setDialogOpen(false);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save plan'));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (p: Plan) => {
    try {
      const updated = await superAdminService.updatePlan(p.id, { is_active: !p.is_active });
      setPlans((list) => (list ?? []).map((x) => (x.id === updated.id ? updated : x)));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await superAdminService.deletePlan(toDelete.id);
      setPlans((list) => (list ?? []).filter((p) => p.id !== toDelete.id));
      toast.success('Plan deleted');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not delete plan'));
    } finally {
      setToDelete(null);
    }
  };

  const setNumber = (k: NumberField) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    const ok = LIMIT_FIELDS.includes(k) ? /^-?\d*$/.test(v) : /^\d*\.?\d{0,2}$/.test(v);
    if (v === '' || ok) setForm({ ...form, [k]: v });
  };

  const preview = formAsPlan(form);

  return (
    <div className="flex flex-col min-h-full bg-[#0a0a0b] light:bg-gray-50">
      <PageHeader
        title="Subscription Plans"
        subtitle="Plans clients can subscribe to, with offers for longer billing cycles. Prices in ₹ INR."
        icon={CreditCard}
        iconGradient="bg-gradient-to-br from-violet-500 to-indigo-600 shadow-violet-500/20"
        actions={
          <Button size="sm" className="bg-violet-600 hover:bg-violet-500 text-white" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" /> New plan
          </Button>
        }
      />

      {error ? (
        <div className="p-6"><ErrorState title="Couldn't load plans" description={error} onRetry={load} /></div>
      ) : !plans ? (
        <LoadingBlock />
      ) : plans.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center p-12">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.04] text-white/40 light:bg-gray-50 light:text-gray-400">
            <CreditCard className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium text-white light:text-gray-900">No plans yet</p>
          <p className="text-xs text-white/50 light:text-gray-500 mt-1 max-w-sm">
            Create the plans clients can subscribe to, with a monthly price, limits and offers.
          </p>
          <Button size="sm" className="mt-4 bg-violet-600 hover:bg-violet-500 text-white" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" /> New plan
          </Button>
        </div>
      ) : (
        <div className="p-4 sm:p-6 space-y-6">
          {/* Billing cycle switcher, like the landing page */}
          <div className="flex justify-center">
            <div className="inline-flex flex-wrap justify-center gap-1 rounded-2xl sm:rounded-full border border-white/10 bg-white/[0.03] p-1 light:border-gray-200 light:bg-white light:shadow-sm">
              {BILLING_CYCLES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCycle(c.id)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-colors',
                    cycle === c.id
                      ? 'bg-[#27c462] text-white shadow-sm'
                      : 'text-white/60 hover:text-white light:text-gray-600 light:hover:text-gray-900'
                  )}
                >
                  {c.label}
                  {bestOffer[c.id] > 0 && (
                    <span className="rounded-full bg-[#ffd600] px-1.5 py-0.5 text-[10px] font-bold uppercase text-gray-900">
                      Save {bestOffer[c.id]}%
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
            {plans.map((p) => {
              const price = cyclePrice(p, cycle);
              const info = cycleInfo(cycle);
              return (
                <div key={p.id} className={cn('rounded-xl border p-5 flex flex-col', cardClass, !p.is_active && 'opacity-60')}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold truncate">{p.name}</h3>
                        {!p.is_active && <Badge variant="outline" className="text-[10px] border-white/10 light:border-gray-200">Inactive</Badge>}
                      </div>
                      {p.description && <p className="text-xs text-white/50 light:text-gray-500 mt-0.5">{p.description}</p>}
                    </div>
                    <div className="flex shrink-0">
                      <IconButton icon={Pencil} label="Edit plan" onClick={() => openEdit(p)} />
                      <IconButton icon={Trash2} label="Delete plan" className="hover:text-rose-400" onClick={() => setToDelete(p)} />
                    </div>
                  </div>

                  <div className="mt-4">
                    {price.discount > 0 && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-white/40 line-through light:text-gray-400 tabular-nums">{formatPrice(price.full)}</span>
                        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-400 light:bg-emerald-50 light:text-emerald-700">
                          {price.discount}% OFF
                        </span>
                      </div>
                    )}
                    <p className="text-3xl font-semibold tabular-nums">
                      {formatPrice(price.total)}
                      <span className="text-sm font-normal text-white/40 light:text-gray-400"> /{info.short}</span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-white/40 light:text-gray-500">
                      {cycle === 'monthly' ? 'Billed every month' : `${formatPrice(price.perMonth)}/month`}
                      {price.saving > 0 && <span className="text-emerald-500"> · You save {formatPrice(price.saving)}</span>}
                    </p>
                  </div>

                  {/* Every cycle at a glance */}
                  <div className="mt-4 grid grid-cols-4 gap-1 rounded-lg bg-white/[0.03] p-1 light:bg-gray-50">
                    {BILLING_CYCLES.map((c) => {
                      const cp = cyclePrice(p, c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setCycle(c.id)}
                          className={cn(
                            'rounded-md px-1 py-1.5 text-center transition-colors',
                            cycle === c.id ? 'bg-white/[0.08] light:bg-white light:shadow-sm' : 'hover:bg-white/[0.04] light:hover:bg-white/70'
                          )}
                        >
                          <span className="block text-[9px] uppercase tracking-wide text-white/40 light:text-gray-400">{c.label}</span>
                          <span className="block text-[11px] font-medium tabular-nums">{formatPrice(cp.total)}</span>
                          <span className={cn('block text-[9px] font-semibold', cp.discount > 0 ? 'text-emerald-500' : 'text-transparent')}>
                            {cp.discount > 0 ? `-${cp.discount}%` : '·'}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                    {[
                      ['Users', p.max_users],
                      ['Contacts', p.max_contacts],
                      ['Numbers', p.max_accounts],
                    ].map(([label, n]) => (
                      <div key={label as string} className="rounded-lg bg-white/[0.03] light:bg-gray-50 py-2">
                        <dt className="text-[10px] uppercase tracking-wide text-white/40 light:text-gray-400">{label}</dt>
                        <dd className="text-xs font-medium mt-0.5">{formatLimit(n as number)}</dd>
                      </div>
                    ))}
                  </dl>

                  <ul className="mt-4 space-y-1.5 flex-1">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-xs text-white/70 light:text-gray-600">
                        <Check className="h-3.5 w-3.5 text-violet-400 mt-0.5 shrink-0" /> {f}
                      </li>
                    ))}
                  </ul>

                  <div className="mt-5 pt-4 border-t border-white/[0.06] light:border-gray-200 flex items-center justify-between">
                    <span className="text-xs text-white/50 light:text-gray-500">{clientCount(p.id)} clients subscribed</span>
                    <label className="flex items-center gap-2 text-xs text-white/60 light:text-gray-600">
                      Available
                      <Switch checked={p.is_active} onCheckedChange={() => toggleActive(p)} aria-label={`Toggle ${p.name}`} />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleSave}>
            <DialogHeader>
              <DialogTitle>{editing ? `Edit ${editing.name}` : 'New plan'}</DialogTitle>
              <DialogDescription>
                Set the monthly price in ₹, the offer for each longer billing cycle and the limits. Type -1 in a limit for unlimited.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-4">
              <div className="grid gap-1.5">
                <Label className="text-xs">Plan name *</Label>
                <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={fieldClass} />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Description</Label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={fieldClass} />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Monthly price (₹ INR) *</Label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-white/40 light:text-gray-400">₹</span>
                  <Input
                    required
                    inputMode="decimal"
                    placeholder="999"
                    value={form.price}
                    onChange={setNumber('price')}
                    className={cn(fieldClass, 'pl-7')}
                  />
                </div>
              </div>

              <div className="grid gap-2 rounded-lg border border-white/10 p-3 light:border-gray-200">
                <div className="flex items-center gap-1.5 text-xs font-medium">
                  <Tag className="h-3.5 w-3.5 text-emerald-500" /> Offers for longer billing cycles (% off)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {OFFER_FIELDS.map(({ key, cycle: c }) => {
                    const cp = cyclePrice(preview, c);
                    return (
                      <div key={key} className="grid gap-1">
                        <Label className="text-[11px]">{cycleInfo(c).label}</Label>
                        <div className="relative">
                          <Input
                            inputMode="decimal"
                            placeholder="0"
                            value={form[key]}
                            onChange={setNumber(key)}
                            className={cn(fieldClass, 'pr-7')}
                          />
                          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/40 light:text-gray-400">%</span>
                        </div>
                        <p className="text-[11px] tabular-nums text-white/50 light:text-gray-500">
                          {formatPrice(cp.total)} / {cycleInfo(c).short}
                          {cp.saving > 0 && <span className="text-emerald-500"> · save {formatPrice(cp.saving)}</span>}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {(
                  [
                    ['max_users', 'Max users'],
                    ['max_contacts', 'Max contacts'],
                    ['max_accounts', 'Max numbers'],
                  ] as [NumberField, string][]
                ).map(([key, label]) => (
                  <div key={key} className="grid gap-1.5">
                    <Label className="text-xs">{label}</Label>
                    <Input inputMode="numeric" placeholder="-1 = unlimited" value={form[key]} onChange={setNumber(key)} className={fieldClass} />
                    <p className="text-[10px] text-white/40 light:text-gray-500">
                      {toLimit(form[key]) === -1 ? 'Unlimited' : `Up to ${toLimit(form[key]).toLocaleString()}`}
                    </p>
                  </div>
                ))}
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Features (one per line)</Label>
                <Textarea rows={4} value={form.features} onChange={(e) => setForm({ ...form, features: e.target.value })} className={fieldClass} />
              </div>
              <label className="flex items-center justify-between text-xs">
                Available for new subscriptions
                <Switch checked={form.is_active} onCheckedChange={(is_active) => setForm({ ...form, is_active })} />
              </label>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving} className="bg-violet-600 hover:bg-violet-500 text-white">
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Create plan'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Delete plan"
        itemName={toDelete?.name}
        onConfirm={handleDelete}
      />
    </div>
  );
};

export default SubscriptionsView;
