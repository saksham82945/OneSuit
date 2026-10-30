import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Award,
  BarChart3,
  Bot,
  ChevronDown,
  Clock,
  Facebook,
  FileText,
  Globe,
  Headphones,
  Heart,
  Instagram,
  Linkedin,
  LogIn,
  Mail,
  MapPin,
  Megaphone,
  Menu,
  Moon,
  Sun,
  MessageCircle,
  MessageSquare,
  Phone,
  QrCode,
  Shield,
  Sliders,
  Sparkles,
  TrendingUp,
  Twitter,
  Users,
  Workflow,
  X,
  Youtube,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { resolveAssetUrl, useBranding } from '@/services/branding';
import type { SiteContent, PublicPageLink } from '@/services/siteContent';
import { useSignedInUser } from '../publicApi';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';

// Building blocks of the public website. Everything they show comes from the
// website content the super admin edits.

const ICONS: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  award: Award,
  'trending-up': TrendingUp,
  headphones: Headphones,
  'log-in': LogIn,
  'file-text': FileText,
  phone: Phone,
  'message-square': MessageSquare,
  bot: Bot,
  sliders: Sliders,
  users: Users,
  zap: Zap,
  workflow: Workflow,
  shield: Shield,
  megaphone: Megaphone,
  'qr-code': QrCode,
  globe: Globe,
  'bar-chart': BarChart3,
  clock: Clock,
  heart: Heart,
};

export const SiteIcon: React.FC<{ name: string; className?: string }> = ({ name, className }) => {
  const Icon = ICONS[name] ?? Sparkles;
  return <Icon className={className} />;
};

// --- Animations ---------------------------------------------------------------

interface AnimationSettings {
  enabled: boolean;
  style: SiteContent['animation_style'];
  speed: SiteContent['animation_speed'];
}

const AnimationContext = createContext<AnimationSettings>({ enabled: true, style: 'fade-up', speed: 'normal' });

export const SiteAnimations: React.FC<{ content: SiteContent; children: React.ReactNode }> = ({ content, children }) => (
  <AnimationContext.Provider
    value={{ enabled: content.animations_enabled, style: content.animation_style, speed: content.animation_speed }}
  >
    {children}
  </AnimationContext.Provider>
);

const DURATIONS = { slow: 1100, normal: 700, fast: 400 };

