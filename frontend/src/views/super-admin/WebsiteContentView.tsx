import React, { useEffect, useRef, useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { ErrorState } from '@/components/shared/ErrorState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Globe, ExternalLink, Plus, Trash2, ArrowUp, ArrowDown, Upload, Save, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import {
  siteContentService,
  refreshSiteContent,
  DEFAULT_SITE_CONTENT,
  SITE_ICONS,
  type SiteContent,
  type SiteCard,
} from '@/services/siteContent';
import { superAdminService, LOGO_MAX_BYTES, LOGO_TYPES } from '@/services/superAdmin';
import { setBranding, useBranding, resolveAssetUrl } from '@/services/branding';
import { SiteIcon } from '@/views/public/site/SiteKit';
import { cardClass, fieldClass, LoadingBlock, errorMessage } from './shared';
import { cn } from '@/lib/utils';

// Super admin editor for the public website: logo, animations, every text on
// the landing page, FAQs, contact details and social links.

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode; className?: string }> = ({ label, hint, children, className }) => (
  <div className={cn('grid gap-1.5', className)}>
    <Label className="text-xs font-medium">{label}</Label>
    {children}
    {hint && <p className="text-[11px] text-white/40 light:text-gray-500">{hint}</p>}
  </div>
);

const Section: React.FC<{ title: string; description?: string; children: React.ReactNode; action?: React.ReactNode }> = ({
  title,
  description,
  children,
  action,
}) => (
  <div className={cn('rounded-xl border p-5 space-y-4', cardClass)}>
    <div className="flex items-start justify-between gap-3">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {description && <p className="text-xs text-white/50 light:text-gray-500 mt-0.5">{description}</p>}
      </div>
      {action}
    </div>
    {children}
  </div>
);

const ToggleRow: React.FC<{ label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }> = ({ label, hint, checked, onChange }) => (
  <label className="flex items-center justify-between gap-4 py-1">
    <span>
      <span className="block text-sm">{label}</span>
      {hint && <span className="block text-[11px] text-white/40 light:text-gray-500">{hint}</span>}
    </span>
    <Switch checked={checked} onCheckedChange={onChange} />
  </label>
);

/** Move an item up or down a list. */
const move = <T,>(list: T[], i: number, dir: -1 | 1) => {
  const j = i + dir;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
};

const ListControls: React.FC<{ onUp: () => void; onDown: () => void; onRemove: () => void }> = ({ onUp, onDown, onRemove }) => (
  <div className="flex shrink-0 items-center gap-0.5">
    <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={onUp} aria-label="Move up">
      <ArrowUp className="h-3.5 w-3.5" />
    </Button>
    <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={onDown} aria-label="Move down">
      <ArrowDown className="h-3.5 w-3.5" />
    </Button>
    <Button type="button" size="icon" variant="ghost" className="h-7 w-7 hover:text-rose-400" onClick={onRemove} aria-label="Remove">
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  </div>
);

