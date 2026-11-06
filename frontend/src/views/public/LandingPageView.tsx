import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  Check,
  CheckCircle2,
  ExternalLink,
  FileText,
  IndianRupee,
  KeyRound,
  ListChecks,
  Megaphone,
  MessageCircle,
  MessageSquareReply,
  Plus,
  QrCode,
  Rocket,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Target,
  UserPlus,
  Users,
  Webhook,
  type LucideIcon,
} from 'lucide-react';
import { useBranding } from '@/services/branding';
import { usePublicSite, type SiteContent } from '@/services/siteContent';
import { BILLING_CYCLES, cycleDiscount, cyclePrice, formatPrice, type BillingInterval } from '@/services/superAdmin';
import { planLimits, usePublicPlans, type PublicPlan } from './publicApi';
import { ACCENTS, Reveal, SiteAnimations, SiteFooter, SiteHeader, SiteIcon, type NavLinkItem } from './site/SiteKit';
import { AdsMock, BotFlowMock, CampaignMock, Counter, HeroPhone, InboxMock, InsightsMock } from './site/LandingMocks';
import { LandingMotionContext, useInView, usePrefersReducedMotion } from './site/landingMotion';
import { cn } from '@/lib/utils';
import './landing-motion.css';

const container = 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8';
const sectionTitle = 'text-3xl sm:text-4xl lg:text-[2.75rem] font-extrabold text-gray-900 dark:text-white font-ubuntu tracking-tight leading-[1.15]';
const sectionText = 'mt-4 text-base sm:text-lg text-gray-600 dark:text-gray-400 leading-relaxed';
const primaryBtn =
  'lp-sheen group inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-bold shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 hover:-translate-y-0.5 transition-all';

/** Small label above a section title: a pulsing dot and uppercase text. */
const Eyebrow: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <span
    className={cn(
      'inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
      className
    )}
  >
    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
    {children}
  </span>
);

const SectionHead: React.FC<{ eyebrow: string; title: React.ReactNode; text?: React.ReactNode; className?: string }> = ({
  eyebrow,
  title,
  text,
  className,
}) => (
  <Reveal className={cn('text-center max-w-3xl mx-auto mb-14', className)}>
    <Eyebrow>{eyebrow}</Eyebrow>
    <h2 className={cn(sectionTitle, 'mt-4')}>{title}</h2>
    {text && <p className={sectionText}>{text}</p>}
  </Reveal>
);

export const LandingPageView: React.FC = () => {
  const { content, pages } = usePublicSite();
  const reducedMotion = usePrefersReducedMotion();
  const motion = content.animations_enabled && content.animation_style !== 'none' && !reducedMotion;

  // Open the section named in the URL (e.g. /#pricing from another page).
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;
    const t = setTimeout(() => document.querySelector(hash)?.scrollIntoView({ behavior: 'smooth' }), 150);
    return () => clearTimeout(t);
  }, []);

  const nav = useMemo<NavLinkItem[]>(
    () =>
      [
        content.show_features && { label: 'Features', section: 'features' },
        content.show_solutions && { label: 'Solutions', section: 'solutions' },
        content.show_pricing && { label: 'Pricing', section: 'pricing' },
        content.show_faq && { label: 'FAQ', section: 'faq' },
        { label: 'Contact', section: 'contact' },
      ].filter(Boolean) as NavLinkItem[],
    [content]
  );

  return (
    <SiteAnimations content={content}>
      <LandingMotionContext.Provider value={motion}>
        <div
          className={cn(
            'min-h-screen bg-white text-gray-900 dark:bg-[#071014] dark:text-white antialiased selection:bg-emerald-500/20 overflow-x-hidden',
            motion && 'lp-motion'
          )}
        >
          <SiteHeader content={content} pages={pages} nav={nav} />
          <Hero content={content} />
          <IndustryMarquee />
          {content.show_why && content.why_cards.length > 0 && <WhySection content={content} />}
          {content.show_features && content.features.length > 0 && <FeaturesSection content={content} />}
          {content.show_solutions && <ProductTour />}
          <StatsBand />
          <HowItWorks />
          <MoreTools />
          {content.show_pricing && <PricingSection content={content} />}
          {content.show_faq && content.faqs.length > 0 && <FaqSection content={content} />}
          <ContactBand content={content} />
          <SiteFooter content={content} pages={pages} nav={nav} />
        </div>
      </LandingMotionContext.Provider>
    </SiteAnimations>
  );
};

// --- Hero -------------------------------------------------------------------------

