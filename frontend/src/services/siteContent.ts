import { useEffect, useSyncExternalStore } from 'react';
import { api } from '@/services/api';
import { readData } from '@/services/response';

// Website content (landing page text, contact details, social links, logo
// display and animations). Only the super admin can change it.

export interface SiteCard {
  title: string;
  text: string;
  icon: string;
}

export interface SiteFAQ {
  question: string;
  answer: string;
}

export type LogoDisplay = 'logo' | 'logo_name' | 'name';
export type AnimationStyle = 'fade-up' | 'zoom' | 'slide-left' | 'none';
export type AnimationSpeed = 'slow' | 'normal' | 'fast';
export type HeroBackground = 'glow' | 'gradient' | 'plain';

export interface SiteContent {
  logo_display: LogoDisplay;
  logo_height: number;
  animations_enabled: boolean;
  animation_style: AnimationStyle;
  animation_speed: AnimationSpeed;
  hero_background: HeroBackground;

  hero_badge: string;
  hero_title: string;
  hero_highlight: string;
  hero_subtitle: string;
  primary_cta: string;
  secondary_cta: string;
  hero_image_url: string;
  trust_badges: string[];

  show_why: boolean;
  show_features: boolean;
  show_solutions: boolean;
  show_pricing: boolean;
  show_faq: boolean;

  why_title: string;
  why_subtitle: string;
  why_cards: SiteCard[];
  features_title: string;
  features_subtitle: string;
  features: SiteCard[];
  pricing_title: string;
  pricing_subtitle: string;
  faq_title: string;
  faq_subtitle: string;
  faqs: SiteFAQ[];

  footer_tagline: string;
  copyright_text: string;
  address: string;
  phone: string;
  email: string;
  whatsapp_number: string;
  business_hours: string;
  map_url: string;

  facebook_url: string;
  instagram_url: string;
  twitter_url: string;
  linkedin_url: string;
  youtube_url: string;
}

export interface PublicPageLink {
  title: string;
  slug: string;
}

/** Icons the super admin can pick for feature cards. */
export const SITE_ICONS = [
  'sparkles', 'award', 'trending-up', 'headphones', 'log-in', 'file-text', 'phone', 'message-square', 'bot', 'sliders',
  'users', 'zap', 'workflow', 'shield', 'megaphone', 'qr-code', 'globe', 'bar-chart', 'clock', 'heart',
] as const;

