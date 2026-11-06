// Sign-up password rules, shared with the server (handlers/signup.go):
// at least 8 characters, at least one letter and at least one number.

export const MIN_PASSWORD_LENGTH = 8;

export const PASSWORD_RULES_MESSAGE = 'Password must be at least 8 characters and include a letter and a number';

export interface PasswordCheck {
  id: 'length' | 'letter' | 'number';
  label: string;
  ok: boolean;
}

export function passwordChecks(pw: string): PasswordCheck[] {
  return [
    { id: 'length', label: `${MIN_PASSWORD_LENGTH}+ characters`, ok: [...pw].length >= MIN_PASSWORD_LENGTH },
    { id: 'letter', label: 'A letter', ok: /\p{L}/u.test(pw) },
    { id: 'number', label: 'A number', ok: /\p{Nd}/u.test(pw) },
  ];
}

export const passwordIsValid = (pw: string) => passwordChecks(pw).every((c) => c.ok);

/** 0 (empty) to 4 (strong): the three rules, plus a bonus for length or a symbol. */
export function passwordStrength(pw: string): number {
  if (!pw) return 0;
  const met = passwordChecks(pw).filter((c) => c.ok).length;
  if (met < 3) return Math.max(1, met - 1);
  return pw.length >= 12 || /[^\p{L}\p{Nd}]/u.test(pw) ? 4 : 3;
}
