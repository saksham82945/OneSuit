import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Image as ImageIcon, Info, type LucideIcon, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { type AdCreative, type AdType, type AdStatus, type AdsSetup, formatMoney } from './adsApi';

// ---------------------------------------------------------------------------
// Style tokens (light-first, matching ContactsView / the AiSensy-style shell)
// ---------------------------------------------------------------------------

export const cardCls =
  'rounded-2xl border border-gray-200/90 bg-white shadow-sm dark:bg-[#141b1a] dark:border-[#1e2a28]';
export const inputCls =
  'h-9 text-xs rounded-lg bg-white border-gray-200 text-gray-900 placeholder:text-gray-400 focus-visible:ring-teal-600 dark:bg-white/[0.04] dark:border-white/10 dark:text-gray-100';
export const textareaCls =
  'text-xs rounded-lg bg-white border-gray-200 text-gray-900 placeholder:text-gray-400 focus-visible:ring-teal-600 dark:bg-white/[0.04] dark:border-white/10 dark:text-gray-100';
export const primaryBtnCls = 'h-9 rounded-xl bg-spruce-dark hover:bg-spruce text-white text-xs font-semibold px-4 shadow-sm';
export const outlineBtnCls =
  'h-9 rounded-xl border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 hover:text-gray-900 dark:bg-transparent dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/[0.06]';
export const nativeSelectCls =
  'h-9 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-teal-600 disabled:opacity-50 dark:bg-white/[0.04] dark:border-white/10 dark:text-gray-100';

// ---------------------------------------------------------------------------
// Page shell
// ---------------------------------------------------------------------------

interface AdsPageProps {
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  actions?: React.ReactNode;
  /** Shown as a pill in the header ("Ad credit: ₹500.00"). */
  setup?: AdsSetup | null;
  children: React.ReactNode;
}

export const AdsPage: React.FC<AdsPageProps> = ({ title, subtitle, icon: Icon, actions, setup, children }) => (
  <div className="flex flex-col min-h-full bg-[#f8faf9] dark:bg-[#0a0f0e] text-gray-900 dark:text-gray-100">
    <header className="border-b border-gray-200 dark:border-white/[0.08] bg-white/95 dark:bg-[#0d1312]/95 backdrop-blur shrink-0">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3 min-h-16">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 rounded-xl bg-spruce-light text-spruce-dark dark:bg-teal-950/60 dark:text-teal-300 flex items-center justify-center shrink-0">
            <Icon className="h-[18px] w-[18px]" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold leading-tight truncate">{title}</h1>
            {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{subtitle}</p>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {setup && <AdCreditPill setup={setup} />}
          {actions}
        </div>
      </div>
    </header>
    <div className="p-4 sm:p-6 space-y-5 max-w-7xl mx-auto w-full">{children}</div>
  </div>
);

export const AdCreditPill: React.FC<{ setup: AdsSetup }> = ({ setup }) => (
  <div
    className="inline-flex items-center gap-1.5 h-9 rounded-xl border border-teal-200/70 bg-spruce-light px-3 text-xs font-semibold text-spruce-dark dark:bg-teal-950/50 dark:border-teal-900 dark:text-teal-200"
    title="Prepaid credit available for running ads"
  >
    <Wallet className="h-3.5 w-3.5" />
    Ad credit: {formatMoney(setup.ad_credit, setup.currency)}
  </div>
);

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

export const StatTile: React.FC<{
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  tone?: 'teal' | 'blue' | 'amber' | 'violet';
  hint?: string;
}> = ({ label, value, icon: Icon, tone = 'teal', hint }) => {
  const tones = {
    teal: 'bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300',
    blue: 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
    violet: 'bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300',
  };
  return (
    <div className={cn(cardCls, 'p-4')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
          <p className="mt-1 text-xl font-bold tabular-nums truncate">{value}</p>
        </div>
        <div className={cn('h-9 w-9 rounded-xl flex items-center justify-center shrink-0', tones[tone])}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      {hint && <p className="mt-1.5 text-[11px] text-gray-400 dark:text-gray-500">{hint}</p>}
    </div>
  );
};

const statusStyles: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700 dark:bg-white/[0.08] dark:text-gray-300',
  active: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
  paused: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
  ended: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  published: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
};

export const StatusBadge: React.FC<{ status: AdStatus | 'published' | string }> = ({ status }) => (
  <span
    className={cn(
      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize',
      statusStyles[status] || statusStyles.draft
    )}
  >
    <span
      className={cn(
        'h-1.5 w-1.5 rounded-full',
        status === 'active' || status === 'published' ? 'bg-emerald-500' : status === 'paused' ? 'bg-amber-500' : 'bg-gray-400'
      )}
    />
    {status}
  </span>
);

export const Pill: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <span
    className={cn(
      'inline-flex items-center whitespace-nowrap rounded-full border border-teal-200/60 bg-teal-50 px-2 py-0.5 text-[10px] font-semibold text-teal-800 dark:bg-teal-950/50 dark:border-teal-900 dark:text-teal-300',
      className
    )}
  >
    {children}
  </span>
);

