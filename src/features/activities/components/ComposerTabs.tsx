import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { FONT, TEXT_CAPPED, TYPE } from '@/shared/theme';

export type ComposerBench = 'time' | 'place' | 'audience' | 'capacity';

export interface ComposerTab {
  id: ComposerBench;
  label: string;
  value: string;
  /** False while the value is still the untouched default. */
  set: boolean;
  /** An activity cannot exist without it — marked, and blocking on submit. */
  required?: boolean;
  /** Only read for required tabs: does it carry a real answer yet? */
  satisfied?: boolean;
  disabled?: boolean;
  /**
   * Share of the strip, relative to the other tabs. Defaults to 1 (equal).
   *
   * FIXED per tab, never derived from the value currently in it. Equal widths
   * were the original rule and their point was stability — a long place name
   * must not push the other three tabs around — which a content-driven layout
   * would break outright. Weights keep that promise (a tab's width does not
   * depend on its text; overflow still ellipsizes) while letting the two tabs
   * that carry real content have more room than the two that carry a number.
   */
  weight?: number;
}

const EASE = Easing.bezier(0.22, 1, 0.36, 1);
const DURATION = 260;
/**
 * The panel's surface — OPAQUE, and that is the whole point.
 *
 * The active tab and the panel have to be pixel-identical, or the boundary
 * between them reads as a seam and the two stop looking like one object. A
 * translucent fill cannot promise that: the composer sheet is a stack of four
 * layers (base colour, mode wash, strong top wash, inner surface), so an alpha
 * fill inherits whatever happens to sit beneath it, and the tab and the panel
 * do not sit over the same thing. Measured on device, `rgba(255,255,255,0.055)`
 * came out as rgb(35,35,37) in the tab and rgb(31,32,36) in the panel — a
 * visible edge from a single shared constant.
 *
 * One opaque value removes the question entirely.
 */
const PANEL = '#232325';
/**
 * The strip behind the tabs is TRANSPARENT, and that is load-bearing.
 *
 * These fills are translucent, so a tint under the active tab does not sit
 * beside the panel's colour — it stacks on top of it. The active tab then
 * renders lighter than the panel it is supposed to continue into, and the
 * difference shows up as a seam exactly where the two must look like one piece.
 * Any future "subtle" strip background reintroduces that edge.
 */
const TAB_STRIP = 'transparent';
const TAB_HEIGHT = 56;
/** Deliberately NOT the destructive red: nothing has gone wrong, something is
 * still open. Red here would read as an error on a sheet you just opened. */
const MISSING = '#E8B98F';
const CARD_BORDER = 'rgba(255,255,255,0.09)';
/** A step the guide has not reached yet — label and value share it. */
const PENDING = 'rgba(244,245,247,0.34)';

export interface ComposerTabsProps {
  tabs: ComposerTab[];
  /** `null` closes every tab — the strip stays, the panel has no height. */
  active: ComposerBench | null;
  accent: string;
  onSelect: (id: ComposerBench) => void;
  /** Keeps the original card and panel while omitting the control strip. */
  showTabStrip?: boolean;
  children: ReactNode;
}

export function ComposerBenchCard({ children }: { children: ReactNode }) {
  return (
    <View style={styles.card}>
      <View style={styles.panel}>
        <View style={[styles.panelContent, styles.staticPanelContent]}>{children}</View>
      </View>
    </View>
  );
}

/**
 * A tab strip fused to its panel.
 *
 * The previous version had a pill row and, separately, a card below it — two
 * objects with a gap, so nothing said which control the open panel belonged to.
 * Here the active tab carries the SAME fill as the panel and only its top
 * corners are rounded, so the two form one continuous shape; the selection
 * slides between tabs instead of cutting.
 *
 * Tab widths come from FIXED per-tab weights, never from their contents. That
 * keeps what the original equal-width rule was protecting — a long place name
 * cannot push the other three tabs around, and the indicator is still pure
 * arithmetic with nothing to measure — while giving the two tabs that carry
 * real content more room than the two that carry a number.
 */
