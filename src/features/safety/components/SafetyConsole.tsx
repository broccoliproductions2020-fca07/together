import { Ionicons } from '@expo/vector-icons';
import { useKeepAwake } from 'expo-keep-awake';
import { useEffect, useState } from 'react';
import { Alert, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFriends } from '@/features/friends';
import { loaderSizeForIcon, TogetherLoader } from '@/shared/components';

import { useSafety } from '../SafetyProvider';
import { STATUS_COLOR, STATUS_WORD, agoLabel } from '../safetyTheme';
import {
  isCompanionConfirmationActive,
  isCompanionWatchingAlert,
  type SafetySession,
  type SafetyStatus,
} from '../types';
import { HoldButton } from './HoldButton';
import { SafetyAudienceManager } from './SafetyAudienceSheet';
import { SafetyOperationState } from './SafetyOperationState';

/** The pulsing status orb — calm breathing on blue, urgent on orange/red. */
function StatusOrb({ status }: { status: SafetyStatus }) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = 0;
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, {
          duration: status === 'blue' ? 1600 : 700,
          easing: Easing.out(Easing.quad),
        }),
        withTiming(0, { duration: status === 'blue' ? 1600 : 700, easing: Easing.in(Easing.quad) }),
      ),
      -1,
    );
  }, [status, pulse]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 0.25 }],
    opacity: 0.5 - pulse.value * 0.35,
  }));

  const color = STATUS_COLOR[status];
  return (
    <View className="items-center justify-center" style={{ height: 168 }}>
      <Animated.View
        pointerEvents="none"
        className="absolute rounded-full"
        style={[{ width: 150, height: 150, backgroundColor: color }, ringStyle]}
      />
      <View
        className="h-24 w-24 items-center justify-center rounded-full"
        style={{ backgroundColor: `${color}2E`, borderWidth: 2, borderColor: color }}
      >
        <Ionicons
          name={status === 'blue' ? 'walk' : status === 'orange' ? 'alert' : 'warning'}
          size={40}
          color={color}
        />
      </View>
    </View>
  );
}

