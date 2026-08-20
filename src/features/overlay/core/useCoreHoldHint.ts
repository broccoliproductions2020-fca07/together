import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'together.core.holdHint.v1';

/**
 * The one-time "Gedrückt halten für mehr" introduction.
 *
 * A hold gesture is invisible, so it gets exactly one explanation and then
 * never again — a permanently parked helper pill would be decoration on the
 * app's most-used control. A storage failure hides the hint rather than showing
 * it forever: a hint nobody can dismiss is worse than a hint nobody saw.
 */
export function useCoreHoldHint() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((seen) => {
        if (!cancelled && !seen) setVisible(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
    void AsyncStorage.setItem(STORAGE_KEY, '1').catch(() => {});
  }, []);

  return { visible, dismiss };
}
