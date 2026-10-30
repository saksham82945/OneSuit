import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { ErrorState } from '@/components/shared/ErrorState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Building2, Plus, LogIn, Pencil, Ban, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  superAdminService,
  accessVendorAccount,
  formatDate,
  formatPrice,
  daysUntil,
  NO_PLAN,
  BILLING_CYCLES,
  cycleInfo,
  cyclePrice,
  subscriptionState,
  type Vendor,
  type VendorInput,
  type Plan,
  type VendorStatus,
  type BillingInterval,
  type SubscriptionState,
} from '@/services/superAdmin';
import { fieldClass, SubscriptionStateBadge, errorMessage } from './shared';
import { EntriesTable, longDate, type EntryColumn } from './EntriesTable';
import { SubscriptionDialog } from './SubscriptionDialog';
import { cn } from '@/lib/utils';

type StatusFilter = 'all' | SubscriptionState;

const emptyForm = {
  name: '',
  owner_name: '',
  owner_email: '',
  phone: '',
  plan_id: NO_PLAN,
  status: 'trial' as VendorStatus,
  billing_cycle: 'monthly' as BillingInterval,
  renewal_date: '',
  owner_password: '',
};

/** YYYY-MM-DD for today plus a number of months. */
const monthsFromToday = (months: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
};

