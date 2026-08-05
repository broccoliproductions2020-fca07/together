import type * as HapticsModule from 'expo-haptics';

/**
 * Fire-and-forget haptic feedback.
 *
 * Haptics are a non-critical enhancement: they respect the OS setting
 * automatically (iOS "System Haptics", Android touch-feedback / vibration) — if
 * the user disables it there, these calls simply produce nothing.
 *
 * The native module is loaded lazily and defensively: `expo-haptics` throws when
 * its native side is absent (e.g. a dev client built before the dependency was
 * added, or web). Requiring it inside a try/catch — instead of a top-level
 * import — means a buzz can never crash the bundle at load or block a user
 * action; it just no-ops until the next native build.
 */
let cached: typeof HapticsModule | null | undefined;

function mod(): typeof HapticsModule | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('expo-haptics') as typeof HapticsModule;
  } catch {
    cached = null;
  }
  return cached;
}

function fire(run: (h: typeof HapticsModule) => Promise<void> | void) {
  const h = mod();
  if (!h) return;
  try {
    const result = run(h);
    if (result && typeof (result as Promise<void>).then === 'function') {
      (result as Promise<void>).catch(() => {});
    }
  } catch {
    // Non-critical: haptics must never throw into the UI.
  }
}

export const haptics = {
  /** Light tap — button presses, small confirmations. */
  light: () => fire((h) => h.impactAsync(h.ImpactFeedbackStyle.Light)),
  /** Medium tap — a more decisive/heavier action. */
  medium: () => fire((h) => h.impactAsync(h.ImpactFeedbackStyle.Medium)),
  /** Success buzz — a publish/join/create that went through. */
  success: () => fire((h) => h.notificationAsync(h.NotificationFeedbackType.Success)),
  /** Warning buzz — a blocked or failed action. */
  warning: () => fire((h) => h.notificationAsync(h.NotificationFeedbackType.Warning)),
  /** Selection tick — toggles, segmented controls, pickers. */
  selection: () => fire((h) => h.selectionAsync()),
};
