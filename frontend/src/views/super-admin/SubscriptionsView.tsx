import React, { useEffect, useState } from 'react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CreditCard, Plus, Pencil, Trash2, Check, Search } from 'lucide-react';
import { toast } from 'sonner';
import {
  superAdminService,
  formatPrice,
  formatLimit,
  type Plan,
  type Vendor,
  type BillingInterval,
} from '@/services/superAdmin';
import { cardClass, fieldClass, LoadingBlock, errorMessage } from './shared';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

/** All ISO 4217 currencies with their names */
const ALL_CURRENCIES: { code: string; name: string }[] = [
  { code: 'USD', name: 'US Dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British Pound' },
  { code: 'INR', name: 'Indian Rupee' },
  { code: 'JPY', name: 'Japanese Yen' },
  { code: 'AUD', name: 'Australian Dollar' },
  { code: 'CAD', name: 'Canadian Dollar' },
  { code: 'CHF', name: 'Swiss Franc' },
  { code: 'CNY', name: 'Chinese Yuan' },
  { code: 'SEK', name: 'Swedish Krona' },
  { code: 'NZD', name: 'New Zealand Dollar' },
  { code: 'MXN', name: 'Mexican Peso' },
  { code: 'SGD', name: 'Singapore Dollar' },
  { code: 'HKD', name: 'Hong Kong Dollar' },
  { code: 'NOK', name: 'Norwegian Krone' },
  { code: 'KRW', name: 'South Korean Won' },
  { code: 'TRY', name: 'Turkish Lira' },
  { code: 'RUB', name: 'Russian Ruble' },
  { code: 'BRL', name: 'Brazilian Real' },
  { code: 'ZAR', name: 'South African Rand' },
  { code: 'TWD', name: 'Taiwan Dollar' },
  { code: 'DKK', name: 'Danish Krone' },
  { code: 'PLN', name: 'Polish Zloty' },
  { code: 'THB', name: 'Thai Baht' },
  { code: 'IDR', name: 'Indonesian Rupiah' },
  { code: 'HUF', name: 'Hungarian Forint' },
  { code: 'CZK', name: 'Czech Koruna' },
  { code: 'ILS', name: 'Israeli Shekel' },
  { code: 'CLP', name: 'Chilean Peso' },
  { code: 'PHP', name: 'Philippine Peso' },
  { code: 'AED', name: 'UAE Dirham' },
  { code: 'COP', name: 'Colombian Peso' },
  { code: 'SAR', name: 'Saudi Riyal' },
  { code: 'MYR', name: 'Malaysian Ringgit' },
  { code: 'RON', name: 'Romanian Leu' },
  { code: 'ARS', name: 'Argentine Peso' },
  { code: 'BGN', name: 'Bulgarian Lev' },
  { code: 'EGP', name: 'Egyptian Pound' },
  { code: 'HRK', name: 'Croatian Kuna' },
  { code: 'ISK', name: 'Icelandic Króna' },
  { code: 'NGN', name: 'Nigerian Naira' },
  { code: 'PKR', name: 'Pakistani Rupee' },
  { code: 'QAR', name: 'Qatari Riyal' },
  { code: 'KWD', name: 'Kuwaiti Dinar' },
  { code: 'BHD', name: 'Bahraini Dinar' },
  { code: 'OMR', name: 'Omani Rial' },
  { code: 'JOD', name: 'Jordanian Dinar' },
  { code: 'VND', name: 'Vietnamese Dong' },
  { code: 'BDT', name: 'Bangladeshi Taka' },
  { code: 'LKR', name: 'Sri Lankan Rupee' },
  { code: 'MMK', name: 'Myanmar Kyat' },
  { code: 'KES', name: 'Kenyan Shilling' },
  { code: 'GHS', name: 'Ghanaian Cedi' },
  { code: 'TZS', name: 'Tanzanian Shilling' },
  { code: 'UGX', name: 'Ugandan Shilling' },
  { code: 'MAD', name: 'Moroccan Dirham' },
  { code: 'XOF', name: 'West African CFA' },
  { code: 'XAF', name: 'Central African CFA' },
  { code: 'PEN', name: 'Peruvian Sol' },
  { code: 'UYU', name: 'Uruguayan Peso' },
  { code: 'BOB', name: 'Bolivian Boliviano' },
  { code: 'PYG', name: 'Paraguayan Guarani' },
  { code: 'GTQ', name: 'Guatemalan Quetzal' },
  { code: 'CRC', name: 'Costa Rican Colón' },
  { code: 'DOP', name: 'Dominican Peso' },
  { code: 'TTD', name: 'Trinidad Dollar' },
  { code: 'JMD', name: 'Jamaican Dollar' },
  { code: 'BBD', name: 'Barbadian Dollar' },
  { code: 'BSD', name: 'Bahamian Dollar' },
  { code: 'FJD', name: 'Fijian Dollar' },
  { code: 'GEL', name: 'Georgian Lari' },
  { code: 'AMD', name: 'Armenian Dram' },
  { code: 'AZN', name: 'Azerbaijani Manat' },
  { code: 'KZT', name: 'Kazakhstani Tenge' },
  { code: 'UZS', name: 'Uzbekistani Som' },
  { code: 'RSD', name: 'Serbian Dinar' },
  { code: 'UAH', name: 'Ukrainian Hryvnia' },
  { code: 'BYN', name: 'Belarusian Ruble' },
  { code: 'MDL', name: 'Moldovan Leu' },
  { code: 'ALL', name: 'Albanian Lek' },
  { code: 'MKD', name: 'Macedonian Denar' },
  { code: 'BAM', name: 'Bosnia Mark' },
  { code: 'GIP', name: 'Gibraltar Pound' },
  { code: 'ETB', name: 'Ethiopian Birr' },
  { code: 'RWF', name: 'Rwandan Franc' },
  { code: 'ZMW', name: 'Zambian Kwacha' },
  { code: 'MZN', name: 'Mozambican Metical' },
  { code: 'AOA', name: 'Angolan Kwanza' },
  { code: 'BWP', name: 'Botswana Pula' },
  { code: 'NAD', name: 'Namibian Dollar' },
  { code: 'MUR', name: 'Mauritian Rupee' },
  { code: 'SCR', name: 'Seychellois Rupee' },
  { code: 'MVR', name: 'Maldivian Rufiyaa' },
  { code: 'NPR', name: 'Nepalese Rupee' },
  { code: 'AFN', name: 'Afghan Afghani' },
  { code: 'IRR', name: 'Iranian Rial' },
  { code: 'IQD', name: 'Iraqi Dinar' },
  { code: 'SYP', name: 'Syrian Pound' },
  { code: 'LBP', name: 'Lebanese Pound' },
  { code: 'YER', name: 'Yemeni Rial' },
  { code: 'TND', name: 'Tunisian Dinar' },
  { code: 'DZD', name: 'Algerian Dinar' },
  { code: 'LYD', name: 'Libyan Dinar' },
  { code: 'SDG', name: 'Sudanese Pound' },
  { code: 'KHR', name: 'Cambodian Riel' },
  { code: 'LAK', name: 'Lao Kip' },
  { code: 'BND', name: 'Brunei Dollar' },
  { code: 'MNT', name: 'Mongolian Tugrik' },
  { code: 'KGS', name: 'Kyrgyz Som' },
  { code: 'TJS', name: 'Tajikistani Somoni' },
  { code: 'TMT', name: 'Turkmen Manat' },
  { code: 'XCD', name: 'East Caribbean Dollar' },
  { code: 'HTG', name: 'Haitian Gourde' },
  { code: 'PAB', name: 'Panamanian Balboa' },
  { code: 'HNL', name: 'Honduran Lempira' },
  { code: 'NIO', name: 'Nicaraguan Córdoba' },
  { code: 'SVC', name: 'Salvadoran Colón' },
  { code: 'BZD', name: 'Belize Dollar' },
  { code: 'CUP', name: 'Cuban Peso' },
  { code: 'SOS', name: 'Somali Shilling' },
  { code: 'DJF', name: 'Djiboutian Franc' },
  { code: 'ERN', name: 'Eritrean Nakfa' },
  { code: 'GMD', name: 'Gambian Dalasi' },
  { code: 'GNF', name: 'Guinean Franc' },
  { code: 'LRD', name: 'Liberian Dollar' },
  { code: 'SLL', name: 'Sierra Leonean Leone' },
  { code: 'MWK', name: 'Malawian Kwacha' },
  { code: 'LSL', name: 'Lesotho Loti' },
  { code: 'SZL', name: 'Eswatini Lilangeni' },
  { code: 'MGA', name: 'Malagasy Ariary' },
  { code: 'KMF', name: 'Comorian Franc' },
  { code: 'CVE', name: 'Cape Verdean Escudo' },
  { code: 'STN', name: 'São Tomé Dobra' },
  { code: 'BIF', name: 'Burundian Franc' },
  { code: 'CDF', name: 'Congolese Franc' },
  { code: 'SSP', name: 'South Sudanese Pound' },
  { code: 'TOP', name: 'Tongan Paʻanga' },
  { code: 'WST', name: 'Samoan Tala' },
  { code: 'VUV', name: 'Vanuatu Vatu' },
  { code: 'SBD', name: 'Solomon Islands Dollar' },
  { code: 'PGK', name: 'Papua New Guinean Kina' },
  { code: 'XPF', name: 'CFP Franc' },
];

