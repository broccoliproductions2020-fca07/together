import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback } from 'react';
import { Alert } from 'react-native';

import { useNotifications } from './NotificationsProvider';

const PUSH_NUDGE_KEY = 'together.push.nudge.v1';

/**
 * One contextual push opt-in ask at a moment of demonstrated value (first
 * joined activity) — never a cold prompt at first launch. Fires at most once
 * per device; the Profile toggle stays the durable on/off switch.
 */
export function usePushNudge() {
  const { pushEnabled, enablePush } = useNotifications();

  const maybeAskForPush = useCallback(async () => {
    if (pushEnabled) return;
    try {
      if ((await AsyncStorage.getItem(PUSH_NUDGE_KEY)) !== null) return;
      await AsyncStorage.setItem(PUSH_NUDGE_KEY, 'asked');
    } catch {
      return;
    }
    Alert.alert(
      'Nichts verpassen?',
      'Erlaube Mitteilungen, damit du mitbekommst, wenn jemand in deiner Activity schreibt oder spontan etwas startet.',
      [
        { text: 'Später', style: 'cancel' },
        { text: 'Aktivieren', onPress: () => void enablePush() },
      ],
    );
  }, [pushEnabled, enablePush]);

  return { maybeAskForPush };
}
