import React, { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { accountsService } from '@/services/api';
import { readData } from '@/services/response';
import { useAuthStore } from '@/stores/auth';
import { isInsideClient } from '@/services/superAdmin';
import { cn } from '@/lib/utils';

// "Connect WhatsApp with Facebook": opens Meta's hosted WhatsApp onboarding
// page. The super admin sets the link and can hide the button for everyone else
// (Configuration → Signup Settings).

interface ConnectConfig {
  connect_button_visible?: boolean;
  connect_url?: string;
  manual_enabled?: boolean;
}

let configPromise: Promise<ConnectConfig | null> | null = null;

function loadConnectConfig(): Promise<ConnectConfig | null> {
  if (!configPromise) {
    configPromise = accountsService
      .getEmbeddedConfig()
      .then((res) => readData<ConnectConfig>(res) ?? null)
      .catch(() => {
        configPromise = null; // try again next time
        return null;
      });
  }
  return configPromise;
}

/** Forget the cached settings, e.g. after the super admin saves Configuration. */
export function refreshConnectWhatsAppConfig() {
  configPromise = null;
}

export function useConnectWhatsApp() {
  const { user, hasPermission } = useAuthStore();
  const [config, setConfig] = useState<ConnectConfig | null>(null);
  useEffect(() => {
    let alive = true;
    void loadConnectConfig().then((c) => alive && setConfig(c));
    return () => {
      alive = false;
    };
  }, [user?.id]);
  // The super admin connects numbers only from inside a client's account.
  const allowed = user?.is_super_admin ? isInsideClient(user) : hasPermission('accounts', 'write');
  return {
    visible: Boolean(allowed && config?.connect_button_visible && config.connect_url),
    url: config?.connect_url ?? '',
    /** Manual setup (own Facebook App details) is allowed for this user. */
    manualVisible: Boolean(allowed && config?.manual_enabled),
  };
}

export const FacebookIcon: React.FC<{ className?: string }> = ({ className = 'h-4 w-4' }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M24 12.07C24 5.41 18.63 0 12 0S0 5.41 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z" />
  </svg>
);

const sizes = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
  md: 'h-9 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-14 w-full max-w-md px-8 text-base gap-2.5 rounded-xl font-semibold',
};

export const ConnectWhatsAppButton: React.FC<{ size?: keyof typeof sizes; className?: string; label?: string }> = ({
  size = 'sm',
  className,
  label = 'Connect WhatsApp with Facebook',
}) => {
  const { visible, url } = useConnectWhatsApp();
  if (!visible) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex shrink-0 items-center justify-center whitespace-nowrap bg-[#1877F2] font-medium text-white shadow-sm shadow-blue-500/20 transition-colors hover:bg-[#166fe5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400',
        sizes[size],
        className
      )}
      title="Opens Facebook to connect your WhatsApp Business number"
    >
      <FacebookIcon className={size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'} />
      {label}
      <ExternalLink className={size === 'lg' ? 'h-4 w-4 opacity-80' : 'h-3.5 w-3.5 opacity-80'} />
    </a>
  );
};
