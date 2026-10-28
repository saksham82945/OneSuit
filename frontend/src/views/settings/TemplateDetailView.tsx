import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api, templatesService, accountsService } from '@/services/api';
import { readData, readList } from '@/services/response';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { FileText, Save, Send, Smartphone, Check } from 'lucide-react';
import { toast } from 'sonner';

type TemplateButton = Record<string, unknown> & { type?: string; text?: string };
type SampleValue = { component?: string; index?: number; value?: string; param_name?: string };

// Shape of GET /api/templates/{id} (handlers.TemplateResponse)
interface TemplateData {
  id: string;
  whatsapp_account?: string;
  meta_template_id?: string;
  name?: string;
  display_name?: string;
  language?: string;
  category?: string;
  status?: string;
  header_type?: string;
  header_content?: string;
  body_content?: string;
  footer_content?: string;
  buttons?: TemplateButton[];
  sample_values?: SampleValue[];
  /** Old mock shape (Meta-style components), kept as a fallback only. */
  components?: Array<{ type?: string; format?: string; text?: string }>;
}

interface WhatsAppAccount {
  id: string;
  name: string;
  is_default_outgoing?: boolean;
}

const LANGUAGES = [
  { value: 'en_US', label: 'English (US)' },
  { value: 'en_GB', label: 'English (UK)' },
  { value: 'es', label: 'Spanish' },
  { value: 'hi', label: 'Hindi' },
  { value: 'pt_BR', label: 'Portuguese (BR)' },
  { value: 'ar', label: 'Arabic' },
];

const MEDIA_HEADER_TYPES = ['IMAGE', 'VIDEO', 'DOCUMENT'];
const MEDIA_ACCEPT: Record<string, string> = {
  IMAGE: 'image/jpeg,image/png',
  VIDEO: 'video/mp4',
  DOCUMENT: 'application/pdf',
};

// Fallback preview values used when no sample value has been entered.
const PREVIEW_DEFAULTS: Record<string, string> = { 'body:1': 'John', 'body:2': '#1029', 'header:1': 'Order #9821' };

function errorMessage(err: unknown, fallback: string): string {
  const message = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  return typeof message === 'string' && message ? message : fallback;
}

// Variables in order of appearance, e.g. "Hi {{1}}, order {{2}}" -> ['1', '2'].
function extractVariables(text: string): string[] {
  return (text.match(/\{\{([^}]+)\}\}/g) || []).map((m) => m.replace(/\{\{|\}\}/g, '').trim());
}

