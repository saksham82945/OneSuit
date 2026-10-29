/**
 * Page shell shared by every Ads Manager screen: the title bar with the ad
 * credit wallet, the AI sparkle shortcut, "Buy Credits" and "+ Create Ad".
 * It owns the Buy Credits and Create Ad dialogs and shares them with the page
 * (e.g. the quick-guide cards) through `useAdsPage()`.
 */
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { CheckCircle2, Clock, Loader2, Plus, Sparkles, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useBranding } from '@/services/branding';
import { useAuthStore } from '@/stores/auth';
import { cn } from '@/lib/utils';
import { adsApi, errorMessage, formatDate, formatMoney, useAdWallet, type AdType, type AdWallet, type AdsSetup, type CreditPack } from './adsApi';
import { inputCls, outlineBtnCls, primaryBtnCls } from './AdsShared';
import { AdCampaignDialog } from './AdCampaignDialog';
import { ConnectWhatsAppButton } from '@/components/whatsapp/ConnectWhatsAppButton';

interface AdsPageContextValue {
  brand: string;
  wallet: AdWallet | null;
  reloadWallet: () => void;
  openBuyCredits: (pack?: CreditPack) => void;
  openCreateAd: (type?: AdType) => void;
}

const AdsPageContext = createContext<AdsPageContextValue | null>(null);

/** Access the page shell's wallet and dialogs from inside an `AdsPage`. */
// eslint-disable-next-line react-refresh/only-export-components
export function useAdsPage(): AdsPageContextValue {
  const ctx = useContext(AdsPageContext);
  if (!ctx) throw new Error('useAdsPage must be used inside <AdsPage>');
  return ctx;
}

interface AdsPageProps {
  title: string;
  /** Kept for older call sites; the AiSensy-style header shows only the title. */
  subtitle?: string;
  icon?: unknown;
  setup?: AdsSetup | null;
  /** Extra buttons shown after "+ Create Ad". */
  actions?: React.ReactNode;
  /** Handle "+ Create Ad" yourself (e.g. to refresh a list after saving). */
  onCreateAd?: (type?: AdType) => void;
  /** Show the wallet and "Buy Credits" (default true). */
  showCredits?: boolean;
  /** Classes for the content area (defaults to a padded, centred column). */
  bodyClassName?: string;
  children: React.ReactNode;
}

export const AdsPage: React.FC<AdsPageProps> = ({ title, setup, actions, onCreateAd, showCredits = true, bodyClassName, children }) => {
  const { platform_name } = useBranding();
  const { hasPermission } = useAuthStore();
  const canWrite = hasPermission('campaigns', 'write');
  const { wallet, reload: reloadWallet } = useAdWallet();
  const [buyOpen, setBuyOpen] = useState(false);
  const [buyPack, setBuyPack] = useState<CreditPack | undefined>();
  const [createOpen, setCreateOpen] = useState(false);
  const [createType, setCreateType] = useState<AdType | undefined>();

  const openBuyCredits = useCallback((pack?: CreditPack) => {
    setBuyPack(pack);
    setBuyOpen(true);
  }, []);
  const openCreateAd = useCallback(
    (type?: AdType) => {
      if (onCreateAd) return onCreateAd(type);
      setCreateType(type);
      setCreateOpen(true);
    },
    [onCreateAd]
  );

  const ctx = useMemo(
    () => ({ brand: platform_name, wallet, reloadWallet, openBuyCredits, openCreateAd }),
    [platform_name, wallet, reloadWallet, openBuyCredits, openCreateAd]
  );
  const currency = wallet?.currency || setup?.currency || 'INR';

  return (
    <AdsPageContext.Provider value={ctx}>
      <div className="flex flex-col min-h-full bg-[#f8faf9] dark:bg-[#0a0f0e] text-gray-900 dark:text-gray-100">
        <header className="sticky top-0 z-20 border-b border-gray-200 dark:border-white/[0.08] bg-white/95 dark:bg-[#0d1312]/95 backdrop-blur shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3 min-h-16">
            <h1 className="text-lg font-semibold leading-tight truncate">{title}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <ConnectWhatsAppButton size="md" />
              {showCredits && (
                <>
                  <div
                    className="inline-flex items-center gap-1.5 h-9 rounded-xl border border-gray-200 bg-white px-3 text-xs font-medium text-gray-600 dark:bg-white/[0.04] dark:border-white/10 dark:text-gray-300"
                    title={wallet?.pending_amount ? `${formatMoney(wallet.pending_amount, currency)} waiting for payment confirmation` : 'Prepaid credit for running ads'}
                  >
                    <Wallet className="h-3.5 w-3.5 text-spruce dark:text-teal-300" />
                    Ad Credit:
                    <span className="font-bold text-gray-900 dark:text-white tabular-nums">{wallet ? formatMoney(wallet.balance, currency) : '—'}</span>
                  </div>
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Link
                          to="/ads/agent"
                          aria-label="Ads Agent (AI)"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-violet-600 hover:bg-violet-50 dark:bg-white/[0.04] dark:border-white/10 dark:text-violet-300"
                        >
                          <Sparkles className="h-4 w-4" />
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent>Generate ads with AI</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <Button variant="outline" size="sm" className={outlineBtnCls} onClick={() => openBuyCredits()}>
                    Buy Credits
                  </Button>
                </>
              )}
              {canWrite && (
                <Button size="sm" className={primaryBtnCls} onClick={() => openCreateAd()}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> Create Ad
                </Button>
              )}
              {actions}
            </div>
          </div>
        </header>
        <div className={bodyClassName ?? 'p-4 sm:p-6 space-y-5 max-w-7xl mx-auto w-full'}>{children}</div>
      </div>

      <BuyCreditsDialog open={buyOpen} onOpenChange={setBuyOpen} initialPack={buyPack} wallet={wallet} onRequested={reloadWallet} />
      {!onCreateAd && (
        <AdCampaignDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          campaign={null}
          defaultType={createType}
          currency={currency}
          pageName={setup?.page_name}
          onSaved={() => toast.success('Ad saved as a draft — find it in Ads Manager')}
        />
      )}
    </AdsPageContext.Provider>
  );
};