export function ComposerTabs({
  tabs,
  active,
  accent,
  onSelect,
  showTabStrip = true,
  children,
}: ComposerTabsProps) {
  const reducedMotion = useReducedMotion();
  const nativeMotion = Platform.OS !== 'web' && !reducedMotion;
  const [width, setWidth] = useState(0);
  const open = active != null;
  // While closed the indicator keeps its LAST position and only fades, so
  // reopening the same tab does not slide in from tab zero.
  const activeIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === active),
  );

  /**
   * The indicator's geometry, from the WEIGHTS — the same arithmetic Yoga does
   * for `flexBasis: 0` + `flexGrow: weight`, so the two cannot disagree. Still
   * no measuring of tab nodes: a measured indicator would lag its tab by a
   * frame on every layout change.
   */
  const weightSum = tabs.reduce((sum, tab) => sum + (tab.weight ?? 1), 0);
  const unit = weightSum > 0 ? width / weightSum : 0;
  const activeLeft =
    unit * tabs.slice(0, activeIndex).reduce((sum, tab) => sum + (tab.weight ?? 1), 0);
  const activeWidth = unit * (tabs[activeIndex]?.weight ?? 1);

  const offset = useDerivedValue(() => {
    return !nativeMotion || unit === 0
      ? activeLeft
      : withTiming(activeLeft, { duration: DURATION, easing: EASE });
  }, [activeLeft, nativeMotion, unit]);

  const indicatorWidth = useDerivedValue(() => {
    return !nativeMotion || unit === 0
      ? activeWidth
      : withTiming(activeWidth, { duration: DURATION, easing: EASE });
  }, [activeWidth, nativeMotion, unit]);

  const fade = useDerivedValue(() => {
    const target = open ? 1 : 0;
    return nativeMotion ? withTiming(target, { duration: DURATION, easing: EASE }) : target;
  }, [nativeMotion, open]);

  const indicatorStyle = useAnimatedStyle(
    () => ({
      transform: [{ translateX: offset.value }],
      width: indicatorWidth.value,
      opacity: unit > 0 ? fade.value : 0,
    }),
    [unit],
  );


  /**
   * The panel's height is ANIMATED, and that is what makes a bench swap read as
   * one movement instead of a jump.
   *
   * The benches are very different heights (a map preview against a slider), so
   * swapping them used to resize the sheet in a single frame. A layout
   * animation on the card could not fix it: those run on the UI thread without
   * re-running Yoga for ancestors, so `FloatingSheet` still measured the final
   * height at once and snapped while the card was still travelling. Animating
   * `height` as a real style prop DOES re-layout upwards, so the sheet follows
   * frame by frame — the same mechanism the chat sheet uses, and the same cost
   * (an `onLayout` per frame while it runs).
   */
  const panelHeight = useSharedValue(0);
  const measuredRef = useRef(0);

  const measurePanel = useCallback(
    (height: number) => {
      if (height <= 0 || Math.abs(measuredRef.current - height) < 0.5) return;
      measuredRef.current = height;
      panelHeight.value = nativeMotion ? withTiming(height, { duration: DURATION, easing: EASE }) : height;
    },
    [nativeMotion, panelHeight],
  );

  useEffect(() => {
    if (open) return;
    // Closing SNAPS. There is nothing left to watch collapse — the bench
    // unmounts with the panel — and an empty box shrinking for a quarter of a
    // second reads as a stutter rather than as making room.
    measuredRef.current = 0;
    panelHeight.value = 0;
  }, [open, panelHeight]);

  const panelStyle = useAnimatedStyle(() => ({ height: panelHeight.value }), [panelHeight]);

  return (
    <Animated.View style={styles.card}>
      {showTabStrip ? (
        <View style={styles.strip} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
          <Animated.View pointerEvents="none" style={[styles.indicator, indicatorStyle]} />
          {tabs.map((tab) => {
            const isActive = tab.id === active;
            const missing = tab.required === true && tab.satisfied === false;
            return (
              <Pressable
                key={tab.id}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive, disabled: tab.disabled }}
                accessibilityLabel={`${tab.label}: ${tab.value}${missing ? ', fehlt noch' : ''}`}
                disabled={tab.disabled}
                // Reported even for the already-active tab: a tap on a tab always
                // means "I am done typing", and the sheet needs to hear it so it
                // can put the keyboard away. The haptic and the state change stay
                // guarded by the caller, so a re-tap is otherwise a no-op.
                onPress={() => onSelect(tab.id)}
                style={[
                  styles.tab,
                  { flexGrow: tab.weight ?? 1 },
                  tab.disabled && styles.tabDisabled,
                ]}
              >
                <View style={styles.labelRow}>
                  {/* The label carries the colour, so it follows the SAME rule as
                      the value: grey until the walk has passed this step, accent
                      once it has. An accent label on an untouched tab was the
                      whole strip claiming to be decided from the first frame —
                      and it made the greyed value read as a rendering fault
                      rather than as "not your turn yet". */}
                  <Text
                    style={[
                      styles.label,
                      {
                        color: missing ? MISSING : isActive || tab.set ? accent : PENDING,
                      },
                    ]}
                    numberOfLines={1}
                    {...TEXT_CAPPED}
                  >
                    {tab.label}
                  </Text>
                  {/* Only ever on a required tab that is still unanswered. A
                      satisfied tab carries NO badge: two of four tabs wearing a
                      permanent tick is decoration, and the value's own contrast
                      already separates "meine Entscheidung" from "Default". */}
                  {missing ? <View style={styles.missingDot} /> : null}
                </View>
                <Text
                  style={[
                    styles.value,
                    {
                      color: missing ? MISSING : isActive || tab.set ? '#F4F5F7' : PENDING,
                    },
                    // Full weight is the "someone decided this" signal. A default
                    // stays visibly lighter, so the strip reads at a glance.
                    !missing && !tab.set && styles.valueDefault,
                  ]}
                  numberOfLines={1}
                  {...TEXT_CAPPED}
                >
                  {tab.value}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {/* Unmounted, not merely hidden, while closed: a zero-height panel still
          holds its padding and its border, which reads as an empty strip glued
          under the tabs. */}
      {open ? (
        <Animated.View style={[styles.panel, panelStyle]}>
          {/* The bench is measured at its NATURAL height and the panel clips it
              down to the animated one, so the measurement never chases the
              animation it feeds. Absolute, therefore, and stretched to the
              panel's width — the padding rides with it so the measured height
              is the height the panel has to reach.
              Keyed so each bench fades in on its own. Only `entering` is used:
              an exit animation under a height transition flickers on Android,
              and the panel resizing already reads as the swap. */}
          <Animated.View
            key={active}
            entering={nativeMotion ? FadeIn.duration(190) : undefined}
            onLayout={(event) => measurePanel(event.nativeEvent.layout.height)}
            style={styles.panelContent}
          >
            {children}
          </Animated.View>
        </Animated.View>
      ) : null}

    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderColor: CARD_BORDER,
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  /**
   * Pinned to the CARD's bottom-right corner, so with a workbench open it sits
   * at the far end of that bench rather than beside the tabs it reports on.
   * (`top: 8` puts it in the strip instead — same right-hand margin, and the
   * mark then stays put no matter which bench is open.)
   *
   * Either way it stays inside the last tab's own right-hand margin: "ANZAHL"
   * is the longest LABEL in the strip (~46 px, centred in ~76 px), which is why
   * Anzahl carries a heavier weight than Wer despite holding the shorter value.
   */
  indicator: {
    backgroundColor: PANEL,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    // Overlaps the panel by a pixel. Two views that merely touch can still
    // leave a hairline of the sheet showing between them once the layout lands
    // on a fractional pixel, and a hairline is exactly the edge this is meant
    // to remove. The card clips the overhang.
    bottom: -1,
    left: 0,
    position: 'absolute',
    top: 0,
  },
  label: {
    fontFamily: FONT.semibold,
    fontSize: TYPE.micro.fontSize,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  labelRow: { alignItems: 'center', flexDirection: 'row', gap: 4, maxWidth: '100%' },
  missingDot: { backgroundColor: MISSING, borderRadius: 3, height: 5, width: 5 },
  panel: { backgroundColor: PANEL, overflow: 'hidden' },
  panelContent: {
    left: 0,
    paddingBottom: 14,
    paddingHorizontal: 13,
    paddingTop: 12,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  staticPanelContent: { position: 'relative' },
  strip: { backgroundColor: TAB_STRIP, flexDirection: 'row', height: TAB_HEIGHT },
  /** `flexGrow` comes from the tab's own weight — see `ComposerTab.weight`. */
  tab: {
    alignItems: 'center',
    flexBasis: 0,
    gap: 2,
    justifyContent: 'center',
    minWidth: 0,
    paddingHorizontal: 4,
  },
  tabDisabled: { opacity: 0.45 },
  value: { fontFamily: FONT.bold, fontSize: TYPE.caption.fontSize, letterSpacing: -0.2 },
  valueDefault: { fontFamily: FONT.medium },
});
