import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_UPGRADE_MESSAGE,
  UPGRADE_PROMPT_COOLDOWN_MS,
  onUpgradeRequest,
  requestUpgrade,
  resetUpgradePromptCooldown,
} from './pendingPayment';

describe('upgrade prompt', () => {
  afterEach(() => {
    vi.useRealTimers();
    resetUpgradePromptCooldown();
  });

  it('shows one prompt for a burst of 402s, then again after the cooldown', () => {
    vi.useFakeTimers();
    const seen: string[] = [];
    const off = onUpgradeRequest((m) => seen.push(m));
    requestUpgrade('Needs a plan.');
    requestUpgrade('Needs a plan.');
    requestUpgrade();
    expect(seen).toEqual(['Needs a plan.']);
    vi.advanceTimersByTime(UPGRADE_PROMPT_COOLDOWN_MS + 1);
    requestUpgrade();
    expect(seen).toEqual(['Needs a plan.', DEFAULT_UPGRADE_MESSAGE]);
    off();
  });

  it('always opens for a click (force)', () => {
    const seen: string[] = [];
    const off = onUpgradeRequest((m) => seen.push(m));
    requestUpgrade('a');
    requestUpgrade('b', { force: true });
    expect(seen).toEqual(['a', 'b']);
    off();
    requestUpgrade('c', { force: true });
    expect(seen).toEqual(['a', 'b']);
  });
});
