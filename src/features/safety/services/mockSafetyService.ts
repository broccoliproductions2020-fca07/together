import { COMPANION_CONFIRMATION_MS, type SafetySession } from '../types';
import type { SafetyService, Unsubscribe } from './safetyService.types';

/** Offline implementation: my session in memory + one seeded friend session so
 * the companion UI is demo-able without a second device. Testing decision
 * (Juli 2026): Mia's demo walk is ALWAYS active in mock, so both the pure
 * watch mode (Fall 3) and the split mode (Fall 2, with an own session) are
 * testable offline at any time. The earlier hijack concern is solved
 * structurally — the shield routes to the watch mode and remains the sole own
 * start path, so a permanent walk blocks nothing.
 * Consequence: shield pulse (map) and status pill (calendar/socialize) are
 * permanently visible in mock. Firebase mode is unaffected. */

const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;
const EXTENSION_MS = 60 * 60 * 1000;
const EXTENSION_WINDOW_MS = 15 * 60 * 1000;
const BLUE_RETENTION_MS = 3 * 60 * 1000;
const ALERT_RETENTION_MS = 30 * 60 * 1000;

let mySession: SafetySession | null = null;
let myExpiryTimer: ReturnType<typeof setTimeout> | null = null;
const mySubs = new Set<(session: SafetySession | null) => void>();
const friendSubs = new Map<(sessions: SafetySession[]) => void, string>();

function demoFriendSession(): SafetySession {
  const now = Date.now();
  return {
    uid: 'u_mia',
    displayName: 'Mia Sommer',
    initials: 'MS',
    status: 'blue',
    startedAt: now - 6 * 60 * 1000,
    updatedAt: now - 20 * 1000,
    expiresAt: now + DEFAULT_DURATION_MS,
    retainUntil: now + DEFAULT_DURATION_MS + BLUE_RETENTION_MS,
    location: { lat: 52.522, lng: 13.404, at: now - 20 * 1000 },
    audienceUids: ['u_you'],
    companions: {},
  };
}

let friendSession = demoFriendSession();
let confirmationTimer: ReturnType<typeof setTimeout> | null = null;
let alertConfirmationTimer: ReturnType<typeof setTimeout> | null = null;
let friendTicker: ReturnType<typeof setInterval> | null = null;

function emitMine() {
  mySubs.forEach((cb) => cb(mySession ? { ...mySession } : null));
}

function retentionFor(status: SafetySession['status']) {
  return status === 'blue' ? BLUE_RETENTION_MS : ALERT_RETENTION_MS;
}

function scheduleMyExpiry() {
  if (myExpiryTimer) clearTimeout(myExpiryTimer);
  if (!mySession) return;
  myExpiryTimer = setTimeout(
    () => {
      mySession = null;
      myExpiryTimer = null;
      emitMine();
    },
    Math.max(0, mySession.expiresAt - Date.now()),
  );
}

function friendSnapshot(viewerUid?: string): SafetySession[] {
  // Refresh Mia's timestamps on every snapshot so she stays honest-blue
  // instead of aging into a fake data gap; confirmations survive the refresh.
  // The demo walk is visible to whichever mock user is currently viewing it,
  // including the persisted guest account (u_demo).
  const audienceUids = new Set(friendSession.audienceUids);
  if (viewerUid) audienceUids.add(viewerUid);
  friendSession = {
    ...demoFriendSession(),
    audienceUids: [...audienceUids],
    companions: friendSession.companions,
  };
  return [{ ...friendSession, companions: { ...friendSession.companions } }];
}

function emitFriends() {
  friendSubs.forEach((viewerUid, cb) => cb(friendSnapshot(viewerUid)));
}

