import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { campaignsService, templatesService, contactsService } from '@/services/api';
import { readData, readList, readTotal } from '@/services/response';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Megaphone, Play, Pause, Plus, Users, CheckCircle2, Eye, Clock } from 'lucide-react';
import { toast } from 'sonner';

// Shape of GET /api/templates items (handlers.TemplateResponse) — only what this screen uses
interface TemplateOption {
  id: string;
  name: string;
  display_name?: string;
  language?: string;
  status?: string;
  whatsapp_account?: string;
  header_type?: string;
  header_content?: string;
  body_content?: string;
}

// Shape of GET /api/campaigns/{id} (handlers.CampaignResponse)
interface CampaignData {
  id: string;
  name: string;
  whatsapp_account?: string;
  template_id?: string;
  template_name?: string;
  status?: string; // draft, scheduled, queued, processing, paused, completed, cancelled, failed
  total_recipients?: number;
  sent_count?: number;
  delivered_count?: number;
  read_count?: number;
  failed_count?: number;
}

interface ContactItem {
  phone_number?: string;
  name?: string;
  profile_name?: string;
}

const CONTACTS_PAGE_SIZE = 100; // backend max for GET /contacts
const IMPORT_CHUNK_SIZE = 1000;

function errorMessage(err: unknown, fallback: string): string {
  const message = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  return typeof message === 'string' && message ? message : fallback;
}

/**
 * The backend has no tag/audience field on campaigns: recipients are added with
 * POST /campaigns/{id}/recipients/import. Resolve the audience from contacts
 * (optionally filtered by tag) so they can be imported.
 */
async function loadAudience(tag: string): Promise<Array<{ phone_number: string; recipient_name?: string }>> {
  const recipients: Array<{ phone_number: string; recipient_name?: string }> = [];
  const seen = new Set<string>();
  for (let page = 1; ; page++) {
    const res = await contactsService.list({ tags: tag || undefined, page, limit: CONTACTS_PAGE_SIZE });
    const contacts = readList<ContactItem>(res, 'contacts');
    for (const c of contacts) {
      const phone = (c.phone_number || '').trim();
      if (!phone || seen.has(phone)) continue;
      if (phone.includes('*')) {
        throw new Error('Phone numbers are masked for this organization, so contacts cannot be added as campaign recipients from here.');
      }
      seen.add(phone);
      recipients.push({ phone_number: phone, recipient_name: c.name || c.profile_name || undefined });
    }
    if (contacts.length === 0 || page * CONTACTS_PAGE_SIZE >= readTotal(res, 'contacts')) break;
  }
  return recipients;
}

const hasVariables = (tpl?: TemplateOption) =>
  !!tpl && (/\{\{[^}]+\}\}/.test(tpl.body_content || '') ||
    ((tpl.header_type || '').toUpperCase() === 'TEXT' && /\{\{[^}]+\}\}/.test(tpl.header_content || '')));

