import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Eye, EyeOff, Globe, Mail, MessageSquare, Phone } from 'lucide-react';
import { ThemeToggle } from './site/SiteKit';
import { resolveAssetUrl, useBranding } from '@/services/branding';
import { Input, type InputProps } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/**
 * The platform's mark: the uploaded logo when there is one, else the emerald
 * chat icon. Pass `logoUrl` to override the shared branding (e.g. a preview).
 */
export const BrandMark: React.FC<{ className?: string; iconClassName?: string; logoUrl?: string }> = ({
  className,
  iconClassName,
  logoUrl,
}) => {
  const branding = useBranding();
  const src = resolveAssetUrl(logoUrl ?? branding.logo_url);
  // Remember which URL failed so a new upload gets a fresh chance.
  const [failedSrc, setFailedSrc] = useState('');
  if (src && failedSrc !== src) {
    return (
      <div
        className={cn(
          'rounded-xl overflow-hidden flex items-center justify-center shrink-0 bg-white/[0.04] light:bg-white',
          className ?? 'h-9 w-9'
        )}
      >
        <img
          src={src}
          alt={`${branding.platform_name} logo`}
          className="h-full w-full object-contain"
          onError={() => setFailedSrc(src)}
        />
      </div>
    );
  }
  return (
    <div
      className={cn(
        'rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-lg shadow-emerald-500/20 shrink-0',
        className ?? 'h-9 w-9'
      )}
    >
      <MessageSquare className={cn('text-white light:text-gray-900', iconClassName ?? 'h-5 w-5')} />
    </div>
  );
};

/**
 * "Back" link for public pages: goes to the previous page in this site, or to
 * the home page when the visitor arrived here directly.
 */
export const BackButton: React.FC<{ className?: string; label?: string }> = ({ className, label = 'Back' }) => {
  const navigate = useNavigate();
  const goBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate('/');
  };
  return (
    <button
      type="button"
      onClick={goBack}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
        'border-white/10 bg-white/[0.04] text-white/70 hover:text-white hover:bg-white/[0.08]',
        'light:border-gray-200 light:bg-white light:text-gray-600 light:hover:text-gray-900 light:hover:bg-gray-50',
        className
      )}
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      {label}
    </button>
  );
};

/** Back button and theme switch pinned to the top of a full-screen public page. */
export const PublicTopBar: React.FC = () => (
  <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between p-4">
    <BackButton />
    <ThemeToggle />
  </div>
);

