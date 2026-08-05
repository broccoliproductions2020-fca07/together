import {
  createUserWithEmailAndPassword,
  deleteUser,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  sendEmailVerification,
  onAuthStateChanged,
  OAuthProvider,
  signInAnonymously,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
  type User as FirebaseUser,
} from '@react-native-firebase/auth';
import { doc, getDoc, serverTimestamp, writeBatch } from '@react-native-firebase/firestore';
import { httpsCallable } from '@react-native-firebase/functions';

import {
  getFirebaseAuth,
  getFirebaseDb,
  getFirebaseFunctions,
  USE_EMULATORS,
} from '@/shared/services/firebase';

import type {
  AuthService,
  AuthSession,
  AuthUser,
  SignInWithEmailInput,
  UpdateProfileInput,
} from '../types';
import { slugifyUsername, withUsernameSuffix } from '../utils/username';
import { toAuthError } from './authErrors';

/**
 * Firebase-backed implementation of {@link AuthService}.
 *
 * `signInWithEmail` honours `input.mode`: login only ever signs in, sign-up only
 * ever creates. (It used to fall through from "unknown e-mail" to account
 * creation, so a typo during login silently produced a second empty account.)
 * `signInDemo` maps to an anonymous session. Session persistence is handled by
 * the Firebase SDK (AsyncStorage on native).
 */

function deriveDisplayName(username: string, email: string): string {
  const base = username.trim() || email.split('@')[0] || 'Friend';
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function toAuthUser(user: FirebaseUser, username?: string): AuthUser {
  const displayName =
    user.displayName?.trim() || deriveDisplayName(username ?? '', user.email ?? '') || 'Gast';
  return {
    id: user.uid,
    email: user.email ?? '',
    username: username ?? user.displayName?.toLowerCase() ?? user.email?.split('@')[0] ?? 'gast',
    displayName,
    avatarUrl: user.photoURL ?? undefined,
    emailVerified: user.emailVerified,
    createdAt: user.metadata.creationTime
      ? new Date(user.metadata.creationTime).toISOString()
      : new Date().toISOString(),
  };
}

async function toSession(user: FirebaseUser, username?: string): Promise<AuthSession> {
  return {
    user: toAuthUser(user, username),
    token: await user.getIdToken(),
    createdAt: new Date().toISOString(),
  };
}

interface UpdateOwnProfileResult {
  displayName: string;
  avatarUrl?: string;
  username: string;
  changed: boolean;
}

async function avatarUriToBase64(uri: string): Promise<string> {
  const response = await fetch(uri);
  if (!response.ok) throw new Error('Das Profilbild konnte nicht gelesen werden.');
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Das Profilbild konnte nicht verarbeitet werden.'));
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Das Profilbild konnte nicht verarbeitet werden.'));
        return;
      }
      const comma = reader.result.indexOf(',');
      if (comma < 0) {
        reject(new Error('Das Profilbild konnte nicht verarbeitet werden.'));
        return;
      }
      resolve(reader.result.slice(comma + 1));
    };
    reader.readAsDataURL(blob);
  });
}

interface EnsuredProfile {
  username: string;
  /**
   * The profile existed but carried no handle — the fingerprint of a sign-up
   * that was interrupted before `claimUsername` succeeded. Such an account is
   * invisible to friend search until the claim is retried.
   */
  usernameWasMissing: boolean;
}

/**
 * Best-effort profile document (users/{uid}). Auth must keep working even when
 * the Firestore emulator is not running (e.g. Java missing), so failures are
 * swallowed here and the doc is healed on the next sign-in.
 */
