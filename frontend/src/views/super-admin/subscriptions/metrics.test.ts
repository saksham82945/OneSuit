import { describe, it, expect } from 'vitest';
import type { Vendor } from '@/services/superAdmin';
import { DEFAULT_FILTERS, expiryLabel, isSubscriptionRow, matchesFilters, nextRenewalDate, summarize } from './metrics';

const NOW = new Date('2026-11-04T10:00:00').getTime();
const inDays = (n: number) => new Date(NOW + n * 86400000).toISOString();

const client = (over: Partial<Vendor>): Vendor => ({
  id: Math.random().toString(36),
  name: 'Acme',
  slug: 'acme',
  owner_name: 'Asha',
  owner_email: 'asha@acme.test',
  status: 'active',
  plan_id: 'p1',
  plan_name: 'Pro',
  billing_cycle: 'monthly',
  plan_amount: 1000,
  users_count: 1,
  contacts_count: 0,
  created_at: inDays(-100),
  renewal_date: inDays(60),
  ...over,
});

describe('subscription metrics', () => {
  it('summarizes states, expiry windows and MRR', () => {
    const s = summarize(
      [
        client({ plan_amount: 1000 }), // monthly → 1000
        client({ billing_cycle: 'yearly', plan_amount: 12000, renewal_date: inDays(5) }), // → 1000, expiring 7/30
        client({ billing_cycle: 'quarterly', plan_amount: 2700, renewal_date: inDays(20) }), // → 900, expiring 30
        client({ status: 'pending_payment', renewal_date: null }), // awaiting first payment: no MRR
        client({ status: 'trial', plan_id: null, plan_amount: 0 }), // legacy trial
        client({ status: 'suspended', renewal_date: inDays(3) }), // suspended: not expiring, no MRR
        client({ renewal_date: inDays(-2) }), // expired: no MRR
      ],
      NOW
    );
    expect(s).toMatchObject({ active: 3, pendingPayment: 1, trial: 1, suspended: 1, expired: 1, expiring7: 1, expiring30: 2, mrr: 2900, payingClients: 3 });
  });

  it('filters by search, state, plan, cycle and expiry', () => {
    const a = client({ name: 'Bright Foods', renewal_date: inDays(4) });
    const b = client({ name: 'Cobalt', plan_id: 'p2', billing_cycle: 'yearly' });
    const f = DEFAULT_FILTERS;
    expect(matchesFilters(a, { ...f, search: 'bright' }, NOW)).toBe(true);
    expect(matchesFilters(b, { ...f, search: 'bright' }, NOW)).toBe(false);
    expect(matchesFilters(b, { ...f, planId: 'p2', cycle: 'yearly' }, NOW)).toBe(true);
    expect(matchesFilters(a, { ...f, expiry: '7' }, NOW)).toBe(true);
    expect(matchesFilters(b, { ...f, expiry: '30' }, NOW)).toBe(false);
    expect(matchesFilters(b, { ...f, state: 'suspended' }, NOW)).toBe(false);
  });

  it('lists clients with a plan or a non-idle state', () => {
    expect(isSubscriptionRow(client({ plan_id: null }))).toBe(false);
    expect(isSubscriptionRow(client({ plan_id: null, status: 'pending_payment' }))).toBe(true);
    expect(isSubscriptionRow(client({ plan_id: null, status: 'trial' }))).toBe(true);
  });

  it('renews one cycle from the current date, or today once expired', () => {
    expect(nextRenewalDate({ renewal_date: '2026-12-10T00:00:00', billing_cycle: 'quarterly' }, NOW)).toBe('2027-03-10');
    expect(nextRenewalDate({ renewal_date: inDays(-10), billing_cycle: 'monthly' }, NOW)).toBe('2026-12-04');
    expect(nextRenewalDate({ renewal_date: null, billing_cycle: 'yearly' }, NOW)).toBe('2027-11-04');
  });

  it('labels days left', () => {
    expect(expiryLabel(client({ renewal_date: inDays(-3) }), NOW)).toEqual({ text: 'Expired 3 days ago', tone: 'red' });
    expect(expiryLabel(client({ renewal_date: inDays(1) }), NOW).tone).toBe('amber');
    expect(expiryLabel(client({ renewal_date: inDays(15) }), NOW).tone).toBe('yellow');
    expect(expiryLabel(client({ renewal_date: null }), NOW).tone).toBe('muted');
  });
});
