import { useEffect } from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';

import { useAuth } from '@/features/auth';
import { capturePendingInvite } from '@/features/friends';
import { AppBootScreen } from '@/shared/components';

/**
 * Landing point for `https://link.micamap.de/f/<username>` and the app schemes.
 *
 * It deliberately does NOT send the friend request itself — it only writes the
 * name down and steps aside. `usePendingInviteRedeem` in `FriendsProvider` is
 * the single redeeming place, because it is the only one guaranteed to have a
 * verified session. Two call sites would mean two requests from one link.
 *
 * Registered outside both `Stack.Protected` guards (like the legal routes), so
 * a signed-out person reaches it and is handed to the auth screen with the
 * invite already remembered.
 */
export default function InviteRoute() {
  const { username } = useLocalSearchParams<{ username?: string }>();
  const { status } = useAuth();

  useEffect(() => {
    if (typeof username === 'string') void capturePendingInvite(`/f/${username}`);
  }, [username]);

  if (status === 'loading') return <AppBootScreen />;
  /**
   * Home, not `/friends`, and the reason is the boot curtain: it waits for the
   * map renderer to report in, and `/friends` never mounts one — so opening the
   * app through an invite link left it sitting on the Mica mark. `MapBootProvider`
   * now has a timeout for that, but a four-second stare is not a landing.
   *
   * Nothing is lost. `usePendingInviteRedeem` announces the outcome in a dialog,
   * and the one case with something to do — a request already waiting from the
   * other side — offers its own way to the friend list.
   */
  return <Redirect href={status === 'authenticated' ? '/' : '/auth'} />;
}
