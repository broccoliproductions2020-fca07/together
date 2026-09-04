import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';

import { onPendingInviteCaptured, takePendingInvite } from './pendingInvite';
import type { SendFriendRequestResult } from './services/friendService.types';

/**
 * Sends the friend request a caught invite link stands for.
 *
 * Lives in `FriendsProvider`, which mounts only in the authenticated AND
 * verified tree — that is the gate this needs, and hanging it there means it
 * cannot fire for a session the server would reject anyway.
 *
 * The request goes out without asking first: the person tapped a link that says
 * "add me", and a confirm dialog would only re-ask the question they already
 * answered. It is not silent though — every outcome is reported.
 */
export function usePendingInviteRedeem(
  sendFriendRequest: (username: string) => Promise<SendFriendRequestResult>,
  ready: boolean,
) {
  /**
   * Read at call time, never an effect dependency.
   *
   * `sendFriendRequest` hangs off `refreshFriendships`, which hangs off
   * `friendshipsVersion` — so its identity changes the moment the settings
   * listener delivers its first snapshot, milliseconds after this effect first
   * runs. As a dependency it tore the effect down mid-redeem, which is exactly
   * the window in which the invite has already left storage.
   */
  const send = useRef(sendFriendRequest);
  send.current = sendFriendRequest;

  // Survives the re-render that `refreshFriendships` triggers, so one link can
  // never produce two requests.
  const busy = useRef(false);
  // A link caught while a redeem is in flight must not be swallowed by the
  // busy guard — that guard exists against duplicates, not against arrivals.
  const again = useRef(false);

  useEffect(() => {
    if (!ready) return;

    async function redeem() {
      if (busy.current) {
        again.current = true;
        return;
      }
      busy.current = true;
      try {
        const username = await takePendingInvite();
        if (!username) return;
        /**
         * No unmount check between here and the send, deliberately.
         * `takePendingInvite` has ALREADY consumed the invite, so bailing out
         * now would drop it for good — and a link can only be tapped again if
         * the person still has it. Once the name is in hand, the request goes.
         */
        const result = await send.current(username);
        announce(username, result);
      } catch (error) {
        // Callable errors already carry German, user-facing text.
        Alert.alert(
          'Einladung nicht angenommen',
          error instanceof Error && error.message
            ? error.message
            : 'Die Freundschaftsanfrage konnte nicht gesendet werden.',
        );
      } finally {
        busy.current = false;
        if (again.current) {
          again.current = false;
          void redeem();
        }
      }
    }

    void redeem();
    return onPendingInviteCaptured(() => void redeem());
  }, [ready]);
}

function announce(username: string, result: SendFriendRequestResult) {
  const handle = `@${username}`;
  if (result.state === 'already_friends') {
    Alert.alert('Schon verbunden', `Ihr seid bereits befreundet.`);
    return;
  }
  if (result.state === 'incoming_request') {
    // The other direction already exists — one tap finishes it, so point there.
    Alert.alert(
      'Anfrage wartet auf dich',
      `${handle} hat dir bereits eine Freundschaftsanfrage geschickt.`,
      [
        { text: 'Später', style: 'cancel' },
        { text: 'Zu den Freunden', onPress: () => router.push('/friends') },
      ],
    );
    return;
  }
  Alert.alert('Anfrage gesendet', `${handle} bekommt deine Freundschaftsanfrage.`);
}
