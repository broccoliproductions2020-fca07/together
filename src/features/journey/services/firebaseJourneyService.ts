import { onDisconnect, onValue, ref, remove, set } from '@react-native-firebase/database';
import { httpsCallable } from '@react-native-firebase/functions';

import { getFirebaseFunctions, getFirebaseRealtimeDb } from '@/shared/services/firebase';

import type { JourneyActor, JourneyLocationDoc, JourneyService } from './journeyService.types';

function ownLocationRef(activityId: string, uid: string) {
  return ref(getFirebaseRealtimeDb(), `journeys/${activityId}/locations/${uid}`);
}

function locationsRef(activityId: string) {
  return ref(getFirebaseRealtimeDb(), `journeys/${activityId}/locations`);
}

function locationDoc(actor: JourneyActor, location: Omit<JourneyLocationDoc, 'uid'>) {
  return {
    uid: actor.uid,
    lat: location.lat,
    lng: location.lng,
    status: location.status,
    updatedAt: location.updatedAt,
    expiresAt: location.expiresAt,
  };
}

async function setJourneyLiveStatus(activityId: string, underway: boolean) {
  const setStatus = httpsCallable<{ activityId: string; underway: boolean }, { ok: boolean }>(
    getFirebaseFunctions(),
    'setJourneyLiveStatus',
  );
  await setStatus({ activityId, underway });
}

async function syncJourneyLiveStatus(activityId: string, underway: boolean) {
  try {
    await setJourneyLiveStatus(activityId, underway);
  } catch (error) {
    // Never let the location-free map decoration delay a privacy-sensitive
    // location cleanup. A later RTDB deletion trigger clears stale summaries.
    console.warn('[journey] Live-Zähler konnte nicht aktualisiert werden:', error);
  }
}

export const firebaseJourneyService: JourneyService = {
  async ensureJourneyMember(_actor, activityId) {
    const ensureMember = httpsCallable<{ activityId: string }, { ok: boolean }>(
      getFirebaseFunctions(),
      'ensureJourneyMember',
    );
    await ensureMember({ activityId });
  },

  subscribeActivityJourney(_actor, activity, cb, onError) {
    const unsubscribe = onValue(locationsRef(activity.id), (snapshot) => {
      const value = snapshot.val() as Record<string, Omit<JourneyLocationDoc, 'uid'>> | null;
      const locations = Object.entries(value ?? {}).map(([uid, data]) => ({
        ...data,
        uid,
      }));
      cb(locations);
    }, onError);

    return () => {
      unsubscribe();
    };
  },

  async startJourney(actor, activity, location) {
    const ownRef = ownLocationRef(activity.id, actor.uid);
    // Auto-remove our live location if the connection drops (app killed, network
    // loss). Register before the first write to avoid a disconnect race.
    await onDisconnect(ownRef).remove();
    await set(ownRef, locationDoc(actor, location));
    await syncJourneyLiveStatus(activity.id, true);
  },

  async updateJourney(actor, activityId, location) {
    const ownRef = ownLocationRef(activityId, actor.uid);
    await set(ownRef, locationDoc(actor, location));
    if (location.status === 'arrived') {
      await syncJourneyLiveStatus(activityId, false);
    }
  },

  async setJourneyLiveStatus(_actor, activityId, underway) {
    await syncJourneyLiveStatus(activityId, underway);
  },

  async stopJourney(actor, activityId) {
    const ownRef = ownLocationRef(activityId, actor.uid);
    // Remove first. If the network drops before this succeeds, the already
    // registered onDisconnect cleanup remains armed instead of leaving a last
    // coordinate behind until the activity expiry.
    await remove(ownRef);
    await onDisconnect(ownRef).cancel().catch(() => {});
    await syncJourneyLiveStatus(activityId, false);
  },
};