export const TemplateDetailView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();

  const [template, setTemplate] = useState<TemplateData | null>(null);
  const [accounts, setAccounts] = useState<WhatsAppAccount[]>([]);
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  const [accountsError, setAccountsError] = useState(false);
  const [whatsappAccount, setWhatsappAccount] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('MARKETING');
  const [language, setLanguage] = useState('en_US');
  const [headerType, setHeaderType] = useState('TEXT');
  const [headerText, setHeaderText] = useState('');
  const [headerHandle, setHeaderHandle] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [bodyText, setBodyText] = useState('Hello {{1}}, thank you for contacting us!');
  const [footerText, setFooterText] = useState('Reply STOP to unsubscribe');
  const [buttonText, setButtonText] = useState('Visit Website');
  const [existingButtons, setExistingButtons] = useState<TemplateButton[]>([]);
  const [sampleValues, setSampleValues] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  const isAuthentication = category === 'AUTHENTICATION';
  const status = (template?.status || '').toUpperCase();
  const canPublish = !isNew && !!template && (status === 'DRAFT' || status === 'REJECTED' || !status);

  useEffect(() => {
    accountsService.list().then((res) => {
      const list = readList<WhatsAppAccount>(res, 'accounts');
      setAccounts(list);
      if (isNew) {
        const preferred = list.find((a) => a.is_default_outgoing) || list[0];
        setWhatsappAccount((current) => current || preferred?.name || '');
      }
    }).catch(() => {
      setAccounts([]);
      setAccountsError(true);
    }).finally(() => {
      setAccountsLoaded(true);
    });
  }, [isNew]);

  useEffect(() => {
    if (!isNew && id) {
      templatesService.get(id).then((res) => {
        const data = readData<TemplateData>(res);
        if (!data) return;
        const component = (type: string) => data.components?.find((c) => c.type === type);
        setTemplate(data);
        setWhatsappAccount(data.whatsapp_account || '');
        setName(data.name || '');
        setCategory((data.category || 'MARKETING').toUpperCase());
        setLanguage(data.language || 'en_US');

        const type = (data.header_type || component('HEADER')?.format || '').toUpperCase();
        const content = data.header_content ?? component('HEADER')?.text ?? '';
        if (MEDIA_HEADER_TYPES.includes(type)) {
          setHeaderType(type);
          setHeaderHandle(content);
          setHeaderText('');
        } else {
          setHeaderType('TEXT');
          setHeaderHandle('');
          setHeaderText(type === 'TEXT' ? content : '');
        }
        setBodyText(data.body_content ?? component('BODY')?.text ?? '');
        setFooterText(data.footer_content ?? component('FOOTER')?.text ?? '');

        const buttons = Array.isArray(data.buttons) ? data.buttons : [];
        setExistingButtons(buttons);
        const quickReply = buttons.find((b) => String(b.type || '').toUpperCase() === 'QUICK_REPLY');
        setButtonText(typeof quickReply?.text === 'string' ? quickReply.text : '');

        const samples: Record<string, string> = {};
        (Array.isArray(data.sample_values) ? data.sample_values : []).forEach((sv) => {
          if (sv && typeof sv.value === 'string' && sv.component && typeof sv.index === 'number') {
            samples[`${sv.component}:${sv.index}`] = sv.value;
          }
        });
        setSampleValues(samples);
      }).catch(() => {
        toast.error('Failed to load template');
      });
    }
  }, [id, isNew]);

  const headerVariables = headerType === 'TEXT' ? extractVariables(headerText) : [];
  const bodyVariables = extractVariables(bodyText);
  const variables = isAuthentication ? [] : [
    ...headerVariables.map((v, i) => ({ component: 'header', name: v, index: i + 1 })),
    ...bodyVariables.map((v, i) => ({ component: 'body', name: v, index: i + 1 })),
  ];

  const buildButtons = (): TemplateButton[] => {
    if (isAuthentication) {
      const otp = existingButtons.find((b) => String(b.type || '').toUpperCase() === 'OTP');
      return [otp || { type: 'OTP', text: 'Copy code', otp_type: 'COPY_CODE' }];
    }
    // Keep buttons this form doesn't edit (URL, phone, ...) and only manage the quick reply.
    const buttons = existingButtons.filter((b) => String(b.type || '').toUpperCase() !== 'OTP');
    const idx = buttons.findIndex((b) => String(b.type || '').toUpperCase() === 'QUICK_REPLY');
    const text = buttonText.trim();
    if (text) {
      if (idx >= 0) buttons[idx] = { ...buttons[idx], text };
      else buttons.push({ type: 'QUICK_REPLY', text });
    } else if (idx >= 0) {
      buttons.splice(idx, 1);
    }
    return buttons;
  };

  // Body for POST/PUT /api/templates (handlers.TemplateRequest)
  const buildPayload = () => {
    const hasMediaHeader = MEDIA_HEADER_TYPES.includes(headerType);
    const hasTextHeader = headerType === 'TEXT' && !!headerText.trim();
    return {
      whatsapp_account: whatsappAccount,
      name: name.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
      language,
      category,
      header_type: isAuthentication ? 'NONE' : hasMediaHeader ? headerType : hasTextHeader ? 'TEXT' : 'NONE',
      header_content: isAuthentication ? '' : hasMediaHeader ? headerHandle : hasTextHeader ? headerText : '',
      // Meta uses its own fixed text for authentication templates.
      body_content: isAuthentication ? '{{1}} is your verification code.' : bodyText,
      footer_content: isAuthentication ? '' : footerText,
      buttons: buildButtons(),
      sample_values: variables
        .map((v) => ({
          component: v.component,
          index: v.index,
          value: (sampleValues[`${v.component}:${v.index}`] || '').trim(),
          ...(/^\d+$/.test(v.name) ? {} : { param_name: v.name }),
        }))
        .filter((sv) => sv.value),
    };
  };

  const validate = (forMeta: boolean): boolean => {
    if (!whatsappAccount) {
      toast.error('Select a WhatsApp account');
      return false;
    }
    if (!name.trim()) {
      toast.error('Template name is required');
      return false;
    }
    if (!isAuthentication && !bodyText.trim()) {
      toast.error('Body text is required');
      return false;
    }
    if (!isAuthentication && MEDIA_HEADER_TYPES.includes(headerType) && !headerHandle) {
      toast.error(`Upload a sample ${headerType.toLowerCase()} for the header first`);
      return false;
    }
    if (forMeta && variables.some((v) => !(sampleValues[`${v.component}:${v.index}`] || '').trim())) {
      toast.error('Meta requires a sample value for every variable');
      return false;
    }
    return true;
  };

  // POST /templates only saves a local DRAFT; /templates/{id}/publish submits it to Meta.
  const publish = async (templateId: string) => {
    const res = await api.post(`/templates/${templateId}/publish`);
    toast.success(readData<{ message?: string }>(res)?.message || 'Template submitted to Meta for approval');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isNew && !template) {
      toast.error('Template has not loaded yet');
      return;
    }
    if (!validate(isNew)) return;

    setIsSubmitting(true);
    try {
      const payload = buildPayload();
      if (isNew) {
        const created = readData<TemplateData>(await templatesService.create(payload));
        try {
          await publish(created.id);
          navigate('/templates');
        } catch (err) {
          toast.error(`Template saved as draft, but submitting to Meta failed: ${errorMessage(err, 'unknown error')}`);
          navigate(`/templates/${created.id}`);
        }
      } else {
        await templatesService.update(id!, payload);
        toast.success('Template updated successfully');
        navigate('/templates');
      }
    } catch (err) {
      toast.error(errorMessage(err, isNew ? 'Failed to create template' : 'Failed to update template'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Save the current edits, then submit the template to Meta.
  const handlePublish = async () => {
    if (!template || !validate(true)) return;
    setIsPublishing(true);
    try {
      await templatesService.update(template.id, buildPayload());
      await publish(template.id);
      navigate('/templates');
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to submit template to Meta'));
    } finally {
      setIsPublishing(false);
    }
  };

  const handleHeaderFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!whatsappAccount) {
      toast.error('Select a WhatsApp account first');
      return;
    }
    setIsUploading(true);
    try {
      const res = await templatesService.uploadMedia(whatsappAccount, file);
      const handle = readData<{ handle?: string }>(res)?.handle;
      if (!handle) throw new Error('No media handle returned');
      setHeaderHandle(handle);
      toast.success('Sample media uploaded');
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to upload sample media'));
    } finally {
      setIsUploading(false);
    }
  };

  const fillVariables = (text: string, component: string) => {
    let index = 0;
    return text.replace(/\{\{([^}]+)\}\}/g, (match) => {
      index += 1;
      const key = `${component}:${index}`;
      return sampleValues[key] || PREVIEW_DEFAULTS[key] || match;
    });
  };

  const previewBody = fillVariables(bodyText, 'body');
  const noAccounts = accountsLoaded && !accountsError && accounts.length === 0;
  const accountOptions = whatsappAccount && !accounts.some((a) => a.name === whatsappAccount)
    ? [...accounts, { id: whatsappAccount, name: whatsappAccount }]
    : accounts;
  const languageOptions = LANGUAGES.some((l) => l.value === language)
    ? LANGUAGES
    : [...LANGUAGES, { value: language, label: language }];

  return (
    <div className="flex flex-col h-full bg-[#0a0a0b] light:bg-gray-50 overflow-hidden">
      <PageHeader
        title={isNew ? 'Create Message Template' : `Template: ${name}`}
        subtitle={
          !isNew && template
            ? `Status: ${status || 'UNKNOWN'} · ${template.whatsapp_account || 'No account'}`
            : 'Design Meta-approved WhatsApp HSM broadcast templates'
        }
        icon={FileText}
        backLink="/templates"
        actions={
          <div className="flex items-center gap-2">
            {canPublish && (
              <Button
                type="button"
                variant="outline"
                onClick={handlePublish}
                disabled={isPublishing || isSubmitting}
              >
                <Send className="h-4 w-4 mr-2" />
                {isPublishing ? 'Submitting to Meta...' : 'Submit to Meta'}
              </Button>
            )}
            <Button
              type="submit"
              form="template-form"
              className="bg-emerald-600 hover:bg-emerald-500 text-white"
              disabled={isSubmitting || isPublishing || isUploading || (isNew && noAccounts) || (!isNew && !template)}
            >
              {isNew ? <Send className="h-4 w-4 mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              {isSubmitting ? (isNew ? 'Submitting to Meta...' : 'Saving...') : (isNew ? 'Submit to Meta' : 'Save Template')}
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-6xl mx-auto">
          {/* Left Form: 7 cols */}
          <div className="lg:col-span-7">
            <Card className="card-depth border-white/[0.08] bg-[#141415] text-white light:border-gray-200 light:bg-white light:text-gray-900">
              <CardHeader>
                <CardTitle className="text-base font-semibold">Template Configuration</CardTitle>
                <CardDescription className="text-xs text-white/50 light:text-gray-500">
                  Follow WhatsApp business guidelines to ensure quick Meta verification.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form id="template-form" onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid gap-1.5">
                    <Label className="text-xs">WhatsApp Account *</Label>
                    <Select value={whatsappAccount} onValueChange={setWhatsappAccount} disabled={!isNew}>
                      <SelectTrigger>
                        <SelectValue placeholder={noAccounts ? 'No WhatsApp accounts' : accountsError ? 'Could not load accounts' : 'Select an account'} />
                      </SelectTrigger>
                      <SelectContent>
                        {accountOptions.map((acc) => (
                          <SelectItem key={acc.id} value={acc.name}>{acc.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {isNew && noAccounts && (
                      <p className="text-[10px] text-amber-400">
                        Templates belong to a WhatsApp account.{' '}
                        <Link to="/settings/accounts" className="underline">Add an account</Link> first.
                      </p>
                    )}
                  </div>

                  <div className="grid gap-1.5">
                    <Label htmlFor="tName" className="text-xs">Template Name (alphanumeric & underscore only) *</Label>
                    <Input
                      id="tName"
                      placeholder="e.g. order_shipped_notification"
                      value={name}
                      onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                      disabled={!isNew}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-1.5">
                      <Label className="text-xs">Category</Label>
                      <Select value={category} onValueChange={setCategory}>
                        <SelectTrigger>
                          <SelectValue placeholder="Category" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MARKETING">Marketing (Offers, Announcements)</SelectItem>
                          <SelectItem value="UTILITY">Utility (Account, Order Updates)</SelectItem>
                          <SelectItem value="AUTHENTICATION">Authentication (OTPs, Security)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid gap-1.5">
                      <Label className="text-xs">Language</Label>
                      <Select value={language} onValueChange={setLanguage}>
                        <SelectTrigger>
                          <SelectValue placeholder="Language" />
                        </SelectTrigger>
                        <SelectContent>
                          {languageOptions.map((lang) => (
                            <SelectItem key={lang.value} value={lang.value}>{lang.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {isAuthentication && (
                    <p className="text-[10px] text-amber-400">
                      Authentication templates use Meta's fixed one-time-code text with a "Copy code" button; the header, body, footer and button below are not sent.
                    </p>
                  )}

                  <div className="space-y-1.5 pt-2 border-t border-white/[0.06] light:border-gray-200">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Header (Optional)</Label>
                      <div className="flex items-center gap-2">
                        {['TEXT', ...MEDIA_HEADER_TYPES].map((type) => (
                          <button
                            key={type}
                            type="button"
                            onClick={() => setHeaderType(type)}
                            className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                              headerType === type
                                ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                                : 'border-white/10 text-white/50 hover:bg-white/[0.04] light:border-gray-200 light:text-gray-500 light:hover:bg-gray-100'
                            }`}
                          >
                            {type}
                          </button>
                        ))}
                      </div>
                    </div>
                    {headerType === 'TEXT' ? (
                      <Input
                        placeholder="e.g. Order Update #{{1}}"
                        value={headerText}
                        onChange={(e) => setHeaderText(e.target.value)}
                      />
                    ) : (
                      <div className="space-y-1">
                        <Input
                          type="file"
                          accept={MEDIA_ACCEPT[headerType]}
                          onChange={handleHeaderFile}
                          disabled={isUploading || !whatsappAccount}
                        />
                        <p className="text-[10px] text-white/40 light:text-gray-400">
                          {isUploading
                            ? 'Uploading sample to Meta...'
                            : headerHandle
                              ? `Sample ${headerType.toLowerCase()} uploaded. Choose a file to replace it.`
                              : `Meta needs a sample ${headerType.toLowerCase()} to review this template.`}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="grid gap-1.5 pt-2 border-t border-white/[0.06] light:border-gray-200">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="bodyText" className="text-xs">Body Text *</Label>
                      <span className="text-[10px] text-white/40 light:text-gray-400">Use {`{{1}}`}, {`{{2}}`} for dynamic parameters</span>
                    </div>
                    <Textarea
                      id="bodyText"
                      rows={4}
                      value={bodyText}
                      onChange={(e) => setBodyText(e.target.value)}
                      placeholder="Hi {{1}}, your order #{{2}} is on its way!"
                      required={!isAuthentication}
                    />
                  </div>

                  {variables.length > 0 && (
                    <div className="grid gap-1.5">
                      <Label className="text-xs">Sample Values (required by Meta for review)</Label>
                      <div className="grid grid-cols-2 gap-2">
                        {variables.map((v) => {
                          const key = `${v.component}:${v.index}`;
                          return (
                            <Input
                              key={key}
                              placeholder={`${v.component === 'header' ? 'Header ' : ''}{{${v.name}}}`}
                              value={sampleValues[key] || ''}
                              onChange={(e) => setSampleValues((prev) => ({ ...prev, [key]: e.target.value }))}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="grid gap-1.5 pt-2 border-t border-white/[0.06] light:border-gray-200">
                    <Label htmlFor="footerText" className="text-xs">Footer Text (Optional)</Label>
                    <Input
                      id="footerText"
                      placeholder="e.g. Reply STOP to unsubscribe"
                      value={footerText}
                      onChange={(e) => setFooterText(e.target.value)}
                    />
                  </div>

                  <div className="grid gap-1.5 pt-2 border-t border-white/[0.06] light:border-gray-200">
                    <Label htmlFor="btnText" className="text-xs">Quick Reply Button (Optional)</Label>
                    <Input
                      id="btnText"
                      placeholder="e.g. Confirm Order"
                      value={buttonText}
                      onChange={(e) => setButtonText(e.target.value)}
                    />
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* Right Preview: 5 cols */}
          <div className="lg:col-span-5">
            <div className="sticky top-6">
              <div className="flex items-center gap-2 mb-3 text-xs font-medium text-white/70 light:text-gray-600">
                <Smartphone className="h-4 w-4 text-emerald-400" />
                <span>Live WhatsApp Mockup</span>
              </div>

              {/* Phone Frame */}
              <div className="rounded-3xl border-4 border-white/[0.12] bg-[#0c1317] p-4 shadow-2xl relative overflow-hidden light:border-gray-200">
                {/* Chat Header Mock */}
                <div className="flex items-center gap-2.5 pb-3 border-b border-white/[0.08] mb-4 light:border-gray-200">
                  <div className="h-8 w-8 rounded-full bg-emerald-600 flex items-center justify-center text-white text-xs font-bold">
                    O
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-white light:text-gray-900">onesuit Verified</p>
                    <p className="text-[10px] text-emerald-400 flex items-center gap-1">
                      <Check className="h-2.5 w-2.5" /> Official Business Account
                    </p>
                  </div>
                </div>

                {/* WhatsApp Chat Bubble */}
                <div className="rounded-xl bg-[#202c33] border border-[#202c33] p-3 text-white max-w-[90%] shadow-md space-y-2 light:text-gray-900">
                  {headerType === 'TEXT' && headerText && (
                    <div className="font-semibold text-xs text-white pb-1 border-b border-white/[0.08] light:text-gray-900 light:border-gray-200">
                      {fillVariables(headerText, 'header')}
                    </div>
                  )}
                  {MEDIA_HEADER_TYPES.includes(headerType) && (
                    <div className="text-[10px] text-white/50 pb-1 border-b border-white/[0.08] light:text-gray-500 light:border-gray-200">
                      [{headerType}]
                    </div>
                  )}

                  <div className="text-xs leading-relaxed text-white/90 whitespace-pre-wrap light:text-gray-800">
                    {previewBody}
                  </div>

                  {footerText && (
                    <div className="text-[10px] text-white/50 pt-1 light:text-gray-500">
                      {footerText}
                    </div>
                  )}

                  <div className="text-[9px] text-white/40 text-right light:text-gray-400">
                    12:00 PM
                  </div>
                </div>

                {/* Quick Reply Button Mock */}
                {buttonText && (
                  <div className="mt-2 max-w-[90%] rounded-xl bg-[#202c33] border border-[#202c33] py-2 text-center text-xs font-medium text-[#53bdeb] hover:bg-[#202c33]/80 cursor-pointer shadow-sm">
                    {buttonText}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
export default TemplateDetailView;
