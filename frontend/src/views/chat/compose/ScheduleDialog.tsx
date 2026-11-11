import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CalendarClock, Loader2 } from 'lucide-react';
import { templatesService } from '@/services/api';
import { readData, readList } from '@/services/response';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { type Contact, getContactName, getErrorMessage, isWindowOpen } from '../chatUtils';
import { Field, Note, fieldCls, primaryBtn } from './composeUi';
import { type ScheduledMessage, composeService, formatScheduled, localDateTimeValue } from './richUtils';

interface Template {
  id: string;
  name: string;
  display_name?: string;
  status?: string;
  whatsapp_account?: string;
  header_type?: string;
  body_content?: string;
}

const MEDIA_HEADERS = ['IMAGE', 'VIDEO', 'DOCUMENT'];

const placeholders = (body = '') => {
  const out: string[] = [];
  for (const m of body.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
};

const quickTimes = () => {
  const now = new Date();
  const inHour = new Date(now.getTime() + 60 * 60 * 1000);
  const tonight = new Date(now);
  tonight.setHours(19, 0, 0, 0);
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  const out: [string, Date][] = [['In 1 hour', inHour]];
  if (tonight.getTime() - now.getTime() > 30 * 60 * 1000) out.push(['This evening 7 PM', tonight]);
  out.push(['Tomorrow 9 AM', tomorrow]);
  return out;
};

export interface ScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: Contact;
  /** Message being edited, or null to schedule a new one. */
  editing: ScheduledMessage | null;
  /** Text typed in the composer, used as the starting text. */
  initialText?: string;
  onSaved: () => void;
}

