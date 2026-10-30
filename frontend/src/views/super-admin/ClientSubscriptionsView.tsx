import React, { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { ErrorState } from '@/components/shared/ErrorState';
import { DeleteConfirmDialog } from '@/components/shared/DeleteConfirmDialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CreditCard, Pencil, RefreshCw, Trash2, UserCog, Info } from 'lucide-react';
import { toast } from 'sonner';
import {
  superAdminService,
  formatPrice,
  cycleInfo,
  cyclePrice,
  subscriptionState,
  type Plan,
  type Vendor,
} from '@/services/superAdmin';
import { errorMessage, LoadingBlock } from './shared';
import { EntriesTable, longDate, StatusPill, type EntryColumn } from './EntriesTable';
import { SubscriptionDialog } from './SubscriptionDialog';

const stateTone = { active: 'green', trial: 'blue', idle: 'gray', expired: 'amber', suspended: 'red' } as const;

const frequencyText = (cycle: string | undefined) => cycleInfo(cycle).label.toLowerCase();

/** Every client subscription: manual/prepaid ones and automatic (gateway) ones. */
export const ClientSubscriptionsView: React.FC = () => {
  const [clients, setClients] = useState<Vendor[] | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [viewing, setViewing] = useState<Vendor | null>(null);
  const [toRemove, setToRemove] = useState<Vendor | null>(null);

  const load = () => {
    setError(null);
    Promise.all([superAdminService.listVendors(), superAdminService.listPlans()])
      .then(([c, p]) => {
        setClients(c);
        setPlans(p);
      })
      .catch((e) => setError(errorMessage(e)));
  };
  useEffect(load, []);

  const subscriptions = useMemo(() => (clients ?? []).filter((c) => c.plan_id), [clients]);
  const replace = (updated: Vendor) => setClients((list) => (list ?? []).map((c) => (c.id === updated.id ? updated : c)));

  const remove = async () => {
    if (!toRemove) return;
    try {
      replace(await superAdminService.updateVendor(toRemove.id, { plan_id: '', renewal_date: '' }));
      toast.success(`${toRemove.name}'s subscription removed`);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not remove the subscription'));
    } finally {
      setToRemove(null);
    }
  };

  const createdAt = (c: Vendor) => c.subscribed_at || c.created_at;

  const columns: EntryColumn<Vendor>[] = [
    {
      key: 'client',
      label: 'Client',
      sortValue: (c) => c.name,
      render: (c) => <span className="font-medium text-emerald-400 light:text-emerald-600">{c.name}</span>,
    },
    { key: 'plan', label: 'Plan', sortValue: (c) => c.plan_name ?? '', render: (c) => <span className="text-xs">{c.plan_name}</span> },
    {
      key: 'created',
      label: 'Created at',
      sortValue: (c) => new Date(createdAt(c)).getTime(),
      render: (c) => <span className="text-xs">{longDate(createdAt(c))}</span>,
    },
    {
      key: 'expiry',
      label: 'Expiry at',
      sortValue: (c) => (c.renewal_date ? new Date(c.renewal_date).getTime() : 0),
      render: (c) => <span className="text-xs">{longDate(c.renewal_date)}</span>,
    },
    {
      key: 'charges',
      label: 'Plan charges',
      sortValue: (c) => c.plan_amount ?? 0,
      render: (c) => <span className="text-xs tabular-nums">{formatPrice(c.plan_amount ?? 0)} INR</span>,
    },
    { key: 'frequency', label: 'Frequency', sortValue: (c) => cycleInfo(c.billing_cycle).months, render: (c) => <span className="text-xs">{frequencyText(c.billing_cycle)}</span> },
    {
      key: 'status',
      label: 'Status',
      sortValue: (c) => subscriptionState(c),
      render: (c) => {
        const s = subscriptionState(c);
        return <StatusPill tone={stateTone[s]}>{s}</StatusPill>;
      },
    },
    {
      key: 'action',
      label: 'Action',
      render: (c) => (
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" className="h-7 px-2.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white" onClick={() => setViewing(c)}>
            Subscription
          </Button>
          <Button size="sm" className="h-7 px-2.5 text-xs bg-slate-800 hover:bg-slate-700 text-white" onClick={() => setEditing(c)}>
            <Pencil className="h-3 w-3 mr-1" /> Update
          </Button>
          <Button size="sm" className="h-7 px-2.5 text-xs bg-rose-600 hover:bg-rose-500 text-white" onClick={() => setToRemove(c)}>
            <Trash2 className="h-3 w-3 mr-1" /> Delete
          </Button>
        </div>
      ),
    },
  ];

  const autoColumns: EntryColumn<Vendor>[] = [
    { key: 'client', label: 'Client', render: () => null },
    { key: 'plan', label: 'Plan', render: () => null },
    { key: 'payment_id', label: 'Payment ID', render: () => null },
    { key: 'payment_status', label: 'Payment status', render: () => null },
    { key: 'price_plan', label: 'Price plan', render: () => null },
    { key: 'created', label: 'Created at', render: () => null },
    { key: 'ends', label: 'Ends at', render: () => null },
  ];

  const viewPrice = viewing?.plan_id ? plans.find((p) => p.id === viewing.plan_id) : undefined;

  return (
    <div className="flex flex-col min-h-full bg-[#0a0a0b] light:bg-gray-50">
      <PageHeader
        title="Subscriptions"
        subtitle="Every client's subscription: plan, charges, frequency and expiry"
        icon={CreditCard}
        iconGradient="bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-500/20"
        actions={
          <Button size="sm" variant="outline" className="border-white/10 light:border-gray-200" onClick={load}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
        }
      />

      {error ? (
        <div className="p-6"><ErrorState title="Couldn't load subscriptions" description={error} onRetry={load} /></div>
      ) : !clients ? (
        <LoadingBlock />
      ) : (
        <div className="p-4 sm:p-6">
          <Tabs defaultValue="manual" className="space-y-4">
            <TabsList>
              <TabsTrigger value="manual"><UserCog className="h-3.5 w-3.5 mr-1.5" /> Manual/Prepaid ({subscriptions.length})</TabsTrigger>
              <TabsTrigger value="auto"><RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Auto</TabsTrigger>
            </TabsList>

            <TabsContent value="manual">
              <EntriesTable
                rows={subscriptions}
                columns={columns}
                getId={(c) => c.id}
                searchText={(c) => [c.name, c.plan_name, c.billing_cycle, subscriptionState(c)].join(' ')}
                defaultSort={{ key: 'created', dir: 'desc' }}
                emptyText="No subscriptions yet. Give a client a plan from Clients → Subscription."
                defaultPageSize={100}
              />
            </TabsContent>

            <TabsContent value="auto" className="space-y-3">
              <div className="flex items-start gap-2 rounded-lg border border-sky-500/20 bg-sky-500/10 p-3 text-xs text-sky-200 light:text-sky-800 light:bg-sky-50">
                <Info className="h-4 w-4 shrink-0 mt-px" />
                Auto subscriptions renew through a payment gateway. None is connected yet, so every subscription is manual/prepaid for now.
              </div>
              <EntriesTable rows={[]} columns={autoColumns} getId={(c) => c.id} searchText={() => ''} defaultPageSize={100} />
            </TabsContent>
          </Tabs>
        </div>
      )}

      <SubscriptionDialog client={editing} plans={plans} onClose={() => setEditing(null)} onSaved={replace} />

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>{viewing?.name}</DialogTitle>
            <DialogDescription>Subscription details</DialogDescription>
          </DialogHeader>
          {viewing && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 py-2 text-sm">
              <dt className="text-white/50 light:text-gray-500">Plan</dt>
              <dd className="font-medium">{viewing.plan_name}</dd>
              <dt className="text-white/50 light:text-gray-500">Frequency</dt>
              <dd>{cycleInfo(viewing.billing_cycle).label}</dd>
              <dt className="text-white/50 light:text-gray-500">Plan charges</dt>
              <dd>
                {formatPrice(viewing.plan_amount ?? 0)}
                {viewPrice && cyclePrice(viewPrice, viewing.billing_cycle ?? 'monthly').discount > 0 && (
                  <span className="ml-1 text-xs text-emerald-500">({cyclePrice(viewPrice, viewing.billing_cycle ?? 'monthly').discount}% off)</span>
                )}
              </dd>
              <dt className="text-white/50 light:text-gray-500">Status</dt>
              <dd><StatusPill tone={stateTone[subscriptionState(viewing)]}>{subscriptionState(viewing)}</StatusPill></dd>
              <dt className="text-white/50 light:text-gray-500">Created at</dt>
              <dd>{longDate(createdAt(viewing))}</dd>
              <dt className="text-white/50 light:text-gray-500">Expiry at</dt>
              <dd>{longDate(viewing.renewal_date)}</dd>
              <dt className="text-white/50 light:text-gray-500">Owner</dt>
              <dd className="break-all">{viewing.owner_name}{viewing.owner_email && ` · ${viewing.owner_email}`}</dd>
            </dl>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setViewing(null)}>Close</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-500 text-white"
              onClick={() => {
                setEditing(viewing);
                setViewing(null);
              }}
            >
              Update
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={!!toRemove}
        onOpenChange={(o) => !o && setToRemove(null)}
        title="Remove subscription"
        itemName={toRemove ? `${toRemove.name}'s ${toRemove.plan_name} subscription` : undefined}
        onConfirm={remove}
      />
    </div>
  );
};

export default ClientSubscriptionsView;