function ConsoleContent({
  session,
  onManageAudience,
  activating = false,
}: {
  session: SafetySession;
  onManageAudience: () => void;
  activating?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { friends } = useFriends();
  const {
    setUnwell,
    setEmergency,
    allClear,
    imSafe,
    arriveSafe,
    endingHeimweg,
    statusUpdating,
    statusError,
    checkInUpdating,
    checkInError,
    extendHeimweg,
    answerCheckIn,
    setConsoleMinimized,
  } = useSafety();
  useKeepAwake();

  // Ticking clock for the honest "Letztes Update vor …" line.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (endingHeimweg) {
    return <SafetyOperationState kind="ending" onMinimize={() => setConsoleMinimized(true)} />;
  }

  const color = STATUS_COLOR[session.status];
  const friendByUid = new Map(friends.map((friend) => [friend.uid, friend]));
  const alertActive = session.status === 'orange' || session.status === 'red';
  const companions = Object.entries(session.companions ?? {}).filter(([, confirmation]) =>
    alertActive
      ? isCompanionWatchingAlert(confirmation, session.alert, now)
      : isCompanionConfirmationActive(confirmation, now),
  );
  const checkInOpen = Boolean(
    session.checkIn && !session.checkIn.answeredAt && now >= session.checkIn.dueAt,
  );
  const expirySoon = session.expiresAt - now <= 15 * 60 * 1000;

  return (
    <View className="flex-1" style={{ backgroundColor: '#0B0E13' }}>
      {/* Ambient status wash */}
      <View
        pointerEvents="none"
        className="absolute -top-32 self-center rounded-full"
        style={{ width: 420, height: 420, backgroundColor: `${color}14` }}
      />

      <View
        className="flex-row items-center gap-3 px-5 pb-2"
        style={{ paddingTop: insets.top + 10 }}
      >
        <View className="flex-1">
          <Text className="text-xl font-extrabold tracking-[-0.3px] text-white">Heimweg</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Begleiter und Bestätigungen anzeigen"
            accessibilityState={{ disabled: activating }}
            disabled={activating}
            onPress={onManageAudience}
            className="mt-0.5 flex-row items-center gap-1 active:opacity-70"
          >
            <Text className="text-sm text-white/55">
              {activating
                ? `${session.audienceUids.length} Begleiter ausgewählt`
                : `Mit ${session.audienceUids.length} ${session.audienceUids.length === 1 ? 'Person' : 'Personen'} geteilt · ${
                    alertActive
                      ? `${companions.length} schauen gerade zu`
                      : `${companions.length} bestätigt`
                  }`}
            </Text>
            {!activating ? (
              <Ionicons name="chevron-forward" size={13} color="rgba(244,245,247,0.42)" />
            ) : null}
          </Pressable>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Konsole minimieren"
          onPress={() => setConsoleMinimized(true)}
          className="h-11 w-11 items-center justify-center rounded-full bg-white/10 active:opacity-75"
        >
          <Ionicons name="chevron-down" size={22} color="#F4F5F7" />
        </Pressable>
      </View>

      <View className="flex-1 items-center justify-center gap-3 px-6">
        <StatusOrb status={session.status} />
        <Text className="text-2xl font-extrabold tracking-[-0.4px] text-white">
          {activating ? 'Heimweg wird gestartet' : STATUS_WORD[session.status]}
        </Text>
        <View className="flex-row items-center gap-1.5">
          {activating || statusUpdating ? (
            <TogetherLoader
              accessibilityLabel=""
              color={STATUS_COLOR.blue}
              size={loaderSizeForIcon(14)}
            />
          ) : (
            <Ionicons name="locate-outline" size={14} color="rgba(244,245,247,0.55)" />
          )}
          <Text className="text-sm text-white/55">
            {activating
              ? 'Deine Freunde werden informiert'
              : statusUpdating
                ? 'Deine Sicherheitsmeldung wird übermittelt'
                : `Letztes Update · ${agoLabel(session.updatedAt, now)}`}
          </Text>
        </View>
        {statusError ? (
          <Text className="text-center text-xs text-[#E87773]">{statusError}</Text>
        ) : null}
        {expirySoon ? (
          <View className="flex-row items-center gap-2">
            <Ionicons name="timer-outline" size={14} color="rgba(244,245,247,0.55)" />
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
              className="rounded-full bg-white/10 px-3 py-1.5 active:opacity-75"
            >
              <Text className="text-xs font-extrabold text-white">+ 1 Stunde</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Reciprocity: who confirmed they're reachable. */}
        {activating ? (
          <Text className="text-xs text-white/40">
            Du kannst die App währenddessen weiter nutzen.
          </Text>
        ) : companions.length ? (
          <View className="flex-row flex-wrap justify-center gap-2 pt-1">
            {companions.map(([uid]) => (
              <View
                key={uid}
                className="flex-row items-center gap-1.5 rounded-full px-3 py-1.5"
                style={{ backgroundColor: `${STATUS_COLOR.blue}24` }}
              >
                <Ionicons name="checkmark-circle" size={13} color={STATUS_COLOR.blue} />
                <Text className="text-xs font-bold text-white/80">
                  {friendByUid.get(uid)?.displayName ?? 'Bestätigt'}{' '}
                  {alertActive ? 'schaut gerade zu' : 'ist erreichbar'}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text className="text-xs text-white/40">
            Noch niemand hat seine Erreichbarkeit bestätigt.
          </Text>
        )}

        {/* Discreet check-in after Orange — answering is ONE calm tap. */}
        {checkInOpen ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Alles okay bestätigen"
            disabled={checkInUpdating}
            onPress={answerCheckIn}
            className="mt-2 w-full flex-row items-center gap-3 rounded-2xl border px-4 py-3.5 active:opacity-85"
            style={{
              borderColor: `${STATUS_COLOR.orange}88`,
              backgroundColor: `${STATUS_COLOR.orange}1F`,
            }}
          >
            <Ionicons name="hand-left-outline" size={20} color={STATUS_COLOR.orange} />
            <View className="flex-1">
              <Text className="text-base font-bold text-white">
                {checkInUpdating ? 'Wird bestätigt …' : 'Alles okay?'}
              </Text>
              <Text className="text-xs text-white/55">
                Tippe, damit deine Freunde wissen, dass es dir gut geht.
              </Text>
            </View>
            <Text className="text-sm font-extrabold" style={{ color: STATUS_COLOR.orange }}>
              Ja
            </Text>
          </Pressable>
        ) : null}
        {checkInError ? (
          <Text className="text-center text-xs text-[#E87773]">{checkInError}</Text>
        ) : null}

        {session.status === 'red' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="112 anrufen"
            onPress={() => {
              // Structural first action on red (safety contract) — a human
              // dials, never the app silently.
              void Linking.openURL('tel:112');
            }}
            className="mt-2 w-full min-h-14 flex-row items-center justify-center gap-2 rounded-2xl active:opacity-90"
            style={{ backgroundColor: STATUS_COLOR.red }}
          >
            <Ionicons name="call" size={20} color="#fff" />
            <Text className="text-lg font-extrabold text-white">112 anrufen</Text>
          </Pressable>
        ) : null}
      </View>

      <View
        pointerEvents={activating ? 'none' : 'auto'}
        className="gap-2.5 px-5"
        style={{ paddingBottom: Math.max(insets.bottom, 16) + 8, opacity: activating ? 0.42 : 1 }}
      >
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
  );
}

/**
 * Hosts the full-screen console — but ONLY while nobody shares their walk
 * with you (Fall 1). As soon as friends share, `SafetyConsolePanel` takes
 * over: fixed lower control deck over the Heimweg-Fokus map instead of a covering modal
 * (Fall 2, docs/safety-mode.md). The shield remains the way back in.
 */
export function SafetyConsoleHost() {
  const {
    session,
    friendSessions,
    consoleMinimized,
    startingHeimweg,
    startPhase,
    setConsoleMinimized,
  } = useSafety();
  const [audienceVisible, setAudienceVisible] = useState(false);

  useEffect(() => {
    if (!session) setAudienceVisible(false);
  }, [session]);
  if (startingHeimweg && !session) {
    if (consoleMinimized) return null;
    return (
      <View style={[StyleSheet.absoluteFill, { zIndex: 80 }]} accessibilityViewIsModal>
        <SafetyOperationState
          kind="starting"
          phase={startPhase}
          onMinimize={() => setConsoleMinimized(true)}
        />
      </View>
    );
  }
  const visible = Boolean(session) && !consoleMinimized && friendSessions.length === 0;
  if (!session || friendSessions.length > 0) return null;
  return (
    <Modal
      animationType="slide"
      visible={visible}
      onRequestClose={() => setConsoleMinimized(true)}
      statusBarTranslucent
      navigationBarTranslucent
    >
      {audienceVisible ? (
        <SafetyAudienceManager presentation="screen" onClose={() => setAudienceVisible(false)} />
      ) : (
        <ConsoleContent
          session={session}
          activating={Boolean(startPhase)}
          onManageAudience={() => setAudienceVisible(true)}
        />
      )}
    </Modal>
  );
}
