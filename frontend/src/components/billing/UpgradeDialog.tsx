import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CHECKOUT_PATH, onUpgradeRequest } from '@/lib/pendingPayment';

/**
 * The one global "this needs a paid plan" dialog. Opened by a 402 from the API
 * (services/api.ts) or by buttons that check `pendingPayment` first.
 */
export const UpgradeDialog: React.FC = () => {
  const navigate = useNavigate();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(
    () =>
      onUpgradeRequest((text) => {
        setMessage(text);
        // Pages usually toast the API error too; the dialog already says it.
        // Not at 0ms: the Toaster adds new toasts on a timeout.
        const dropDuplicates = () =>
          toast
            .getToasts()
            .filter((t) => 'title' in t && t.title === text)
            .forEach((t) => toast.dismiss(t.id));
        setTimeout(dropDuplicates, 100);
        setTimeout(dropDuplicates, 500);
      }),
    []
  );

  const close = () => setMessage(null);

  return (
    <Dialog open={message !== null} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300 light:bg-emerald-100 light:text-emerald-700 sm:mx-0">
            <Sparkles className="h-5 w-5" />
          </span>
          <DialogTitle className="pt-2">Upgrade to start using this</DialogTitle>
          <DialogDescription>
            {message} You can look around everything for free — connecting your WhatsApp number, sending messages,
            running campaigns or ads and other changes start once your plan is paid.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={close}>
            Keep exploring
          </Button>
          <Button
            className="bg-emerald-600 text-white hover:bg-emerald-500"
            onClick={() => {
              close();
              navigate(CHECKOUT_PATH);
            }}
          >
            Upgrade / Pay now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default UpgradeDialog;
