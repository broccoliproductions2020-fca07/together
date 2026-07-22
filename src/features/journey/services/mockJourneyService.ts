import type { JourneyLocationDoc, JourneyService } from './journeyService.types';

const rooms = new Map<string, Map<string, JourneyLocationDoc>>();
const listeners = new Map<string, Set<(locations: JourneyLocationDoc[]) => void>>();

function emit(activityId: string) {
  const locations = [...(rooms.get(activityId)?.values() ?? [])];
  listeners.get(activityId)?.forEach((listener) => listener(locations));
}

export const mockJourneyService: JourneyService = {
  async ensureJourneyMember() {
    // Mock mode has no remote membership gate.
  },

  subscribeActivityJourney(_actor, activity, cb) {
    const set = listeners.get(activity.id) ?? new Set<(locations: JourneyLocationDoc[]) => void>();
    set.add(cb);
    listeners.set(activity.id, set);
    cb([...(rooms.get(activity.id)?.values() ?? [])]);

    return () => {
      set.delete(cb);
      if (set.size === 0) listeners.delete(activity.id);
    };
  },

  async startJourney(actor, activity, location) {
    const room = rooms.get(activity.id) ?? new Map<string, JourneyLocationDoc>();
    room.set(actor.uid, { ...location, uid: actor.uid });
    rooms.set(activity.id, room);
    emit(activity.id);
  },

  async updateJourney(actor, activityId, location) {
    const room = rooms.get(activityId);
    if (!room?.has(actor.uid)) return;
    room.set(actor.uid, { ...location, uid: actor.uid });
    emit(activityId);
  },

  async setJourneyLiveStatus() {
    // Mock mode derives its count directly from the local room state.
  },

  async stopJourney(actor, activityId) {
    rooms.get(activityId)?.delete(actor.uid);
    emit(activityId);
  },
};