/** Mirrors the backend defaults, so the page looks right before the first fetch. */
export const DEFAULT_SITE_CONTENT: SiteContent = {
  logo_display: 'logo',
  logo_height: 40,
  animations_enabled: true,
  animation_style: 'fade-up',
  animation_speed: 'normal',
  hero_background: 'gradient',
  hero_badge: 'Official WhatsApp Cloud API Platform',
  hero_title: 'Engage your customers on WhatsApp like never before with',
  hero_highlight: 'One Suit',
  hero_subtitle:
    'Connect in real time, automate replies 24/7, schedule broadcasts and turn conversations into revenue, all from one platform.',
  primary_cta: 'Get Started',
  secondary_cta: 'Log in',
  hero_image_url: '',
  trust_badges: ['Meta Verified', '98% Open Rate', '24/7 Bot Replies', 'Zero Server Setup'],
  show_why: true,
  show_features: true,
  show_solutions: true,
  show_pricing: true,
  show_faq: true,
  why_title: 'Why choose One Suit?',
  why_subtitle: 'Built to give businesses the highest return from WhatsApp marketing.',
  why_cards: [
    { title: 'Increased Engagement', text: 'Talk to customers in real time on the app they open every day, and build relationships that last.', icon: 'award' },
    { title: 'Higher Conversions', text: 'Targeted, personal campaigns turn casual chats into sales.', icon: 'trending-up' },
    { title: '24/7 Support', text: 'Automatic replies answer customers any time, so you never miss a lead.', icon: 'headphones' },
  ],
  features_title: 'Everything you need for WhatsApp marketing',
  features_subtitle: 'Features that make WhatsApp marketing simple.',
  features: [
    { title: 'Embedded Signup', text: "Connect your WhatsApp number in minutes with Meta's official signup.", icon: 'log-in' },
    { title: 'Template Management', text: 'Create and submit message templates without leaving the app.', icon: 'file-text' },
    { title: 'Multiple Numbers', text: 'Manage several phone numbers from one account.', icon: 'phone' },
    { title: 'Team Inbox', text: 'A familiar WhatsApp-style live chat shared by your whole team.', icon: 'message-square' },
    { title: 'Chatbots', text: 'Answer customers 24/7 with keyword replies and AI.', icon: 'bot' },
    { title: 'APIs & Webhooks', text: 'Connect your CRM, store and other tools.', icon: 'sliders' },
    { title: 'Contacts', text: 'Import and export contacts with tags and custom fields.', icon: 'users' },
    { title: 'Realtime Updates', text: 'Delivery and read receipts as they happen.', icon: 'zap' },
    { title: 'Interactive Messages', text: 'Buttons, lists, media and catalog messages.', icon: 'workflow' },
  ],
  pricing_title: 'Simple and clear pricing',
  pricing_subtitle: 'Start small and grow. Save more with longer billing cycles.',
  faq_title: 'Frequently asked questions',
  faq_subtitle: 'Answers to the questions we hear most.',
  faqs: [
    { question: 'How do I sign up?', answer: "Open the sign-up page, enter your details and connect your WhatsApp Business number with Meta's Embedded Signup." },
    { question: 'Can I import my existing contacts?', answer: 'Yes. Upload an XLSX or CSV file, map your fields and start sending campaigns.' },
    { question: 'Do I need my own servers?', answer: 'No. Everything runs in the cloud on the official WhatsApp Cloud API.' },
    { question: 'Can several agents use the same number?', answer: 'Yes. The shared team inbox lets you assign and transfer chats and leave internal notes.' },
  ],
  footer_tagline:
    'One Suit for all your business needs. The modern WhatsApp marketing platform built on the WhatsApp Business Cloud API.',
  copyright_text: '',
  address: '',
  phone: '',
  email: '',
  whatsapp_number: '',
  business_hours: 'Monday – Saturday, 9:00 AM – 7:00 PM IST',
  map_url: '',
  facebook_url: '',
  instagram_url: '',
  twitter_url: '',
  linkedin_url: '',
  youtube_url: '',
};

const merge = (raw: Partial<SiteContent> | null | undefined): SiteContent => {
  const out = { ...DEFAULT_SITE_CONTENT };
  if (!raw) return out;
  (Object.keys(out) as (keyof SiteContent)[]).forEach((k) => {
    const v = raw[k];
    if (v !== undefined && v !== null && typeof v === typeof out[k]) {
      (out as Record<string, unknown>)[k] = v;
    }
  });
  return out;
};

interface PublicSite {
  content: SiteContent;
  pages: PublicPageLink[];
}

let current: PublicSite = { content: DEFAULT_SITE_CONTENT, pages: [] };
let fetched = false;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

/** Load the website content again (e.g. after the super admin saves). */
export function refreshSiteContent(): Promise<void> {
  if (inflight) return inflight;
  inflight = api
    .get('/public/site-content')
    .then((res) => {
      const data = readData<{ content?: Partial<SiteContent>; pages?: PublicPageLink[] }>(res);
      current = { content: merge(data?.content), pages: Array.isArray(data?.pages) ? data.pages : [] };
      fetched = true;
      listeners.forEach((l) => l());
    })
    .catch(() => undefined)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** The public website content and the list of published pages. */
export function usePublicSite(): PublicSite {
  const site = useSyncExternalStore(subscribe, () => current);
  useEffect(() => {
    if (!fetched) void refreshSiteContent();
  }, []);
  return site;
}

const unwrap = <T>(p: Promise<{ data: { data: T } }>) => p.then((r) => r.data.data);

export const siteContentService = {
  get: () => unwrap<Partial<SiteContent>>(api.get('/super-admin/site-content')).then(merge),
  update: (data: SiteContent) => unwrap<Partial<SiteContent>>(api.put('/super-admin/site-content', data)).then(merge),
  getPublicPage: (slug: string) =>
    unwrap<{ title: string; slug: string; content: string; updated_at: string }>(api.get(`/public/pages/${encodeURIComponent(slug)}`)),
};
