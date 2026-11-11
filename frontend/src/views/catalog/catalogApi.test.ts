import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/services/api', () => ({ api: {}, accountsService: {} }));
const requestUpgrade = vi.fn();
vi.mock('@/lib/pendingPayment', () => ({ requestUpgrade: (...args: unknown[]) => requestUpgrade(...args) }));

import {
  toCents,
  fromCents,
  formatPrice,
  availabilityLabel,
  isOrderable,
  isHttpUrl,
  describeActionError,
  handleUpgradeError,
  accountLabel,
  CSV_TEMPLATE,
  CSV_COLUMNS,
} from './catalogApi';

const httpError = (status: number, message: string) => ({ response: { status, data: { message } } });

describe('catalogue helpers', () => {
  beforeEach(() => requestUpgrade.mockClear());

  it('converts prices to and from the smallest unit', () => {
    expect(toCents('499')).toBe(49900);
    expect(toCents('1,299.5')).toBe(129950);
    expect(Number.isNaN(toCents('abc'))).toBe(true);
    expect(Number.isNaN(toCents('1.999'))).toBe(true);
    expect(fromCents(129950)).toBe('1299.50');
  });

  it('formats INR prices', () => {
    expect(formatPrice(149900, 'INR')).toContain('1,499.00');
    expect(formatPrice(100, 'ZZZ')).toMatch(/1\.00/);
  });

  it('labels availability and knows what can be ordered', () => {
    expect(availabilityLabel('out of stock')).toBe('Out of stock');
    expect(availabilityLabel(undefined)).toBe('In stock');
    expect(isOrderable('in stock')).toBe(true);
    expect(isOrderable('discontinued')).toBe(false);
  });

  it('accepts only http(s) links', () => {
    expect(isHttpUrl('https://example.com/a.jpg')).toBe(true);
    expect(isHttpUrl('ftp://example.com')).toBe(false);
    expect(isHttpUrl('example.com')).toBe(false);
  });

  it('explains Meta rejections and opens the upgrade dialog on 402', () => {
    expect(describeActionError(httpError(502, 'Failed to connect catalog: API error 100: nope'), 'x').hint).toMatch(/Meta/);
    expect(describeActionError(httpError(409, 'dup'), 'x').hint).toMatch(/SKU/);
    expect(handleUpgradeError(httpError(500, 'boom'))).toBe(false);
    expect(handleUpgradeError(httpError(402, 'Pay first'))).toBe(true);
    expect(requestUpgrade).toHaveBeenCalledWith('Pay first', { force: true });
  });

  it('names WhatsApp numbers', () => {
    expect(accountLabel({ id: '1', name: 'Sales', phone_number: '+91 98765 43210' })).toBe('Sales · +91 98765 43210');
    expect(accountLabel(undefined, 'old')).toBe('old');
  });

  it('ships a CSV template with the documented columns', () => {
    expect(CSV_TEMPLATE.split('\n')[0]).toBe(CSV_COLUMNS.join(','));
    expect(CSV_COLUMNS).toEqual(['sku', 'name', 'description', 'price', 'currency', 'image_url', 'url', 'availability']);
  });
});
