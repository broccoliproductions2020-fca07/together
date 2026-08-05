import { Ionicons } from '@expo/vector-icons';
import { useKeepAwake } from 'expo-keep-awake';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSafety } from '../SafetyProvider';
import { getSafetySplitPanelHeight } from '../safetyLayout';
import { STATUS_COLOR, STATUS_WORD, agoLabel } from '../safetyTheme';
import {
  isCompanionConfirmationActive,
  isCompanionWatchingAlert,
  type SafetySession,
} from '../types';
import { HoldButton } from './HoldButton';
import { SafetyAudienceSheet } from './SafetyAudienceSheet';
import { SafetyOperationState } from './SafetyOperationState';

/**
 * Fall 2 (docs/safety-mode.md → Heimweg-Fokus): own session AND friends
 * sharing. This is a deliberate split surface: the upper half belongs to the
 * live map, the complete lower area to the owner's status and Safety actions.
 * It must read as one stable control deck, not as a small floating card.
 */
export function SafetyConsolePanel() {
  const { session, friendSessions, consoleMinimized, startPhase } = useSafety();
  const active = Boolean(session) && !consoleMinimized && friendSessions.length > 0;
  // Gate BEFORE mounting the content: its useKeepAwake must only hold the
  // screen open while the panel is actually visible.
  if (!active || !session) return null;
  return <PanelContent session={session} activating={Boolean(startPhase)} />;
}

