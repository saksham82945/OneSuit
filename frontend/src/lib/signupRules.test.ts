import { describe, it, expect } from 'vitest';
import { COUNTRIES, DEFAULT_COUNTRY, findCountry, flagEmoji, phoneError, toE164 } from './countries';
import { PASSWORD_RULES_MESSAGE, passwordChecks, passwordIsValid, passwordStrength } from './passwordRules';

describe('countries', () => {
  it('puts India first and makes it the default, then sorts A–Z', () => {
    expect(COUNTRIES[0]).toMatchObject({ iso: 'IN', dial: '91' });
    expect(DEFAULT_COUNTRY.iso).toBe('IN');
    const rest = COUNTRIES.slice(1).map((c) => c.name);
    expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b)));
    expect(new Set(COUNTRIES.map((c) => c.iso)).size).toBe(COUNTRIES.length);
  });

  it('builds flags and E.164 numbers', () => {
    expect(flagEmoji('IN')).toBe('🇮🇳');
    expect(toE164(DEFAULT_COUNTRY, '98765 43210')).toBe('+919876543210');
    expect(toE164(findCountry('GB'), '07911 123456')).toBe('+447911123456');
  });

  it('checks Indian numbers are 10 digits starting 6-9', () => {
    expect(phoneError(DEFAULT_COUNTRY, '9876543210')).toBeNull();
    expect(phoneError(DEFAULT_COUNTRY, '98765')).toMatch(/10 digits/);
    expect(phoneError(DEFAULT_COUNTRY, '1234567890')).toMatch(/start with/);
  });
});

describe('password rules', () => {
  it('needs 8+ characters, a letter and a number', () => {
    expect(passwordIsValid('abcd1234')).toBe(true);
    expect(passwordIsValid('abc123')).toBe(false);
    expect(passwordIsValid('abcdefgh')).toBe(false);
    expect(passwordIsValid('12345678')).toBe(false);
    expect(passwordChecks('abc').map((c) => c.ok)).toEqual([false, true, false]);
    expect(PASSWORD_RULES_MESSAGE).toMatch(/letter and a number/);
  });

  it('rates strength from 0 to 4', () => {
    expect(passwordStrength('')).toBe(0);
    expect(passwordStrength('abc')).toBe(1);
    expect(passwordStrength('abcd1234')).toBe(3);
    expect(passwordStrength('abcd1234!')).toBe(4);
  });
});
