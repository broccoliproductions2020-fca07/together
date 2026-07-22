import { Ionicons } from '@expo/vector-icons';
import { useKeepAwake } from 'expo-keep-awake';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { SafetyStartPhase } from '../types';

const BLUE = '#4C8DFF';
const GREEN = '#41C08D';
export interface SafetyOperationStateProps {
  kind: 'starting' | 'ending';
  phase?: SafetyStartPhase | null;
  compact?: boolean;
  onMinimize?: () => void;
}

/**
 * Honest operation UI for the short period between explicit intent and an
 * authoritative RTDB result. It never labels sharing active/ended prematurely.
 */
export function SafetyOperationState({
  kind,
  phase = null,
  compact = false,
  onMinimize,
}: SafetyOperationStateProps) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const pulse = useSharedValue(0);
  const color = kind === 'starting' ? BLUE : GREEN;
  useKeepAwake();

  useEffect(() => {
    if (reducedMotion) {
      pulse.value = 0;
      return;
    }
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }),
        withTiming(0, { duration: 900, easing: Easing.in(Easing.cubic) }),
      ),
      -1,
    );
  }, [pulse, reducedMotion]);

  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.16 + pulse.value * 0.18,
    transform: [{ scale: 0.94 + pulse.value * 0.1 }],
  }));

  const title = kind === 'ending' ? 'Heimweg wird beendet' : 'Gleich geht’s los';
  const subtitle =
    kind === 'ending'
      ? 'Live-Standort und Freigabe werden entfernt.'
      : phase === 'permissions'
        ? 'Bestätige kurz die benötigten Berechtigungen.'
        : 'Dein Heimweg wird vorbereitet.';

  const body = (
    <View
      className={compact ? 'items-center px-4 py-7' : 'flex-1 items-center justify-center px-7'}
    >
      <View className="h-24 w-24 items-center justify-center">
        <Animated.View
          pointerEvents="none"
          className="absolute h-24 w-24 rounded-full"
          style={[{ backgroundColor: color }, haloStyle]}
        />
        <View
          className="h-16 w-16 items-center justify-center rounded-full border"
          style={{ backgroundColor: `${color}18`, borderColor: `${color}70` }}
        >
          <ActivityIndicator size="large" color={color} />
        </View>
      </View>
      <Text className="mt-4 text-center text-xl font-extrabold tracking-[-0.3px] text-white">
        {title}
      </Text>
      {subtitle ? (
        <Text className="mt-1.5 max-w-[320px] text-center text-sm leading-5 text-white/55">
          {subtitle}
        </Text>
      ) : null}
    </View>
  );

  if (compact) return body;

  return (
    <View className="flex-1 bg-[#0B0E13]">
      <View
        pointerEvents="none"
        className="absolute -top-32 self-center rounded-full"
        style={{ width: 420, height: 420, backgroundColor: `${color}12` }}
      />
      <View
        className="flex-row items-center gap-3 px-5 pb-2"
        style={{ paddingTop: insets.top + 10 }}
      >
        <View className="flex-1">
          <Text className="text-xl font-extrabold tracking-[-0.3px] text-white">Heimweg</Text>
          <Text className="mt-0.5 text-sm text-white/50">
            {kind === 'starting' ? 'Aktivierung läuft' : 'Abschluss läuft'}
          </Text>
        </View>
        {onMinimize ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Vorgang minimieren"
            onPress={onMinimize}
            className="h-11 w-11 items-center justify-center rounded-full bg-white/10 active:opacity-75"
          >
            <Ionicons name="chevron-down" size={22} color="#F4F5F7" />
          </Pressable>
        ) : null}
      </View>
      {body}
    </View>
  );
}
