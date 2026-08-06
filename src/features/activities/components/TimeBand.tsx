import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

/** One hour of wall-clock time is this many pixels of rail. 80 keeps a 5-minute
 * snap at ~6.7 px — fine enough to land on 18:35 without hunting, and still
 * about four hours of context in a phone-width viewport. */
const PX_PER_HOUR = 80;
const PX_PER_MINUTE = PX_PER_HOUR / 60;
/** 5, not 15: quarter-hour steps make "kurz nach halb" impossible to express,
 * and a drag has plenty of resolution to spare. */
const SNAP_MINUTES = 5;
/** Mirrors DurationPicker, so an activity's length means the same thing in both. */
const MIN_DURATION_MINUTES = 15;
const MAX_DURATION_MINUTES = 12 * 60;

const BAND_HEIGHT = 56;
const TRACK_TOP = 6;
const TRACK_BOTTOM = 16;
const HANDLE_WIDTH = 26;
/** Keeps a little rail visible before the span when the view first settles. */
const LEAD_IN_PX = 44;

/** How near an edge the finger must come before the rail starts travelling. */
const EDGE_ZONE = 52;
/** Travel speed at the very edge; ramps up from a crawl across EDGE_ZONE. */
const MAX_AUTO_TRAVEL_PX = 10;
const AUTO_TRAVEL_TICK_MS = 16;

type DragKind = 'move' | 'start' | 'end';

