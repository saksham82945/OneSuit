import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, CheckCircle2, ChevronDown, ExternalLink, MessageCircle, QrCode, Rocket, Smartphone, Sparkles, UserPlus } from 'lucide-react';
import { useBranding } from '@/services/branding';
import { usePublicSite, type SiteContent } from '@/services/siteContent';
import { BILLING_CYCLES, cycleDiscount, cyclePrice, formatPrice, type BillingInterval } from '@/services/superAdmin';
import { planLimits, usePublicPlans, type PublicPlan } from './publicApi';
import { ACCENTS, Reveal, SiteAnimations, SiteFooter, SiteHeader, SiteIcon, type NavLinkItem } from './site/SiteKit';
import { cn } from '@/lib/utils';

const sectionTitle = 'text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-white font-ubuntu tracking-tight';
const sectionText = 'mt-3 text-base sm:text-lg text-gray-600 dark:text-gray-400';

/** Small colored label above a section title. */
const Eyebrow: React.FC<{ children: React.ReactNode; tone?: string }> = ({ children, tone = 'from-emerald-500 to-teal-500' }) => (
  <span className={cn('inline-block rounded-full bg-gradient-to-r px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white shadow-sm', tone)}>
    {children}
  </span>
);

export const LandingPageView: React.FC = () => {
  const { content, pages } = usePublicSite();

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
      <div className="min-h-screen bg-white text-gray-900 dark:bg-[#080d11] dark:text-white antialiased selection:bg-emerald-500/20 overflow-x-hidden">
        <SiteHeader content={content} pages={pages} nav={nav} />
        <Hero content={content} />
        {content.show_why && content.why_cards.length > 0 && <WhySection content={content} />}
        {content.show_features && content.features.length > 0 && <FeaturesSection content={content} />}
        <HowItWorks />
        {content.show_solutions && <SolutionsSection />}
        {content.show_pricing && <PricingSection content={content} />}
        {content.show_faq && content.faqs.length > 0 && <FaqSection content={content} />}
        <ContactBand content={content} />
        <SiteFooter content={content} pages={pages} nav={nav} />
      </div>
    </SiteAnimations>
  );
};

// --- Hero -------------------------------------------------------------------------

