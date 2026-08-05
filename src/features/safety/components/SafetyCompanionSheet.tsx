import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/features/auth';
import { AnimatedToggleIcon } from '@/shared/components/AnimatedToggleIcon';

import { useSafety } from '../SafetyProvider';
import { STATUS_COLOR, signalStatus } from '../safetyTheme';
import {
  companionAlertConfirmationRemainingMs,
  companionConfirmationRemainingMs,
  deriveCompanionSignal,
  isCompanionConfirmationActive,
  isCompanionUnavailable,
  isCompanionWatchingAlert,
  type CompanionSignal,
  type SafetySession,
} from '../types';

const SIGNAL_META: Record<
  CompanionSignal,
  { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  ok: { label: 'Unterwegs', color: STATUS_COLOR.blue, icon: 'walk-outline' },
  unwell: {
    label: 'Fühlt sich unsicher',
    color: STATUS_COLOR.orange,
    icon: 'alert-circle-outline',
  },
  help: { label: 'Benötigt Hilfe', color: STATUS_COLOR.red, icon: 'warning-outline' },
  data_gap: {
    label: 'Keine aktuellen Daten',
    color: STATUS_COLOR.orange,
    icon: 'cloud-offline-outline',
  },
  no_response: { label: 'Keine Rückmeldung', color: STATUS_COLOR.red, icon: 'help-circle-outline' },
  timed_out: { label: 'Automatisch beendet', color: STATUS_COLOR.orange, icon: 'timer-outline' },
};

function agoLabel(at: number | undefined, now: number): string {
  if (!at) return 'Noch kein Standort';
  const seconds = Math.max(0, Math.floor((now - at) / 1000));
  if (seconds < 15) return 'Gerade aktualisiert';
  if (seconds < 60) return `Vor ${seconds} Sek.`;
  return `Vor ${Math.floor(seconds / 60)} Min.`;
}

function remainingLabel(remainingMs: number): string {
  const minutes = Math.max(1, Math.ceil(remainingMs / 60_000));
  return `noch ${minutes} Min.`;
}