export const CampaignDetailView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [targetTag, setTargetTag] = useState('');
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [campaign, setCampaign] = useState<CampaignData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isActing, setIsActing] = useState(false);
  const [isLoading, setIsLoading] = useState(!isNew);

  const loadCampaign = useCallback(async () => {
    if (isNew || !id) return;
    try {
      const data = readData<CampaignData>(await campaignsService.get(id));
      setCampaign(data);
      setName(data?.name || '');
      setSelectedTemplateId(data?.template_id || '');
    } catch {
      toast.error('Failed to load campaign');
    } finally {
      setIsLoading(false);
    }
  }, [id, isNew]);

  useEffect(() => {
    templatesService.list({ limit: 100 }).then((res) => {
      const list = readList<TemplateOption>(res, 'templates');
      setTemplates(list);
      if (isNew && list.length > 0) {
        const preferred = list.find((tpl) => (tpl.status || '').toUpperCase() === 'APPROVED') || list[0];
        setSelectedTemplateId((current) => current || preferred.id);
      }
    }).catch(() => {
      setTemplates([]);
    });

    loadCampaign();
  }, [isNew, loadCampaign]);

  const selectedTemplate = templates.find((tpl) => tpl.id === selectedTemplateId);
  const multipleAccounts = new Set(templates.map((tpl) => tpl.whatsapp_account)).size > 1;
  const templateOptions = !isNew && campaign?.template_id && !selectedTemplate
    ? [...templates, { id: campaign.template_id, name: campaign.template_name || campaign.template_id }]
    : templates;

  const status = (campaign?.status || '').toLowerCase();
  const canStart = !isNew && ['draft', 'scheduled', 'paused'].includes(status) && (campaign?.total_recipients || 0) > 0;
  const canPause = !isNew && ['processing', 'queued', 'running'].includes(status);

  const handleLaunch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isNew) return;
    if (!name.trim()) {
      toast.error('Campaign name is required');
      return;
    }
    if (!selectedTemplate) {
      toast.error('Select a message template');
      return;
    }
    if (!selectedTemplate.whatsapp_account) {
      toast.error('The selected template is not linked to a WhatsApp account');
      return;
    }

    setIsSubmitting(true);
    try {
      let audience: Array<{ phone_number: string; recipient_name?: string }>;
      try {
        audience = await loadAudience(targetTag.trim());
      } catch (err) {
        toast.error(err instanceof Error && !('response' in err) ? err.message : errorMessage(err, 'Failed to load contacts'));
        return;
      }
      if (audience.length === 0) {
        toast.error(targetTag.trim() ? `No contacts have the tag "${targetTag.trim()}"` : 'There are no contacts to send to');
        return;
      }

      // Body for POST /api/campaigns (handlers.CampaignRequest); the campaign starts as a draft.
      const created = readData<CampaignData>(await campaignsService.create({
        name: name.trim(),
        whatsapp_account: selectedTemplate.whatsapp_account,
        template_id: selectedTemplate.id,
      }));

      try {
        for (let i = 0; i < audience.length; i += IMPORT_CHUNK_SIZE) {
          await campaignsService.addRecipients(created.id, audience.slice(i, i + IMPORT_CHUNK_SIZE));
        }
        toast.success(`Campaign created with ${audience.length} recipient${audience.length === 1 ? '' : 's'}. Review it, then start the broadcast.`);
      } catch (err) {
        toast.error(`Campaign created, but adding recipients failed: ${errorMessage(err, 'unknown error')}`);
      }
      navigate(`/campaigns/${created.id}`);
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to create campaign'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const runAction = async (action: 'start' | 'pause') => {
    if (!campaign) return;
    setIsActing(true);
    try {
      const res = action === 'start'
        ? await campaignsService.start(campaign.id)
        : await campaignsService.pause(campaign.id);
      toast.success(readData<{ message?: string }>(res)?.message || (action === 'start' ? 'Campaign started' : 'Campaign paused'));
      await loadCampaign();
    } catch (err) {
      toast.error(errorMessage(err, action === 'start' ? 'Failed to start campaign' : 'Failed to pause campaign'));
    } finally {
      setIsActing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-white/50 light:text-gray-500">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
          <span>Loading campaign metrics...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#0a0a0b] light:bg-gray-50 overflow-hidden">
      <PageHeader
        title={isNew ? 'Create Broadcast Campaign' : `Campaign: ${campaign?.name || name}`}
        subtitle={!isNew && campaign ? `Status: ${(campaign.status || 'unknown').toUpperCase()}` : 'Schedule and blast verified messages to customer lists'}
        icon={Megaphone}
        backLink="/campaigns"
        actions={
          isNew ? (
            <Button
              type="submit"
              form="campaign-form"
              className="bg-emerald-600 hover:bg-emerald-500 text-white"
              disabled={isSubmitting}
            >
              <Plus className="h-4 w-4 mr-2" />
              {isSubmitting ? 'Creating...' : 'Create Campaign'}
            </Button>
          ) : canStart ? (
            <Button
              className="bg-emerald-600 hover:bg-emerald-500 text-white"
              disabled={isActing}
              onClick={() => runAction('start')}
            >
              <Play className="h-4 w-4 mr-2" />
              {isActing ? 'Starting...' : status === 'paused' ? 'Resume Broadcast' : 'Start Broadcast'}
            </Button>
          ) : canPause ? (
            <Button variant="outline" disabled={isActing} onClick={() => runAction('pause')}>
              <Pause className="h-4 w-4 mr-2" />
              {isActing ? 'Pausing...' : 'Pause'}
            </Button>
          ) : undefined
        }
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-5xl mx-auto">
        {!isNew && campaign && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-white/[0.08] bg-[#141415] text-white light:border-gray-200 light:bg-white light:text-gray-900">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-white/40 light:text-gray-400">Total Recipients</p>
                  <p className="text-2xl font-bold mt-1">{campaign.total_recipients || 0}</p>
                </div>
                <Users className="h-8 w-8 text-white/20 light:text-gray-300" />
              </CardContent>
            </Card>

            <Card className="border-white/[0.08] bg-[#141415] text-white light:border-gray-200 light:bg-white light:text-gray-900">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-white/40 light:text-gray-400">Delivered</p>
                  <p className="text-2xl font-bold mt-1 text-emerald-400">
                    {campaign.delivered_count || 0}
                  </p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-emerald-500/20" />
              </CardContent>
            </Card>

            <Card className="border-white/[0.08] bg-[#141415] text-white light:border-gray-200 light:bg-white light:text-gray-900">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-white/40 light:text-gray-400">Read</p>
                  <p className="text-2xl font-bold mt-1 text-blue-400">
                    {campaign.read_count || 0}
                  </p>
                </div>
                <Eye className="h-8 w-8 text-blue-500/20" />
              </CardContent>
            </Card>

            <Card className="border-white/[0.08] bg-[#141415] text-white light:border-gray-200 light:bg-white light:text-gray-900">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-white/40 light:text-gray-400">Delivery Rate</p>
                  <p className="text-2xl font-bold mt-1 text-purple-400">
                    {campaign.total_recipients
                      ? `${Math.round(((campaign.delivered_count || 0) / campaign.total_recipients) * 100)}%`
                      : '—'}
                  </p>
                </div>
                <Clock className="h-8 w-8 text-purple-500/20" />
              </CardContent>
            </Card>
          </div>
        )}

        <Card className="card-depth border-white/[0.08] bg-[#141415] text-white light:border-gray-200 light:bg-white light:text-gray-900">
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              {isNew ? 'Campaign Setup' : 'Campaign Settings'}
            </CardTitle>
            <CardDescription className="text-xs text-white/50 light:text-gray-500">
              Configure messaging template, audience segment and broadcast scheduling.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form id="campaign-form" onSubmit={handleLaunch} className="space-y-4">
              <div className="grid gap-1.5">
                <Label htmlFor="campName" className="text-xs">Campaign Name *</Label>
                <Input
                  id="campName"
                  placeholder="e.g. Flash Sale Announcement - Q4"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={!isNew}
                  required
                />
              </div>

              <div className="grid gap-1.5">
                <Label className="text-xs">Approved Message Template *</Label>
                <Select
                  value={selectedTemplateId}
                  onValueChange={setSelectedTemplateId}
                  disabled={!isNew}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={templates.length === 0 ? 'No templates yet' : 'Select a template'} />
                  </SelectTrigger>
                  <SelectContent>
                    {templateOptions.map((tpl) => {
                      const tplStatus = (tpl.status || '').toUpperCase();
                      return (
                        <SelectItem key={tpl.id} value={tpl.id}>
                          {tpl.display_name || tpl.name}
                          {tpl.language ? ` (${tpl.language})` : ''}
                          {multipleAccounts && tpl.whatsapp_account ? ` · ${tpl.whatsapp_account}` : ''}
                          {tplStatus && tplStatus !== 'APPROVED' ? ` · ${tplStatus}` : ''}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                {isNew && selectedTemplate && (selectedTemplate.status || '').toUpperCase() !== 'APPROVED' && (
                  <p className="text-[10px] text-amber-400">
                    This template is not approved by Meta yet, so messages will fail until it is.
                  </p>
                )}
                {isNew && hasVariables(selectedTemplate) && (
                  <p className="text-[10px] text-amber-400">
                    This template has variables, but recipients added from contacts carry no values for them, so Meta will reject those messages.
                  </p>
                )}
              </div>

              {isNew && (
                <div className="grid gap-1.5">
                  <Label htmlFor="tag" className="text-xs">Audience Filter / Tag (Optional)</Label>
                  <Input
                    id="tag"
                    placeholder="e.g. VIP, Leads (leave empty for all contacts)"
                    value={targetTag}
                    onChange={(e) => setTargetTag(e.target.value)}
                  />
                </div>
              )}

              {isNew && (
                <div className="pt-2">
                  <p className="text-xs text-white/40 light:text-gray-400">
                    💡 Matching contacts are added as recipients. Review the campaign, then start the broadcast — messages are throttled per Meta rate limits.
                  </p>
                </div>
              )}
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
export default CampaignDetailView;
