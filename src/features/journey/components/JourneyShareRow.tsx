import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { colorWithAlpha } from '@/features/map/utils/markerStyles';

import { useJourney } from '../JourneyProvider';
import type {
  JourneyActivityContext,
  JourneyParticipant,
  JourneyStartResult,
  UserJourneyRecord,
} from '../types';

/** Fixed accent — deliberately NOT the activity's mode color (which shifts
 * orange/blue/green per soon/open/now): Anreise is always this green, the
 * same "go" green used for arrival elsewhere, so it reads consistently
 * regardless of which activity it's attached to. rgb(...) (not hex) — required
 * by colorWithAlpha, which only rewrites the "rgb(" prefix. */
const JOURNEY_COLOR = 'rgb(65,192,141)';

interface JourneyShareRowProps {
  activityId: string;
  context: JourneyActivityContext;
  journeys: JourneyParticipant[];
  armedJourney?: UserJourneyRecord;
  /** Controls only the inactive entry. Active/arrived journeys always remain visible. */
  idlePresentation: 'hidden' | 'action';
  onFocusParticipant?: (participantId?: string) => void;
}

function formatDistance(distanceKm: number) {
  if (distanceKm <= 0) return 'am Ziel';
  if (distanceKm < 1) return `${Math.round(distanceKm * 1000)} m`;
  return `${distanceKm.toLocaleString('de-DE', { maximumFractionDigits: 1 })} km`;
}

/**
 * The compact Anreise entry (replaced the old full-card panel). The
 * primary path is the 1 h-before reminder (see docs/safety-mode.md → Anreise);
 * this row is the manual fallback plus the live status while underway, so the
 * activity sheet stays quiet when nothing is happening.
 */
