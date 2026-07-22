import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * Current keyboard height in px (0 when hidden). Chat surfaces use this to
 * push their composer up with plain padding instead of relying on
 * `KeyboardAvoidingView` — which does not reliably resize inside the
 * absolutely-positioned detail sheet / a `<Modal>` on Android (a well-known
 * RN gap: the keyboard visually covers content instead of the layout
 * shrinking). Padding math based on the real keyboard height works
 * regardless of that.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (event) => {
      setHeight(event.endCoordinates?.height ?? 0);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => setHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return height;
}
