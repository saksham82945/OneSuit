import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { CHECKOUT_PATH, onUpgradeRequest } from '@/lib/pendingPayment';

/**
 * "This needs a paid plan" notice for exploring (unpaid) workspaces. A small
 * toast with an Upgrade button — no big pop-up. Raised when someone tries to
 * connect a number, send a message, start a campaign or run an ad
 * (services/api.ts) or by buttons that check `pendingPayment` first. The page's
 * always-visible "You're exploring" banner covers the rest.
 */
export const UpgradeDialog: React.FC = () => {
  const navigate = useNavigate();

  useEffect(
    () =>
      onUpgradeRequest((text) => {
        // Pages usually toast the same API error; keep only this one.
        const dropDuplicates = () =>
          toast
            .getToasts()
            .filter((t) => 'title' in t && t.title === text)
            .forEach((t) => toast.dismiss(t.id));
        setTimeout(dropDuplicates, 100);
        toast.info('Upgrade to start using this', {
          id: 'upgrade-needed',
          description: 'Connecting your number, sending messages, campaigns and ads start once your plan is paid.',
          duration: 6000,
          action: { label: 'Upgrade', onClick: () => navigate(CHECKOUT_PATH) },
        });
      }),
    [navigate]
  );

  return null;
};

export default UpgradeDialog;
