import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadFacebookSDK } from './useEmbeddedSignup';

describe('loadFacebookSDK', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.getElementById('facebook-jssdk')?.remove();
    delete (window as { FB?: unknown }).FB;
  });

  it('stops waiting for an in-flight SDK load that never finishes', async () => {
    vi.useFakeTimers();
    const tag = document.createElement('div');
    tag.id = 'facebook-jssdk';
    document.body.appendChild(tag);

    let done = false;
    void loadFacebookSDK('app', 'v24.0').then(() => (done = true));
    await vi.advanceTimersByTimeAsync(5000);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(11000);
    expect(done).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('resolves as soon as the SDK appears', async () => {
    vi.useFakeTimers();
    const tag = document.createElement('div');
    tag.id = 'facebook-jssdk';
    document.body.appendChild(tag);

    let done = false;
    void loadFacebookSDK('app', 'v24.0').then(() => (done = true));
    (window as { FB?: unknown }).FB = {};
    await vi.advanceTimersByTimeAsync(150);
    expect(done).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