async function ensureUserDoc(
  user: FirebaseUser,
  username: string,
  _isNew: boolean,
): Promise<EnsuredProfile> {
  try {
    const displayName = user.displayName?.trim() || deriveDisplayName(username, user.email ?? '');
    const db = getFirebaseDb();
    const [existing, publicProfileExisting] = await Promise.all([
      getDoc(doc(db, 'users', user.uid)),
      getDoc(doc(db, 'publicProfiles', user.uid)),
    ]);
    const storedUsername = existing.data()?.username;
    const hadUsername = typeof storedUsername === 'string' && storedUsername.length > 0;
    // Whatever we persist must satisfy the same shape `claimUsername` enforces —
    // otherwise the doc carries a handle nobody can ever claim or search for.
    const profileUsername = hadUsername
      ? (storedUsername as string)
      : slugifyUsername(username || displayName, user.email ?? '');
    if (existing.exists() && publicProfileExisting.exists()) {
      return { username: profileUsername, usernameWasMissing: !hadUsername };
    }
    const isNew = true;
    const publicProfile = {
      displayName,
      username: profileUsername,
      initials: initialsOf(displayName),
      // publicProfiles is THE source all friend-facing snapshots are built from
      // (friendships, presence, participants) — without the avatar here,
      // nobody else would ever see it.
      ...(user.photoURL ? { avatarUrl: user.photoURL } : {}),
      // createdAt is immutable after creation (firestore.rules) — only ever
      // set on the first write, never rewritten on later logins.
      ...(isNew ? { createdAt: serverTimestamp() } : {}),
    };
    const batch = writeBatch(db);
    batch.set(
      doc(db, 'users', user.uid),
      {
        displayName,
        username: profileUsername,
        initials: initialsOf(displayName),
        ...(user.photoURL ? { avatarUrl: user.photoURL } : {}),
        ...(isNew ? { profileVisibility: 'friends', friendRequestPolicy: 'anyone' } : {}),
        ...(isNew ? { createdAt: serverTimestamp() } : {}),
      },
      { merge: true },
    );
    batch.set(doc(db, 'publicProfiles', user.uid), publicProfile, { merge: true });
    await batch.commit();
    return { username: profileUsername, usernameWasMissing: !isNew && !hadUsername };
  } catch {
    // Firestore unavailable — the profile doc is not critical for auth, but the
    // session still needs a usable handle (the caller may pass an empty string).
    return { username: slugifyUsername(username, user.email ?? ''), usernameWasMissing: false };
  }
}

async function claimUsername(username: string): Promise<void> {
  const claim = httpsCallable<{ username: string }, { ok: boolean }>(
    getFirebaseFunctions(),
    'claimUsername',
  );
  await claim({ username });
}

function isUsernameTaken(error: unknown): boolean {
  const code = (error as { code?: string } | undefined)?.code ?? '';
  return code === 'already-exists' || code === 'functions/already-exists';
}

/**
 * Claims a handle, stepping aside when it is taken. The first collision gets a
 * deterministic `name2`; later ones a random 4-digit tail so two people signing
 * up with the same name at the same moment do not both walk the same ladder.
 */
async function claimAvailableUsername(base: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate =
      attempt === 0
        ? base
        : withUsernameSuffix(base, attempt === 1 ? 2 : 1000 + Math.floor(Math.random() * 9000));
    try {
      await claimUsername(candidate);
      return candidate;
    } catch (error) {
      if (!isUsernameTaken(error)) throw error;
    }
  }
  throw new Error('Dieser Name ist schon vergeben. Bitte wähle einen anderen.');
}

function federatedUsername(user: FirebaseUser): string {
  const uid = user.uid.toLowerCase().replace(/[^a-z0-9]/g, '');
  return `u${uid}`.slice(0, 30);
}

async function provisionFederatedSession(
  user: FirebaseUser,
  isNewHint: boolean,
  displayName?: string,
): Promise<AuthSession> {
  try {
    if (displayName && !user.displayName?.trim()) {
      await updateProfile(user, { displayName });
    }

    const existing = await getDoc(doc(getFirebaseDb(), 'users', user.uid));
    const existingUsername = existing.exists() ? existing.data().username : undefined;
    const username =
      typeof existingUsername === 'string' && existingUsername.length > 0
        ? existingUsername
        : federatedUsername(user);
    const isNewProfile = !existing.exists();

    if (isNewProfile) {
      await claimUsername(username);
    }
    const profile = await ensureUserDoc(user, username, isNewProfile || isNewHint);
    return toSession(user, profile.username);
  } catch (error) {
    await firebaseSignOut(getFirebaseAuth()).catch(() => {});
    throw error;
  }
}