function PanelContent({ session, activating }: { session: SafetySession; activating: boolean }) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const {
    setUnwell,
    setEmergency,
    allClear,
    imSafe,
    arriveSafe,
    endingHeimweg,
    extendHeimweg,
    answerCheckIn,
    setConsoleMinimized,
  } = useSafety();
  useKeepAwake();
  const [audienceVisible, setAudienceVisible] = useState(false);

  // Ticking clock for the honest "Letztes Update vor …" line.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Soft breathing halo around the card while urgent — attention without noise.
  const urgent = session.status === 'orange' || session.status === 'red';
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (!urgent || reducedMotion) {
      pulse.value = 0;
      return;
    }
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 700, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 700, easing: Easing.in(Easing.quad) }),
      ),
      -1,
    );
  }, [urgent, pulse, reducedMotion]);

  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.35 + pulse.value * 0.45,
  }));

  const color = STATUS_COLOR[session.status];
  const panelHeight = getSafetySplitPanelHeight(height);
  const confirmations = Object.values(session.companions ?? {});
  const confirmationCount = urgent
    ? confirmations.filter((confirmation) =>
        isCompanionWatchingAlert(confirmation, session.alert, now),
      ).length
    : confirmations.filter((confirmation) => isCompanionConfirmationActive(confirmation, now))
        .length;
  const confirmationLabel = urgent
    ? `${confirmationCount} von ${session.audienceUids.length} schauen gerade zu`
    : `${confirmationCount} von ${session.audienceUids.length} erreichbar`;
  const checkInOpen = Boolean(
    session.checkIn && !session.checkIn.answeredAt && now >= session.checkIn.dueAt,
  );
  const expirySoon = session.expiresAt - now <= 15 * 60 * 1000;

  return (
    <>
      <Animated.View
        entering={
          reducedMotion
            ? undefined
            : FadeIn.duration(190)
                .easing(Easing.out(Easing.cubic))
                .withInitialValues({
                  opacity: 0,
                  transform: [{ translateY: 8 }, { scale: 0.985 }],
                })
        }
        exiting={reducedMotion ? undefined : FadeOut.duration(135)}
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: panelHeight,
          zIndex: 30,
        }}
      >
        {/* A restrained status edge keeps urgency visible without turning the
          fixed control deck into another animated floating card. */}
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              left: 0,
              right: 0,
              top: -2,
              height: 3,
              backgroundColor: color,
            },
            haloStyle,
          ]}
        />
        <View
          className="flex-1 overflow-hidden rounded-t-[32px] border border-b-0 border-white/10"
          style={{
            backgroundColor: '#0B0E13',
            shadowColor: color,
            shadowOffset: { width: 0, height: -8 },
            shadowOpacity: urgent ? 0.3 : 0.16,
            shadowRadius: 22,
            elevation: 18,
          }}
        >
          {endingHeimweg ? (
            <SafetyOperationState kind="ending" compact />
          ) : (
            <View
              className="flex-1 px-5 pt-4"
              style={{ paddingBottom: Math.max(insets.bottom, 16) + 8 }}
            >
              <View className="flex-row items-center gap-2.5">
                <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                <Text className="flex-1 text-base font-extrabold text-white" numberOfLines={1}>
                  {activating ? 'Heimweg wird gestartet' : STATUS_WORD[session.status]}
                </Text>
                {activating ? (
                  <ActivityIndicator size="small" color={STATUS_COLOR.blue} />
                ) : (
                  <Text className="text-xs font-semibold text-white/50">
                    {agoLabel(session.updatedAt, now)}
                  </Text>
                )}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Panel minimieren, zurück zur normalen Karte"
                  onPress={() => setConsoleMinimized(true)}
                  hitSlop={6}
                  className="h-8 w-8 items-center justify-center rounded-full bg-white/10 active:opacity-75"
                >
                  <Ionicons name="chevron-down" size={17} color="#F4F5F7" />
                </Pressable>
              </View>

              <View
                className="mt-3 flex-row items-center gap-3 rounded-2xl border px-3.5 py-3"
                style={{ borderColor: `${color}42`, backgroundColor: `${color}14` }}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Begleiter und Bestätigungen anzeigen"
                  accessibilityState={{ disabled: activating }}
                  disabled={activating}
                  onPress={() => setAudienceVisible(true)}
                  className="flex-1 flex-row items-center gap-3 active:opacity-75"
                >
                  <View
                    className="h-9 w-9 items-center justify-center rounded-xl"
                    style={{ backgroundColor: `${color}22` }}
                  >
                    <Ionicons
                      name={urgent ? 'eye-outline' : 'people-outline'}
                      size={18}
                      color={color}
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-extrabold text-white">
                      {activating
                        ? `${session.audienceUids.length} Begleiter ausgewählt`
                        : confirmationLabel}
                    </Text>
                    {activating ? (
                      <Text className="mt-0.5 text-xs text-white/45">
                        Deine Freunde werden informiert
                      </Text>
                    ) : null}
                  </View>
                  {!activating && !expirySoon ? (
                    <Ionicons name="chevron-forward" size={17} color="rgba(244,245,247,0.4)" />
                  ) : null}
                </Pressable>
                {!activating && expirySoon ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Heimweg um eine Stunde verlängern"
                    onPress={() => {
                      void extendHeimweg().catch(() => {
                        Alert.alert(
                          'Verlängerung nicht möglich',
                          'Bitte prüfe deine Verbindung und versuche es erneut.',
                        );
                      });
                    }}
                    className="rounded-full bg-white/10 px-2.5 py-1.5 active:opacity-75"
                  >
                    <Text className="text-xs font-extrabold text-white">+ 1 Std.</Text>
                  </Pressable>
                ) : null}
              </View>

              {checkInOpen ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Alles okay bestätigen"
                  onPress={answerCheckIn}
                  className="mt-2.5 flex-row items-center gap-3 rounded-2xl border px-3.5 py-3 active:opacity-85"
                  style={{
                    borderColor: `${STATUS_COLOR.orange}88`,
                    backgroundColor: `${STATUS_COLOR.orange}1F`,
                  }}
                >
                  <Ionicons name="hand-left-outline" size={18} color={STATUS_COLOR.orange} />
                  <Text className="flex-1 text-sm font-bold text-white">Alles okay?</Text>
                  <Text className="text-sm font-extrabold" style={{ color: STATUS_COLOR.orange }}>
                    Ja
                  </Text>
                </Pressable>
              ) : null}

              <View
                pointerEvents={activating ? 'none' : 'auto'}
                className="mt-auto gap-2.5 pt-3"
                style={{ opacity: activating ? 0.42 : 1 }}
              >
                {session.status === 'red' ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="112 anrufen"
                    onPress={() => {
                      // Structural first action on red (safety contract) — a human
                      // dials, never the app silently.
                      void Linking.openURL('tel:112');
                    }}
                    className="min-h-12 flex-row items-center justify-center gap-2 rounded-2xl active:opacity-90"
                    style={{ backgroundColor: STATUS_COLOR.red }}
                  >
                    <Ionicons name="call" size={18} color="#fff" />
                    <Text className="text-base font-extrabold text-white">112 anrufen</Text>
                  </Pressable>
                ) : null}

                <HoldButton
                  label={endingHeimweg ? 'Wird beendet …' : 'Sicher angekommen'}
                  icon="home"
                  color={STATUS_COLOR.blue}
                  durationMs={1000}
                  disabled={endingHeimweg}
                  onComplete={arriveSafe}
                />
                {session.status === 'blue' ? (
                  <>
                    <HoldButton
                      label="Ich fühle mich unsicher"
                      hint="halten"
                      icon="alert-circle-outline"
                      color={STATUS_COLOR.orange}
                      durationMs={1500}
                      variant="outline"
                      onComplete={setUnwell}
                    />
                    <HoldButton
                      label="Hilfe"
                      hint="halten"
                      icon="warning-outline"
                      color={STATUS_COLOR.red}
                      durationMs={2200}
                      variant="outline"
                      onComplete={setEmergency}
                    />
                  </>
                ) : null}
                {session.status === 'orange' ? (
                  <>
                    <HoldButton
                      label="Alles wieder okay"
                      hint="halten"
                      icon="sunny-outline"
                      color={STATUS_COLOR.blue}
                      durationMs={1000}
                      variant="outline"
                      onComplete={allClear}
                    />
                    <HoldButton
                      label="Hilfe"
                      hint="halten"
                      icon="warning-outline"
                      color={STATUS_COLOR.red}
                      durationMs={2200}
                      onComplete={setEmergency}
                    />
                  </>
                ) : null}
                {session.status === 'red' ? (
                  <HoldButton
                    label="Ich bin sicher"
                    hint="halten"
                    icon="shield-checkmark-outline"
                    color={STATUS_COLOR.blue}
                    durationMs={1500}
                    variant="outline"
                    onComplete={imSafe}
                  />
                ) : null}
              </View>
            </View>
          )}
        </View>
      </Animated.View>
      <SafetyAudienceSheet visible={audienceVisible} onClose={() => setAudienceVisible(false)} />
    </>
  );
}
