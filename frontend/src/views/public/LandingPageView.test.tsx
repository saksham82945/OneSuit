import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';

const plans = [
  { id: 'p1', name: 'Free', description: '', price: 0, currency: 'INR', interval: 'monthly', max_users: 1, max_contacts: 50, max_accounts: 1, features: [] },
  { id: 'p2', name: 'Basic Plan', description: '', price: 1000, currency: 'INR', interval: 'monthly', max_users: 5, max_contacts: 5000, max_accounts: 1, features: ['Campaigns'], yearly_discount: 20 },
  { id: 'p3', name: 'Advance Plan', description: '', price: 2500, currency: 'INR', interval: 'monthly', max_users: -1, max_contacts: -1, max_accounts: -1, features: [] },
];

vi.mock('@/services/api', () => ({
  api: {
    get: vi.fn((url: string) => {
      if (url === '/public/plans') return Promise.resolve({ data: { status: 'success', data: { plans } } });
      if (url === '/public/site-content')
        return Promise.resolve({
          data: {
            status: 'success',
            data: {
              content: { hero_title: 'Grow faster on WhatsApp', instagram_url: 'https://instagram.com/onesuit', whatsapp_number: '919876543210' },
              pages: [{ title: 'Privacy Policy', slug: 'privacy-policy' }],
            },
          },
        });
      return Promise.reject(new Error('not found'));
    }),
  },
}));

import { LandingPageView } from './LandingPageView';

const renderPage = () => render(<BrowserRouter><LandingPageView /></BrowserRouter>);

describe('LandingPageView', () => {
  beforeEach(() => sessionStorage.clear());

  it('shows the super admin hero text, buttons and no Flow Builder menu item', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText(/Grow faster on WhatsApp/i)).toBeDefined());
    expect(screen.getAllByRole('link', { name: /get started/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /login|log in/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /register/i }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /flow builder/i })).toBeNull();
  });

  it('shows the logo only once in the header', () => {
    renderPage();
    const header = document.querySelector('header')!;
    expect(header.querySelectorAll('img').length).toBe(1);
  });

  it('shows plans from the super admin with -1 as Unlimited and yearly offers', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Advance Plan')).toBeDefined());
    expect(screen.getAllByText('Unlimited').length).toBeGreaterThan(0);
    expect(screen.getByText('₹1,000')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /^yearly/i }));
    expect(screen.getByText('₹9,600')).toBeDefined();
  });

  it('links published pages, social media and WhatsApp', async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByRole('link', { name: 'Privacy Policy' }).length).toBeGreaterThan(0));
    expect(screen.getByRole('link', { name: 'Instagram' }).getAttribute('href')).toBe('https://instagram.com/onesuit');
    expect(screen.getByRole('link', { name: /chat on whatsapp/i }).getAttribute('href')).toBe('https://wa.me/919876543210');
  });
});
