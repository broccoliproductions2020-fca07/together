import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { BackHandler, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeyboardHeight } from '@/features/chat/utils/useKeyboardHeight';
import { concentricRadius, FLOATING_SHEET, MOTION } from '@/shared/theme';

export interface OriginRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Measures the control a sheet grows out of.
 *
 * Asked again on CLOSE, never cached from the open. A frozen rect makes the way
 * in look right and the way back wrong: by then the map may have panned, the
 * core may be closed, and the sheet would shrink into a spot where nothing is.
 */
function measureOrigin(ref?: RefObject<View | null>): Promise<OriginRect | null> {
  return new Promise((resolve) => {
    const node = ref?.current;
    if (!node) {
      resolve(null);
      return;
    }
    node.measureInWindow((x, y, width, height) => {
      const usable =
        Number.isFinite(x) && Number.isFinite(y) && width > 0 && height > 0 && height < 400;
      resolve(usable ? { x, y, width, height } : null);
    });
  });
}

export interface FloatingSheetProps {
  visible: boolean;
  onRequestClose: () => void;
  /** The control the sheet morphs out of. Without one it grows from its own base. */
  originRef?: RefObject<View | null>;
  /**
   * The origin for hosts whose anchor is NOT a React view — a native map
   * marker, for instance, which is an image the renderer owns and has no node
   * to measure. Asked on open AND on close, for the same reason `originRef` is
   * re-measured: by the time the sheet leaves, the map may have panned and the
   * anchor may be somewhere else entirely, or gone.
   *
   * Takes precedence over `originRef`. Returning `null` is a legitimate answer
   * — the sheet then grows from its own base rather than landing somewhere
   * arbitrary, which is the same fallback a missing ref gets.
   */
  resolveOrigin?: () => Promise<OriginRect | null>;
  /**
   * The morph's 0→1 value, owned by the host so the ORIGIN can fade on exactly
   * the same number. Handing over at a threshold instead draws both at once,
   * and two translucent copies of one control stack into a visible flash.
   */
  progress?: SharedValue<number>;
  /** Fires once the exit morph has landed and the sheet has unmounted. */
  onClosed?: () => void;
  /**
   * How much of the screen the sheet covers from the bottom edge, so a host
   * that draws behind it can keep its subject in the strip that stays visible
   * (the map centres a selected marker this way).
   *
   * Deliberately the RESTING geometry — the sheet's own margin plus its
   * settled height — never a frame of the morph or the keyboard lift. A number
   * that moved with the animation would have the camera chasing the sheet, and
   * every frame would answer with a camera move of its own. Reports 0 once the
   * sheet is gone.
   */
  onHeightChange?: (coveredHeight: number) => void;
  /**
   * Leaves without the exit morph.
   *
   * For the case where the anchor is being destroyed in the same gesture — a
   * cancelled activity, whose marker plays its own burst. Flying the sheet back
   * into a marker that is bursting puts two animations on one spot, and the
   * sheet would be travelling toward something that no longer exists by the
   * time it arrives. Read at close time, so the host sets it before hiding.
   */
  instantClose?: boolean;
  /** The sheet's resting surface. */
  surfaceColor?: string;
  borderColor?: string;
  /** The grabber reads against the SURFACE, so it cannot be one constant: the
   * default is tuned for the dark composer and all but disappears on a light
   * card. */
  grabberColor?: string;
  /** The origin's colours, so the morph starts looking like the control it came from. */
  originColor?: string;
  originBorderColor?: string;
  /** Ceiling only — the sheet is as tall as its content until it hits this. */
  maxHeightFraction?: number;
  /**
   * Lifts the whole sheet clear of the keyboard.
   *
   * Opt-in, because most floating sheets have no text input and a sheet that
   * reacts to a keyboard it never raises is a sheet that can be shoved off
   * screen by a keyboard belonging to something else. The lift is applied to
   * the same animated `top` the morph writes, so the two compose instead of
   * fighting — a second wrapper with its own transform would double-count.
   */
  avoidKeyboard?: boolean;
  /**
   * Painted behind EVERYTHING inside the sheet — the grabber strip and the
   * safe-area padding included, not just the host's own content.
   *
   * A host that tints its surface (the composer's mode wash) must paint it
   * here, never inside `children`: the grabber sits above the children and the
   * bottom inset below them, so a wash confined to the content left both
   * strips showing the raw surface colour. Measured on device that was
   * rgb(11,16,22) against a rgb(19,21,24) body — a black band top and bottom.
   */
  surfaceLayer?: ReactNode;
  accessibilityLabel?: string;
  children: ReactNode;
}

