// Explore mode: a workspace that signed up for a paid plan and hasn't paid yet
// can open every page, but changes (connect a number, send, run an ad...) need
// a paid plan; the backend answers 402 to them. Those 402s, and buttons that
// check `pendingPayment` before acting, open one global Upgrade dialog through
// this tiny emitter.

export const CHECKOUT_PATH = '/billing/checkout';

export const DEFAULT_UPGRADE_MESSAGE = "Upgrade your plan to use this — you're exploring OneSuit.";

type UpgradeListener = (message: string) => void;

const listeners = new Set<UpgradeListener>();
let lastShownAt = 0;
/** Several requests can fail together: show the dialog at most once per this many ms. */
export const UPGRADE_PROMPT_COOLDOWN_MS = 3000;

/**
 * Opens the Upgrade dialog. Automatic prompts (API 402s) are ignored while one
 * was shown in the last few seconds; `force` (a button the user just clicked)
 * always opens it.
 */
export function requestUpgrade(message?: string, opts: { force?: boolean } = {}) {
  const now = Date.now();
  if (!opts.force && now - lastShownAt < UPGRADE_PROMPT_COOLDOWN_MS) return;
  lastShownAt = now;
  const text = message?.trim() || DEFAULT_UPGRADE_MESSAGE;
  listeners.forEach((l) => l(text));
}

/** Subscribes to upgrade requests; returns the unsubscribe function. */
export function onUpgradeRequest(listener: UpgradeListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test helper: forget the cooldown. */
export function resetUpgradePromptCooldown() {
  lastShownAt = 0;
}