function CompanionCard({
  session,
  myUid,
  busy,
  now,
  onConfirm,
  onWithdraw,
  onMap,
}: {
  session: SafetySession;
  myUid: string;
  busy: boolean;
  now: number;
  onConfirm: () => void;
  onWithdraw: () => void;
  onMap: () => void;
}) {
  const signal = deriveCompanionSignal(session, now);
  const meta = SIGNAL_META[signal];
  const alertActive = Boolean(
    session.alert && (session.status === 'orange' || session.status === 'red'),
  );
  const confirmation = session.companions?.[myUid];
  const confirmed = alertActive
    ? isCompanionWatchingAlert(confirmation, session.alert, now)
    : isCompanionConfirmationActive(confirmation, now);
  const unavailable = isCompanionUnavailable(confirmation);
  const remainingMs = alertActive
    ? companionAlertConfirmationRemainingMs(confirmation, session.alert, now)
    : companionConfirmationRemainingMs(confirmation, now);
  const actionLabel = alertActive
    ? unavailable
      ? 'Wieder im Blick'
      : 'Ich habe dich im Blick'
    : unavailable
      ? 'Wieder erreichbar'
      : 'Ich bin erreichbar';
  const confirmedLabel = alertActive ? 'Du schaust gerade zu' : 'Erreichbarkeit bestätigt';

  // Bystander problem: with several companions, everyone silently assumes
  // someone ELSE is watching. Show who has actually confirmed — especially
  // the uncomfortable truth "bisher niemand". Mirrors the owner-side
  // "N von M schauen zu" vocabulary, promises nothing beyond the confirmations.
  const othersActiveCount = Object.entries(session.companions ?? {}).filter(
    ([companionUid, companion]) =>
      companionUid !== myUid &&
      (alertActive
        ? isCompanionWatchingAlert(companion, session.alert, now)
        : isCompanionConfirmationActive(companion, now)),
  ).length;
  const companionPresenceLabel = alertActive
    ? othersActiveCount > 0
      ? confirmed
        ? `Du und ${othersActiveCount} weitere schauen zu`
        : `${othersActiveCount} ${othersActiveCount === 1 ? 'Person schaut' : 'Personen schauen'} bereits zu`
      : confirmed
        ? 'Du bist gerade die einzige Person, die zusieht'
        : 'Bisher schaut niemand zu — deine Bestätigung zählt'
    : othersActiveCount > 0
      ? confirmed
        ? `Du und ${othersActiveCount} weitere sind erreichbar`
        : `${othersActiveCount} ${othersActiveCount === 1 ? 'Person ist' : 'Personen sind'} erreichbar`
      : confirmed
        ? 'Du bist als einzige Person erreichbar'
        : 'Noch niemand hat Erreichbarkeit bestätigt';

  return (
    <View className="rounded-3xl border border-white/10 bg-white/[0.05] p-4">
      <View className="flex-row items-center gap-3">
        <View
          className="h-12 w-12 items-center justify-center rounded-full"
          style={{ backgroundColor: `${meta.color}22`, borderWidth: 1, borderColor: meta.color }}
        >
          <Text className="text-sm font-extrabold text-white">{session.initials}</Text>
        </View>
        <View className="flex-1">
          <Text className="text-base font-extrabold text-white">{session.displayName}</Text>
          <View className="mt-1 flex-row items-center gap-1.5">
            <Ionicons name={meta.icon} size={14} color={meta.color} />
            <Text className="text-xs font-bold" style={{ color: meta.color }}>
              {meta.label}
            </Text>
            <Text className="text-xs text-white/40">· {agoLabel(session.updatedAt, now)}</Text>
          </View>
        </View>
        {session.location ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${session.displayName} auf der Karte zeigen`}
            className="h-10 w-10 items-center justify-center rounded-full bg-white/10 active:opacity-75"
            onPress={onMap}
          >
            <Ionicons name="map-outline" size={18} color="#F4F5F7" />
          </Pressable>
        ) : null}
      </View>

      {session.timedOut ? (
        <View className="mt-4 rounded-2xl bg-white/[0.06] px-3.5 py-3">
          <Text className="text-sm font-bold text-white">Ankunft nicht bestätigt</Text>
          <Text className="mt-0.5 text-xs leading-4 text-white/50">
            Die Freigabe wurde automatisch beendet. Dies ist der letzte bekannte Standort.
          </Text>
        </View>
      ) : null}

      {!session.timedOut ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              confirmed ? `${confirmedLabel}: ${session.displayName}` : actionLabel
            }
            accessibilityState={{ disabled: confirmed || busy }}
            disabled={confirmed || busy}
            className="mt-4 min-h-12 flex-row items-center justify-center gap-2 rounded-2xl border active:opacity-80"
            style={{
              borderColor: confirmed ? `${STATUS_COLOR.blue}73` : STATUS_COLOR.blue,
              backgroundColor: confirmed ? `${STATUS_COLOR.blue}1F` : `${STATUS_COLOR.blue}2E`,
              opacity: busy ? 0.6 : 1,
            }}
            onPress={onConfirm}
          >
            <AnimatedToggleIcon
              icon="checkmark-circle"
              outlineIcon="hand-left-outline"
              active={confirmed}
              size={18}
              activeColor={STATUS_COLOR.blue}
              inactiveColor="#A99AC4"
            />
            <Text
              className="text-sm font-extrabold"
              style={{ color: confirmed ? STATUS_COLOR.blue : '#E3DAF0' }}
            >
              {busy
                ? 'Wird bestätigt …'
                : confirmed
                  ? `${confirmedLabel} · ${remainingLabel(remainingMs)}`
                  : actionLabel}
            </Text>
          </Pressable>
          <Text className="mt-2 text-center text-xs text-white/45">{companionPresenceLabel}</Text>
          {alertActive ? (
            <View className="mt-2.5 flex-row items-start gap-2 rounded-2xl bg-white/[0.06] px-3.5 py-2.5">
              <Ionicons name="call-outline" size={15} color={meta.color} />
              <Text className="flex-1 text-xs leading-4 text-white/60">
                Am schnellsten hilft direkter Kontakt — versuch {session.displayName} anzurufen oder
                zu erreichen.
              </Text>
            </View>
          ) : null}
          {confirmed ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Nicht mehr erreichbar für ${session.displayName}`}
              disabled={busy}
              onPress={onWithdraw}
              className="mt-2 min-h-10 items-center justify-center rounded-xl active:opacity-75"
              style={{ opacity: busy ? 0.5 : 1 }}
            >
              <Text className="text-xs font-bold text-white/55">Nicht mehr erreichbar</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

export function SafetyCompanionSheet({
  visible,
  focusedUid,
  onClose,
}: {
  visible: boolean;
  /** Marker taps open the exact person instead of an unrelated full list. */
  focusedUid?: string;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { friendSessions, confirmReachable, confirmAlert, focusOnMap, withdrawReachability } =
    useSafety();
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const myUid = user?.id ?? 'u_you';

  useEffect(() => {
    if (!visible) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [visible]);

  // Severity first ("Wichtigkeit zuerst"), freshness second — with several
  // walks the one needing attention must never hide below a chatty blue one.
  const sessions = useMemo(() => {
    const rank = { red: 2, orange: 1, blue: 0 } as const;
    const sorted = [...friendSessions].sort((a, b) => {
      const severity =
        rank[signalStatus(deriveCompanionSignal(b, now))] -
        rank[signalStatus(deriveCompanionSignal(a, now))];
      return severity !== 0 ? severity : b.updatedAt - a.updatedAt;
    });
    return focusedUid ? sorted.filter((item) => item.uid === focusedUid) : sorted;
  }, [focusedUid, friendSessions, now]);

  const focusedSession = focusedUid
    ? friendSessions.find((item) => item.uid === focusedUid)
    : undefined;

  async function confirm(session: SafetySession) {
    if (busyUid) return;
    setBusyUid(session.uid);
    try {
      if (session.alert && (session.status === 'orange' || session.status === 'red')) {
        await confirmAlert(session.uid, session.alert.at);
      } else {
        await confirmReachable(session.uid);
      }
    } catch (error) {
      Alert.alert(
        'Bestätigung nicht möglich',
        error instanceof Error ? error.message : 'Bitte versuche es erneut.',
      );
    } finally {
      setBusyUid(null);
    }
  }

  function withdraw(session: SafetySession) {
    if (busyUid) return;
    Alert.alert(
      'Nicht mehr erreichbar?',
      `${session.displayName} sieht, dass du die aktive Begleitung beendest. Der Heimweg bleibt weiterhin mit dir geteilt.`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Bestätigung zurücknehmen',
          style: 'destructive',
          onPress: () => {
            setBusyUid(session.uid);
            void withdrawReachability(session.uid)
              .catch((error) => {
                Alert.alert(
                  'Änderung nicht möglich',
                  error instanceof Error ? error.message : 'Bitte versuche es erneut.',
                );
              })
              .finally(() => setBusyUid(null));
          },
        },
      ],
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable className="flex-1 justify-end bg-black/55" onPress={onClose}>
        <Pressable
          className="max-h-[86%] rounded-t-[32px] border border-white/10 bg-[#0E1116] px-5 pt-3"
          style={{ paddingBottom: Math.max(insets.bottom, 16) + 8 }}
          onPress={(event) => event.stopPropagation()}
        >
          <View className="mb-4 h-1.5 w-12 self-center rounded-full bg-white/20" />
          <View className="flex-row items-start justify-between gap-3">
            <View className="flex-1">
              <Text className="text-2xl font-extrabold tracking-[-0.4px] text-white">
                {focusedSession
                  ? `Heimweg von ${focusedSession.displayName}`
                  : 'Heimwege deiner Freunde'}
              </Text>
              <Text className="mt-1 text-sm leading-5 text-white/55">
                Bestätige nur, wenn du erreichbar bist und auf Hinweise reagieren kannst.
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Heimwege schließen"
              className="h-11 w-11 items-center justify-center rounded-full bg-white/10"
              onPress={onClose}
            >
              <Ionicons name="close" size={21} color="#F4F5F7" />
            </Pressable>
          </View>

          <ScrollView
            className="mt-5"
            contentContainerStyle={{ gap: 12, paddingBottom: 8 }}
            showsVerticalScrollIndicator={false}
          >
            {sessions.map((session) => (
              <CompanionCard
                key={session.uid}
                session={session}
                myUid={myUid}
                busy={busyUid === session.uid}
                now={now}
                onConfirm={() => void confirm(session)}
                onWithdraw={() => withdraw(session)}
                onMap={() => {
                  if (!session.location) return;
                  focusOnMap(session.location);
                  onClose();
                }}
              />
            ))}
            {!sessions.length ? (
              <View className="items-center px-6 py-10">
                <Ionicons
                  name="shield-checkmark-outline"
                  size={30}
                  color="rgba(244,245,247,0.35)"
                />
                <Text className="mt-3 text-base font-bold text-white/80">Keine aktive Anfrage</Text>
                <Text className="mt-1 text-center text-sm leading-5 text-white/45">
                  Aktive Heimwege, die mit dir geteilt werden, erscheinen hier.
                </Text>
              </View>
            ) : null}
          </ScrollView>

          <View className="mt-2 flex-row items-start gap-2 rounded-2xl bg-white/[0.04] px-3.5 py-3">
            <Ionicons name="information-circle-outline" size={16} color="#8EA5FF" />
            <Text className="flex-1 text-xs leading-4 text-white/50">
              Deine Bestätigung gilt 30 Minuten. Bei Gefahr ist 112 die erste Anlaufstelle.
            </Text>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
