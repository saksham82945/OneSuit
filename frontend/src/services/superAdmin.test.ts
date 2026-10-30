import { describe, expect, it } from 'vitest';
import { cyclePrice, formatPrice, isInsideClient, subscriptionState } from './superAdmin';

describe('plan billing cycles', () => {
  const plan = { price: 1000, interval: 'monthly' as const, quarterly_discount: 5, half_yearly_discount: 10, yearly_discount: 20 };

  it('applies each cycle offer like the backend', () => {
    expect(cyclePrice(plan, 'monthly')).toMatchObject({ total: 1000, discount: 0, saving: 0 });
    expect(cyclePrice(plan, 'quarterly')).toMatchObject({ full: 3000, total: 2850, saving: 150 });
    expect(cyclePrice(plan, 'half_yearly').total).toBe(5400);
    expect(cyclePrice(plan, 'yearly')).toMatchObject({ total: 9600, perMonth: 800 });
  });

  it('spreads older yearly-priced plans over 12 months', () => {
    expect(cyclePrice({ price: 12000, interval: 'yearly' }, 'monthly').total).toBe(1000);
  });

  it('formats prices in rupees', () => {
    expect(formatPrice(9600)).toContain('₹');
  });
});

describe('subscriptionState', () => {
  const future = new Date(Date.now() + 86400000 * 10).toISOString();
  const past = new Date(Date.now() - 86400000).toISOString();
  it('labels clients active, trial, idle, expired or suspended', () => {
    expect(subscriptionState({ status: 'active', plan_id: 'p', renewal_date: future })).toBe('active');
    expect(subscriptionState({ status: 'trial', plan_id: 'p', renewal_date: future })).toBe('trial');
    expect(subscriptionState({ status: 'active', plan_id: null, renewal_date: null })).toBe('idle');
    expect(subscriptionState({ status: 'active', plan_id: 'p', renewal_date: past })).toBe('expired');
    expect(subscriptionState({ status: 'suspended', plan_id: 'p', renewal_date: past })).toBe('suspended');
  });
});

describe('isInsideClient', () => {
  it('ignores a leftover marker when the super admin is back in their own account', () => {
    localStorage.setItem('super_admin_return_org', 'own-org');
    expect(isInsideClient({ is_super_admin: true, organization_id: 'own-org' })).toBe(false);
    expect(isInsideClient({ is_super_admin: true, organization_id: 'client-org' })).toBe(true);
    expect(isInsideClient({ is_super_admin: false, organization_id: 'client-org' })).toBe(false);
    localStorage.removeItem('super_admin_return_org');
    expect(isInsideClient({ is_super_admin: true, organization_id: 'client-org' })).toBe(false);
  });
});
