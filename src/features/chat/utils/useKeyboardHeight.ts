import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

/**
 * Live keyboard height as a Reanimated shared value (0 when hidden).
 *
 * Chat surfaces push their composer up with padding instead of relying on
 * `KeyboardAvoidingView`, which does not reliably resize inside an
 * absolutely-positioned sheet or a `<Modal>` on Android — the keyboard just
 * covers the content instead of the layout shrinking.
 *
 * This used to read `Keyboard.addListener`, which only reports the FINAL
 * height once the system animation has already begun. The composer therefore
 * snapped into place instead of travelling with the keyboard.
 * `useReanimatedKeyboardAnimation` reports the frame on every frame, on the UI
 * thread, so the composer now rides the keyboard exactly.
 */
export function useKeyboardHeight(): SharedValue<number> {
  const { height } = useReanimatedKeyboardAnimation();
  return height;
}

/**
 * Ready-made bottom padding that clears the keyboard, for a container that is
 * bottom-anchored. `extra` is the resting inset to keep when the keyboard is
 * closed (usually the safe-area bottom).
 *
 * The library reports height as a NEGATIVE offset while the keyboard rises, so
 * take the magnitude.
 */
export function useKeyboardPadding(extra = 0, enabled = true) {
  const height = useKeyboardHeight();

  return useAnimatedStyle(() => {
    const keyboard = enabled ? Math.abs(height.value) : 0;
    return { paddingBottom: Math.max(extra, keyboard) };
  }, [extra, enabled]);
}
