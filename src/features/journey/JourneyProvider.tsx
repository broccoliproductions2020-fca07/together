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
import { Alert, AppState, Linking } from 'react-native';

import { useAuth } from '@/features/auth';
import type { GeoCoordinate } from '@/domain/geo';
import { claimNotificationResponse } from '@/features/notifications/notificationResponse';
import { notificationService } from '@/features/notifications/services/notificationService';

import {
  armBackgroundJourney,
  ensureBackgroundWatcherArmed,
  getBackgroundJourneyRecord,
  isJourneyDecisionResponse,
  journeyDecisionFromNotification,
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
  getActivityJourneyError: (activityId: string) => string | null;
  watchActivityJourney: (activity: JourneyActivityContext) => () => void;
  /** Opts in locally. A point is published only after actual movement. */
  armJourney: (
    activity: JourneyActivityContext,
    options?: { force?: boolean },
  ) => Promise<JourneyStartResult>;
  stopJourney: (activityId: string) => Promise<void>;
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
  const [viewerErrors, setViewerErrors] = useState<Record<string, string>>({});
  const activeAccountUidRef = useRef(actor.uid);
  activeAccountUidRef.current = actor.uid;
  const journeyViewerAccessRef = useRef<{
    uid: string;
    requests: Map<string, Promise<void>>;
  }>({ uid: '', requests: new Map() });

  useEffect(() => {
    setRecords({});
    setRemoteLocations({});
    setViewerErrors({});
    journeyViewerAccessRef.current = { uid: actor.uid, requests: new Map() };
  }, [actor.uid]);

  const activeJourney = useMemo(
    () =>
      Object.values(records).find(
        (record) => record.status === 'armed' || record.status === 'underway',
      ) ?? null,
    [records],
  );

  const refreshBackgroundRecord = useCallback(async () => {
    const accountUid = actor.uid;
    const stored = await getBackgroundJourneyRecord(accountUid);
    if (activeAccountUidRef.current !== accountUid) return;
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
  }, [actor.uid]);

  const syncBackgroundWatcher = useCallback(() => {
    void ensureBackgroundWatcherArmed()
      .catch((error) =>
        console.warn('[journey] Vorbereitung konnte nicht abgeglichen werden:', error),
      )
      .finally(() => void refreshBackgroundRecord());
  }, [refreshBackgroundRecord]);

  useEffect(() => {
    void prepareJourneyAutomation().catch((error) => {
      console.warn('[journey] Benachrichtigungsaktion nicht verfügbar:', error);
    });
    // Reliable T-30 backstop: the background arm trigger (journeyBackground.ts
    // → scheduleArmTrigger) is best-effort, so every foreground tick catches
    // up an already-consented journey whose window has arrived.
    syncBackgroundWatcher();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') syncBackgroundWatcher();
    });
    return () => subscription.remove();
  }, [syncBackgroundWatcher]);

  useEffect(() => {
    if (!activeJourney) return;
    const timer = setInterval(syncBackgroundWatcher, 15_000);
    return () => clearInterval(timer);
  }, [activeJourney, syncBackgroundWatcher]);

  const hasRemoteLocations = Object.values(remoteLocations).some((items) => items.length > 0);
  useEffect(() => {
    if (!hasRemoteLocations) return;
    const timer = setInterval(() => {
      const now = Date.now();
      setRemoteLocations((current) => {
        let changed = false;
        const next = Object.fromEntries(
          Object.entries(current).map(([activityId, items]) => {
            const fresh = items.filter((item) => item.expiresAt > now);
            if (fresh.length !== items.length) changed = true;
            return [activityId, fresh];
          }),
        );
        return changed ? next : current;
      });
    }, 15_000);
    return () => clearInterval(timer);
  }, [hasRemoteLocations]);

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
        !isJourneyDecisionResponse(response) ||
        !claimNotificationResponse('journey', response)
      ) {
        return;
      }
      void Notifications.clearLastNotificationResponseAsync().catch(() => {});
      const decision = journeyDecisionFromNotification(response);
      if (!decision) return;
      void notificationService
        .resolveJourneyReminder(actor, decision)
        .catch(() => {});
      if (!decision.share) return;
      const activity = journeyContextFromNotification(response);
      if (!activity) return;
      void armJourney(activity).then((result) => {
        if (result.ok) return;
        const message = result.conflict
          ? `Du teilst bereits deine Anreise zu ${result.conflict.title}. Öffne die Activity, um zu wechseln.`
          : result.reason === 'location-permission'
            ? 'Erlaube den Standort in den Einstellungen und versuche es in der Activity erneut.'
            : result.reason === 'destination-required'
              ? 'Diese Activity hat keinen Kartenort.'
              : 'Die Activity oder ihre Anreise ist nicht mehr verfügbar.';
        Alert.alert(
          'Anreise nicht gestartet',
          message,
          result.reason === 'location-permission'
            ? [
                { text: 'Abbrechen', style: 'cancel' },
                { text: 'Einstellungen öffnen', onPress: () => void Linking.openSettings() },
              ]
            : undefined,
        );
      });
    };
    const subscription = Notifications.addNotificationResponseReceivedListener(handleResponse);
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) handleResponse(response);
    });
    return () => subscription.remove();
  }, [actor, armJourney]);

  const ensureJourneyViewerAccess = useCallback(
    (activityId: string): Promise<void> => {
      const cache = journeyViewerAccessRef.current;
      if (cache.uid !== actor.uid) {
        cache.uid = actor.uid;
        cache.requests.clear();
      }
      const existing = cache.requests.get(activityId);
      if (existing) return existing;

      const request = journeyService
        .ensureJourneyMember(actor, activityId)
        .then(() => undefined)
        .catch((error) => {
          cache.requests.delete(activityId);
          throw error;
        });
      cache.requests.set(activityId, request);
      return request;
    },
    [actor],
  );

  const watchActivityJourney = useCallback(
    (activity: JourneyActivityContext) => {
      const accountUid = actor.uid;
      let cancelled = false;
      let unsubscribe: (() => void) | undefined;

      void ensureJourneyViewerAccess(activity.id)
        .then(() => {
          if (cancelled || activeAccountUidRef.current !== accountUid) return;
          setViewerErrors((current) => {
            if (!(activity.id in current)) return current;
            const next = { ...current };
            delete next[activity.id];
            return next;
          });
          unsubscribe = journeyService.subscribeActivityJourney(
            actor,
            activity,
            (locations) => {
              if (activeAccountUidRef.current !== accountUid) return;
              const now = Date.now();
              setRemoteLocations((current) => ({
                ...current,
                [activity.id]: locations.filter((location) => location.expiresAt > now),
              }));
            },
            () => {
              if (activeAccountUidRef.current !== accountUid) return;
              journeyViewerAccessRef.current.requests.delete(activity.id);
              setViewerErrors((current) => ({
                ...current,
                [activity.id]: 'Live-Anreisen konnten nicht geladen werden.',
              }));
              setRemoteLocations((current) => {
                if (!(activity.id in current)) return current;
                const next = { ...current };
                delete next[activity.id];
                return next;
              });
            },
          );
        })
        .catch(() => {
          if (activeAccountUidRef.current !== accountUid) return;
          setViewerErrors((current) => ({
            ...current,
            [activity.id]: 'Live-Anreisen konnten nicht geladen werden.',
          }));
          setRemoteLocations((current) => {
            if (!(activity.id in current)) return current;
            const next = { ...current };
            delete next[activity.id];
            return next;
          });
        });

      return () => {
        cancelled = true;
        unsubscribe?.();
      };
    },
    [actor, ensureJourneyViewerAccess],
  );

  const stopJourney = useCallback(
    async (activityId: string) => {
      await stopBackgroundJourney(actor, activityId);
      setRecords((current) => {
        const record = current[activityId];
        if (!record) return current;
        return {
          ...current,
          [activityId]: { ...record, status: 'stopped', updatedAt: new Date().toISOString() },
        };
      });
      await refreshBackgroundRecord();
    },
    [actor, refreshBackgroundRecord],
  );

  const markArrived = useCallback(
    (activityId: string) => {
      void markBackgroundJourneyArrived(actor, activityId).then(
        () => void refreshBackgroundRecord(),
        (error) => console.warn('[journey] Ankunft konnte nicht beendet werden:', error),
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
          coordinate: ownRecord.status === 'underway' ? ownRecord.currentCoordinate : undefined,
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

  const getActivityJourneyError = useCallback(
    (activityId: string) => viewerErrors[activityId] ?? null,
    [viewerErrors],
  );

  const value = useMemo<JourneyContextValue>(
    () => ({
      activeJourney,
      getActivityJourneys,
      getJourneySummary,
      getActivityJourneyError,
      watchActivityJourney,
      armJourney,
      stopJourney,
      markArrived,
    }),
    [
      activeJourney,
      armJourney,
      getActivityJourneys,
      getActivityJourneyError,
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
