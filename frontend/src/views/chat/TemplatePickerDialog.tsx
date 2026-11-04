import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { FileText, Loader2, Search } from 'lucide-react';
import { messagesService, templatesService } from '@/services/api';
import { readList } from '@/services/response';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { type Contact, getContactName, getErrorMessage } from './chatUtils';

interface Template {
  id: string;
  name: string;
  display_name?: string;
  language?: string;
  category?: string;
  status?: string;
  whatsapp_account?: string;
  header_type?: string;
  body_content?: string;
}

const placeholders = (body = '') => {
  const out: string[] = [];
  for (const m of body.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
};

const MEDIA_HEADERS = ['IMAGE', 'VIDEO', 'DOCUMENT'];

export const TemplatePickerDialog: React.FC<{
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contact: Contact;
  onSent: () => void;
}> = ({ open, onOpenChange, contact, onSent }) => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Template | null>(null);
  const [params, setParams] = useState<Record<string, string>>({});
  const [headerFile, setHeaderFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setQuery('');
    setLoading(true);
    templatesService
      .list({ status: 'APPROVED', limit: 100 })
      .then((res) => setTemplates(readList<Template>(res, 'templates')))
      .catch((err) => toast.error(getErrorMessage(err, 'Failed to load templates')))
      .finally(() => setLoading(false));
  }, [open]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return templates
      .filter((t) => !t.status || t.status.toUpperCase() === 'APPROVED')
      .filter((t) => !contact.whatsapp_account || !t.whatsapp_account || t.whatsapp_account === contact.whatsapp_account)
      .filter((t) => !q || t.name.toLowerCase().includes(q) || (t.display_name || '').toLowerCase().includes(q));
  }, [templates, query, contact.whatsapp_account]);

  const vars = placeholders(selected?.body_content);
  const needsFile = selected ? MEDIA_HEADERS.includes((selected.header_type || '').toUpperCase()) : false;

  const pick = (t: Template) => {
    setSelected(t);
    setHeaderFile(null);
    const initial: Record<string, string> = {};
    for (const v of placeholders(t.body_content)) initial[v] = v === '1' || /name/i.test(v) ? getContactName(contact) : '';
    setParams(initial);
  };

  const preview = (selected?.body_content || '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k: string) => params[k] || `{{${k}}}`);

  const send = async () => {
    if (!selected) return;
    if (vars.some((v) => !params[v]?.trim())) {
      toast.error('Fill in every variable');
      return;
    }
    if (needsFile && !headerFile) {
      toast.error(`This template needs a ${selected.header_type?.toLowerCase()} header`);
      return;
    }
    setSending(true);
    try {
      await messagesService.sendTemplate(
        contact.id,
        {
          template_name: selected.name,
          template_params: vars.length ? params : undefined,
          account_name: selected.whatsapp_account || contact.whatsapp_account,
        },
        headerFile || undefined
      );
      toast.success('Template sent');
      onOpenChange(false);
      onSent();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to send template'));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-emerald-600" /> Send a template
          </DialogTitle>
          <DialogDescription>
            Approved templates can be sent any time, including outside the 24-hour reply window.
          </DialogDescription>
        </DialogHeader>

        {!selected ? (
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 opacity-50" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search templates" className="h-9 pl-8 text-sm" />
            </div>
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {loading && (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin opacity-60" />
                </div>
              )}
              {!loading && shown.length === 0 && <p className="py-6 text-center text-xs opacity-70">No approved templates for this number yet.</p>}
              {shown.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => pick(t)}
                  className="w-full rounded-xl border border-transparent px-3 py-2 text-left hover:border-emerald-500/40 hover:bg-emerald-500/5"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{t.display_name || t.name}</span>
                    <span className="shrink-0 text-[10px] uppercase opacity-60">
                      {t.category} · {t.language}
                    </span>
                  </span>
                  <span className="line-clamp-2 text-xs opacity-70">{t.body_content}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-xl bg-[#d9fdd3] p-3 text-[13px] text-gray-900 dark:bg-[#005c4b] dark:text-white">
              <p className="whitespace-pre-wrap">{preview}</p>
            </div>
            {vars.map((v) => (
              <div key={v}>
                <Label className="text-xs">Variable {`{{${v}}}`}</Label>
                <Input value={params[v] || ''} onChange={(e) => setParams({ ...params, [v]: e.target.value })} className="mt-1 h-9 text-sm" />
              </div>
            ))}
            {needsFile && (
              <div>
                <Label className="text-xs">Header {selected.header_type?.toLowerCase()}</Label>
                <input
                  type="file"
                  accept={selected.header_type?.toUpperCase() === 'IMAGE' ? 'image/*' : selected.header_type?.toUpperCase() === 'VIDEO' ? 'video/*' : undefined}
                  onChange={(e) => setHeaderFile(e.target.files?.[0] || null)}
                  className={cn('mt-1 block w-full text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-600 file:px-3 file:py-1.5 file:text-white')}
                />
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {selected && (
            <Button variant="outline" size="sm" onClick={() => setSelected(null)}>
              Back
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {selected && (
            <Button size="sm" onClick={send} disabled={sending} className="bg-emerald-600 text-white hover:bg-emerald-500">
              {sending ? 'Sending…' : 'Send template'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TemplatePickerDialog;
