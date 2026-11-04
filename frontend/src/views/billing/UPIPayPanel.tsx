import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import { Check, Copy, Loader2, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatPrice } from '@/services/superAdmin';
import { paymentsService, type CheckoutResponse } from '@/services/payments';
import { apiErrorMessage } from '@/views/public/publicApi';

/** Pay to the platform's UPI ID (QR / app link), then send us the transaction ID (UTR) to verify. */
export const UPIPayPanel: React.FC<{
  checkout: CheckoutResponse;
  onSubmitted: () => void;
  onCancel: () => void;
}> = ({ checkout, onSubmitted, onCancel }) => {
  const upi = checkout.upi!;
  const [copied, setCopied] = useState(false);
  const [reference, setReference] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(upi.upi_id);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Copy failed — select the UPI ID and copy it yourself');
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ref = reference.trim();
    if (ref.length < 6) {
      setError('Enter the UPI transaction ID / UTR from your UPI app (usually 12 digits)');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await paymentsService.submitUPI(checkout.payment_id, { reference: ref, ...(phone.trim() ? { phone: phone.trim() } : {}) });
      onSubmitted();
    } catch (err) {
      setError(apiErrorMessage(err, "We couldn't save the transaction ID. Please try again."));
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Pay by UPI</p>
        <p className="text-2xl font-black tabular-nums text-gray-900 dark:text-white">{formatPrice(checkout.amount)}</p>
      </div>

      <ol className="mt-4 space-y-4 text-sm">
        <li>
          <p className="font-semibold text-gray-800 dark:text-gray-100">1. Pay {formatPrice(checkout.amount)} from any UPI app</p>
          <div className="mt-3 flex justify-center">
            {/* White tile so the code scans in dark mode too. */}
            <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-white/10">
              <QRCodeSVG value={upi.uri} size={176} level="M" aria-label="UPI payment QR code" />
            </div>
          </div>
          <p className="mt-2 text-center text-[11px] text-gray-500 dark:text-gray-400">Scan with GPay, PhonePe, Paytm or your bank app</p>

          <div className="mt-3 flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">UPI ID{upi.payee_name ? ` · ${upi.payee_name}` : ''}</p>
              <p className="truncate font-mono text-sm font-semibold text-gray-900 dark:text-white">{upi.upi_id}</p>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={copy} className="h-8 shrink-0 text-xs" aria-label="Copy UPI ID">
              {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          {upi.note && (
            <p className="mt-1.5 text-[11px] text-gray-500 dark:text-gray-400">
              Add the note <span className="font-mono font-semibold text-gray-700 dark:text-gray-200">{upi.note}</span> if you pay manually.
            </p>
          )}

          <Button asChild variant="outline" className="mt-3 w-full border-emerald-500/50 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-500/10">
            <a href={upi.uri}>
              <Smartphone className="mr-1.5 h-4 w-4" /> Pay with UPI app
            </a>
          </Button>
          <p className="mt-1 text-center text-[11px] text-gray-500 dark:text-gray-400">Opens your UPI app on this phone</p>
        </li>

        <li>
          <p className="font-semibold text-gray-800 dark:text-gray-100">2. Tell us the transaction ID</p>
          <form onSubmit={submit} noValidate className="mt-2 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="upi-ref" className="text-xs">UPI transaction ID / UTR</Label>
              <Input
                id="upi-ref"
                value={reference}
                onChange={(e) => {
                  setReference(e.target.value);
                  setError(null);
                }}
                placeholder="e.g. 412345678901"
                inputMode="text"
                autoComplete="off"
                maxLength={64}
                disabled={submitting}
                aria-invalid={!!error || undefined}
                className="font-mono"
              />
              <p className="text-[11px] text-gray-500 dark:text-gray-400">Find it in your UPI app's payment details after paying.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="upi-phone" className="text-xs">
                Phone <span className="font-normal text-gray-400">(optional)</span>
              </Label>
              <Input
                id="upi-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="So we can reach you if needed"
                autoComplete="tel"
                inputMode="tel"
                maxLength={20}
                disabled={submitting}
              />
            </div>
            {error && (
              <p role="alert" className="rounded-lg border border-red-300/60 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                {error}
              </p>
            )}
            <Button
              type="submit"
              disabled={submitting}
              className="h-11 w-full bg-gradient-to-r from-teal-600 to-emerald-600 text-sm font-semibold text-white hover:from-teal-700 hover:to-emerald-700"
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              I've paid — submit for verification
            </Button>
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className="w-full text-center text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              Choose another way to pay
            </button>
          </form>
        </li>
      </ol>
    </div>
  );
};