const Hero: React.FC<{ content: SiteContent }> = ({ content }) => {
  const branding = useBranding();
  const highlight = content.hero_highlight || branding.platform_name;
  const image = content.hero_image_url || '/landing/masthead.png';
  return (
    <section className="relative isolate -mt-20 pt-28 pb-16 lg:pt-36 lg:pb-24 overflow-hidden">
      {content.hero_background === 'gradient' && <div aria-hidden className="absolute inset-0 -z-10 site-hero-gradient" />}
      {content.hero_background !== 'plain' && (
        <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-24 -left-24 h-[420px] w-[420px] rounded-full bg-emerald-400/30 blur-3xl dark:bg-emerald-500/20" />
          <div className="absolute top-10 right-[-120px] h-[380px] w-[380px] rounded-full bg-sky-400/25 blur-3xl dark:bg-sky-500/15" />
          <div className="absolute bottom-[-140px] left-1/3 h-[360px] w-[360px] rounded-full bg-violet-400/20 blur-3xl dark:bg-violet-500/15" />
          <div className="absolute top-1/3 left-1/2 h-[220px] w-[220px] rounded-full bg-amber-300/25 blur-3xl dark:bg-amber-400/10" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.04)_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_30%,black,transparent)]" />
        </div>
      )}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-10 items-center">
          <div className="lg:col-span-6 space-y-6 text-center lg:text-left">
            {content.hero_badge && (
              <Reveal>
                <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-emerald-500/25 bg-white/70 dark:bg-emerald-500/10 backdrop-blur text-emerald-700 dark:text-emerald-400 text-xs font-semibold uppercase tracking-wider shadow-sm">
                  <Sparkles className="h-3.5 w-3.5" />
                  {content.hero_badge}
                </span>
              </Reveal>
            )}
            <Reveal delay={80}>
              <h1 className="text-4xl sm:text-5xl lg:text-[3.4rem] font-extrabold text-gray-900 dark:text-white leading-[1.12] tracking-tight font-ubuntu">
                {content.hero_title}{' '}
                {highlight && (
                  <span className="relative inline-block bg-gradient-to-r from-emerald-500 via-teal-500 to-sky-500 bg-clip-text text-transparent">
                    {highlight}
                    <span aria-hidden className="absolute -bottom-1 left-0 w-full h-3 bg-[#f4cf34]/50 -rotate-1 rounded-full -z-10" />
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
                  <Link
                    to="/signup"
                    className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white px-8 py-3.5 text-sm sm:text-base font-bold shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 hover:-translate-y-0.5 transition-all"
                  >
                    {content.primary_cta}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </Link>
                )}
                {content.secondary_cta && (
                  <Link
                    to="/login"
                    className="rounded-full border-2 border-gray-200 dark:border-white/15 text-gray-800 dark:text-gray-100 hover:border-[#27c462] hover:text-[#27c462] px-8 py-3 text-sm sm:text-base font-bold transition-all"
                  >
                    {content.secondary_cta}
                  </Link>
                )}
              </div>
            </Reveal>
            {content.trust_badges.length > 0 && (
              <Reveal delay={320}>
                <div className="pt-6 flex flex-wrap justify-center lg:justify-start gap-x-6 gap-y-3 border-t border-gray-100 dark:border-white/10 text-sm text-gray-600 dark:text-gray-400 font-medium">
                  {content.trust_badges.map((b) => (
                    <span key={b} className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-[#27c462] shrink-0" />
                      {b}
                    </span>
                  ))}
                </div>
              </Reveal>
            )}
          </div>

          <div className="lg:col-span-6 flex justify-center">
            <Reveal delay={200} className="relative w-full max-w-xl">
              <div className="absolute -inset-6 bg-gradient-to-tr from-[#27c462]/25 to-yellow-300/10 rounded-[2rem] blur-3xl -z-10" />
              <img
                src={image}
                alt="WhatsApp marketing platform"
                className={cn('w-full h-auto object-contain drop-shadow-2xl rounded-2xl', content.animations_enabled && 'site-float')}
              />
              {content.trust_badges.slice(0, 2).map((b, i) => (
                <div
                  key={b}
                  className={cn(
                    'absolute hidden sm:flex items-center gap-2 rounded-2xl border border-white/60 bg-white/85 px-3.5 py-2.5 text-xs font-semibold text-gray-800 shadow-xl backdrop-blur dark:border-white/10 dark:bg-[#111b21]/85 dark:text-gray-100',
                    i === 0 ? '-left-4 bottom-10' : '-right-3 top-8'
                  )}
                >
                  <span className={cn('flex h-7 w-7 items-center justify-center rounded-full text-white', i === 0 ? 'bg-emerald-500' : 'bg-sky-500')}>
                    <CheckCircle2 className="h-4 w-4" />
                  </span>
                  {b}
                </div>
              ))}
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
};

// --- Why choose us ----------------------------------------------------------------

