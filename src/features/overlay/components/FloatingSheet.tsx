import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { BackHandler, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeyboardHeight } from '@/features/chat/utils/useKeyboardHeight';
import { concentricRadius, FLOATING_SHEET, MOTION } from '@/shared/theme';

/**
 * The default resting surface. Named rather than inlined because a host that
 * keeps it still has to tell the header what its ink is measured against, and
 * two copies of one literal is how those two quietly drift apart.
 */
export const FLOATING_SHEET_SURFACE = '#0B1016';

/** Short and monotonic on purpose — see the resize effect below. */
const RESIZE_EASE = { duration: 140, easing: Easing.out(Easing.quad) };

/**
 * How long the entry may wait for its first content measurement before it
 * opens anyway. Long enough that a normal open always measures first and keeps
 * the exact geometry it animates to; short enough that a sheet which never
 * measures is a stumble rather than a dead surface.
 */
const OPEN_MEASUREMENT_GRACE = 400;

export interface OriginRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A way to ASK where the sheet came from, handed over instead of a measured
 * rect.
 *
 * The distinction is the whole contract: a host that passes a NUMBER has frozen
 * it at tap time, and the way back then flies into wherever that control used
 * to be. A host that passes a FUNCTION is re-asked on close, so a control that
 * moved, retracted or disappeared answers honestly — including with `null`.
 */
export type SheetOriginResolver = () => Promise<OriginRect | null>;

/**
 * Measures the control a sheet grows out of.
 *
 * Asked again on CLOSE, never cached from the open. A frozen rect makes the way
 * in look right and the way back wrong: by then the map may have panned, the
 * core may be closed, and the sheet would shrink into a spot where nothing is.
 *
 * Exported so a host building its own `resolveOrigin` measures with the SAME
 * guards — a second copy of this is how one entry point starts accepting a
 * degenerate rect the sheet would have rejected.
 */
