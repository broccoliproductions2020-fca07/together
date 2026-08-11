/**
 * Provider errors → user-facing German copy.
 *
 * Firebase Auth throws English, bracketed strings ("[auth/invalid-credential]
 * The supplied auth credential is incorrect…"). `AuthProvider.toMessage` passes
 * `error.message` straight to the UI, so without this mapping the auth screen
 * shows raw provider text in the middle of German copy. This is the single place
 * a provider error becomes something a person should read.
 *
 * Enumeration rule: a failed *login* never reveals whether the address exists.
 * Modern Firebase projects have email-enumeration protection on, which collapses
 * "unknown user" and "wrong password" into `auth/invalid-credential` anyway — the
 * copy must not undo that by guessing.
 */

export type AuthErrorContext = 'login' | 'signup' | 'reset' | 'social' | 'profile';

function codeOf(error: unknown): string {
  const code = (error as { code?: unknown } | undefined)?.code;
  return typeof code === 'string' ? code : '';
}

const GENERIC = 'Etwas ist schiefgelaufen. Bitte versuche es erneut.';

const SHARED: Record<string, string> = {
  'auth/invalid-email': 'Diese E-Mail-Adresse sieht nicht gültig aus.',
  'auth/user-disabled': 'Dieses Konto wurde deaktiviert. Bitte wende dich an den Support.',
  'auth/too-many-requests':
    'Zu viele Versuche. Bitte warte einen Moment und versuche es dann erneut.',
  'auth/network-request-failed': 'Keine Verbindung. Prüfe dein Netz und versuche es erneut.',
  'auth/operation-not-allowed': 'Diese Anmeldeart ist derzeit nicht verfügbar.',
  'auth/internal-error': GENERIC,
};

const BY_CONTEXT: Record<AuthErrorContext, Record<string, string>> = {
  login: {
    // Deliberately identical for all three: never leak whether the account exists.
    'auth/invalid-credential': 'E-Mail oder Passwort stimmt nicht.',
    'auth/wrong-password': 'E-Mail oder Passwort stimmt nicht.',
    'auth/user-not-found': 'E-Mail oder Passwort stimmt nicht.',
  },
  signup: {
    'auth/email-already-in-use':
      'Zu dieser E-Mail gibt es schon ein Konto. Wechsle zu „Einloggen“.',
    'auth/weak-password': 'Das Passwort ist zu schwach. Nimm mindestens 8 Zeichen.',
    'already-exists': 'Dieser Name ist schon vergeben. Bitte wähle einen anderen.',
    'functions/already-exists': 'Dieser Name ist schon vergeben. Bitte wähle einen anderen.',
  },
  reset: {
    // A reset must never confirm that an address is registered either.
    'auth/user-not-found': 'Wenn ein Konto existiert, ist der Link unterwegs.',
    'auth/invalid-credential': 'Wenn ein Konto existiert, ist der Link unterwegs.',
  },
  social: {
    'auth/account-exists-with-different-credential':
      'Zu dieser E-Mail gibt es bereits ein Como-Konto. Bitte melde dich mit der ursprünglich verwendeten Methode an.',
    'auth/credential-already-in-use':
      'Zu dieser E-Mail gibt es bereits ein Como-Konto. Bitte melde dich mit der ursprünglich verwendeten Methode an.',
    'auth/popup-closed-by-user': 'Anmeldung abgebrochen.',
    'auth/cancelled-popup-request': 'Anmeldung abgebrochen.',
  },
  profile: {},
};

/** True for a callable/HttpsError that already carries German copy from the server. */
function isServerMessage(error: unknown): boolean {
  const code = codeOf(error);
  return code.startsWith('functions/') || code === 'failed-precondition';
}

export function authErrorMessage(error: unknown, context: AuthErrorContext): string {
  const code = codeOf(error);
  const mapped = BY_CONTEXT[context][code] ?? SHARED[code];
  if (mapped) return mapped;

  // Cloud Functions already answer in German (see functions/index.js); keep those
  // verbatim rather than flattening them into the generic fallback.
  const message = error instanceof Error ? error.message : '';
  if (isServerMessage(error) && message) {
    return message.replace(/^\[[^\]]+\]\s*/, '') || GENERIC;
  }

  // Anything else: never surface a bracketed provider string.
  return message && !/^\[|auth\/|firebase/i.test(message) ? message : GENERIC;
}

/** Wraps a provider error so the UI layer can throw/display it unchanged. */
export function toAuthError(error: unknown, context: AuthErrorContext): Error {
  const wrapped = new Error(authErrorMessage(error, context));
  const code = codeOf(error);
  if (code) (wrapped as Error & { code?: string }).code = code;
  return wrapped;
}
