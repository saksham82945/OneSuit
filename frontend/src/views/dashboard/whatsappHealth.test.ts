import { describe, expect, it } from 'vitest';
import { describeMessagingTier, describeQuality, describeSendHealth } from './whatsappHealth';

describe('whatsapp health labels', () => {
  it('maps quality ratings', () => {
    expect(describeQuality('GREEN')).toMatchObject({ label: 'High', tone: 'good' });
    expect(describeQuality('yellow')).toMatchObject({ label: 'Medium', tone: 'warn' });
    expect(describeQuality('RED')).toMatchObject({ label: 'Low', tone: 'bad' });
    expect(describeQuality(undefined)).toMatchObject({ label: 'Not rated yet', tone: 'neutral' });
  });

  it('maps messaging tiers without inventing numbers', () => {
    expect(describeMessagingTier('TIER_250').label).toBe('250 / day');
    expect(describeMessagingTier('TIER_1K').label).toBe('1,000 / day');
    expect(describeMessagingTier('TIER_100K').label).toBe('100,000 / day');
    expect(describeMessagingTier('TIER_UNLIMITED').label).toBe('Unlimited');
    expect(describeMessagingTier('').label).toBe('Not available');
  });

  it('maps send health', () => {
    expect(describeSendHealth('AVAILABLE').tone).toBe('good');
    expect(describeSendHealth('BLOCKED').tone).toBe('bad');
    expect(describeSendHealth('').label).toBe('Unknown');
  });
});
