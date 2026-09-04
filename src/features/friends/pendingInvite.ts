import AsyncStorage from '@react-native-async-storage/async-storage';

import { parseInviteLink } from '@/shared/utils/inviteLink';

/**
 * An invite link is caught and redeemed in two separate places, on purpose.
 *
 * `RootNavigator` renders `EmailVerificationGate` INSTEAD of the whole `<Stack>`
 * while an account's address is unconfirmed, so during that window there is no
 * route for a deep link to reach — and that window is exactly when an invite
 * arrives most often: someone installs Mica *because* of the link and has not
 * opened their mail yet. Catching therefore hangs off `Linking` above the auth
 * branching and only writes the name down; redeeming happens later, wherever
 * a verified session and `sendFriendRequest` actually exist.
 *
 * Storing the username rather than the whole URL keeps the parse in one place
 * and means nothing unvalidated is ever persisted.
 */
const PENDING_INVITE_KEY = 'together.pending.invite.v1';

/**
 * Catcher and redeemer both react to the same incoming URL, so the redeemer
 * must not read storage on its own copy of that event — it would race the
 * write and find nothing. It waits for this instead, which fires only once the
 * name is safely written.
 */
const listeners = new Set<() => void>();

export function onPendingInviteCaptured(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Returns the username it stored, or `null` if the URL was not an invite. */
export async function capturePendingInvite(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  const username = parseInviteLink(url);
  if (!username) return null;
  try {
    await AsyncStorage.setItem(PENDING_INVITE_KEY, username);
  } catch {
    // A storage failure must not break link handling; the invite is simply lost.
    return null;
  }
  listeners.forEach((listener) => listener());
  return username;
}

/**
 * Reads and clears in one step. The clear happens BEFORE the request is sent:
 * a token left in storage while a callable is in flight is a token a second
 * mount can pick up, and a duplicate request is worse than a lost one — the
 * link can always be tapped again.
 */
export async function takePendingInvite(): Promise<string | null> {
  try {
    const username = await AsyncStorage.getItem(PENDING_INVITE_KEY);
    if (!username) return null;
    await AsyncStorage.removeItem(PENDING_INVITE_KEY);
    return username;
  } catch {
    return null;
  }
}

export async function clearPendingInvite(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PENDING_INVITE_KEY);
  } catch {
    // Nothing to recover — the next successful redeem clears it anyway.
  }
}
