/**
 * Friend invite links — one module owns both directions, because the QR sheet,
 * the deep-link route and the camera scanner must agree on the exact same
 * shape. A second regex somewhere else is how a scanned code silently stops
 * matching a generated one.
 *
 * The link carries the USERNAME, not a minted token: `sendFriendRequest`
 * already resolves a username through `usernames/{name}` and runs every check
 * (Freundschaftsanfrage-Policy, Blocks, Selbstanfrage, Idempotenz) on it, so
 * the invite needs no server state of its own. A username is not a secret —
 * the in-app people search resolves the same name for anyone who types it.
 */

/** Must stay in sync with `claimUsername` in functions/index.js. */
export const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{1,29}$/;

/**
 * Subdomain, so the apex stays free for the marketing site. Changing this
 * means changing `associatedDomains`/`intentFilters` in app.config.js and the
 * hosted `.well-known` files — a native rebuild, not an OTA.
 */
export const INVITE_LINK_HOST = 'link.micamap.de';

const INVITE_LINK_PREFIX = `https://${INVITE_LINK_HOST}/f/`;

/** Everything up to and including `://`. */
const SCHEME_RE = /^([a-z][a-z0-9+.-]*):\/\//i;

/**
 * Matches the `/f/<name>` segment in either shape a link can arrive in: a real
 * URL path (`https://host/f/x`) or a custom-scheme URL where the OS hands us
 * `f` as the host (`mica://f/x`).
 */
const INVITE_PATH_RE = /(?:^|\/)f\/([^/?#]+)/i;

export function buildInviteLink(username: string): string {
  return `${INVITE_LINK_PREFIX}${normaliseUsername(username)}`;
}

/**
 * Extracts the username from an invite link, or `null` if this is not one.
 *
 * An https link must come from our own host. That check is what makes the
 * camera scanner safe: it reads arbitrary QR codes off the world, and without
 * it any site could hand the app a `/f/<name>` path and have a friend request
 * fired at someone. Our own app schemes are trusted — only we register them.
 */
export function parseInviteLink(raw: string): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;

  const scheme = SCHEME_RE.exec(trimmed);
  let rest = scheme ? trimmed.slice(scheme[0].length) : trimmed;

  if (scheme && /^https?$/i.test(scheme[1])) {
    const host = rest.split(/[/?#]/, 1)[0];
    if (host.toLowerCase() !== INVITE_LINK_HOST) return null;
    rest = rest.slice(host.length);
  }

  const match = INVITE_PATH_RE.exec(rest);
  if (!match) return null;

  const username = normaliseUsername(decodeSegment(match[1]));
  return USERNAME_RE.test(username) ? username : null;
}

function normaliseUsername(value: string): string {
  return value.trim().replace(/^@/, '').toLowerCase();
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    // A malformed percent-escape is not an invite; let the caller's validation
    // reject the raw text rather than throwing out of a link handler.
    return value;
  }
}