export const mockSafetyService: SafetyService = {
  async startSession(actor, audienceUids) {
    if (confirmationTimer) clearTimeout(confirmationTimer);
    if (alertConfirmationTimer) clearTimeout(alertConfirmationTimer);
    const now = Date.now();
    mySession = {
      uid: actor.uid,
      displayName: actor.displayName,
      initials: actor.initials,
      status: 'blue',
      startedAt: now,
      updatedAt: now,
      expiresAt: now + DEFAULT_DURATION_MS,
      retainUntil: now + DEFAULT_DURATION_MS + BLUE_RETENTION_MS,
      audienceUids: [...audienceUids],
      companions: {},
    };
    scheduleMyExpiry();
    emitMine();

    // The real acknowledgement arrives from another device. Mock mode mirrors
    // one response so the owner's confirmed state remains demo-able offline.
    const firstRecipient = audienceUids.find((uid) => uid !== actor.uid);
    if (firstRecipient) {
      confirmationTimer = setTimeout(() => {
        confirmationTimer = null;
        if (!mySession || !mySession.audienceUids.includes(firstRecipient)) return;
        mySession = {
          ...mySession,
          companions: {
            ...mySession.companions,
            [firstRecipient]: { confirmedAt: Date.now() },
          },
          updatedAt: Date.now(),
        };
        emitMine();
      }, 1_200);
    }
    return mySession.expiresAt;
  },

  async updateAudience(_actor, addUids, removeUids) {
    if (!mySession || mySession.expiresAt <= Date.now()) {
      throw new Error('Dein Heimweg ist nicht mehr aktiv.');
    }
    const nextAudience = new Set(mySession.audienceUids);
    removeUids.forEach((uid) => nextAudience.delete(uid));
    addUids.forEach((uid) => nextAudience.add(uid));
    if (!nextAudience.size) {
      throw new Error('Mindestens eine Person muss deinen Heimweg weiterhin sehen.');
    }
    if (nextAudience.size > 25) {
      throw new Error('Du kannst deinen Heimweg mit höchstens 25 Personen teilen.');
    }

    const companions = { ...mySession.companions };
    removeUids.forEach((uid) => delete companions[uid]);
    mySession = {
      ...mySession,
      audienceUids: [...nextAudience],
      companions,
    };
    emitMine();

    // Mirror one response for newly added people so both the normal and the
    // current-alert owner states remain testable without a second device.
    const firstAdded = addUids.find((uid) => nextAudience.has(uid));
    if (firstAdded) {
      if (confirmationTimer) clearTimeout(confirmationTimer);
      confirmationTimer = setTimeout(() => {
        confirmationTimer = null;
        if (!mySession || !mySession.audienceUids.includes(firstAdded)) return;
        const now = Date.now();
        const currentAlert = mySession.alert;
        mySession = {
          ...mySession,
          companions: {
            ...mySession.companions,
            [firstAdded]: currentAlert
              ? {
                  confirmedAt: now,
                  alertAt: currentAlert.at,
                  alertAcknowledgedAt: now,
                }
              : { confirmedAt: now },
          },
        };
        emitMine();
      }, 1_200);
    }
    return [...nextAudience];
  },

  async extendSession() {
    const now = Date.now();
    if (!mySession || mySession.expiresAt <= now) {
      throw new Error('Dein Heimweg ist nicht mehr aktiv.');
    }
    if (mySession.expiresAt - now > EXTENSION_WINDOW_MS) {
      throw new Error('Du kannst deinen Heimweg in den letzten 15 Minuten verlängern.');
    }
    const expiresAt = mySession.expiresAt + EXTENSION_MS;
    mySession = {
      ...mySession,
      expiresAt,
      retainUntil: expiresAt + retentionFor(mySession.status),
      updatedAt: Date.now(),
    };
    scheduleMyExpiry();
    emitMine();
    return expiresAt;
  },

  async updateSession(_actor, patch) {
    if (!mySession) return;
    mySession = {
      ...mySession,
      ...(patch.location ? { location: patch.location } : {}),
      ...(patch.checkIn === null
        ? { checkIn: undefined }
        : patch.checkIn
          ? { checkIn: patch.checkIn }
          : {}),
      updatedAt: Date.now(),
    };
    emitMine();
  },

  async setStatus(_actor, status) {
    if (!mySession || mySession.status === status) return;
    const now = Date.now();
    const alert = status === 'orange' || status === 'red' ? { at: now, status } : undefined;
    mySession = {
      ...mySession,
      status,
      alert,
      retainUntil: mySession.expiresAt + retentionFor(status),
      checkIn: status === 'orange' ? { requestedAt: now, dueAt: now + 90_000 } : undefined,
      updatedAt: now,
    };
    emitMine();

    if (alertConfirmationTimer) {
      clearTimeout(alertConfirmationTimer);
      alertConfirmationTimer = null;
    }
    const firstRecipient = mySession.audienceUids[0];
    if (alert && firstRecipient) {
      alertConfirmationTimer = setTimeout(() => {
        alertConfirmationTimer = null;
        if (!mySession || mySession.alert?.at !== alert.at) return;
        mySession = {
          ...mySession,
          companions: {
            ...mySession.companions,
            [firstRecipient]: {
              confirmedAt: Date.now(),
              alertAt: alert.at,
              alertAcknowledgedAt: Date.now(),
            },
          },
          updatedAt: Date.now(),
        };
        emitMine();
      }, 1_200);
    }
  },

  async endSession() {
    if (confirmationTimer) {
      clearTimeout(confirmationTimer);
      confirmationTimer = null;
    }
    if (alertConfirmationTimer) {
      clearTimeout(alertConfirmationTimer);
      alertConfirmationTimer = null;
    }
    if (myExpiryTimer) {
      clearTimeout(myExpiryTimer);
      myExpiryTimer = null;
    }
    mySession = null;
    emitMine();
  },

  async confirmReachable(actor, ownerUid) {
    if (ownerUid !== friendSession.uid || !friendSession.audienceUids.includes(actor.uid)) {
      throw new Error('Dieser Heimweg ist nicht mehr verfügbar.');
    }
    friendSession = {
      ...friendSession,
      companions: {
        ...friendSession.companions,
        [actor.uid]: { confirmedAt: Date.now() },
      },
    };
    emitFriends();
    // Demo friend session only — nothing to persist in mock mode.
  },

  async withdrawReachability(actor, ownerUid) {
    if (ownerUid !== friendSession.uid || !friendSession.audienceUids.includes(actor.uid)) {
      throw new Error('Dieser Heimweg ist nicht mehr verfÃ¼gbar.');
    }
    const existing = friendSession.companions[actor.uid];
    if (!existing || existing.confirmedAt <= Date.now() - COMPANION_CONFIRMATION_MS) return;
    friendSession = {
      ...friendSession,
      companions: {
        ...friendSession.companions,
        [actor.uid]: {
          ...existing,
          unavailableAt: Math.max(Date.now(), existing.confirmedAt + 1),
        },
      },
    };
    emitFriends();
  },

  async confirmAlert(actor, ownerUid, alertAt) {
    if (
      ownerUid !== friendSession.uid ||
      !friendSession.audienceUids.includes(actor.uid) ||
      friendSession.alert?.at !== alertAt
    ) {
      throw new Error('Dieser Hinweis ist nicht mehr aktuell.');
    }
    friendSession = {
      ...friendSession,
      companions: {
        ...friendSession.companions,
        [actor.uid]: {
          confirmedAt: Date.now(),
          alertAt,
          alertAcknowledgedAt: Date.now(),
        },
      },
    };
    emitFriends();
  },

  subscribeMySession(_actor, cb): Unsubscribe {
    mySubs.add(cb);
    cb(mySession ? { ...mySession } : null);
    return () => mySubs.delete(cb);
  },

  subscribeFriendSessions(actor, cb): Unsubscribe {
    friendSubs.set(cb, actor.uid);
    cb(friendSnapshot(actor.uid));
    // Simulated live updates: re-emit periodically so Mia's "Letztes Update"
    // stays fresh and derived signals remain honest during long test runs.
    if (!friendTicker) friendTicker = setInterval(() => emitFriends(), 25_000);
    return () => {
      friendSubs.delete(cb);
      if (!friendSubs.size && friendTicker) {
        clearInterval(friendTicker);
        friendTicker = null;
      }
    };
  },
};