const WhySection: React.FC<{ content: SiteContent }> = ({ content }) => (
  <section className="py-20 bg-gray-50/80 dark:bg-[#0c1419]/70 border-y border-gray-100 dark:border-white/[0.04]">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <Reveal className="text-center max-w-3xl mx-auto mb-14">
        <Eyebrow tone="from-amber-400 to-orange-500">Why us</Eyebrow>
        <h2 className={cn(sectionTitle, 'mt-3')}>{content.why_title}</h2>
        {content.why_subtitle && <p className={sectionText}>{content.why_subtitle}</p>}
      </Reveal>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {content.why_cards.map((c, i) => (
          <Reveal key={c.title + i} delay={i * 100}>
            <div className={cn('group relative h-full overflow-hidden rounded-3xl bg-white dark:bg-[#111b21] p-8 text-center border border-gray-100 dark:border-white/10 shadow-sm hover:shadow-xl hover:-translate-y-1.5 transition-all duration-300', ACCENTS[i % ACCENTS.length].ring)}>
              <div aria-hidden className={cn('absolute inset-x-0 top-0 h-1 bg-gradient-to-r', ACCENTS[i % ACCENTS.length].bar)} />
              <div className={cn('w-16 h-16 mx-auto mb-6 rounded-2xl flex items-center justify-center group-hover:scale-110 group-hover:rotate-3 transition-transform', ACCENTS[i % ACCENTS.length].tile)}>
                <SiteIcon name={c.icon} className="h-8 w-8" />
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
  <section id="features" className="py-24 scroll-mt-20">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <Reveal className="text-center max-w-3xl mx-auto mb-16">
        <Eyebrow tone="from-sky-500 to-violet-500">Features</Eyebrow>
        <h2 className={cn(sectionTitle, 'mt-3')}>{content.features_title}</h2>
        {content.features_subtitle && <p className={sectionText}>{content.features_subtitle}</p>}
      </Reveal>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {content.features.map((f, i) => (
          <Reveal key={f.title + i} delay={(i % 3) * 90}>
            <div className={cn('group h-full rounded-3xl border border-gray-100 dark:border-white/10 bg-white dark:bg-[#111b21] p-7 shadow-sm hover:shadow-xl hover:-translate-y-1.5 transition-all duration-300', ACCENTS[i % ACCENTS.length].ring)}>
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

// --- How it works --------------------------------------------------------------------

const steps = [
  { icon: UserPlus, title: 'Create your account', text: 'Sign up in a minute and pick the plan that fits your business.', accent: 0 },
  { icon: Smartphone, title: 'Connect WhatsApp', text: "Link your WhatsApp Business number with Meta's official signup.", accent: 1 },
  { icon: Rocket, title: 'Start growing', text: 'Send campaigns, reply from the team inbox and automate with chatbots.', accent: 2 },
];

const HowItWorks: React.FC = () => (
  <section className="py-20 bg-gradient-to-b from-white via-sky-50/50 to-white dark:from-transparent dark:via-sky-950/10 dark:to-transparent">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <Reveal className="text-center max-w-3xl mx-auto mb-14">
        <Eyebrow tone="from-violet-500 to-fuchsia-500">How it works</Eyebrow>
        <h2 className={cn(sectionTitle, 'mt-3')}>Up and running in three steps</h2>
      </Reveal>
      <div className="relative grid gap-6 md:grid-cols-3">
        <div aria-hidden className="absolute top-10 left-[16%] right-[16%] hidden md:block h-0.5 bg-gradient-to-r from-emerald-400 via-sky-400 to-violet-400 opacity-40" />
        {steps.map((s, i) => {
          const Icon = s.icon;
          return (
            <Reveal key={s.title} delay={i * 120}>
              <div className="relative text-center px-4">
                <div className={cn('relative mx-auto flex h-20 w-20 items-center justify-center rounded-3xl shadow-lg', ACCENTS[s.accent].tile)}>
                  <Icon className="h-9 w-9" />
                  <span className={cn('absolute -top-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold text-white shadow', ACCENTS[s.accent].bar)}>
                    {i + 1}
                  </span>
                </div>
                <h3 className="mt-5 text-lg font-bold text-gray-900 dark:text-white font-ubuntu">{s.title}</h3>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{s.text}</p>
              </div>
            </Reveal>
          );
        })}
      </div>
    </div>
  </section>
);

// --- Solutions (product spotlights) ------------------------------------------------

const spotlights = [
  {
    eyebrow: 'Create, schedule and reach instantly',
    title: 'Campaign Management',
    text: 'Send or schedule campaigns to all contacts or chosen groups, with personal details filled in for every customer.',
    points: ['Personalised variables in every message', 'Scheduling with safe sending limits', 'Delivery, read and reply reports'],
    image: '/landing/campaign.png',
  },
  {
    eyebrow: 'Better customer support',
    title: 'Integrated WhatsApp Chat',
    text: 'A team inbox that looks and works like WhatsApp, so your agents feel at home from day one.',
    points: ['Shared inbox with chat transfer', 'Quick replies for common questions', 'Voice notes, documents and catalog cards'],
    image: '/landing/whatsapp-chat.png',
  },
  {
    eyebrow: 'Automate conversations',
    title: 'Bot Flow Builder',
    text: 'Build chatbot conversations visually, with buttons and lists that lead customers to the right answer.',
    points: ['Drag-and-drop canvas', 'Conditions and branches', 'Webhook and API actions'],
    image: '/landing/bot-flow1.png',
  },
];

const SolutionsSection: React.FC = () => (
  <section id="solutions" className="py-16 space-y-24 scroll-mt-20">
    {spotlights.map((s, i) => (
      <div key={s.title} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <Reveal className={cn('lg:col-span-6 flex justify-center', i % 2 === 1 && 'lg:order-2')}>
            <div className="relative w-full max-w-lg">
              <div className="absolute -inset-4 bg-emerald-500/10 rounded-3xl blur-2xl -z-10" />
              <img src={s.image} alt={s.title} className="w-full h-auto object-contain rounded-2xl shadow-xl border border-gray-100 dark:border-white/10" />
            </div>
          </Reveal>
          <Reveal delay={120} className={cn('lg:col-span-6 space-y-4', i % 2 === 1 && 'lg:order-1')}>
            <span className="text-xs font-bold uppercase tracking-wider text-[#e2424d]">{s.eyebrow}</span>
            <h2 className={sectionTitle}>{s.title}</h2>
            <p className="text-base text-gray-600 dark:text-gray-300 leading-relaxed">{s.text}</p>
            <ul className="space-y-2 pt-2 text-sm text-gray-700 dark:text-gray-300">
              {s.points.map((p) => (
                <li key={p} className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-[#27c462] shrink-0" />
                  {p}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </div>
    ))}

    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Reveal>
        <div className="h-full rounded-3xl bg-gradient-to-br from-[#0f5c62] to-[#147a6b] p-8 sm:p-10 text-white shadow-2xl relative overflow-hidden">
          <div aria-hidden className="absolute -right-16 -bottom-16 w-72 h-72 bg-white/5 rounded-full blur-3xl" />
          <span className="text-xs font-bold uppercase tracking-wider text-[#ffd600]">Rich media</span>
          <h2 className="mt-2 text-2xl sm:text-3xl font-extrabold font-ubuntu">Reached to the Customers</h2>
          <p className="mt-3 text-sm text-emerald-100 leading-relaxed">
            Send images, videos, documents and buttons from your chatbot to grab attention and share useful content.
          </p>
          <Link to="/signup" className="mt-6 inline-flex items-center gap-2 rounded-full bg-white text-[#0f5c62] hover:bg-emerald-50 px-6 py-3 text-sm font-bold shadow-lg transition-all">
            Try media messages <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </Reveal>
      <Reveal delay={120}>
        <div className="h-full rounded-3xl bg-gradient-to-br from-[#0b4a4f] to-[#0f5c62] p-8 sm:p-10 text-white shadow-2xl relative overflow-hidden">
          <span className="text-xs font-bold uppercase tracking-wider text-[#ffd600]">Scan to chat</span>
          <h2 className="mt-2 text-2xl sm:text-3xl font-extrabold font-ubuntu">QR Code Generation</h2>
          <p className="mt-3 text-sm text-emerald-100 leading-relaxed">
            Make a QR code for your WhatsApp number. Customers scan it and start chatting with you straight away.
          </p>
          <Link to="/signup" className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#27c462] hover:bg-[#20b255] text-white px-6 py-3 text-sm font-bold shadow-lg transition-all">
            Generate your QR code <QrCode className="h-4 w-4" />
          </Link>
        </div>
      </Reveal>
    </div>
  </section>
);

// --- Pricing (plans and offers set by the super admin) -----------------------------

const PricingSection: React.FC<{ content: SiteContent }> = ({ content }) => {
  const { info, loading } = usePublicPlans();
  const plans = info?.plans ?? [];
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
    <section id="pricing" className="py-24 bg-gray-50/80 dark:bg-[#0c1419]/70 border-y border-gray-100 dark:border-white/[0.04] scroll-mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center max-w-3xl mx-auto mb-12">
          <Eyebrow tone="from-emerald-500 to-sky-500">Pricing</Eyebrow>
          <h2 className={cn(sectionTitle, 'mt-3')}>{content.pricing_title}</h2>
          {content.pricing_subtitle && <p className={sectionText}>{content.pricing_subtitle}</p>}
          <div className="mt-8 inline-flex flex-wrap justify-center gap-1 p-1 rounded-3xl sm:rounded-full bg-white dark:bg-[#111b21] border border-gray-200 dark:border-white/10 shadow-sm">
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
                  <span className="text-[10px] uppercase font-bold bg-[#ffd600] text-gray-900 px-1.5 py-0.5 rounded-full">
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
        'relative h-full rounded-3xl bg-white dark:bg-[#111b21] p-8 flex flex-col justify-between transition-all duration-300',
        featured
          ? 'border-2 border-transparent [background:linear-gradient(white,white)_padding-box,linear-gradient(135deg,#10b981,#0ea5e9,#8b5cf6)_border-box] dark:[background:linear-gradient(#111b21,#111b21)_padding-box,linear-gradient(135deg,#10b981,#0ea5e9,#8b5cf6)_border-box] shadow-xl shadow-sky-500/10 md:scale-105 z-10'
          : 'border border-gray-200 dark:border-white/10 shadow-sm hover:shadow-xl hover:-translate-y-1'
      )}
    >
      {featured && (
        <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-emerald-500 via-sky-500 to-violet-500 text-white px-4 py-1 text-xs font-bold uppercase tracking-wider shadow-sm">
          Most popular
        </span>
      )}
      <div>
        <h3 className="text-xl font-bold text-gray-900 dark:text-white font-ubuntu">{plan.name}</h3>
        {plan.description && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{plan.description}</p>}
        <div className="mt-4">
          {price.discount > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-400 line-through">{formatPrice(price.full)}</span>
              <span className="rounded-full bg-emerald-50 dark:bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                {price.discount}% OFF
              </span>
            </div>
          )}
          <div className="flex items-baseline gap-1">
            <span className="text-4xl font-extrabold text-gray-900 dark:text-white font-ubuntu">
              {price.total > 0 ? formatPrice(price.total) : 'Free'}
            </span>
            {price.total > 0 && <span className="text-sm text-gray-500">/ {unit}</span>}
          </div>
          {price.saving > 0 && <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">You save {formatPrice(price.saving)}</p>}
        </div>
        <a
          href="https://business.whatsapp.com/products/platform-pricing"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 text-xs text-gray-500 hover:text-[#27c462] inline-flex items-center gap-1"
        >
          + WhatsApp messaging charges <ExternalLink className="h-3 w-3" />
        </a>

        <div className="my-6 border-t border-gray-100 dark:border-white/10" />
        <ul className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
          {planLimits(plan).map((l) => (
            <li key={l.label} className="flex items-center justify-between gap-3">
              <span>{l.label}</span>
              <strong className={l.value === 'Unlimited' ? 'text-[#27c462]' : 'text-gray-900 dark:text-white'}>{l.value}</strong>
            </li>
          ))}
          {plan.features.map((f) => (
            <li key={f} className="flex items-start gap-2">
              <Check className="h-4 w-4 text-[#27c462] mt-0.5 shrink-0" />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="pt-8">
        <Link
          to={`/signup?plan=${plan.id}`}
          className={cn(
            'block w-full text-center rounded-full py-3 text-sm font-bold transition-all',
            featured
              ? 'bg-gradient-to-r from-emerald-500 to-sky-500 hover:from-emerald-600 hover:to-sky-600 text-white shadow-md shadow-emerald-500/20'
              : 'border border-gray-300 dark:border-white/20 text-gray-700 dark:text-gray-200 hover:border-[#27c462] hover:text-[#27c462]'
          )}
        >
          Choose {plan.name}
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-12 gap-12">
        <Reveal className="lg:col-span-5 space-y-4">
          <Eyebrow tone="from-rose-500 to-orange-400">Help & support</Eyebrow>
          <h2 className={sectionTitle}>{content.faq_title}</h2>
          {content.faq_subtitle && <p className="text-base text-gray-600 dark:text-gray-300 leading-relaxed">{content.faq_subtitle}</p>}
          <a
            href="#contact"
            className="inline-flex items-center gap-2 rounded-full border border-gray-300 dark:border-white/20 text-gray-700 dark:text-gray-300 hover:border-[#27c462] hover:text-[#27c462] px-5 py-2.5 text-xs font-semibold transition-all"
          >
            Still have questions? Contact us <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </Reveal>
        <div className="lg:col-span-7 space-y-3">
          {content.faqs.map((faq, i) => {
            const open = openIndex === i;
            return (
              <Reveal key={faq.question + i} delay={i * 60}>
                <div className={cn('rounded-2xl border bg-white dark:bg-[#111b21] overflow-hidden transition-colors', open ? 'border-emerald-200 dark:border-emerald-500/30' : 'border-gray-100 dark:border-white/10')}>
                  <button
                    type="button"
                    onClick={() => setOpenIndex(open ? null : i)}
                    aria-expanded={open}
                    className="w-full flex items-center justify-between gap-4 p-5 text-left text-base font-bold text-gray-900 dark:text-white"
                  >
                    <span>{faq.question}</span>
                    <ChevronDown className={cn('h-5 w-5 text-gray-400 transition-transform shrink-0', open && 'rotate-180 text-[#27c462]')} />
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

// --- Contact call-to-action ----------------------------------------------------------

const ContactBand: React.FC<{ content: SiteContent }> = ({ content }) => {
  const wa = content.whatsapp_number.replace(/\D/g, '');
  return (
    <section id="contact" className="pb-24 scroll-mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal>
          <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-emerald-500 via-teal-600 to-sky-700 px-8 py-12 sm:px-14 sm:py-14 text-white shadow-2xl">
            <div aria-hidden className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
            <div aria-hidden className="absolute -left-16 -bottom-24 h-72 w-72 rounded-full bg-violet-400/30 blur-3xl" />
            <div className="relative grid gap-8 lg:grid-cols-2 lg:items-center">
              <div>
                <h2 className="text-3xl sm:text-4xl font-extrabold font-ubuntu">Ready to grow on WhatsApp?</h2>
                <p className="mt-3 text-emerald-50/90">Start today, or talk to us and we'll help you set everything up.</p>
              </div>
              <div className="flex flex-wrap gap-3 lg:justify-end">
                <Link to="/signup" className="inline-flex items-center gap-2 rounded-full bg-white text-[#0f5c62] hover:bg-emerald-50 px-7 py-3.5 text-sm font-bold shadow-lg transition-all hover:-translate-y-0.5">
                  {content.primary_cta || 'Get Started'} <ArrowRight className="h-4 w-4" />
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