export const ClientsView: React.FC = () => {
  const navigate = useNavigate();
  const [vendors, setVendors] = useState<Vendor[] | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [accessingId, setAccessingId] = useState<string | null>(null);
  const [subFor, setSubFor] = useState<Vendor | null>(null);

  const load = () => {
    setError(null);
    Promise.all([superAdminService.listVendors(), superAdminService.listPlans()])
      .then(([v, p]) => {
        setVendors(v);
        setPlans(p);
      })
      .catch((e) => setError(errorMessage(e)));
  };
  useEffect(load, []);

  // Search, sorting and pages are handled by the table; this only filters by status.
  const filtered = useMemo(
    () => (vendors ?? []).filter((v) => statusFilter === 'all' || subscriptionState(v) === statusFilter),
    [vendors, statusFilter]
  );

  const counts = useMemo(() => {
    const c: Record<SubscriptionState, number> = { active: 0, trial: 0, idle: 0, expired: 0, suspended: 0 };
    (vendors ?? []).forEach((v) => c[subscriptionState(v)]++);
    return c;
  }, [vendors]);


  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, plan_id: plans.find((p) => p.is_active)?.id ?? NO_PLAN });
    setDialogOpen(true);
  };

  const openEdit = (v: Vendor) => {
    setEditing(v);
    setForm({
      name: v.name,
      owner_name: v.owner_name,
      owner_email: v.owner_email,
      phone: v.phone ?? '',
      plan_id: v.plan_id ?? NO_PLAN,
      status: v.status,
      billing_cycle: v.billing_cycle ?? 'monthly',
      renewal_date: v.renewal_date ? v.renewal_date.slice(0, 10) : '',
      owner_password: '',
    });
    setDialogOpen(true);
  };

  const replaceVendor = (updated: Vendor) =>
    setVendors((list) => (list ?? []).map((v) => (v.id === updated.id ? updated : v)));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { owner_password, renewal_date, ...fields } = form;
      const payload: VendorInput = { ...fields, plan_id: form.plan_id === NO_PLAN ? '' : form.plan_id };
      if (editing || renewal_date) {
        payload.renewal_date = renewal_date; // YYYY-MM-DD, or '' to clear
      }
      if (!editing && owner_password) {
        payload.owner_password = owner_password;
      }
      if (editing) {
        replaceVendor(await superAdminService.updateVendor(editing.id, payload));
        toast.success('Client updated');
      } else {
        const created = await superAdminService.createVendor(payload);
        setVendors((list) => [created, ...(list ?? [])]);
        toast.success('Client created');
      }
      setDialogOpen(false);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save client'));
    } finally {
      setSaving(false);
    }
  };

  const toggleSuspend = async (v: Vendor) => {
    const status: VendorStatus = v.status === 'suspended' ? 'active' : 'suspended';
    try {
      replaceVendor(await superAdminService.updateVendor(v.id, { status }));
      toast.success(status === 'suspended' ? `${v.name} suspended` : `${v.name} reactivated`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const handleAccess = async (v: Vendor) => {
    setAccessingId(v.id);
    try {
      await accessVendorAccount(v);
      toast.success(`Signed in to ${v.name} as admin`);
      navigate('/');
    } catch (err) {
      toast.error(errorMessage(err, `Could not access ${v.name}`));
    } finally {
      setAccessingId(null);
    }
  };

  const statusText: Record<VendorStatus, string> = { active: 'Active', trial: 'Trial', suspended: 'Suspended' };

  const columns: EntryColumn<Vendor>[] = [
    {
      key: 'name',
      label: 'Client title',
      sortValue: (v) => v.name,
      render: (v) => (
        <button type="button" onClick={() => openEdit(v)} className="text-left font-medium text-emerald-400 hover:underline light:text-emerald-600">
          {v.name}
        </button>
      ),
    },
    {
      key: 'quick',
      label: 'Quick actions',
      render: (v) => (
        <div className="flex flex-col items-start gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-xs border-white/10 light:border-gray-200"
            disabled={accessingId !== null}
            onClick={() => handleAccess(v)}
            title={`Log in to ${v.name} as admin`}
          >
            <LogIn className="h-3.5 w-3.5 mr-1" /> {accessingId === v.id ? 'Opening…' : 'Login'}
          </Button>
          <Button size="sm" className="h-7 px-2.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white" onClick={() => setSubFor(v)}>
            Subscription
          </Button>
        </div>
      ),
    },
    { key: 'owner_name', label: 'Admin user name', sortValue: (v) => v.owner_name, render: (v) => <span className="text-xs">{v.owner_name || '—'}</span> },
    { key: 'slug', label: 'Username', sortValue: (v) => v.slug, render: (v) => <span className="text-xs">{v.slug || '—'}</span> },
    { key: 'owner_email', label: 'Email', sortValue: (v) => v.owner_email, render: (v) => <span className="text-xs break-all">{v.owner_email || '—'}</span> },
    {
      key: 'status',
      label: 'Status',
      sortValue: (v) => v.status,
      render: (v) => <SubscriptionStateBadge state={subscriptionState(v)} />,
    },
    { key: 'phone', label: 'Mobile number', sortValue: (v) => v.phone ?? '', render: (v) => <span className="text-xs tabular-nums">{v.phone || '—'}</span> },
    {
      key: 'owner_active',
      label: 'Admin user status',
      sortValue: (v) => (v.owner_active ? 1 : 0),
      render: (v) => <span className={cn('text-xs', v.owner_active ? 'text-emerald-400 light:text-emerald-600' : 'text-white/40 light:text-gray-400')}>{v.owner_active ? 'Active' : 'Inactive'}</span>,
    },
    {
      key: 'created_at',
      label: 'Created on',
      sortValue: (v) => new Date(v.created_at).getTime(),
      render: (v) => <span className="text-xs">{longDate(v.created_at)}</span>,
    },
  ];

  /** Shown when a client's + is clicked. */
  const renderDetails = (v: Vendor) => {
    const days = v.renewal_date ? daysUntil(v.renewal_date) : null;
    return (
      <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-xs text-white/70 light:text-gray-600">
        <span>Account status: <strong>{statusText[v.status]}</strong></span>
        <span>Plan: <strong>{v.plan_name || 'No plan'}</strong>{v.plan_id && ` · ${cycleInfo(v.billing_cycle).label}${v.plan_amount ? ` · ${formatPrice(v.plan_amount)}` : ''}`}</span>
        <span>
          Expires: <strong>{v.renewal_date ? formatDate(v.renewal_date) : '—'}</strong>
          {days !== null && <span className={cn('ml-1', days < 0 ? 'text-rose-400' : days <= 7 ? 'text-amber-400' : '')}>({days < 0 ? `${-days} days overdue` : `in ${days} days`})</span>}
        </span>
        <span>Users: <strong>{v.users_count}</strong> · Contacts: <strong>{v.contacts_count.toLocaleString()}</strong></span>
        <span className="flex gap-2 ml-auto">
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs border-white/10 light:border-gray-200" onClick={() => openEdit(v)}>
            <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
          </Button>
          <Button
            size="sm"
            variant="outline"
            className={cn('h-7 px-2 text-xs border-white/10 light:border-gray-200', v.status === 'suspended' ? 'hover:text-emerald-400' : 'hover:text-rose-400')}
            onClick={() => toggleSuspend(v)}
          >
            {v.status === 'suspended' ? <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> : <Ban className="h-3.5 w-3.5 mr-1" />}
            {v.status === 'suspended' ? 'Reactivate' : 'Suspend'}
          </Button>
        </span>
      </div>
    );
  };

  const selectedPlan = plans.find((p) => p.id === form.plan_id);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="flex flex-col min-h-full bg-[#0a0a0b] light:bg-gray-50">
      <PageHeader
        title="Clients"
        subtitle="Every business on the platform and its subscription"
        icon={Building2}
        iconGradient="bg-gradient-to-br from-violet-500 to-indigo-600 shadow-violet-500/20"
        actions={
          <Button size="sm" className="bg-violet-600 hover:bg-violet-500 text-white" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" /> Add new client
          </Button>
        }
      />

      <div className="p-6">
        {error ? (
          <ErrorState title="Couldn't load clients" description={error} onRetry={load} />
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-1 rounded-lg bg-white/[0.04] light:bg-gray-100 p-1 w-fit">
              {(['all', 'active', 'trial', 'idle', 'expired', 'suspended'] as StatusFilter[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={cn(
                    'px-3 py-1 rounded-md text-xs capitalize transition-colors',
                    statusFilter === s
                      ? 'bg-white/[0.1] text-white light:bg-white light:text-gray-900 light:shadow-sm'
                      : 'text-white/50 hover:text-white light:text-gray-500 light:hover:text-gray-900'
                  )}
                >
                  {s}
                  {s !== 'all' && <span className="ml-1 tabular-nums opacity-60">{counts[s]}</span>}
                </button>
              ))}
            </div>
            <EntriesTable
              rows={filtered}
              columns={columns}
              getId={(v) => v.id}
              searchText={(v) => [v.name, v.slug, v.owner_name, v.owner_email, v.phone].join(' ')}
              defaultSort={{ key: 'created_at', dir: 'asc' }}
              loading={vendors === null}
              emptyText="No clients yet. Add your first client to get started."
              renderDetails={renderDetails}
              defaultPageSize={100}
            />
          </div>
        )}
      </div>

      <SubscriptionDialog client={subFor} plans={plans} onClose={() => setSubFor(null)} onSaved={replaceVendor} />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <form onSubmit={handleSave}>
            <DialogHeader>
              <DialogTitle>{editing ? `Edit ${editing.name}` : 'Add client'}</DialogTitle>
              <DialogDescription>
                {editing ? 'Change the client details, plan or status.' : 'Create a new business on the platform.'}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-4">
              <div className="grid gap-1.5">
                <Label className="text-xs">Business name *</Label>
                <Input required value={form.name} onChange={set('name')} className={fieldClass} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs">Owner name *</Label>
                  <Input required value={form.owner_name} onChange={set('owner_name')} className={fieldClass} />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Phone</Label>
                  <Input value={form.phone} onChange={set('phone')} className={fieldClass} />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Owner email *</Label>
                <Input required type="email" value={form.owner_email} onChange={set('owner_email')} className={fieldClass} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs">Plan</Label>
                  <Select
                    value={form.plan_id}
                    onValueChange={(plan_id) =>
                      setForm({
                        ...form,
                        plan_id,
                        renewal_date: plan_id === NO_PLAN ? form.renewal_date : monthsFromToday(cycleInfo(form.billing_cycle).months),
                      })
                    }
                  >
                    <SelectTrigger className={fieldClass}><SelectValue placeholder="Choose a plan" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_PLAN}>No plan</SelectItem>
                      {plans.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}{!p.is_active && ' (inactive)'}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Status</Label>
                  <Select value={form.status} onValueChange={(s) => setForm({ ...form, status: s as VendorStatus })}>
                    <SelectTrigger className={fieldClass}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="trial">Trial</SelectItem>
                      <SelectItem value="suspended">Suspended</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {selectedPlan && (
                <div className="grid gap-1.5">
                  <Label className="text-xs">Billing cycle</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {BILLING_CYCLES.map((c) => {
                      const price = cyclePrice(selectedPlan, c.id);
                      const active = form.billing_cycle === c.id;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setForm({ ...form, billing_cycle: c.id, renewal_date: monthsFromToday(c.months) })}
                          className={cn(
                            'rounded-lg border px-2 py-2 text-left transition-colors',
                            active
                              ? 'border-violet-500 bg-violet-500/10 light:bg-violet-50'
                              : 'border-white/10 hover:bg-white/[0.04] light:border-gray-200 light:hover:bg-gray-50'
                          )}
                        >
                          <span className="block text-[11px] font-semibold">{c.label}</span>
                          <span className="block text-xs tabular-nums">{formatPrice(price.total)}</span>
                          {price.discount > 0 && (
                            <span className="block text-[10px] font-semibold text-emerald-500">{price.discount}% off</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="grid gap-1.5">
                <Label className="text-xs">{form.status === 'trial' ? 'Trial ends on' : 'Renewal date'}</Label>
                <Input type="date" value={form.renewal_date} onChange={set('renewal_date')} className={fieldClass} />
                {!editing && (
                  <p className="text-[11px] text-white/40 light:text-gray-500">Filled in from the billing cycle. Leave empty on trial to use the default trial length.</p>
                )}
              </div>
              {!editing && (
                <div className="grid gap-1.5">
                  <Label className="text-xs">Owner password</Label>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    value={form.owner_password}
                    onChange={set('owner_password')}
                    placeholder="Optional"
                    className={fieldClass}
                  />
                  <p className="text-[11px] text-white/40 light:text-gray-500">
                    Set one to create the owner's admin login. Leave empty to add users later.
                  </p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving} className="bg-violet-600 hover:bg-violet-500 text-white">
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Create client'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClientsView;
