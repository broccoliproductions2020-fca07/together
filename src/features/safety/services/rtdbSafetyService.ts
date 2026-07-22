import { onValue, ref, remove, update } from '@react-native-firebase/database';
import { httpsCallable } from '@react-native-firebase/functions';

import { getFirebaseFunctions, getFirebaseRealtimeDb } from '@/shared/services/firebase';

import type { SafetySession, SafetyStatus } from '../types';
import type { SafetyService, Unsubscribe } from './safetyService.types';

/**
 * RTDB implementation (docs/safety-mode.md → V1-Implementierungsnotizen).
 * `heimwege/{uid}` = the session (ONE per person, last-point-only), plus the
 * fan-out index `heimwegeIndex/{companionUid}/{ownerUid}` so companions listen
 * to their own index instead of one listener per friend.
 *
 * Deliberately NO onDisconnect cleanup: if the app dies, `updatedAt` goes
 * stale — which IS the honest "Akku oder Empfang?" signal. Sessions end only
 * explicitly ("Sicher angekommen") or at the active sharing deadline.
 * A timed-out last point can remain read-only for a short retention window.
 */

function sessionPath(uid: string) {
  return `heimwege/${uid}`;
}

function mapSession(
  uid: string,
  value: Record<string, unknown> | null,
  includeTimedOut = false,
): SafetySession | null {
  if (!value) return null;
  const expiresAt = typeof value.expiresAt === 'number' ? value.expiresAt : 0;
  const retainUntil = typeof value.retainUntil === 'number' ? value.retainUntil : expiresAt;
  const now = Date.now();
  if (retainUntil <= now || (!includeTimedOut && expiresAt <= now)) return null;
  const audience = value.audienceUids as Record<string, boolean> | undefined;
  const location = value.location as SafetySession['location'] | undefined;
  const checkIn = value.checkIn as SafetySession['checkIn'] | undefined;
  const alert = value.alert as SafetySession['alert'] | undefined;
  return {
    uid,
    displayName: typeof value.displayName === 'string' ? value.displayName : 'Freund:in',
    initials: typeof value.initials === 'string' ? value.initials : '??',
    status: (value.status as SafetyStatus) ?? 'blue',
    startedAt: typeof value.startedAt === 'number' ? value.startedAt : Date.now(),
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : Date.now(),
    expiresAt,
    retainUntil,
    ...(expiresAt <= now ? { timedOut: true } : {}),
    ...(location ? { location } : {}),
    audienceUids: audience ? Object.keys(audience) : [],
    ...(checkIn ? { checkIn } : {}),
    ...(alert ? { alert } : {}),
    companions: (value.companions as SafetySession['companions']) ?? {},
  };
}

