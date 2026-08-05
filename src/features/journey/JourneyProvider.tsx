import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import * as Notifications from 'expo-notifications';
import { AppState } from 'react-native';

import { useAuth } from '@/features/auth';
import type { GeoCoordinate } from '@/domain/geo';
import { claimNotificationResponse } from '@/features/notifications/notificationResponse';

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

function distanceBetweenCoordinates(a?: GeoCoordinate, b?: GeoCoordinate) {
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

  const activeJourney = useMemo(
    () =>
      Object.values(records).find(
        (record) => record.status === 'armed' || record.status === 'underway',
      ) ?? null,
    [records],
  );

  const refreshBackgroundRecord = useCallback(async () => {
    const stored = await getBackgroundJourneyRecord();
    setRecords((current) => {
      // Identity-preserving fast paths: this runs on the 15s foreground poll,
      // and returning a fresh object every tick would re-render every journey
      // consumer (including the whole map) even though nothing changed.
      const backgroundRecords = Object.values(current).filter((record) => record.backgroundManaged);
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
        await stopBackgroundJourney(actor, activeJourney.activityId);
        setRecords((current) => ({
          ...current,
          [activeJourney.activityId]: {
            ...activeJourney,
            status: 'stopped',
            updatedAt: new Date().toISOString(),
          },
        }));
      }

      const result = await armBackgroundJourney({
        activity,
        actor,
        requestPermission: true,
      });
      if (!result.ok) return result;
      await refreshBackgroundRecord();
      return { ok: true };
    },
    [activeJourney, actor, refreshBackgroundRecord],
  );

  useEffect(() => {
    const handleResponse = (response: Notifications.NotificationResponse) => {
      if (
        !isJourneyAutoShareResponse(response) ||
        !claimNotificationResponse('journey', response)
      ) {
        return;
      }
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
      void stopBackgroundJourney(actor, activityId).then(() => void refreshBackgroundRecord());
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
      void markBackgroundJourneyArrived(actor, activityId).then(
        () => void refreshBackgroundRecord(),
      );
    },
    [actor, refreshBackgroundRecord],
  );

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
        return {
          ...participant,
          status: location.status === 'arrived' ? 'arrived' : 'underway',
          distanceKm:
            location.status === 'arrived'
              ? 0
              : (distanceBetweenCoordinates(coordinate, activity.targetCoordinate) ?? 0),
          updatedAt: new Date(location.updatedAt).toISOString(),
          coordinate,
          isCurrentUser: location.uid === currentUser.userId,
        } satisfies JourneyParticipant;
      });
      const participantJourneys: JourneyParticipant[] = remoteJourneys;

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
