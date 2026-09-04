import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { colorWithAlpha } from '@/features/map/utils/markerStyles';
import { loaderSizeForIcon, TogetherLoader } from '@/shared/components';
import { SEMANTIC_COLOR } from '@/shared/utils/semanticColors';

import { useJourney } from '../JourneyProvider';
import type {
  JourneyActivityContext,
  JourneyParticipant,
  JourneyStartResult,
  UserJourneyRecord,
} from '../types';

/** Fixed semantic accent so Anreise stays recognizable across Activity modes. */
const JOURNEY_COLOR = SEMANTIC_COLOR.journey;

interface JourneyShareRowProps {
  activityId: string;
  context: JourneyActivityContext;
  journeys: JourneyParticipant[];
  viewerError?: string | null;
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
  viewerError,
  armedJourney,
  idlePresentation,
  onFocusParticipant,
}: JourneyShareRowProps) {
  const { armJourney, stopJourney, markArrived } = useJourney();
  const [conflict, setConflict] = useState<UserJourneyRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [permissionBlocked, setPermissionBlocked] = useState(false);
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
    setPermissionBlocked(false);
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
      setPermissionBlocked(result.reason === 'location-permission');
      setError(
        result.reason === 'location-permission'
          ? 'Erlaube den Standort, damit die Anreise starten kann.'
          : result.reason === 'background-unavailable'
            ? 'Automatische Anreise ist auf diesem Gerät nicht verfügbar.'
            : result.reason === 'destination-required'
              ? 'Diese Activity braucht einen Ort auf der Karte.'
              : result.reason === 'activity-unavailable'
                ? 'Die Activity oder ihre Anreise ist nicht mehr verfügbar.'
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
      setError(
        'Das Teilen läuft weiter, weil dein Standort noch nicht sicher entfernt werden konnte.',
      );
    } finally {
      stoppingRef.current = false;
      setStopping(false);
    }
  }

  const containerStyle = {
    borderColor: colorWithAlpha(JOURNEY_COLOR, 0.22),
    backgroundColor: colorWithAlpha(JOURNEY_COLOR, 0.08),
  };

  // Idle is deliberately contextual: the row appears in the one-hour window
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
            <TogetherLoader color={JOURNEY_COLOR} size={loaderSizeForIcon(17)} />
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
        {permissionBlocked ? (
          <Pressable
            accessibilityRole="button"
            className="mt-2 min-h-11 items-center justify-center rounded-2xl bg-secondary px-4"
            onPress={() => void Linking.openSettings()}
          >
            <Text className="text-sm font-bold text-secondary-foreground">
              Einstellungen öffnen
            </Text>
          </Pressable>
        ) : null}
        {viewerError ? <Text className="mt-2 text-xs text-destructive">{viewerError}</Text> : null}
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
              ? ownJourney.distanceKm <= 0
                ? 'Am Ziel · wird automatisch beendet'
                : `${formatDistance(ownJourney.distanceKm)} Luftlinie · stoppt am Ziel`
              : armedSubtitle}
          </Text>
        </View>
        {underway && onFocusParticipant ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Anreise auf Karte zeigen"
            onPress={() => onFocusParticipant()}
            className="h-11 w-11 items-center justify-center rounded-full bg-card/80 active:opacity-75"
          >
            <Ionicons name="map-outline" size={17} color={JOURNEY_COLOR} />
          </Pressable>
        ) : null}
      </View>
      <Text className="text-xs leading-4 text-muted-foreground">
        Stoppt automatisch am Ziel, spätestens nach 2 Stunden oder 30 Minuten nach Activity-Ende.
      </Text>
      <View className="flex-row gap-2">
        {underway ? (
          <Pressable
            accessibilityRole="button"
            className="min-h-11 flex-1 items-center justify-center rounded-xl px-3"
            style={{ backgroundColor: JOURNEY_COLOR }}
            onPress={() => markArrived(activityId)}
          >
            <Text className="text-center text-sm font-bold text-white">Angekommen</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={stopping ? 'Teilen wird gestoppt' : 'Anreise teilen stoppen'}
          disabled={stopping}
          className="min-h-11 flex-1 items-center justify-center rounded-xl bg-secondary px-3"
          onPress={() => void requestStop()}
        >
          <Text className="text-center text-sm font-bold text-secondary-foreground">
            {stopping ? 'Wird gestoppt …' : 'Teilen stoppen'}
          </Text>
        </Pressable>
      </View>
      {error ? <Text className="text-xs text-destructive">{error}</Text> : null}
      {viewerError ? <Text className="text-xs text-destructive">{viewerError}</Text> : null}
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
          className="min-h-11 flex-1 items-center justify-center rounded-xl px-3"
          style={{ backgroundColor: JOURNEY_COLOR }}
          onPress={onConfirm}
        >
          <Text className="text-center text-sm font-bold text-white">Wechseln</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          className="min-h-11 flex-1 items-center justify-center rounded-xl bg-secondary px-3"
          onPress={onCancel}
        >
          <Text className="text-center text-sm font-bold text-secondary-foreground">Bleiben</Text>
        </Pressable>
      </View>
    </View>
  );
}