/** Signs in an existing account. Never creates one — see `SignInWithEmailInput.mode`. */
async function loginWithEmail(email: string, password: string): Promise<AuthSession> {
  const auth = getFirebaseAuth();
  let user: FirebaseUser;
  try {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    user = credential.user;
  } catch (error) {
    throw toAuthError(error, 'login');
  }

  const profile = await ensureUserDoc(user, user.displayName ?? '', false);
  // Heal an account left handle-less by an interrupted sign-up: without a claim
  // it can never be found by @username. Rare, so the extra callable is cheap.
  if (profile.usernameWasMissing) {
    try {
      const claimed = await claimAvailableUsername(profile.username);
      await ensureUserDoc(user, claimed, false);
      return toSession(user, claimed);
    } catch {
      // A handle is not worth blocking a valid login on; retried next time.
    }
  }
  return toSession(user, profile.username);
}

/**
 * Creates a new account. Provisioning (display name, handle claim, profile docs,
 * verification mail) is treated as part of the sign-up: if any of it fails the
 * auth user is deleted again, so the address is never burned by a half-created
 * account the person can neither use nor re-register.
 */
async function signUpWithEmail(
  email: string,
  password: string,
  displayName: string,
): Promise<AuthSession> {
  const auth = getFirebaseAuth();
  let user: FirebaseUser;
  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    user = credential.user;
  } catch (error) {
    throw toAuthError(error, 'signup');
  }

  try {
    const name = deriveDisplayName(displayName, email);
    await updateProfile(user, { displayName: name });
    const username = await claimAvailableUsername(slugifyUsername(displayName, email));
    const profile = await ensureUserDoc(user, username, true);
    // The release gate (FUNCTIONS_ENFORCE_EMAIL_VERIFICATION, docs/backend-plan
    // step 8) rejects writes without a verified address — a fresh account that
    // never received a mail would look broken from the very first tap.
    await sendEmailVerification(user).catch(() => {});
    return toSession(user, profile.username);
  } catch (error) {
    await deleteUser(user).catch(() => firebaseSignOut(auth).catch(() => {}));
    throw toAuthError(error, 'signup');
  }
}

async function loadSocialAuth() {
  // Load optional native provider modules only when the user selects that sign-in path.
  return import('./socialAuth');
}