/** Fades/zooms/slides its children in when they scroll into view. */
export const Reveal: React.FC<{ children: React.ReactNode; className?: string; delay?: number; as?: 'div' | 'section' }> = ({
  children,
  className,
  delay = 0,
  as: Tag = 'div',
}) => {
  const { enabled, style, speed } = useContext(AnimationContext);
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const active = enabled && style !== 'none' && typeof IntersectionObserver !== 'undefined';

  useEffect(() => {
    if (!active || !ref.current) return;
    const el = ref.current;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.12 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [active]);

  if (!active) return <Tag className={className}>{children}</Tag>;
  return (
    <Tag
      ref={ref}
      data-anim={style}
      className={cn('site-reveal', visible && 'is-visible', className)}
      style={{ transitionDelay: `${delay}ms`, ['--site-anim-duration' as string]: `${DURATIONS[speed]}ms` }}
    >
      {children}
    </Tag>
  );
};

// --- Colors ---------------------------------------------------------------------

/** Accent colors cycled through cards so the page isn't one flat green. */
export const ACCENTS = [
  { tile: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300', hover: 'group-hover:bg-emerald-500', ring: 'hover:border-emerald-300 dark:hover:border-emerald-500/40', bar: 'from-emerald-400 to-teal-500' },
  { tile: 'bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300', hover: 'group-hover:bg-sky-500', ring: 'hover:border-sky-300 dark:hover:border-sky-500/40', bar: 'from-sky-400 to-blue-500' },
  { tile: 'bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300', hover: 'group-hover:bg-violet-500', ring: 'hover:border-violet-300 dark:hover:border-violet-500/40', bar: 'from-violet-400 to-fuchsia-500' },
  { tile: 'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300', hover: 'group-hover:bg-amber-500', ring: 'hover:border-amber-300 dark:hover:border-amber-500/40', bar: 'from-amber-400 to-orange-500' },
  { tile: 'bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300', hover: 'group-hover:bg-rose-500', ring: 'hover:border-rose-300 dark:hover:border-rose-500/40', bar: 'from-rose-400 to-pink-500' },
  { tile: 'bg-teal-100 text-teal-600 dark:bg-teal-500/15 dark:text-teal-300', hover: 'group-hover:bg-teal-500', ring: 'hover:border-teal-300 dark:hover:border-teal-500/40', bar: 'from-teal-400 to-cyan-500' },
];

// --- Theme toggle -------------------------------------------------------------------

/** Dark / light switch for the public website (shared with the app). */
export const ThemeToggle: React.FC<{ className?: string }> = ({ className }) => {
  const { isDark, toggleTheme } = useTheme();
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Light theme' : 'Dark theme'}
      className={cn(
        'relative inline-flex h-9 w-16 shrink-0 items-center rounded-full border transition-colors',
        isDark ? 'border-white/15 bg-white/10' : 'border-gray-200 bg-gray-100',
        className
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 flex h-7 w-7 items-center justify-center rounded-full shadow-sm transition-all duration-300',
          isDark ? 'left-[34px] bg-[#0f172a] text-amber-300' : 'left-0.5 bg-white text-amber-500'
        )}
      >
        {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
      </span>
    </button>
  );
};

// --- Logo -----------------------------------------------------------------------

/** The logo exactly once: the uploaded logo, the default One Suit wordmark, or the name. */
export const SiteLogo: React.FC<{ content: SiteContent; className?: string; light?: boolean }> = ({ content, className, light }) => {
  const branding = useBranding();
  const name = branding.platform_name || 'One Suit';
  const uploaded = branding.logo_url ? resolveAssetUrl(branding.logo_url) : '';
  const [failed, setFailed] = useState(false);
  const height = content.logo_height || 40;
  const nameEl = (
    <span className={cn('text-2xl font-bold tracking-tight font-ubuntu', light ? 'text-white' : 'text-gray-900 dark:text-white')}>
      {name}
    </span>
  );

  if (content.logo_display === 'name') {
    return <span className={cn('flex items-center', className)}>{nameEl}</span>;
  }
  // The default image already spells "ONE SUIT", so it is never paired with the name.
  const src = uploaded && !failed ? uploaded : '/landing/onesuit-logo-transparent.png';
  const showName = content.logo_display === 'logo_name' && !!uploaded && !failed;
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <img
        src={src}
        alt={name}
        style={{ height }}
        className={cn('w-auto object-contain', !uploaded && (light ? 'brightness-0 invert' : 'dark:brightness-0 dark:invert'))}
        onError={() => setFailed(true)}
      />
      {showName && nameEl}
    </span>
  );
};

// --- Header ---------------------------------------------------------------------

export interface NavLinkItem {
  label: string;
  /** Section id on the landing page. */
  section: string;
}

export const SiteHeader: React.FC<{ content: SiteContent; pages: PublicPageLink[]; nav: NavLinkItem[] }> = ({ content, pages, nav }) => {
  const signedInUser = useSignedInUser();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const goTo = (section: string) => {
    setOpen(false);
    const el = document.getElementById(section);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
    else navigate(`/#${section}`);
  };

  return (
    <header
      className={cn(
        'sticky top-0 z-50 w-full transition-all duration-300',
        scrolled
          ? 'bg-white/90 dark:bg-[#080d11]/90 backdrop-blur-md border-b border-gray-100 dark:border-white/[0.06] shadow-sm'
          : 'bg-transparent border-b border-transparent'
      )}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-4">
        <Link to="/" aria-label="Home" className="shrink-0 transition-transform hover:scale-[1.03]">
          <SiteLogo content={content} />
        </Link>

        <nav className="hidden lg:flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-200">
          {nav.map((n) => (
            <button
              key={n.section}
              type="button"
              onClick={() => goTo(n.section)}
              className="rounded-full px-4 py-2 hover:text-[#27c462] hover:bg-emerald-50/70 dark:hover:bg-white/5 transition-colors"
            >
              {n.label}
            </button>
          ))}
          {pages.length > 0 && (
            <div className="relative group">
              <button type="button" className="flex items-center gap-1 rounded-full px-4 py-2 hover:text-[#27c462] transition-colors">
                Pages <ChevronDown className="h-3.5 w-3.5 transition-transform group-hover:rotate-180" />
              </button>
              <div className="absolute right-0 top-full pt-2 opacity-0 translate-y-1 invisible group-hover:opacity-100 group-hover:translate-y-0 group-hover:visible group-focus-within:visible group-focus-within:opacity-100 transition-all duration-150 z-50">
                <div className="w-60 rounded-2xl border border-gray-100 dark:border-white/10 bg-white dark:bg-[#111b21] p-2 shadow-xl shadow-black/10">
                  {pages.map((p) => (
                    <Link
                      key={p.slug}
                      to={`/p/${p.slug}`}
                      className="block px-3 py-2 text-xs rounded-lg hover:bg-gray-50 dark:hover:bg-white/5 hover:text-[#27c462] transition-colors"
                    >
                      {p.title}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          )}
        </nav>

        <div className="hidden sm:flex items-center gap-3">
          <ThemeToggle />
          {signedInUser ? (
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="inline-flex items-center gap-2 rounded-full bg-[#27c462] hover:bg-[#20b255] text-white px-6 py-2.5 text-sm font-semibold shadow-md shadow-emerald-500/20 transition-all"
            >
              Dashboard <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <>
              <Link
                to="/login"
                className="rounded-full px-5 py-2 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:text-[#27c462] transition-colors"
              >
                Login
              </Link>
              <Link
                to="/signup"
                className="rounded-full bg-[#27c462] hover:bg-[#20b255] text-white px-5 py-2.5 text-sm font-semibold shadow-md shadow-emerald-500/20 hover:shadow-emerald-500/40 hover:-translate-y-0.5 transition-all"
              >
                Register
              </Link>
            </>
          )}
        </div>

        <ThemeToggle className="sm:hidden ml-auto" />
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="lg:hidden p-2 text-gray-700 dark:text-gray-200 hover:text-[#27c462]"
          aria-label="Toggle menu"
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {open && (
        <div className="lg:hidden border-b border-gray-100 dark:border-white/10 bg-white dark:bg-[#0c1418] px-4 pt-3 pb-6 space-y-2 shadow-xl">
          {nav.map((n) => (
            <button
              key={n.section}
              type="button"
              onClick={() => goTo(n.section)}
              className="block w-full text-left py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:text-[#27c462]"
            >
              {n.label}
            </button>
          ))}
          {pages.length > 0 && (
            <div className="pt-2 border-t border-gray-100 dark:border-white/10 grid grid-cols-2 gap-2 text-xs">
              {pages.map((p) => (
                <Link key={p.slug} to={`/p/${p.slug}`} onClick={() => setOpen(false)} className="py-1 text-gray-500 hover:text-[#27c462]">
                  {p.title}
                </Link>
              ))}
            </div>
          )}
          <div className="pt-3 border-t border-gray-100 dark:border-white/10 flex flex-col gap-2">
            {signedInUser ? (
              <Link to="/dashboard" className="text-center w-full rounded-full bg-[#27c462] text-white py-2.5 text-sm font-semibold">
                Open Dashboard
              </Link>
            ) : (
              <>
                <Link to="/login" className="text-center w-full rounded-full border border-[#27c462] text-[#27c462] py-2 text-sm font-semibold">
                  Login
                </Link>
                <Link to="/signup" className="text-center w-full rounded-full bg-[#27c462] text-white py-2 text-sm font-semibold">
                  Register
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
};

// --- Footer ---------------------------------------------------------------------

export const socialLinks = (c: SiteContent) =>
  [
    { url: c.facebook_url, label: 'Facebook', Icon: Facebook },
    { url: c.instagram_url, label: 'Instagram', Icon: Instagram },
    { url: c.twitter_url, label: 'X (Twitter)', Icon: Twitter },
    { url: c.linkedin_url, label: 'LinkedIn', Icon: Linkedin },
    { url: c.youtube_url, label: 'YouTube', Icon: Youtube },
  ].filter((s) => s.url);

const telHref = (n: string) => `tel:${n.replace(/[^\d+]/g, '')}`;
const waHref = (n: string) => `https://wa.me/${n.replace(/\D/g, '')}`;

export const SiteFooter: React.FC<{ content: SiteContent; pages: PublicPageLink[]; nav: NavLinkItem[] }> = ({ content, pages, nav }) => {
  const branding = useBranding();
  const name = branding.platform_name || 'One Suit';
  const socials = socialLinks(content);
  const year = new Date().getFullYear();

  return (
    <footer className="relative border-t border-gray-100 dark:border-white/10 bg-gray-50/60 dark:bg-[#060a0d]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10">
          <div className="md:col-span-4 space-y-4">
            <Link to="/" aria-label="Home" className="inline-block">
              <SiteLogo content={content} />
            </Link>
            {content.footer_tagline && (
              <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm leading-relaxed">{content.footer_tagline}</p>
            )}
            {socials.length > 0 && (
              <div className="flex items-center gap-2 pt-1">
                {socials.map(({ url, label, Icon }) => (
                  <a
                    key={label}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    title={label}
                    className="h-9 w-9 rounded-full bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-500 hover:bg-[#27c462] hover:border-[#27c462] hover:text-white hover:-translate-y-0.5 flex items-center justify-center transition-all"
                  >
                    <Icon className="h-4 w-4" />
                  </a>
                ))}
              </div>
            )}
          </div>

          <div className="md:col-span-2 space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-900 dark:text-white">Explore</h3>
            <ul className="space-y-2 text-sm text-gray-500 dark:text-gray-400">
              {nav.map((n) => (
                <li key={n.section}>
                  <Link to={`/#${n.section}`} className="hover:text-[#27c462] transition-colors">
                    {n.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="md:col-span-3 space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-900 dark:text-white">Company</h3>
            <ul className="space-y-2 text-sm text-gray-500 dark:text-gray-400">
              {pages.map((p) => (
                <li key={p.slug}>
                  <Link to={`/p/${p.slug}`} className="hover:text-[#27c462] transition-colors">
                    {p.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="md:col-span-3 space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-900 dark:text-white">Contact</h3>
            <div className="space-y-2.5 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
              {content.address && (
                <p className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-[#27c462] shrink-0 mt-0.5" />
                  {content.map_url ? (
                    <a href={content.map_url} target="_blank" rel="noopener noreferrer" className="hover:text-[#27c462]">
                      {content.address}
                    </a>
                  ) : (
                    <span>{content.address}</span>
                  )}
                </p>
              )}
              {content.phone && (
                <p className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-[#27c462] shrink-0" />
                  <a href={telHref(content.phone)} className="hover:text-[#27c462]">{content.phone}</a>
                </p>
              )}
              {content.whatsapp_number && (
                <p className="flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-[#27c462] shrink-0" />
                  <a href={waHref(content.whatsapp_number)} target="_blank" rel="noopener noreferrer" className="hover:text-[#27c462]">
                    WhatsApp {content.whatsapp_number}
                  </a>
                </p>
              )}
              {content.email && (
                <p className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-[#27c462] shrink-0" />
                  <a href={`mailto:${content.email}`} className="hover:text-[#27c462] break-all">{content.email}</a>
                </p>
              )}
              {content.business_hours && (
                <p className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-[#27c462] shrink-0" />
                  <span>{content.business_hours}</span>
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="py-4 bg-[#27c462] text-white text-xs font-medium">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>{content.copyright_text || `© ${year} ${name}. All rights reserved.`}</div>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            {pages.slice(0, 4).map((p) => (
              <Link key={p.slug} to={`/p/${p.slug}`} className="hover:underline">
                {p.title}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
};

// --- Page text ------------------------------------------------------------------

/**
 * Shows page text written with simple formatting: "## " headings, "- " bullet
 * lists, blank lines between paragraphs and **bold**. Plain text only; no HTML.
 */
export const RichText: React.FC<{ text: string; className?: string }> = ({ text, className }) => {
  const bold = (line: string) =>
    line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
        <strong key={i} className="font-semibold text-gray-900 dark:text-white">
          {part.slice(2, -2)}
        </strong>
      ) : (
        <React.Fragment key={i}>{part}</React.Fragment>
      )
    );

  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) {
      blocks.push(<p key={`p${blocks.length}`}>{bold(para.join(' '))}</p>);
      para = [];
    }
    if (list.length) {
      blocks.push(
        <ul key={`u${blocks.length}`} className="list-disc pl-5 space-y-1.5">
          {list.map((li, i) => (
            <li key={i}>{bold(li)}</li>
          ))}
        </ul>
      );
      list = [];
    }
  };
  text.split('\n').forEach((raw) => {
    const line = raw.trim();
    if (!line) return flush();
    if (line.startsWith('### ') || line.startsWith('## ') || line.startsWith('# ')) {
      flush();
      const level = line.startsWith('### ') ? 3 : 2;
      const content = line.replace(/^#+\s/, '');
      blocks.push(
        level === 2 ? (
          <h2 key={`h${blocks.length}`} className="pt-4 text-xl font-bold text-gray-900 dark:text-white">{content}</h2>
        ) : (
          <h3 key={`h${blocks.length}`} className="pt-3 text-base font-semibold text-gray-900 dark:text-white">{content}</h3>
        )
      );
      return;
    }
    if (/^[-*]\s/.test(line)) {
      if (para.length) {
        const p = para;
        para = [];
        blocks.push(<p key={`p${blocks.length}`}>{bold(p.join(' '))}</p>);
      }
      list.push(line.replace(/^[-*]\s/, ''));
      return;
    }
    if (list.length) flush();
    para.push(line);
  });
  flush();
  return <div className={cn('space-y-3 text-[15px] leading-relaxed text-gray-600 dark:text-gray-300', className)}>{blocks}</div>;
};
