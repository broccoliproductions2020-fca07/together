/**
 * Display name → claimable username handle.
 *
 * `claimUsername` (functions/index.js) validates `^[a-z0-9][a-z0-9._-]{1,29}$`.
 * The sign-up field asks for a *display name* ("Dein Name"), so anything with a
 * space, an umlaut or a capital — i.e. most real names — was rejected server-side
 * and left an orphaned Firebase Auth account behind. Names and handles are two
 * different things; this is the one place we derive the second from the first.
 */

const MIN = 2;
const MAX = 30;

/** Hermes ships without a reliable `normalize('NFD')`, so map the ones that matter. */
const FOLD: Record<string, string> = {
  ä: 'ae',
  ö: 'oe',
  ü: 'ue',
  ß: 'ss',
  á: 'a',
  à: 'a',
  â: 'a',
  ã: 'a',
  å: 'a',
  é: 'e',
  è: 'e',
  ê: 'e',
  ë: 'e',
  í: 'i',
  ì: 'i',
  î: 'i',
  ï: 'i',
  ó: 'o',
  ò: 'o',
  ô: 'o',
  õ: 'o',
  ø: 'o',
  ú: 'u',
  ù: 'u',
  û: 'u',
  ñ: 'n',
  ç: 'c',
  ý: 'y',
};

function fold(input: string): string {
  let out = '';
  for (const char of input.toLowerCase()) out += FOLD[char] ?? char;
  return out;
}

/**
 * Builds a valid handle from a display name, falling back to the e-mail local
 * part and finally to a stable `como` stem. Always returns a string that
 * satisfies the server regex.
 */
export function slugifyUsername(displayName: string, email = ''): string {
  const candidates = [displayName, email.split('@')[0] ?? '', 'como'];

  for (const candidate of candidates) {
    const slug = fold(candidate)
      .replace(/[^a-z0-9._-]+/g, '.')
      .replace(/[._-]{2,}/g, '.')
      .replace(/^[^a-z0-9]+/, '')
      .replace(/[^a-z0-9]+$/, '')
      .slice(0, MAX);
    if (slug.length >= MIN) return slug;
  }
  return 'como';
}

/**
 * Deterministic variant used when a handle is already taken. Keeps the result
 * inside the 30-char limit by trimming the stem, never the suffix.
 */
export function withUsernameSuffix(base: string, attempt: number): string {
  const suffix = String(attempt);
  const stem = base.slice(0, MAX - suffix.length).replace(/[^a-z0-9]+$/, '');
  const candidate = `${stem || 'como'}${suffix}`;
  return candidate.slice(0, MAX);
}
