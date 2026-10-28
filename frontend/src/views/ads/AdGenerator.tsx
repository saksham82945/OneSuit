import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ArrowRight, Check, Film, Image as ImageIcon, Loader2, Minus, Paperclip, Plus, RotateCcw, Save, Sparkles, Target, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth';
import { cn } from '@/lib/utils';
import { AD_TYPES, adTypeLabel, adsApi, errorMessage, type AdType, type GeneratedAd, type MediaType } from './adsApi';
import { AdPreview, cardCls, outlineBtnCls, primaryBtnCls } from './AdsShared';
import { useAdsPage } from './AdsPageShell';

const SIZES = ['1:1', '3:4', '9:16', '16:9'];

const pillInputCls =
  'mx-1 my-0.5 inline-block w-full max-w-full sm:w-52 rounded-full border border-teal-300 bg-spruce-light/70 px-3 py-1 align-middle text-sm font-semibold text-spruce-dark placeholder:font-medium placeholder:text-teal-700/50 focus:border-spruce focus:outline-none focus:ring-1 focus:ring-spruce dark:bg-teal-950/40 dark:text-teal-200 dark:border-teal-700';

const toolSelectCls =
  'h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs font-medium text-gray-800 focus:outline-none focus:ring-1 focus:ring-spruce dark:bg-white/[0.04] dark:border-white/10 dark:text-gray-100';

interface Props {
  /** Show the "Ready-to-run ads in minutes" hero title. */
  hero?: boolean;
  pageName?: string;
  /** Called after a variant is saved as a draft campaign. */
  onSaved?: () => void;
  id?: string;
}

