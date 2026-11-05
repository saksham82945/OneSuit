import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  FileText,
  Film,
  Image as ImageIcon,
  Link2,
  List,
  Loader2,
  Lock,
  MessageSquareText,
  Mic,
  MousePointerClick,
  Plus,
  Trash2,
  Type,
  Upload,
  X,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { chatbotService } from '@/services/api';
import { readData } from '@/services/response';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { BotReplyPreview } from './BotReplyPreview';
import { useBotMediaUrl } from './botReplyMedia';
import {
  CHAT_FLOW_TYPE_INFO,
  CONTACT_VARIABLES,
  LIMITS,
  MEDIA_ACCEPT,
  canUseLinks,
  canUseMedia,
  isMediaHeader,
  newOptionId,
  validateReply,
  type BotReply,
  type ChatFlowType,
  type ReplyHeaderType,
  type ReplyInteractive,
} from './chatbotFlowTypes';

const HEADER_OPTIONS: { type: ReplyHeaderType; label: string; icon: LucideIcon }[] = [
  { type: 'none', label: 'None', icon: X },
  { type: 'text', label: 'Text', icon: Type },
  { type: 'image', label: 'Image', icon: ImageIcon },
  { type: 'video', label: 'Video', icon: Film },
  { type: 'audio', label: 'Audio', icon: Mic },
  { type: 'document', label: 'File', icon: FileText },
];

const INTERACTIVE_OPTIONS: { type: ReplyInteractive; label: string; hint: string; icon: LucideIcon }[] = [
  { type: 'none', label: 'Plain reply', hint: 'Just the message', icon: MessageSquareText },
  { type: 'buttons', label: 'Reply Buttons', hint: 'Up to 3 quick taps', icon: MousePointerClick },
  { type: 'list', label: 'List Message', hint: 'Menu of up to 10 rows', icon: List },
  { type: 'cta_url', label: 'CTA URL Button', hint: 'Opens a website', icon: Link2 },
];

const fieldLabel = 'text-[11px] font-semibold uppercase tracking-wide text-white/50 light:text-gray-500';
const panel = 'rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 light:border-gray-200 light:bg-gray-50';

const Counter: React.FC<{ value: string | undefined; max: number }> = ({ value, max }) => {
  const n = [...(value ?? '')].length;
  return (
    <span className={cn('text-[10px] tabular-nums', n > max ? 'text-rose-400 font-semibold' : 'text-white/30 light:text-gray-400')}>
      {n}/{max}
    </span>
  );
};

interface BotReplyEditorProps {
  open: boolean;
  flowType: ChatFlowType;
  title: string;
  reply: BotReply;
  onClose: () => void;
  onSave: (title: string, reply: BotReply) => void;
}

