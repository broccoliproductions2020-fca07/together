import type { ActivityDoc, ActivityDocUpdate, ActivityService } from './activityService.types';

import { isActivityLive } from '../utils/activityLifecycle';

/**
 * In-memory implementation of {@link ActivityService}. Holds only activities
 * created in this run — the demo seeds (mockMapMarkers/mockPlans) stay static
 * in the ActivityEntityProvider and are merged there, identical to firebase mode.
 */

const docs = new Map<string, ActivityDoc>();
const subs = new Map<(docs: ActivityDoc[]) => void, { uid: string }>();
const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVITY_CHAT_RETENTION_MS = 12 * 60 * 60 * 1000;
const ACTIVITY_RETENTION_MS = 30 * DAY_MS;

function visibleDocs(uid: string) {
  const now = Date.now();
  return [...docs.values()]
    .filter(
      (doc) =>
        doc.audienceUids.includes(uid) &&
        doc.status === 'active' &&
        (doc.visibleUntil ?? activityVisibleUntilFor(doc, doc.createdAt)) > now,
    )
    .sort((a, b) => b.createdAt - a.createdAt);
}

function expireAtFor(doc: Pick<ActivityDoc, 'startsAt' | 'endsAt'>, fallback = Date.now()) {
  const endMs = doc.endsAt ? Date.parse(doc.endsAt) : NaN;
  return Number.isFinite(endMs)
    ? endMs + ACTIVITY_CHAT_RETENTION_MS
    : fallback + ACTIVITY_RETENTION_MS;
}

function activityVisibleUntilFor(
  doc: Pick<ActivityDoc, 'startsAt' | 'endsAt'>,
  fallback = Date.now(),
) {
  const endMs = doc.endsAt ? Date.parse(doc.endsAt) : NaN;
  if (Number.isFinite(endMs)) return endMs;
  const startMs = doc.startsAt ? Date.parse(doc.startsAt) : NaN;
  return Number.isFinite(startMs) ? startMs : fallback + ACTIVITY_RETENTION_MS;
}

function emit() {
  subs.forEach((actor, cb) => cb(visibleDocs(actor.uid)));
}

export const mockActivityService: ActivityService = {
  subscribeActivities(actor, cb) {
    subs.set(cb, actor);
    cb(visibleDocs(actor.uid));
    return () => subs.delete(cb);
  },

  createActivity(actor, doc, preferredId) {
    const id = preferredId ?? `activity-${Date.now()}`;
    const { audienceContext: _audienceContext, ...activity } = doc;
    docs.set(id, {
      ...activity,
      id,
      hostId: actor.uid,
      status: 'active',
      createdAt: Date.now(),
      visibleUntil: activityVisibleUntilFor(activity),
      expireAt: expireAtFor(activity),
    });
    emit();
    return { id, ready: Promise.resolve() };
  },

  updateActivity(actor, id, update: ActivityDocUpdate) {
    const existing = docs.get(id);
    if (!existing || existing.hostId !== actor.uid || !isActivityLive(existing)) return;
    // undefined = leave unchanged (mirrors Firestore updateDoc semantics);
    // maxParticipants null = remove the limit entirely.
    const cleaned = Object.fromEntries(
      Object.entries(update).filter(([, value]) => value !== undefined),
    );
    const next = { ...existing, ...cleaned } as ActivityDoc;
    if (update.maxParticipants === null) delete next.maxParticipants;
    if (update.category === null) delete next.category;
    const startsAtMs = next.startsAt ? Date.parse(next.startsAt) : NaN;
    const endsAtMs = next.endsAt ? Date.parse(next.endsAt) : NaN;
    if (
      (Number.isFinite(startsAtMs) && Number.isFinite(endsAtMs) && endsAtMs <= startsAtMs) ||
      (Number.isFinite(endsAtMs) && endsAtMs <= Date.now()) ||
      (next.maxParticipants != null && next.maxParticipants < next.participants.length)
    ) {
      return;
    }
    next.expireAt = expireAtFor(next, existing.createdAt);
    next.visibleUntil = activityVisibleUntilFor(next, existing.createdAt);
    docs.set(id, next);
    emit();
  },

  cancelActivity(actor, id) {
    const existing = docs.get(id);
    if (!existing || existing.hostId !== actor.uid || !isActivityLive(existing)) return;
    docs.set(id, {
      ...existing,
      status: 'cancelled',
      visibleUntil: Date.now(),
      expireAt: Date.now() + ACTIVITY_CHAT_RETENTION_MS,
    });
    emit();
  },

  async joinActivity(actor, id) {
    const existing = docs.get(id);
    // Demo seeds have no backing doc — the optimistic local join covers display.
    if (!existing) return true;
    if (!isActivityLive(existing) || !existing.audienceUids.includes(actor.uid)) {
      return false;
    }
    if (existing.participants.some((p) => p.uid === actor.uid)) return true;
    if (
      existing.maxParticipants != null &&
      existing.participants.length >= existing.maxParticipants
    ) {
      return false;
    }
    docs.set(id, {
      ...existing,
      participants: [
        ...existing.participants,
        { uid: actor.uid, displayName: actor.displayName, initials: actor.initials },
      ],
      participantUids: [...existing.participantUids, actor.uid],
    });
    emit();
    return true;
  },

  async leaveActivity(actor, id) {
    const existing = docs.get(id);
    if (!existing) return true;
    if (existing.hostId === actor.uid) return false;
    if (!existing.participantUids.includes(actor.uid)) return true;
    docs.set(id, {
      ...existing,
      participantUids: existing.participantUids.filter((uid) => uid !== actor.uid),
      participants: existing.participants.filter((participant) => participant.uid !== actor.uid),
    });
    emit();
    return true;
  },
};
