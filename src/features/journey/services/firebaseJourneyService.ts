import { onDisconnect, onValue, ref, remove, set } from '@react-native-firebase/database';
import { httpsCallable } from '@react-native-firebase/functions';

import { getFirebaseFunctions, getFirebaseRealtimeDb } from '@/shared/services/firebase';

import type {
  JourneyActor,
  JourneyAuthorizedContext,
  JourneyLocationDoc,
  JourneyService,
} from './journeyService.types';

const READ_CLOCK_TOLERANCE_MS = 30_000;

function ownLocationRef(activityId: string, sessionId: string) {
  return ref(getFirebaseRealtimeDb(), `journeys/${activityId}/locations/${sessionId}`);
}

function sessionsRef(activityId: string) {
  return ref(getFirebaseRealtimeDb(), `journeys/${activityId}/sessions`);
}

function locationDoc(
  actor: JourneyActor,
  sessionId: string,
  location: Omit<JourneyLocationDoc, 'uid' | 'sessionId'>,
) {
  return {
    uid: actor.uid,
    sessionId,
    lat: location.lat,
    lng: location.lng,
    status: location.status,
    updatedAt: location.updatedAt,
    expiresAt: location.expiresAt,
  };
}

async function setJourneyLiveStatus(activityId: string, sessionId: string, underway: boolean) {
  const setStatus = httpsCallable<
    { activityId: string; sessionId: string; underway: boolean },
    { ok: boolean }
  >(getFirebaseFunctions(), 'setJourneyLiveStatus');
  await setStatus({ activityId, sessionId, underway });
}

async function syncJourneyLiveStatus(activityId: string, sessionId: string, underway: boolean) {
  try {
    await setJourneyLiveStatus(activityId, sessionId, underway);
  } catch (error) {
    // The Firestore count is decoration. RTDB deletion remains the privacy boundary.
    console.warn('[journey] Live-Zähler konnte nicht aktualisiert werden:', error);
  }
}

export const firebaseJourneyService: JourneyService = {
  async ensureJourneyMember(_actor, activityId, options) {
    const ensureMember = httpsCallable<
      { activityId: string; sessionId?: string },
      { ok: boolean; activity: JourneyAuthorizedContext }
    >(getFirebaseFunctions(), 'ensureJourneyMember');
    const result = await ensureMember({ activityId, ...options });
    return result.data.activity;
  },

  subscribeActivityJourney(_actor, activity, cb, onError) {
    const locationsBySession = new Map<string, JourneyLocationDoc>();
    const locationUnsubscribers = new Map<string, () => void>();

    const emit = () => {
      const newestByUser = new Map<string, JourneyLocationDoc>();
      const freshnessFloor = Date.now() - READ_CLOCK_TOLERANCE_MS;
      locationsBySession.forEach((location) => {
        if (location.expiresAt < freshnessFloor) return;
        const current = newestByUser.get(location.uid);
        if (!current || location.updatedAt > current.updatedAt) newestByUser.set(location.uid, location);
      });
      cb([...newestByUser.values()]);
    };

    const unsubscribeSessions = onValue(
      sessionsRef(activity.id),
      (snapshot) => {
        const sessions = snapshot.val() as Record<string, string> | null;
        const activeSessionIds = new Set(
          Object.values(sessions ?? {}).filter(
            (sessionId) => typeof sessionId === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(sessionId),
          ),
        );

        locationUnsubscribers.forEach((unsubscribe, sessionId) => {
          if (activeSessionIds.has(sessionId)) return;
          unsubscribe();
          locationUnsubscribers.delete(sessionId);
          locationsBySession.delete(sessionId);
        });

        activeSessionIds.forEach((sessionId) => {
          if (locationUnsubscribers.has(sessionId)) return;
          const unsubscribe = onValue(
            ownLocationRef(activity.id, sessionId),
            (locationSnapshot) => {
              const data = locationSnapshot.val() as Omit<JourneyLocationDoc, 'sessionId'> | null;
              if (data) locationsBySession.set(sessionId, { ...data, sessionId });
              else locationsBySession.delete(sessionId);
              emit();
            },
            (error) => {
              locationsBySession.delete(sessionId);
              emit();
              if (!String(error).toLowerCase().includes('permission')) onError?.(error);
            },
          );
          locationUnsubscribers.set(sessionId, unsubscribe);
        });
        emit();
      },
      onError,
    );

    return () => {
      unsubscribeSessions();
      locationUnsubscribers.forEach((unsubscribe) => unsubscribe());
      locationUnsubscribers.clear();
      locationsBySession.clear();
    };
  },

  async startJourney(actor, activity, sessionId, location) {
    const ownRef = ownLocationRef(activity.id, sessionId);
    await onDisconnect(ownRef).remove();
    await set(ownRef, locationDoc(actor, sessionId, location));
    await syncJourneyLiveStatus(activity.id, sessionId, true);
  },

  async updateJourney(actor, activityId, sessionId, location) {
    const ownRef = ownLocationRef(activityId, sessionId);
    // onDisconnect actions fire once. Re-register on every refreshed point so
    // a connection that dropped and came back owns a new cleanup again.
    await onDisconnect(ownRef).remove();
    await set(ownRef, locationDoc(actor, sessionId, location));
  },

  async setJourneyLiveStatus(_actor, activityId, sessionId, underway) {
    await syncJourneyLiveStatus(activityId, sessionId, underway);
  },

  async stopJourney(actor, activityId, sessionId) {
    const ownRef = ownLocationRef(activityId, sessionId);
    await remove(ownRef);
    await onDisconnect(ownRef).cancel().catch(() => {});
    await syncJourneyLiveStatus(activityId, sessionId, false);
  },
};
