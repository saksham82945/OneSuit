import { useEffect, useSyncExternalStore } from 'react';
import { api } from '@/services/api';
import { readData } from '@/services/response';

/** GET /public/branding: the platform's own name, logo and contact details (no login needed). */
export interface Branding {
  platform_name: string;
  /** '' when no logo is set, else a URL such as /api/public/branding/logo?v=123 */
  logo_url: string;
  support_email: string;
  support_phone: string;
  contact_address: string;
  website_url: string;
  /** IANA time zone, e.g. "Asia/Kolkata" */
  timezone: string;
}

export const DEFAULT_PLATFORM_NAME = 'onesuit';

export const DEFAULT_BRANDING: Branding = {
  platform_name: DEFAULT_PLATFORM_NAME,
  logo_url: '',
  support_email: '',
  support_phone: '',
  contact_address: '',
  website_url: '',
  timezone: '',
};

const STORAGE_KEY = 'platform_branding';

const str = (v: unknown) => (typeof v === 'string' ? v : '');

function normalize(raw: Partial<Branding> | null | undefined): Branding {
  return {
    platform_name: str(raw?.platform_name).trim() || DEFAULT_PLATFORM_NAME,
    logo_url: str(raw?.logo_url),
    support_email: str(raw?.support_email),
    support_phone: str(raw?.support_phone),
    contact_address: str(raw?.contact_address),
    website_url: str(raw?.website_url),
    timezone: str(raw?.timezone),
  };
}

function readStored(): Branding | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? normalize(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

// Module cache: the stored copy paints the right name instantly after a reload,
// and one network fetch per page load keeps it fresh.
let current: Branding = readStored() ?? DEFAULT_BRANDING;
let fetched = false;
let inflight: Promise<Branding> | null = null;
const listeners = new Set<() => void>();

function updateFavicon(logoUrl: string) {
  try {
    let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    if (logoUrl) {
      link.href = resolveAssetUrl(logoUrl);
    } else {
      link.href = '/favicon.svg';
    }
  } catch {
    // ignore in non-browser env
  }
}

/** Put a branding object in the cache (e.g. one returned by the logo endpoints). */
export function setBranding(raw: Partial<Branding>) {
  current = normalize(raw);
  fetched = true;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Storage unavailable: the module cache still works for this page load.
  }
  updateFavicon(current.logo_url);
  listeners.forEach((l) => l());
}

/** Fetch the branding again (call after the platform configuration changes). */
export function refreshBranding(): Promise<Branding> {
  if (inflight) return inflight;
  inflight = api
    .get('/public/branding')
    .then((res) => {
      setBranding(readData<Partial<Branding>>(res) ?? {});
      return current;
    })
    .catch(() => {
      // Keep whatever we have; try again on the next mount.
      return current;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Root-relative logo URLs need the app's base path when it is served under one. */
export function resolveAssetUrl(url: string): string {
  if (!url || !url.startsWith('/')) return url;
  const basePath = ((window as Window & { __BASE_PATH__?: string }).__BASE_PATH__ ?? '').replace(/\/$/, '');
  return basePath && !url.startsWith(basePath + '/') ? basePath + url : url;
}

/** The platform's branding; loaded once per page load and shared by every caller. */
export function useBranding(): Branding {
  const branding = useSyncExternalStore(subscribe, () => current);
  useEffect(() => {
    if (!fetched) void refreshBranding();
  }, []);
  return branding;
}

/**
 * Sets `document.title` to "<page> · <platform name>" (or just the name) while
 * mounted, and restores the previous title after.
 */
export function useBrandedTitle(page?: string) {
  const { platform_name } = useBranding();
  const title = page ? `${page} · ${platform_name}` : platform_name;
  useEffect(() => {
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
