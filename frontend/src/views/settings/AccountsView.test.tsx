import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import type { AxiosResponse } from 'axios';
import { AccountsView } from './AccountsView';
import { accountsService } from '@/services/api';
import * as brandingService from '@/services/branding';

vi.mock('@/services/api', () => ({
  accountsService: {
    list: vi.fn(),
    getEmbeddedConfig: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    testConnection: vi.fn(),
    exchangeToken: vi.fn(),
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string) => k,
  }),
}));

const mockAxiosRes = <T,>(data: T): AxiosResponse<T> =>
  ({
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {} as AxiosResponse['config'],
  });

describe('AccountsView - Signup Settings Combinations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(accountsService.list).mockResolvedValue(
      mockAxiosRes({ status: 'success', data: { accounts: [] } })
    );
    vi.spyOn(brandingService, 'useBranding').mockReturnValue({
      platform_name: 'Acme Brand',
      logo_url: '',
      support_email: 'help@acme.com',
      support_phone: '+1 555 123 4567',
      contact_address: '123 Market St',
      website_url: 'https://acme.com',
      timezone: 'UTC',
    });
  });

  it('1. Both methods available: shows both "Connect with Facebook" and "Enter details manually"', async () => {
    vi.mocked(accountsService.getEmbeddedConfig).mockResolvedValue(
      mockAxiosRes({
        status: 'success',
        data: {
          embedded_enabled: true,
          manual_enabled: true,
          whatsapp_app_id: 'app-123',
          whatsapp_config_id: 'cfg-456',
        },
      })
    );

    render(
      <BrowserRouter>
        <AccountsView />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Connect with Facebook')).toBeDefined();
      expect(screen.getByText('Enter details manually')).toBeDefined();
    });
  });

  it('2. Embedded only: shows "Connect with Facebook" only', async () => {
    vi.mocked(accountsService.getEmbeddedConfig).mockResolvedValue(
      mockAxiosRes({
        status: 'success',
        data: {
          embedded_enabled: true,
          manual_enabled: false,
          whatsapp_app_id: 'app-123',
          whatsapp_config_id: 'cfg-456',
        },
      })
    );

    render(
      <BrowserRouter>
        <AccountsView />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Connect with Facebook')).toBeDefined();
      expect(screen.queryByText('Enter details manually')).toBeNull();
    });
  });

  it('3. Manual only: shows "Enter details manually" only', async () => {
    vi.mocked(accountsService.getEmbeddedConfig).mockResolvedValue(
      mockAxiosRes({
        status: 'success',
        data: {
          embedded_enabled: false,
          manual_enabled: true,
        },
      })
    );

    render(
      <BrowserRouter>
        <AccountsView />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Enter details manually')).toBeDefined();
      expect(screen.queryByText('Connect with Facebook')).toBeNull();
    });
  });

  it('4. Neither available: shows support contact note with email and phone', async () => {
    vi.mocked(accountsService.getEmbeddedConfig).mockResolvedValue(
      mockAxiosRes({
        status: 'success',
        data: {
          embedded_enabled: false,
          manual_enabled: false,
        },
      })
    );

    render(
      <BrowserRouter>
        <AccountsView />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/WhatsApp number connection is currently closed/i)).toBeDefined();
      expect(screen.getByText('help@acme.com')).toBeDefined();
      expect(screen.getByText('+1 555 123 4567')).toBeDefined();
      expect(screen.queryByText('Connect with Facebook')).toBeNull();
      expect(screen.queryByText('Enter details manually')).toBeNull();
    });
  });

  it('5. Clean error handling when Facebook login is attempted without FB SDK', async () => {
    vi.mocked(accountsService.getEmbeddedConfig).mockResolvedValue(
      mockAxiosRes({
        status: 'success',
        data: {
          embedded_enabled: true,
          manual_enabled: true,
          whatsapp_app_id: 'app-123',
          whatsapp_config_id: 'cfg-456',
        },
      })
    );

    render(
      <BrowserRouter>
        <AccountsView />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Connect with Facebook')).toBeDefined();
    });

    const fbBtn = screen.getByText('Connect with Facebook');
    fireEvent.click(fbBtn);

    // Clicking should handle missing window.FB cleanly without crash
    await waitFor(() => {
      expect(screen.getByText('Connect with Facebook')).toBeDefined();
    });
  });
});
