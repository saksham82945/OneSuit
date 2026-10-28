import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Check, Film, Image as ImageIcon, Info, Loader2, RotateCcw, Save, Sparkles, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth';
import { cn } from '@/lib/utils';
import { AD_TYPES, adTypeLabel, adsApi, errorMessage, useAdsSetup, type AdCreative, type AdType } from './adsApi';
import { AdPreview, AdsPage, cardCls, nativeSelectCls, outlineBtnCls, primaryBtnCls } from './AdsShared';

type Format = 'image' | 'video';

const SIZES = [
  { value: '1:1', label: 'Square 1:1 (1080×1080)' },
  { value: '4:5', label: 'Portrait 4:5 (1080×1350)' },
  { value: '9:16', label: 'Story 9:16 (1080×1920)' },
];

interface Draft {
  id: string;
  angle: string;
  name: string;
  type: AdType;
  format: Format;
  size: string;
  creative: AdCreative;
}

interface Brief {
  business: string;
  website: string;
  audience: string;
  type: AdType;
  format: Format;
  size: string;
  count: number;
}

const ctaFor = (type: AdType, fallback: string) =>
  type === 'click_to_whatsapp' || type === 'whatsapp_status' || type === 'website_to_whatsapp' ? 'Send WhatsApp message' : fallback;

/** Deterministic copy templates — no external AI calls. */
function buildDrafts(b: Brief): Draft[] {
  const biz = b.business.trim();
  const who = b.audience.trim() || 'people like you';
  const site = b.website.trim();
  const wa = b.type !== 'website' && b.type !== 'lead_form';
  const action = wa ? 'Tap to chat with us on WhatsApp' : b.type === 'lead_form' ? 'Fill a quick form and we will call you back' : 'Visit our website';

  const templates: { angle: string; build: () => Omit<AdCreative, 'image_url' | 'website_url'> }[] = [
    {
      angle: 'Offer',
      build: () => ({
        headline: `Exclusive offer from ${biz}`,
        primary_text: `🎉 Special deal for ${who}! Get the best of ${biz} at a price you'll love — this week only. ${action} and claim yours before it's gone.`,
        cta: ctaFor(b.type, b.type === 'lead_form' ? 'Get quote' : 'Shop now'),
        welcome_message: wa ? `Hi ${biz}! I saw your ad and want to know about the offer.` : '',
      }),
    },
    {
      angle: 'Problem → Solution',
      build: () => ({
        headline: `${biz} makes it easy`,
        primary_text: `Tired of wasting time searching for the right option? ${biz} helps ${who} get exactly what they need — quickly and without the hassle. ${action}; we usually reply in minutes.`,
        cta: ctaFor(b.type, b.type === 'lead_form' ? 'Sign up' : 'Learn more'),
        welcome_message: wa ? `Hi! I'd like help choosing the right option from ${biz}.` : '',
      }),
    },
    {
      angle: 'Social proof',
      build: () => ({
        headline: `Loved by ${who}`,
        primary_text: `⭐⭐⭐⭐⭐ "Fast, friendly and exactly what I needed." Join the customers who trust ${biz} every day. ${action} and see why they keep coming back.`,
        cta: ctaFor(b.type, b.type === 'lead_form' ? 'Book now' : 'Learn more'),
        welcome_message: wa ? `Hi ${biz}, I'd like to get started.` : '',
      }),
    },
  ];

  return templates.slice(0, b.count).map((t, i) => ({
    id: `draft-${i}`,
    angle: t.angle,
    name: `${biz} – ${t.angle}`,
    type: b.type,
    format: b.format,
    size: b.size,
    creative: { ...t.build(), image_url: '', website_url: site },
  }));
}

const InlineInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
  type?: string;
}> = ({ value, onChange, placeholder, label, type = 'text' }) => (
  <input
    aria-label={label}
    type={type}
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    className="mx-1 my-0.5 inline-block w-full max-w-full sm:w-56 rounded-lg border border-dashed border-teal-400 bg-spruce-light/60 px-2 py-1 align-middle text-sm font-semibold text-spruce-dark placeholder:font-medium placeholder:text-teal-700/50 focus:border-solid focus:border-teal-600 focus:outline-none dark:bg-teal-950/40 dark:text-teal-200 dark:border-teal-700"
  />
);

