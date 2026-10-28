import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ConfigurationView } from './ConfigurationView';
import { superAdminService } from '@/services/superAdmin';
import * as brandingService from '@/services/branding';
import { toast } from 'sonner';

vi.mock('@/services/superAdmin', () => ({
  superAdminService: {
    getConfig: vi.fn(),
    updateConfig: vi.fn(),
    uploadLogo: vi.fn(),
    removeLogo: vi.fn(),
    listPlans: vi.fn(),
  },
  NO_PLAN: '',
  LOGO_MAX_BYTES: 512 * 1024,
  LOGO_TYPES: ['image/png', 'image/jpeg', 'image/webp'],
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const mockConfig = {
  platform_name: 'onesuit',
  support_email: 'support@example.com',
  support_phone: '+1 555 000 1111',
  contact_address: '100 Main St',
  website_url: 'https://example.com',
  timezone: 'UTC',
  default_currency: 'USD',
  default_plan_id: '',
  trial_days: 14,
  renewal_reminder_days: 7,
  allow_vendor_signup: true,
  require_email_verification: false,
  maintenance_mode: false,
  maintenance_message: 'Maintenance in progress',
  embedded_signup_enabled: true,
  manual_signup_enabled: true,
  meta_app_id: 'app-12345',
  meta_config_id: 'cfg-67890',
  has_meta_app_secret: true,
};

describe('ConfigurationView - General and Signup Settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(superAdminService.getConfig).mockResolvedValue(mockConfig);
    vi.mocked(superAdminService.listPlans).mockResolvedValue([]);
    vi.spyOn(brandingService, 'useBranding').mockReturnValue({
      platform_name: 'onesuit',
      logo_url: '',
      support_email: 'support@example.com',
      support_phone: '+1 555 000 1111',
      contact_address: '100 Main St',
      website_url: 'https://example.com',
      timezone: 'UTC',
    });
  });

  it('1. Loads configuration and renders general brand & contact fields', async () => {
    render(<ConfigurationView />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('onesuit')).toBeDefined();
      expect(screen.getByDisplayValue('support@example.com')).toBeDefined();
      expect(screen.getByDisplayValue('+1 555 000 1111')).toBeDefined();
      expect(screen.getByDisplayValue('https://example.com')).toBeDefined();
      expect(screen.getByDisplayValue('100 Main St')).toBeDefined();
    });
  });

  it('2. Shows error if software name is cleared and submitted', async () => {
    render(<ConfigurationView />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('onesuit')).toBeDefined();
    });

    const nameInput = screen.getByDisplayValue('onesuit');
    fireEvent.change(nameInput, { target: { value: '   ' } });

    const submitBtn = screen.getByText('Save changes');
    fireEvent.click(submitBtn);

    expect(toast.error).toHaveBeenCalledWith('Software name is required');
  });

  it('3. Shows error if website does not start with http:// or https://', async () => {
    render(<ConfigurationView />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('https://example.com')).toBeDefined();
    });

    const webInput = screen.getByDisplayValue('https://example.com');
    fireEvent.change(webInput, { target: { value: 'ftp://badurl.com' } });

    const submitBtn = screen.getByText('Save changes');
    fireEvent.click(submitBtn);

    expect(toast.error).toHaveBeenCalledWith('Website must start with http:// or https://');
  });

  it('4. Rejects SVG upload and files > 512 KB', async () => {
    const { container } = render(<ConfigurationView />);

    await waitFor(() => {
      expect(screen.getByText('Software Logo')).toBeDefined();
    });

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeDefined();

    // SVG upload
    const svgFile = new File(['<svg></svg>'], 'test.svg', { type: 'image/svg+xml' });
    fireEvent.change(fileInput, { target: { files: [svgFile] } });
    expect(toast.error).toHaveBeenCalledWith(
      'The logo must be a PNG, JPEG, or WebP image. SVG is not allowed.'
    );

    // Oversized PNG (> 512 KB)
    const bigFile = new File([new Uint8Array(513 * 1024)], 'big.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [bigFile] } });
    expect(toast.error).toHaveBeenCalledWith('Logo file must be 512 KB or smaller.');
  });

  it('5. Signup Settings: Shows "Saved — leave blank to keep" and toggles clear secret flag', async () => {
    render(<ConfigurationView />);

    await waitFor(() => {
      expect(screen.getByText('Signup Settings')).toBeDefined();
    });

    const signupTab = screen.getByRole('tab', { name: /signup settings/i });
    fireEvent.mouseDown(signupTab, { button: 0 });
    fireEvent.click(signupTab);

    await waitFor(() => {
      expect(screen.getByText(/Saved — leave blank to keep/i)).toBeDefined();
      expect(screen.getByText('Clear secret')).toBeDefined();
    });

    // Click "Clear secret"
    fireEvent.click(screen.getByText('Clear secret'));

    expect(screen.getByText('Will be removed on save')).toBeDefined();
    expect(screen.getByText('Undo')).toBeDefined();

    // Click Undo
    fireEvent.click(screen.getByText('Undo'));
    expect(screen.getByText(/Saved — leave blank to keep/i)).toBeDefined();
  });

  it('6. Signup Settings: Warning banner shown when Embedded is enabled without IDs', async () => {
    vi.mocked(superAdminService.getConfig).mockResolvedValue({
      ...mockConfig,
      meta_app_id: '',
      meta_config_id: '',
    });

    render(<ConfigurationView />);

    await waitFor(() => {
      expect(screen.getByText('Signup Settings')).toBeDefined();
    });

    const signupTab = screen.getByRole('tab', { name: /signup settings/i });
    fireEvent.mouseDown(signupTab, { button: 0 });
    fireEvent.click(signupTab);

    await waitFor(() => {
      expect(screen.getByText(/Meta App ID or Configuration ID missing/i)).toBeDefined();
    });
  });

  it('7. Signup Settings: Warning banner and block when both methods disabled', async () => {
    vi.mocked(superAdminService.getConfig).mockResolvedValue({
      ...mockConfig,
      embedded_signup_enabled: false,
      manual_signup_enabled: false,
    });

    render(<ConfigurationView />);

    await waitFor(() => {
      expect(screen.getByText('Signup Settings')).toBeDefined();
    });

    const signupTab = screen.getByRole('tab', { name: /signup settings/i });
    fireEvent.mouseDown(signupTab, { button: 0 });
    fireEvent.click(signupTab);

    await waitFor(() => {
      expect(screen.getByText(/Both connection methods cannot be turned off/i)).toBeDefined();
    });
  });
});