const heroChips: { icon: LucideIcon; title: string; text: string; tone: string; pos: string }[] = [
  { icon: Megaphone, title: 'Broadcast sent', text: '2,400 customers reached', tone: 'bg-sky-500', pos: '-left-28 top-16' },
  { icon: Bot, title: 'Bot replied', text: 'in under a second', tone: 'bg-violet-500', pos: '-right-24 top-40' },
  { icon: Target, title: 'New lead', text: 'from a Click-to-WhatsApp ad', tone: 'bg-amber-500', pos: '-left-32 bottom-28' },
  { icon: IndianRupee, title: 'UPI payment', text: 'received for an order', tone: 'bg-emerald-500', pos: '-right-28 bottom-10' },
];

const Hero: React.FC<{ content: SiteContent }> = ({ content }) => {
  const branding = useBranding();
  const highlight = content.hero_highlight || branding.platform_name;
  return (
    <section className="relative isolate -mt-20 pt-28 pb-16 lg:pt-36 lg:pb-24 overflow-hidden">
      {content.hero_background === 'gradient' && <div aria-hidden className="absolute inset-0 -z-10 site-hero-gradient" />}
      {content.hero_background !== 'plain' && (
        <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-32 -left-24 h-[460px] w-[460px] rounded-full bg-emerald-400/30 blur-3xl dark:bg-emerald-500/20" />
          <div className="absolute top-10 right-[-140px] h-[420px] w-[420px] rounded-full bg-teal-300/30 blur-3xl dark:bg-teal-500/15" />
          <div className="absolute bottom-[-160px] left-1/3 h-[380px] w-[380px] rounded-full bg-lime-300/20 blur-3xl dark:bg-cyan-500/10" />
          <div className="absolute inset-0 bg-[radial-gradient(rgba(15,23,42,0.07)_1px,transparent_1px)] dark:bg-[radial-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:22px_22px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_35%,black,transparent)]" />
        </div>
      )}
      <div className={container}>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-14 lg:gap-8 items-center">
          <div className="lg:col-span-6 space-y-6 text-center lg:text-left">
            <Reveal>
              <div className="flex flex-wrap justify-center lg:justify-start gap-2">
                {content.hero_badge && (
                  <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-emerald-500/25 bg-white/80 dark:bg-emerald-500/10 backdrop-blur text-emerald-700 dark:text-emerald-300 text-xs font-semibold shadow-sm">
                    <BadgeCheck className="h-3.5 w-3.5" />
                    {content.hero_badge}
                  </span>
                )}
                <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-orange-400/30 bg-white/80 dark:bg-orange-400/10 backdrop-blur text-orange-700 dark:text-orange-300 text-xs font-semibold shadow-sm">
                  <span aria-hidden>🇮🇳</span> Made in India
                </span>
              </div>
            </Reveal>
            <Reveal delay={80}>
              <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] font-extrabold text-gray-900 dark:text-white leading-[1.1] tracking-tight font-ubuntu">
                {content.hero_title}{' '}
                {highlight && (
                  <span className="lp-gradient-text bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-600 bg-clip-text text-transparent">
                    {highlight}
                  </span>
                )}
              </h1>
            </Reveal>
            {content.hero_subtitle && (
              <Reveal delay={160}>
                <p className="text-base sm:text-lg text-gray-600 dark:text-gray-300 max-w-xl mx-auto lg:mx-0 leading-relaxed">
                  {content.hero_subtitle}
                </p>
              </Reveal>
            )}
            <Reveal delay={240}>
              <div className="pt-2 flex flex-wrap items-center justify-center lg:justify-start gap-3">
                {content.primary_cta && (
                  <Link to="/signup" className={cn(primaryBtn, 'px-8 py-3.5 text-sm sm:text-base')}>
                    {content.primary_cta}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </Link>
                )}
                {content.secondary_cta && (
                  <Link
                    to="/login"
                    className="rounded-full border-2 border-gray-200 bg-white/60 backdrop-blur dark:bg-transparent dark:border-white/15 text-gray-800 dark:text-gray-100 hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-300 px-8 py-3 text-sm sm:text-base font-bold transition-all"
                  >
                    {content.secondary_cta}
                  </Link>
                )}
              </div>
            </Reveal>
            {content.trust_badges.length > 0 && (
              <Reveal delay={320}>
                <div className="pt-6 flex flex-wrap justify-center lg:justify-start gap-x-6 gap-y-3 border-t border-gray-200/70 dark:border-white/10 text-sm text-gray-600 dark:text-gray-400 font-medium">
                  {content.trust_badges.map((b) => (
                    <span key={b} className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                      {b}
                    </span>
                  ))}
                </div>
              </Reveal>
            )}
          </div>

          <div className="lg:col-span-6 flex justify-center">
            <Reveal delay={200} className="relative w-full max-w-xl">
              {content.hero_image_url ? (
                <>
                  <div aria-hidden className="absolute -inset-6 bg-gradient-to-tr from-emerald-400/25 to-teal-300/10 rounded-[2rem] blur-3xl -z-10" />
                  <img
                    src={content.hero_image_url}
                    alt="WhatsApp marketing platform"
                    className="w-full h-auto object-contain drop-shadow-2xl rounded-2xl site-float"
                  />
                </>
              ) : (
                <div className="relative flex justify-center py-4">
                  <div aria-hidden className="absolute left-1/2 top-1/2 -z-10 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-emerald-400/40 via-teal-300/20 to-transparent blur-2xl" />
                  <div aria-hidden className="lp-orbit absolute left-1/2 top-1/2 -z-10 hidden h-[470px] w-[470px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-emerald-500/25 sm:block" />
                  <div className="relative">
                    <HeroPhone businessName={branding.platform_name} />
                    {heroChips.map((c) => {
                      const Icon = c.icon;
                      return (
                        <div
                          key={c.title}
                          aria-hidden
                          className={cn(
                            'lp-chip absolute hidden md:flex items-center gap-2.5 rounded-2xl border border-white/70 bg-white/90 px-3 py-2.5 shadow-xl shadow-emerald-900/10 backdrop-blur dark:border-white/10 dark:bg-[#0f1a20]/90',
                            c.pos
                          )}
                        >
                          <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white', c.tone)}>
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="leading-tight">
                            <span className="block text-xs font-bold text-gray-900 dark:text-white">{c.title}</span>
                            <span className="block text-[11px] text-gray-500 dark:text-gray-400 whitespace-nowrap">{c.text}</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
};

// --- Industries marquee ------------------------------------------------------------

const industries = [
  '🛍️ Retail & D2C brands',
  '🎓 Coaching & education',
  '🏠 Real estate',
  '🩺 Clinics & healthcare',
  '✈️ Travel & holidays',
  '🍽️ Restaurants & cloud kitchens',
  '💳 Finance & insurance',
  '🚗 Automobile dealers',
  '💇 Salons & wellness',
  '🎟️ Events & ticketing',
  '🏋️ Gyms & fitness',
  '📦 Logistics & delivery',
];

const IndustryMarquee: React.FC = () => (
  <section aria-label="Industries" className="border-y border-gray-100 bg-gray-50/70 py-6 dark:border-white/[0.05] dark:bg-white/[0.02]">
    <p className="mb-4 text-center text-xs font-bold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
      Businesses across India talk to customers this way
    </p>
    <div className="lp-marquee overflow-hidden">
      <ul className="lp-marquee-track gap-3 pr-3">
        {[...industries, ...industries].map((t, i) => (
          <li
            key={i}
            aria-hidden={i >= industries.length || undefined}
            className="shrink-0 whitespace-nowrap rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm dark:border-white/10 dark:bg-[#0f1a20] dark:text-gray-200"
          >
            {t}
          </li>
        ))}
      </ul>
    </div>
  </section>
);

// --- Why choose us ----------------------------------------------------------------

const WhySection: React.FC<{ content: SiteContent }> = ({ content }) => (
  <section className="py-24">
    <div className={container}>
      <SectionHead eyebrow="Why us" title={content.why_title} text={content.why_subtitle} />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {content.why_cards.map((c, i) => (
          <Reveal key={c.title + i} delay={i * 100}>
            <div
              className={cn(
                'lp-lift group relative h-full overflow-hidden rounded-3xl bg-white dark:bg-[#0f1a20] p-8 border border-gray-100 dark:border-white/10 shadow-sm hover:shadow-2xl hover:shadow-emerald-900/10',
                ACCENTS[i % ACCENTS.length].ring
              )}
            >
              <div aria-hidden className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-emerald-400/10 blur-2xl transition-transform duration-500 group-hover:scale-150" />
              <div className={cn('w-14 h-14 mb-6 rounded-2xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6', ACCENTS[i % ACCENTS.length].tile)}>
                <SiteIcon name={c.icon} className="h-7 w-7" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3 font-ubuntu">{c.title}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{c.text}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </div>
  </section>
);

// --- Features ---------------------------------------------------------------------

const FeaturesSection: React.FC<{ content: SiteContent }> = ({ content }) => (
  <section id="features" className="relative py-24 scroll-mt-20 bg-gradient-to-b from-emerald-50/60 via-white to-white dark:from-emerald-950/20 dark:via-transparent dark:to-transparent">
    <div className={container}>
      <SectionHead eyebrow="Features" title={content.features_title} text={content.features_subtitle} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {content.features.map((f, i) => (
          <Reveal key={f.title + i} delay={(i % 3) * 90}>
            <div
              className={cn(
                'lp-lift group h-full rounded-3xl border border-gray-100 dark:border-white/10 bg-white/90 dark:bg-[#0f1a20] p-7 shadow-sm hover:shadow-xl hover:shadow-emerald-900/10',
                ACCENTS[i % ACCENTS.length].ring
              )}
            >
              <div className={cn('w-12 h-12 rounded-2xl flex items-center justify-center mb-5 group-hover:text-white transition-colors', ACCENTS[i % ACCENTS.length].tile, ACCENTS[i % ACCENTS.length].hover)}>
                <SiteIcon name={f.icon} className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 font-ubuntu">{f.title}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{f.text}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </div>
  </section>
);

// --- Product tour (Solutions) --------------------------------------------------------

const tour: { eyebrow: string; title: string; text: string; points: string[]; mock: React.ReactNode }[] = [
  {
    eyebrow: 'Live Chat',
    title: 'One shared inbox for your whole team',
    text: 'Every WhatsApp conversation lands in one place. Assign chats, hand them over, and see at a glance what still needs a reply.',
    points: ['Assign and transfer chats between agents', 'Quick replies, media, documents and voice notes', 'Bots hand over to a person when needed'],
    mock: <InboxMock />,
  },
  {
    eyebrow: 'Broadcast campaigns',
    title: 'Reach thousands, still feel personal',
    text: 'Send approved templates to contact groups or broadcast lists, with each customer’s name and details filled in, now or on a schedule.',
    points: ['Contact groups and broadcast lists', 'Personalised variables in every message', 'Sent, delivered, read and reply reports'],
    mock: <CampaignMock />,
  },
  {
    eyebrow: 'Chatbot flows',
    title: 'Pick a bot that fits: simple, media or advanced',
    text: 'Start with a keyword reply in minutes, share catalogues and PDFs automatically, or build branching flows that talk to your own systems.',
    points: ['Visual drag-and-drop builder', 'Buttons, lists, questions and conditions', 'Webhooks and hand-over to agents'],
    mock: <BotFlowMock />,
  },
  {
    eyebrow: 'Ads Manager',
    title: 'Turn ad clicks into qualified leads',
    text: 'Click-to-WhatsApp ads open a chat with your business. A short lead form collects the details and the lead is saved with the ad it came from.',
    points: ['Click-to-WhatsApp ads in one place', 'Lead forms right inside the chat', 'Know which ad brought every lead'],
    mock: <AdsMock />,
  },
  {
    eyebrow: 'AI agents & analytics',
    title: 'Answers around the clock, numbers you can act on',
    text: 'Let an AI agent take the common questions using your own information, and track how your team and campaigns are doing.',
    points: ['AI agents for routine questions', 'Response time and conversation reports', 'Campaign and team performance'],
    mock: <InsightsMock />,
  },
];

const ProductTour: React.FC = () => (
  <section id="solutions" className="py-24 scroll-mt-20">
    <div className={container}>
      <SectionHead
        eyebrow="Product tour"
        title={
          <>
            Everything your business needs on{' '}
            <span className="bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-transparent">WhatsApp</span>
          </>
        }
        text="Chat, campaigns, bots and ads that work together, so no customer message gets lost."
      />
      <div className="space-y-20 lg:space-y-28">
        {tour.map((t, i) => (
          <div key={t.title} className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <Reveal className={cn('space-y-4', i % 2 === 1 && 'lg:order-2')}>
              <Eyebrow>{t.eyebrow}</Eyebrow>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white font-ubuntu tracking-tight">{t.title}</h3>
              <p className="text-base text-gray-600 dark:text-gray-300 leading-relaxed">{t.text}</p>
              <ul className="space-y-2.5 pt-1 text-sm text-gray-700 dark:text-gray-300">
                {t.points.map((p) => (
                  <li key={p} className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
                      <Check className="h-3 w-3" />
                    </span>
                    {p}
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal delay={120} className={cn('relative mx-auto w-full max-w-md', i % 2 === 1 && 'lg:order-1')}>
              <div aria-hidden className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-gradient-to-br from-emerald-300/30 via-teal-200/20 to-transparent blur-2xl dark:from-emerald-500/15 dark:via-teal-500/10" />
              {t.mock}
            </Reveal>
          </div>
        ))}
      </div>
    </div>
  </section>
);

// --- Stats -------------------------------------------------------------------------------

const stats: { to: number; prefix?: string; suffix?: string; label: string }[] = [
  { to: 3, label: 'kinds of chatbot: simple, media and advanced' },
  { to: 24, suffix: '×7', label: 'automatic replies, even when your team is offline' },
  { to: 4, label: 'billing cycles, from monthly to yearly' },
  { to: 100, suffix: '%', label: 'official WhatsApp Business API, no unofficial tools' },
];

const StatsBand: React.FC = () => (
  <section className="py-6">
    <div className={container}>
      <Reveal>
        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#064e3b] via-[#0f5c62] to-[#0b3b40] px-6 py-12 text-white shadow-2xl sm:px-12">
          <div aria-hidden className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[size:20px_20px]" />
          <div aria-hidden className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-emerald-400/30 blur-3xl" />
          <div className="relative grid grid-cols-2 gap-8 lg:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="text-center lg:text-left">
                <Counter to={s.to} prefix={s.prefix} suffix={s.suffix} className="block text-4xl sm:text-5xl font-extrabold font-ubuntu text-white" />
                <p className="mt-2 text-sm text-emerald-100/80">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </Reveal>
    </div>
  </section>
);

// --- How it works --------------------------------------------------------------------

const steps = [
  { icon: UserPlus, title: 'Create your account', text: 'Sign up in a minute and choose the plan and billing cycle that suits you.' },
  { icon: Smartphone, title: 'Connect WhatsApp', text: "Link your WhatsApp Business number through Meta's official sign-up flow." },
  { icon: Rocket, title: 'Start growing', text: 'Reply from Live Chat, send campaigns and switch on your first bot.' },
];

const HowItWorks: React.FC = () => {
  const [ref, inView] = useInView<HTMLDivElement>();
  return (
    <section className="py-24">
      <div className={container}>
        <SectionHead eyebrow="How it works" title="Live in three easy steps" text="No servers, no code, no waiting on a developer." />
        <div ref={ref} className={cn('relative grid gap-10 md:grid-cols-3 md:gap-6', inView && 'is-in')}>
          <div aria-hidden className="absolute left-[16%] right-[16%] top-10 hidden h-0.5 md:block">
            <div className="lp-fill h-full rounded-full bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-500 opacity-60" style={{ '--w': '100%' } as React.CSSProperties} />
          </div>
          {steps.map((s, i) => {
            const Icon = s.icon;
            return (
              <Reveal key={s.title} delay={i * 140}>
                <div className="relative px-4 text-center">
                  <div className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-white text-emerald-600 shadow-lg shadow-emerald-900/10 ring-1 ring-emerald-100 dark:bg-[#0f1a20] dark:text-emerald-300 dark:ring-white/10">
                    <Icon className="h-9 w-9" />
                    <span className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 text-xs font-bold text-white shadow">
                      {i + 1}
                    </span>
                  </div>
                  <h3 className="mt-5 text-lg font-bold text-gray-900 dark:text-white font-ubuntu">{s.title}</h3>
                  <p className="mx-auto mt-2 max-w-xs text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{s.text}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
};

// --- More tools ----------------------------------------------------------------------------

const tools: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Users, title: 'Contact groups', text: 'Organise customers for targeted messages' },
  { icon: ListChecks, title: 'Broadcast lists', text: 'Reusable lists for regular updates' },
  { icon: FileText, title: 'Message templates', text: 'Create and track template approval' },
  { icon: MessageSquareReply, title: 'Quick replies', text: 'Saved answers your agents reuse' },
  { icon: QrCode, title: 'WhatsApp QR code', text: 'Customers scan and start chatting' },
  { icon: Webhook, title: 'Webhooks & API', text: 'Connect your own apps and CRM' },
  { icon: KeyRound, title: 'Team roles', text: 'Control who can see and do what' },
  { icon: IndianRupee, title: 'Razorpay & UPI', text: 'Pay for your plan the easy way' },
];

const MoreTools: React.FC = () => (
  <section className="py-24 bg-gray-50/80 dark:bg-white/[0.02] border-y border-gray-100 dark:border-white/[0.05]">
    <div className={container}>
      <SectionHead eyebrow="And there's more" title="Small tools that save hours every week" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tools.map((t, i) => {
          const Icon = t.icon;
          return (
            <Reveal key={t.title} delay={(i % 4) * 70}>
              <div className="lp-lift group flex h-full items-start gap-4 rounded-2xl border border-gray-200/80 bg-white p-5 hover:border-emerald-300 hover:shadow-lg hover:shadow-emerald-900/5 dark:border-white/10 dark:bg-[#0f1a20] dark:hover:border-emerald-500/40">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 transition-colors group-hover:bg-emerald-500 group-hover:text-white dark:bg-emerald-500/10 dark:text-emerald-300">
                  <Icon className="h-5 w-5" />
                </span>
                <span>
                  <span className="block font-bold text-gray-900 dark:text-white">{t.title}</span>
                  <span className="mt-0.5 block text-sm text-gray-600 dark:text-gray-400">{t.text}</span>
                </span>
              </div>
            </Reveal>
          );
        })}
      </div>
    </div>
  </section>
);

// --- Pricing (plans and offers set by the super admin) -----------------------------

const PricingSection: React.FC<{ content: SiteContent }> = ({ content }) => {
  const { info, loading } = usePublicPlans();
  const plans = useMemo(() => info?.plans ?? [], [info]);
  const [cycle, setCycle] = useState<BillingInterval>('monthly');

  const bestOffer = useMemo(() => {
    const best: Record<BillingInterval, number> = { monthly: 0, quarterly: 0, half_yearly: 0, yearly: 0 };
    plans.forEach((p) =>
      BILLING_CYCLES.forEach((c) => (best[c.id] = Math.max(best[c.id], cycleDiscount({ ...p, interval: p.interval as BillingInterval }, c.id))))
    );
    return best;
  }, [plans]);

  if (!loading && plans.length === 0) return null;
  const featured = plans.length >= 3 ? 1 : -1;

  return (
    <section id="pricing" className="relative py-24 scroll-mt-20 overflow-hidden">
      <div aria-hidden className="absolute left-1/2 top-0 -z-10 h-[500px] w-[900px] max-w-full -translate-x-1/2 rounded-full bg-emerald-300/20 blur-3xl dark:bg-emerald-500/10" />
      <div className={container}>
        <Reveal className="text-center max-w-3xl mx-auto mb-12">
          <Eyebrow>Pricing</Eyebrow>
          <h2 className={cn(sectionTitle, 'mt-4')}>{content.pricing_title}</h2>
          {content.pricing_subtitle && <p className={sectionText}>{content.pricing_subtitle}</p>}
          <div className="mt-8 inline-flex flex-wrap justify-center gap-1 p-1 rounded-3xl sm:rounded-full bg-white dark:bg-[#0f1a20] border border-gray-200 dark:border-white/10 shadow-sm">
            {BILLING_CYCLES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCycle(c.id)}
                className={cn(
                  'flex items-center gap-1.5 px-4 sm:px-5 py-2 text-xs sm:text-sm font-semibold rounded-full transition-all',
                  cycle === c.id ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                )}
              >
                {c.label}
                {bestOffer[c.id] > 0 && (
                  <span
                    className={cn(
                      'text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-full',
                      cycle === c.id ? 'bg-white/25 text-white' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                    )}
                  >
                    Save {bestOffer[c.id]}%
                  </span>
                )}
              </button>
            ))}
          </div>
        </Reveal>

        {loading ? (
          <p className="text-center text-sm text-gray-400">Loading plans…</p>
        ) : (
          <div className={cn('grid grid-cols-1 gap-8 items-stretch', plans.length >= 3 ? 'md:grid-cols-3' : plans.length === 2 ? 'md:grid-cols-2 max-w-4xl mx-auto' : 'max-w-md mx-auto')}>
            {plans.map((p, i) => (
              <Reveal key={p.id} delay={i * 100}>
                <PlanCard plan={p} cycle={cycle} featured={i === featured} />
              </Reveal>
            ))}
          </div>
        )}
        <p className="mt-10 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-center text-sm text-gray-500 dark:text-gray-400">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-emerald-500" /> Pay securely with Razorpay or UPI
          </span>
          <span className="inline-flex items-center gap-1.5">
            <IndianRupee className="h-4 w-4 text-emerald-500" /> Prices in Indian rupees
          </span>
        </p>
      </div>
    </section>
  );
};

const PlanCard: React.FC<{ plan: PublicPlan; cycle: BillingInterval; featured: boolean }> = ({ plan, cycle, featured }) => {
  const price = cyclePrice({ ...plan, interval: plan.interval as BillingInterval }, cycle);
  const unit = BILLING_CYCLES.find((c) => c.id === cycle)?.short ?? 'month';
  return (
    <div
      className={cn(
        'lp-lift relative h-full rounded-3xl p-8 flex flex-col justify-between',
        featured
          ? 'bg-gradient-to-b from-[#065f46] to-[#0f5c62] text-white shadow-2xl shadow-emerald-700/30 md:scale-[1.04] z-10 ring-1 ring-emerald-400/40'
          : 'bg-white dark:bg-[#0f1a20] border border-gray-200 dark:border-white/10 shadow-sm hover:shadow-xl hover:border-emerald-300 dark:hover:border-emerald-500/40'
      )}
    >
      {featured && (
        <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-300 to-yellow-400 text-gray-900 px-4 py-1 text-xs font-bold uppercase tracking-wider shadow">
          <Sparkles className="h-3 w-3" /> Most popular
        </span>
      )}
      <div>
        <h3 className={cn('text-xl font-bold font-ubuntu', featured ? 'text-white' : 'text-gray-900 dark:text-white')}>{plan.name}</h3>
        {plan.description && <p className={cn('mt-1 text-sm', featured ? 'text-emerald-100/80' : 'text-gray-500 dark:text-gray-400')}>{plan.description}</p>}
        <div className="mt-5">
          {price.discount > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <span className={cn('line-through', featured ? 'text-emerald-100/60' : 'text-gray-400')}>{formatPrice(price.full)}</span>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[11px] font-bold',
                  featured ? 'bg-white/20 text-white' : 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                )}
              >
                {price.discount}% OFF
              </span>
            </div>
          )}
          <div className="flex items-baseline gap-1">
            <span className={cn('text-4xl font-extrabold font-ubuntu', featured ? 'text-white' : 'text-gray-900 dark:text-white')}>
              {price.total > 0 ? formatPrice(price.total) : 'Free'}
            </span>
            {price.total > 0 && <span className={cn('text-sm', featured ? 'text-emerald-100/70' : 'text-gray-500')}>/ {unit}</span>}
          </div>
          {price.saving > 0 && (
            <p className={cn('text-xs font-medium', featured ? 'text-emerald-200' : 'text-emerald-600 dark:text-emerald-400')}>You save {formatPrice(price.saving)}</p>
          )}
        </div>
        <a
          href="https://business.whatsapp.com/products/platform-pricing"
          target="_blank"
          rel="noopener noreferrer"
          className={cn('mt-1 text-xs inline-flex items-center gap-1', featured ? 'text-emerald-100/70 hover:text-white' : 'text-gray-500 hover:text-emerald-600')}
        >
          + WhatsApp messaging charges <ExternalLink className="h-3 w-3" />
        </a>

        <div className={cn('my-6 border-t', featured ? 'border-white/15' : 'border-gray-100 dark:border-white/10')} />
        <ul className={cn('space-y-3 text-sm', featured ? 'text-emerald-50' : 'text-gray-600 dark:text-gray-300')}>
          {planLimits(plan).map((l) => (
            <li key={l.label} className="flex items-center justify-between gap-3">
              <span>{l.label}</span>
              <strong className={featured ? 'text-white' : l.value === 'Unlimited' ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-900 dark:text-white'}>
                {l.value}
              </strong>
            </li>
          ))}
          {plan.features.map((f) => (
            <li key={f} className="flex items-start gap-2">
              <Check className={cn('h-4 w-4 mt-0.5 shrink-0', featured ? 'text-emerald-300' : 'text-emerald-500')} />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="pt-8">
        <Link
          to={`/signup?plan=${plan.id}&cycle=${cycle}`}
          aria-label={`${plan.price > 0 ? 'Buy' : 'Get started with'} ${plan.name}`}
          className={cn(
            'lp-sheen block w-full text-center rounded-full py-3 text-sm font-bold transition-all',
            featured
              ? 'bg-white text-emerald-800 hover:bg-emerald-50 shadow-lg'
              : 'border border-gray-300 dark:border-white/20 text-gray-700 dark:text-gray-200 hover:border-emerald-500 hover:bg-emerald-500 hover:text-white'
          )}
        >
          {plan.price > 0 ? 'Buy now' : 'Get started'}
        </Link>
      </div>
    </div>
  );
};

// --- FAQ ----------------------------------------------------------------------------

const FaqSection: React.FC<{ content: SiteContent }> = ({ content }) => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  return (
    <section id="faq" className="py-24 scroll-mt-20">
      <div className={cn(container, 'grid grid-cols-1 lg:grid-cols-12 gap-12')}>
        <Reveal className="lg:col-span-5 space-y-4 lg:sticky lg:top-28 self-start">
          <Eyebrow>Questions & answers</Eyebrow>
          <h2 className={sectionTitle}>{content.faq_title}</h2>
          {content.faq_subtitle && <p className="text-base text-gray-600 dark:text-gray-300 leading-relaxed">{content.faq_subtitle}</p>}
          <a
            href="#contact"
            className="inline-flex items-center gap-2 rounded-full border border-gray-300 dark:border-white/20 text-gray-700 dark:text-gray-300 hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-300 px-5 py-2.5 text-xs font-semibold transition-all"
          >
            Still have questions? Contact us <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </Reveal>
        <div className="lg:col-span-7 space-y-3">
          {content.faqs.map((faq, i) => {
            const open = openIndex === i;
            return (
              <Reveal key={faq.question + i} delay={i * 60}>
                <div
                  className={cn(
                    'rounded-2xl border bg-white dark:bg-[#0f1a20] overflow-hidden transition-all duration-300',
                    open ? 'border-emerald-300 shadow-lg shadow-emerald-900/5 dark:border-emerald-500/40' : 'border-gray-200/80 dark:border-white/10 hover:border-emerald-200 dark:hover:border-white/20'
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setOpenIndex(open ? null : i)}
                    aria-expanded={open}
                    className="w-full flex items-center justify-between gap-4 p-5 text-left text-base font-bold text-gray-900 dark:text-white"
                  >
                    <span>{faq.question}</span>
                    <span
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-all duration-300',
                        open ? 'rotate-45 border-emerald-500 bg-emerald-500 text-white' : 'border-gray-200 text-gray-500 dark:border-white/15 dark:text-gray-400'
                      )}
                    >
                      <Plus className="h-4 w-4" />
                    </span>
                  </button>
                  <div className={cn('grid transition-all duration-300', open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}>
                    <div className="overflow-hidden">
                      <p className="px-5 pb-5 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{faq.answer}</p>
                    </div>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
};

// --- Final call-to-action ----------------------------------------------------------

const ContactBand: React.FC<{ content: SiteContent }> = ({ content }) => {
  const wa = content.whatsapp_number.replace(/\D/g, '');
  return (
    <section id="contact" className="pb-24 scroll-mt-20">
      <div className={container}>
        <Reveal>
          <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-emerald-500 via-teal-600 to-[#0f5c62] px-6 py-14 sm:px-14 sm:py-16 text-white shadow-2xl shadow-emerald-900/20">
            <div aria-hidden className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.07)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.07)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
            <div aria-hidden className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-white/15 blur-3xl site-float" />
            <div aria-hidden className="absolute -left-16 -bottom-24 h-72 w-72 rounded-full bg-lime-300/25 blur-3xl" />
            <div className="relative mx-auto max-w-3xl text-center">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em]">
                <MessageCircle className="h-3.5 w-3.5" /> Let's get started
              </span>
              <h2 className="mt-5 text-3xl sm:text-5xl font-extrabold font-ubuntu tracking-tight">Your customers are already on WhatsApp. Are you?</h2>
              <p className="mt-4 text-emerald-50/90 sm:text-lg">Create your account today, or talk to us and we'll help you set everything up.</p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link to="/signup" className="lp-sheen group inline-flex items-center gap-2 rounded-full bg-white text-[#0f5c62] hover:bg-emerald-50 px-7 py-3.5 text-sm font-bold shadow-lg transition-all hover:-translate-y-0.5">
                  {content.primary_cta || 'Get Started'} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
                {wa && (
                  <a
                    href={`https://wa.me/${wa}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border-2 border-white/70 hover:bg-white/10 px-7 py-3 text-sm font-bold transition-all"
                  >
                    <MessageCircle className="h-4 w-4" /> Chat on WhatsApp
                  </a>
                )}
                {!wa && content.email && (
                  <a href={`mailto:${content.email}`} className="inline-flex items-center gap-2 rounded-full border-2 border-white/70 hover:bg-white/10 px-7 py-3 text-sm font-bold transition-all">
                    Email us
                  </a>
                )}
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
};

export default LandingPageView;
