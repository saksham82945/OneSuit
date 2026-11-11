import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertCircle, CalendarClock, FileText, Pencil, X } from 'lucide-react';
import { readList } from '@/services/response';
import { cn } from '@/lib/utils';
import { type Contact, getErrorMessage } from '../chatUtils';
import { ScheduleDialog } from './ScheduleDialog';
import { type ScheduledMessage, composeService, formatScheduled } from './richUtils';

const REFRESH_MS = 30_000;

/**
 * Scheduled (and failed scheduled) messages, shown at the end of the thread
 * as "Scheduled for …" bubbles with Edit / Cancel until they are sent.
 */
export const ScheduledStrip: React.FC<{ contact: Contact; version: number; onChange: () => void }> = ({ contact, version, onChange }) => {
  const [items, setItems] = useState<ScheduledMessage[]>([]);
  const [editing, setEditing] = useState<ScheduledMessage | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await composeService.listScheduled(contact.id);
      setItems(readList<ScheduledMessage>(res, 'scheduled_messages'));
    } catch {
      // Older servers have no scheduled messages; nothing to show.
    }
  }, [contact.id]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => document.visibilityState === 'visible' && void load(), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [load, version]);

  const cancel = async (s: ScheduledMessage) => {
    setBusy(s.id);
    try {
      await composeService.cancelScheduled(s.id);
      setItems((cur) => cur.filter((x) => x.id !== s.id));
      toast.success(s.status === 'failed' ? 'Dismissed' : 'Scheduled message cancelled');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to cancel'));
    } finally {
      setBusy(null);
    }
  };

  if (items.length === 0 && !editing) return null;

  return (
    <div className="mt-2 space-y-1.5">
      {items.map((s) => {
        const failed = s.status === 'failed';
        const sending = s.status === 'sending';
        return (
          <div key={s.id} className="flex justify-end">
            <div
              className={cn(
                'max-w-[85%] rounded-xl rounded-tr-sm border border-dashed px-2.5 pb-1.5 pt-1.5 text-[13px] text-gray-900 shadow-sm sm:max-w-[65%] dark:text-gray-50',
                failed ? 'border-red-400/70 bg-red-50/90 dark:bg-red-950/40' : 'border-emerald-500/60 bg-[#d9fdd3]/70 dark:bg-[#005c4b]/60'
              )}
            >
              <p className={cn('mb-1 flex items-center gap-1 text-[11px] font-semibold', failed ? 'text-red-600 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-300')}>
                {failed ? <AlertCircle className="h-3.5 w-3.5" /> : <CalendarClock className="h-3.5 w-3.5" />}
                {failed ? `Not sent — was due ${formatScheduled(s.scheduled_at)}` : sending ? 'Sending now…' : `Scheduled for ${formatScheduled(s.scheduled_at)}`}
              </p>
              {s.kind === 'template' && (
                <p className="mb-0.5 flex items-center gap-1 text-[10px] uppercase tracking-wide opacity-60">
                  <FileText className="h-3 w-3" /> Template · {s.template_name}
                </p>
              )}
              <p className="whitespace-pre-wrap break-words">{s.content}</p>
              {failed && s.error_message && <p className="mt-1 text-[11px] text-red-600 dark:text-red-300">{s.error_message}</p>}
              {!sending && (
                <div className="mt-1.5 flex justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => setEditing(s)}
                    className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-medium text-gray-700 hover:bg-white dark:bg-white/10 dark:text-gray-100 dark:hover:bg-white/20"
                  >
                    <Pencil className="h-3 w-3" /> {failed ? 'Reschedule' : 'Edit'}
                  </button>
                  <button
                    type="button"
                    disabled={busy === s.id}
                    onClick={() => void cancel(s)}
                    className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-medium text-red-600 hover:bg-white disabled:opacity-50 dark:bg-white/10 dark:text-red-300 dark:hover:bg-white/20"
                  >
                    <X className="h-3 w-3" /> {failed ? 'Dismiss' : 'Cancel'}
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
      <ScheduleDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        contact={contact}
        editing={editing}
        onSaved={() => {
          void load();
          onChange();
        }}
      />
    </div>
  );
};

export default ScheduledStrip;