export const rtdbSafetyService: SafetyService = {
  async startSession(actor, audienceUids) {
    const result = await httpsCallable<{ audienceUids: string[] }, { ok: true; expiresAt: number }>(
      getFirebaseFunctions(),
      'startSafetySession',
    )({ audienceUids });
    return result.data.expiresAt;
  },

  async updateAudience(_actor, addUids, removeUids) {
    const result = await httpsCallable<
      { addUids: string[]; removeUids: string[] },
      { ok: true; audienceUids: string[] }
    >(
      getFirebaseFunctions(),
      'updateSafetyAudience',
    )({ addUids, removeUids });
    return result.data.audienceUids;
  },

  async extendSession() {
    const result = await httpsCallable<Record<string, never>, { ok: true; expiresAt: number }>(
      getFirebaseFunctions(),
      'extendSafetySession',
    )({});
    return result.data.expiresAt;
  },

  async updateSession(actor, patch) {
    const writes: Record<string, unknown> = {};
    // A check-in answer is not a location heartbeat. Keeping its server-owned
    // timestamp intact lets RTDB Rules rate-limit only actual live updates.
    if (patch.checkIn === undefined) writes[`${sessionPath(actor.uid)}/updatedAt`] = Date.now();
    if (patch.location) writes[`${sessionPath(actor.uid)}/location`] = patch.location;
    if (patch.checkIn !== undefined) {
      writes[`${sessionPath(actor.uid)}/checkIn`] = patch.checkIn;
    }
    await update(ref(getFirebaseRealtimeDb()), writes);
  },

  async setStatus(_actor, status) {
    await httpsCallable<{ status: SafetyStatus }, { ok: true }>(
      getFirebaseFunctions(),
      'setSafetyStatus',
    )({ status });
  },

  async endSession(actor) {
    // Explicit owner delete is authorized narrowly by RTDB Rules. Companions
    // lose access immediately; a server trigger removes the fan-out index.
    // This avoids a callable cold start on the latency-sensitive end action.
    await remove(ref(getFirebaseRealtimeDb(), sessionPath(actor.uid)));
  },

  async confirmReachable(_actor, ownerUid) {
    await httpsCallable<{ ownerUid: string }, { ok: true }>(
      getFirebaseFunctions(),
      'confirmSafetyCompanion',
    )({ ownerUid });
  },

  async withdrawReachability(_actor, ownerUid) {
    await httpsCallable<{ ownerUid: string }, { ok: true }>(
      getFirebaseFunctions(),
      'withdrawSafetyCompanion',
    )({ ownerUid });
  },

  async confirmAlert(_actor, ownerUid, alertAt) {
    await httpsCallable<{ ownerUid: string; alertAt: number }, { ok: true }>(
      getFirebaseFunctions(),
      'confirmSafetyAlert',
    )({ ownerUid, alertAt });
  },

  subscribeMySession(actor, cb): Unsubscribe {
    let expiryTimer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = onValue(
      ref(getFirebaseRealtimeDb(), sessionPath(actor.uid)),
      (snapshot) => {
        if (expiryTimer) clearTimeout(expiryTimer);
        const session = mapSession(actor.uid, snapshot.val());
        cb(session);
        if (session) {
          expiryTimer = setTimeout(() => cb(null), Math.max(0, session.expiresAt - Date.now()));
        }
      },
      () => cb(null),
    );
    return () => {
      if (expiryTimer) clearTimeout(expiryTimer);
      unsubscribe();
    };
  },

  subscribeFriendSessions(actor, cb): Unsubscribe {
    // Index listener + one dynamic listener per ACTIVE session (few at a time,
    // never one per friend).
    const sessionUnsubs = new Map<string, Unsubscribe>();
    const expiryTimers = new Map<string, ReturnType<typeof setTimeout>>();
    const sessions = new Map<string, SafetySession>();

    const emit = () => cb([...sessions.values()].sort((a, b) => b.startedAt - a.startedAt));

    const indexUnsub = onValue(
      ref(getFirebaseRealtimeDb(), `heimwegeIndex/${actor.uid}`),
      (snapshot) => {
        const owners = new Set(Object.keys((snapshot.val() as Record<string, boolean>) ?? {}));
        // Detach sessions that ended.
        [...sessionUnsubs.keys()].forEach((ownerUid) => {
          if (!owners.has(ownerUid)) {
            sessionUnsubs.get(ownerUid)?.();
            sessionUnsubs.delete(ownerUid);
            const expiryTimer = expiryTimers.get(ownerUid);
            if (expiryTimer) clearTimeout(expiryTimer);
            expiryTimers.delete(ownerUid);
            sessions.delete(ownerUid);
          }
        });
        // Attach new ones.
        owners.forEach((ownerUid) => {
          if (sessionUnsubs.has(ownerUid)) return;
          sessionUnsubs.set(
            ownerUid,
            onValue(
              ref(getFirebaseRealtimeDb(), sessionPath(ownerUid)),
              (sessionSnapshot) => {
                const session = mapSession(ownerUid, sessionSnapshot.val(), true);
                const previousTimer = expiryTimers.get(ownerUid);
                if (previousTimer) clearTimeout(previousTimer);
                if (session) {
                  sessions.set(ownerUid, session);
                  const removeAfterRetention = () => {
                    expiryTimers.set(
                      ownerUid,
                      setTimeout(
                        () => {
                          sessions.delete(ownerUid);
                          expiryTimers.delete(ownerUid);
                          emit();
                        },
                        Math.max(0, session.retainUntil - Date.now()),
                      ),
                    );
                  };
                  if (session.timedOut) {
                    removeAfterRetention();
                  } else {
                    expiryTimers.set(
                      ownerUid,
                      setTimeout(
                        () => {
                          sessions.set(ownerUid, { ...session, timedOut: true });
                          emit();
                          removeAfterRetention();
                        },
                        Math.max(0, session.expiresAt - Date.now()),
                      ),
                    );
                  }
                } else {
                  sessions.delete(ownerUid);
                  expiryTimers.delete(ownerUid);
                }
                emit();
              },
              () => {
                sessions.delete(ownerUid);
                emit();
              },
            ),
          );
        });
        emit();
      },
      () => cb([]),
    );

    return () => {
      indexUnsub();
      sessionUnsubs.forEach((unsub) => unsub());
      sessionUnsubs.clear();
      expiryTimers.forEach((timer) => clearTimeout(timer));
      expiryTimers.clear();
    };
  },
};
