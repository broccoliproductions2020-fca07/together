import { Platform, type ViewStyle } from 'react-native';

/**
 * One shadow, drawn the same on both platforms.
 *
 * Every raised surface used to carry two unrelated descriptions of its shadow:
 * `shadowColor`/`shadowOffset`/`shadowOpacity`/`shadowRadius` for iOS and a
 * bare Material `elevation` for Android. Those are different models, not two
 * spellings of one — so the same card genuinely looked different per platform,
 * and tuning one never touched the other. `boxShadow` is native on both since
 * RN 0.76 and replaces the pair.
 *
 * Call this rather than writing `boxShadow` by hand, because two conversions
 * are easy to get wrong and invisible in review:
 *
 * - **The blur is DOUBLED.** iOS `shadowRadius` is a Gaussian sigma, CSS
 *   `blur-radius` is twice that — `RCTBoxShadow.mm` does `shadowRadius =
 *   blurRadius / 2` and Android's `OutsetBoxShadowDrawable` does `sigma =
 *   blurRadius * 0.5`. Carrying the old number over unchanged would halve
 *   every shadow in the app.
 * - **Colour and opacity merge.** `boxShadow` has no separate opacity field,
 *   so the alpha has to go into the colour.
 *
 * `elevation` is never emitted next to `boxShadow`: Android's
 * `ViewCompat.setElevation` and the box-shadow drawables are independent, so
 * a view carrying both draws BOTH shadows.
 */

/**
 * `OutsetBoxShadowDrawable` is `@RequiresApi(28)`; below that Android ignores
 * `boxShadow` silently. Those devices keep the Material elevation they had
 * before, so nothing loses its shadow in the migration.
 */
const ANDROID_BOX_SHADOW_MIN_API = 28;

const supportsBoxShadow =
  Platform.OS !== 'android' || Number(Platform.Version) >= ANDROID_BOX_SHADOW_MIN_API;

export interface ShadowSpec {
  /** Opaque colour — `opacity` supplies the alpha. */
  color: string;
  /** Downward offset in dp. The old `shadowOffset.height`. */
  offsetY: number;
  /** Sideways offset in dp. The old `shadowOffset.width`; almost always 0. */
  offsetX?: number;
  /** The old iOS `shadowRadius`. Doubled internally to reach the same blur. */
  radius: number;
  opacity: number;
  /** Grows the shadow before blurring. No iOS equivalent existed. */
  spread?: number;
  /**
   * The Material elevation this view carried before, used ONLY on Android
   * below API 28. Pass the old value so those devices are unchanged.
   */
  elevation?: number;
}

function withAlpha(color: string, alpha: number): string {
  const clamped = Math.max(0, Math.min(1, alpha));
  if (clamped >= 1) return color;

  const hex = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
  if (hex) {
    const full = hex.length === 3 ? [...hex].map((digit) => `${digit}${digit}`).join('') : hex;
    const red = Number.parseInt(full.slice(0, 2), 16);
    const green = Number.parseInt(full.slice(2, 4), 16);
    const blue = Number.parseInt(full.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, ${clamped})`;
  }
  if (/^rgb\(/i.test(color)) {
    return color.replace(/^rgb\(/i, 'rgba(').replace(/\)$/, `, ${clamped})`);
  }
  // `transparent`, an existing rgba() or a named colour: nothing to merge into.
  return color;
}

export function shadow({
  color,
  offsetY,
  offsetX = 0,
  radius,
  opacity,
  spread = 0,
  elevation,
}: ShadowSpec): ViewStyle {
  if (!supportsBoxShadow) {
    return elevation === undefined ? {} : { elevation };
  }
  return {
    boxShadow: [
      {
        offsetX,
        offsetY,
        blurRadius: radius * 2,
        spreadDistance: spread,
        color: withAlpha(color, opacity),
      },
    ],
  };
}
