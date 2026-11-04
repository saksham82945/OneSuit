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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CreditCard, Plus, Pencil, Trash2, Check, Tag, Gauge, Boxes, Sparkles, X, Users, Layers, Copy } from 'lucide-react';
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
  type PlanCustomFeature,
  type PlanModuleInfo,
  type Vendor,
  type BillingInterval,
} from '@/services/superAdmin';
import { cardClass, fieldClass, LoadingBlock, errorMessage } from './shared';
import { cn } from '@/lib/utils';

// Subscription plans: price, offers, limits, which sections (modules) the
// plan includes and its own switchable feature lines.

type LimitKey = 'max_users' | 'max_contacts' | 'max_accounts';
type OfferKey = 'quarterly_discount' | 'half_yearly_discount' | 'yearly_discount';

const LIMITS: { key: LimitKey; label: string; hint: string }[] = [
  { key: 'max_users', label: 'Team members', hint: 'Users who can sign in to the workspace' },
  { key: 'max_contacts', label: 'Contacts', hint: 'Contacts the workspace can store' },
  { key: 'max_accounts', label: 'WhatsApp numbers', hint: 'Numbers the workspace can connect' },
];

const OFFERS: { key: OfferKey; cycle: BillingInterval }[] = [
  { key: 'quarterly_discount', cycle: 'quarterly' },
  { key: 'half_yearly_discount', cycle: 'half_yearly' },
  { key: 'yearly_discount', cycle: 'yearly' },
];

const FEATURE_SUGGESTIONS = ['Webhook', 'API integration', 'AI integration', 'Priority support', 'Dedicated account manager', 'Custom branding'];

interface LimitState {
  on: boolean;
  value: string;
}
interface PlanForm {
  name: string;
  description: string;
  price: string;
  is_active: boolean;
  limits: Record<LimitKey, LimitState>;
  offers: Record<OfferKey, LimitState>;
  modules: Record<string, boolean>;
  features: PlanCustomFeature[];
}

const emptyForm = (modules: PlanModuleInfo[]): PlanForm => ({
  name: '',
  description: '',
  price: '',
  is_active: true,
  limits: { max_users: { on: false, value: '' }, max_contacts: { on: false, value: '' }, max_accounts: { on: false, value: '' } },
  offers: {
    quarterly_discount: { on: false, value: '' },
    half_yearly_discount: { on: false, value: '' },
    yearly_discount: { on: false, value: '' },
  },
  modules: Object.fromEntries(modules.map((m) => [m.key, true])),
  features: [],
});

const toNumber = (v: string) => {
  const n = Number(v);
  return Number.isFinite(n) && v.trim() !== '' ? n : 0;
};

/** The plan's feature lines; older plans only have the plain features list. */
const planFeatures = (p: Plan): PlanCustomFeature[] =>
  p.custom_features && p.custom_features.length > 0 ? p.custom_features : p.features.map((name) => ({ name, enabled: true }));

const moduleOn = (p: Plan, key: string) => p.modules?.[key] !== false;

const formAsPlan = (f: PlanForm) => ({
  price: toNumber(f.price),
  interval: 'monthly' as const,
  quarterly_discount: f.offers.quarterly_discount.on ? toNumber(f.offers.quarterly_discount.value) : 0,
  half_yearly_discount: f.offers.half_yearly_discount.on ? toNumber(f.offers.half_yearly_discount.value) : 0,
  yearly_discount: f.offers.yearly_discount.on ? toNumber(f.offers.yearly_discount.value) : 0,
});

const SectionTitle: React.FC<{ icon: React.ElementType; title: string; hint?: string }> = ({ icon: Icon, title, hint }) => (
  <div className="mb-2">
    <div className="flex items-center gap-1.5 text-xs font-semibold">
      <Icon className="h-3.5 w-3.5 text-violet-400 light:text-violet-600" /> {title}
    </div>
    {hint && <p className="mt-0.5 text-[11px] text-white/50 light:text-gray-500">{hint}</p>}
  </div>
);