// ---------------------------------------------------------------------------
// Buy Credits
// ---------------------------------------------------------------------------

const PACKS: { key: CreditPack; name: string; amount: number; tag: string }[] = [
  { key: 'starter', name: 'Ads Starter Pack', amount: 5000, tag: 'FREE SETUP' },
  { key: 'growth', name: 'Ads Growth Pack', amount: 10000, tag: 'RECOMMENDED' },
];

const BuyCreditsDialog: React.FC<{
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initialPack?: CreditPack;
  wallet: AdWallet | null;
  onRequested: () => void;
}> = ({ open, onOpenChange, initialPack, wallet, onRequested }) => {
  const [choice, setChoice] = useState<CreditPack | 'custom'>('growth');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const currency = wallet?.currency || 'INR';

  // Reset each time the dialog opens (render-time sync avoids an effect).
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setChoice(initialPack || 'growth');
      setAmount('');
      setError(null);
      setDone(null);
    }
  }

  const submit = async () => {
    const custom = Number(amount);
    if (choice === 'custom' && (!Number.isFinite(custom) || custom < 500)) {
      setError('Enter an amount of at least ₹500.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await adsApi.topupWallet(choice === 'custom' ? { amount: custom } : { pack: choice });
      setDone(res?.message || 'Our team will contact you to complete the payment.');
      onRequested();
    } catch (err) {
      setError(errorMessage(err, 'Could not request credits'));
    } finally {
      setSaving(false);
    }
  };

  const pending = (wallet?.transactions || []).filter((t) => t.status === 'pending');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-lg rounded-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader className="text-left">
          <DialogTitle className="text-base">Buy ad credits</DialogTitle>
          <DialogDescription className="text-xs">
            Current balance: <span className="font-semibold text-gray-900 dark:text-white">{formatMoney(wallet?.balance ?? 0, currency)}</span>
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-600" />
            <p className="text-sm font-bold">Request received</p>
            <p className="max-w-sm text-xs leading-relaxed text-gray-500 dark:text-gray-400">{done}</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Credit pack">
              {PACKS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  role="radio"
                  aria-checked={choice === p.key}
                  onClick={() => setChoice(p.key)}
                  className={cn(
                    'rounded-xl border p-3 text-left transition-colors',
                    choice === p.key ? 'border-spruce ring-1 ring-spruce bg-spruce-light dark:bg-teal-950/40' : 'border-gray-200 hover:bg-gray-50 dark:border-white/10 dark:hover:bg-white/[0.04]'
                  )}
                >
                  <span className="text-[9px] font-bold tracking-wider text-spruce dark:text-teal-300">{p.tag}</span>
                  <span className="block text-lg font-bold tabular-nums">{formatMoney(p.amount, currency)}</span>
                  <span className="block text-[11px] text-gray-500 dark:text-gray-400">{p.name}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              role="radio"
              aria-checked={choice === 'custom'}
              onClick={() => setChoice('custom')}
              className={cn(
                'w-full rounded-xl border p-3 text-left text-xs font-semibold transition-colors',
                choice === 'custom' ? 'border-spruce ring-1 ring-spruce bg-spruce-light dark:bg-teal-950/40' : 'border-gray-200 hover:bg-gray-50 dark:border-white/10'
              )}
            >
              Custom amount
            </button>
            {choice === 'custom' && (
              <Input
                type="number"
                min={500}
                step={100}
                className={inputCls}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Amount in ₹ (min 500)"
                aria-label="Custom amount"
              />
            )}
            <p className="rounded-xl bg-gray-50 px-3 py-2 text-[11px] leading-relaxed text-gray-500 dark:bg-white/[0.04] dark:text-gray-400">
              Online payment is coming soon. We'll record your request and our team will contact you to complete the payment — credit is added
              as soon as it's confirmed.
            </p>
            {pending.length > 0 && (
              <div className="space-y-1">
                <p className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">Pending requests</p>
                {pending.slice(0, 3).map((t) => (
                  <p key={t.id} className="flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-300">
                    <Clock className="h-3 w-3" /> {formatMoney(t.amount, t.currency)} {t.pack_name ? `· ${t.pack_name}` : ''} · {formatDate(t.created_at)}
                  </p>
                ))}
              </div>
            )}
            {error && (
              <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:bg-rose-950/30 dark:border-rose-900/60 dark:text-rose-200">
                {error}
              </p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" className={outlineBtnCls} onClick={() => onOpenChange(false)}>
            {done ? 'Close' : 'Cancel'}
          </Button>
          {!done && (
            <Button size="sm" className={primaryBtnCls} onClick={submit} disabled={saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />} Request credits
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