/** Schedule a text (or, outside the 24-hour window, a template) for later. */
export const ScheduleDialog: React.FC<ScheduleDialogProps> = ({ open, onOpenChange, contact, editing, initialText, onSaved }) => {
  const [kind, setKind] = useState<'text' | 'template'>('text');
  const [text, setText] = useState('');
  const [when, setWhen] = useState('');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templateId, setTemplateId] = useState('');
  const [params, setParams] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setKind(editing.kind);
      setText(editing.kind === 'text' ? editing.content : '');
      setWhen(localDateTimeValue(new Date(Math.max(new Date(editing.scheduled_at).getTime(), Date.now() + 5 * 60 * 1000))));
      setTemplateId(editing.template_id || '');
      setParams((editing.template_params as Record<string, string>) || {});
    } else {
      // Outside the 24-hour window only a template is sure to go out.
      setKind(isWindowOpen(contact) || initialText ? 'text' : 'template');
      setText(initialText || '');
      setWhen(localDateTimeValue(new Date(Date.now() + 60 * 60 * 1000)));
      setTemplateId('');
      setParams({});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the dialog opens
  }, [open, editing, initialText]);

  useEffect(() => {
    if (!open || kind !== 'template' || templates.length > 0) return;
    let cancelled = false;
    setLoadingTemplates(true);
    templatesService
      .list({ status: 'APPROVED', limit: 100 })
      .then((res) => !cancelled && setTemplates(readList<Template>(res, 'templates')))
      .catch((err) => toast.error(getErrorMessage(err, 'Failed to load templates')))
      .finally(() => !cancelled && setLoadingTemplates(false));
    return () => {
      cancelled = true;
    };
  }, [open, kind, templates.length]);

  const usable = useMemo(
    () =>
      templates
        .filter((t) => !t.status || t.status.toUpperCase() === 'APPROVED')
        .filter((t) => !MEDIA_HEADERS.includes((t.header_type || '').toUpperCase()))
        .filter((t) => !contact.whatsapp_account || !t.whatsapp_account || t.whatsapp_account === contact.whatsapp_account),
    [templates, contact.whatsapp_account]
  );
  const template = usable.find((t) => t.id === templateId);
  const vars = placeholders(template?.body_content);

  const at = when ? new Date(when) : null;
  const atValid = !!at && !Number.isNaN(at.getTime()) && at.getTime() > Date.now() - 60 * 1000;
  const windowEnds = contact.last_inbound_at ? new Date(contact.last_inbound_at).getTime() + 24 * 3600 * 1000 : 0;
  const windowClosedThen = !!at && at.getTime() >= windowEnds;

  const canSave = atValid && (kind === 'text' ? !!text.trim() : !!template && vars.every((v) => params[v]?.trim()));

  const save = async () => {
    if (!canSave || saving || !at) return;
    setSaving(true);
    const data = {
      kind,
      body: kind === 'text' ? text.trim() : undefined,
      template_id: kind === 'template' ? templateId : undefined,
      template_params: kind === 'template' ? params : undefined,
      scheduled_at: at.toISOString(),
      whatsapp_account: contact.whatsapp_account || undefined,
    };
    try {
      const res = editing ? await composeService.updateScheduled(editing.id, data) : await composeService.createScheduled(contact.id, data);
      const saved = readData<ScheduledMessage>(res);
      toast.success(`Scheduled for ${formatScheduled(saved?.scheduled_at || at.toISOString())}`);
      if (saved?.window_warning) toast.warning(saved.window_warning, { duration: 8000 });
      onOpenChange(false);
      onSaved();
    } catch (err) {
      if ((err as { response?: { status?: number } })?.response?.status !== 402) toast.error(getErrorMessage(err, 'Failed to schedule'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-emerald-600" /> {editing ? 'Edit scheduled message' : 'Schedule message'}
          </DialogTitle>
          <DialogDescription>We'll send it to {getContactName(contact)} automatically at the time you pick — use it for reminders and follow-ups.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-1 rounded-xl bg-black/5 p-1 dark:bg-white/5">
          {(
            [
              ['text', 'Text'],
              ['template', 'Template'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={cn('rounded-lg px-3 py-1.5 text-xs font-semibold', kind === k ? 'bg-emerald-600 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground')}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {kind === 'text' ? (
            <Field label="Message">
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={4096} placeholder="e.g. Hi! Just a reminder about your appointment tomorrow at 11 AM." className={cn(fieldCls, 'h-auto py-2')} autoFocus />
            </Field>
          ) : (
            <>
              <Field label="Approved template">
                {loadingTemplates ? (
                  <div className="flex h-9 items-center">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className={cn(fieldCls, 'bg-background')}>
                    <option value="">Choose a template…</option>
                    {usable.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.display_name || t.name}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              {!loadingTemplates && usable.length === 0 && <p className="text-[11px] text-muted-foreground">No approved text templates for this number yet (templates with a media header can't be scheduled).</p>}
              {template?.body_content && <p className="whitespace-pre-wrap rounded-lg bg-[#d9fdd3] p-2.5 text-[12px] text-gray-900 dark:bg-[#005c4b] dark:text-white">{template.body_content}</p>}
              {vars.map((v) => (
                <Field key={v} label={`Variable {{${v}}}`}>
                  <input value={params[v] || ''} onChange={(e) => setParams({ ...params, [v]: e.target.value })} className={fieldCls} />
                </Field>
              ))}
            </>
          )}

          <Field label="Send at">
            <input type="datetime-local" value={when} min={localDateTimeValue(new Date())} onChange={(e) => setWhen(e.target.value)} className={cn(fieldCls, '[color-scheme:light] dark:[color-scheme:dark]')} />
          </Field>
          <div className="flex flex-wrap gap-1.5">
            {quickTimes().map(([label, d]) => (
              <button
                key={label}
                type="button"
                onClick={() => setWhen(localDateTimeValue(d))}
                className="rounded-full border border-teal-500/40 bg-teal-500/10 px-2.5 py-1 text-[11px] font-medium text-teal-700 hover:bg-teal-500/20 dark:text-teal-300"
              >
                {label}
              </button>
            ))}
          </div>
          {when && !atValid && <p className="text-[11px] text-red-500">Pick a time in the future.</p>}
          {kind === 'text' && atValid && windowClosedThen && (
            <Note tone="warn">
              The 24-hour reply window will be closed by then (unless the customer writes again), and WhatsApp rejects free-form text outside it. If it's
              closed, this message will be marked <b>Failed</b> — schedule a <b>template</b> to be safe.
            </Note>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => void save()} disabled={!canSave || saving} className={primaryBtn}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Schedule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ScheduleDialog;