export interface Span {
  startMs: number;
  endMs: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clockLabel(ms: number): string {
  const date = new Date(ms);
  return `${date.getHours().toString().padStart(2, '0')}:${date
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;
}

export interface TimeBandProps {
  startMs: number;
  endMs: number;
  /** Left edge of the rail in epoch ms. Always on a whole hour. */
  originMs: number;
  /** Rail length. Must exceed MAX_DURATION_MINUTES or the span cannot grow. */
  railMinutes: number;
  accent: string;
  /**
   * Now-mode: the activity starts the moment it is created, so the left edge is
   * not a decision anyone gets to make. The grip is replaced by a solid cap —
   * a handle that refuses to move is worse than no handle.
   */
  startFixed: boolean;
  /** Everything left of this is in the past and cannot be selected. */
  nowMs: number;
  onChange: (span: Span) => void;
}

/**
 * A horizontal hour rail carrying one draggable span — start, end and duration
 * in a single 56 px row, in place of two datetime fields and a duration slider.
 *
 * The rail is deliberately longer than the viewport: pull the span against
 * either edge and the rail travels under your finger, so a 20-minute coffee and
 * an eight-hour hike are the same gesture. That auto-travel is the entire reason
 * this fits in one row — without it the rail would have to be wide enough for
 * the longest activity anyone might pick.
 *
 * The rail owns its own offset rather than living in a ScrollView. A horizontal
 * ScrollView and a horizontal drag fight over the same touch, and losing that
 * fight means the span jumps while the rail scrolls under it.
 */
export function TimeBand({
  startMs,
  endMs,
  originMs,
  railMinutes,
  accent,
  startFixed,
  nowMs,
  onChange,
}: TimeBandProps) {
  const viewportRef = useRef<View>(null);
  const [viewportWidth, setViewportWidth] = useState(0);

  const contentWidth = railMinutes * PX_PER_MINUTE;
  const railEndMs = originMs + railMinutes * 60_000;

  // Rail position. The shared value drives the transform so panning stays off
  // the JS render path; the ref is the same number for arithmetic.
  const offset = useSharedValue(0);
  const offsetRef = useRef(0);
  const maxOffsetRef = useRef(0);
  maxOffsetRef.current = Math.max(0, contentWidth - viewportWidth);

  // Screen rect of the viewport, because Pan reports absoluteX. Re-measured on
  // every drag start, so a sheet that slid or resized still lines up.
  const viewportRectRef = useRef({ x: 0, width: 0 });

  const [drag, setDrag] = useState<DragKind | null>(null);
  const [live, setLive] = useState<Span>({ startMs, endMs });
  const liveRef = useRef<Span>({ startMs, endMs });
  const dragBaseRef = useRef<Span>({ startMs, endMs });
  const panBaseRef = useRef(0);
  const translationRef = useRef(0);
  /** Minutes contributed by auto-travel rather than by finger movement, kept
   * separate so the two simply add instead of fighting. */
  const autoMinutesRef = useRef(0);
  const autoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const didInitialScrollRef = useRef(false);

  const span = drag ? live : { startMs, endMs };
  const snapMs = useCallback(
    (ms: number) => {
      const step = SNAP_MINUTES * 60_000;
      return originMs + Math.round((ms - originMs) / step) * step;
    },
    [originMs],
  );
  const earliestMs = Math.max(originMs, snapMs(nowMs));
  const xOf = useCallback((ms: number) => ((ms - originMs) / 60_000) * PX_PER_MINUTE, [originMs]);

  useEffect(() => {
    if (drag) return;
    liveRef.current = { startMs, endMs };
    setLive({ startMs, endMs });
  }, [drag, startMs, endMs]);

  const moveRail = useCallback(
    (next: number) => {
      const clamped = clamp(next, 0, maxOffsetRef.current);
      offsetRef.current = clamped;
      offset.value = clamped;
      return clamped;
    },
    [offset],
  );

  // Bring the span into view once the width is known. Without this the rail
  // opens at midnight and an 18:00 activity is off-screen.
  useEffect(() => {
    if (viewportWidth <= 0 || didInitialScrollRef.current) return;
    didInitialScrollRef.current = true;
    moveRail(xOf(startMs) - LEAD_IN_PX);
  }, [moveRail, startMs, viewportWidth, xOf]);

  const stopAutoTravel = useCallback(() => {
    if (!autoTimerRef.current) return;
    clearInterval(autoTimerRef.current);
    autoTimerRef.current = null;
  }, []);

  useEffect(() => stopAutoTravel, [stopAutoTravel]);

  /** Resolve a drag to a span. `base` is the span as it was when the finger went
   * down, so accumulated deltas never drift against themselves. */
  const resolve = useCallback(
    (kind: DragKind, deltaMinutes: number): Span => {
      const base = dragBaseRef.current;
      const deltaMs = deltaMinutes * 60_000;

      if (kind === 'move') {
        const duration = base.endMs - base.startMs;
        const start = clamp(snapMs(base.startMs + deltaMs), earliestMs, railEndMs - duration);
        return { startMs: start, endMs: start + duration };
      }

      if (kind === 'end') {
        const end = clamp(
          snapMs(base.endMs + deltaMs),
          base.startMs + MIN_DURATION_MINUTES * 60_000,
          Math.min(base.startMs + MAX_DURATION_MINUTES * 60_000, railEndMs),
        );
        return { startMs: base.startMs, endMs: end };
      }

      const start = clamp(
        snapMs(base.startMs + deltaMs),
        Math.max(earliestMs, base.endMs - MAX_DURATION_MINUTES * 60_000),
        base.endMs - MIN_DURATION_MINUTES * 60_000,
      );
      return { startMs: start, endMs: base.endMs };
    },
    [earliestMs, railEndMs, snapMs],
  );

  const applyDrag = useCallback(
    (kind: DragKind) => {
      const deltaMinutes = translationRef.current / PX_PER_MINUTE + autoMinutesRef.current;
      const next = resolve(kind, deltaMinutes);
      const current = liveRef.current;
      if (next.startMs === current.startMs && next.endMs === current.endMs) return;
      liveRef.current = next;
      setLive(next);
      onChange(next);
    },
    [onChange, resolve],
  );

  /**
   * Runs while the finger sits in an edge zone: travels the rail and credits the
   * travelled distance to the drag, so the span keeps growing even though the
   * finger has stopped moving. Stops itself at either end of the rail.
   */
  const startAutoTravel = useCallback(
    (kind: DragKind, direction: -1 | 1, strength: number) => {
      stopAutoTravel();
      autoTimerRef.current = setInterval(() => {
        const before = offsetRef.current;
        const after = moveRail(before + direction * MAX_AUTO_TRAVEL_PX * strength);
        const travelled = after - before;
        if (travelled === 0) {
          stopAutoTravel();
          return;
        }
        autoMinutesRef.current += travelled / PX_PER_MINUTE;
        applyDrag(kind);
      }, AUTO_TRAVEL_TICK_MS);
    },
    [applyDrag, moveRail, stopAutoTravel],
  );

  /** Decide, on every move, whether the rail should travel and how fast. */
  const updateAutoTravel = useCallback(
    (kind: DragKind, absoluteX: number) => {
      const { x, width } = viewportRectRef.current;
      if (width <= 0) return;
      const fromLeft = absoluteX - x;
      const fromRight = x + width - absoluteX;

      if (fromRight < EDGE_ZONE) {
        startAutoTravel(kind, 1, clamp((EDGE_ZONE - fromRight) / EDGE_ZONE, 0.18, 1));
      } else if (fromLeft < EDGE_ZONE) {
        startAutoTravel(kind, -1, clamp((EDGE_ZONE - fromLeft) / EDGE_ZONE, 0.18, 1));
      } else {
        stopAutoTravel();
      }
    },
    [startAutoTravel, stopAutoTravel],
  );

  const measureViewport = useCallback(() => {
    viewportRef.current?.measureInWindow((x, _y, width) => {
      viewportRectRef.current = { x, width };
    });
  }, []);

  /** One factory for all three grips: they differ only in what they resolve to,
   * never in how the drag behaves. `activeOffsetX` lets a vertical swipe fall
   * through to the composer's own ScrollView instead of being swallowed here. */
  const spanGesture = (kind: DragKind) =>
    Gesture.Pan()
      .runOnJS(true)
      .activeOffsetX([-6, 6])
      .failOffsetY([-12, 12])
      .onBegin(() => {
        measureViewport();
        dragBaseRef.current = liveRef.current;
        translationRef.current = 0;
        autoMinutesRef.current = 0;
        setDrag(kind);
      })
      .onUpdate((event) => {
        translationRef.current = event.translationX;
        updateAutoTravel(kind, event.absoluteX);
        applyDrag(kind);
      })
      .onFinalize(() => {
        stopAutoTravel();
        translationRef.current = 0;
        autoMinutesRef.current = 0;
        setDrag(null);
        onChange(liveRef.current);
      });

  /** Panning the rail itself — browsing the day without changing the activity. */
  const railGesture = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-6, 6])
    .failOffsetY([-12, 12])
    .onBegin(() => {
      panBaseRef.current = offsetRef.current;
    })
    .onUpdate((event) => {
      moveRail(panBaseRef.current - event.translationX);
    });

  const railStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -offset.value }] }));

  const spanLeft = xOf(span.startMs);
  // No touch-size floor: the handles now straddle the edges rather than sitting
  // inside, so both stay grabbable even at the 15-minute minimum (16 px) and the
  // rectangle can stay honest about how long the activity actually is.
  const spanWidth = Math.max(10, xOf(span.endMs) - spanLeft);
  const hourCount = Math.ceil(railMinutes / 60);
  const pastWidth = Math.max(0, xOf(earliestMs));

  return (
    <View
      ref={viewportRef}
      onLayout={(event) => {
        setViewportWidth(event.nativeEvent.layout.width);
        measureViewport();
      }}
      className="overflow-hidden rounded-2xl border border-white/10"
      style={{ height: BAND_HEIGHT, backgroundColor: 'rgba(255,255,255,0.045)' }}
    >
      <GestureDetector gesture={railGesture}>
        <Animated.View style={[{ width: contentWidth, height: BAND_HEIGHT }, railStyle]}>
          {/* Hour grid */}
          {Array.from({ length: hourCount + 1 }, (_, index) => (
            <View
              key={index}
              pointerEvents="none"
              style={{ position: 'absolute', left: index * PX_PER_HOUR }}
            >
              <View style={styles.tick} />
              <Text style={styles.tickLabel}>
                {new Date(originMs + index * 3_600_000).getHours().toString().padStart(2, '0')}
              </Text>
            </View>
          ))}

          {/* The past is not a choice — show it, do not offer it. */}
          {pastWidth > 0 ? (
            <View pointerEvents="none" style={[styles.past, { width: pastWidth }]} />
          ) : null}

          {/* The span. Handles are SIBLINGS drawn on top, not children: nested
              pan gestures can both activate, which moves and resizes at once.
              In Now-mode the body carries NO move gesture — the start is fixed,
              so sliding the whole span would move a start that cannot move. */}
          {startFixed ? (
            <View
              pointerEvents="none"
              style={[
                styles.span,
                {
                  left: spanLeft,
                  width: spanWidth,
                  backgroundColor: `${accent}3d`,
                  borderColor: `${accent}a8`,
                },
              ]}
            />
          ) : (
            <GestureDetector gesture={spanGesture('move')}>
              <View
                accessibilityRole="adjustable"
                accessibilityLabel="Zeitraum verschieben"
                accessibilityValue={{
                  text: `${clockLabel(span.startMs)} bis ${clockLabel(span.endMs)}`,
                }}
                style={[
                  styles.span,
                  {
                    left: spanLeft,
                    width: spanWidth,
                    backgroundColor: `${accent}3d`,
                    borderColor: `${accent}a8`,
                  },
                ]}
              />
            </GestureDetector>
          )}

          {startFixed ? (
            <View
              pointerEvents="none"
              style={[styles.fixedCap, { left: spanLeft, backgroundColor: accent }]}
            />
          ) : (
            <GestureDetector gesture={spanGesture('start')}>
              <View
                accessibilityRole="adjustable"
                accessibilityLabel="Startzeit"
                accessibilityValue={{ text: clockLabel(span.startMs) }}
                style={[styles.handle, { left: spanLeft - HANDLE_WIDTH / 2 }]}
              >
                <View style={[styles.grip, { backgroundColor: accent }]} />
              </View>
            </GestureDetector>
          )}

          <GestureDetector gesture={spanGesture('end')}>
            <View
              accessibilityRole="adjustable"
              accessibilityLabel="Endzeit"
              accessibilityValue={{ text: clockLabel(span.endMs) }}
              style={[styles.handle, { left: spanLeft + spanWidth - HANDLE_WIDTH / 2 }]}
            >
              <View style={[styles.grip, { backgroundColor: accent }]} />
            </View>
          </GestureDetector>
        </Animated.View>
      </GestureDetector>

      {/* The rail continues past the viewport, and the gesture only makes sense
          if you believe that. */}
      <View pointerEvents="none" style={[styles.fade, styles.fadeLeft]} />
      <View pointerEvents="none" style={[styles.fade, styles.fadeRight]} />
    </View>
  );
}

const styles = StyleSheet.create({
  fade: {
    backgroundColor: 'rgba(14,17,22,0.5)',
    bottom: 0,
    position: 'absolute',
    top: 0,
    width: 12,
  },
  fadeLeft: { left: 0 },
  fadeRight: { right: 0 },
  fixedCap: {
    borderBottomLeftRadius: 10,
    borderTopLeftRadius: 10,
    bottom: TRACK_BOTTOM,
    position: 'absolute',
    top: TRACK_TOP,
    width: 3,
  },
  grip: { borderRadius: 2, height: 16, width: 3 },
  handle: {
    alignItems: 'center',
    bottom: TRACK_BOTTOM,
    justifyContent: 'center',
    position: 'absolute',
    top: TRACK_TOP,
    width: HANDLE_WIDTH,
  },
  past: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
  },
  span: {
    borderRadius: 10,
    borderWidth: 1,
    bottom: TRACK_BOTTOM,
    position: 'absolute',
    top: TRACK_TOP,
  },
  tick: {
    backgroundColor: 'rgba(255,255,255,0.09)',
    height: BAND_HEIGHT - TRACK_BOTTOM,
    width: 1,
  },
  tickLabel: {
    color: 'rgba(244,245,247,0.28)',
    fontSize: 9.5,
    left: -11,
    position: 'absolute',
    textAlign: 'center',
    top: BAND_HEIGHT - 15,
    width: 22,
  },
});
