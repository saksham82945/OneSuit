import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowUpRight, CalendarClock, CircleDot, FileText, Loader2, Rocket, Sparkles, TrendingUp } from 'lucide-react';
import { useBranding } from '@/services/branding';
import { supportService } from '@/services/support';
import { cn } from '@/lib/utils';
import { errorMessage } from './adsApi';
import { cardCls } from './AdsShared';
import { useAdsPage } from './AdsPageShell';

interface GuideCard {
  key: string;
  title: string;
  subtitle: string;
  tag?: string;
  icon: React.ElementType;
  highlight?: boolean;
  onClick: () => void;
}

/**
 * "META ADS QUICK GUIDE" + "Fund your ads or launch a campaign" block shown at
 * the top of Setup, Audiences and other Ads screens. Must render inside <AdsPage>.
 */
export const AdsQuickGuide: React.FC<{ className?: string }> = ({ className }) => {
  const { openBuyCredits, openCreateAd, brand } = useAdsPage();
  const { support_email } = useBranding();
  const navigate = useNavigate();
  const [booking, setBooking] = useState(false);

  const bookDemo = async () => {
    if (support_email) {
      const subject = encodeURIComponent(`Book a demo call: Meta Ads on ${brand}`);
      window.location.href = `mailto:${support_email}?subject=${subject}`;
      return;
    }
    setBooking(true);
    try {
      await supportService.create({
        subject: 'Book a demo call: Meta Ads',
        description: 'I would like a demo call to set up and launch Facebook & Instagram ads that land on WhatsApp.',
        priority: 'medium',
      });
      toast.success('Demo request sent — our team will reach out to schedule a call');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not request a demo'));
    } finally {
      setBooking(false);
    }
  };

  const cards: GuideCard[] = [
    { key: 'starter', title: '₹5,000', subtitle: 'Ads Starter Pack', tag: 'FREE SETUP', icon: Rocket, onClick: () => openBuyCredits('starter') },
    { key: 'growth', title: '₹10,000', subtitle: 'Ads Growth Pack', tag: 'RECOMMENDED', icon: TrendingUp, highlight: true, onClick: () => openBuyCredits('growth') },
    { key: 'status', title: 'Launch WhatsApp', subtitle: 'Status Ads', tag: 'NEW', icon: CircleDot, onClick: () => openCreateAd('whatsapp_status') },
    { key: 'lead', title: 'Launch Lead', subtitle: 'Form Ads', icon: FileText, onClick: () => openCreateAd('lead_form') },
    { key: 'ai', title: 'Generate Ads', subtitle: 'with AI', tag: 'AI', icon: Sparkles, onClick: () => navigate('/ads#generate') },
    { key: 'demo', title: 'Book a Demo', subtitle: 'Call', icon: booking ? Loader2 : CalendarClock, onClick: bookDemo },
  ];

  return (
    <section className={cn('grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]', className)}>
      <div className={cn(cardCls, 'relative overflow-hidden p-5 bg-gradient-to-br from-spruce-light via-white to-white dark:from-teal-950/40 dark:via-transparent dark:to-transparent')}>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-spruce dark:text-teal-300">Meta Ads Quick Guide</p>
        <h2 className="mt-2 text-lg font-bold leading-snug">Launch your Ads on WhatsApp, Facebook &amp; Instagram</h2>
        <p className="mt-1.5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
          Learn how to add ad credit, choose an objective and launch your first ad.
        </p>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
          <a
            href="https://www.facebook.com/business/ads"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-semibold text-spruce-dark hover:underline dark:text-teal-300"
          >
            How to run Ads <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
          <a
            href="https://www.facebook.com/business/help/447934475640650"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-semibold text-spruce-dark hover:underline dark:text-teal-300"
          >
            Click to WhatsApp Ads setup tutorial <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      <div className={cn(cardCls, 'p-5')}>
        <h2 className="text-sm font-bold">Fund your ads or launch a campaign</h2>
        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {cards.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={c.onClick}
              disabled={c.key === 'demo' && booking}
              className={cn(
                'group relative flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors disabled:opacity-60',
                c.highlight
                  ? 'border-spruce bg-spruce-light ring-1 ring-spruce dark:bg-teal-950/40 dark:border-teal-700'
                  : 'border-gray-200 bg-white hover:border-teal-300 hover:bg-gray-50 dark:bg-transparent dark:border-white/10 dark:hover:bg-white/[0.04]'
              )}
            >
              {c.tag && (
                <span
                  className={cn(
                    'absolute right-2 top-2 rounded px-1.5 py-0.5 text-[8px] font-bold tracking-wider',
                    c.tag === 'AI' || c.tag === 'NEW'
                      ? 'bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200'
                      : c.highlight
                        ? 'bg-spruce-dark text-white'
                        : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                  )}
                >
                  {c.tag}
                </span>
              )}
              <c.icon className={cn('h-4 w-4 text-spruce dark:text-teal-300', c.key === 'demo' && booking && 'animate-spin')} />
              <span className="mt-1 text-sm font-bold leading-tight">{c.title}</span>
              <span className="text-[11px] text-gray-500 dark:text-gray-400">{c.subtitle}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
};
