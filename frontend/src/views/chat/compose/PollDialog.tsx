import React, { useEffect, useState } from 'react';
import { BarChart3, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { type ComposeDialogProps, Field, Note, fieldCls, primaryBtn } from './composeUi';
import { sendRich } from './sendRich';

const MAX_OPTIONS = 10;

/** Max option length: reply buttons (≤3 options) allow 20, list rows 24. */
const pollOptionLimit = (count: number) => (count <= 3 ? 20 : 24);

/** Quick poll: sent as WhatsApp reply buttons (2–3 options) or a list (4–10). */
export const PollDialog: React.FC<ComposeDialogProps> = ({ open, onOpenChange, contact, onSent }) => {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuestion('');
    setOptions(['', '']);
  }, [open]);

  const filled = options.map((o) => o.trim()).filter(Boolean);
  const limit = pollOptionLimit(filled.length);
  const tooLong = filled.some((o) => o.length > limit);
  const dupes = new Set(filled.map((o) => o.toLowerCase())).size !== filled.length;
  const canSend = question.trim() && filled.length >= 2 && !tooLong && !dupes;

  const submit = async () => {
    if (!canSend || sending) return;
    setSending(true);
    const ok = await sendRich(contact, { type: 'interactive', interactive: { type: 'poll', body: question.trim(), options: filled } }, `📊 ${question.trim()}`, onSent);
    setSending(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-emerald-600" /> Quick poll
          </DialogTitle>
          <DialogDescription>Ask a question with tap-to-answer options. Votes show live on the poll in this chat.</DialogDescription>
        </DialogHeader>

        <Note>
          This is a <b>WhatsApp button poll</b>: WhatsApp doesn't let businesses send native polls, so 2–3 options go out as reply buttons and 4–10 as a
          list. The customer taps one to vote and can change their answer.
        </Note>

        <div className="space-y-3">
          <Field label="Question">
            <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={2} maxLength={1024} placeholder="e.g. Which delivery slot suits you?" className={cn(fieldCls, 'h-auto py-2')} autoFocus />
          </Field>
          <div className="space-y-2">
            <p className="flex items-baseline justify-between text-xs font-medium text-foreground">
              Options
              <span className="text-[10px] font-normal text-muted-foreground">
                {filled.length <= 3 ? 'Reply buttons' : 'List'} · up to {limit} characters each
              </span>
            </p>
            {options.map((o, i) => {
              const over = o.trim().length > limit;
              return (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-4 shrink-0 text-center text-[11px] text-muted-foreground">{i + 1}</span>
                  <input
                    value={o}
                    onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))}
                    placeholder={`Option ${i + 1}`}
                    className={cn(fieldCls, over && 'border-red-500 focus:border-red-500 focus:ring-red-500/20')}
                  />
                  <span className={cn('w-8 shrink-0 text-right text-[10px]', over ? 'font-semibold text-red-500' : 'text-muted-foreground')}>{limit - o.trim().length}</span>
                  {options.length > 2 && (
                    <button type="button" onClick={() => setOptions(options.filter((_, j) => j !== i))} aria-label={`Remove option ${i + 1}`} className="rounded-full p-1 text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
            {options.length < MAX_OPTIONS && (
              <Button type="button" variant="outline" size="sm" onClick={() => setOptions([...options, ''])} className="h-8">
                <Plus className="mr-1 h-3.5 w-3.5" /> Add option
              </Button>
            )}
            {dupes && <p className="text-[11px] text-red-500">Each option must be different.</p>}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => void submit()} disabled={!canSend || sending} className={primaryBtn}>
            {sending ? 'Sending…' : 'Send poll'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PollDialog;
