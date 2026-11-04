import { describe, expect, it } from 'vitest';
import { formatRelative, getInitials, inboxParams, isWindowOpen, tagHex, windowTimeLeft } from './chatUtils';

describe('inboxParams', () => {
  it('maps the inbox views onto the contact list filters', () => {
    const base = { showAll: false, labels: [], search: '' };
    expect(inboxParams({ ...base, view: 'all' })).toMatchObject({ has_messages: 'true', include_counts: 'true' });
    expect(inboxParams({ ...base, view: 'mine' }).assigned).toBe('me');
    expect(inboxParams({ ...base, view: 'unassigned' }).assigned).toBe('unassigned');
    expect(inboxParams({ ...base, view: 'others' }).assigned).toBe('others');
    expect(inboxParams({ ...base, view: 'unread' }).unread).toBe('true');
    expect(inboxParams({ ...base, view: 'open' }).window).toBe('open');
    expect(inboxParams({ ...base, view: 'expired' }).window).toBe('expired');
  });

  it('Show all drops the conversations-only filter; labels and search pass through', () => {
    const p = inboxParams({ view: 'all', showAll: true, labels: ['Hot', 'In Future'], search: ' +9198 ' });
    expect(p.has_messages).toBeUndefined();
    expect(p.tags).toBe('Hot,In Future');
    expect(p.search).toBe('9198');
  });
});

describe('chat formatting helpers', () => {
  const now = new Date('2026-11-04T12:00:00').getTime();

  it('formats relative last-message times', () => {
    expect(formatRelative(new Date(now - 20_000).toISOString(), now)).toBe('now');
    expect(formatRelative(new Date(now - 5 * 60_000).toISOString(), now)).toBe('5m');
    expect(formatRelative(new Date(now - 3 * 3600_000).toISOString(), now)).toBe('3h');
    expect(formatRelative(new Date('2026-11-03T09:00:00').toISOString(), now)).toBe('Yesterday');
    expect(formatRelative(null, now)).toBe('');
  });

  it('tracks the 24-hour reply window', () => {
    const recent = new Date(now - 2 * 3600_000).toISOString();
    const old = new Date(now - 30 * 3600_000).toISOString();
    expect(isWindowOpen({ last_inbound_at: recent }, now)).toBe(true);
    expect(isWindowOpen({ last_inbound_at: old, service_window_open: true }, now)).toBe(false);
    expect(isWindowOpen({ last_inbound_at: null, service_window_open: false }, now)).toBe(false);
    expect(windowTimeLeft({ last_inbound_at: recent }, now)).toBe('22h 0m');
    expect(windowTimeLeft({ last_inbound_at: old }, now)).toBe('');
  });

  it('builds initials and tag colours', () => {
    expect(getInitials('Asha Verma')).toBe('AV');
    expect(getInitials('Ravi')).toBe('RA');
    expect(getInitials('+91 98')).toBe('99');
    expect(tagHex('red')).toBe('#ef4444');
    expect(tagHex('#123456')).toBe('#123456');
    expect(tagHex(undefined)).toBe('#6b7280');
  });
});
