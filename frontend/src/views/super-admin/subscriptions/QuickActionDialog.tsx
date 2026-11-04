import React, { useState } from 'react';
import { Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { superAdminService, cycleInfo, formatDate, formatPrice, type Vendor, type VendorInput } from '@/services/superAdmin';
import { errorMessage } from '../shared';
import { nextRenewalDate } from './metrics';

export type QuickAction = { kind: 'renew' | 'suspend' | 'activate'; client: Vendor };

/** Note shown wherever a change can bill the client. */
export const InvoiceNote: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200 light:border-amber-200 light:bg-amber-50 light:text-amber-800">
    <Info className="mt-px h-4 w-4 shrink-0" />
    <span>{children}</span>
  </div>
);

/** Confirm and apply one quick action: renew by one cycle, suspend or re-activate. */
export const QuickActionDialog: React.FC<{
  action: QuickAction | null;
  onClose: () => void;
  onSaved: (client: Vendor) => void;
}> = ({ action, onClose, onSaved }) => {
  const [saving, setSaving] = useState(false);
  const c = action?.client;
  const cycle = cycleInfo(c?.billing_cycle);
  const amount = c?.plan_amount ?? 0;
  const billable = !!c?.plan_id && amount > 0;

  let title = '';
  let body: React.ReactNode = null;
  let change: VendorInput = {};
  let invoices = false;
  let confirm = '';
  if (action && c) {
    if (action.kind === 'renew') {
      const next = nextRenewalDate(c);
      title = `Renew ${c.name} for one more ${cycle.short}`;
      body = (
        <>
          Expiry moves from <b>{formatDate(c.renewal_date)}</b> to <b>{formatDate(next)}</b> ({cycle.label.toLowerCase()} cycle
          {c.plan_name ? ` on ${c.plan_name}` : ''}).
        </>
      );
      change = { renewal_date: next };
      invoices = billable && c.status === 'active';
      confirm = 'Renew';
    } else if (action.kind === 'suspend') {
      title = `Suspend ${c.name}?`;
      body = 'Their team loses access until you activate them again. The plan and expiry date are kept. No invoice is issued.';
      change = { status: 'suspended' };
      confirm = 'Suspend';
    } else {
      title = `Activate ${c.name}?`;
      body = `Their team gets access again${c.plan_name ? ` on the ${c.plan_name} plan` : ''}.`;
      change = { status: 'active' };
      invoices = billable;
      confirm = 'Activate';
    }
  }

  const apply = async () => {
    if (!c) return;
    setSaving(true);
    try {
      const updated = await superAdminService.updateVendor(c.id, change);
      toast.success(
        action?.kind === 'renew'
          ? `${c.name} renewed until ${formatDate(updated.renewal_date)}`
          : `${c.name} ${action?.kind === 'suspend' ? 'suspended' : 'activated'}`
      );
      onSaved(updated);
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not update the subscription'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!action} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild>
            <p>{body}</p>
          </DialogDescription>
        </DialogHeader>
        {invoices && (
          <InvoiceNote>
            This issues a <b>paid invoice of {formatPrice(amount)}</b> ({cycle.label.toLowerCase()}) to {c?.name} automatically.
          </InvoiceNote>
        )}
        {action?.kind === 'renew' && !invoices && billable && (
          <p className="text-xs text-white/50 light:text-gray-500">No invoice is issued because the client isn't active right now.</p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            className={action?.kind === 'suspend' ? 'bg-rose-600 hover:bg-rose-500 text-white' : 'bg-emerald-600 hover:bg-emerald-500 text-white'}
            disabled={saving}
            onClick={apply}
          >
            {saving ? 'Saving…' : confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