export const Field: React.FC<{
  label: string;
  htmlFor?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}> = ({ label, htmlFor, hint, required, className, children }) => (
  <div className={cn('space-y-1.5', className)}>
    <Label htmlFor={htmlFor} className="text-xs font-semibold text-gray-700 dark:text-gray-300">
      {label}
      {required && <span className="text-rose-500"> *</span>}
    </Label>
    {children}
    {hint && <p className="text-[11px] text-gray-400 dark:text-gray-500">{hint}</p>}
  </div>
);

export const EmptyCard: React.FC<{
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}> = ({ icon: Icon, title, description, action }) => (
  <div className={cn(cardCls, 'flex flex-col items-center justify-center px-6 py-12 text-center')}>
    <div className="mb-3.5 flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-600 dark:bg-teal-950/40 dark:text-teal-400">
      <Icon className="h-6 w-6" />
    </div>
    <p className="text-sm font-bold">{title}</p>
    <p className="mt-1 max-w-md text-xs leading-relaxed text-gray-500 dark:text-gray-400">{description}</p>
    {action && <div className="mt-4">{action}</div>}
  </div>
);

/** Inline banner nudging the user to finish Setup. */
export const SetupNotice: React.FC<{ setup: AdsSetup | null }> = ({ setup }) => {
  if (!setup) return null;
  const done = Object.values(setup.steps).filter(Boolean).length;
  if (done === 4) return null;
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 dark:bg-amber-950/30 dark:border-amber-900/60 dark:text-amber-200">
      <div className="flex items-start gap-2.5">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <p className="text-xs leading-relaxed">
          <span className="font-semibold">Finish setting up Ads Manager ({done}/4 steps).</span> You can build drafts now, but ads can only go
          live after Facebook, your ad page and WhatsApp number are connected.
        </p>
      </div>
      <Link
        to="/ads/setup"
        className="inline-flex items-center gap-1 text-xs font-semibold text-amber-900 hover:underline shrink-0 dark:text-amber-200"
      >
        Go to setup <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Phone-style ad preview (Facebook / Instagram feed card)
// ---------------------------------------------------------------------------

export const AdPreview: React.FC<{
  type: AdType;
  creative: Partial<AdCreative>;
  pageName?: string;
  className?: string;
}> = ({ type, creative, pageName, className }) => {
  const name = pageName || 'Your Business';
  const showWhatsApp = type === 'click_to_whatsapp' || type === 'whatsapp_status' || type === 'website_to_whatsapp';
  const cta = creative.cta || (showWhatsApp ? 'Send WhatsApp message' : type === 'lead_form' ? 'Sign up' : 'Learn more');
  const domain = (() => {
    if (!creative.website_url) return '';
    try {
      return new URL(creative.website_url.startsWith('http') ? creative.website_url : `https://${creative.website_url}`).hostname;
    } catch {
      return creative.website_url;
    }
  })();

  return (
    <div className={cn('mx-auto w-full max-w-[280px]', className)}>
      <div className="rounded-[2rem] border-[6px] border-gray-900 bg-gray-900 shadow-xl dark:border-black">
        <div className="relative overflow-hidden rounded-[1.6rem] bg-gray-100 dark:bg-[#0b0f0e]">
          {/* status bar */}
          <div className="flex items-center justify-between px-5 pt-2 pb-1 text-[9px] font-semibold text-gray-700 dark:text-gray-300">
            <span>9:41</span>
            <span className="h-3.5 w-16 rounded-full bg-gray-900 dark:bg-black" />
            <span>5G</span>
          </div>
          <div className="px-2 pb-3 space-y-2">
            {type === 'whatsapp_status' ? (
              <div className="relative h-[380px] overflow-hidden rounded-xl bg-gradient-to-b from-teal-700 to-spruce-dark text-white">
                <div className="absolute top-2 left-2 right-2 h-0.5 rounded-full bg-white/30">
                  <div className="h-full w-1/3 rounded-full bg-white" />
                </div>
                <div className="flex items-center gap-2 px-3 pt-5">
                  <div className="h-7 w-7 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold">
                    {name[0]?.toUpperCase()}
                  </div>
                  <div className="text-[10px] leading-tight">
                    <p className="font-semibold">{name}</p>
                    <p className="opacity-70">Sponsored</p>
                  </div>
                </div>
                <PreviewImage url={creative.image_url} className="mx-3 mt-3 h-44 rounded-lg" />
                <p className="px-3 pt-3 text-[11px] font-semibold leading-snug">{creative.headline || 'Your headline goes here'}</p>
                <p className="px-3 pt-1 text-[10px] leading-snug opacity-85 line-clamp-3">
                  {creative.primary_text || 'Primary text appears here.'}
                </p>
                <div className="absolute bottom-3 left-3 right-3 rounded-full bg-white py-1.5 text-center text-[10px] font-bold text-spruce-dark">
                  {cta}
                </div>
              </div>
            ) : (
              <div className="rounded-xl bg-white shadow-sm dark:bg-[#151c1b]">
                <div className="flex items-center gap-2 px-3 py-2">
                  <div className="h-7 w-7 rounded-full bg-spruce-dark text-white flex items-center justify-center text-[10px] font-bold">
                    {name[0]?.toUpperCase()}
                  </div>
                  <div className="text-[10px] leading-tight min-w-0">
                    <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{name}</p>
                    <p className="text-gray-500">Sponsored · 🌐</p>
                  </div>
                </div>
                <p className="px-3 pb-2 text-[10px] leading-snug text-gray-800 dark:text-gray-200 line-clamp-4 whitespace-pre-line">
                  {creative.primary_text || 'Primary text appears here. Tell people what you offer and why they should message you.'}
                </p>
                <PreviewImage url={creative.image_url} className="h-40" />
                <div className="flex items-center justify-between gap-2 bg-gray-50 px-3 py-2 dark:bg-white/[0.04]">
                  <div className="min-w-0">
                    {domain && type !== 'click_to_whatsapp' && (
                      <p className="text-[8px] uppercase text-gray-500 truncate">{domain}</p>
                    )}
                    <p className="text-[10px] font-semibold text-gray-900 dark:text-gray-100 line-clamp-2">
                      {creative.headline || 'Your headline goes here'}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 rounded-md px-2 py-1 text-[9px] font-bold',
                      showWhatsApp ? 'bg-[#25D366] text-white' : 'bg-gray-200 text-gray-800 dark:bg-white/10 dark:text-gray-100'
                    )}
                  >
                    {cta}
                  </span>
                </div>
              </div>
            )}

            {showWhatsApp && type !== 'whatsapp_status' && (
              <div className="rounded-xl bg-[#e7ddd4] p-2 dark:bg-[#0b141a]">
                <p className="mb-1 text-center text-[8px] font-semibold uppercase tracking-wider text-gray-500">
                  Opens in WhatsApp
                </p>
                <div className="ml-auto max-w-[85%] rounded-lg rounded-tr-none bg-[#d9fdd3] px-2 py-1.5 text-[10px] text-gray-800 shadow-sm dark:bg-[#005c4b] dark:text-gray-100">
                  {creative.welcome_message || 'Hi! I saw your ad and want to know more.'}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const PreviewImage: React.FC<{ url?: string; className?: string }> = ({ url, className }) => {
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => setFailed(false), [url]);
  if (url && !failed) {
    return <img src={url} alt="" onError={() => setFailed(true)} className={cn('w-full object-cover', className)} />;
  }
  return (
    <div
      className={cn(
        'flex w-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-teal-100 via-emerald-50 to-cyan-100 text-teal-700/70 dark:from-teal-950 dark:via-emerald-950 dark:to-cyan-950 dark:text-teal-300/60',
        className
      )}
    >
      <ImageIcon className="h-6 w-6" />
      <span className="text-[9px] font-medium">Ad image</span>
    </div>
  );
};
