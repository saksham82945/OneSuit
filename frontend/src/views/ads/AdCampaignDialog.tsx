import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, Check, FileText, Globe, Loader2, MessageCircle, CircleDot, MousePointerClick } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  AD_TYPES,
  CTA_OPTIONS,
  adsApi,
  errorMessage,
  toDateInput,
  type AdCampaign,
  type AdCampaignInput,
  type AdCreative,
  type AdType,
  type Audience,
  type LeadForm,
} from './adsApi';
import { AdPreview, Field, inputCls, nativeSelectCls, outlineBtnCls, primaryBtnCls, textareaCls } from './AdsShared';

const TYPE_ICONS: Record<AdType, React.ElementType> = {
  click_to_whatsapp: MessageCircle,
  whatsapp_status: CircleDot,
  website_to_whatsapp: MousePointerClick,
  website: Globe,
  lead_form: FileText,
};

const emptyCreative = (): AdCreative => ({
  headline: '',
  primary_text: '',
  image_url: '',
  cta: '',
  welcome_message: '',
  website_url: '',
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Campaign to edit; null creates a new one. */
  campaign: AdCampaign | null;
  /** Pre-selected type for new ads (e.g. the active tab). */
  defaultType?: AdType;
  currency: string;
  pageName?: string;
  onSaved: () => void;
}

export const AdCampaignDialog: React.FC<Props> = ({ open, onOpenChange, campaign, defaultType, currency, pageName, onSaved }) => {
  const isEdit = Boolean(campaign);
  const [step, setStep] = useState<1 | 2>(1);
  const [type, setType] = useState<AdType>('click_to_whatsapp');
  const [name, setName] = useState('');
  const [budget, setBudget] = useState('500');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [audienceId, setAudienceId] = useState('');
  const [formId, setFormId] = useState('');
  const [creative, setCreative] = useState<AdCreative>(emptyCreative());
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [forms, setForms] = useState<LeadForm[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Reset whenever the dialog opens.
  useEffect(() => {
    if (!open) return;
    setFormError(null);
    if (campaign) {
      setStep(2);
      setType(campaign.type);
      setName(campaign.name);
      setBudget(String(campaign.daily_budget ?? ''));
      setStartDate(toDateInput(campaign.start_date));
      setEndDate(toDateInput(campaign.end_date));
      setAudienceId(campaign.audience_id || '');
      setFormId(campaign.form_id || '');
      setCreative({ ...emptyCreative(), ...(campaign.creative || {}) });
    } else {
      setStep(1);
      setType(defaultType || 'click_to_whatsapp');
      setName('');
      setBudget('500');
      setStartDate('');
      setEndDate('');
      setAudienceId('');
      setFormId('');
      setCreative(emptyCreative());
    }
    Promise.all([adsApi.listAudiences(), adsApi.listForms()])
      .then(([a, f]) => {
        setAudiences(a);
        setForms(f);
      })
      .catch((err) => toast.error(errorMessage(err, 'Failed to load audiences and forms')));
  }, [open, campaign, defaultType]);

  const setC = (key: keyof AdCreative, value: string) => setCreative((c) => ({ ...c, [key]: value }));
  const needsWebsite = type === 'website' || type === 'website_to_whatsapp';
  const needsWelcome = type === 'click_to_whatsapp' || type === 'whatsapp_status' || type === 'website_to_whatsapp';

  const submit = async () => {
    const budgetNum = Number(budget);
    if (!name.trim()) return setFormError('Give your ad a name.');
    if (!Number.isFinite(budgetNum) || budgetNum < 0) return setFormError('Daily budget must be a positive number.');
    if (startDate && endDate && endDate < startDate) return setFormError('End date must be after the start date.');
    setFormError(null);
    setSaving(true);
    const body: AdCampaignInput = {
      name: name.trim(),
      type,
      daily_budget: budgetNum,
      start_date: startDate || '',
      end_date: endDate || '',
      audience_id: audienceId || '',
      form_id: type === 'lead_form' ? formId || '' : '',
      creative: {
        ...creative,
        website_url: needsWebsite ? creative.website_url.trim() : '',
        welcome_message: needsWelcome ? creative.welcome_message : '',
      },
    };
    try {
      if (campaign) {
        await adsApi.updateCampaign(campaign.id, body);
        toast.success('Ad updated');
      } else {
        await adsApi.createCampaign(body);
        toast.success('Ad saved as draft');
      }
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setFormError(errorMessage(err, 'Could not save the ad'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-4xl max-h-[92vh] overflow-y-auto p-0 gap-0 rounded-2xl">
        <DialogHeader className="px-5 sm:px-6 pt-5 pb-4 border-b border-gray-100 dark:border-white/[0.06] text-left">
          <DialogTitle className="text-base">{isEdit ? 'Edit ad' : 'Create ad'}</DialogTitle>
          <DialogDescription className="text-xs">
            {step === 1 ? 'Step 1 of 2 · Choose where people land after they tap your ad' : `Step 2 of 2 · ${AD_TYPES.find((t) => t.value === type)?.label} ad details`}
          </DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 sm:p-6">
            {AD_TYPES.map((t) => {
              const Icon = TYPE_ICONS[t.value];
              const active = type === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setType(t.value)}
                  className={cn(
                    'flex items-start gap-3 rounded-xl border p-4 text-left transition-all',
                    active
                      ? 'border-teal-600 bg-spruce-light ring-1 ring-teal-600 dark:bg-teal-950/40'
                      : 'border-gray-200 hover:border-teal-300 hover:bg-gray-50 dark:border-white/10 dark:hover:bg-white/[0.04]'
                  )}
                >
                  <span
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                      active ? 'bg-spruce-dark text-white' : 'bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{t.label}</span>
                      {active && <Check className="h-4 w-4 text-teal-700 dark:text-teal-300" />}
                    </span>
                    <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">{t.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="space-y-5 min-w-0">
              <div className="space-y-3">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Basics</h4>
                <Field label="Ad name" htmlFor="ad-name" required>
                  <Input id="ad-name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Diwali sale – CTWA" />
                </Field>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Field label={`Daily budget (${currency})`} htmlFor="ad-budget" required>
                    <Input id="ad-budget" type="number" min={0} step="1" className={inputCls} value={budget} onChange={(e) => setBudget(e.target.value)} />
                  </Field>
                  <Field label="Start date" htmlFor="ad-start">
                    <Input id="ad-start" type="date" className={inputCls} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  </Field>
                  <Field label="End date" htmlFor="ad-end">
                    <Input id="ad-end" type="date" className={inputCls} value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} />
                  </Field>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field
                    label="Audience"
                    htmlFor="ad-audience"
                    hint={audiences.length === 0 ? undefined : 'Leave empty to let Meta find people for you.'}
                  >
                    <select id="ad-audience" className={nativeSelectCls} value={audienceId} onChange={(e) => setAudienceId(e.target.value)}>
                      <option value="">Automatic (Advantage+)</option>
                      {audiences.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} · {a.size} people
                        </option>
                      ))}
                    </select>
                    {audiences.length === 0 && (
                      <p className="text-[11px] text-gray-400">
                        No saved audiences.{' '}
                        <Link to="/ads/audiences" className="font-semibold text-spruce-dark hover:underline dark:text-teal-300">
                          Create one
                        </Link>
                      </p>
                    )}
                  </Field>
                  {type === 'lead_form' && (
                    <Field label="Lead form" htmlFor="ad-form" hint={forms.length ? 'Needed before this ad can launch.' : undefined}>
                      <select id="ad-form" className={nativeSelectCls} value={formId} onChange={(e) => setFormId(e.target.value)}>
                        <option value="">Select a form…</option>
                        {forms.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                            {f.status === 'draft' ? ' (draft)' : ''}
                          </option>
                        ))}
                      </select>
                      {forms.length === 0 && (
                        <p className="text-[11px] text-gray-400">
                          No forms yet.{' '}
                          <Link to="/ads/forms" className="font-semibold text-spruce-dark hover:underline dark:text-teal-300">
                            Build a form
                          </Link>
                        </p>
                      )}
                    </Field>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Creative</h4>
                <Field label="Primary text" htmlFor="ad-primary">
                  <Textarea
                    id="ad-primary"
                    rows={3}
                    className={textareaCls}
                    value={creative.primary_text}
                    onChange={(e) => setC('primary_text', e.target.value)}
                    placeholder="Flat 30% off on all orders this week. Tap to chat with us on WhatsApp!"
                  />
                </Field>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Headline" htmlFor="ad-headline">
                    <Input id="ad-headline" className={inputCls} value={creative.headline} onChange={(e) => setC('headline', e.target.value)} placeholder="Chat with us for offers" />
                  </Field>
                  <Field label="Call to action" htmlFor="ad-cta">
                    <select id="ad-cta" className={nativeSelectCls} value={creative.cta} onChange={(e) => setC('cta', e.target.value)}>
                      <option value="">Default for this ad type</option>
                      {CTA_OPTIONS.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label="Image URL" htmlFor="ad-image" hint="Use a 1080×1080 image for best results.">
                  <Input id="ad-image" className={inputCls} value={creative.image_url} onChange={(e) => setC('image_url', e.target.value)} placeholder="https://…/banner.jpg" />
                </Field>
                {needsWebsite && (
                  <Field label="Website URL" htmlFor="ad-website">
                    <Input id="ad-website" className={inputCls} value={creative.website_url} onChange={(e) => setC('website_url', e.target.value)} placeholder="https://example.com" />
                  </Field>
                )}
                {needsWelcome && (
                  <Field label="WhatsApp welcome message" htmlFor="ad-welcome" hint="Pre-filled message the customer sends when the chat opens.">
                    <Input
                      id="ad-welcome"
                      className={inputCls}
                      value={creative.welcome_message}
                      onChange={(e) => setC('welcome_message', e.target.value)}
                      placeholder="Hi! I'd like to know more about the offer."
                    />
                  </Field>
                )}
              </div>
            </div>

            <div className="lg:sticky lg:top-0 self-start">
              <p className="mb-2 text-center text-[11px] font-bold uppercase tracking-wider text-gray-400">Live preview</p>
              <AdPreview type={type} creative={creative} pageName={pageName} />
            </div>
          </div>
        )}

        {formError && (
          <div role="alert" className="mx-5 sm:mx-6 mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:bg-rose-950/30 dark:border-rose-900/60 dark:text-rose-200">
            {formError}
          </div>
        )}

        <DialogFooter className="gap-2 px-5 sm:px-6 py-4 border-t border-gray-100 dark:border-white/[0.06]">
          {step === 2 && !isEdit ? (
            <Button variant="outline" size="sm" className={outlineBtnCls} onClick={() => setStep(1)} disabled={saving}>
              <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Back
            </Button>
          ) : (
            <Button variant="outline" size="sm" className={outlineBtnCls} onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
          )}
          {step === 1 ? (
            <Button size="sm" className={primaryBtnCls} onClick={() => setStep(2)}>
              Continue <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
            </Button>
          ) : (
            <Button size="sm" className={primaryBtnCls} onClick={submit} disabled={saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              {isEdit ? 'Save changes' : 'Save as draft'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
