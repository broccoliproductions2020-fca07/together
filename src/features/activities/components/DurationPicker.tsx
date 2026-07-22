import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { formatDurationLabel } from '../utils/datetime';

const MIN_DURATION_MINUTES = 15;
const MAX_DURATION_MINUTES = 12 * 60;
const PILL_EXPANDED_WIDTH = 156;
const THUMB_SIZE = 20;
const THUMB_TOUCH_SIZE = 36;
const TRACK_HEIGHT = 4;
const SLIDER_HEIGHT = 36;

/**
 * Short, spontaneous activities get most of the track. The visual distance is
 * deliberately non-linear, while every position still snaps to a clear value.
 */
function durationToFraction(minutes: number): number {
  const safe = Math.max(MIN_DURATION_MINUTES, Math.min(MAX_DURATION_MINUTES, minutes));
  if (safe <= 240) return ((safe - MIN_DURATION_MINUTES) / 225) * 0.8;
  return 0.8 + ((safe - 240) / 480) * 0.2;
}

function fractionToDurationRaw(fraction: number): number {
  const safe = Math.max(0, Math.min(1, fraction));
  if (safe <= 0.8) return MIN_DURATION_MINUTES + (safe / 0.8) * 225;
  return 240 + ((safe - 0.8) / 0.2) * 480;
}

function snapDuration(minutes: number): number {
  const step = minutes <= 240 ? 15 : 120;
  return Math.max(
    MIN_DURATION_MINUTES,
    Math.min(MAX_DURATION_MINUTES, Math.round(minutes / step) * step),
  );
}

function normaliseDuration(minutes: number): number {
  return snapDuration(Math.max(MIN_DURATION_MINUTES, minutes));
}

export interface DurationPickerProps {
  minutes: number;
  accent: string;
  onChange: (minutes: number) => void;
}

/**
 * Keeps the normal start/end fields untouched. The duration pill is an
 * optional shortcut: on tap a compact slider grows to its right.
 */
export function DurationPicker({ minutes, accent, onChange }: DurationPickerProps) {
  const [expanded, setExpanded] = useState(false);
  const [liveMinutes, setLiveMinutes] = useState(() => normaliseDuration(minutes));
  const [trackWidth, setTrackWidth] = useState(0);
  const dragStart = useRef(0);
  const thumbX = useSharedValue(0);

  const maxX = useCallback(() => Math.max(0, trackWidth - THUMB_TOUCH_SIZE), [trackWidth]);
  const minutesToX = useCallback(
    (nextMinutes: number) => durationToFraction(normaliseDuration(nextMinutes)) * maxX(),
    [maxX],
  );
  const xToMinutes = useCallback(
    (x: number) => normaliseDuration(fractionToDurationRaw(maxX() > 0 ? x / maxX() : 0)),
    [maxX],
  );

  useEffect(() => {
    const nextMinutes = normaliseDuration(minutes);
    setLiveMinutes(nextMinutes);
    if (trackWidth > 0) thumbX.value = minutesToX(nextMinutes);
  }, [minutes, minutesToX, thumbX, trackWidth]);

  const updateFromX = useCallback(
    (x: number, commit = false) => {
      const bounded = Math.max(0, Math.min(maxX(), x));
      const nextMinutes = xToMinutes(bounded);
      setLiveMinutes(nextMinutes);

      if (commit) {
        thumbX.value = withSpring(minutesToX(nextMinutes), { damping: 24, stiffness: 340 });
        onChange(nextMinutes);
      } else {
        thumbX.value = bounded;
      }
    },
    [maxX, minutesToX, onChange, thumbX, xToMinutes],
  );

  // Same direct-thumb gesture as the proven RadiusSlider in Settings. Keeping
  // the gesture on the thumb avoids ScrollView interception in the composer.
  const sliderGesture = Gesture.Pan()
    .runOnJS(true)
    .onBegin(() => {
      dragStart.current = thumbX.value;
    })
    .onUpdate((event) => updateFromX(dragStart.current + event.translationX))
    .onEnd(() => updateFromX(thumbX.value, true));

  const thumbStyle = useAnimatedStyle(() => ({ left: thumbX.value }));
  const fillStyle = useAnimatedStyle(() => ({ width: thumbX.value }));

  function adjustBy(direction: 1 | -1) {
    const step = direction > 0 ? (liveMinutes < 240 ? 15 : 120) : liveMinutes <= 240 ? 15 : 120;
    const next = normaliseDuration(liveMinutes + direction * step);
    if (next === liveMinutes) return;
    setLiveMinutes(next);
    thumbX.value = withSpring(minutesToX(next), { damping: 24, stiffness: 340 });
    onChange(next);
  }

  return (
    <View className="flex-row items-center gap-3">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dauer anpassen"
        accessibilityState={{ expanded }}
        className="min-h-9 flex-row items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 active:opacity-75"
        style={{
          // Fixed width in both states so toggling the slider never reflows the pill.
          width: PILL_EXPANDED_WIDTH,
          ...(expanded ? { borderColor: `${accent}55`, backgroundColor: `${accent}12` } : null),
        }}
        onPress={() => setExpanded((current) => !current)}
      >
        <Ionicons name="time-outline" size={15} color={accent} />
        <Text className="text-sm text-white/55">Dauer</Text>
        <Text
          className="flex-1 text-sm font-bold text-white"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.82}
        >
          {formatDurationLabel(liveMinutes)}
        </Text>
        <Ionicons
          name={expanded ? 'chevron-back' : 'chevron-forward'}
          size={15}
          color="rgba(244,245,247,0.52)"
        />
      </Pressable>

      {expanded ? (
        <View
          accessibilityRole="adjustable"
          accessibilityLabel="Dauer"
          accessibilityValue={{
            min: MIN_DURATION_MINUTES,
            max: MAX_DURATION_MINUTES,
            now: liveMinutes,
            text: formatDurationLabel(liveMinutes),
          }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(event) => {
            adjustBy(event.nativeEvent.actionName === 'increment' ? 1 : -1);
          }}
          style={{
            flex: 1,
            flexShrink: 1,
            minWidth: 88,
            height: SLIDER_HEIGHT,
            position: 'relative',
          }}
          onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
        >
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: THUMB_TOUCH_SIZE / 2,
              right: THUMB_TOUCH_SIZE / 2,
              top: (SLIDER_HEIGHT - TRACK_HEIGHT) / 2,
              height: TRACK_HEIGHT,
              borderRadius: TRACK_HEIGHT / 2,
              backgroundColor: 'rgba(255,255,255,0.12)',
              overflow: 'hidden',
            }}
          >
            <Animated.View
              style={[
                {
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  borderRadius: TRACK_HEIGHT / 2,
                  backgroundColor: accent,
                },
                fillStyle,
              ]}
            />
          </View>
          <GestureDetector gesture={sliderGesture}>
            <Animated.View
              style={[
                {
                  position: 'absolute',
                  top: 0,
                  width: THUMB_TOUCH_SIZE,
                  height: SLIDER_HEIGHT,
                  alignItems: 'center',
                  justifyContent: 'center',
                },
                thumbStyle,
              ]}
            >
              <View
                pointerEvents="none"
                style={{
                  width: THUMB_SIZE,
                  height: THUMB_SIZE,
                  borderRadius: THUMB_SIZE / 2,
                  backgroundColor: '#F7F8FA',
                  borderWidth: 2,
                  borderColor: accent,
                  shadowColor: '#000000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.2,
                  shadowRadius: 5,
                  elevation: 4,
                }}
              />
            </Animated.View>
          </GestureDetector>
        </View>
      ) : null}
    </View>
  );
}
