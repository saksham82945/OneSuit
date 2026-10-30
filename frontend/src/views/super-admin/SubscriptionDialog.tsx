import React, { useEffect, useState } from 'react';
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
import { toast } from 'sonner';
import {
  superAdminService,
  formatPrice,
  BILLING_CYCLES,
  cycleInfo,
  cyclePrice,
  NO_PLAN,
  type BillingInterval,
  type Plan,
  type Vendor,
  type VendorStatus,
} from '@/services/superAdmin';
import { fieldClass, errorMessage } from './shared';
import { cn } from '@/lib/utils';

const monthsFromToday = (months: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
};

/** Change a client's plan, billing cycle, status and expiry date. */
export const SubscriptionDialog: React.FC<{
  client: Vendor | null;
  plans: Plan[];
  onClose: () => void;
  onSaved: (client: Vendor) => void;
}> = ({ client, plans, onClose, onSaved }) => {
  const [planId, setPlanId] = useState(NO_PLAN);
  const [cycle, setCycle] = useState<BillingInterval>('monthly');
  const [status, setStatus] = useState<VendorStatus>('active');
  const [expiry, setExpiry] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!client) return;
    setPlanId(client.plan_id ?? NO_PLAN);
    setCycle(client.billing_cycle ?? 'monthly');
    setStatus(client.status);
    setExpiry(client.renewal_date ? client.renewal_date.slice(0, 10) : '');
  }, [client]);

  const plan = plans.find((p) => p.id === planId);

  const save = async () => {
    if (!client) return;
    setSaving(true);
    try {
      const updated = await superAdminService.updateVendor(client.id, {
        plan_id: planId === NO_PLAN ? '' : planId,
        billing_cycle: cycle,
        status,
        renewal_date: expiry,
      });
      toast.success(`${client.name}'s subscription updated`);
      onSaved(updated);
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not update the subscription'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!client} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Subscription · {client?.name}</DialogTitle>
          <DialogDescription>Choose the plan, how often they pay, the status and when it expires.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">Plan</Label>
              <Select
                value={planId}
                onValueChange={(v) => {
                  setPlanId(v);
                  if (v !== NO_PLAN) setExpiry(monthsFromToday(cycleInfo(cycle).months));
                }}
              >
                <SelectTrigger className={fieldClass}><SelectValue /></SelectTrigger>
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
              <Select value={status} onValueChange={(v) => setStatus(v as VendorStatus)}>
                <SelectTrigger className={fieldClass}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="trial">Trial</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {plan && (
            <div className="grid gap-1.5">
              <Label className="text-xs">Frequency</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {BILLING_CYCLES.map((c) => {
                  const price = cyclePrice(plan, c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setCycle(c.id);
                        setExpiry(monthsFromToday(c.months));
                      }}
                      className={cn(
                        'rounded-lg border px-2 py-2 text-left transition-colors',
                        cycle === c.id ? 'border-emerald-500 bg-emerald-500/10 light:bg-emerald-50' : 'border-white/10 hover:bg-white/[0.04] light:border-gray-200 light:hover:bg-gray-50'
                      )}
                    >
                      <span className="block text-[11px] font-semibold">{c.label}</span>
                      <span className="block text-xs tabular-nums">{formatPrice(price.total)}</span>
                      {price.discount > 0 && <span className="block text-[10px] font-semibold text-emerald-500">{price.discount}% off</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="grid gap-1.5">
            <Label className="text-xs">Expiry date</Label>
            <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className={fieldClass} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-500 text-white" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : 'Save subscription'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
