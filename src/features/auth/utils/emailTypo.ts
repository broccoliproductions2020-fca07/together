/**
 * Catches the single most expensive sign-up mistake: a mistyped mail domain.
 *
 * A wrong address is silently fatal — the account is created, the verification
 * link goes nowhere, and the person is stuck with no way to tell why. (This
 * cost a real account during staging: `@gmail.con`.) The verification gate
 * makes it *visible*; this makes it *preventable*.
 *
 * Deliberately a SUGGESTION, never a restriction: we only offer a correction
 * when the typed domain is one or two characters away from a well-known one.
 * Never reject an unknown domain — company and custom domains are legitimate
 * and a provider allowlist would lock real users out.
 */
const KNOWN_DOMAINS = [
  // German providers first — the app's primary market.
  'gmail.com',
  'googlemail.com',
  'web.de',
  'gmx.de',
  'gmx.net',
  'gmx.at',
  'gmx.ch',
  't-online.de',
  'freenet.de',
  'posteo.de',
  'mailbox.org',
  'outlook.com',
  'outlook.de',
  'hotmail.com',
  'hotmail.de',
  'live.de',
  'live.com',
  'yahoo.com',
  'yahoo.de',
  'icloud.com',
  'me.com',
  'proton.me',
  'protonmail.com',
  'aol.com',
];

/** Levenshtein distance, capped — we never care about values above 2. */
function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length];
}

/**
 * Returns the corrected address when the domain looks like a typo of a known
 * provider, otherwise null. Short domains require an exact-distance-1 match so
 * `gmx.at` is never "corrected" to `gmx.ch`.
 */
export function suggestEmailCorrection(email: string): string | null {
  const trimmed = email.trim().toLowerCase();
  const atIndex = trimmed.lastIndexOf('@');
  if (atIndex < 1 || atIndex === trimmed.length - 1) return null;

  const local = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);
  if (!domain.includes('.')) return null;
  if (KNOWN_DOMAINS.includes(domain)) return null;

  let best: { domain: string; distance: number } | null = null;
  for (const candidate of KNOWN_DOMAINS) {
    const distance = editDistance(domain, candidate);
    // Short domains (web.de, gmx.de) are close to each other by nature — only
    // a single-character slip counts there, or we'd "fix" a correct address.
    const limit = candidate.length <= 7 ? 1 : 2;
    if (distance <= limit && (!best || distance < best.distance)) {
      best = { domain: candidate, distance };
    }
  }

  return best ? `${local}@${best.domain}` : null;
}
