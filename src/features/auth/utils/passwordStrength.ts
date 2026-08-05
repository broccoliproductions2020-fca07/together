/**
 * Local password strength signal for the sign-up field.
 *
 * Deliberately *not* a hard composition rule ("must contain a symbol") — those
 * push people toward `Passwort1!` and are explicitly discouraged by current
 * guidance (NIST SP 800-63B). Length is the requirement; variety only moves the
 * meter. The gate is 8 characters, everything above that is encouragement.
 */

export const PASSWORD_MIN_LENGTH = 8;

export type PasswordScore = 0 | 1 | 2 | 3 | 4;

export interface PasswordStrength {
  score: PasswordScore;
  label: string;
  /** True once the password may be submitted at all. */
  acceptable: boolean;
}

/** Obvious throwaways that a length check alone would happily accept. */
const WEAK_PATTERNS = [
  /^(.)\1+$/, // aaaaaaaa
  /^(?:0?123456789?|12345678|87654321)$/,
  /passwor|qwert|asdfg|iloveyou|willkommen|geheim/i,
];

export function evaluatePassword(password: string): PasswordStrength {
  const length = password.length;
  if (length === 0) return { score: 0, label: '', acceptable: false };
  if (length < PASSWORD_MIN_LENGTH) {
    return { score: 0, label: `Mindestens ${PASSWORD_MIN_LENGTH} Zeichen`, acceptable: false };
  }
  if (WEAK_PATTERNS.some((pattern) => pattern.test(password))) {
    return { score: 1, label: 'Zu leicht zu erraten', acceptable: false };
  }

  const variety =
    Number(/[a-z]/.test(password)) +
    Number(/[A-Z]/.test(password)) +
    Number(/[0-9]/.test(password)) +
    Number(/[^A-Za-z0-9]/.test(password));

  // Length carries most of the weight — a long passphrase beats a short mix.
  let score = 1;
  if (length >= 10 && variety >= 2) score = 2;
  if (length >= 12 && variety >= 2) score = 3;
  if ((length >= 16 && variety >= 2) || (length >= 12 && variety >= 3)) score = 4;

  const labels = ['', 'Okay', 'Solide', 'Stark', 'Sehr stark'] as const;
  return { score: score as PasswordScore, label: labels[score], acceptable: true };
}
