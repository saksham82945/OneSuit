import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { accountsService } from '@/services/api';
import { readData } from '@/services/response';

// WhatsApp Embedded Signup ("Connect with Facebook"): loads the Facebook SDK,
// opens Meta's signup popup and exchanges the returned code for a connected
// WhatsApp number. Shared by Settings → Accounts and the Embedded Signup page.

export interface EmbeddedSignupConfig {
  whatsapp_app_id?: string;
  whatsapp_config_id?: string;
  whatsapp_api_version?: string;
  embedded_enabled: boolean;
  manual_enabled: boolean;
  embedded_label?: string;
  manual_label?: string;
}

export type EmbeddedSignupResult = { status: 'connected' | 'pending_registration'; pin?: string; name?: string };

const errorMessage = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;

function loadFacebookSDK(appId: string, version: string): Promise<void> {
  return new Promise((resolve) => {
    if (window.FB) return resolve();
    if (document.getElementById('facebook-jssdk')) {
      const wait = setInterval(() => {
        if (window.FB) {
          clearInterval(wait);
          resolve();
        }
      }, 100);
      return;
    }
    const script = document.createElement('script');
    script.id = 'facebook-jssdk';
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      window.FB?.init({ appId, cookie: true, xfbml: false, version });
      resolve();
    };
    script.onerror = () => resolve(); // handled by the caller's "SDK not loaded" check
    document.body.appendChild(script);
  });
}

export function useEmbeddedSignup(onConnected?: (result: EmbeddedSignupResult) => void) {
  const [config, setConfig] = useState<EmbeddedSignupConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  // Meta reports the chosen phone number and WABA through a window message, not the login response.
  const session = useRef<{ phone_number_id?: string; waba_id?: string }>({});

  useEffect(() => {
    let cancelled = false;
    accountsService
      .getEmbeddedConfig()
      .then((res) => {
        const cfg = readData<EmbeddedSignupConfig>(res);
        if (cancelled || !cfg) return;
        setConfig(cfg);
        if (cfg.embedded_enabled && cfg.whatsapp_app_id) {
          loadFacebookSDK(cfg.whatsapp_app_id, cfg.whatsapp_api_version || 'v24.0');
        }
      })
      .catch(() => !cancelled && setConfig(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!/^https:\/\/(www|web)\.facebook\.com$/.test(event.origin)) return;
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data?.type === 'WA_EMBEDDED_SIGNUP' && data.data) {
          session.current = { phone_number_id: data.data.phone_number_id, waba_id: data.data.waba_id };
        }
      } catch {
        // not a message for us
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const embeddedAvailable = Boolean(config?.embedded_enabled && config.whatsapp_app_id && config.whatsapp_config_id);
  const manualAvailable = Boolean(config?.manual_enabled);

  const launch = useCallback(
    async (name?: string) => {
      if (!config?.whatsapp_app_id || !config.whatsapp_config_id) {
        toast.error('Connect with Facebook isn’t set up yet. Please contact support.');
        return;
      }
      setConnecting(true);
      session.current = {};
      await loadFacebookSDK(config.whatsapp_app_id, config.whatsapp_api_version || 'v24.0');
      if (!window.FB) {
        setConnecting(false);
        toast.error('Facebook could not be loaded. Turn off ad-blockers and try again.');
        return;
      }
      window.FB.login(
        async (response) => {
          const code = response.authResponse?.code;
          if (!code) {
            setConnecting(false);
            if (response.error) toast.error(`Facebook error: ${response.error.message || 'unknown error'}`);
            else toast.info('Facebook signup was cancelled');
            return;
          }
          try {
            const res = await accountsService.exchangeToken({
              code,
              phone_id: session.current.phone_number_id ?? response.authResponse?.phone_number_id,
              waba_id: session.current.waba_id ?? response.authResponse?.waba_id,
              name: name?.trim() || undefined,
            });
            const data = res.data?.data;
            const result: EmbeddedSignupResult = {
              status: data?.account?.status === 'pending_registration' ? 'pending_registration' : 'connected',
              pin: data?.pin,
              name: data?.account?.name,
            };
            if (result.status === 'pending_registration') toast.warning('Number added. Finish phone registration to start sending.');
            else toast.success('WhatsApp number connected');
            onConnected?.(result);
          } catch (err) {
            toast.error(errorMessage(err, 'Could not connect your WhatsApp number'));
          } finally {
            setConnecting(false);
          }
        },
        {
          config_id: config.whatsapp_config_id,
          response_type: 'code',
          override_default_response_type: true,
          extras: { setup: {}, featureType: 'whatsapp_business_app_onboarding', sessionInfoVersion: '3', version: 'v3' },
        }
      );
    },
    [config, onConnected]
  );

  return {
    config,
    loading,
    connecting,
    embeddedAvailable,
    manualAvailable,
    embeddedLabel: config?.embedded_label || 'Connect with Facebook',
    manualLabel: config?.manual_label || 'Configure WABA API',
    launch,
  };
}
