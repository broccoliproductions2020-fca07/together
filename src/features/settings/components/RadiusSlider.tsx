import { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { useNearbyRadius } from '../useNearbyRadius';

const THUMB = 18;
const TRACK_H = 3;
const CONTAINER_H = 30;

// Logarithmic scale: small values get more slider real-estate → finer control
function kmToFraction(km: number, min: number, max: number): number {
  return Math.log(km / min) / Math.log(max / min);
}
function fractionToKmRaw(f: number, min: number, max: number): number {
  return min * Math.pow(max / min, Math.max(0, Math.min(1, f)));
}
// Adaptive step: 0.5 km below 5, 1 km up to 10, 2 km above
function snapKm(km: number, min: number, max: number): number {
  const step = km < 5 ? 0.5 : km < 10 ? 1 : 2;
  return Math.max(min, Math.min(max, Math.round(km / step) * step));
}

export interface RadiusSliderProps {
  /** Hides the min/max edge labels. Use inside tight containers. */
  compact?: boolean;
}

export function RadiusSlider({ compact = false }: RadiusSliderProps) {
  const { radiusKm, setRadiusKm, minKm, maxKm } = useNearbyRadius();
  const [liveKm, setLiveKm] = useState(radiusKm);
  const containerW = useRef(0);
  const thumbX = useSharedValue(0);
  const dragStart = useRef(0);

  const maxX = useCallback(() => {
    return Math.max(0, containerW.current - THUMB);
  }, []);

  const kmToX = useCallback(
    (km: number) => {
      return kmToFraction(km, minKm, maxKm) * maxX();
    },
    [maxKm, maxX, minKm],
  );

  const xToKm = useCallback(
    (x: number) => {
      return snapKm(fractionToKmRaw(maxX() > 0 ? x / maxX() : 0, minKm, maxKm), minKm, maxKm);
    },
    [maxKm, maxX, minKm],
  );

  // Sync when external value changes (e.g. AsyncStorage load)
  useEffect(() => {
    if (containerW.current > 0) {
      thumbX.value = kmToX(radiusKm);
      setLiveKm(radiusKm);
    }
  }, [kmToX, radiusKm, thumbX]);

  const gesture = Gesture.Pan()
    .runOnJS(true)
    .onBegin(() => {
      dragStart.current = thumbX.value;
    })
    .onUpdate((e) => {
      const newX = Math.max(0, Math.min(maxX(), dragStart.current + e.translationX));
      thumbX.value = newX;
      setLiveKm(xToKm(newX));
    })
    .onEnd(() => {
      const km = xToKm(thumbX.value);
      thumbX.value = withSpring(kmToX(km), { damping: 24, stiffness: 340 });
      setRadiusKm(km);
      setLiveKm(km);
    });

  const thumbStyle = useAnimatedStyle(() => ({ left: thumbX.value }));
  const fillStyle = useAnimatedStyle(() => ({ width: thumbX.value }));

  const formatted = liveKm % 1 === 0 ? `${liveKm}` : liveKm.toFixed(1);

  return (
    <View className="gap-1.5">
      {/* Label + value row */}
      <View className="flex-row items-center justify-between">
        {/* compact = inside the dark NearbySheet (hardcoded dark surface); the full
            variant lives on the theme-aware settings screen where white would vanish
            in light mode. */}
        <Text className={compact ? 'text-sm text-white' : 'text-sm text-muted-foreground'}>
          Radius
        </Text>
        <Text
          className={
            compact
              ? 'text-sm font-semibold text-foreground'
              : 'text-base font-bold text-foreground'
          }
        >
          {formatted} km
        </Text>
      </View>

      {/* Track + thumb */}
      <View
        style={{ height: CONTAINER_H, position: 'relative' }}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          containerW.current = w;
          thumbX.value = kmToFraction(radiusKm, minKm, maxKm) * Math.max(0, w - THUMB);
          setLiveKm(radiusKm);
        }}
      >
        {/* Track background */}
        <View
          style={{
            position: 'absolute',
            left: THUMB / 2,
            right: THUMB / 2,
            top: (CONTAINER_H - TRACK_H) / 2,
            height: TRACK_H,
            borderRadius: TRACK_H / 2,
            backgroundColor: 'rgba(255,255,255,0.10)',
            overflow: 'hidden',
          }}
        >
          {/* Filled portion */}
          <Animated.View
            style={[
              {
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                borderRadius: TRACK_H / 2,
                backgroundColor: '#6E8BF7',
              },
              fillStyle,
            ]}
          />
        </View>

        {/* Thumb */}
        <GestureDetector gesture={gesture}>
          <Animated.View
            style={[
              {
                position: 'absolute',
                top: (CONTAINER_H - THUMB) / 2,
                width: THUMB,
                height: THUMB,
                borderRadius: THUMB / 2,
                backgroundColor: '#ffffff',
                shadowColor: '#000000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.2,
                shadowRadius: 4,
                elevation: 4,
              },
              thumbStyle,
            ]}
          />
        </GestureDetector>
      </View>

      {/* Edge labels — hidden in compact mode */}
      {!compact ? (
        <View className="flex-row justify-between">
          <Text className="text-xs text-muted-foreground">{minKm} km</Text>
          <Text className="text-xs text-muted-foreground">{maxKm} km</Text>
        </View>
      ) : null}
    </View>
  );
}