/**
 * A sheet that floats: it keeps the same narrow margin to all four screen edges
 * and never touches them, so the map stays visible around it. It is
 * bottom-oriented — leftover height stays at the top, where the map is worth
 * seeing — and it is exactly as tall as its content allows.
 *
 * There is deliberately NO backdrop. The map is not dimmed and stays tappable
 * (same contract as `MarkerDetailSheet`), which is also why this cannot be a
 * native `Modal`: a Modal is its own window and would swallow every touch that
 * is not aimed at the sheet.
 */
export function FloatingSheet({
  visible,
  onRequestClose,
  originRef,
  resolveOrigin,
  progress: externalProgress,
  onClosed,
  onHeightChange,
  instantClose = false,
  surfaceColor = '#0B1016',
  borderColor = 'rgba(255,255,255,0.10)',
  grabberColor = 'rgba(255,255,255,0.22)',
  originColor = 'rgba(59,130,246,0.16)',
  originBorderColor = 'rgba(59,130,246,0.72)',
  maxHeightFraction = FLOATING_SHEET.maxHeightFraction,
  avoidKeyboard = false,
  surfaceLayer,
  accessibilityLabel,
  children,
}: FloatingSheetProps) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  // Negative while the keyboard rises — see useKeyboardHeight.
  const keyboardHeight = useKeyboardHeight();

  const [mounted, setMounted] = useState(false);
  /** 0 until the content has laid itself out once; the open waits for it. */
  const [contentHeight, setContentHeight] = useState(0);

  const internalProgress = useSharedValue(0);
  const progress = externalProgress ?? internalProgress;
  const dragY = useSharedValue(0);
  const originX = useSharedValue(0);
  const originY = useSharedValue(0);
  const originW = useSharedValue(0);
  const originH = useSharedValue(0);
  const originR = useSharedValue(0);
  /**
   * Where the sheet RESTS, as animated values rather than as the plain numbers
   * they are derived from.
   *
   * Content that changes size while the sheet is open — a fanned-out row, a
   * drill-in, a longer list — re-measures on every frame of its own layout
   * animation. Interpolating straight to the derived number meant each of
   * those frames snapped the sheet to a new height through a React re-render:
   * a card growing smoothly inside a container that stepped after it. Springing
   * these instead keeps the resize on the UI thread and turns the steps into
   * one movement.
   */
  const restHeight = useSharedValue(0);
  const restTop = useSharedValue(0);
  /** False until the first measurement has been placed without animating. */
  const restSettledRef = useRef(false);

  const { inset, screenRadius } = FLOATING_SHEET;
  const radius = concentricRadius(screenRadius, inset);
  const targetLeft = inset;
  const targetWidth = Math.max(0, windowWidth - inset * 2);
  // Geometry is measured from the SCREEN edge on every side, so the border is
  // the same width all the way around. Safe-area insets are content padding,
  // never sheet geometry — respecting them here is what made the bottom gap
  // read as wrong while the sides looked right.
  const maxHeight = Math.round(Math.max(0, windowHeight - inset * 2) * maxHeightFraction);
  const targetHeight = contentHeight > 0 ? Math.min(contentHeight, maxHeight) : maxHeight;
  const targetTop = windowHeight - inset - targetHeight;
  /** Keeps the footer clear of the home indicator without widening the border. */
  const contentInsetBottom = Math.max(0, insets.bottom - inset);
  /**
   * How far the sheet may ride the keyboard up — never past the safe area.
   *
   * The lift used to be the raw keyboard height, which is fine for a short
   * sheet and wrong for a tall one: a sheet already covering 80% of the screen
   * plus a 40% keyboard put its header, its close button and its title above
   * the top edge. Clamping keeps the way out reachable and lets the inner
   * ScrollView do the rest.
   */
  const maxLift = Math.max(0, targetTop - (insets.top + inset));

  /**
   * Callbacks are held in refs so their identity cannot re-trigger the effects
   * below. Hosts pass inline arrows, which change on every parent render — and
   * a re-run mid-close restarts the exit spring from wherever it happens to be.
   */
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;
  const onRequestCloseRef = useRef(onRequestClose);
  onRequestCloseRef.current = onRequestClose;
  const onHeightChangeRef = useRef(onHeightChange);
  onHeightChangeRef.current = onHeightChange;
  const resolveOriginRef = useRef(resolveOrigin);
  resolveOriginRef.current = resolveOrigin;
  const instantCloseRef = useRef(instantClose);
  instantCloseRef.current = instantClose;
  /** Set while an open is waiting for its first content measurement. */
  const openPendingRef = useRef(false);

  const requestClose = useCallback(() => {
    onRequestCloseRef.current();
  }, []);

  /**
   * Both origin kinds through one door, so open and close cannot end up asking
   * different questions. Held in a ref rather than taken as a dependency: hosts
   * pass inline arrows, and a re-run mid-close restarts the exit spring from
   * wherever it currently is.
   */
  const askOrigin = useCallback((): Promise<OriginRect | null> => {
    const resolver = resolveOriginRef.current;
    if (resolver) return resolver().catch(() => null);
    return measureOrigin(originRef);
  }, [originRef]);

  /**
   * Falls back to the sheet's own bottom edge. Growing out of your own base is
   * a deliberate opening in its own right, not a downgraded morph — half the
   * entry points will never have a visible origin.
   */
  const applyOrigin = useCallback(
    (rect: OriginRect | null) => {
      const resolved: OriginRect = rect ?? {
        x: targetLeft + targetWidth / 2 - 44,
        y: targetTop + targetHeight - 30,
        width: 88,
        height: 44,
      };
      originX.value = resolved.x;
      originY.value = resolved.y;
      originW.value = resolved.width;
      originH.value = resolved.height;
      originR.value = resolved.height / 2;
    },
    [originH, originR, originW, originX, originY, targetHeight, targetLeft, targetTop, targetWidth],
  );

  const finishClose = useCallback(() => {
    setMounted(false);
    onHeightChangeRef.current?.(0);
    // Cleared so the next open measures again and its wait actually fires; an
    // unchanged value would not re-run the effect that starts the animation.
    setContentHeight(0);
    onClosedRef.current?.();
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (visible) {
      void askOrigin().then((rect) => {
        if (cancelled) return;
        applyOrigin(rect);
        dragY.value = 0;
        openPendingRef.current = true;
        setMounted(true);
      });
      return () => {
        cancelled = true;
      };
    }

    if (!mounted) return;

    void askOrigin().then((rect) => {
      if (cancelled) return;
      applyOrigin(rect);
      openPendingRef.current = false;
      // An anchor that is being destroyed gets no flight back into it.
      if (reducedMotion || instantCloseRef.current) {
        progress.value = 0;
        dragY.value = 0;
        finishClose();
        return;
      }
      dragY.value = withSpring(0, MOTION.settle);
      progress.value = withSpring(0, MOTION.sheet, (finished) => {
        'worklet';
        if (finished) runOnJS(finishClose)();
      });
    });

    return () => {
      cancelled = true;
    };
    // `mounted` is read, not tracked: adding it would re-run the exit on its own
    // state change and cancel the animation it just started.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, applyOrigin, askOrigin, dragY, finishClose, progress, reducedMotion]);

  /**
   * The open waits for the first content measurement. Starting earlier means
   * the first frames animate toward the fallback ceiling and then jump when the
   * real height arrives — a visible hitch at the one moment everything is
   * moving anyway, so it would look like a stutter rather than a correction.
   */
  useEffect(() => {
    if (!openPendingRef.current || contentHeight <= 0) return;
    openPendingRef.current = false;
    progress.value = reducedMotion ? 1 : withSpring(1, MOTION.sheet);
  }, [contentHeight, progress, reducedMotion]);

  useEffect(() => {
    if (!mounted) {
      restSettledRef.current = false;
      return;
    }
    // The first placement of an open must be instant: springing from zero would
    // play a resize the user never asked for, on top of the entry morph.
    if (!restSettledRef.current || reducedMotion) {
      restHeight.value = targetHeight;
      restTop.value = targetTop;
      restSettledRef.current = contentHeight > 0;
      return;
    }
    restHeight.value = withSpring(targetHeight, MOTION.settle);
    restTop.value = withSpring(targetTop, MOTION.settle);
  }, [contentHeight, mounted, reducedMotion, restHeight, restTop, targetHeight, targetTop]);

  /**
   * Reported from the settled geometry, never from the animation: `targetTop`
   * is where the sheet comes to rest, so this is stable while the morph and the
   * keyboard lift move the sheet around.
   */
  useEffect(() => {
    if (!mounted || contentHeight <= 0) return;
    onHeightChangeRef.current?.(Math.max(0, windowHeight - targetTop));
  }, [contentHeight, mounted, targetTop, windowHeight]);

  /** A native Modal would give this for free; an overlay has to ask for it. */
  useEffect(() => {
    if (!visible) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      requestClose();
      return true;
    });
    return () => subscription.remove();
  }, [visible, requestClose]);

  const pan = Gesture.Pan()
    .onUpdate((event) => {
      // Upward drag is resisted rather than blocked: a dead control reads as
      // broken, a stiff one reads as "this is as far as it goes".
      dragY.value = event.translationY > 0 ? event.translationY : event.translationY * 0.22;
    })
    .onEnd((event) => {
      if (event.translationY > MOTION.dismissDistance || event.velocityY > MOTION.dismissVelocity) {
        runOnJS(requestClose)();
        return;
      }
      dragY.value = withSpring(0, MOTION.settle);
    });

  const containerStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const width = interpolate(p, [0, 1], [originW.value, targetWidth]);
    const height = interpolate(p, [0, 1], [originH.value, restHeight.value]);
    // Scaled by the morph so a sheet opening with the keyboard already up grows
    // from its origin and arrives lifted, rather than starting above the origin.
    const lift = avoidKeyboard ? Math.min(Math.abs(keyboardHeight.value), maxLift) * p : 0;
    return {
      left: interpolate(p, [0, 1], [originX.value, targetLeft]),
      top: interpolate(p, [0, 1], [originY.value, restTop.value]) + dragY.value - lift,
      width,
      height,
      borderRadius: interpolate(p, [0, 1], [originR.value, radius]),
      backgroundColor: interpolateColor(p, [0, 0.55], [originColor, surfaceColor]),
      borderColor: interpolateColor(p, [0, 0.55], [originBorderColor, borderColor]),
      // The origin fades in on the SAME window, inverted, so the two never
      // overlap at full strength and never leave a gap between them.
      opacity: interpolate(p, [0, MOTION.originCrossfade], [0, 1], Extrapolation.CLAMP),
    };
  });

  /**
   * The content keeps its final WIDTH from the first frame and is merely
   * clipped by the shrinking container. Letting it re-measure at every
   * intermediate width would re-wrap text and re-run list layout on every
   * frame — which looks worse than no animation and costs the frames too.
   * Height is deliberately left free: it is what we are measuring.
   */
  const contentStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const width = interpolate(p, [0, 1], [originW.value, targetWidth]);
    return {
      transform: [{ translateX: (width - targetWidth) / 2 }],
      opacity: interpolate(p, MOTION.contentFade, [0, 1], Extrapolation.CLAMP),
    };
  });

  if (!mounted) return null;

  return (
    <GestureHandlerRootView
      pointerEvents="box-none"
      style={{ bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 }}
    >
      <Animated.View
        accessibilityViewIsModal
        accessibilityLabel={accessibilityLabel}
        style={[{ borderWidth: 1, overflow: 'hidden', position: 'absolute' }, containerStyle]}
      >
        <Animated.View
          onLayout={(event) => setContentHeight(Math.ceil(event.nativeEvent.layout.height))}
          style={[
            { left: 0, maxHeight, position: 'absolute', top: 0, width: targetWidth },
            contentStyle,
          ]}
        >
          {/* Behind the grabber and the bottom inset too, so a tinted surface
              covers the sheet edge to edge instead of leaving both strips
              showing the base colour. */}
          {surfaceLayer ? (
            <View
              pointerEvents="none"
              style={{ bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 }}
            >
              {surfaceLayer}
            </View>
          ) : null}

          {/*
            The drag gesture sits on the grabber ONLY. Across the whole surface
            it fights every inner ScrollView for the same vertical touch, and
            the visible failure is a list that scrolls while the sheet also
            moves. The grabber is also the affordance, so the two agree.
          */}
          <GestureDetector gesture={pan}>
            <View
              accessibilityRole="button"
              accessibilityLabel="Schließen"
              accessibilityHint="Nach unten ziehen schließt ebenfalls"
              onAccessibilityTap={requestClose}
              style={{ alignItems: 'center', paddingBottom: 6, paddingTop: 10 }}
            >
              <View
                style={{
                  backgroundColor: grabberColor,
                  borderRadius: 2,
                  height: 4,
                  width: 40,
                }}
              />
            </View>
          </GestureDetector>

          {/* `flexShrink` and no `flex: 1`: the sheet must be free to be short.
              A flex-1 child would claim the ceiling height every time, which is
              exactly the fixed-height behaviour this replaced. */}
          <View style={{ flexShrink: 1, paddingBottom: contentInsetBottom }}>{children}</View>
        </Animated.View>
      </Animated.View>
    </GestureHandlerRootView>
  );
}
