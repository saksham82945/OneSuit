import { toast } from 'sonner';
import { readData } from '@/services/response';
import { type Contact, type Message, getErrorMessage } from '../chatUtils';
import { composeService } from './richUtils';

type OnSent = (m: Message | null, preview: string) => void;

/** Sends a chat message and reports the result; returns true on success. */
export const sendRich = async (contact: Contact, payload: Record<string, unknown>, preview: string, onSent: OnSent) => {
  try {
    const res = await composeService.send(contact.id, { whatsapp_account: contact.whatsapp_account, ...payload });
    const msg = readData<Message>(res);
    onSent(msg?.id ? msg : null, preview);
    return true;
  } catch (err) {
    // 402 (explore mode) is handled app-wide by the Upgrade dialog.
    if ((err as { response?: { status?: number } })?.response?.status !== 402) {
      toast.error(getErrorMessage(err, 'Failed to send'));
    }
    return false;
  }
};