export function measureSheetOrigin(ref?: RefObject<View | null>): Promise<OriginRect | null> {
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
  /** Remounts the measuring surface when its semantic content changes. */
  contentKey?: string;
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
  /** Optional screen frame for a host that needs more separation from the map. */
  frameInset?: number;
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
  contentKey,
  instantClose = false,
  surfaceColor = FLOATING_SHEET_SURFACE,
  borderColor = 'rgba(255,255,255,0.10)',
  grabberColor = 'rgba(255,255,255,0.22)',
  originColor = 'rgba(59,130,246,0.16)',
  originBorderColor = 'rgba(59,130,246,0.72)',
  maxHeightFraction = FLOATING_SHEET.maxHeightFraction,
  frameInset = FLOATING_SHEET.inset,
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
  const [contentMeasurementRevision, setContentMeasurementRevision] = useState(0);

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

  const { screenRadius } = FLOATING_SHEET;
  const inset = Math.max(1, frameInset);
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
  /** True once that wait has run past its grace period — see the watchdog. */
  const overdueRef = useRef(false);
  /**
   * 1 while the entry morph is still flying.
   *
   * The gate below re-runs on every content measurement, and re-issuing
   * `withSpring` restarts it from the current value with velocity ZERO. Content
   * that measures more than once — a chat preview resolving, an avatar landing,
   * a row animating its own height — therefore kept knocking the morph back to
   * a standstill, and it stalls inside the worst possible window: past
   * `originCrossfade` (0.12) the card is already fully opaque, but
   * `contentFade` does not begin until 0.4, so what stands on screen is an
   * opaque card in the ORIGIN colour with nothing in it. On an activity marker
   * that is a green or amber empty card, for as long as the re-measures keep
   * arriving — which on a slow device is long enough to read as a dead sheet.
   */
  const openFlight = useSharedValue(0);
  /**
   * Bumped on every open, purely so the gate below re-evaluates.
   *
   * `openPendingRef` is a ref, which React cannot see. The gate used to hang
   * off `contentHeight` alone, so it only fired when the measurement CHANGED —
   * and a re-open that skipped `finishClose` still carries the previous
   * height. Same activity, same height, no change, no gate: the sheet mounted
   * at progress 0 (fully transparent) and the exit spring still in flight then
   * unmounted it again. A dead tap with no error, until any reload cleared the
   * stale height.
   */
  const [openTicket, setOpenTicket] = useState(0);
  /** Read by the exit spring's callback, which can land after a re-open. */
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

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
    return measureSheetOrigin(originRef);
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
    // The exit animation outlives the state that started it: a re-open during
    // the flight leaves this callback queued, and honouring it would unmount
    // the sheet the host is currently asking for.
    if (visibleRef.current) return;
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
        setOpenTicket((ticket) => ticket + 1);
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
      // The exit owns `progress` from here; a stale flight flag would let a
      // later re-measure decide the entry morph still had somewhere to go.
      openFlight.value = 0;
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
   * A floor under the entry, because the failure it catches is the worst one
   * this component has: the sheet mounts, `progress` never leaves 0, and what
   * stands on screen is the bare origin rect — 56 dp of marker-shaped card with
   * its content clipped away entirely. Taps do nothing, there is no error, and
   * nothing on screen says a sheet is open. Measured on a device in exactly
   * that state (September 2026): the container sat at 147×147 px on a 420 dpi
   * screen — the origin to the pixel — with not one child in the view tree.
   *
   * The gate below is guarded by `contentHeight > 0`, so anything that stops
   * the content from reporting a height strands the sheet for good. Rather
   * than enumerate those paths, this bounds them: after 400 ms the sheet opens
   * whether or not it was ever measured. `targetHeight` falls back to the
   * ceiling without a measurement, so the worst case is a sheet that opens at
   * full height and settles down — visible and usable, which a stranded one is
   * not. Cleared as soon as the real measurement arrives.
   */
  useEffect(() => {
    if (!visible || !mounted || contentHeight > 0) {
      overdueRef.current = false;
      return;
    }
    const timer = setTimeout(() => {
      overdueRef.current = true;
      setOpenTicket((ticket) => ticket + 1);
    }, OPEN_MEASUREMENT_GRACE);
    return () => clearTimeout(timer);
  }, [contentHeight, mounted, visible]);

  /**
   * The open waits for the first content measurement. Starting earlier means
   * the first frames animate toward the fallback ceiling and then jump when the
   * real height arrives — a visible hitch at the one moment everything is
   * moving anyway, so it would look like a stutter rather than a correction.
   * It waits, but not indefinitely: the watchdog above substitutes for a
   * measurement that never came, so the wait can delay an open, never cancel
   * one.
   */
  useEffect(() => {
    if (!visible || !mounted || (contentHeight <= 0 && !overdueRef.current)) return;
    /*
     * Stated as an INVARIANT, not as a transition: while the host wants this
     * sheet and the sheet has measured itself, `progress` ends at 1. The old
     * version fired once off `openPendingRef`, so every path that lost that
     * one shot — a close whose `finishClose` was skipped by a re-open, an
     * origin promise resolving after the exit spring — left the sheet mounted
     * at a progress nobody would write again. Two such bugs have already been
     * fixed here (see `openTicket`); this closes the class instead.
     *
     * The early return keeps a content resize from restarting a spring that
     * has nowhere to go — and `visible` keeps it out of the exit animation's
     * way, which owns `progress` from the moment the host closes the sheet.
     *
     * `openFlight` extends the same early return to a spring that is still on
     * its way: the invariant is "progress ENDS at 1", not "re-issue the
     * animation", and re-issuing it is what stalled the morph (see the flag).
     */
    if (!openPendingRef.current && (progress.value >= 1 || openFlight.value === 1)) return;
    openPendingRef.current = false;
    if (reducedMotion) {
      progress.value = 1;
      return;
    }
    openFlight.value = 1;
    progress.value = withSpring(1, MOTION.sheet, (finished) => {
      'worklet';
      if (finished) openFlight.value = 0;
    });
  }, [contentHeight, mounted, openFlight, openTicket, progress, reducedMotion, visible]);

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
    // Timing, NOT a spring. `MOTION.settle` sits at a damping ratio of ~0.79,
    // so it overshoots by design — which is right for a drag settling back and
    // exactly wrong for a resize, where overshoot IS visible bouncing. The
    // target also moves: content re-measures on every frame of its own layout
    // animation, restarting this on each one. A short monotonic ease therefore
    // behaves as a smoother — it rounds off the per-frame steps and can never
    // ring, however often it is re-started.
    restHeight.value = withTiming(targetHeight, RESIZE_EASE);
    restTop.value = withTiming(targetTop, RESIZE_EASE);
  }, [contentHeight, mounted, reducedMotion, restHeight, restTop, targetHeight, targetTop]);

  /**
   * Reported from the settled geometry, never from the animation: `targetTop`
   * is where the sheet comes to rest, so this is stable while the morph and the
   * keyboard lift move the sheet around.
   */
  useEffect(() => {
    if (!mounted || contentHeight <= 0) return;
    onHeightChangeRef.current?.(Math.max(0, windowHeight - targetTop));
  }, [contentHeight, contentMeasurementRevision, mounted, targetTop, windowHeight]);

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
    /*
     * A PLAIN View, never a second `GestureHandlerRootView`.
     *
     * The app already mounts one at the root (`app/_layout.tsx`), and a nested
     * one installs its own touch orchestrator that intercepts in
     * `dispatchTouchEvent` — before React Native's `pointerEvents` is ever
     * consulted. Measured on device: with a sheet open, a 500 ms swipe on bare
     * map far ABOVE the sheet moved 0 of 18 000 sampled pixels, and marker taps
     * did nothing. That is the exact opposite of this component's contract —
     * the map stays live around the sheet, which is why this is not a Modal.
     * RNGH says so itself in the log: "Gesture handler is already enabled for
     * a parent view".
     */
    <View
      pointerEvents="box-none"
      style={{ bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 }}
    >
      <Animated.View
        accessibilityViewIsModal
        accessibilityLabel={accessibilityLabel}
        style={[{ borderWidth: 1, overflow: 'hidden', position: 'absolute' }, containerStyle]}
      >
        <Animated.View
          onLayout={(event) => {
            setContentHeight(Math.ceil(event.nativeEvent.layout.height));
            setContentMeasurementRevision((revision) => revision + 1);
          }}
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
              exactly the fixed-height behaviour this replaced.

              `contentKey` sits HERE, on a plain View, and never on the animated
              parent above. Remounting a view that carries a `useAnimatedStyle`
              re-attaches that style to a fresh native tag, and the fresh tag
              starts on the style's INITIAL value — which for `contentFade`
              [0.4, 0.86] at progress 0 is opacity 0. If `progress` is already
              resting at 1 (the sheet is open and simply switched selection),
              nothing ever writes it again, so the new view stays invisible for
              good: a correctly framed, perfectly empty white sheet, grabber and
              wash included. Keying the children instead gives the same reset —
              fresh measurement, no carried-over child state — without ever
              recreating an animated view. */}
          <View key={contentKey} style={{ flexShrink: 1, paddingBottom: contentInsetBottom }}>
            {children}
          </View>
        </Animated.View>
      </Animated.View>
    </View>
  );
}