/** Searchable currency picker component */
const CurrencyPicker: React.FC<{
  value: string;
  onChange: (code: string) => void;
  className?: string;
}> = ({ value, onChange, className }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const filtered = ALL_CURRENCIES.filter(
    (c) =>
      c.code.toLowerCase().includes(search.toLowerCase()) ||
      c.name.toLowerCase().includes(search.toLowerCase())
  );
  const selected = ALL_CURRENCIES.find((c) => c.code === value);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => { setOpen(!open); setSearch(''); }}
        className={cn(
          'w-full flex items-center justify-between gap-2 h-9 rounded-md border px-3 py-1 text-sm',
          className
        )}
      >
        <span className="truncate">{selected ? `${selected.code} — ${selected.name}` : value || 'Select currency'}</span>
        <Search className="h-3.5 w-3.5 opacity-50 shrink-0" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[280px] rounded-lg border border-white/10 bg-[#1a1a1c] shadow-xl light:bg-white light:border-gray-200">
          <div className="p-2 border-b border-white/[0.06] light:border-gray-100">
            <Input
              autoFocus
              placeholder="Search currency…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-xs bg-white/[0.06] border-white/[0.08] light:bg-gray-50 light:border-gray-200"
            />
          </div>
          <ScrollArea className="max-h-[240px]">
            <div className="p-1">
              {filtered.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-white/40 light:text-gray-400">No currencies found</div>
              ) : (
                filtered.map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => { onChange(c.code); setOpen(false); }}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs transition-colors text-left',
                      c.code === value
                        ? 'bg-violet-500/20 text-violet-300 light:bg-violet-50 light:text-violet-700'
                        : 'text-white/70 hover:bg-white/[0.06] hover:text-white light:text-gray-700 light:hover:bg-gray-50 light:hover:text-gray-900'
                    )}
                  >
                    <span className="font-mono font-semibold w-8 shrink-0">{c.code}</span>
                    <span className="truncate">{c.name}</span>
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      )}
      {/* Close overlay when clicking outside */}
      {open && <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />}
    </div>
  );
};

