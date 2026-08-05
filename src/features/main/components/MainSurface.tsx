import { useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { CalendarScreen } from '@/features/calendar';
import { MapScreen } from '@/features/map';
import { SafetyConsoleHost, SafetyConsolePanel, useSafety } from '@/features/safety';

import { useMainMode } from '../hooks/useMainMode';
import { FloatingModeSwitch } from './FloatingModeSwitch';
import { WelcomeIntro } from './WelcomeIntro';

/**
 * One fullscreen mode layer. Modes cross-fade (with a whisper of scale) instead
 * of hard-swapping — the inactive layer stays mounted, just invisible and
 * non-interactive, exactly like the previous opacity 0/1 approach.
 */
function ModeLayer({ active, children }: { active: boolean; children: ReactNode }) {
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(active ? 1 : 0, {
      duration: reducedMotion ? 0 : 240,
      easing: Easing.out(Easing.cubic),
    });
  }, [active, progress, reducedMotion]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.985 + progress.value * 0.015 }],
  }));

  return (
    <Animated.View
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
      pointerEvents={active ? 'auto' : 'none'}
      style={[StyleSheet.absoluteFill, { zIndex: active ? 1 : 0 }, style]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * Hosts the main modes. The current mode fills the screen and the
 * FloatingModeSwitch floats absolutely on top; there is no bottom bar and no
 * layout that shrinks the map or calendar.
 */
export function MainSurface() {
  const { mode, setMode } = useMainMode();
  const { heimwegFocusActive } = useSafety();
  const [mapLocationPickerActive, setMapLocationPickerActive] = useState(false);
  const [mapDetailSheetVisible, setMapDetailSheetVisible] = useState(false);
  const editRequestSequence = useRef(0);
  const [editActivityRequest, setEditActivityRequest] = useState<{
    requestId: number;
    activityId: string;
  }>();
  const modeSwitchVisible =
    !(mode === 'map' && (mapLocationPickerActive || mapDetailSheetVisible)) && !heimwegFocusActive;

  // Heimweg-Fokus lives ON the map: entering it from the calendar silently
  // rotates the map layer to the front first, so the right surface
  // shows through under the focus view / floating console panel.
  useEffect(() => {
    if (heimwegFocusActive && mode !== 'map') setMode('map');
  }, [heimwegFocusActive, mode, setMode]);

  function editActivityFromCalendar(activityId: string) {
    editRequestSequence.current += 1;
    setEditActivityRequest({ requestId: editRequestSequence.current, activityId });
    setMode('map');
  }

  return (
    <View style={{ flex: 1 }} className="bg-background">
      <ModeLayer active={mode === 'map'}>
        <MapScreen
          active={mode === 'map'}
          editActivityRequest={editActivityRequest}
          onEditActivityRequestHandled={(requestId) =>
            setEditActivityRequest((current) =>
              current?.requestId === requestId ? undefined : current,
            )
          }
          onLocationPickerActiveChange={setMapLocationPickerActive}
          onDetailSheetVisibleChange={setMapDetailSheetVisible}
          onOpenCalendar={() => setMode('calendar')}
        />
      </ModeLayer>

      <ModeLayer active={mode === 'calendar'}>
        <CalendarScreen
          onGoToMap={() => setMode('map')}
          onEditActivity={editActivityFromCalendar}
        />
      </ModeLayer>

      {mode === 'calendar' ? (
        <FloatingModeSwitch mode={mode} onChange={setMode} retracted={!modeSwitchVisible} />
      ) : null}

      {/* Heimweg safety mode (docs/safety-mode.md → Heimweg-Fokus):
          - Fall 1 (own session only): full-screen console modal.
          - Fall 2 (own session + friends sharing): floating panel over the
          focus map instead of a covering modal.
          - Die Heimweg-Pill gehört ausschließlich zur Kartenoberfläche und
            wird dort zusammen mit den übrigen Karten-Elementen gerendert. */}
      <SafetyConsoleHost />
      <SafetyConsolePanel />

      {/* One-time welcome hero after the first sign-in */}
      <WelcomeIntro />
    </View>
  );
}
