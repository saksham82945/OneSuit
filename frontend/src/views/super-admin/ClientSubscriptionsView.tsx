import React, { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { ErrorState } from '@/components/shared/ErrorState';
import { DeleteConfirmDialog } from '@/components/shared/DeleteConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlarmClock,
  Ban,
  CalendarClock,
  CalendarPlus,
  CalendarX,
  CheckCircle2,
  CreditCard,
  Eye,
  FileText,
  FlaskConical,
  IndianRupee,
  Info,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
  UserCog,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  superAdminService,
  formatPrice,
  BILLING_CYCLES,
  cycleInfo,
  cyclePrice,
  subscriptionState,
  type BillingInterval,
  type Plan,
  type Vendor,
} from '@/services/superAdmin';
import { cardClass, errorMessage, fieldClass, LoadingBlock, StatCard, SubscriptionStateBadge } from './shared';
import { EntriesTable, longDate, type EntryColumn } from './EntriesTable';
import { SubscriptionDialog } from './SubscriptionDialog';
import { ClientInvoicesDialog } from './subscriptions/ClientInvoicesDialog';
import { InvoiceNote, QuickActionDialog, type QuickAction } from './subscriptions/QuickActionDialog';
import {
  DEFAULT_FILTERS,
  expiryLabel,
  isSubscriptionRow,
  matchesFilters,
  summarize,
  type ExpiryFilter,
  type StateFilter,
  type SubscriptionFilters,
} from './subscriptions/metrics';

type SortKey = 'renewal' | 'newest' | 'name' | 'price';
const PAGE = 50;

const toneClass = {
  red: 'text-rose-400 light:text-rose-600',
  amber: 'text-amber-400 light:text-amber-600',
  yellow: 'text-yellow-300 light:text-yellow-700',
  green: 'text-emerald-400 light:text-emerald-600',
  muted: 'text-white/40 light:text-gray-400',
};

const createdAt = (c: Vendor) => c.subscribed_at || c.created_at;
const renewalTime = (c: Vendor) => (c.renewal_date ? new Date(c.renewal_date).getTime() : Number.POSITIVE_INFINITY);