export const SubscriptionsView: React.FC = () => {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [modules, setModules] = useState<PlanModuleInfo[]>([]);
  const [clients, setClients] = useState<Vendor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cycle, setCycle] = useState<BillingInterval>('monthly');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [form, setForm] = useState<PlanForm>(emptyForm([]));
  const [newFeature, setNewFeature] = useState('');
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<Plan | null>(null);

  const load = () => {
    setError(null);
    Promise.all([superAdminService.listPlans(), superAdminService.listVendors(), superAdminService.listPlanModules().catch(() => [])])
      .then(([p, v, m]) => {
        setPlans(p);
        setClients(v);
        setModules(m);
      })
      .catch((e) => setError(errorMessage(e)));
  };
  useEffect(load, []);

  const clientCount = (planId: string) => clients.filter((v) => v.plan_id === planId).length;

  const bestOffer = useMemo(() => {
    const best: Record<BillingInterval, number> = { monthly: 0, quarterly: 0, half_yearly: 0, yearly: 0 };
    (plans ?? []).forEach((p) => BILLING_CYCLES.forEach((c) => (best[c.id] = Math.max(best[c.id], cycleDiscount(p, c.id)))));
    return best;
  }, [plans]);

  const stats = useMemo(() => {
    const list = plans ?? [];
    const subscribed = clients.filter((c) => c.plan_id && list.some((p) => p.id === c.plan_id)).length;
    const mrr = clients.reduce((sum, c) => {
      const p = list.find((x) => x.id === c.plan_id);
      return p && c.status === 'active' ? sum + planMonthlyPrice(p) : sum;
    }, 0);
    return { total: list.length, available: list.filter((p) => p.is_active).length, subscribed, mrr };
  }, [plans, clients]);

  // --- editor ---
  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm(modules));
    setNewFeature('');
    setDialogOpen(true);
  };

  const openEdit = (p: Plan, copy = false) => {
    setEditing(copy ? null : p);
    const lim = (n: number): LimitState => (n > 0 ? { on: true, value: String(n) } : { on: false, value: '' });
    const off = (n?: number): LimitState => (n && n > 0 ? { on: true, value: String(n) } : { on: false, value: '' });
    setForm({
      name: copy ? `${p.name} (copy)` : p.name,
      description: p.description ?? '',
      price: String(Math.round(planMonthlyPrice(p)) || ''),
      is_active: p.is_active,
      limits: { max_users: lim(p.max_users), max_contacts: lim(p.max_contacts), max_accounts: lim(p.max_accounts) },
      offers: {
        quarterly_discount: off(p.quarterly_discount),
        half_yearly_discount: off(p.half_yearly_discount),
        yearly_discount: off(p.yearly_discount),
      },
      modules: Object.fromEntries(modules.map((m) => [m.key, moduleOn(p, m.key)])),
      features: planFeatures(p).map((f) => ({ ...f })),
    });
    setNewFeature('');
    setDialogOpen(true);
  };

  const addFeature = (name: string) => {
    const n = name.trim();
    if (!n) return;
    if (form.features.some((f) => f.name.toLowerCase() === n.toLowerCase())) {
      toast.info(`"${n}" is already on this plan`);
      return;
    }
    setForm({ ...form, features: [...form.features, { name: n, enabled: true }] });
    setNewFeature('');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    for (const l of LIMITS) {
      const st = form.limits[l.key];
      if (st.on && !(toNumber(st.value) >= 1)) {
        toast.error(`Enter a ${l.label.toLowerCase()} limit of at least 1, or switch the limit off for unlimited`);
        return;
      }
    }
    for (const o of OFFERS) {
      const st = form.offers[o.key];
      if (st.on && !(toNumber(st.value) > 0 && toNumber(st.value) <= 90)) {
        toast.error(`The ${cycleInfo(o.cycle).label.toLowerCase()} offer must be between 1% and 90%`);
        return;
      }
    }
    setSaving(true);
    const limit = (k: LimitKey) => (form.limits[k].on ? Math.trunc(toNumber(form.limits[k].value)) : -1);
    const offer = (k: OfferKey) => (form.offers[k].on ? toNumber(form.offers[k].value) : 0);
    const payload: Partial<Plan> = {
      name: form.name.trim(),
      description: form.description.trim(),
      price: toNumber(form.price),
      currency: 'INR',
      interval: 'monthly',
      quarterly_discount: offer('quarterly_discount'),
      half_yearly_discount: offer('half_yearly_discount'),
      yearly_discount: offer('yearly_discount'),
      max_users: limit('max_users'),
      max_contacts: limit('max_contacts'),
      max_accounts: limit('max_accounts'),
      modules: form.modules,
      custom_features: form.features.filter((f) => f.name.trim()),
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

  // --- quick switches on the cards ---
  const patchPlan = async (p: Plan, data: Partial<Plan>, done?: string) => {
    try {
      const updated = await superAdminService.updatePlan(p.id, data);
      setPlans((list) => (list ?? []).map((x) => (x.id === updated.id ? updated : x)));
      if (done) toast.success(done);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  const toggleModule = (p: Plan, m: PlanModuleInfo) => {
    const next = { ...Object.fromEntries(modules.map((x) => [x.key, moduleOn(p, x.key)])), [m.key]: !moduleOn(p, m.key) };
    void patchPlan(p, { modules: next }, `${m.label} ${next[m.key] ? 'included in' : 'hidden from'} ${p.name}`);
  };
  const toggleFeature = (p: Plan, i: number) => {
    const list = planFeatures(p).map((f, j) => (j === i ? { ...f, enabled: !f.enabled } : f));
    void patchPlan(p, { custom_features: list });
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

  const setLimit = (k: LimitKey, patch: Partial<LimitState>) => setForm({ ...form, limits: { ...form.limits, [k]: { ...form.limits[k], ...patch } } });
  const setOffer = (k: OfferKey, patch: Partial<LimitState>) => setForm({ ...form, offers: { ...form.offers, [k]: { ...form.offers[k], ...patch } } });
  const digits = (v: string, decimals = false) => v === '' || (decimals ? /^\d*\.?\d{0,2}$/ : /^\d*$/).test(v);

  const preview = formAsPlan(form);

  return (
    <div className="flex flex-col min-h-full bg-[#0a0a0b] light:bg-gray-50">
      <PageHeader
        title="Subscription Plans"
        subtitle="Prices, offers, limits, included sections and features for each plan. Prices in ₹ INR."
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
      ) : (
        <div className="p-4 sm:p-6 space-y-6">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: 'Plans', value: String(stats.total), icon: Layers },
              { label: 'Available for sign-up', value: String(stats.available), icon: Check },
              { label: 'Clients on a plan', value: String(stats.subscribed), icon: Users },
              { label: 'Monthly revenue (active)', value: formatPrice(stats.mrr), icon: CreditCard },
            ].map((s) => (
              <div key={s.label} className={cn('rounded-xl border p-4', cardClass)}>
                <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-white/50 light:text-gray-500">
                  {s.label}
                  <s.icon className="h-4 w-4 text-violet-400" />
                </div>
                <p className="mt-1 text-xl font-semibold tabular-nums">{s.value}</p>
              </div>
            ))}
          </div>

          {plans.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center p-12">
              <p className="text-sm font-medium text-white light:text-gray-900">No plans yet</p>
              <p className="text-xs text-white/50 light:text-gray-500 mt-1 max-w-sm">Create the plans clients can subscribe to.</p>
              <Button size="sm" className="mt-4 bg-violet-600 hover:bg-violet-500 text-white" onClick={openCreate}>
                <Plus className="h-4 w-4 mr-2" /> New plan
              </Button>
            </div>
          ) : (
            <>
              <div className="flex justify-center">
                <div className="inline-flex flex-wrap justify-center gap-1 rounded-2xl sm:rounded-full border border-white/10 bg-white/[0.03] p-1 light:border-gray-200 light:bg-white light:shadow-sm">
                  {BILLING_CYCLES.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCycle(c.id)}
                      className={cn(
                        'flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-colors',
                        cycle === c.id ? 'bg-[#27c462] text-white shadow-sm' : 'text-white/60 hover:text-white light:text-gray-600 light:hover:text-gray-900'
                      )}
                    >
                      {c.label}
                      {bestOffer[c.id] > 0 && (
                        <span className="rounded-full bg-[#ffd600] px-1.5 py-0.5 text-[10px] font-bold uppercase text-gray-900">Save {bestOffer[c.id]}%</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                {plans.map((p) => {
                  const price = cyclePrice(p, cycle);
                  const info = cycleInfo(cycle);
                  const feats = planFeatures(p);
                  return (
                    <div key={p.id} className={cn('rounded-xl border p-5 flex flex-col', cardClass, !p.is_active && 'opacity-70')}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold truncate">{p.name}</h3>
                            {!p.is_active && <Badge variant="outline" className="text-[10px] border-white/10 light:border-gray-200">Hidden</Badge>}
                          </div>
                          {p.description && <p className="text-xs text-white/50 light:text-gray-500 mt-0.5">{p.description}</p>}
                        </div>
                        <div className="flex shrink-0">
                          <IconButton icon={Copy} label="Duplicate plan" onClick={() => openEdit(p, true)} />
                          <IconButton icon={Pencil} label="Edit plan" onClick={() => openEdit(p)} />
                          <IconButton icon={Trash2} label="Delete plan" className="hover:text-rose-400" onClick={() => setToDelete(p)} />
                        </div>
                      </div>

                      <div className="mt-4">
                        {price.discount > 0 && (
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-white/40 line-through light:text-gray-400 tabular-nums">{formatPrice(price.full)}</span>
                            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-400 light:bg-emerald-50 light:text-emerald-700">{price.discount}% OFF</span>
                          </div>
                        )}
                        <p className="text-3xl font-semibold tabular-nums">
                          {formatPrice(price.total)}
                          <span className="text-sm font-normal text-white/40 light:text-gray-400"> /{info.short}</span>
                        </p>
                        <p className="mt-0.5 text-[11px] text-white/40 light:text-gray-500">
                          {cycle === 'monthly' ? 'Billed every month' : `${formatPrice(price.perMonth)}/month`}
                          {price.saving > 0 && <span className="text-emerald-500"> · saves {formatPrice(price.saving)}</span>}
                        </p>
                      </div>

                      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                        {LIMITS.map((l) => (
                          <div key={l.key} className="rounded-lg bg-white/[0.03] light:bg-gray-50 py-2">
                            <dt className="text-[10px] uppercase tracking-wide text-white/40 light:text-gray-400">{l.label.split(' ')[0]}</dt>
                            <dd className="text-xs font-medium mt-0.5">{formatLimit(p[l.key])}</dd>
                          </div>
                        ))}
                      </dl>

                      {modules.length > 0 && (
                        <div className="mt-4">
                          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/40 light:text-gray-400">Sections included</p>
                          <div className="space-y-1">
                            {modules.map((m) => (
                              <label key={m.key} className="flex items-center justify-between gap-2 text-xs">
                                <span className={cn(moduleOn(p, m.key) ? 'text-white/80 light:text-gray-700' : 'text-white/35 line-through light:text-gray-400')}>{m.label}</span>
                                <Switch checked={moduleOn(p, m.key)} onCheckedChange={() => toggleModule(p, m)} aria-label={`${m.label} in ${p.name}`} />
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

                      {feats.length > 0 && (
                        <div className="mt-4 flex-1">
                          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/40 light:text-gray-400">Features</p>
                          <ul className="space-y-1">
                            {feats.map((f, i) => (
                              <li key={f.name} className="flex items-center justify-between gap-2 text-xs">
                                <span className={cn('flex items-center gap-1.5', f.enabled ? 'text-white/80 light:text-gray-700' : 'text-white/35 line-through light:text-gray-400')}>
                                  {f.enabled ? <Check className="h-3.5 w-3.5 text-violet-400" /> : <X className="h-3.5 w-3.5" />} {f.name}
                                </span>
                                <Switch checked={f.enabled} onCheckedChange={() => toggleFeature(p, i)} aria-label={`${f.name} in ${p.name}`} />
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="mt-5 pt-4 border-t border-white/[0.06] light:border-gray-200 flex items-center justify-between">
                        <span className="text-xs text-white/50 light:text-gray-500">
                          {clientCount(p.id)} client{clientCount(p.id) === 1 ? '' : 's'}
                        </span>
                        <label className="flex items-center gap-2 text-xs text-white/60 light:text-gray-600">
                          Available for sign-up
                          <Switch checked={p.is_active} onCheckedChange={() => patchPlan(p, { is_active: !p.is_active })} aria-label={`Toggle ${p.name}`} />
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleSave}>
            <DialogHeader>
              <DialogTitle>{editing ? `Edit ${editing.name}` : 'New plan'}</DialogTitle>
              <DialogDescription>Switch each limit, offer, section and feature on or off. Changes apply to every client on this plan.</DialogDescription>
            </DialogHeader>

            <div className="grid gap-5 py-4">
              {/* Basics */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5 sm:col-span-2">
                  <Label className="text-xs">Plan name *</Label>
                  <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={fieldClass} />
                </div>
                <div className="grid gap-1.5 sm:col-span-2">
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
                      onChange={(e) => digits(e.target.value, true) && setForm({ ...form, price: e.target.value })}
                      className={cn(fieldClass, 'pl-7')}
                    />
                  </div>
                </div>
                <label className="flex items-center justify-between gap-3 self-end rounded-lg border border-white/10 px-3 py-2 text-xs light:border-gray-200">
                  Available for new sign-ups
                  <Switch checked={form.is_active} onCheckedChange={(is_active) => setForm({ ...form, is_active })} />
                </label>
              </div>

              {/* Limits */}
              <div className="rounded-lg border border-white/10 p-3 light:border-gray-200">
                <SectionTitle icon={Gauge} title="Limits" hint="Switch a limit off to make it unlimited." />
                <div className="space-y-2">
                  {LIMITS.map((l) => {
                    const st = form.limits[l.key];
                    return (
                      <div key={l.key} className="flex flex-wrap items-center gap-3">
                        <Switch checked={st.on} onCheckedChange={(on) => setLimit(l.key, { on })} aria-label={`Limit ${l.label}`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium">{l.label}</p>
                          <p className="text-[11px] text-white/45 light:text-gray-500">{l.hint}</p>
                        </div>
                        {st.on ? (
                          <Input
                            inputMode="numeric"
                            placeholder="e.g. 5"
                            value={st.value}
                            onChange={(e) => digits(e.target.value) && setLimit(l.key, { value: e.target.value })}
                            className={cn(fieldClass, 'w-28')}
                            aria-label={`${l.label} limit`}
                          />
                        ) : (
                          <span className="w-28 text-right text-xs font-medium text-emerald-500">Unlimited</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Offers */}
              <div className="rounded-lg border border-white/10 p-3 light:border-gray-200">
                <SectionTitle icon={Tag} title="Offers for longer billing cycles" hint="Switch an offer on to give % off the monthly price." />
                <div className="space-y-2">
                  {OFFERS.map(({ key, cycle: c }) => {
                    const st = form.offers[key];
                    const cp = cyclePrice(preview, c);
                    return (
                      <div key={key} className="flex flex-wrap items-center gap-3">
                        <Switch checked={st.on} onCheckedChange={(on) => setOffer(key, { on })} aria-label={`${cycleInfo(c).label} offer`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium">{cycleInfo(c).label}</p>
                          <p className="text-[11px] tabular-nums text-white/45 light:text-gray-500">
                            {formatPrice(cp.total)} / {cycleInfo(c).short}
                            {cp.saving > 0 && <span className="text-emerald-500"> · saves {formatPrice(cp.saving)}</span>}
                          </p>
                        </div>
                        {st.on ? (
                          <div className="relative w-28">
                            <Input
                              inputMode="decimal"
                              placeholder="10"
                              value={st.value}
                              onChange={(e) => digits(e.target.value, true) && setOffer(key, { value: e.target.value })}
                              className={cn(fieldClass, 'pr-7')}
                              aria-label={`${cycleInfo(c).label} discount`}
                            />
                            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/40 light:text-gray-400">%</span>
                          </div>
                        ) : (
                          <span className="w-28 text-right text-xs text-white/40 light:text-gray-400">No offer</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Modules */}
              {modules.length > 0 && (
                <div className="rounded-lg border border-white/10 p-3 light:border-gray-200">
                  <SectionTitle icon={Boxes} title="Sections included" hint="Switched-off sections are hidden from this plan's clients and blocked for them." />
                  <div className="grid gap-2 sm:grid-cols-2">
                    {modules.map((m) => (
                      <label key={m.key} className="flex items-start justify-between gap-3 rounded-md bg-white/[0.02] p-2 light:bg-gray-50">
                        <span>
                          <span className="block text-xs font-medium">{m.label}</span>
                          <span className="block text-[11px] text-white/45 light:text-gray-500">{m.hint}</span>
                        </span>
                        <Switch
                          checked={form.modules[m.key] !== false}
                          onCheckedChange={(on) => setForm({ ...form, modules: { ...form.modules, [m.key]: on } })}
                          aria-label={m.label}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Custom features */}
              <div className="rounded-lg border border-white/10 p-3 light:border-gray-200">
                <SectionTitle icon={Sparkles} title="Features" hint="Your own feature lines, shown on the plan. Switch one off to keep it but hide it." />
                <div className="space-y-2">
                  {form.features.length === 0 && <p className="text-[11px] text-white/45 light:text-gray-500">No features yet.</p>}
                  {form.features.map((f, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Switch
                        checked={f.enabled}
                        onCheckedChange={(enabled) => setForm({ ...form, features: form.features.map((x, j) => (j === i ? { ...x, enabled } : x)) })}
                        aria-label={`Show ${f.name}`}
                      />
                      <Input
                        value={f.name}
                        maxLength={120}
                        onChange={(e) => setForm({ ...form, features: form.features.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })}
                        className={cn(fieldClass, 'h-8 flex-1 text-xs')}
                        aria-label="Feature name"
                      />
                      <IconButton icon={Trash2} label={`Remove ${f.name}`} className="hover:text-rose-400" onClick={() => setForm({ ...form, features: form.features.filter((_, j) => j !== i) })} />
                    </div>
                  ))}
                  <div className="flex gap-2 pt-1">
                    <Input
                      value={newFeature}
                      placeholder="Add a feature, e.g. Webhook"
                      maxLength={120}
                      onChange={(e) => setNewFeature(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addFeature(newFeature);
                        }
                      }}
                      className={cn(fieldClass, 'h-8 flex-1 text-xs')}
                    />
                    <Button type="button" size="sm" variant="outline" onClick={() => addFeature(newFeature)}>
                      <Plus className="mr-1 h-3.5 w-3.5" /> Add
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {FEATURE_SUGGESTIONS.filter((s) => !form.features.some((f) => f.name.toLowerCase() === s.toLowerCase())).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => addFeature(s)}
                        className="rounded-full border border-dashed border-white/15 px-2 py-0.5 text-[11px] text-white/60 hover:border-violet-400 hover:text-violet-300 light:border-gray-300 light:text-gray-600 light:hover:text-violet-700"
                      >
                        + {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
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