export const firebaseAuthService: AuthService = {
  async getCurrentSession() {
    const auth = getFirebaseAuth();
    const user = await new Promise<FirebaseUser | null>((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, (current) => {
        unsubscribe();
        resolve(current);
      });
    });
    if (!user) return null;

    // The Auth emulator may be reset while AsyncStorage still contains an old
    // anonymous/email session. A cached token would make the UI look signed in,
    // but every Firestore listener would then be denied. Refresh once during
    // restoration so the auth gate never mounts backend providers with a stale
    // emulator identity. Cloud sessions keep their normal cached-token path.
    if (process.env.EXPO_PUBLIC_FIREBASE_EMULATORS !== 'false') {
      try {
        await user.getIdToken(true);
      } catch {
        await firebaseSignOut(auth).catch(() => {});
        return null;
      }
    }

    return toSession(user);
  },

  /**
   * Re-reads the account after the person clicked the verification link.
   * `reload()` alone is not enough: the backend reads `email_verified` from the
   * ID TOKEN, and the cached token still carries the old claim — so force a
   * fresh token, otherwise every gated callable keeps rejecting a verified user.
   */
  async refreshSession() {
    const auth = getFirebaseAuth();
    const user = auth.currentUser;
    if (!user) return null;
    await user.reload();
    const refreshed = getFirebaseAuth().currentUser;
    if (!refreshed) return null;
    await refreshed.getIdToken(true);
    return toSession(refreshed);
  },

  async signInDemo() {
    // Guest access is a dev/test convenience, not a production account type
    // (Produktentscheidung Juli 2026) — block it once the app is actually
    // talking to a real cloud project instead of the local Emulator Suite.
    if (!USE_EMULATORS) {
      throw new Error(
        'Der Gast-Zugang ist nur in der Entwicklung verfügbar. Bitte melde dich mit E-Mail an.',
      );
    }
    const auth = getFirebaseAuth();
    const credential = await signInAnonymously(auth);
    if (!credential.user.displayName) {
      await updateProfile(credential.user, { displayName: 'Gast' });
    }
    const profile = await ensureUserDoc(credential.user, 'gast', true);
    return toSession(credential.user, profile.username);
  },

  async signInWithEmail(input: SignInWithEmailInput) {
    const email = input.email.trim().toLowerCase();
    return input.mode === 'signup'
      ? signUpWithEmail(email, input.password, input.username.trim())
      : loginWithEmail(email, input.password);
  },

  async signInWithGoogle() {
    const { getGoogleIdentity } = await loadSocialAuth();
    const identity = await getGoogleIdentity();
    if (!identity) return null;

    try {
      const credential = GoogleAuthProvider.credential(identity.idToken);
      const result = await signInWithCredential(getFirebaseAuth(), credential);
      return await provisionFederatedSession(
        result.user,
        result.additionalUserInfo?.isNewUser === true,
        identity.displayName,
      );
    } catch (error) {
      throw toAuthError(error, 'social');
    }
  },

  async signInWithApple() {
    const { getAppleIdentity } = await loadSocialAuth();
    const identity = await getAppleIdentity();
    if (!identity) return null;

    try {
      const credential = new OAuthProvider('apple.com').credential({
        idToken: identity.idToken,
        rawNonce: identity.rawNonce,
      });
      const result = await signInWithCredential(getFirebaseAuth(), credential);
      return await provisionFederatedSession(
        result.user,
        result.additionalUserInfo?.isNewUser === true,
        identity.displayName,
      );
    } catch (error) {
      throw toAuthError(error, 'social');
    }
  },

  async resetPassword(email) {
    try {
      await sendPasswordResetEmail(getFirebaseAuth(), email.trim().toLowerCase());
    } catch (error) {
      // Resolving on "unknown address" is deliberate: reporting it back would
      // turn the reset form into an account-existence oracle. The UI already
      // says "Wenn ein Konto existiert …" for exactly this reason.
      const code = (error as { code?: string } | undefined)?.code;
      if (code === 'auth/user-not-found' || code === 'auth/invalid-credential') return;
      throw toAuthError(error, 'reset');
    }
  },

  async updateProfile(input: UpdateProfileInput) {
    const authUser = getFirebaseAuth().currentUser;
    if (!authUser) throw new Error('Nicht angemeldet.');
    const displayName = input.displayName.trim();
    if (displayName.length < 2 || displayName.length > 50) {
      throw new Error('Der Anzeigename muss zwischen 2 und 50 Zeichen lang sein.');
    }
    if (!input.avatarUri && displayName === authUser.displayName?.trim()) {
      const profile = await getDoc(doc(getFirebaseDb(), 'users', authUser.uid));
      const profileData = profile.data();
      const username = typeof profileData?.username === 'string' ? profileData.username : undefined;
      return toSession(authUser, username);
    }
    const avatarBase64 = input.avatarUri ? await avatarUriToBase64(input.avatarUri) : undefined;
    const updateOwnProfile = httpsCallable<
      { displayName: string; avatarBase64?: string },
      UpdateOwnProfileResult
    >(getFirebaseFunctions(), 'updateOwnProfile');
    let result;
    try {
      result = await updateOwnProfile({
        displayName,
        ...(avatarBase64 ? { avatarBase64 } : {}),
      });
    } catch (error) {
      throw toAuthError(error, 'profile');
    }
    await authUser.reload().catch(() => {});
    const session = await toSession(authUser, result.data.username);
    return {
      ...session,
      user: {
        ...session.user,
        displayName: result.data.displayName,
        avatarUrl: result.data.avatarUrl,
      },
    };
  },

  async sendEmailVerification() {
    const authUser = getFirebaseAuth().currentUser;
    if (!authUser) throw new Error('Nicht angemeldet.');
    if (!authUser.email) throw new Error('Für dieses Konto gibt es keine E-Mail-Adresse.');
    await sendEmailVerification(authUser);
  },

  async deleteAccount() {
    const authUser = getFirebaseAuth().currentUser;
    if (!authUser) return;
    const deleteRemote = httpsCallable<undefined, { ok: true }>(
      getFirebaseFunctions(),
      'deleteMyAccount',
    );
    await deleteRemote();
    await firebaseSignOut(getFirebaseAuth());
  },

  async signOut() {
    await firebaseSignOut(getFirebaseAuth());
    try {
      const { signOutGoogle } = await loadSocialAuth();
      await signOutGoogle();
    } catch {
      // Firebase sign-out remains authoritative when an older dev build has no provider module.
    }
  },
};