export const AdsAgentView: React.FC = () => {
  const { setup } = useAdsSetup();
  const { hasPermission } = useAuthStore();
  const canWrite = hasPermission('campaigns', 'write');

  const [business, setBusiness] = useState('');
  const [website, setWebsite] = useState('');
  const [audience, setAudience] = useState('');
  const [type, setType] = useState<AdType>('click_to_whatsapp');
  const [format, setFormat] = useState<Format>('image');
  const [size, setSize] = useState('1:1');
  const [count, setCount] = useState(3);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [generating, setGenerating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  const generate = () => {
    if (!business.trim()) {
      toast.error('Add your business name to generate ads');
      return;
    }
    setGenerating(true);
    setSavedIds(new Set());
    // Short pause so the change is noticeable; generation itself is instant and local.
    setTimeout(() => {
      setDrafts(buildDrafts({ business, website, audience, type, format, size, count }));
      setGenerating(false);
    }, 350);
  };

  const save = async (d: Draft) => {
    setSavingId(d.id);
    try {
      await adsApi.createCampaign({ name: d.name, type: d.type, daily_budget: 500, creative: d.creative });
      setSavedIds((s) => new Set(s).add(d.id));
      toast.success(`Saved "${d.name}" as a draft ad`);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save the draft'));
    } finally {
      setSavingId(null);
    }
  };

  return (
    <AdsPage title="Ads Agent" subtitle="Describe your business and get ready-to-run ad drafts" icon={Sparkles} setup={setup}>
      <section className={cn(cardCls, 'overflow-hidden')}>
        <div className="flex items-center gap-2 border-b border-gray-100 bg-gradient-to-r from-spruce-light to-white px-5 py-3 dark:border-white/[0.06] dark:from-teal-950/40 dark:to-transparent">
          <Wand2 className="h-4 w-4 text-spruce-dark dark:text-teal-300" />
          <h2 className="text-sm font-bold">Tell the agent about your ad</h2>
          <span className="ml-auto rounded bg-purple-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-purple-800 dark:bg-purple-900/50 dark:text-purple-300">
            AI
          </span>
        </div>

        <div className="p-5 space-y-5">
          <p className="text-sm sm:text-base leading-loose text-gray-700 dark:text-gray-200">
            Create a high-converting ad for
            <InlineInput label="Business name" value={business} onChange={setBusiness} placeholder="business name" />. This is my website URL
            <InlineInput label="Website URL" type="url" value={website} onChange={setWebsite} placeholder="website URL" />. My target audience are
            <InlineInput label="Target audience" value={audience} onChange={setAudience} placeholder="target audience" />.
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <label htmlFor="agent-type" className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                Ad type
              </label>
              <select id="agent-type" className={nativeSelectCls} value={type} onChange={(e) => setType(e.target.value as AdType)}>
                {AD_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Format</span>
              <div className="grid h-9 grid-cols-2 rounded-lg border border-gray-200 bg-gray-50 p-0.5 dark:bg-white/[0.03] dark:border-white/10" role="radiogroup" aria-label="Format">
                {(
                  [
                    { v: 'image', label: 'Image', icon: ImageIcon },
                    { v: 'video', label: 'Video', icon: Film },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.v}
                    type="button"
                    role="radio"
                    aria-checked={format === f.v}
                    onClick={() => setFormat(f.v)}
                    className={cn(
                      'flex items-center justify-center gap-1.5 rounded-md text-xs font-semibold transition-colors',
                      format === f.v ? 'bg-white text-spruce-dark shadow-sm dark:bg-white/10 dark:text-teal-200' : 'text-gray-500 hover:text-gray-800 dark:text-gray-400'
                    )}
                  >
                    <f.icon className="h-3.5 w-3.5" /> {f.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="agent-size" className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                Size
              </label>
              <select id="agent-size" className={nativeSelectCls} value={size} onChange={(e) => setSize(e.target.value)}>
                {SIZES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="agent-count" className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                Number of ads
              </label>
              <select id="agent-count" className={nativeSelectCls} value={count} onChange={(e) => setCount(Number(e.target.value))}>
                {[1, 2, 3].map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 1 ? 'ad' : 'ads'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
              <Info className="h-3.5 w-3.5 shrink-0" /> Drafts from templates — AI generation coming soon.
            </p>
            <div className="flex gap-2">
              {drafts.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className={outlineBtnCls}
                  onClick={() => {
                    setDrafts([]);
                    setSavedIds(new Set());
                  }}
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Clear
                </Button>
              )}
              <Button size="sm" className={cn(primaryBtnCls, 'flex-1 sm:flex-none')} onClick={generate} disabled={generating}>
                {generating ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
                Generate ads
              </Button>
            </div>
          </div>
        </div>
      </section>

      {drafts.length > 0 && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold">Your ad drafts</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {adTypeLabel(type)} · {format === 'video' ? 'Video' : 'Image'} · {size} — Drafts from templates, edit them any time in Ads Manager.
              </p>
            </div>
            {savedIds.size > 0 && (
              <Link to="/ads" className="text-xs font-semibold text-spruce-dark hover:underline dark:text-teal-300">
                View saved drafts in Ads Manager →
              </Link>
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {drafts.map((d) => {
              const saved = savedIds.has(d.id);
              return (
                <article key={d.id} className={cn(cardCls, 'flex flex-col p-4')}>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-800 dark:bg-purple-900/50 dark:text-purple-300">
                      {d.angle}
                    </span>
                    <span className="flex items-center gap-1 text-[10px] font-semibold text-gray-400">
                      {d.format === 'video' ? <Film className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />} {d.size}
                    </span>
                  </div>
                  <AdPreview type={d.type} creative={d.creative} pageName={setup?.page_name || business} className="max-w-[250px]" />
                  <div className="mt-4 space-y-1.5 text-xs">
                    <p className="font-semibold text-gray-900 dark:text-white">{d.creative.headline}</p>
                    <p className="text-gray-500 dark:text-gray-400 leading-relaxed">{d.creative.primary_text}</p>
                  </div>
                  <div className="mt-auto pt-4">
                    <Button
                      size="sm"
                      className={cn(primaryBtnCls, 'w-full', saved && 'bg-emerald-600 hover:bg-emerald-600')}
                      disabled={!canWrite || saved || savingId === d.id}
                      onClick={() => save(d)}
                    >
                      {saved ? (
                        <>
                          <Check className="h-3.5 w-3.5 mr-1.5" /> Saved as draft
                        </>
                      ) : savingId === d.id ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Saving…
                        </>
                      ) : (
                        <>
                          <Save className="h-3.5 w-3.5 mr-1.5" /> Save as draft ad
                        </>
                      )}
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </AdsPage>
  );
};

export default AdsAgentView;