const sorters: Record<SortKey, (a: Vendor, b: Vendor) => number> = {
  renewal: (a, b) => renewalTime(a) - renewalTime(b),
  newest: (a, b) => new Date(createdAt(b)).getTime() - new Date(createdAt(a)).getTime(),
  name: (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  price: (a, b) => (b.plan_amount ?? 0) - (a.plan_amount ?? 0),
};

const RenewalCell: React.FC<{ client: Vendor }> = ({ client }) => {
  const label = expiryLabel(client);
  return (
    <div className="leading-tight">
      <span className="block text-xs">{client.renewal_date ? longDate(client.renewal_date) : '—'}</span>
      <span className={cn('block text-[11px] font-medium', toneClass[label.tone])}>{label.text}</span>
    </div>
  );
};

const PriceCell: React.FC<{ client: Vendor }> = ({ client }) => {
  if (!client.plan_id) return <span className="text-xs text-white/40 light:text-gray-400">—</span>;
  const months = cycleInfo(client.billing_cycle).months;
  const amount = client.plan_amount ?? 0;
  return (
    <div className="leading-tight">
      <span className="block text-sm font-medium tabular-nums">{formatPrice(amount)}</span>
      <span className="block text-[11px] text-white/40 light:text-gray-500">
        {months > 1 ? `${formatPrice(Math.round(amount / months))}/mo · ` : ''}per {cycleInfo(client.billing_cycle).short}
      </span>
    </div>
  );
};

/** Every client subscription with summary numbers, filters and quick actions. */
export const ClientSubscriptionsView: React.FC = () => {
  const [clients, setClients] = useState<Vendor[] | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [viewing, setViewing] = useState<Vendor | null>(null);
  const [toRemove, setToRemove] = useState<Vendor | null>(null);
  const [invoicesFor, setInvoicesFor] = useState<Vendor | null>(null);
  const [quick, setQuick] = useState<QuickAction | null>(null);
  const [filters, setFilters] = useState<SubscriptionFilters>(DEFAULT_FILTERS);
  const [sort, setSort] = useState<SortKey>('renewal');
  const [limit, setLimit] = useState(PAGE);

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
  useEffect(() => setLimit(PAGE), [filters, sort]);

  const subscriptions = useMemo(() => (clients ?? []).filter(isSubscriptionRow), [clients]);
  const summary = useMemo(() => summarize(subscriptions), [subscriptions]);
  const rows = useMemo(
    () => subscriptions.filter((c) => matchesFilters(c, filters)).sort(sorters[sort]),
    [subscriptions, filters, sort]
  );
  const replace = (updated: Vendor) => setClients((list) => (list ?? []).map((c) => (c.id === updated.id ? updated : c)));
  const set = <K extends keyof SubscriptionFilters>(key: K, value: SubscriptionFilters[K]) => setFilters((f) => ({ ...f, [key]: value }));
  const filtered = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);
  /** Summary cards double as one-click filters. */
  const quickFilter = (f: Partial<SubscriptionFilters>) => setFilters({ ...DEFAULT_FILTERS, ...f });

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

  const actions = (c: Vendor) => (
    <div className="flex items-center gap-1.5">
      <Button
        size="sm"
        variant="outline"
        className="h-8 px-2.5 text-xs border-white/10 light:border-gray-200"
        onClick={() => setInvoicesFor(c)}
      >
        <FileText className="h-3.5 w-3.5 mr-1" /> Invoices
      </Button>
      {c.plan_id && (
        <Button
          size="sm"
          className="h-8 px-2.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white"
          title={`Push the expiry date forward by one ${cycleInfo(c.billing_cycle).short}`}
          onClick={() => setQuick({ kind: 'renew', client: c })}
        >
          <CalendarPlus className="h-3.5 w-3.5 mr-1" /> Renew +1
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" aria-label={`More actions for ${c.name}`}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => setViewing(c)}><Eye className="h-4 w-4 mr-2" /> View details</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setEditing(c)}><Pencil className="h-4 w-4 mr-2" /> Change plan / cycle…</DropdownMenuItem>
          {c.status === 'suspended' ? (
            <DropdownMenuItem onClick={() => setQuick({ kind: 'activate', client: c })}>
              <CheckCircle2 className="h-4 w-4 mr-2" /> Activate
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => setQuick({ kind: 'suspend', client: c })}>
              <Ban className="h-4 w-4 mr-2" /> Suspend
            </DropdownMenuItem>
          )}
          {c.plan_id && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-rose-500 focus:text-rose-500" onClick={() => setToRemove(c)}>
                <Trash2 className="h-4 w-4 mr-2" /> Remove subscription
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  const autoColumns: EntryColumn<Vendor>[] = [
    { key: 'client', label: 'Client', render: () => null },
    { key: 'plan', label: 'Plan', render: () => null },
    { key: 'payment_id', label: 'Payment ID', render: () => null },
    { key: 'payment_status', label: 'Payment status', render: () => null },
    { key: 'price_plan', label: 'Price plan', render: () => null },
    { key: 'created', label: 'Created at', render: () => null },
    { key: 'ends', label: 'Ends at', render: () => null },
  ];

  const viewPlan = viewing?.plan_id ? plans.find((p) => p.id === viewing.plan_id) : undefined;
  const viewDiscount = viewPlan ? cyclePrice(viewPlan, viewing?.billing_cycle ?? 'monthly').discount : 0;
  const visible = rows.slice(0, limit);

  return (
    <div className="flex flex-col min-h-full bg-[#0a0a0b] light:bg-gray-50">
      <PageHeader
        title="Subscriptions"
        subtitle="Every client's plan, billing cycle, renewal and invoices"
        icon={CreditCard}
        iconGradient="bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-500/20"
        actions={
          <Button size="sm" variant="outline" className="border-white/10 light:border-gray-200" onClick={load}>
            <RefreshCw className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">Refresh</span>
          </Button>
        }
      />

      {error ? (
        <div className="p-6"><ErrorState title="Couldn't load subscriptions" description={error} onRetry={load} /></div>
      ) : !clients ? (
        <LoadingBlock />
      ) : (
        <div className="p-4 sm:p-6 space-y-4">
          {/* Summary: each card also filters the list */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
            {(
              [
                { label: 'Active', value: summary.active, icon: CheckCircle2, tone: 'emerald', f: { state: 'active' } },
                { label: 'Trial', value: summary.trial, icon: FlaskConical, tone: 'blue', f: { state: 'trial' } },
                { label: 'Suspended', value: summary.suspended, icon: Ban, tone: 'rose', f: { state: 'suspended' } },
                { label: 'Expiring in 7 days', value: summary.expiring7, icon: AlarmClock, tone: 'amber', f: { expiry: '7' } },
                { label: 'Expiring in 30 days', value: summary.expiring30, icon: CalendarClock, tone: 'violet', f: { expiry: '30' } },
                { label: 'Expired', value: summary.expired, icon: CalendarX, tone: 'rose', f: { state: 'expired' } },
              ] as const
            ).map((card) => {
              const on = Object.entries(card.f).every(([k, v]) => filters[k as keyof SubscriptionFilters] === v);
              return (
                <button
                  key={card.label}
                  type="button"
                  onClick={() => (on ? setFilters(DEFAULT_FILTERS) : quickFilter(card.f))}
                  className={cn('rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-emerald-500', on && 'ring-2 ring-emerald-500/70')}
                  aria-pressed={on}
                  title={on ? 'Clear this filter' : `Show only: ${card.label.toLowerCase()}`}
                >
                  <StatCard label={card.label} value={card.value} icon={card.icon} tone={card.tone} />
                </button>
              );
            })}
            <div className="col-span-2 xl:col-span-1">
              <StatCard
                label="Est. MRR"
                value={formatPrice(summary.mrr)}
                icon={IndianRupee}
                tone="emerald"
                hint={`${summary.payingClients} paying client${summary.payingClients === 1 ? '' : 's'} · cycle price ÷ months`}
              />
            </div>
          </div>

          <Tabs defaultValue="manual" className="space-y-4">
            <TabsList>
              <TabsTrigger value="manual"><UserCog className="h-3.5 w-3.5 mr-1.5" /> Manual/Prepaid ({subscriptions.length})</TabsTrigger>
              <TabsTrigger value="auto"><RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Auto</TabsTrigger>
            </TabsList>

            <TabsContent value="manual" className="space-y-3">
              {/* Filters */}
              <div className={cn('rounded-xl border p-3', cardClass)}>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-[minmax(0,2fr)_repeat(5,minmax(0,1fr))]">
                  <div className="relative col-span-2 md:col-span-3 xl:col-span-1">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40 light:text-gray-400" />
                    <Input
                      value={filters.search}
                      onChange={(e) => set('search', e.target.value)}
                      placeholder="Search client, owner, email or plan"
                      className={cn('pl-8', fieldClass)}
                      aria-label="Search subscriptions"
                    />
                  </div>
                  <Select value={filters.state} onValueChange={(v) => set('state', v as StateFilter)}>
                    <SelectTrigger className={fieldClass} aria-label="Status"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="trial">Trial</SelectItem>
                      <SelectItem value="expired">Expired</SelectItem>
                      <SelectItem value="suspended">Suspended</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={filters.planId} onValueChange={(v) => set('planId', v)}>
                    <SelectTrigger className={fieldClass} aria-label="Plan"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All plans</SelectItem>
                      <SelectItem value="none">No plan</SelectItem>
                      {plans.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}{!p.is_active && ' (inactive)'}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={filters.cycle} onValueChange={(v) => set('cycle', v as 'all' | BillingInterval)}>
                    <SelectTrigger className={fieldClass} aria-label="Billing cycle"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All cycles</SelectItem>
                      {BILLING_CYCLES.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={filters.expiry} onValueChange={(v) => set('expiry', v as ExpiryFilter)}>
                    <SelectTrigger className={fieldClass} aria-label="Expiry"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any expiry</SelectItem>
                      <SelectItem value="7">Expiring in 7 days</SelectItem>
                      <SelectItem value="30">Expiring in 30 days</SelectItem>
                      <SelectItem value="expired">Already expired</SelectItem>
                      <SelectItem value="none">No expiry date</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                    <SelectTrigger className={fieldClass} aria-label="Sort"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="renewal">Sort: renewal soonest</SelectItem>
                      <SelectItem value="newest">Sort: newest first</SelectItem>
                      <SelectItem value="name">Sort: name A–Z</SelectItem>
                      <SelectItem value="price">Sort: price high–low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-white/50 light:text-gray-500">
                  <span>
                    Showing {Math.min(limit, rows.length)} of {rows.length}
                    {rows.length !== subscriptions.length && ` (filtered from ${subscriptions.length})`}
                  </span>
                  {filtered && (
                    <button type="button" className="inline-flex items-center gap-1 hover:text-white light:hover:text-gray-900" onClick={() => setFilters(DEFAULT_FILTERS)}>
                      <X className="h-3.5 w-3.5" /> Clear filters
                    </button>
                  )}
                </div>
              </div>

              <InvoiceNote>
                <b>Billing:</b> renewing, changing the plan or cycle, or activating a client issues a <b>paid invoice</b> for one cycle automatically
                when the client ends up active. Suspending or editing a trial/suspended client never bills.
              </InvoiceNote>

              {rows.length === 0 ? (
                <div className={cn('rounded-xl border p-10 text-center text-sm text-white/50 light:text-gray-500', cardClass)}>
                  {subscriptions.length === 0
                    ? 'No subscriptions yet. Give a client a plan from Clients → Subscription.'
                    : 'No client matches these filters.'}
                </div>
              ) : (
                <>
                  {/* Phone / tablet: cards */}
                  <ul className="space-y-2 lg:hidden">
                    {visible.map((c) => (
                      <li key={c.id} className={cn('rounded-xl border p-3', cardClass)}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-emerald-400 light:text-emerald-600">{c.name}</p>
                            <p className="truncate text-xs text-white/50 light:text-gray-500">{c.owner_name || '—'}{c.owner_email && ` · ${c.owner_email}`}</p>
                          </div>
                          <SubscriptionStateBadge state={subscriptionState(c)} />
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-3">
                          <div>
                            <p className="text-[11px] text-white/40 light:text-gray-500">Plan</p>
                            <p className="text-sm">{c.plan_name || 'No plan'}</p>
                            {c.plan_id && <p className="text-[11px] text-white/40 light:text-gray-500">{cycleInfo(c.billing_cycle).label}</p>}
                          </div>
                          <div>
                            <p className="text-[11px] text-white/40 light:text-gray-500">Price</p>
                            <PriceCell client={c} />
                          </div>
                          <div className="col-span-2">
                            <p className="text-[11px] text-white/40 light:text-gray-500">Renewal</p>
                            <RenewalCell client={c} />
                          </div>
                        </div>
                        <div className="mt-3 border-t border-white/[0.06] pt-3 light:border-gray-100">{actions(c)}</div>
                      </li>
                    ))}
                  </ul>

                  {/* Desktop: table */}
                  <div className={cn('hidden overflow-x-auto rounded-xl border lg:block', cardClass)}>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/[0.08] text-left text-xs text-white/50 light:border-gray-200 light:text-gray-500">
                          <th className="px-4 py-2.5 font-medium">Client</th>
                          <th className="px-3 py-2.5 font-medium">Plan</th>
                          <th className="px-3 py-2.5 font-medium">Price for cycle</th>
                          <th className="px-3 py-2.5 font-medium">Status</th>
                          <th className="px-3 py-2.5 font-medium">Renewal</th>
                          <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visible.map((c) => (
                          <tr key={c.id} className="border-b border-white/[0.05] last:border-0 hover:bg-white/[0.02] light:border-gray-100 light:hover:bg-gray-50">
                            <td className="px-4 py-2.5 max-w-[260px]">
                              <span className="block truncate font-medium text-emerald-400 light:text-emerald-600">{c.name}</span>
                              <span className="block truncate text-[11px] text-white/50 light:text-gray-500">{c.owner_name || '—'}{c.owner_email && ` · ${c.owner_email}`}</span>
                            </td>
                            <td className="px-3 py-2.5">
                              <span className="block text-sm">{c.plan_name || <span className="text-white/40 light:text-gray-400">No plan</span>}</span>
                              {c.plan_id && <span className="block text-[11px] text-white/40 light:text-gray-500">{cycleInfo(c.billing_cycle).label}</span>}
                            </td>
                            <td className="px-3 py-2.5"><PriceCell client={c} /></td>
                            <td className="px-3 py-2.5"><SubscriptionStateBadge state={subscriptionState(c)} /></td>
                            <td className="px-3 py-2.5"><RenewalCell client={c} /></td>
                            <td className="px-4 py-2.5"><div className="flex justify-end">{actions(c)}</div></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {rows.length > limit && (
                    <div className="flex justify-center">
                      <Button variant="outline" size="sm" className="border-white/10 light:border-gray-200" onClick={() => setLimit((l) => l + PAGE)}>
                        Show {Math.min(PAGE, rows.length - limit)} more
                      </Button>
                    </div>
                  )}
                </>
              )}
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
      <ClientInvoicesDialog client={invoicesFor} onClose={() => setInvoicesFor(null)} />
      <QuickActionDialog action={quick} onClose={() => setQuick(null)} onSaved={replace} />

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>{viewing?.name}</DialogTitle>
            <DialogDescription>Subscription details</DialogDescription>
          </DialogHeader>
          {viewing && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 py-2 text-sm">
              <dt className="text-white/50 light:text-gray-500">Plan</dt>
              <dd className="font-medium">{viewing.plan_name || 'No plan'}</dd>
              <dt className="text-white/50 light:text-gray-500">Frequency</dt>
              <dd>{cycleInfo(viewing.billing_cycle).label}</dd>
              <dt className="text-white/50 light:text-gray-500">Plan charges</dt>
              <dd>
                {formatPrice(viewing.plan_amount ?? 0)}
                {viewDiscount > 0 && <span className="ml-1 text-xs text-emerald-500">({viewDiscount}% off)</span>}
              </dd>
              <dt className="text-white/50 light:text-gray-500">Status</dt>
              <dd><SubscriptionStateBadge state={subscriptionState(viewing)} /></dd>
              <dt className="text-white/50 light:text-gray-500">Created at</dt>
              <dd>{longDate(createdAt(viewing))}</dd>
              <dt className="text-white/50 light:text-gray-500">Expiry at</dt>
              <dd>
                {longDate(viewing.renewal_date)}
                <span className={cn('block text-xs', toneClass[expiryLabel(viewing).tone])}>{expiryLabel(viewing).text}</span>
              </dd>
              <dt className="text-white/50 light:text-gray-500">Owner</dt>
              <dd className="break-all">{viewing.owner_name}{viewing.owner_email && ` · ${viewing.owner_email}`}</dd>
              <dt className="text-white/50 light:text-gray-500">Team / contacts</dt>
              <dd>{viewing.users_count} users · {viewing.contacts_count.toLocaleString()} contacts</dd>
            </dl>
          )}
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setViewing(null)}>Close</Button>
            <Button
              variant="outline"
              className="border-white/10 light:border-gray-200"
              onClick={() => {
                setInvoicesFor(viewing);
                setViewing(null);
              }}
            >
              Invoices
            </Button>
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