/** "example.com/path" for display. */
const displayUrl = (url: string) => url.replace(/^https?:\/\//i, '').replace(/\/$/, '');

const footerLinkClass =
  'text-white/60 hover:text-emerald-400 light:text-gray-700 light:hover:text-emerald-600 break-all';

interface PublicShellProps {
  /** Right side of the header (links). */
  headerActions?: React.ReactNode;
  children: React.ReactNode;
}

/** Page frame for the public website pages: header, soft glow, footer. */
export const PublicShell: React.FC<PublicShellProps> = ({ headerActions, children }) => {
  const { platform_name, support_email, support_phone, contact_address, website_url } = useBranding();
  const phoneHref = support_phone.replace(/[^\d+]/g, '');
  const hasContact = !!(support_email || support_phone || contact_address || website_url);
  return (
    <div className="relative min-h-screen flex flex-col bg-[#0a0a0b] text-white light:bg-gradient-to-br light:from-gray-50 light:to-gray-100 light:text-gray-900 overflow-x-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[480px] bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(16,185,129,0.12),transparent)] light:bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(16,185,129,0.10),transparent)]"
      />
      <header className="relative z-10 border-b border-white/[0.06] light:border-gray-200">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <BackButton className="mr-1 shrink-0" />
          <Link to="/" className="flex items-center gap-2.5 min-w-0">
            <BrandMark />
            <span className="truncate text-base font-semibold tracking-tight text-white light:text-gray-900">
              {platform_name}
            </span>
          </Link>
          <nav className="flex shrink-0 items-center gap-1 sm:gap-2 text-sm">
            {headerActions}
            <ThemeToggle className="ml-1" />
          </nav>
        </div>
      </header>

      <main className="relative z-10 flex-1">{children}</main>

      <footer className="relative z-10 border-t border-white/[0.06] light:border-gray-200">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 text-xs text-white/40 sm:flex-row sm:items-start sm:justify-between sm:px-6 light:text-gray-500">
          <div className="space-y-1 text-center sm:text-left">
            <p className="font-medium text-white/60 light:text-gray-700">
              © {new Date().getFullYear()} {platform_name}
            </p>
            {contact_address && <p className="whitespace-pre-line">{contact_address}</p>}
          </div>
          {hasContact && (
            <ul className="flex flex-col items-center gap-1.5 sm:items-end">
              {support_email && (
                <li className="flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <a href={`mailto:${support_email}`} className={footerLinkClass}>
                    {support_email}
                  </a>
                </li>
              )}
              {support_phone && (
                <li className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <a href={`tel:${phoneHref}`} className={footerLinkClass}>
                    {support_phone}
                  </a>
                </li>
              )}
              {website_url && (
                <li className="flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <a href={website_url} target="_blank" rel="noopener noreferrer" className={footerLinkClass}>
                    {displayUrl(website_url)}
                  </a>
                </li>
              )}
            </ul>
          )}
        </div>
      </footer>
    </div>
  );
};

/** Quiet text link for the header. */
export const HeaderLink: React.FC<{ to: string; children: React.ReactNode; primary?: boolean }> = ({
  to,
  children,
  primary,
}) => (
  <Link
    to={to}
    className={cn(
      'rounded-lg px-3 py-1.5 font-medium transition-colors',
      primary
        ? 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-md shadow-emerald-600/20'
        : 'text-white/70 hover:text-white hover:bg-white/[0.04] light:text-gray-600 light:hover:text-gray-900 light:hover:bg-gray-100'
    )}
  >
    {children}
  </Link>
);

export const cardClass =
  'rounded-2xl border border-white/[0.08] bg-[#141415] light:bg-white light:border-gray-200 light:shadow-xl';

export const inputClass =
  'h-10 bg-white/[0.02] border-white/[0.1] placeholder:text-white/25 light:bg-white light:border-gray-200 light:placeholder:text-gray-400';

export const errorInputClass = 'border-red-500/60 focus-visible:ring-red-500/60';

interface FieldProps {
  id: string;
  label: string;
  optional?: boolean;
  hint?: React.ReactNode;
  error?: string;
  children: React.ReactNode;
}

/** Label + control + hint/error, with the error wired to aria-describedby by id. */
export const Field: React.FC<FieldProps> = ({ id, label, optional, hint, error, children }) => (
  <div className="space-y-2">
    <Label htmlFor={id} className="flex items-center justify-between text-white/70 light:text-gray-700">
      <span>{label}</span>
      {optional && <span className="text-xs font-normal text-white/30 light:text-gray-400">Optional</span>}
    </Label>
    {children}
    {error ? (
      <p id={`${id}-error`} className="flex items-center gap-1.5 text-xs text-red-400 light:text-red-600">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
        {error}
      </p>
    ) : hint ? (
      <p id={`${id}-hint`} className="text-xs text-white/40 light:text-gray-500">
        {hint}
      </p>
    ) : null}
  </div>
);

/** Password input with a show/hide toggle. */
export const PasswordInput = React.forwardRef<HTMLInputElement, InputProps & { invalid?: boolean }>(
  ({ className, invalid, ...props }, ref) => {
    const [visible, setVisible] = useState(false);
    return (
      <div className="relative">
        <Input
          ref={ref}
          type={visible ? 'text' : 'password'}
          className={cn(inputClass, 'pr-10', invalid && errorInputClass, className)}
          aria-invalid={invalid || undefined}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-white/40 hover:text-white/80 focus-visible:outline-none focus-visible:text-emerald-400 light:text-gray-400 light:hover:text-gray-700"
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          tabIndex={0}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    );
  }
);
PasswordInput.displayName = 'PasswordInput';

/** Form-level error / notice box. */
export const FormAlert: React.FC<{
  children: React.ReactNode;
  tone?: 'error' | 'info';
  className?: string;
}> = ({ children, tone = 'error', className }) => (
  <div
    role={tone === 'error' ? 'alert' : 'status'}
    className={cn(
      'flex gap-2.5 rounded-lg border px-3 py-2.5 text-sm',
      tone === 'error'
        ? 'border-red-500/25 bg-red-500/[0.08] text-red-200 light:border-red-200 light:bg-red-50 light:text-red-700'
        : 'border-amber-500/25 bg-amber-500/[0.08] text-amber-100 light:border-amber-200 light:bg-amber-50 light:text-amber-800',
      className
    )}
  >
    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
    <div className="min-w-0 space-y-1">{children}</div>
  </div>
);