export function JourneyShareRow({
  activityId,
  context,
  journeys,
  armedJourney,
  idlePresentation,
  onFocusParticipant,
}: JourneyShareRowProps) {
  const { armJourney, stopJourney, markArrived } = useJourney();
  const [conflict, setConflict] = useState<UserJourneyRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stopping, setStopping] = useState(false);
  const stoppingRef = useRef(false);

  const ownJourney = journeys.find((journey) => journey.isCurrentUser);
  const state = armedJourney ? 'armed' : (ownJourney?.status ?? 'idle');

  // Honest armed copy: until T-30 every location reading is discarded, so
  // "sichtbar sobald du dich bewegst" would be a false promise for an early
  // opt-in. Name the actual start of the detection window instead.
  const detectionStartsAtMs = armedJourney?.detectionStartsAt
    ? Date.parse(armedJourney.detectionStartsAt)
    : NaN;
  const detectionPending = Number.isFinite(detectionStartsAtMs) && detectionStartsAtMs > Date.now();
  const armedSubtitle = detectionPending
    ? `Ab ca. ${new Date(detectionStartsAtMs).toLocaleTimeString('de-DE', {
        hour: '2-digit',
        minute: '2-digit',
      })} Uhr sichtbar, sobald du dich wirklich bewegst.`
    : 'Sichtbar, sobald du dich wirklich bewegst.';

  async function requestStart(force = false) {
    if (busy) return;
    setBusy(true);
    setError(null);
    let result: JourneyStartResult;
    try {
      result = await armJourney(context, { force });
    } catch {
      setError('Die Anreise konnte nicht gestartet werden. Gleich nochmal versuchen.');
      return;
    } finally {
      setBusy(false);
    }
    if (!result.ok && result.conflict) {
      setConflict(result.conflict);
      return;
    }
    if (!result.ok) {
      setError(
        result.reason === 'location-permission'
          ? 'Erlaube den Standort, damit die Anreise starten kann.'
          : result.reason === 'background-unavailable'
            ? 'Automatische Anreise ist auf diesem Gerät nicht verfügbar.'
            : result.reason === 'destination-required'
              ? 'Diese Activity braucht einen Ort auf der Karte.'
              : 'Dein Standort ist gerade nicht verfügbar. Gleich nochmal versuchen.',
      );
      return;
    }
    setConflict(null);
  }

  async function requestStop() {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    setStopping(true);
    setError(null);
    try {
      await stopJourney(activityId);
    } catch {
      setError('Das Teilen läuft weiter, weil dein Standort noch nicht sicher entfernt werden konnte.');
    } finally {
      stoppingRef.current = false;
      setStopping(false);
    }
  }

  const containerStyle = {
    borderColor: colorWithAlpha(JOURNEY_COLOR, 0.22),
    backgroundColor: colorWithAlpha(JOURNEY_COLOR, 0.08),
  };

  // Idle is deliberately contextual: the row appears in the six-hour window
  // before start. The immediate consent prompt after JOINING a near-term
  // activity is owned by the map screen, not by this reusable row — creating
  // one never prompts, because you picked the place yourself.
  if (state === 'idle') {
    if (idlePresentation === 'hidden') return null;

    return (
      <View className="mt-5">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Anreise teilen"
          disabled={busy}
          onPress={() => void requestStart()}
          className="flex-row items-center gap-3 rounded-2xl border px-4 py-3.5 active:opacity-80"
          style={containerStyle}
        >
          <View
            className="h-10 w-10 items-center justify-center rounded-full"
            style={{ backgroundColor: colorWithAlpha(JOURNEY_COLOR, 0.18) }}
          >
            <Ionicons name="navigate-outline" size={19} color={JOURNEY_COLOR} />
          </View>
          <View className="flex-1">
            <Text className="text-[15px] font-bold text-foreground">Anreise teilen</Text>
            <Text className="mt-0.5 text-xs leading-4 text-muted-foreground">
              Erst bei echter Bewegung für die Teilnehmer sichtbar.
            </Text>
          </View>
          {busy ? (
            <ActivityIndicator size="small" color={JOURNEY_COLOR} />
          ) : (
            <Ionicons name="chevron-forward" size={17} color="rgba(127,127,127,0.6)" />
          )}
        </Pressable>
        {conflict ? (
          <ConflictPrompt
            conflict={conflict}
            onCancel={() => setConflict(null)}
            onConfirm={() => void requestStart(true)}
          />
        ) : null}
        {error ? <Text className="mt-2 text-xs text-destructive">{error}</Text> : null}
      </View>
    );
  }

  // Arrived → quiet confirmation, no actions.
  if (state === 'arrived') {
    return (
      <View
        className="mt-5 flex-row items-center gap-3 rounded-2xl border px-4 py-3.5"
        style={containerStyle}
      >
        <View
          className="h-10 w-10 items-center justify-center rounded-full"
          style={{ backgroundColor: colorWithAlpha(JOURNEY_COLOR, 0.16) }}
        >
          <Ionicons name="checkmark-circle" size={19} color={JOURNEY_COLOR} />
        </View>
        <View className="flex-1">
          <Text className="text-[15px] font-bold text-foreground">Du bist angekommen</Text>
          <Text className="mt-0.5 text-xs text-muted-foreground">
            Dein Live-Standort ist nicht mehr sichtbar.
          </Text>
        </View>
      </View>
    );
  }

  // Armed or underway → live status with a stop (and arrival) control.
  const underway = state === 'underway';
  return (
    <View className="mt-5 gap-2.5 rounded-2xl border px-4 py-3.5" style={containerStyle}>
      <View className="flex-row items-center gap-3">
        <View
          className="h-10 w-10 items-center justify-center rounded-full"
          style={{ backgroundColor: colorWithAlpha(JOURNEY_COLOR, 0.18) }}
        >
          <Ionicons name="navigate" size={19} color={JOURNEY_COLOR} />
        </View>
        <View className="flex-1">
          <Text className="text-[15px] font-bold text-foreground">
            {underway ? 'Du teilst deine Anreise' : 'Anreise vorbereitet'}
          </Text>
          <Text className="mt-0.5 text-xs leading-4 text-muted-foreground">
            {underway && ownJourney
              ? `${formatDistance(ownJourney.distanceKm)} entfernt · stoppt am Ziel`
              : armedSubtitle}
          </Text>
        </View>
        {underway && onFocusParticipant ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Anreise auf Karte zeigen"
            onPress={() => onFocusParticipant()}
            hitSlop={6}
            className="h-9 w-9 items-center justify-center rounded-full bg-card/80 active:opacity-75"
          >
            <Ionicons name="map-outline" size={17} color={JOURNEY_COLOR} />
          </Pressable>
        ) : null}
      </View>
      <View className="flex-row gap-2">
        {underway ? (
          <Pressable
            accessibilityRole="button"
            className="flex-1 rounded-xl px-3 py-2"
            style={{ backgroundColor: JOURNEY_COLOR }}
            onPress={() => markArrived(activityId)}
          >
            <Text className="text-center text-xs font-bold text-white">Angekommen</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={stopping ? 'Teilen wird gestoppt' : 'Anreise teilen stoppen'}
          disabled={stopping}
          className="flex-1 rounded-xl bg-secondary px-3 py-2"
          onPress={() => void requestStop()}
        >
          <Text className="text-center text-xs font-bold text-secondary-foreground">
            {stopping ? 'Wird gestoppt …' : 'Teilen stoppen'}
          </Text>
        </Pressable>
      </View>
      {error ? <Text className="text-xs text-destructive">{error}</Text> : null}
    </View>
  );
}

function ConflictPrompt({
  conflict,
  onConfirm,
  onCancel,
}: {
  conflict: UserJourneyRecord;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <View className="mt-2 rounded-2xl border border-border bg-background/70 p-3">
      <Text className="text-sm font-bold text-foreground">Anreise wechseln?</Text>
      <Text className="mt-1 text-xs leading-5 text-muted-foreground">
        Du teilst gerade deine Anreise zu {conflict.title}. Du kannst nur zu einer Activity
        gleichzeitig unterwegs sein.
      </Text>
      <View className="mt-3 flex-row gap-2">
        <Pressable
          accessibilityRole="button"
          className="flex-1 rounded-xl px-3 py-2"
          style={{ backgroundColor: JOURNEY_COLOR }}
          onPress={onConfirm}
        >
          <Text className="text-center text-xs font-bold text-white">Wechseln</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          className="flex-1 rounded-xl bg-secondary px-3 py-2"
          onPress={onCancel}
        >
          <Text className="text-center text-xs font-bold text-secondary-foreground">Bleiben</Text>
        </Pressable>
      </View>
    </View>
  );
}