const emptyPlan = {
  name: '',
  description: '',
  price: 0,
  currency: 'USD',
  interval: 'monthly' as BillingInterval,
  max_users: 0,
  max_contacts: 0,
  max_accounts: 0,
  features: '',
  is_active: true,
};

export const SubscriptionsView: React.FC = () => {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [form, setForm] = useState(emptyPlan);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<Plan | null>(null);

  const load = () => {
    setError(null);
    Promise.all([superAdminService.listPlans(), superAdminService.listVendors()])
      .then(([p, v]) => {
        setPlans(p);
        setVendors(v);
      })
      .catch((e) => setError(errorMessage(e)));
  };
  useEffect(load, []);

  const vendorCount = (planId: string) => vendors.filter((v) => v.plan_id === planId).length;

  const openCreate = () => {
    setEditing(null);
    setForm(emptyPlan);
    setDialogOpen(true);
  };

  const openEdit = (p: Plan) => {
    setEditing(p);
    setForm({ ...emptyPlan, ...p, description: p.description ?? '', features: p.features.join('\n') });
    setDialogOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const payload: Partial<Plan> = {
      ...form,
      price: Number(form.price),
      max_users: Number(form.max_users),
      max_contacts: Number(form.max_contacts),
      max_accounts: Number(form.max_accounts),
      features: form.features.split('\n').map((f) => f.trim()).filter(Boolean),
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

  const num = (k: 'price' | 'max_users' | 'max_contacts' | 'max_accounts') => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value === '' ? 0 : Number(e.target.value) });

  /** Clear "0" from numeric fields on focus so users can type directly */
  const clearZeroOnFocus = (k: 'price' | 'max_users' | 'max_contacts' | 'max_accounts') => (e: React.FocusEvent<HTMLInputElement>) => {
    if (Number(form[k]) === 0) {
      e.target.value = '';
      setForm({ ...form, [k]: '' as unknown as number });
    }
  };

  return (
    <div className="flex flex-col min-h-full bg-[#0a0a0b] light:bg-gray-50">
      <PageHeader
        title="Subscription Management"
        subtitle="Plans that vendors can subscribe to"
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
            Create the plans vendors can subscribe to, with their price and limits.
          </p>
          <Button size="sm" className="mt-4 bg-violet-600 hover:bg-violet-500 text-white" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" /> New plan
          </Button>
        </div>
      ) : (
        <div className="p-6 grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {plans.map((p) => (
            <div key={p.id} className={cn('rounded-xl border p-5 flex flex-col', cardClass, !p.is_active && 'opacity-60')}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{p.name}</h3>
                    {!p.is_active && <Badge variant="outline" className="text-[10px] border-white/10 light:border-gray-200">Inactive</Badge>}
                  </div>
                  {p.description && <p className="text-xs text-white/50 light:text-gray-500 mt-0.5">{p.description}</p>}
                </div>
                <div className="flex shrink-0">
                  <IconButton icon={Pencil} label="Edit plan" onClick={() => openEdit(p)} />
                  <IconButton icon={Trash2} label="Delete plan" className="hover:text-rose-400" onClick={() => setToDelete(p)} />
                </div>
              </div>

              <p className="mt-4 text-3xl font-semibold tabular-nums">
                {formatPrice(p.price, p.currency)}
                <span className="text-sm font-normal text-white/40 light:text-gray-400"> /{p.interval === 'yearly' ? 'year' : 'month'}</span>
              </p>

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
                <span className="text-xs text-white/50 light:text-gray-500">{vendorCount(p.id)} vendors subscribed</span>
                <label className="flex items-center gap-2 text-xs text-white/60 light:text-gray-600">
                  Available
                  <Switch checked={p.is_active} onCheckedChange={() => toggleActive(p)} aria-label={`Toggle ${p.name}`} />
                </label>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <form onSubmit={handleSave}>
            <DialogHeader>
              <DialogTitle>{editing ? `Edit ${editing.name}` : 'New plan'}</DialogTitle>
              <DialogDescription>Set the price, billing cycle and limits. Use 0 for unlimited.</DialogDescription>
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
              <div className="grid grid-cols-3 gap-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs">Price *</Label>
                  <Input required type="number" min={0} step="0.01" value={form.price} onChange={num('price')} onFocus={clearZeroOnFocus('price')} className={fieldClass} />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Currency</Label>
                  <CurrencyPicker value={form.currency} onChange={(currency) => setForm({ ...form, currency })} className={fieldClass} />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Billing</Label>
                  <Select value={form.interval} onValueChange={(v) => setForm({ ...form, interval: v as BillingInterval })}>
                    <SelectTrigger className={fieldClass}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="yearly">Yearly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs">Max users</Label>
                  <Input type="number" min={0} value={form.max_users} onChange={num('max_users')} onFocus={clearZeroOnFocus('max_users')} className={fieldClass} />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Max contacts</Label>
                  <Input type="number" min={0} value={form.max_contacts} onChange={num('max_contacts')} onFocus={clearZeroOnFocus('max_contacts')} className={fieldClass} />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Max numbers</Label>
                  <Input type="number" min={0} value={form.max_accounts} onChange={num('max_accounts')} onFocus={clearZeroOnFocus('max_accounts')} className={fieldClass} />
                </div>
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
