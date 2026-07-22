import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as Notifications from 'expo-notifications';
import { AppState } from 'react-native';

import { useAuth } from '@/features/auth';
import type { MapCoordinate, MarkerAvatar } from '@/features/map/types/map.types';
import {
  coordinateToMockPosition,
  mockPositionToCoordinate,
} from '@/features/map/utils/mockCoordinates';
import { notificationService } from '@/features/notifications/services/notificationService';
import { BACKEND } from '@/shared/services/firebase';

import {
  armBackgroundJourney,
  ensureBackgroundWatcherArmed,
  getBackgroundJourneyRecord,
  isJourneyAutoShareResponse,
  journeyContextFromNotification,
  markBackgroundJourneyArrived,
  prepareJourneyAutomation,
  stopBackgroundJourney,
} from './journeyBackground';
import { journeyService } from './services/journeyService';
import type { JourneyLocationDoc } from './services/journeyService.types';
import type {
  JourneyActivityContext,
  JourneyParticipant,
  JourneyStartResult,
  UserJourneyRecord,
} from './types';

const ARRIVAL_RADIUS_KM = 0.1;
const EVENT_END_BUFFER_MS = 30 * 60 * 1000;
const HARD_MAX_MS = 2 * 60 * 60 * 1000;
const DETECTION_LEAD_MS = 30 * 60 * 1000;
const MOCK_TICK_MS = 30_000;

interface JourneyContextValue {
  /** An armed or already shared journey. Only one can exist at a time. */
  activeJourney: UserJourneyRecord | null;
  getActivityJourneys: (activity: JourneyActivityContext) => JourneyParticipant[];
  getJourneySummary: (activity: JourneyActivityContext) => {
    underwayCount: number;
    arrivedCount: number;
  };
  watchActivityJourney: (activity: JourneyActivityContext) => () => void;
  /** Opts in locally. A point is published only after actual movement. */
  armJourney: (
    activity: JourneyActivityContext,
    options?: { force?: boolean },
  ) => Promise<JourneyStartResult>;
  stopJourney: (activityId: string) => void;
  markArrived: (activityId: string) => void;
}

const JourneyContext = createContext<JourneyContextValue | null>(null);

function hash(input: string) {
  let value = 0;
  for (let i = 0; i < input.length; i += 1) {
    value = (value * 31 + input.charCodeAt(i)) >>> 0;
  }
  return value;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function initialDistanceKm(activityId: string) {
  return Number((0.8 + (hash(activityId) % 48) / 10).toFixed(1));
}

function offsetPosition(
  target: JourneyActivityContext['targetPosition'],
  seed: number,
  distanceKm: number,
) {
  if (!target) return undefined;

  const angle = ((seed % 360) * Math.PI) / 180;
  const spread = clamp(distanceKm * 2.4, 2.5, 14);

  return {
    x: clamp(target.x + Math.cos(angle) * spread, 5, 95),
    y: clamp(target.y + Math.sin(angle) * spread, 8, 92),
  };
}

function distanceBetweenPositions(
  a: JourneyActivityContext['targetPosition'],
  b: JourneyActivityContext['targetPosition'],
) {
  if (!a || !b) return 0;
  return Number((Math.hypot(a.x - b.x, a.y - b.y) / 5).toFixed(1));
}

function distanceBetweenCoordinates(a?: MapCoordinate, b?: MapCoordinate) {
  if (!a || !b) return undefined;
  const earthRadiusKm = 6371;
  const latitudeDelta = ((b.latitude - a.latitude) * Math.PI) / 180;
  const longitudeDelta = ((b.longitude - a.longitude) * Math.PI) / 180;
  const startLatitude = (a.latitude * Math.PI) / 180;
  const endLatitude = (b.latitude * Math.PI) / 180;
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return Number(
    (earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))).toFixed(3),
  );
}

function positionFromCoordinate(coordinate?: MapCoordinate) {
  return coordinate ? coordinateToMockPosition(coordinate) : undefined;
}

