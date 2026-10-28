import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { SearchInput } from '@/components/shared/SearchInput';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { IconButton } from '@/components/shared/IconButton';
import { ErrorState } from '@/components/shared/ErrorState';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
  daysUntil,
  NO_PLAN,
  type Vendor,
  type VendorInput,
  type Plan,
  type VendorStatus,
} from '@/services/superAdmin';
import { cardClass, fieldClass, VendorStatusBadge, errorMessage } from './shared';
import { cn } from '@/lib/utils';

type StatusFilter = 'all' | VendorStatus;

const emptyForm = {
  name: '',
  owner_name: '',
  owner_email: '',
  phone: '',
  plan_id: NO_PLAN,
  status: 'trial' as VendorStatus,
  renewal_date: '',
  owner_password: '',
};

export const VendorsView: React.FC = () => {
  const navigate = useNavigate();
  const [vendors, setVendors] = useState<Vendor[] | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [accessingId, setAccessingId] = useState<string | null>(null);

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (vendors ?? []).filter(
      (v) =>
        (statusFilter === 'all' || v.status === statusFilter) &&
        (!q || [v.name, v.slug, v.owner_name, v.owner_email].some((f) => f?.toLowerCase().includes(q)))
    );
  }, [vendors, search, statusFilter]);

  useEffect(() => setPage(1), [search, statusFilter]);
  const pageSize = 10;
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize);

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
      if (editing) {
        payload.renewal_date = renewal_date; // YYYY-MM-DD, or '' to clear
      } else if (owner_password) {
        payload.owner_password = owner_password;
      }
      if (editing) {
        replaceVendor(await superAdminService.updateVendor(editing.id, payload));
        toast.success('Vendor updated');
      } else {
        const created = await superAdminService.createVendor(payload);
        setVendors((list) => [created, ...(list ?? [])]);
        toast.success('Vendor created');
      }
      setDialogOpen(false);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save vendor'));
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

  const columns: Column<Vendor>[] = [
    {
      key: 'name',
      label: 'Vendor',
      render: (v) => (
        <div className="min-w-0 max-w-[260px]">
          <p className="text-[13px] font-medium text-white light:text-gray-900 truncate">{v.name}</p>
          <p className="text-[11px] text-white/40 light:text-gray-500 truncate" title={v.owner_email}>
            {v.owner_name} · {v.owner_email}
          </p>
        </div>
      ),
    },
    { key: 'plan_name', label: 'Plan', render: (v) => <span className="text-xs">{v.plan_name}</span> },
    { key: 'status', label: 'Status', render: (v) => <VendorStatusBadge status={v.status} /> },
    {
      key: 'usage',
      label: 'Users · Contacts',
      render: (v) => (
        <span className="text-xs tabular-nums whitespace-nowrap text-white/70 light:text-gray-600">
          {v.users_count} · {v.contacts_count.toLocaleString()}
        </span>
      ),
    },
    {
      key: 'renewal_date',
      label: 'Renewal',
      render: (v) => {
        if (!v.renewal_date) return <span className="text-xs text-white/30 light:text-gray-400">—</span>;
        const days = daysUntil(v.renewal_date);
        return (
          <div className="whitespace-nowrap">
            <p className="text-xs">{formatDate(v.renewal_date)}</p>
            <p className={cn('text-[11px]', days < 0 ? 'text-rose-400' : days <= 7 ? 'text-amber-400' : 'text-white/40 light:text-gray-400')}>
              {days < 0 ? `${-days} days overdue` : `in ${days} days`}
            </p>
          </div>
        );
      },
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right',
      render: (v) => (
        <div className="flex items-center justify-end gap-1 whitespace-nowrap">
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs whitespace-nowrap border-white/10 light:border-gray-200"
            disabled={accessingId !== null}
            onClick={() => handleAccess(v)}
            title={`Open ${v.name} as admin`}
          >
            <LogIn className="h-3.5 w-3.5 xl:mr-1.5" />
            <span className="hidden xl:inline">{accessingId === v.id ? 'Opening…' : 'Access account'}</span>
          </Button>
          <IconButton icon={Pencil} label="Edit vendor" onClick={() => openEdit(v)} />
          <IconButton
            icon={v.status === 'suspended' ? CheckCircle2 : Ban}
            label={v.status === 'suspended' ? 'Reactivate' : 'Suspend'}
            className={v.status === 'suspended' ? 'hover:text-emerald-400' : 'hover:text-rose-400'}
            onClick={() => toggleSuspend(v)}
          />
        </div>
      ),
    },
  ];

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="flex flex-col min-h-full bg-[#0a0a0b] light:bg-gray-50">
      <PageHeader
        title="Vendors"
        subtitle="Every organization on the platform"
        icon={Building2}
        iconGradient="bg-gradient-to-br from-violet-500 to-indigo-600 shadow-violet-500/20"
        actions={
          <Button size="sm" className="bg-violet-600 hover:bg-violet-500 text-white" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" /> Add vendor
          </Button>
        }
      />

      <div className="p-6">
        {error ? (
          <ErrorState title="Couldn't load vendors" description={error} onRetry={load} />
        ) : (
          <Card className={cardClass}>
            <CardContent className="pt-6 space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <SearchInput value={search} onChange={setSearch} placeholder="Search by name, slug or owner…" className="w-full sm:w-80" />
                <div className="flex gap-1 rounded-lg bg-white/[0.04] light:bg-gray-100 p-1">
                  {(['all', 'active', 'trial', 'suspended'] as StatusFilter[]).map((s) => (
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
                    </button>
                  ))}
                </div>
                <span className="ml-auto text-xs text-white/40 light:text-gray-400">{filtered.length} vendors</span>
              </div>
              <div className="overflow-x-auto">
                <DataTable
                  items={pageItems}
                  columns={columns}
                  isLoading={vendors === null}
                  emptyIcon={Building2}
                  emptyTitle="No vendors found"
                  emptyDescription={search || statusFilter !== 'all' ? 'Try a different search or filter.' : 'Add your first vendor to get started.'}
                  currentPage={page}
                  totalItems={filtered.length}
                  pageSize={pageSize}
                  onPageChange={setPage}
                />
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <form onSubmit={handleSave}>
            <DialogHeader>
              <DialogTitle>{editing ? `Edit ${editing.name}` : 'Add vendor'}</DialogTitle>
              <DialogDescription>
                {editing ? 'Change the vendor details, plan or status.' : 'Create a new organization on the platform.'}
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
                  <Select value={form.plan_id} onValueChange={(plan_id) => setForm({ ...form, plan_id })}>
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
              {editing ? (
                <div className="grid gap-1.5">
                  <Label className="text-xs">Renewal date</Label>
                  <Input type="date" value={form.renewal_date} onChange={set('renewal_date')} className={fieldClass} />
                </div>
              ) : (
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
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Create vendor'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VendorsView;
