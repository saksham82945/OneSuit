// Plain-language labels for the values Meta returns in GET /api/accounts/{id}/health.

export type Tone = 'good' | 'warn' | 'bad' | 'neutral';

export interface Described {
  label: string;
  tone: Tone;
  hint: string;
}

/** health_status.can_send_message: AVAILABLE, LIMITED or BLOCKED. */
export function describeSendHealth(value?: string): Omit<Described, 'hint'> {
  switch ((value || '').toUpperCase()) {
    case 'AVAILABLE':
      return { label: 'Can send', tone: 'good' };
    case 'LIMITED':
      return { label: 'Limited', tone: 'warn' };
    case 'BLOCKED':
      return { label: 'Blocked', tone: 'bad' };
    default:
      return { label: 'Unknown', tone: 'neutral' };
  }
}

/** The phone number's quality_rating: GREEN, YELLOW, RED (or UNKNOWN / NA). */
export function describeQuality(value?: string): Described {
  switch ((value || '').toUpperCase()) {
    case 'GREEN':
      return { label: 'High', tone: 'good', hint: 'Recipients rate your messages well.' };
    case 'YELLOW':
      return { label: 'Medium', tone: 'warn', hint: 'Some recipients block or report you. Review recent templates.' };
    case 'RED':
      return { label: 'Low', tone: 'bad', hint: 'Many blocks or reports. Your messaging limit may drop.' };
    default:
      return { label: 'Not rated yet', tone: 'neutral', hint: 'Meta rates a number after it sends messages.' };
  }
}

/** messaging_limit_tier, e.g. TIER_250, TIER_1K, TIER_100K, TIER_UNLIMITED. */
export function describeMessagingTier(value?: string): Omit<Described, 'tone'> {
  const tier = (value || '').toUpperCase();
  if (tier === 'TIER_UNLIMITED') {
    return { label: 'Unlimited', hint: 'No daily cap on business-initiated conversations.' };
  }
  const m = /^TIER_(\d+)(K)?$/.exec(tier);
  if (m) {
    const n = Number(m[1]) * (m[2] ? 1000 : 1);
    return {
      label: `${n.toLocaleString('en-US')} / day`,
      hint: 'Unique customers you can start conversations with in 24 hours.',
    };
  }
  return { label: 'Not available', hint: 'Meta has not reported a messaging limit for this number.' };
}
