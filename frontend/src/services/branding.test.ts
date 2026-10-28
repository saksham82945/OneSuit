import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_PLATFORM_NAME,
  DEFAULT_BRANDING,
  setBranding,
  resolveAssetUrl,
} from './branding';

describe('Branding Service', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('should default to onesuit platform name', () => {
    expect(DEFAULT_PLATFORM_NAME).toBe('onesuit');
    expect(DEFAULT_BRANDING.platform_name).toBe('onesuit');
  });

  it('should resolve asset URLs with and without base path', () => {
    // Normal root-relative url
    expect(resolveAssetUrl('/images/logo.png')).toBe('/images/logo.png');

    // External URL should be untouched
    expect(resolveAssetUrl('https://example.com/logo.png')).toBe('https://example.com/logo.png');

    // Empty URL should be untouched
    expect(resolveAssetUrl('')).toBe('');

    // When base path is configured
    (window as unknown as { __BASE_PATH__: string }).__BASE_PATH__ = '/app';
    expect(resolveAssetUrl('/images/logo.png')).toBe('/app/images/logo.png');

    // Already prefixed
    expect(resolveAssetUrl('/app/images/logo.png')).toBe('/app/images/logo.png');

    // Clean up
    delete (window as unknown as { __BASE_PATH__?: string }).__BASE_PATH__;
  });

  it('should set and normalize custom branding', () => {
    setBranding({
      platform_name: 'Custom Suit',
      support_email: 'support@customsuit.com',
      website_url: 'https://customsuit.com',
    });

    const stored = JSON.parse(sessionStorage.getItem('platform_branding') || '{}');
    expect(stored.platform_name).toBe('Custom Suit');
    expect(stored.support_email).toBe('support@customsuit.com');
    expect(stored.website_url).toBe('https://customsuit.com');

    // Reset back to onesuit
    setBranding({ platform_name: 'onesuit' });
  });
});
