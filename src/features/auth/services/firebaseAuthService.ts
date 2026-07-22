import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
  type User as FirebaseUser,
} from '@react-native-firebase/auth';
import { doc, getDoc, serverTimestamp, writeBatch } from '@react-native-firebase/firestore';
import { httpsCallable } from '@react-native-firebase/functions';
import { getDownloadURL, ref, uploadBytes } from '@react-native-firebase/storage';

import {
  getFirebaseAuth,
  getFirebaseDb,
  getFirebaseFunctions,
  getFirebaseStorage,
  USE_EMULATORS,
} from '@/shared/services/firebase';

import type {
  AuthService,
  AuthSession,
  AuthUser,
  SignInWithEmailInput,
  UpdateProfileInput,
} from '../types';

/**
 * Firebase-backed implementation of {@link AuthService}.
 *
 * Mirrors the mock's semantics: `signInWithEmail` is a combined
 * sign-in-or-sign-up (the auth screen has one form), `signInDemo` maps to an
 * anonymous session. Session persistence is handled by the Firebase SDK
 * (AsyncStorage on native).
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

/**
 * Best-effort profile document (users/{uid}). Auth must keep working even when
 * the Firestore emulator is not running (e.g. Java missing), so failures are
 * swallowed here and the doc is healed on the next sign-in.
 */
async function ensureUserDoc(user: FirebaseUser, username: string, isNew: boolean): Promise<void> {
  try {
    const displayName = user.displayName?.trim() || deriveDisplayName(username, user.email ?? '');
    const db = getFirebaseDb();
    const existing = isNew ? null : await getDoc(doc(db, 'users', user.uid));
    const profileUsername = (existing?.data()?.username ?? username) || displayName.toLowerCase();
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
  } catch {
    // Firestore unavailable — profile doc is not critical for auth.
  }
}

async function claimUsername(username: string): Promise<void> {
  const claim = httpsCallable<{ username: string }, { ok: boolean }>(
    getFirebaseFunctions(),
    'claimUsername',
  );
  await claim({ username });
}

function isNoSuchUserError(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  // Emulator reports user-not-found; production (email enumeration protection)
  // reports invalid-credential for unknown emails too.
  return code === 'auth/user-not-found' || code === 'auth/invalid-credential';
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
    await ensureUserDoc(credential.user, 'gast', true);
    return toSession(credential.user, 'gast');
  },

  async signInWithEmail(input: SignInWithEmailInput) {
    const auth = getFirebaseAuth();
    const email = input.email.trim().toLowerCase();
    const username = input.username.trim();

    let user: FirebaseUser;
    let isNew = false;
    try {
      const credential = await signInWithEmailAndPassword(auth, email, input.password);
      user = credential.user;
    } catch (error) {
      if (!isNoSuchUserError(error)) throw error;
      // Unknown email → register (the auth screen is one combined form).
      const credential = await createUserWithEmailAndPassword(auth, email, input.password);
      user = credential.user;
      isNew = true;
      await updateProfile(user, { displayName: deriveDisplayName(username, email) });
      await claimUsername(username);
    }

    await ensureUserDoc(user, username, isNew);
    return toSession(user, username);
  },

  async resetPassword(email) {
    await sendPasswordResetEmail(getFirebaseAuth(), email.trim().toLowerCase());
  },

  async updateProfile(input: UpdateProfileInput) {
    const authUser = getFirebaseAuth().currentUser;
    if (!authUser) throw new Error('Nicht angemeldet.');
    const displayName = input.displayName.trim();
    if (displayName.length < 2 || displayName.length > 50) {
      throw new Error('Der Anzeigename muss zwischen 2 und 50 Zeichen lang sein.');
    }
    let photoURL = authUser.photoURL;
    if (input.avatarUri) {
      const response = await fetch(input.avatarUri);
      if (!response.ok) throw new Error('Das Profilbild konnte nicht gelesen werden.');
      const blob = await response.blob();
      const avatarRef = ref(getFirebaseStorage(), `avatars/${authUser.uid}.jpg`);
      await uploadBytes(avatarRef, blob, { contentType: 'image/jpeg' });
      photoURL = await getDownloadURL(avatarRef);
    }
    await updateProfile(authUser, { displayName, photoURL });
    await ensureUserDoc(authUser, authUser.displayName ?? 'friend', false);
    return toSession(authUser);
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
  },
};
