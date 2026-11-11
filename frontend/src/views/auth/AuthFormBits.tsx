import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpCircle, Check, IndianRupee, KeyRound, LifeBuoy, Lock, Mail, Phone, ShieldCheck, UserCog } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useBranding } from '@/services/branding';
import { useLegalPages } from './authHooks';

// Small building blocks shared by the sign-in, sign-up, invite and demo pages.

// --- Caps Lock -------------------------------------------------------------------

export const CapsLockHint: React.FC<{ show: boolean; id?: string }> = ({ show, id }) =>
  show ? (
    <p
      id={id}
      role="status"
      className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-amber-400 light:text-amber-700"
    >
      <ArrowUpCircle className="h-3.5 w-3.5" aria-hidden />
      Caps Lock is on
    </p>
  ) : null;

// --- Forgot password -------------------------------------------------------------

/**
 * There is no self-service password reset on the server, so this explains who can
 * help: a team member asks their admin, a business owner contacts support.
 */
export const ForgotPasswordDialog: React.FC<{ open: boolean; onOpenChange: (v: boolean) => void }> = ({
  open,
  onOpenChange,
}) => {
  const { platform_name: platformName, support_email: supportEmail, support_phone: supportPhone } = useBranding();
  const phoneHref = supportPhone.replace(/[^\d+]/g, '');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-500">
            <KeyRound className="h-5 w-5" aria-hidden />
          </div>
          <DialogTitle>Forgot your password?</DialogTitle>
          <DialogDescription>
            For your security, passwords on {platformName} are reset by a person, not by email link.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-3 text-sm">
          <li className="flex gap-3 rounded-lg border border-border p-3">
            <UserCog className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
            <div>
              <p className="font-medium">Part of a team?</p>
              <p className="text-muted-foreground">
                Ask your workspace admin to set a new password for you from <span className="font-medium">Users</span>.
              </p>
            </div>
          </li>
          <li className="flex gap-3 rounded-lg border border-border p-3">
            <LifeBuoy className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
            <div className="min-w-0">
              <p className="font-medium">Own the workspace?</p>
              <p className="text-muted-foreground">
                Contact {platformName} support from the email you signed up with and we'll help you get back in.
              </p>
              {(supportEmail || supportPhone) && (
                <div className="mt-2 flex flex-col gap-1">
                  {supportEmail && (
                    <a
                      href={`mailto:${supportEmail}?subject=${encodeURIComponent('Password help')}`}
                      className="inline-flex items-center gap-1.5 break-all font-medium text-emerald-600 hover:underline dark:text-emerald-400"
                    >
                      <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      {supportEmail}
                    </a>
                  )}
                  {supportPhone && (
                    <a
                      href={`tel:${phoneHref}`}
                      className="inline-flex items-center gap-1.5 font-medium text-emerald-600 hover:underline dark:text-emerald-400"
                    >
                      <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      {supportPhone}
                    </a>
                  )}
                </div>
              )}
            </div>
          </li>
        </ul>
        <DialogFooter>
          <Button
            type="button"
            className="bg-emerald-600 text-white hover:bg-emerald-500"
            onClick={() => onOpenChange(false)}
          >
            Back to sign in
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// --- Terms & privacy -------------------------------------------------------------

const legalLinkClass =
  'font-medium text-emerald-400 underline-offset-2 hover:underline light:text-emerald-700';

export const ConsentCheckbox: React.FC<{
  checked: boolean;
  onChange: (v: boolean) => void;
  error?: string;
  disabled?: boolean;
  inputRef?: (el: HTMLInputElement | null) => void;
}> = ({ checked, onChange, error, disabled, inputRef }) => {
  const { terms, privacy } = useLegalPages();
  return (
    <div>
      <label
        htmlFor="consent"
        className={cn(
          'flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors',
          error
            ? 'border-red-500/50 bg-red-500/[0.05] light:border-red-300 light:bg-red-50'
            : 'border-white/[0.08] bg-white/[0.02] hover:border-emerald-500/30 light:border-gray-200 light:bg-gray-50'
        )}
      >
        <input
          id="consent"
          ref={inputRef}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? 'consent-error' : undefined}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded accent-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
        />
        <span className="text-white/65 light:text-gray-600">
          I agree to the{' '}
          {terms ? (
            <Link to={`/p/${terms.slug}`} target="_blank" rel="noopener" className={legalLinkClass}>
              Terms &amp; Conditions
            </Link>
          ) : (
            'Terms & Conditions'
          )}{' '}
          and{' '}
          {privacy ? (
            <Link to={`/p/${privacy.slug}`} target="_blank" rel="noopener" className={legalLinkClass}>
              Privacy Policy
            </Link>
          ) : (
            'Privacy Policy'
          )}
          .
        </span>
      </label>
      {error && (
        <p id="consent-error" className="mt-1.5 text-xs text-red-400 light:text-red-600">
          {error}
        </p>
      )}
    </div>
  );
};

// --- Trust badges ----------------------------------------------------------------

const TRUST = [
  { icon: Lock, text: 'Secure payments by Razorpay' },
  { icon: IndianRupee, text: 'Pay with UPI, card or net banking' },
  { icon: ShieldCheck, text: 'Official WhatsApp Business API' },
];

export const TrustBadges: React.FC<{ className?: string; compact?: boolean }> = ({ className, compact }) => (
  <ul className={cn('flex flex-wrap gap-2', className)} aria-label="Why it's safe">
    {TRUST.map(({ icon: Icon, text }) => (
      <li
        key={text}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] text-white/60 light:border-gray-200 light:bg-white light:text-gray-600',
          compact ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs'
        )}
      >
        <Icon className="h-3.5 w-3.5 text-emerald-400 light:text-emerald-600" aria-hidden />
        {text}
      </li>
    ))}
  </ul>
);

// --- Step progress ---------------------------------------------------------------

export const StepProgress: React.FC<{ steps: string[]; current: number; onStep?: (i: number) => void }> = ({
  steps,
  current,
  onStep,
}) => (
  <nav aria-label="Sign-up progress" className="mb-6">
    <ol className="flex items-center gap-3">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        const clickable = !!onStep && done;
        return (
          <li key={label} className="flex min-w-0 flex-1 items-center gap-3">
            <button
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onStep?.(i)}
              aria-current={active ? 'step' : undefined}
              className={cn(
                'flex min-w-0 items-center gap-2 rounded-md text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60',
                clickable ? 'cursor-pointer' : 'cursor-default'
              )}
            >
              <span
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors duration-300',
                  done
                    ? 'border-emerald-500 bg-emerald-500 text-white'
                    : active
                      ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300 light:bg-emerald-50 light:text-emerald-700'
                      : 'border-white/15 text-white/40 light:border-gray-300 light:text-gray-400'
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" aria-hidden /> : i + 1}
              </span>
              <span
                className={cn(
                  'truncate font-medium',
                  active || done ? 'text-white/90 light:text-gray-900' : 'text-white/40 light:text-gray-400'
                )}
              >
                {label}
                <span className="sr-only">{done ? ' (done)' : active ? ' (current step)' : ''}</span>
              </span>
            </button>
            {i < steps.length - 1 && (
              <span className="relative h-0.5 min-w-4 flex-1 overflow-hidden rounded-full bg-white/[0.08] light:bg-gray-200" aria-hidden>
                <span
                  className="auth-progress-fill absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-500 to-teal-400"
                  style={{ width: done ? '100%' : '0%' }}
                />
              </span>
            )}
          </li>
        );
      })}
    </ol>
  </nav>
);