function locationFromRecord(record: UserJourneyRecord): Omit<JourneyLocationDoc, 'uid'> {
  const position =
    record.status === 'arrived'
      ? record.targetPosition
      : (positionFromCoordinate(record.currentCoordinate) ??
        offsetPosition(record.targetPosition, hash(`${record.activityId}:you`), record.distanceKm));
  const coordinate =
    (record.status === 'arrived' ? record.targetCoordinate : record.currentCoordinate) ??
    (position ? mockPositionToCoordinate(position) : { latitude: 52.5208, longitude: 13.4095 });

  const hardStopAt = new Date(record.startedAt).getTime() + HARD_MAX_MS;
  const eventStopAt = record.endsAt
    ? new Date(record.endsAt).getTime() + EVENT_END_BUFFER_MS
    : Infinity;

  return {
    lat: coordinate.latitude,
    lng: coordinate.longitude,
    status: record.status === 'arrived' ? 'arrived' : 'onTheWay',
    updatedAt: new Date(record.updatedAt).getTime(),
    expiresAt: Math.min(hardStopAt, eventStopAt),
  };
}

function mockOtherJourney(
  activity: JourneyActivityContext,
  participant: MarkerAvatar,
  index: number,
) {
  const seed = hash(`${activity.id}:${participant.userId}`);
  const arrived = seed % 5 === 0;
  const distanceKm = arrived ? 0 : Number((0.3 + (seed % 22) / 10).toFixed(1));
  const updatedAt = new Date(Date.now() - (seed % 5) * 15000).toISOString();

  return {
    ...participant,
    status: arrived ? 'arrived' : 'underway',
    distanceKm,
    updatedAt,
    position: arrived
      ? activity.targetPosition
      : offsetPosition(activity.targetPosition, seed + index * 41, distanceKm),
  } satisfies JourneyParticipant;
}

function hasEnded(record: UserJourneyRecord, now: number) {
  const hardStopAt = new Date(record.startedAt).getTime() + HARD_MAX_MS;
  const eventStopAt = record.endsAt
    ? new Date(record.endsAt).getTime() + EVENT_END_BUFFER_MS
    : Infinity;
  return now >= hardStopAt || now >= eventStopAt;
}