export const AdGenerator: React.FC<Props> = ({ hero, pageName, onSaved, id }) => {
  const { wallet, reloadWallet } = useAdsPage();
  const { hasPermission } = useAuthStore();
  const canWrite = hasPermission('campaigns', 'write');

  const [business, setBusiness] = useState('');
  const [website, setWebsite] = useState('');
  const [audience, setAudience] = useState('');
  const [adType, setAdType] = useState<AdType | 'auto'>('auto');
  const [media, setMedia] = useState<MediaType>('image');
  const [size, setSize] = useState('1:1');
  const [count, setCount] = useState(3);
  const [file, setFile] = useState<{ name: string; url: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [variants, setVariants] = useState<GeneratedAd[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  // Free the local preview URL when the file changes or the page closes.
  useEffect(() => () => (file ? URL.revokeObjectURL(file.url) : undefined), [file]);

  const freeLeft = wallet?.free_generations_left;

  const generate = async () => {
    const site = website.trim();
    if (!business.trim()) return setError('Add your business name to generate ads.');
    if (site && !/^https?:\/\/\S+\.\S+/i.test(site)) return setError('Website URL must start with http:// or https://');
    setError(null);
    setGenerating(true);
    try {
      const res = await adsApi.generateAds({
        business_name: business.trim(),
        website_url: site,
        audience: audience.trim(),
        ad_type: adType,
        media_type: media,
        size,
        count,
      });
      setVariants(res.variants);
      setSavedIds(new Set());
      reloadWallet();
    } catch (err) {
      setError(errorMessage(err, 'Could not generate ads'));
    } finally {
      setGenerating(false);
    }
  };

  const save = async (v: GeneratedAd) => {
    setSavingId(v.id);
    try {
      await adsApi.createCampaign({
        name: v.name,
        type: v.suggested_ad_type,
        daily_budget: 500,
        creative: {
          headline: v.headline,
          primary_text: v.primary_text,
          cta: v.cta,
          welcome_message: v.welcome_message,
          website_url: v.website_url,
          image_url: '',
        },
      });
      setSavedIds((s) => new Set(s).add(v.id));
      toast.success(`Saved "${v.name}" as a draft ad`);
      onSaved?.();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save the draft'));
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div id={id} className="space-y-4 scroll-mt-24">
      <section className={cn(cardCls, 'overflow-hidden')}>
        {hero && (
          <div className="px-5 pt-6 text-center sm:px-8">
            <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Ready-to-run ads in minutes</h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 sm:text-sm">Describe your product or add a link to generate ads with AI.</p>
          </div>
        )}
        <div className="p-5 sm:px-8">
          <div className="rounded-2xl border border-gray-200 bg-gray-50/60 p-4 dark:border-white/10 dark:bg-white/[0.02]">
            <p className="text-sm leading-loose text-gray-700 dark:text-gray-200 sm:text-base">
              Create a high-converting ad for
              <input aria-label="Business name" className={pillInputCls} value={business} onChange={(e) => setBusiness(e.target.value)} placeholder="business name" maxLength={100} />.
              This is my website URL
              <input aria-label="Website URL" type="url" className={pillInputCls} value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="website URL" />.
              My target audience are
              <input aria-label="Target audience" className={pillInputCls} value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="target audience" maxLength={200} />.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-200 pt-3 dark:border-white/10">
              <input
                ref={fileRef}
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setFile({ name: f.name, url: URL.createObjectURL(f) });
                  e.target.value = '';
                }}
              />
              {file ? (
                <span className="inline-flex h-8 max-w-[200px] items-center gap-1.5 rounded-lg border border-teal-200 bg-spruce-light px-2 text-xs font-medium text-spruce-dark dark:bg-teal-950/40 dark:border-teal-900 dark:text-teal-200">
                  <Paperclip className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{file.name}</span>
                  <button type="button" aria-label="Remove media" onClick={() => setFile(null)} className="shrink-0 hover:text-rose-600">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  title="Optional — skip to use a placeholder"
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-dashed border-gray-300 bg-white px-2.5 text-xs font-medium text-gray-600 hover:border-teal-400 hover:text-spruce-dark dark:bg-transparent dark:border-white/15 dark:text-gray-300"
                >
                  <Paperclip className="h-3.5 w-3.5" /> Media <span className="text-gray-400">(optional)</span>
                </button>
              )}

              <label className="inline-flex items-center gap-1.5 text-xs text-gray-500">
                <span className="sr-only sm:not-sr-only">Ad type</span>
                <select aria-label="Ad type" className={toolSelectCls} value={adType} onChange={(e) => setAdType(e.target.value as AdType | 'auto')}>
                  <option value="auto">Let AI decide</option>
                  {AD_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="inline-flex h-8 rounded-lg border border-gray-200 bg-white p-0.5 dark:bg-white/[0.04] dark:border-white/10" role="radiogroup" aria-label="Type">
                {(
                  [
                    { v: 'image', label: 'Image', icon: ImageIcon },
                    { v: 'video', label: 'Video', icon: Film },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.v}
                    type="button"
                    role="radio"
                    aria-checked={media === m.v}
                    onClick={() => setMedia(m.v)}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-md px-2 text-xs font-semibold transition-colors',
                      media === m.v ? 'bg-spruce-dark text-white' : 'text-gray-500 hover:text-gray-800 dark:text-gray-400'
                    )}
                  >
                    <m.icon className="h-3.5 w-3.5" /> {m.label}
                  </button>
                ))}
              </div>

              <select aria-label="Size" className={toolSelectCls} value={size} onChange={(e) => setSize(e.target.value)}>
                {SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>

              <div className="inline-flex h-8 items-center rounded-lg border border-gray-200 bg-white dark:bg-white/[0.04] dark:border-white/10" aria-label="Number of ads">
                <button type="button" aria-label="Fewer ads" className="px-2 text-gray-500 disabled:opacity-40" disabled={count <= 1} onClick={() => setCount((c) => Math.max(1, c - 1))}>
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="min-w-[3.5rem] text-center text-xs font-semibold tabular-nums">
                  {count} {count === 1 ? 'Ad' : 'Ads'}
                </span>
                <button type="button" aria-label="More ads" className="px-2 text-gray-500 disabled:opacity-40" disabled={count >= 5} onClick={() => setCount((c) => Math.min(5, c + 1))}>
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="ml-auto flex items-center gap-2">
                {freeLeft !== undefined && (
                  <span
                    className={cn(
                      'rounded-full px-2.5 py-1 text-[11px] font-semibold',
                      freeLeft > 0 ? 'bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200' : 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200'
                    )}
                  >
                    {freeLeft} free generation{freeLeft === 1 ? '' : 's'} left
                  </span>
                )}
                <Button
                  size="sm"
                  onClick={generate}
                  disabled={!canWrite || generating || freeLeft === 0}
                  className="h-9 rounded-xl bg-emerald-600 px-4 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
                >
                  {generating ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5 mr-1.5" />}
                  Generate Ad
                </Button>
              </div>
            </div>
          </div>
          {error && (
            <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:bg-rose-950/30 dark:border-rose-900/60 dark:text-rose-200">
              {error}
            </p>
          )}
        </div>
      </section>

      {variants.length > 0 && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold">Generated ads</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {media === 'video' ? 'Video' : 'Image'} · {size} — save the ones you like as drafts and edit them any time.
              </p>
            </div>
            <Button variant="outline" size="sm" className={outlineBtnCls} onClick={() => setVariants([])}>
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Clear
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {variants.map((v) => {
              const saved = savedIds.has(v.id);
              return (
                <article key={v.id} className={cn(cardCls, 'flex flex-col p-4')}>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-800 dark:bg-violet-900/50 dark:text-violet-200">
                      <Sparkles className="h-3 w-3" /> {v.angle}
                    </span>
                    <span className="text-[10px] font-semibold text-gray-500">{adTypeLabel(v.suggested_ad_type)}</span>
                  </div>
                  <AdPreview
                    type={v.suggested_ad_type}
                    creative={{ ...v, image_url: file && media === 'image' ? file.url : '' }}
                    pageName={pageName || business}
                    className="max-w-[250px]"
                  />
                  <div className="mt-4 space-y-1.5 text-xs">
                    <p className="font-semibold text-gray-900 dark:text-white">{v.headline}</p>
                    <p className="leading-relaxed text-gray-500 dark:text-gray-400">{v.primary_text}</p>
                    <p className="flex items-start gap-1.5 pt-1 text-[11px] text-gray-500 dark:text-gray-400">
                      <Target className="mt-0.5 h-3 w-3 shrink-0 text-spruce dark:text-teal-300" /> {v.suggested_audience}
                    </p>
                  </div>
                  <div className="mt-auto pt-4">
                    <Button
                      size="sm"
                      className={cn(primaryBtnCls, 'w-full', saved && 'bg-emerald-600 hover:bg-emerald-600')}
                      disabled={!canWrite || saved || savingId === v.id}
                      onClick={() => save(v)}
                    >
                      {saved ? (
                        <>
                          <Check className="h-3.5 w-3.5 mr-1.5" /> Saved as draft
                        </>
                      ) : savingId === v.id ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Saving…
                        </>
                      ) : (
                        <>
                          <Save className="h-3.5 w-3.5 mr-1.5" /> Save as draft
                        </>
                      )}
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
          {file && <p className="text-[11px] text-gray-400">Your media is used for these previews only — add a hosted image link when you edit the ad.</p>}
        </section>
      )}
    </div>
  );
};