const CardsEditor: React.FC<{ cards: SiteCard[]; onChange: (c: SiteCard[]) => void; max: number }> = ({ cards, onChange, max }) => (
  <div className="space-y-3">
    {cards.map((c, i) => (
      <div key={i} className="rounded-lg border border-white/10 light:border-gray-200 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Select value={c.icon} onValueChange={(icon) => onChange(cards.map((x, k) => (k === i ? { ...x, icon } : x)))}>
            <SelectTrigger className={cn(fieldClass, 'w-[150px] h-9')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SITE_ICONS.map((ic) => (
                <SelectItem key={ic} value={ic}>
                  <span className="flex items-center gap-2">
                    <SiteIcon name={ic} className="h-3.5 w-3.5" /> {ic}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={c.title}
            placeholder="Title"
            onChange={(e) => onChange(cards.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)))}
            className={cn(fieldClass, 'h-9')}
          />
          <ListControls
            onUp={() => onChange(move(cards, i, -1))}
            onDown={() => onChange(move(cards, i, 1))}
            onRemove={() => onChange(cards.filter((_, k) => k !== i))}
          />
        </div>
        <Textarea
          rows={2}
          value={c.text}
          placeholder="Short description"
          onChange={(e) => onChange(cards.map((x, k) => (k === i ? { ...x, text: e.target.value } : x)))}
          className={fieldClass}
        />
      </div>
    ))}
    {cards.length < max && (
      <Button type="button" size="sm" variant="outline" className="border-white/10 light:border-gray-200" onClick={() => onChange([...cards, { title: '', text: '', icon: 'sparkles' }])}>
        <Plus className="h-3.5 w-3.5 mr-1.5" /> Add card
      </Button>
    )}
  </div>
);

export const WebsiteContentView: React.FC = () => {
  const [content, setContent] = useState<SiteContent | null>(null);
  const [saved, setSaved] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const branding = useBranding();

  const load = () => {
    setError(null);
    siteContentService
      .get()
      .then((c) => {
        setContent(c);
        setSaved(JSON.stringify(c));
      })
      .catch((e) => setError(errorMessage(e)));
  };
  useEffect(load, []);

  const dirty = content !== null && JSON.stringify(content) !== saved;
  const set = <K extends keyof SiteContent>(k: K, v: SiteContent[K]) => setContent((c) => (c ? { ...c, [k]: v } : c));
  const text = (k: keyof SiteContent) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    set(k, e.target.value as never);

  const save = async () => {
    if (!content) return;
    setSaving(true);
    try {
      const updated = await siteContentService.update(content);
      setContent(updated);
      setSaved(JSON.stringify(updated));
      void refreshSiteContent();
      toast.success('Website updated');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save the website'));
    } finally {
      setSaving(false);
    }
  };

  const uploadLogo = async (file: File) => {
    if (!LOGO_TYPES.includes(file.type)) return toast.error('Use a PNG, JPEG or WebP image');
    if (file.size > LOGO_MAX_BYTES) return toast.error('The logo must be 512 KB or smaller');
    setUploading(true);
    try {
      setBranding(await superAdminService.uploadLogo(file));
      toast.success('Logo updated');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not upload the logo'));
    } finally {
      setUploading(false);
    }
  };

  const removeLogo = async () => {
    try {
      setBranding(await superAdminService.removeLogo());
      toast.success('Logo removed; the default One Suit logo is shown');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const logoSrc = branding.logo_url ? resolveAssetUrl(branding.logo_url) : '/landing/onesuit-logo-transparent.png';

  return (
    <div className="flex flex-col min-h-full bg-[#0a0a0b] light:bg-gray-50">
      <PageHeader
        title="Website"
        subtitle="Everything on the public website: logo, animations, text, FAQs, contact details and social links"
        icon={Globe}
        iconGradient="bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-500/20"
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="border-white/10 light:border-gray-200" asChild>
              <a href="/" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" /> View website
              </a>
            </Button>
            <Button size="sm" disabled={!dirty || saving} onClick={save} className="bg-emerald-600 hover:bg-emerald-500 text-white">
              <Save className="h-4 w-4 mr-2" /> {saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
            </Button>
          </div>
        }
      />

      {error ? (
        <div className="p-6"><ErrorState title="Couldn't load the website content" description={error} onRetry={load} /></div>
      ) : !content ? (
        <LoadingBlock />
      ) : (
        <div className="p-4 sm:p-6 max-w-5xl w-full mx-auto">
          <Tabs defaultValue="look" className="space-y-4">
            <TabsList className="flex flex-wrap h-auto">
              <TabsTrigger value="look">Logo & animations</TabsTrigger>
              <TabsTrigger value="hero">Top banner</TabsTrigger>
              <TabsTrigger value="sections">Sections</TabsTrigger>
              <TabsTrigger value="faq">FAQs</TabsTrigger>
              <TabsTrigger value="contact">Contact & social</TabsTrigger>
            </TabsList>

            {/* Logo & animations */}
            <TabsContent value="look" className="space-y-4">
              <Section title="Logo" description="Shown once in the website header and footer.">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex h-20 min-w-[160px] items-center justify-center rounded-lg border border-dashed border-white/15 light:border-gray-300 bg-white px-4">
                    <img src={logoSrc} alt="Logo" style={{ height: content.logo_height }} className="w-auto object-contain" />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <input
                      ref={fileRef}
                      type="file"
                      accept={LOGO_TYPES.join(',')}
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void uploadLogo(f);
                        e.target.value = '';
                      }}
                    />
                    <Button type="button" size="sm" variant="outline" className="border-white/10 light:border-gray-200" disabled={uploading} onClick={() => fileRef.current?.click()}>
                      <Upload className="h-4 w-4 mr-2" /> {uploading ? 'Uploading…' : 'Upload new logo'}
                    </Button>
                    {branding.logo_url && (
                      <Button type="button" size="sm" variant="ghost" onClick={removeLogo}>
                        <RotateCcw className="h-4 w-4 mr-2" /> Use default logo
                      </Button>
                    )}
                  </div>
                </div>
                <p className="text-[11px] text-white/40 light:text-gray-500">PNG, JPEG or WebP, up to 512 KB. The logo also becomes the browser tab icon.</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Show in header" hint="The default logo already contains the name, so it is never shown twice.">
                    <Select value={content.logo_display} onValueChange={(v) => set('logo_display', v as SiteContent['logo_display'])}>
                      <SelectTrigger className={fieldClass}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="logo">Logo only</SelectItem>
                        <SelectItem value="logo_name">Logo and platform name</SelectItem>
                        <SelectItem value="name">Platform name only</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label={`Logo size: ${content.logo_height}px`}>
                    <input
                      type="range"
                      min={24}
                      max={80}
                      step={2}
                      value={content.logo_height}
                      onChange={(e) => set('logo_height', Number(e.target.value))}
                      className="mt-2 w-full accent-emerald-500"
                    />
                  </Field>
                </div>
              </Section>

              <Section title="Animations" description="How sections appear while visitors scroll.">
                <ToggleRow
                  label="Animations on"
                  hint="Visitors who turned on 'reduce motion' on their device never see animations."
                  checked={content.animations_enabled}
                  onChange={(v) => set('animations_enabled', v)}
                />
                <div className={cn('grid gap-4 sm:grid-cols-3', !content.animations_enabled && 'opacity-50 pointer-events-none')}>
                  <Field label="Style">
                    <Select value={content.animation_style} onValueChange={(v) => set('animation_style', v as SiteContent['animation_style'])}>
                      <SelectTrigger className={fieldClass}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fade-up">Fade up</SelectItem>
                        <SelectItem value="zoom">Zoom in</SelectItem>
                        <SelectItem value="slide-left">Slide in</SelectItem>
                        <SelectItem value="none">None</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Speed">
                    <Select value={content.animation_speed} onValueChange={(v) => set('animation_speed', v as SiteContent['animation_speed'])}>
                      <SelectTrigger className={fieldClass}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="slow">Slow</SelectItem>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="fast">Fast</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Top banner background">
                    <Select value={content.hero_background} onValueChange={(v) => set('hero_background', v as SiteContent['hero_background'])}>
                      <SelectTrigger className={fieldClass}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gradient">Moving gradient</SelectItem>
                        <SelectItem value="glow">Soft glow</SelectItem>
                        <SelectItem value="plain">Plain</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              </Section>
            </TabsContent>

            {/* Hero */}
            <TabsContent value="hero" className="space-y-4">
              <Section title="Top banner" description="The first thing visitors see.">
                <Field label="Small label above the headline">
                  <Input value={content.hero_badge} onChange={text('hero_badge')} className={fieldClass} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Headline *" className="sm:col-span-2">
                    <Textarea rows={2} value={content.hero_title} onChange={text('hero_title')} className={fieldClass} />
                  </Field>
                  <Field label="Highlighted words" hint="Shown in green after the headline.">
                    <Input value={content.hero_highlight} onChange={text('hero_highlight')} className={fieldClass} />
                  </Field>
                </div>
                <Field label="Text under the headline">
                  <Textarea rows={3} value={content.hero_subtitle} onChange={text('hero_subtitle')} className={fieldClass} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Main button (opens sign up)" hint="Leave empty to hide.">
                    <Input value={content.primary_cta} onChange={text('primary_cta')} className={fieldClass} />
                  </Field>
                  <Field label="Second button (opens login)" hint="Leave empty to hide.">
                    <Input value={content.secondary_cta} onChange={text('secondary_cta')} className={fieldClass} />
                  </Field>
                </div>
                <Field label="Banner image link" hint="Optional. An https:// link to an image; empty uses the default picture.">
                  <Input value={content.hero_image_url} placeholder="https://…" onChange={text('hero_image_url')} className={fieldClass} />
                </Field>
                <Field label="Highlights (one per line, up to 6)">
                  <Textarea
                    rows={4}
                    value={content.trust_badges.join('\n')}
                    onChange={(e) => set('trust_badges', e.target.value.split('\n'))}
                    className={fieldClass}
                  />
                </Field>
              </Section>
            </TabsContent>

            {/* Sections */}
            <TabsContent value="sections" className="space-y-4">
              <Section title="Show or hide sections">
                <div className="grid gap-x-8 sm:grid-cols-2">
                  <ToggleRow label="Why choose us" checked={content.show_why} onChange={(v) => set('show_why', v)} />
                  <ToggleRow label="Features" checked={content.show_features} onChange={(v) => set('show_features', v)} />
                  <ToggleRow label="Solutions" checked={content.show_solutions} onChange={(v) => set('show_solutions', v)} />
                  <ToggleRow label="Pricing (your plans)" checked={content.show_pricing} onChange={(v) => set('show_pricing', v)} />
                  <ToggleRow label="FAQs" checked={content.show_faq} onChange={(v) => set('show_faq', v)} />
                </div>
              </Section>
              <Section title="Why choose us" description="Up to 6 cards.">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Title"><Input value={content.why_title} onChange={text('why_title')} className={fieldClass} /></Field>
                  <Field label="Subtitle"><Input value={content.why_subtitle} onChange={text('why_subtitle')} className={fieldClass} /></Field>
                </div>
                <CardsEditor cards={content.why_cards} onChange={(c) => set('why_cards', c)} max={6} />
              </Section>
              <Section title="Features" description="Up to 12 cards.">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Title"><Input value={content.features_title} onChange={text('features_title')} className={fieldClass} /></Field>
                  <Field label="Subtitle"><Input value={content.features_subtitle} onChange={text('features_subtitle')} className={fieldClass} /></Field>
                </div>
                <CardsEditor cards={content.features} onChange={(c) => set('features', c)} max={12} />
              </Section>
              <Section title="Pricing" description="Plans, prices and offers come from Subscription Plans.">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Title"><Input value={content.pricing_title} onChange={text('pricing_title')} className={fieldClass} /></Field>
                  <Field label="Subtitle"><Input value={content.pricing_subtitle} onChange={text('pricing_subtitle')} className={fieldClass} /></Field>
                </div>
              </Section>
            </TabsContent>

            {/* FAQs */}
            <TabsContent value="faq" className="space-y-4">
              <Section
                title="Frequently asked questions"
                description="Up to 20 questions."
                action={
                  content.faqs.length < 20 ? (
                    <Button type="button" size="sm" variant="outline" className="border-white/10 light:border-gray-200" onClick={() => set('faqs', [...content.faqs, { question: '', answer: '' }])}>
                      <Plus className="h-3.5 w-3.5 mr-1.5" /> Add question
                    </Button>
                  ) : undefined
                }
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Title"><Input value={content.faq_title} onChange={text('faq_title')} className={fieldClass} /></Field>
                  <Field label="Subtitle"><Input value={content.faq_subtitle} onChange={text('faq_subtitle')} className={fieldClass} /></Field>
                </div>
                {content.faqs.map((f, i) => (
                  <div key={i} className="rounded-lg border border-white/10 light:border-gray-200 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Input
                        value={f.question}
                        placeholder="Question"
                        onChange={(e) => set('faqs', content.faqs.map((x, k) => (k === i ? { ...x, question: e.target.value } : x)))}
                        className={cn(fieldClass, 'h-9')}
                      />
                      <ListControls
                        onUp={() => set('faqs', move(content.faqs, i, -1))}
                        onDown={() => set('faqs', move(content.faqs, i, 1))}
                        onRemove={() => set('faqs', content.faqs.filter((_, k) => k !== i))}
                      />
                    </div>
                    <Textarea
                      rows={2}
                      value={f.answer}
                      placeholder="Answer"
                      onChange={(e) => set('faqs', content.faqs.map((x, k) => (k === i ? { ...x, answer: e.target.value } : x)))}
                      className={fieldClass}
                    />
                  </div>
                ))}
              </Section>
            </TabsContent>

            {/* Contact & social */}
            <TabsContent value="contact" className="space-y-4">
              <Section title="Contact details" description="Shown in the footer and the contact section.">
                <Field label="Address / location">
                  <Textarea rows={2} value={content.address} onChange={text('address')} className={fieldClass} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Google Maps link" hint="Optional; makes the address clickable.">
                    <Input value={content.map_url} placeholder="https://maps.google.com/…" onChange={text('map_url')} className={fieldClass} />
                  </Field>
                  <Field label="Business hours">
                    <Input value={content.business_hours} onChange={text('business_hours')} className={fieldClass} />
                  </Field>
                  <Field label="Phone">
                    <Input value={content.phone} onChange={text('phone')} className={fieldClass} />
                  </Field>
                  <Field label="WhatsApp number" hint="With country code; adds a 'Chat on WhatsApp' button.">
                    <Input value={content.whatsapp_number} placeholder="919876543210" onChange={text('whatsapp_number')} className={fieldClass} />
                  </Field>
                  <Field label="Email">
                    <Input type="email" value={content.email} onChange={text('email')} className={fieldClass} />
                  </Field>
                </div>
              </Section>
              <Section title="Social media" description="Leave a link empty to hide its icon.">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Facebook"><Input value={content.facebook_url} placeholder="https://facebook.com/…" onChange={text('facebook_url')} className={fieldClass} /></Field>
                  <Field label="Instagram"><Input value={content.instagram_url} placeholder="https://instagram.com/…" onChange={text('instagram_url')} className={fieldClass} /></Field>
                  <Field label="X (Twitter)"><Input value={content.twitter_url} placeholder="https://x.com/…" onChange={text('twitter_url')} className={fieldClass} /></Field>
                  <Field label="LinkedIn"><Input value={content.linkedin_url} placeholder="https://linkedin.com/company/…" onChange={text('linkedin_url')} className={fieldClass} /></Field>
                  <Field label="YouTube"><Input value={content.youtube_url} placeholder="https://youtube.com/@…" onChange={text('youtube_url')} className={fieldClass} /></Field>
                </div>
              </Section>
              <Section title="Footer">
                <Field label="Short description">
                  <Textarea rows={2} value={content.footer_tagline} onChange={text('footer_tagline')} className={fieldClass} />
                </Field>
                <Field label="Copyright line" hint="Empty shows “© year platform name. All rights reserved.”">
                  <Input value={content.copyright_text} onChange={text('copyright_text')} className={fieldClass} />
                </Field>
                <p className="text-[11px] text-white/40 light:text-gray-500">
                  About Us, Privacy Policy, Terms & Conditions and other pages are edited under Pages; every published page is linked in the footer.
                </p>
              </Section>
            </TabsContent>
          </Tabs>

          <div className="mt-4 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setContent({ ...DEFAULT_SITE_CONTENT, address: content.address, phone: content.phone, email: content.email })}
            >
              <RotateCcw className="h-4 w-4 mr-2" /> Restore default text
            </Button>
            <Button size="sm" disabled={!dirty || saving} onClick={save} className="bg-emerald-600 hover:bg-emerald-500 text-white">
              <Save className="h-4 w-4 mr-2" /> {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default WebsiteContentView;
