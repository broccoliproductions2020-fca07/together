import { useEffect } from 'react';
import { Linking } from 'react-native';

import { capturePendingInvite } from './pendingInvite';

/**
 * Catches invite links no matter which branch of `RootNavigator` is on screen.
 *
 * Deliberately a raw `Linking` subscription instead of relying on Expo Router's
 * automatic route matching: the verification gate replaces the entire `<Stack>`,
 * so there is no `f/[username]` route mounted to receive the URL in the one
 * state where invites arrive most. This hook must therefore be called ABOVE the
 * session/verification branching, never inside a screen.
 *
 * It only writes the name down. Redeeming needs a verified session and lives in
 * `FriendsProvider`.
 */
export function usePendingInviteCapture() {
  useEffect(() => {
    let active = true;

    // A cold start delivers the URL here; a warm one through the listener.
    Linking.getInitialURL()
      .then((url) => {
        if (active) void capturePendingInvite(url);
      })
      .catch(() => {});

    const subscription = Linking.addEventListener('url', ({ url }) => {
      void capturePendingInvite(url);
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
}