export function JourneyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const currentUser = useMemo(
    () => ({
      userId: user?.id ?? 'u_you',
      displayName: user?.displayName ?? 'Du',
      initials: (user?.displayName ?? 'Du').slice(0, 2).toUpperCase(),
    }),
    [user?.displayName, user?.id],
  );
  const actor = useMemo(
    () => ({
      uid: currentUser.userId,
      displayName: currentUser.displayName,
      initials: currentUser.initials,
    }),
    [currentUser.displayName, currentUser.initials, currentUser.userId],
  );
  const [records, setRecords] = useState<Record<string, UserJourneyRecord>>({});
  const [remoteLocations, setRemoteLocations] = useState<Record<string, JourneyLocationDoc[]>>({});
  const syncedRef = useRef<
    Record<
      string,
      | 'stopped'
      | {
          status: Extract<UserJourneyRecord['status'], 'underway' | 'arrived'>;
          distanceKm: number;
          updatedAt: string;
        }
    >
  >({});
  const arrivalNotifiedRef = useRef<Set<string>>(new Set());

  const activeJourney = useMemo(
    () =>
      Object.values(records).find(
        (record) => record.status === 'armed' || record.status === 'underway',
      ) ?? null,
    [records],
  );

  const refreshBackgroundRecord = useCallback(async () => {
    if (BACKEND !== 'firebase') return;
    const stored = await getBackgroundJourneyRecord();
    setRecords((current) => {
      // Identity-preserving fast paths: this runs on the 15s foreground poll,
      // and returning a fresh object every tick would re-render every journey
      // consumer (including the whole map) even though nothing changed.
      const backgroundRecords = Object.values(current).filter(
        (record) => record.backgroundManaged,
      );
      if (!stored && backgroundRecords.length === 0) return current;
      if (stored && backgroundRecords.length === 1) {
        const existing = current[stored.activityId];
        if (
          existing?.backgroundManaged &&
          existing.status === stored.status &&
          existing.updatedAt === stored.updatedAt &&
          existing.distanceKm === stored.distanceKm
        ) {
          return current;
        }
      }
      const withoutBackground = Object.fromEntries(
        Object.entries(current).filter(([, record]) => !record.backgroundManaged),
      );
      return stored ? { ...withoutBackground, [stored.activityId]: stored } : withoutBackground;
    });
  }, []);

  useEffect(() => {
    if (BACKEND !== 'firebase') return;
    void prepareJourneyAutomation().catch((error) => {
      console.warn('[journey] Benachrichtigungsaktion nicht verfügbar:', error);
    });
    // Reliable T-30 backstop: the background arm trigger (journeyBackground.ts
    // → scheduleArmTrigger) is best-effort, so every foreground tick catches
    // up an already-consented journey whose window has arrived.
    const tick = () => {
      void ensureBackgroundWatcherArmed().finally(() => void refreshBackgroundRecord());
    };
    tick();
    const timer = setInterval(tick, 15_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') tick();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [refreshBackgroundRecord]);

  const armJourney = useCallback(
    async (
      activity: JourneyActivityContext,
      options?: { force?: boolean },
    ): Promise<JourneyStartResult> => {
      if (activeJourney && activeJourney.activityId !== activity.id && !options?.force) {
        return { ok: false, conflict: activeJourney };
      }

      if (activeJourney && activeJourney.activityId !== activity.id && options?.force) {
        if (BACKEND === 'firebase') {
          await stopBackgroundJourney(actor, activeJourney.activityId);
        }
        setRecords((current) => ({
          ...current,
          [activeJourney.activityId]: {
            ...activeJourney,
            status: 'stopped',
            updatedAt: new Date().toISOString(),
          },
        }));
      }

      if (BACKEND === 'firebase') {
        const result = await armBackgroundJourney({
          activity,
          actor,
          requestPermission: true,
        });
        if (!result.ok) return result;
        await refreshBackgroundRecord();
        return { ok: true };
      }

      const nowMs = Date.now();
      const now = new Date(nowMs).toISOString();
      const startsAt = activity.startsAt ? Date.parse(activity.startsAt) : NaN;
      const detectionStartsAt = Number.isFinite(startsAt)
        ? Math.max(nowMs, startsAt - DETECTION_LEAD_MS)
        : nowMs;
      const nextRecord: UserJourneyRecord = {
        activityId: activity.id,
        title: activity.title,
        status: 'armed',
        distanceKm: initialDistanceKm(activity.id),
        startedAt: new Date(detectionStartsAt).toISOString(),
        armedAt: now,
        detectionStartsAt: new Date(detectionStartsAt).toISOString(),
        updatedAt: now,
        targetCoordinate: activity.targetCoordinate,
        targetPosition: activity.targetPosition,
        endsAt: activity.endsAt,
      };
      setRecords((current) => ({ ...current, [activity.id]: nextRecord }));
      return { ok: true };
    },
    [activeJourney, actor, refreshBackgroundRecord],
  );

  // Mock mode keeps the complete no-network behaviour: armed journeys become
  // visible only on the following simulated movement tick, never immediately.
  useEffect(() => {
    if (BACKEND !== 'mock') return;
    const timer = setInterval(() => {
      setRecords((current) => {
        let changed = false;
        const now = Date.now();
        const next = { ...current };

        Object.values(current).forEach((record) => {
          if (record.status === 'armed') {
            const detectionStartsAt = Date.parse(
              record.detectionStartsAt ?? record.armedAt ?? record.startedAt,
            );
            if (Number.isFinite(detectionStartsAt) && now < detectionStartsAt) return;
            next[record.activityId] = {
              ...record,
              status: 'underway',
              startedAt: new Date(now).toISOString(),
              updatedAt: new Date(now).toISOString(),
            };
            changed = true;
            return;
          }
          if (record.status !== 'underway') return;

          const nextDistance = Number(Math.max(0, record.distanceKm - 0.25).toFixed(2));
          const shouldArrive = nextDistance <= ARRIVAL_RADIUS_KM || hasEnded(record, now);
          next[record.activityId] = {
            ...record,
            status: shouldArrive ? 'arrived' : 'underway',
            distanceKm: shouldArrive ? 0 : nextDistance,
            updatedAt: new Date(now).toISOString(),
          };
          changed = true;
        });

        return changed ? next : current;
      });
    }, MOCK_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  // In Firebase mode the global native task owns all RTDB writes. This effect
  // exists solely for the offline mock implementation.
  useEffect(() => {
    if (BACKEND !== 'mock') return;
    Object.values(records).forEach((record) => {
      const synced = syncedRef.current[record.activityId];
      if (record.status === 'stopped') {
        if (synced === 'stopped') return;
        syncedRef.current[record.activityId] = 'stopped';
        void journeyService.stopJourney(actor, record.activityId);
        return;
      }
      if (record.status === 'armed') return;

      if (
        synced &&
        synced !== 'stopped' &&
        synced.status === record.status &&
        synced.distanceKm === record.distanceKm &&
        synced.updatedAt === record.updatedAt
      ) {
        return;
      }

      syncedRef.current[record.activityId] = {
        status: record.status,
        distanceKm: record.distanceKm,
        updatedAt: record.updatedAt,
      };
      if (!synced || synced === 'stopped') {
        void journeyService.startJourney(
          actor,
          {
            id: record.activityId,
            title: record.title,
            participants: [],
            targetCoordinate: record.targetCoordinate,
            targetPosition: record.targetPosition,
            endsAt: record.endsAt,
          },
          locationFromRecord(record),
        );
      } else {
        void journeyService.updateJourney(actor, record.activityId, locationFromRecord(record));
      }
    });
  }, [actor, records]);

  useEffect(() => {
    if (BACKEND !== 'firebase') return;
    const handleResponse = (response: Notifications.NotificationResponse) => {
      if (!isJourneyAutoShareResponse(response)) return;
      const activity = journeyContextFromNotification(response);
      if (activity) void armJourney(activity);
    };
    const subscription = Notifications.addNotificationResponseReceivedListener(handleResponse);
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) handleResponse(response);
    });
    return () => subscription.remove();
  }, [armJourney]);

  const watchActivityJourney = useCallback(
    (activity: JourneyActivityContext) =>
      journeyService.subscribeActivityJourney(actor, activity, (locations) => {
        const now = Date.now();
        setRemoteLocations((current) => ({
          ...current,
          [activity.id]: locations.filter((location) => location.expiresAt > now),
        }));
      }),
    [actor],
  );

  const stopJourney = useCallback(
    (activityId: string) => {
      setRecords((current) => {
        const record = current[activityId];
        if (!record) return current;
        return {
          ...current,
          [activityId]: { ...record, status: 'stopped', updatedAt: new Date().toISOString() },
        };
      });
      if (BACKEND === 'firebase') {
        void stopBackgroundJourney(actor, activityId).then(() => void refreshBackgroundRecord());
      }
    },
    [actor, refreshBackgroundRecord],
  );

  const markArrived = useCallback(
    (activityId: string) => {
      setRecords((current) => {
        const record = current[activityId];
        if (!record) return current;
        return {
          ...current,
          [activityId]: {
            ...record,
            status: 'arrived',
            distanceKm: 0,
            updatedAt: new Date().toISOString(),
          },
        };
      });
      if (BACKEND === 'firebase') {
        void markBackgroundJourneyArrived(actor, activityId).then(
          () => void refreshBackgroundRecord(),
        );
      }
    },
    [actor, refreshBackgroundRecord],
  );

  useEffect(() => {
    if (BACKEND !== 'mock') return;
    Object.values(records).forEach((record) => {
      if (record.status !== 'arrived' || arrivalNotifiedRef.current.has(record.activityId)) return;
      arrivalNotifiedRef.current.add(record.activityId);
      void notificationService.showJourneyStatus({
        activityId: record.activityId,
        title: record.title,
        state: 'arrived',
      });
    });
  }, [records]);

  const getActivityJourneys = useCallback(
    (activity: JourneyActivityContext) => {
      const remoteJourneys = (remoteLocations[activity.id] ?? []).map((location) => {
        const participant =
          location.uid === currentUser.userId
            ? currentUser
            : (activity.participants.find((item) => item.userId === location.uid) ?? {
                userId: location.uid,
                displayName: 'Teilnehmer',
                initials: 'TN',
              });
        const coordinate = { latitude: location.lat, longitude: location.lng };
        const position = coordinateToMockPosition(coordinate);

        return {
          ...participant,
          status: location.status === 'arrived' ? 'arrived' : 'underway',
          distanceKm:
            location.status === 'arrived'
              ? 0
              : (distanceBetweenCoordinates(coordinate, activity.targetCoordinate) ??
                distanceBetweenPositions(activity.targetPosition, position)),
          updatedAt: new Date(location.updatedAt).toISOString(),
          coordinate,
          position,
          isCurrentUser: location.uid === currentUser.userId,
        } satisfies JourneyParticipant;
      });
      const hasSeededJourneys = BACKEND === 'mock' && hash(activity.id) % 3 === 0;
      const participantJourneys: JourneyParticipant[] = remoteJourneys.length
        ? remoteJourneys
        : hasSeededJourneys
          ? activity.participants
              .filter((participant) => participant.userId !== currentUser.userId)
              .slice(0, 4)
              .map((participant, index) => mockOtherJourney(activity, participant, index))
          : [];

      const ownRecord = records[activity.id];
      const hasRemoteOwnRecord = participantJourneys.some(
        (journey) => journey.userId === currentUser.userId,
      );
      if (
        ownRecord &&
        (ownRecord.status === 'underway' || ownRecord.status === 'arrived') &&
        !hasRemoteOwnRecord
      ) {
        participantJourneys.unshift({
          ...currentUser,
          status: ownRecord.status,
          distanceKm: ownRecord.distanceKm,
          updatedAt: ownRecord.updatedAt,
          coordinate:
            ownRecord.status === 'arrived'
              ? ownRecord.targetCoordinate
              : ownRecord.currentCoordinate,
          position:
            ownRecord.status === 'arrived'
              ? (positionFromCoordinate(ownRecord.targetCoordinate) ?? activity.targetPosition)
              : (positionFromCoordinate(ownRecord.currentCoordinate) ??
                offsetPosition(
                  activity.targetPosition,
                  hash(`${activity.id}:you`),
                  ownRecord.distanceKm,
                )),
          isCurrentUser: true,
        });
      }
      return participantJourneys;
    },
    [currentUser, records, remoteLocations],
  );

  const getJourneySummary = useCallback(
    (activity: JourneyActivityContext) => {
      const journeys = getActivityJourneys(activity);
      return {
        underwayCount: journeys.filter((journey) => journey.status === 'underway').length,
        arrivedCount: journeys.filter((journey) => journey.status === 'arrived').length,
      };
    },
    [getActivityJourneys],
  );

  const value = useMemo<JourneyContextValue>(
    () => ({
      activeJourney,
      getActivityJourneys,
      getJourneySummary,
      watchActivityJourney,
      armJourney,
      stopJourney,
      markArrived,
    }),
    [
      activeJourney,
      armJourney,
      getActivityJourneys,
      getJourneySummary,
      markArrived,
      stopJourney,
      watchActivityJourney,
    ],
  );

  return <JourneyContext.Provider value={value}>{children}</JourneyContext.Provider>;
}

export function useJourney() {
  const context = useContext(JourneyContext);
  if (!context) throw new Error('useJourney must be used within JourneyProvider');
  return context;
}
