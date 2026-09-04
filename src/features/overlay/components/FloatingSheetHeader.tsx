import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeIn, useReducedMotion, type AnimatedStyle } from 'react-native-reanimated';

import { colorWithAlpha } from '@/features/map/utils/markerStyles';
import { TEXT_FLEXIBLE } from '@/shared/theme';
import { onColorTextColor } from '@/shared/utils/contrastColor';

/**
 * The top row every floating sheet opens with: icon, title, optional subtitle,
 * close.
 *
 * It exists because this row was already three copies of one intention — the
 * composer's own comment claimed it used "the same header the open sheet
 * uses", which nothing enforced and which the detail card then did not follow
 * at all (no icon tile, a larger title, and a close button positioned
 * absolutely OVER the content instead of sitting in the row).
 *
 * Colour comes from the SURFACE, not from the app theme, and that distinction
 * is the whole reason the copies could not simply be merged. The open sheet
 * and the composer are always dark — they take `FloatingSheet`'s default ink
 * surface regardless of the user's theme — while the detail card is the app's
 * card colour and turns near-white in light mode. A header following the app
 * theme would therefore be wrong for two of its three users. Passing the same
 * surface the host already gives `FloatingSheet` and measuring the ink off it
 * is right for all three, in both themes, with no variant to pick.
 *
 * Deliberately NOT for drill-ins. A participant list or a profile opens with a
 * back control, which is a different job: this header says what you are
 * looking at, that one says how to get out of it.
 */

/** Matches the avatar/control rhythm the sheets already use (44 dp with a
 * 17 dp radius reads as concentric inside the sheet's own corner). */
const ICON_TILE = 44;
const CLOSE_SIZE = 44;

export function FloatingSheetHeader({
  icon,
  accent,
  title,
  subtitle,
  surface,
  onClose,
  closeLabel,
  iconTileStyle,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  /** Tints the icon and its tile — the sheet's own colour, not a theme value. */
  accent: string;
  title: string;
  subtitle?: string;
  /** The sheet's resting background, so the ink can be measured against it. */
  surface: string;
  onClose: () => void;
  closeLabel: string;
  /**
   * Laid over the icon tile's own background. The composer changes mode by
   * DRAGGING, so its tile has to travel between the two mode colours instead
   * of snapping — a static accent would visibly step mid-gesture. The other
   * two sheets have one fixed accent and pass nothing.
   */
  iconTileStyle?: StyleProp<ViewStyle> | AnimatedStyle<ViewStyle>;
}) {
  const ink = onColorTextColor(surface);
  const reducedMotion = useReducedMotion();

  return (
    <View className="flex-row items-center gap-3 px-5 pb-3 pt-2">
      <Animated.View
        className="items-center justify-center"
        style={[
          {
            backgroundColor: colorWithAlpha(accent, 0.15),
            borderRadius: 17,
            height: ICON_TILE,
            width: ICON_TILE,
          },
          iconTileStyle,
        ]}
      >
        <Ionicons name={icon} size={20} color={accent} />
      </Animated.View>

      <View className="flex-1">
        <Text
          {...TEXT_FLEXIBLE}
          numberOfLines={2}
          className="text-xl font-extrabold tracking-[-0.35px]"
          style={{ color: ink }}
        >
          {title}
        </Text>
        {subtitle ? (
          /* Keyed so a changing subtitle cross-fades instead of swapping mid
             sentence, and announced POLITELY: in the composer it changes as a
             side effect of filling a field, and an assertive region would
             interrupt the person typing the very name that satisfied it. */
          <Animated.Text
            key={subtitle}
            entering={reducedMotion ? undefined : FadeIn.duration(220)}
            accessibilityLiveRegion="polite"
            {...TEXT_FLEXIBLE}
            numberOfLines={2}
            className="mt-0.5 text-sm"
            style={{ color: colorWithAlpha(ink, 0.55) }}
          >
            {subtitle}
          </Animated.Text>
        ) : null}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={closeLabel}
        className="items-center justify-center rounded-full active:opacity-70"
        style={{
          backgroundColor: colorWithAlpha(ink, 0.1),
          height: CLOSE_SIZE,
          width: CLOSE_SIZE,
        }}
        onPress={onClose}
      >
        <Ionicons name="close" size={20} color={colorWithAlpha(ink, 0.85)} />
      </Pressable>
    </View>
  );
}
