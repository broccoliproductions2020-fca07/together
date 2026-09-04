import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback } from 'react';
import { Alert } from 'react-native';

import { useNotifications } from './NotificationsProvider';

const PUSH_NUDGE_KEY = 'together.push.nudge.v1';
/**
 * Two asks, and never more.
 *
 * This dialog is OURS, not Apple's — declining it costs nothing and the one
 * system prompt stays unspent, which is what makes asking early safe at all.
 * But it was capped at a single ask, so putting it at first launch would have
 * spent it on someone who has no friends and no activities yet and cannot tell
 * what they would be missing. Two lets it run at boot and once more when an
 * answer is actually pending; a third would be nagging.
 */
const PUSH_NUDGE_MAX_ASKS = 2;

/**
 * One contextual push opt-in ask at a moment of demonstrated value — never a
 * cold prompt at first launch. Fires at most once per device; the Profile
 * toggle stays the durable on/off switch.
 *
 * Call sites are the two moments where an ANSWER is now pending: sending or
 * accepting a friend request, and joining a first activity. The friend one
 * matters most for a new account — it happens long before any activity, and
 * "you asked someone, we will tell you what they said" is the clearest reason
 * this permission has ever had.
 */
export function usePushNudge() {
  const { pushEnabled, enablePush } = useNotifications();

  const maybeAskForPush = useCallback(async () => {
    if (pushEnabled) return;
    try {
      const stored = await AsyncStorage.getItem(PUSH_NUDGE_KEY);
      // The previous version wrote the literal 'asked'. It parses to NaN, so a
      // device that already saw the old single ask counts as one spent and gets
      // exactly one more — not a fresh pair.
      const asked = stored === null ? 0 : Number.parseInt(stored, 10) || 1;
      if (asked >= PUSH_NUDGE_MAX_ASKS) return;
      await AsyncStorage.setItem(PUSH_NUDGE_KEY, String(asked + 1));
    } catch {
      return;
    }
    Alert.alert(
      'Nichts verpassen?',
      'Erlaube Mitteilungen, damit du mitbekommst, wenn jemand deine Anfrage annimmt, dich einlädt oder dir schreibt.',
      [
        { text: 'Später', style: 'cancel' },
        { text: 'Aktivieren', onPress: () => void enablePush() },
      ],
    );
  }, [pushEnabled, enablePush]);

  return { maybeAskForPush };
}
