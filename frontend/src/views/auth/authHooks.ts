import type React from 'react';
import { useCallback, useState } from 'react';
import { usePublicSite, type PublicPageLink } from '@/services/siteContent';

// Hooks shared by the sign-in, sign-up, invite and demo pages.

/** Tracks Caps Lock while a password field has focus. Spread `handlers` on the input. */
export function useCapsLock() {
  const [on, setOn] = useState(false);
  const check = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (typeof e.getModifierState === 'function') setOn(e.getModifierState('CapsLock'));
  }, []);
  const handlers = {
    onKeyDown: check,
    onKeyUp: check,
    onBlur: () => setOn(false),
  };
  return { capsLock: on, handlers };
}

/** The published terms and privacy pages (CMS, /p/:slug), when they exist. */
export function useLegalPages(): { terms?: PublicPageLink; privacy?: PublicPageLink } {
  const { pages } = usePublicSite();
  return {
    terms: pages.find((p) => /terms|conditions/i.test(p.slug)),
    privacy: pages.find((p) => /privacy/i.test(p.slug)),
  };
}
