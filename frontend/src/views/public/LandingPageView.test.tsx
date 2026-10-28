import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { LandingPageView } from './LandingPageView';

const renderWithRouter = (ui: React.ReactElement) => {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
};

describe('LandingPageView', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('renders masthead hero with headline, subtitle, and CTA buttons', () => {
    renderWithRouter(<LandingPageView />);

    // Masthead headline & highlights
    expect(
      screen.getByText(/Engage Your Customers on WhatsApp Like Never Before/i)
    ).toBeDefined();

    // CTA buttons
    expect(screen.getAllByRole('link', { name: /get started/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /signup now/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /login/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /register/i }).length).toBeGreaterThan(0);
  });

  it('renders Why Choose section with engagement and conversion cards', () => {
    renderWithRouter(<LandingPageView />);

    expect(screen.getByText(/Why Choose/i)).toBeDefined();
    expect(screen.getByText(/Increased Engagement/i)).toBeDefined();
    expect(screen.getByText(/Higher Conversion Rates/i)).toBeDefined();
    expect(screen.getByText(/24\/7 Customer Support/i)).toBeDefined();
  });

  it('renders Tech Empowerment feature grid', () => {
    renderWithRouter(<LandingPageView />);

    expect(screen.getByText(/Tech Empowerment/i)).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Embedded Signup' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Template Management' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Multiple Phone Numbers' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'WhatsApp Chat' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Bot Replies / Chat Bot' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Manage Contacts' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Realtime Updates' })).toBeDefined();
  });

  it('renders detailed spotlight sections matching wa.onesuit.in', () => {
    renderWithRouter(<LandingPageView />);

    expect(screen.getByRole('heading', { name: 'Campaign Management' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Integrated WhatsApp Chat' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Bot Flow Builder' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Reached to the Customers' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'QR Code Generation' })).toBeDefined();
  });

  it('renders Pricing cards and toggles between monthly and yearly billing', () => {
    renderWithRouter(<LandingPageView />);

    expect(screen.getByText(/Simple and Clear Pricing/i)).toBeDefined();
    expect(screen.getAllByText('Free').length).toBeGreaterThan(0);
    expect(screen.getByText('Basic Plan')).toBeDefined();
    expect(screen.getByText('Advance Plan')).toBeDefined();

    // Default monthly price for Basic Plan
    expect(screen.getByText('₹999.00')).toBeDefined();

    // Toggle to yearly
    const yearlyButton = screen.getByRole('button', { name: /yearly billing/i });
    fireEvent.click(yearlyButton);

    // Shows yearly price
    expect(screen.getByText('₹9,999.00')).toBeDefined();
  });

  it('renders FAQ and opens page dialog modal', () => {
    renderWithRouter(<LandingPageView />);

    expect(screen.getByRole('heading', { name: /Frequently Asked Questions/i })).toBeDefined();
    expect(screen.getByText(/How do I sign up for One Suit\?/i)).toBeDefined();

    // Open Privacy Policy modal from footer
    const privacyButtons = screen.getAllByRole('button', { name: /privacy policy/i });
    fireEvent.click(privacyButtons[0]);

    // Modal dialog title should now be visible
    expect(screen.getByRole('heading', { name: 'Privacy Policy' })).toBeDefined();

    // Close modal
    const closeButtons = screen.getAllByRole('button', { name: /close/i });
    fireEvent.click(closeButtons[0]);
  });
});