export const BotReplyEditor: React.FC<BotReplyEditorProps> = ({ open, flowType, title, reply, onClose, onSave }) => {
  const [draft, setDraft] = useState<BotReply>(reply);
  const [name, setName] = useState(title);
  const [uploading, setUploading] = useState(false);
  const [localFile, setLocalFile] = useState<File | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setDraft(reply);
      setName(title);
      setLocalFile(null);
      setShowErrors(false);
    }
  }, [open, reply, title]);

  const mediaUrl = useBotMediaUrl(isMediaHeader(draft.header.type) ? draft.header.media_path : undefined, localFile);
  const errors = useMemo(() => validateReply(draft, flowType), [draft, flowType]);
  const typeInfo = CHAT_FLOW_TYPE_INFO[flowType];
  const linksAllowed = canUseLinks(flowType);
  const mediaAllowed = canUseMedia(flowType);

  const patch = (p: Partial<BotReply>) => setDraft((d) => ({ ...d, ...p }));

  const insertVariable = (v: string) => {
    const token = `{${v}}`;
    const el = bodyRef.current;
    const start = el?.selectionStart ?? draft.body.length;
    const end = el?.selectionEnd ?? draft.body.length;
    const next = draft.body.slice(0, start) + token + draft.body.slice(end);
    patch({ body: next });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const setHeaderType = (type: ReplyHeaderType) => {
    if (isMediaHeader(type) && !mediaAllowed) return;
    setLocalFile(null);
    const keepMedia = type === draft.header.type;
    patch({
      header: keepMedia ? draft.header : { type, text: type === 'text' ? draft.header.text ?? '' : '' },
    });
  };

  const setInteractive = (type: ReplyInteractive) => {
    if (type === 'cta_url' && !linksAllowed) return;
    const next: Partial<BotReply> = { interactive: type };
    if (type === 'buttons' && draft.buttons.length === 0) next.buttons = [{ id: newOptionId('btn'), title: 'Option 1' }];
    if (type === 'list' && !draft.list.sections.some((s) => s.rows.length))
      next.list = { button_text: draft.list.button_text || 'View options', sections: [{ title: '', rows: [{ id: newOptionId('row'), title: 'Option 1', description: '' }] }] };
    if (type === 'list' && isMediaHeader(draft.header.type)) next.header = { type: 'none' };
    patch(next);
  };

  const handleFile = async (file: File) => {
    const kind = draft.header.type;
    const ok =
      (kind === 'image' && /^image\/(jpeg|png)$/.test(file.type)) ||
      (kind === 'video' && /^video\/(mp4|3gpp)$/.test(file.type)) ||
      (kind === 'audio' && (/^audio\//.test(file.type) || /\.(mp3|m4a|aac|amr|ogg)$/i.test(file.name))) ||
      (kind === 'document' && /\.(pdf|docx?|xlsx?|pptx?|txt)$/i.test(file.name));
    if (!ok) {
      toast.error(`That file isn't a supported ${kind}.`);
      return;
    }
    setUploading(true);
    try {
      const res = await chatbotService.uploadFlowMedia(file);
      const up = readData<{ media_path: string; filename: string; mime_type: string }>(res);
      setLocalFile(file);
      patch({ header: { type: kind, media_path: up.media_path, filename: up.filename, mime_type: up.mime_type } });
      toast.success('File uploaded');
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const updateButton = (i: number, title: string) =>
    patch({ buttons: draft.buttons.map((b, j) => (j === i ? { ...b, title } : b)) });

  const totalRows = draft.list.sections.reduce((n, s) => n + s.rows.length, 0);
  const updateSection = (si: number, fn: (s: BotReply['list']['sections'][number]) => BotReply['list']['sections'][number] | null) =>
    patch({
      list: {
        ...draft.list,
        sections: draft.list.sections.flatMap((s, j) => {
          if (j !== si) return [s];
          const r = fn(s);
          return r ? [r] : [];
        }),
      },
    });

  const save = () => {
    if (errors.length) {
      setShowErrors(true);
      return;
    }
    onSave(name.trim() || 'Bot reply', draft);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl w-[calc(100vw-1rem)] max-h-[92vh] p-0 gap-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-white/[0.08] light:border-gray-200 text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <MessageSquareText className="h-4 w-4 text-emerald-400" />
            Edit Bot Reply
            <span className="ml-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 light:text-emerald-700">
              {typeInfo.title}
            </span>
          </DialogTitle>
          <DialogDescription className="text-xs text-white/50 light:text-gray-500">{typeInfo.tagline}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          <div className="grid gap-5 p-5 lg:grid-cols-[1fr_320px]">
            {/* ── Form ── */}
            <div className="space-y-4 min-w-0">
              <div className="space-y-1.5">
                <label className={fieldLabel}>Reply name</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Welcome menu" />
              </div>

              {/* Header */}
              <div className="space-y-1.5">
                <label className={fieldLabel}>Header type (optional)</label>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                  {HEADER_OPTIONS.map((o) => {
                    const locked = isMediaHeader(o.type) && !mediaAllowed;
                    const listLocked = isMediaHeader(o.type) && draft.interactive === 'list';
                    const active = draft.header.type === o.type;
                    return (
                      <button
                        key={o.type}
                        type="button"
                        disabled={locked || listLocked}
                        title={
                          locked ? 'Media needs a Media or Advanced bot' : listLocked ? 'List messages only take a text header' : undefined
                        }
                        onClick={() => setHeaderType(o.type)}
                        className={cn(
                          'relative flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-[11px] transition-all',
                          active
                            ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300 light:text-emerald-700'
                            : 'border-white/[0.08] text-white/70 hover:border-white/20 light:border-gray-200 light:text-gray-600 light:hover:border-gray-300',
                          (locked || listLocked) && 'opacity-40 cursor-not-allowed hover:border-white/[0.08]'
                        )}
                      >
                        <o.icon className="h-4 w-4" />
                        {o.label}
                        {locked && <Lock className="absolute right-1 top-1 h-2.5 w-2.5" />}
                      </button>
                    );
                  })}
                </div>
                {draft.header.type === 'text' && (
                  <div className="relative">
                    <Input
                      value={draft.header.text ?? ''}
                      onChange={(e) => patch({ header: { ...draft.header, text: e.target.value } })}
                      placeholder="Header text"
                      className="pr-14"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2">
                      <Counter value={draft.header.text} max={LIMITS.header} />
                    </span>
                  </div>
                )}
                {isMediaHeader(draft.header.type) && (
                  <div className={cn(panel, 'flex items-center gap-3')}>
                    <input
                      ref={fileRef}
                      type="file"
                      accept={MEDIA_ACCEPT[draft.header.type]}
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handleFile(f);
                        e.target.value = '';
                      }}
                    />
                    <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={() => fileRef.current?.click()}>
                      {uploading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
                      {draft.header.media_path ? 'Replace file' : `Upload ${draft.header.type}`}
                    </Button>
                    <span className="text-xs truncate text-white/60 light:text-gray-600">
                      {draft.header.media_path ? draft.header.filename || 'Uploaded' : 'No file yet'}
                    </span>
                  </div>
                )}
                {draft.header.type === 'audio' && draft.interactive !== 'none' && (
                  <p className="text-[11px] text-white/40 light:text-gray-500">
                    WhatsApp has no audio header: the audio is sent just before this message.
                  </p>
                )}
              </div>

              {/* Body */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className={fieldLabel}>{isMediaHeader(draft.header.type) && draft.interactive === 'none' ? 'Caption' : 'Reply text'}</label>
                  <Counter value={draft.body} max={draft.interactive !== 'none' || isMediaHeader(draft.header.type) ? LIMITS.body : LIMITS.text} />
                </div>
                <Textarea
                  ref={bodyRef}
                  rows={5}
                  value={draft.body}
                  onChange={(e) => patch({ body: e.target.value })}
                  placeholder="Hi {first_name}! How can we help?"
                />
                <div className="flex flex-wrap gap-1.5">
                  {CONTACT_VARIABLES.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => insertVariable(v)}
                      className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] text-emerald-300 hover:bg-emerald-500/20 light:text-emerald-700"
                    >
                      {`{${v}}`}
                    </button>
                  ))}
                </div>
                {!linksAllowed && (
                  <p className="text-[11px] text-amber-400/90 light:text-amber-700">
                    {typeInfo.title}s can't contain links (http://, www., or domains like example.com).
                  </p>
                )}
              </div>

              {/* Interactive */}
              <div className="space-y-1.5">
                <label className={fieldLabel}>Interactive part</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {INTERACTIVE_OPTIONS.map((o) => {
                    const locked = o.type === 'cta_url' && !linksAllowed;
                    const active = draft.interactive === o.type;
                    return (
                      <button
                        key={o.type}
                        type="button"
                        disabled={locked}
                        title={locked ? 'CTA URL buttons need an Advanced bot' : undefined}
                        onClick={() => setInteractive(o.type)}
                        className={cn(
                          'relative flex items-start gap-2 rounded-lg border px-2.5 py-2 text-left transition-all',
                          active
                            ? 'border-emerald-500 bg-emerald-500/10'
                            : 'border-white/[0.08] hover:border-white/20 light:border-gray-200 light:hover:border-gray-300',
                          locked && 'opacity-40 cursor-not-allowed'
                        )}
                      >
                        <span
                          className={cn(
                            'mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border-2',
                            active ? 'border-emerald-500 bg-emerald-500 ring-2 ring-inset ring-[#141415] light:ring-white' : 'border-white/30 light:border-gray-300'
                          )}
                        />
                        <span className="min-w-0">
                          <span className="flex items-center gap-1 text-xs font-medium text-white light:text-gray-900">
                            <o.icon className="h-3.5 w-3.5 text-emerald-400" />
                            {o.label}
                          </span>
                          <span className="block text-[10px] text-white/40 light:text-gray-500">{o.hint}</span>
                        </span>
                        {locked && <Lock className="absolute right-1.5 top-1.5 h-3 w-3 text-white/40 light:text-gray-400" />}
                      </button>
                    );
                  })}
                </div>

                {draft.interactive === 'buttons' && (
                  <div className={cn(panel, 'space-y-2')}>
                    {draft.buttons.map((b, i) => (
                      <div key={b.id} className="flex items-center gap-2">
                        <span className="w-16 shrink-0 text-[11px] text-white/50 light:text-gray-500">Button {i + 1}</span>
                        <div className="relative flex-1">
                          <Input value={b.title} onChange={(e) => updateButton(i, e.target.value)} className="pr-12" placeholder="Label" />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2">
                            <Counter value={b.title} max={LIMITS.buttonTitle} />
                          </span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-white/40 hover:text-rose-400 light:text-gray-400"
                          onClick={() => patch({ buttons: draft.buttons.filter((_, j) => j !== i) })}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                    {draft.buttons.length < LIMITS.buttons && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          patch({ buttons: [...draft.buttons, { id: newOptionId('btn'), title: `Option ${draft.buttons.length + 1}` }] })
                        }
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" /> Add button
                      </Button>
                    )}
                    <p className="text-[10px] text-white/40 light:text-gray-500">Each button becomes its own output on the canvas.</p>
                  </div>
                )}

                {draft.interactive === 'list' && (
                  <div className={cn(panel, 'space-y-3')}>
                    <div className="flex items-center gap-2">
                      <span className="w-24 shrink-0 text-[11px] text-white/50 light:text-gray-500">Button text</span>
                      <div className="relative flex-1">
                        <Input
                          value={draft.list.button_text}
                          onChange={(e) => patch({ list: { ...draft.list, button_text: e.target.value } })}
                          className="pr-12"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2">
                          <Counter value={draft.list.button_text} max={LIMITS.listButton} />
                        </span>
                      </div>
                    </div>
                    {draft.list.sections.map((sec, si) => (
                      <div key={si} className="rounded-lg border border-white/[0.06] p-2.5 space-y-2 light:border-gray-200 light:bg-white">
                        <div className="flex items-center gap-2">
                          <Input
                            value={sec.title ?? ''}
                            onChange={(e) => updateSection(si, (s) => ({ ...s, title: e.target.value }))}
                            placeholder={`Section ${si + 1} title (optional)`}
                            className="h-8 text-xs"
                          />
                          {draft.list.sections.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-white/40 hover:text-rose-400 light:text-gray-400"
                              onClick={() => updateSection(si, () => null)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                        {sec.rows.map((row, ri) => (
                          <div key={ri} className="grid gap-1.5 sm:grid-cols-[110px_1fr_auto] items-start rounded-md bg-white/[0.02] p-2 light:bg-gray-50">
                            <Input
                              value={row.id}
                              onChange={(e) =>
                                updateSection(si, (s) => ({ ...s, rows: s.rows.map((r, k) => (k === ri ? { ...r, id: e.target.value.replace(/\s+/g, '_') } : r)) }))
                              }
                              placeholder="Row ID"
                              className="h-8 font-mono text-[11px]"
                            />
                            <div className="space-y-1.5">
                              <div className="relative">
                                <Input
                                  value={row.title}
                                  onChange={(e) => updateSection(si, (s) => ({ ...s, rows: s.rows.map((r, k) => (k === ri ? { ...r, title: e.target.value } : r)) }))}
                                  placeholder="Row title"
                                  className="h-8 text-xs pr-12"
                                />
                                <span className="absolute right-2 top-1/2 -translate-y-1/2">
                                  <Counter value={row.title} max={LIMITS.rowTitle} />
                                </span>
                              </div>
                              <div className="relative">
                                <Input
                                  value={row.description ?? ''}
                                  onChange={(e) =>
                                    updateSection(si, (s) => ({ ...s, rows: s.rows.map((r, k) => (k === ri ? { ...r, description: e.target.value } : r)) }))
                                  }
                                  placeholder="Row description (optional)"
                                  className="h-8 text-xs pr-12"
                                />
                                <span className="absolute right-2 top-1/2 -translate-y-1/2">
                                  <Counter value={row.description} max={LIMITS.rowDescription} />
                                </span>
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-white/40 hover:text-rose-400 light:text-gray-400"
                              onClick={() => updateSection(si, (s) => ({ ...s, rows: s.rows.filter((_, k) => k !== ri) }))}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                        {totalRows < LIMITS.rows && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() =>
                              updateSection(si, (s) => ({
                                ...s,
                                rows: [...s.rows, { id: newOptionId('row'), title: `Option ${totalRows + 1}`, description: '' }],
                              }))
                            }
                          >
                            <Plus className="h-3 w-3 mr-1" /> Add row
                          </Button>
                        )}
                      </div>
                    ))}
                    <div className="flex items-center justify-between">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-emerald-400"
                        disabled={totalRows >= LIMITS.rows}
                        onClick={() =>
                          patch({
                            list: {
                              ...draft.list,
                              sections: [...draft.list.sections, { title: '', rows: [{ id: newOptionId('row'), title: `Option ${totalRows + 1}`, description: '' }] }],
                            },
                          })
                        }
                      >
                        <Plus className="h-3 w-3 mr-1" /> Add section
                      </Button>
                      <span className="text-[10px] text-white/40 light:text-gray-500">
                        {totalRows}/{LIMITS.rows} rows · each row is its own output
                      </span>
                    </div>
                  </div>
                )}

                {draft.interactive === 'cta_url' && (
                  <div className={cn(panel, 'space-y-2')}>
                    <div className="relative">
                      <Input
                        value={draft.cta.display_text}
                        onChange={(e) => patch({ cta: { ...draft.cta, display_text: e.target.value } })}
                        placeholder="Button label"
                        className="pr-12"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2">
                        <Counter value={draft.cta.display_text} max={LIMITS.ctaText} />
                      </span>
                    </div>
                    <Input
                      value={draft.cta.url}
                      onChange={(e) => patch({ cta: { ...draft.cta, url: e.target.value } })}
                      placeholder="https://example.com"
                    />
                  </div>
                )}

                {draft.interactive !== 'none' && (
                  <div className="relative">
                    <Input
                      value={draft.footer ?? ''}
                      onChange={(e) => patch({ footer: e.target.value })}
                      placeholder="Footer (optional)"
                      className="pr-12"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2">
                      <Counter value={draft.footer} max={LIMITS.footer} />
                    </span>
                  </div>
                )}
              </div>

              {showErrors && errors.length > 0 && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300 space-y-1 light:text-rose-700">
                  {errors.map((e) => (
                    <div key={e} className="flex gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
                      {e}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Preview ── */}
            <div className="lg:sticky lg:top-0 self-start space-y-2">
              <div className={fieldLabel}>Live preview</div>
              <BotReplyPreview reply={draft} mediaUrl={mediaUrl} />
              <p className="text-[10px] text-white/40 light:text-gray-500">Variables show sample values.</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-white/[0.08] px-5 py-3 light:border-gray-200">
          <span className={cn('text-[11px]', errors.length ? 'text-amber-400 light:text-amber-700' : 'text-emerald-400 light:text-emerald-700')}>
            {errors.length ? `${errors.length} thing${errors.length > 1 ? 's' : ''} to fix` : 'Ready to save'}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white" onClick={save} disabled={uploading}>
              Save reply
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
