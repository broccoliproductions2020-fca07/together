const { initializeApp } = require('firebase-admin/app');
const { getAuth: getAdminAuth } = require('firebase-admin/auth');
const { getDatabase } = require('firebase-admin/database');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onValueDeleted } = require('firebase-functions/v2/database');
const { onSchedule } = require('firebase-functions/v2/scheduler');

// Firebase CLI gives demo projects the legacy `demo-together` RTDB namespace,
// while the app intentionally uses `demo-together-default-rtdb`. Pin the local
// Admin SDK to the same namespace; real projects keep Firebase's injected URL
// unless FIREBASE_DATABASE_URL explicitly overrides it.
const databaseURL =
  process.env.FIREBASE_DATABASE_URL ??
  (process.env.GCLOUD_PROJECT === 'demo-together'
    ? 'https://demo-together-default-rtdb.firebaseio.com'
    : undefined);
initializeApp(databaseURL ? { databaseURL } : undefined);

const DAY_MS = 24 * 60 * 60 * 1000;
const GROUP_RETENTION_MS = 30 * DAY_MS;
const JOURNEY_BUFFER_MS = 30 * 60 * 1000;
const JOURNEY_HARD_MAX_MS = 2 * 60 * 60 * 1000;
const JOURNEY_REMINDER_LEAD_MS = 60 * 60 * 1000;
const JOURNEY_REMINDER_LOOKBACK_MS = 10 * 60 * 1000;
const SAFETY_DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;
const SAFETY_EXTENSION_MS = 60 * 60 * 1000;
const SAFETY_EXTENSION_WINDOW_MS = 15 * 60 * 1000;
const SAFETY_MAX_TOTAL_MS = 12 * 60 * 60 * 1000;
const SAFETY_BLUE_RETENTION_MS = 3 * 60 * 1000;
const SAFETY_ALERT_RETENTION_MS = 30 * 60 * 1000;
const SAFETY_CONFIRMATION_MS = 30 * 60 * 1000;
const SAFETY_MAX_COMPANIONS = 25;
const SAFETY_CHECKIN_DELAY_MS = 90 * 1000;
const ENFORCE_APP_CHECK = process.env.FUNCTIONS_ENFORCE_APP_CHECK === 'true';
// Production-only release gate, same shape as ENFORCE_APP_CHECK. Off for the
// local Emulator Suite: anonymous dev/test accounts have no email at all and
// would otherwise be locked out of every gated action. Guest sign-in itself
// stays blocked against real cloud Firebase (see firebaseAuthService.ts), so
// in a real deployment every caller has gone through email/password sign-up.
const ENFORCE_EMAIL_VERIFICATION = process.env.FUNCTIONS_ENFORCE_EMAIL_VERIFICATION === 'true';
// Shared callable options: the App Check gate plus a conservative instance
// ceiling, so a traffic spike or scripted abuse burst is throttled
// (RESOURCE_EXHAUSTED) instead of scaling billing unbounded. Tune per-function
// once real load data exists.
const CALLABLE_OPTS = { enforceAppCheck: ENFORCE_APP_CHECK, maxInstances: 20 };
// Places is the only callable that performs a paid external request. Keep its
// concurrency deliberately below the general callable ceiling as a second
// cost-control boundary behind the per-account rate limit.
const PLACES_CALLABLE_OPTS = { ...CALLABLE_OPTS, maxInstances: 5 };
const CHAT_RATE_WINDOW_MS = 60 * 1000;
const CHAT_MESSAGES_PER_WINDOW = 30;
// A chat room is also a single Firestore summary document. Keeping the room
// below this burst rate prevents a large group from turning that document into
// a hot, costly fan-out point. Per-user limits still apply independently.
const CHAT_ROOM_MESSAGES_PER_WINDOW = 60;
const ACTIVITY_RETENTION_MS = 30 * DAY_MS;
const NOTIFICATION_RETENTION_MS = 30 * DAY_MS;
const INVITE_RETENTION_MS = 30 * DAY_MS;
const HOUR_MS = 60 * 60 * 1000;
const OPEN_MAX_DURATION_MS = 12 * HOUR_MS;
// Kept in the backend for a later launch, but deliberately unavailable now.
const SOCIALIZE_ENABLED = false;
// Activity chats intentionally remain available only briefly after an event.
// Groups are different: their expiry is refreshed after every message.
const ACTIVITY_CHAT_RETENTION_MS = 12 * HOUR_MS;
const ACTIVITY_CATEGORIES = new Set([
  'essen',
  'drinks',
  'kaffee',
  'sport',
  'outdoor',
  'feiern',
  'kultur',
  'spiele',
  'lernen',
  'chillen',
  'shopping',
  'sonstiges',
]);

function safetyRetentionMs(status) {
  return status === 'blue' ? SAFETY_BLUE_RETENTION_MS : SAFETY_ALERT_RETENTION_MS;
}

function requireAuth(request) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Anmeldung erforderlich.');
  }
  return request.auth.uid;
}

/**
 * Like requireAuth, but additionally requires a verified email once
 * ENFORCE_EMAIL_VERIFICATION is on. Deliberately NOT used for: reads (no
 * state change); claimUsername (runs during sign-up itself, before any
 * verification link could have been clicked); blockUser/unblockUser/
 * reportUser (a person must always be able to protect themselves);
 * deleteMyAccount (a person must always be able to leave); and the entire
 * Safety/Heimweg domain (a safety escalation must never gain friction — see
 * docs/safety-mode.md).
 */
function requireVerifiedAuth(request) {
  const uid = requireAuth(request);
  if (ENFORCE_EMAIL_VERIFICATION && request.auth.token.email_verified !== true) {
    throw new HttpsError('failed-precondition', 'Bitte bestätige zuerst deine E-Mail-Adresse.');
  }
  return uid;
}

function pushOutboxItem(item) {
  return {
    recipientUid: item.recipientUid,
    actorUid: item.actorUid,
    kind: item.kind,
    title: item.title.slice(0, 100),
    body: item.body.slice(0, 500),
    ...(item.activityId ? { activityId: item.activityId } : {}),
    ...(item.roomId ? { roomId: item.roomId } : {}),
    ...(Number.isSafeInteger(item.messageCount) ? { messageCount: item.messageCount } : {}),
    ...(item.safetyOwnerUid ? { safetyOwnerUid: item.safetyOwnerUid } : {}),
    ...(Number.isFinite(item.safetyAlertAt) ? { safetyAlertAt: item.safetyAlertAt } : {}),
    ...(item.journey ? { journey: item.journey } : {}),
  };
}

async function createNotifications(items, { queuePush = false } = {}) {
  const validItems = items.filter(
    (item) => item.recipientUid && item.recipientUid !== item.actorUid,
  );
  if (!validItems.length) return;
  const db = getFirestore();
  const expireAt = Timestamp.fromMillis(Date.now() + NOTIFICATION_RETENTION_MS);
  // Firestore batches have a hard write limit. The previous `slice(0, 100)`
  // silently dropped recipients after that limit; split deterministically so
  // every authorized recipient gets the same notification.
  for (let index = 0; index < validItems.length; index += 100) {
    const chunk = validItems.slice(index, index + 100);
    const batch = db.batch();
    chunk.forEach((item) => {
      const notificationRef = db.collection('notifications').doc();
      batch.set(notificationRef, {
        recipientUid: item.recipientUid,
        kind: item.kind,
        title: item.title.slice(0, 100),
        body: item.body.slice(0, 500),
        ...(item.activityId ? { activityId: item.activityId } : {}),
        ...(item.roomId ? { roomId: item.roomId } : {}),
        ...(item.safetyOwnerUid ? { safetyOwnerUid: item.safetyOwnerUid } : {}),
        ...(Number.isFinite(item.safetyAlertAt) ? { safetyAlertAt: item.safetyAlertAt } : {}),
        createdAt: Timestamp.now(),
        expireAt,
      });
    });
    if (queuePush) {
      // Durable outbox: the callable only waits for this Firestore commit, not
      // recipient profile reads or the external Expo API. The trigger below
      // owns delivery and retry, so Safety notifications are not fire-and-forget.
      batch.set(db.collection('pushOutbox').doc(), {
        items: chunk.map(pushOutboxItem),
        createdAt: Timestamp.now(),
        expireAt,
      });
    }
    await batch.commit();
    if (!queuePush) {
      void deliverPush(chunk).catch((error) => console.error('[push] delivery failed', error));
    }
  }
}

/**
 * The notification action is processed without opening the activity screen on
 * Android. It therefore carries only the already-authorized Activity context
 * required to arm local movement detection; no participant/profile data is
 * included and no position is sent back at this point.
 */
function journeyNotificationPayload(activityId, activity) {
  const target = activity?.place;
  if (
    !target ||
    typeof target.latitude !== 'number' ||
    typeof target.longitude !== 'number' ||
    typeof activity?.title !== 'string'
  ) {
    return null;
  }
  return {
    activityId,
    title: activity.title.slice(0, 100),
    ...(typeof activity.startsAt === 'string' ? { startsAt: activity.startsAt } : {}),
    ...(typeof activity.endsAt === 'string' ? { endsAt: activity.endsAt } : {}),
    target: { latitude: target.latitude, longitude: target.longitude },
  };
}

async function enforceRateLimit(uid, key, max, windowMs) {
  const db = getFirestore();
  const ref = db.doc(`rateLimits/${uid}_${key}`);
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.exists ? snapshot.data() : {};
    const count = data.windowStart === windowStart ? (data.count ?? 0) : 0;
    if (count >= max) {
      throw new HttpsError('resource-exhausted', 'Zu viele Anfragen. Bitte kurz warten.');
    }
    transaction.set(
      ref,
      {
        windowStart,
        count: count + 1,
        expireAt: Timestamp.fromMillis(windowStart + windowMs),
      },
      { merge: true },
    );
  });
}

async function deliverPush(items) {
  const recipients = [...new Set(items.map((item) => item.recipientUid))].slice(0, 100);
  const snapshots = await Promise.all(
    recipients.map((uid) => getFirestore().doc(`users/${uid}`).get()),
  );
  const messages = [];
  snapshots.forEach((snapshot) => {
    const tokens = snapshot.data()?.pushTokens ?? [];
    const item = items.find((candidate) => candidate.recipientUid === snapshot.id);
    (Array.isArray(tokens) ? tokens : []).forEach((token) => {
      if (typeof token === 'string' && item) {
        messages.push({
          to: token,
          sound: 'default',
          title: item.title,
          body: item.body,
          data: {
            activityId: item.activityId,
            roomId: item.roomId,
            messageCount: item.messageCount,
            kind: item.kind,
            safetyOwnerUid: item.safetyOwnerUid,
            safetyAlertAt: item.safetyAlertAt,
            ...(item.journey ? { journey: item.journey } : {}),
          },
          ...(item.kind === 'journey_reminder'
            ? { categoryId: 'together.journey.reminder.v1' }
            : item.kind === 'safety_request'
              ? {
                  categoryId: 'together.safety.request.v1',
                  channelId: 'safety',
                  priority: 'high',
                }
              : item.kind === 'safety_unwell' || item.kind === 'safety_emergency'
                ? {
                    categoryId: 'together.safety.alert.v1',
                    channelId: 'safety-alerts',
                    priority: 'high',
                    interruptionLevel: 'time-sensitive',
                  }
                : {}),
        });
      }
    });
  });
  if (!messages.length) return;
  // Expo accepts at most 100 messages per request. A user may have several
  // registered devices, so truncating here would silently skip later devices
  // in an otherwise valid group notification.
  for (let index = 0; index < messages.length; index += 100) {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messages.slice(index, index + 100)),
    });
    if (!response.ok) throw new Error(`Expo Push returned ${response.status}`);
  }
}

/**
 * Reliable asynchronous push delivery for latency-sensitive Safety paths.
 * The Firestore event is retried until Expo accepts the batch; the outbox doc
 * is deleted only after success. External delivery is at-least-once by nature.
 */
exports.deliverPushOutbox = onDocumentCreated(
  { document: 'pushOutbox/{outboxId}', retry: true },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;
    const items = snapshot.data()?.items;
    if (!Array.isArray(items) || !items.length) {
      await snapshot.ref.delete();
      return;
    }
    // Delete BEFORE sending: `items` always comes from this immutable event
    // snapshot, so a retry re-sends regardless of ordering. Deleting first
    // makes the delete a harmless no-op on retry, so the only way a retry
    // re-sends is if the previous send itself never completed — not a
    // duplicate of an already-successful delivery. The reverse order (as
    // this used to be written) retried a *successful* send whenever only the
    // delete afterwards failed.
    await snapshot.ref.delete();
    await deliverPush(items);
  },
);

function activityExpiry(data) {
  const end = typeof data.endsAt === 'string' ? Date.parse(data.endsAt) : NaN;
  const expireAt = data.expireAt?.toMillis?.() ?? NaN;
  const candidates = [
    Number.isFinite(end) ? end + JOURNEY_BUFFER_MS : Date.now() + JOURNEY_HARD_MAX_MS,
    Number.isFinite(expireAt) ? expireAt : Infinity,
  ];
  return Math.min(...candidates);
}

function cleanString(value, maxLength, field, required = false) {
  if (value == null && !required) return undefined;
  if (typeof value !== 'string') {
    throw new HttpsError('invalid-argument', `${field} ist ungültig.`);
  }
  const result = value.trim();
  if ((required && result.length < 1) || result.length > maxLength) {
    throw new HttpsError('invalid-argument', `${field} ist ungültig.`);
  }
  return result;
}

function validActivityId(activityId) {
  return typeof activityId === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(activityId);
}

function validUid(uid) {
  return typeof uid === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(uid);
}

/** Stable, unique document id for exactly one pair of accounts. */
function friendshipId(firstUid, secondUid) {
  return [firstUid, secondUid].sort().join('__');
}

/**
 * The client caches relationship documents. This small server-owned revision
 * rides on the already-live `users/{uid}` document and invalidates that cache
 * for both people only when the friendship graph actually changes.
 */
function bumpFriendshipsVersion(transaction, entries) {
  entries.forEach(({ ref, snapshot }) => {
    if (!snapshot?.exists) return;
    transaction.update(ref, { friendshipsVersion: FieldValue.increment(1) });
  });
}

function profileSnapshot(uid, profile) {
  const displayName = cleanString(profile?.displayName ?? 'Together-Freund', 50, 'Name', true);
  const initials = cleanString(
    profile?.initials ?? displayName.slice(0, 2).toUpperCase(),
    8,
    'Initialen',
    true,
  );
  return {
    uid,
    displayName,
    initials,
    ...(typeof profile?.username === 'string' ? { username: profile.username } : {}),
    ...(typeof profile?.avatarUrl === 'string' ? { avatarUrl: profile.avatarUrl } : {}),
  };
}

/** The minimum identity needed to display a pending request or activity contact. */
function contactSnapshot(uid, profile) {
  const profileData = profileSnapshot(uid, profile);
  return {
    uid: profileData.uid,
    displayName: profileData.displayName,
    initials: profileData.initials,
  };
}

/** One bounded query. Pending requests are intentionally read too, so there is
 * no second listener/query just for invitations. */
async function directFriendUids(db, uid) {
  const snapshot = await db
    .collection('friendships')
    .where('participantUids', 'array-contains', uid)
    .limit(200)
    .get();
  const friends = new Set();
  snapshot.forEach((relationship) => {
    const data = relationship.data();
    if (data.status !== 'accepted') return;
    (data.participantUids ?? []).forEach((participantUid) => {
      if (participantUid !== uid && typeof participantUid === 'string') friends.add(participantUid);
    });
  });
  return friends;
}

/**
 * Activities are published into one social context, never a client-composed
 * recipient list. The function resolves the uid snapshot from trusted server
 * data so an altered client cannot quietly target individual friends.
 */
function parseAudienceContext(input) {
  if (!input || typeof input !== 'object') {
    throw new HttpsError('invalid-argument', 'Sichtbarkeitsraum fehlt.');
  }
  if (input.kind === 'all_friends' || input.kind === 'close_friends') {
    return { kind: input.kind };
  }
  if (
    input.kind === 'group' &&
    typeof input.groupId === 'string' &&
    /^[A-Za-z0-9_-]{1,100}$/.test(input.groupId)
  ) {
    return { kind: 'group', groupId: input.groupId };
  }
  throw new HttpsError('invalid-argument', 'Ungültiger Sichtbarkeitsraum.');
}

async function audienceForContext(db, uid, context, friends) {
  if (context.kind === 'all_friends') return [...friends];

  if (context.kind === 'close_friends') {
    const userSnapshot = await db.doc(`users/${uid}`).get();
    const closeFriendUids = Array.isArray(userSnapshot.data()?.closeFriendUids)
      ? userSnapshot.data().closeFriendUids
      : [];
    return closeFriendUids.filter((friendUid) => friends.has(friendUid));
  }

  const groupSnapshot = await db.doc(`users/${uid}/privateCircles/${context.groupId}`).get();
  if (!groupSnapshot.exists) throw new HttpsError('not-found', 'Gruppe nicht gefunden.');
  const memberUids = Array.isArray(groupSnapshot.data()?.friendUids)
    ? groupSnapshot.data().friendUids
    : [];
  return memberUids.filter((friendUid) => friends.has(friendUid));
}

exports.createActivity = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireVerifiedAuth(request);
  await enforceRateLimit(uid, 'activities', 20, HOUR_MS);
  const activityId = request.data?.activityId;
  if (!validActivityId(activityId)) {
    throw new HttpsError('invalid-argument', 'Ungültige Aktivitäts-ID.');
  }

  const input = request.data?.activity;
  if (!input || typeof input !== 'object') {
    throw new HttpsError('invalid-argument', 'Aktivitätsdaten fehlen.');
  }
  const audienceContext = parseAudienceContext(input.audienceContext);

  const mode = input.mode === 'open' ? 'soon' : input.mode;
  if (mode !== 'soon' && mode !== 'now') {
    throw new HttpsError('invalid-argument', 'Ungültiger Aktivitätsmodus.');
  }
  const title = cleanString(input.title, 60, 'Titel', true);
  const note = cleanString(input.note, 500, 'Beschreibung');
  const startsAt = cleanString(input.startsAt, 80, 'Startzeit');
  const endsAt = cleanString(input.endsAt, 80, 'Endzeit');
  if (startsAt && Number.isNaN(Date.parse(startsAt))) {
    throw new HttpsError('invalid-argument', 'Ungültige Startzeit.');
  }
  if (endsAt && Number.isNaN(Date.parse(endsAt))) {
    throw new HttpsError('invalid-argument', 'Ungültige Endzeit.');
  }
  if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) {
    throw new HttpsError('invalid-argument', 'Die Endzeit muss nach der Startzeit liegen.');
  }

  let maxParticipants;
  if (input.maxParticipants != null) {
    if (
      !Number.isInteger(input.maxParticipants) ||
      input.maxParticipants < 2 ||
      input.maxParticipants > 50
    ) {
      throw new HttpsError('invalid-argument', 'Ungültige Teilnehmergrenze.');
    }
    maxParticipants = input.maxParticipants;
  }

  let category;
  if (input.category != null) {
    if (typeof input.category !== 'string' || !ACTIVITY_CATEGORIES.has(input.category)) {
      throw new HttpsError('invalid-argument', 'Ungültige Kategorie.');
    }
    category = input.category;
  }

  let place;
  if (input.place != null) {
    if (typeof input.place !== 'object') {
      throw new HttpsError('invalid-argument', 'Ungültiger Ort.');
    }
    const label = cleanString(input.place.label, 200, 'Ort', true);
    const visibility = input.place.visibility;
    if (visibility !== 'pin' && visibility !== 'none') {
      throw new HttpsError('invalid-argument', 'Ungültige Ortsfreigabe.');
    }
    const latitude = input.place.latitude;
    const longitude = input.place.longitude;
    if (
      latitude != null &&
      (typeof latitude !== 'number' ||
        latitude < -90 ||
        latitude > 90 ||
        typeof longitude !== 'number' ||
        longitude < -180 ||
        longitude > 180)
    ) {
      throw new HttpsError('invalid-argument', 'Ungültige Koordinaten.');
    }
    place = {
      label,
      visibility,
      ...(latitude != null ? { latitude, longitude } : {}),
    };
  }

  const db = getFirestore();
  const [profileSnapshot, friends] = await Promise.all([
    db.doc(`publicProfiles/${uid}`).get(),
    directFriendUids(db, uid),
  ]);
  const profile = profileSnapshot.data() ?? {};
  const displayName = cleanString(profile.displayName ?? request.auth.token.name, 50, 'Name', true);
  const initials = cleanString(
    profile.initials ?? displayName.slice(0, 2).toUpperCase(),
    8,
    'Initialen',
    true,
  );

  const audienceUids = [
    uid,
    ...new Set(await audienceForContext(db, uid, audienceContext, friends)),
  ];
  const now = Date.now();
  const endMs = endsAt ? Date.parse(endsAt) : NaN;
  const startMs = startsAt ? Date.parse(startsAt) : NaN;
  // Map/calendar visibility stops exactly at the scheduled end. The Activity
  // document and its chat are intentionally retained for twelve more hours.
  const visibleUntil = Number.isFinite(endMs)
    ? endMs
    : Number.isFinite(startMs)
      ? startMs
      : now + ACTIVITY_RETENTION_MS;
  const expireAt = Number.isFinite(endMs)
    ? endMs + ACTIVITY_CHAT_RETENTION_MS
    : now + ACTIVITY_RETENTION_MS;
  if (visibleUntil <= now || expireAt <= now) {
    throw new HttpsError(
      'failed-precondition',
      'Die Aktivität liegt bereits in der Vergangenheit.',
    );
  }

  const activityRef = db.doc(`activities/${activityId}`);
  const roomRef = db.doc(`chats/${activityId}`);
  const chatExpireAt = Math.max(
    now + ACTIVITY_CHAT_RETENTION_MS,
    (Number.isFinite(endMs) ? endMs : Number.isFinite(startMs) ? startMs : now) +
      ACTIVITY_CHAT_RETENTION_MS,
  );
  // Activity membership and its host chat must appear together. A proposal can
  // intentionally promote an existing group room into its activity chat, so
  // this has to be a transaction rather than two unconditional creates.
  await db.runTransaction(async (transaction) => {
    const [activitySnapshot, roomSnapshot] = await Promise.all([
      transaction.get(activityRef),
      transaction.get(roomRef),
    ]);
    if (activitySnapshot.exists) {
      throw new HttpsError('already-exists', 'Diese Activity existiert bereits.');
    }

    transaction.create(activityRef, {
      hostId: uid,
      mode,
      title,
      ...(note ? { note } : {}),
      audienceUids,
      ...(startsAt ? { startsAt } : {}),
      ...(endsAt ? { endsAt } : {}),
      ...(place ? { place } : {}),
      ...(maxParticipants ? { maxParticipants } : {}),
      ...(category ? { category } : {}),
      participants: [{ uid, displayName, initials }],
      participantUids: [uid],
      status: 'active',
      createdAt: Timestamp.now(),
      visibleUntil: Timestamp.fromMillis(visibleUntil),
      expireAt: Timestamp.fromMillis(expireAt),
    });

    if (!roomSnapshot.exists) {
      transaction.create(roomRef, {
        type: 'activity',
        title,
        memberIds: [uid],
        messageCount: 0,
        readCount: {},
        createdAt: Timestamp.now(),
        expireAt: Timestamp.fromMillis(chatExpireAt),
      });
      return;
    }

    const room = roomSnapshot.data();
    if (room.type !== 'group') {
      throw new HttpsError('failed-precondition', 'Der Activity-Chat ist bereits belegt.');
    }
    transaction.update(roomRef, {
      type: 'activity',
      title,
      expireAt: Timestamp.fromMillis(chatExpireAt),
    });
  });

  return { ok: true, id: activityId };
});

/**
 * Host-only edit path. Time is deliberately server-owned here: the activity
 * live-feed boundary, activity-chat retention and a pending journey reminder
 * must move together with an edited schedule.
 */
exports.updateActivity = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireVerifiedAuth(request);
  const activityId = request.data?.activityId;
  if (!validActivityId(activityId)) {
    throw new HttpsError('invalid-argument', 'Ungültige Aktivitäts-ID.');
  }

  const input = request.data?.activity;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpsError('invalid-argument', 'Aktivitätsdaten fehlen.');
  }
  const allowedKeys = new Set([
    'mode',
    'title',
    'note',
    'startsAt',
    'endsAt',
    'place',
    'maxParticipants',
    'category',
  ]);
  const inputKeys = Object.keys(input);
  if (!inputKeys.length || inputKeys.some((key) => !allowedKeys.has(key))) {
    throw new HttpsError('invalid-argument', 'Ungültige Aktivitätsdaten.');
  }
  const has = (key) => Object.prototype.hasOwnProperty.call(input, key);
  const now = Date.now();
  const db = getFirestore();
  const activityRef = db.doc(`activities/${activityId}`);
  const roomRef = db.doc(`chats/${activityId}`);

  await db.runTransaction(async (transaction) => {
    const [activitySnapshot, roomSnapshot] = await Promise.all([
      transaction.get(activityRef),
      transaction.get(roomRef),
    ]);
    if (!activitySnapshot.exists) throw new HttpsError('not-found', 'Aktivität nicht gefunden.');

    const activity = activitySnapshot.data();
    if (activity.hostId !== uid) {
      throw new HttpsError('permission-denied', 'Nur der Host kann diese Aktivität bearbeiten.');
    }
    if (activity.status !== 'active') {
      throw new HttpsError('failed-precondition', 'Diese Aktivität ist nicht mehr aktiv.');
    }

    const patch = {};
    const nextMode = has('mode') ? input.mode : activity.mode;
    if (nextMode !== 'soon' && nextMode !== 'now') {
      throw new HttpsError('invalid-argument', 'Ungültiger Aktivitätsmodus.');
    }
    if (has('mode')) patch.mode = nextMode;

    const nextTitle = has('title') ? cleanString(input.title, 60, 'Titel', true) : activity.title;
    if (has('title')) patch.title = nextTitle;

    if (has('note')) {
      if (input.note === null) {
        patch.note = FieldValue.delete();
      } else {
        const note = cleanString(input.note, 500, 'Beschreibung');
        patch.note = note ? note : FieldValue.delete();
      }
    }

    const nextStartsAt = has('startsAt')
      ? cleanString(input.startsAt, 80, 'Startzeit', true)
      : activity.startsAt;
    const nextEndsAt = has('endsAt')
      ? cleanString(input.endsAt, 80, 'Endzeit', true)
      : activity.endsAt;
    const startsAtMs = typeof nextStartsAt === 'string' ? Date.parse(nextStartsAt) : NaN;
    const endsAtMs = typeof nextEndsAt === 'string' ? Date.parse(nextEndsAt) : NaN;
    if (!Number.isFinite(startsAtMs) || !Number.isFinite(endsAtMs)) {
      throw new HttpsError('invalid-argument', 'Start und Ende müssen gültige Zeiten sein.');
    }
    if (endsAtMs <= startsAtMs) {
      throw new HttpsError('invalid-argument', 'Die Endzeit muss nach der Startzeit liegen.');
    }
    if (endsAtMs <= now) {
      throw new HttpsError('failed-precondition', 'Diese Aktivität ist bereits beendet.');
    }
    if (has('startsAt')) patch.startsAt = nextStartsAt;
    if (has('endsAt')) {
      patch.endsAt = nextEndsAt;
      patch.visibleUntil = Timestamp.fromMillis(endsAtMs);
      patch.expireAt = Timestamp.fromMillis(endsAtMs + ACTIVITY_CHAT_RETENTION_MS);
    }
    if (has('startsAt')) {
      // A previous one-hour reminder belongs to the old start time.
      patch.journeyReminderSentAt = FieldValue.delete();
    }

    if (has('maxParticipants')) {
      if (input.maxParticipants === null) {
        patch.maxParticipants = FieldValue.delete();
      } else if (
        !Number.isInteger(input.maxParticipants) ||
        input.maxParticipants < 2 ||
        input.maxParticipants > 50
      ) {
        throw new HttpsError('invalid-argument', 'Ungültige Teilnehmergrenze.');
      } else if (input.maxParticipants < (activity.participants ?? []).length) {
        throw new HttpsError(
          'failed-precondition',
          'Die Teilnehmergrenze liegt unter der aktuellen Teilnehmerzahl.',
        );
      } else {
        patch.maxParticipants = input.maxParticipants;
      }
    }

    if (has('category')) {
      if (input.category === null) {
        patch.category = FieldValue.delete();
      } else if (typeof input.category !== 'string' || !ACTIVITY_CATEGORIES.has(input.category)) {
        throw new HttpsError('invalid-argument', 'Ungültige Kategorie.');
      } else {
        patch.category = input.category;
      }
    }

    if (has('place')) {
      if (!input.place || typeof input.place !== 'object' || Array.isArray(input.place)) {
        throw new HttpsError('invalid-argument', 'Ungültiger Ort.');
      }
      const label = cleanString(input.place.label, 200, 'Ort', true);
      const visibility = input.place.visibility;
      if (visibility !== 'pin' && visibility !== 'none') {
        throw new HttpsError('invalid-argument', 'Ungültige Ortsfreigabe.');
      }
      const latitude = input.place.latitude;
      const longitude = input.place.longitude;
      if (
        latitude != null &&
        (typeof latitude !== 'number' ||
          latitude < -90 ||
          latitude > 90 ||
          typeof longitude !== 'number' ||
          longitude < -180 ||
          longitude > 180)
      ) {
        throw new HttpsError('invalid-argument', 'Ungültige Koordinaten.');
      }
      patch.place = {
        label,
        visibility,
        ...(latitude != null ? { latitude, longitude } : {}),
      };
    }

    transaction.update(activityRef, patch);

    // Only touch the room when its title or its end-based TTL actually moves.
    if (roomSnapshot.exists && (has('title') || has('endsAt'))) {
      const room = roomSnapshot.data();
      if (room.type === 'activity') {
        transaction.update(roomRef, {
          ...(has('title') ? { title: nextTitle } : {}),
          ...(has('endsAt')
            ? { expireAt: Timestamp.fromMillis(endsAtMs + ACTIVITY_CHAT_RETENTION_MS) }
            : {}),
        });
      }
    }
  });

  return { ok: true };
});

async function clearActivityJourneys(activityId) {
  const db = getFirestore();
  const states = await db.collection(`activities/${activityId}/journeyStates`).limit(50).get();
  const batch = db.batch();
  states.docs.forEach((state) => batch.delete(state.ref));
  await Promise.all([
    getDatabase().ref(`journeys/${activityId}`).remove(),
    states.empty ? Promise.resolve() : batch.commit(),
  ]);
}

/** Cancellation removes the plan immediately but keeps its chat for one day. */
exports.cancelActivity = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireVerifiedAuth(request);
  const activityId = request.data?.activityId;
  if (!validActivityId(activityId)) {
    throw new HttpsError('invalid-argument', 'Ungültige Aktivitäts-ID.');
  }

  const now = Date.now();
  const db = getFirestore();
  const activityRef = db.doc(`activities/${activityId}`);
  const roomRef = db.doc(`chats/${activityId}`);
  await db.runTransaction(async (transaction) => {
    const [activitySnapshot, roomSnapshot] = await Promise.all([
      transaction.get(activityRef),
      transaction.get(roomRef),
    ]);
    if (!activitySnapshot.exists) throw new HttpsError('not-found', 'Aktivität nicht gefunden.');
    const activity = activitySnapshot.data();
    if (activity.hostId !== uid) {
      throw new HttpsError('permission-denied', 'Nur der Host kann diese Aktivität absagen.');
    }
    if (activity.status !== 'active') {
      throw new HttpsError('failed-precondition', 'Diese Aktivität ist nicht mehr aktiv.');
    }

    transaction.update(activityRef, {
      status: 'cancelled',
      journeyUnderwayCount: 0,
      visibleUntil: Timestamp.fromMillis(now),
      expireAt: Timestamp.fromMillis(now + ACTIVITY_CHAT_RETENTION_MS),
    });
    if (roomSnapshot.exists && roomSnapshot.data().type === 'activity') {
      transaction.update(roomRef, {
        expireAt: Timestamp.fromMillis(now + ACTIVITY_CHAT_RETENTION_MS),
      });
    }
  });

  // No Anreise position may outlive a cancellation, even during the chat's
  // short retention window. Activity status already blocks any new writes.
  await clearActivityJourneys(activityId).catch((error) =>
    console.error('[activity] journey cleanup after cancellation failed', error),
  );
  return { ok: true };
});

exports.searchPlaces = onCall(PLACES_CALLABLE_OPTS, async (request) => {
  const uid = requireAuth(request);
  await enforceRateLimit(uid, 'placeSearch', 10, 60 * 1000);
  const query = cleanString(request.data?.query, 120, 'Suchtext', true);
  if (query.length < 2) return { places: [] };

  const center = request.data?.center;
  const radiusMeters = Number(request.data?.radiusMeters ?? 10_000);
  if (
    center != null &&
    (typeof center !== 'object' ||
      typeof center.latitude !== 'number' ||
      typeof center.longitude !== 'number' ||
      center.latitude < -90 ||
      center.latitude > 90 ||
      center.longitude < -180 ||
      center.longitude > 180)
  ) {
    throw new HttpsError('invalid-argument', 'Ungültiger Kartenausschnitt.');
  }
  if (!Number.isFinite(radiusMeters) || radiusMeters < 100 || radiusMeters > 50_000) {
    throw new HttpsError('invalid-argument', 'Ungültiger Suchradius.');
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  // The emulator remains usable without a paid Places key. Users can still
  // choose a POI or drop a precise point directly on the map.
  if (!apiKey) return { places: [] };

  const body = {
    textQuery: query,
    languageCode: 'de',
    regionCode: 'DE',
    pageSize: 8,
    ...(center
      ? {
          locationBias: {
            circle: {
              center: { latitude: center.latitude, longitude: center.longitude },
              radius: Math.min(radiusMeters, 50_000),
            },
          },
        }
      : {}),
  };
  let response;
  try {
    response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    });
  } catch (error) {
    console.error('[places] request failed', error);
    throw new HttpsError('unavailable', 'Die Ortssuche ist gerade nicht erreichbar.');
  }
  if (!response.ok) {
    throw new HttpsError('unavailable', 'Die Ortssuche ist gerade nicht erreichbar.');
  }
  const payload = await response.json();
  return {
    places: (payload.places ?? []).map((place) => ({
      id: place.id,
      name: place.displayName?.text ?? 'Ort',
      address: place.formattedAddress,
      latitude: place.location?.latitude,
      longitude: place.location?.longitude,
      source: 'map',
    })),
  };
});

exports.publishPresence = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireVerifiedAuth(request);
  await enforceRateLimit(uid, 'presence', 12, 5 * 60 * 1000);
  const input = request.data?.presence;
  if (!input || typeof input !== 'object') {
    throw new HttpsError('invalid-argument', 'Präsenzdaten fehlen.');
  }
  const expiresAt = Number(input.expiresAt);
  if (
    !Number.isFinite(expiresAt) ||
    expiresAt <= Date.now() ||
    expiresAt > Date.now() + OPEN_MAX_DURATION_MS
  ) {
    throw new HttpsError('invalid-argument', 'Ungültige Ablaufzeit.');
  }
  if (typeof input.shareLocation !== 'boolean') {
    throw new HttpsError('invalid-argument', 'Ungültige Standortfreigabe.');
  }
  const vibeLabel = input.vibe?.label;
  if (vibeLabel != null && (typeof vibeLabel !== 'string' || vibeLabel.trim().length > 40)) {
    throw new HttpsError('invalid-argument', 'Der Hinweis ist zu lang.');
  }
  const location = input.coarseLocation;
  if (
    location != null &&
    (typeof location.lat !== 'number' ||
      typeof location.lng !== 'number' ||
      location.lat < -90 ||
      location.lat > 90 ||
      location.lng < -180 ||
      location.lng > 180)
  ) {
    throw new HttpsError('invalid-argument', 'Ungültiger Standort.');
  }

  const db = getFirestore();
  const [profileSnapshot, friends] = await Promise.all([
    db.doc(`publicProfiles/${uid}`).get(),
    directFriendUids(db, uid),
  ]);
  const profile = profileSnapshot.data() ?? {};
  const audienceUids = new Set([uid, ...friends]);
  await db.doc(`presence/${uid}`).set({
    uid,
    displayName: cleanString(profile.displayName, 50, 'Name', true),
    initials: cleanString(profile.initials, 8, 'Initialen', true),
    ...(profile.avatarUrl ? { avatarUrl: profile.avatarUrl } : {}),
    ...(vibeLabel?.trim() ? { vibe: { label: vibeLabel.trim() } } : {}),
    expireAt: Timestamp.fromMillis(expiresAt),
    shareLocation: input.shareLocation,
    ...(input.shareLocation && location
      ? { coarseLocation: { lat: location.lat, lng: location.lng } }
      : {}),
    audienceUids: [...audienceUids].slice(0, 50),
    updatedAt: Timestamp.now(),
  });
  return { ok: true };
});

exports.joinActivity = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireVerifiedAuth(request);
  await enforceRateLimit(uid, 'activityMembership', 12, 5 * 60 * 1000);
  const activityId = request.data?.activityId;
  if (!validActivityId(activityId)) {
    throw new HttpsError('invalid-argument', 'Ungültige Aktivitäts-ID.');
  }

  const db = getFirestore();
  const activityRef = db.doc(`activities/${activityId}`);
  const profileRef = db.doc(`publicProfiles/${uid}`);
  const roomRef = db.doc(`chats/${activityId}`);
  let journeyReminder;
  await db.runTransaction(async (transaction) => {
    const [activitySnapshot, profileSnapshot, roomSnapshot] = await Promise.all([
      transaction.get(activityRef),
      transaction.get(profileRef),
      transaction.get(roomRef),
    ]);
    if (!activitySnapshot.exists) throw new HttpsError('not-found', 'Activity nicht gefunden.');
    if (!profileSnapshot.exists) throw new HttpsError('failed-precondition', 'Profil fehlt.');

    const activity = activitySnapshot.data();
    if (activity.status !== 'active' || !(activity.audienceUids ?? []).includes(uid)) {
      throw new HttpsError('permission-denied', 'Du kannst dieser Activity nicht beitreten.');
    }
    const activityEndMs = activity.endsAt
      ? Date.parse(activity.endsAt)
      : activity.startsAt
        ? Date.parse(activity.startsAt)
        : NaN;
    if (Number.isFinite(activityEndMs) && activityEndMs <= Date.now()) {
      throw new HttpsError('failed-precondition', 'Diese Activity ist bereits beendet.');
    }
    const participantUids = Array.isArray(activity.participantUids) ? activity.participantUids : [];
    const participants = Array.isArray(activity.participants) ? activity.participants : [];
    const alreadyJoined = participantUids.includes(uid);
    let nextParticipantUids = participantUids;

    if (!alreadyJoined) {
      const maxParticipants = activity.maxParticipants ?? 50;
      if (participants.length >= maxParticipants) {
        throw new HttpsError('failed-precondition', 'Diese Activity ist voll.');
      }

      const profile = profileSnapshot.data();
      const participant = {
        uid,
        displayName: cleanString(profile.displayName, 50, 'Name', true),
        initials: cleanString(profile.initials, 8, 'Initialen', true),
      };
      nextParticipantUids = [...participantUids, uid];
      transaction.update(activityRef, {
        participantUids: nextParticipantUids,
        participants: [...participants, participant],
      });

      const startsAtMs = activity.startsAt ? Date.parse(activity.startsAt) : NaN;
      const isNow =
        activity.mode === 'now' || (Number.isFinite(startsAtMs) && startsAtMs <= Date.now());
      if (isNow) {
        const journey = journeyNotificationPayload(activityId, activity);
        if (journey) {
          journeyReminder = {
            recipientUid: uid,
            kind: 'journey_reminder',
            title: `${activity.title ?? 'Diese Activity'} ist jetzt`,
            body: 'Anreise automatisch teilen?',
            activityId,
            journey,
          };
        }
      }
    }

    const chatExpireAt = Math.max(
      Date.now() + ACTIVITY_CHAT_RETENTION_MS,
      (Number.isFinite(activityEndMs) ? activityEndMs : Date.now()) +
        ACTIVITY_CHAT_RETENTION_MS,
    );
    if (!roomSnapshot.exists) {
      transaction.create(roomRef, {
        type: 'activity',
        title: activity.title ?? 'Activity',
        memberIds: nextParticipantUids,
        messageCount: 0,
        readCount: {},
        createdAt: Timestamp.now(),
        expireAt: Timestamp.fromMillis(chatExpireAt),
      });
    } else {
      const room = roomSnapshot.data();
      if (room.type !== 'activity') {
        throw new HttpsError('failed-precondition', 'Dieser Raum ist kein Activity-Chat.');
      }
      if (!(room.memberIds ?? []).includes(uid)) {
        transaction.update(roomRef, {
          memberIds: [...(room.memberIds ?? []), uid],
          expireAt: Timestamp.fromMillis(chatExpireAt),
        });
      }
    }
  });
  if (journeyReminder) {
    await createNotifications([journeyReminder]);
  }
  return { ok: true };
});

exports.leaveActivity = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireVerifiedAuth(request);
  await enforceRateLimit(uid, 'activityMembership', 12, 5 * 60 * 1000);
  const activityId = request.data?.activityId;
  if (!validActivityId(activityId)) {
    throw new HttpsError('invalid-argument', 'Ungültige Aktivitäts-ID.');
  }

  const db = getFirestore();
  const activityRef = db.doc(`activities/${activityId}`);
  const roomRef = db.doc(`chats/${activityId}`);
  const journeyStateRef = activityRef.collection('journeyStates').doc(uid);
  let left = false;
  await db.runTransaction(async (transaction) => {
    const [snapshot, roomSnapshot, journeyStateSnapshot] = await Promise.all([
      transaction.get(activityRef),
      transaction.get(roomRef),
      transaction.get(journeyStateRef),
    ]);
    if (!snapshot.exists) return;
    const activity = snapshot.data();
    if (activity.hostId === uid) {
      throw new HttpsError('failed-precondition', 'Der Host muss die Activity absagen.');
    }
    if (activity.status !== 'active') return;
    const participantUids = Array.isArray(activity.participantUids) ? activity.participantUids : [];
    if (!participantUids.includes(uid)) return;
    left = true;
    transaction.update(activityRef, {
      participantUids: participantUids.filter((participantUid) => participantUid !== uid),
      participants: (activity.participants ?? []).filter((participant) => participant.uid !== uid),
      ...(journeyStateSnapshot.exists
        ? {
            journeyUnderwayCount: Math.max(
              0,
              (Number.isInteger(activity.journeyUnderwayCount) ? activity.journeyUnderwayCount : 0) - 1,
            ),
          }
        : {}),
    });
    if (journeyStateSnapshot.exists) transaction.delete(journeyStateRef);
    if (roomSnapshot.exists) {
      const room = roomSnapshot.data();
      const memberIds = Array.isArray(room.memberIds) ? room.memberIds : [];
      if (memberIds.includes(uid) && memberIds.length > 1) {
        transaction.update(roomRef, {
          memberIds: memberIds.filter((memberId) => memberId !== uid),
        });
      }
    }
  });
  if (left) {
    // Firestore membership gates new server actions; remove the RTDB entitlement
    // immediately afterwards so the former participant cannot read or write a
    // last-point location for the remaining Activity window.
    await getDatabase()
      .ref()
      .update({
        [`journeys/${activityId}/members/${uid}`]: null,
        [`journeys/${activityId}/locations/${uid}`]: null,
      });
  }
  return { ok: true };
});

exports.joinChatRoom = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireVerifiedAuth(request);
  const roomId = request.data?.roomId;
  if (!validActivityId(roomId)) {
    throw new HttpsError('invalid-argument', 'Ungültige Raum-ID.');
  }

  const db = getFirestore();
  const activityRef = db.doc(`activities/${roomId}`);
  const roomRef = db.doc(`chats/${roomId}`);
  await db.runTransaction(async (transaction) => {
    const activitySnapshot = await transaction.get(activityRef);
    if (!activitySnapshot.exists) {
      throw new HttpsError('not-found', 'Activity nicht gefunden.');
    }
    const activity = activitySnapshot.data();
    const participantUids = Array.isArray(activity.participantUids) ? activity.participantUids : [];
    if (
      activity.status !== 'active' ||
      !(activity.audienceUids ?? []).includes(uid) ||
      !participantUids.includes(uid)
    ) {
      throw new HttpsError('permission-denied', 'Du hast keinen Zugriff auf diesen Chat.');
    }
    const roomSnapshot = await transaction.get(roomRef);
    const activityEndMs = activity.endsAt
      ? Date.parse(activity.endsAt)
      : activity.startsAt
        ? Date.parse(activity.startsAt)
        : NaN;
    const expireAt = Math.max(
      Date.now() + ACTIVITY_CHAT_RETENTION_MS,
      (Number.isFinite(activityEndMs) ? activityEndMs : Date.now()) +
        ACTIVITY_CHAT_RETENTION_MS,
    );
    if (!roomSnapshot.exists) {
      transaction.create(roomRef, {
        type: 'activity',
        title: activity.title ?? 'Activity',
        memberIds: [uid],
        messageCount: 0,
        readCount: {},
        createdAt: Timestamp.now(),
        expireAt: Timestamp.fromMillis(expireAt),
      });
      return;
    }
    const room = roomSnapshot.data();
    if (room.type !== 'activity') {
      throw new HttpsError('failed-precondition', 'Dieser Raum ist kein Activity-Chat.');
    }
    if (!(room.memberIds ?? []).includes(uid)) {
      transaction.update(roomRef, {
        memberIds: [...(room.memberIds ?? []), uid],
        expireAt: Timestamp.fromMillis(expireAt),
      });
    }
  });
  return { ok: true };
});

exports.leaveChatRoom = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireVerifiedAuth(request);
  const roomId = request.data?.roomId;
  if (!validActivityId(roomId)) {
    throw new HttpsError('invalid-argument', 'Ungültige Raum-ID.');
  }

  const db = getFirestore();
  const roomRef = db.doc(`chats/${roomId}`);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(roomRef);
    if (!snapshot.exists) return;
    const room = snapshot.data();
    const memberIds = Array.isArray(room.memberIds) ? room.memberIds : [];
    if (!memberIds.includes(uid)) return;
    const nextMemberIds = memberIds.filter((memberId) => memberId !== uid);
    // Admin succession: when the last admin leaves, the longest-standing
    // remaining member inherits — a room must never end up admin-less.
    // An emptied room becomes unreadable (isMember) and dies via TTL.
    let adminUids = roomAdminUids(room).filter((adminUid) => adminUid !== uid);
    if (!adminUids.length && nextMemberIds.length) adminUids = [nextMemberIds[0]];
    transaction.update(roomRef, { memberIds: nextMemberIds, adminUids });
  });
  return { ok: true };
});

/**
 * Opt-in discoverability for planning groups ("Offen für Dazustoßer").
 * The private room doc stays members-only; visibility happens through a public
 * TEASER doc `groupOpenings/{roomId}` (title, vibe, member preview — never
 * messages). Audience = the toggling admin's confirmed friends (snapshot,
 * same mechanics as presence).
 */
/** The caller's own block list, resolved to display data (publicProfiles are
 * not client-readable — see getRoomMemberProfiles for the room-scoped variant). */
exports.getBlockedContacts = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireAuth(request);
  const db = getFirestore();
  const blocks = await db.collection('blocks').where('blockerUid', '==', uid).limit(100).get();
  const contacts = await Promise.all(
    blocks.docs
      .map((docSnapshot) => docSnapshot.data().blockedUid)
      .filter((blockedUid) => typeof blockedUid === 'string')
      .map(async (blockedUid) => {
        const profile = await db.doc(`publicProfiles/${blockedUid}`).get();
        return contactSnapshot(blockedUid, profile.data());
      }),
  );
  return { contacts };
});

exports.setGroupJoinable = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireVerifiedAuth(request);
  const roomId = request.data?.roomId;
  const joinable = request.data?.joinable === true;
  if (!validActivityId(roomId)) {
    throw new HttpsError('invalid-argument', 'Ungültige Raum-ID.');
  }

  const db = getFirestore();
  const roomRef = db.doc(`chats/${roomId}`);
  const openingRef = db.doc(`groupOpenings/${roomId}`);
  const roomSnapshot = await roomRef.get();
  if (!roomSnapshot.exists) throw new HttpsError('not-found', 'Raum nicht gefunden.');
  const room = roomSnapshot.data();
  requireGroupAdmin(room, uid);

  if (!joinable) {
    await Promise.all([roomRef.update({ joinable: false }), openingRef.delete()]);
    return { ok: true };
  }

  const memberIds = Array.isArray(room.memberIds) ? room.memberIds : [];
  const [friends, previewSnapshots] = await Promise.all([
    directFriendUids(db, uid),
    Promise.all(
      memberIds.slice(0, 4).map((memberUid) => db.doc(`publicProfiles/${memberUid}`).get()),
    ),
  ]);
  const audienceUids = friends.filter((friendUid) => !memberIds.includes(friendUid)).slice(0, 50);
  const memberPreview = previewSnapshots.map((snapshot) => {
    const profile = snapshot.data() ?? {};
    return {
      displayName: typeof profile.displayName === 'string' ? profile.displayName : 'Freund:in',
      initials: typeof profile.initials === 'string' ? profile.initials : '??',
    };
  });

  await Promise.all([
    roomRef.update({ joinable: true }),
    openingRef.set({
      roomId,
      title: room.title ?? 'Planung',
      ...(room.vibe ? { vibe: room.vibe } : {}),
      memberCount: memberIds.length,
      memberPreview,
      audienceUids,
      expireAt: room.expireAt ?? Timestamp.fromMillis(Date.now() + GROUP_RETENTION_MS),
      updatedAt: Timestamp.now(),
    }),
  ]);
  return { ok: true };
});

exports.joinOpenGroup = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireVerifiedAuth(request);
  const roomId = request.data?.roomId;
  if (!validActivityId(roomId)) {
    throw new HttpsError('invalid-argument', 'Ungültige Raum-ID.');
  }

  const db = getFirestore();
  const roomRef = db.doc(`chats/${roomId}`);
  const openingRef = db.doc(`groupOpenings/${roomId}`);
  await db.runTransaction(async (transaction) => {
    const [roomSnapshot, openingSnapshot] = await Promise.all([
      transaction.get(roomRef),
      transaction.get(openingRef),
    ]);
    if (!roomSnapshot.exists || !openingSnapshot.exists) {
      throw new HttpsError('not-found', 'Diese Planung ist nicht mehr offen.');
    }
    const room = roomSnapshot.data();
    const opening = openingSnapshot.data();
    if (room.type !== 'group' || room.joinable !== true) {
      throw new HttpsError('failed-precondition', 'Diese Planung ist nicht mehr offen.');
    }
    // The teaser's audience is the authorization: only invited-by-openness
    // friends may join — never arbitrary uid holders.
    if (!(opening.audienceUids ?? []).includes(uid)) {
      throw new HttpsError('permission-denied', 'Diese Planung ist für dich nicht sichtbar.');
    }
    const memberIds = Array.isArray(room.memberIds) ? room.memberIds : [];
    if (memberIds.includes(uid)) return;
    if (memberIds.length >= 25) {
      throw new HttpsError('failed-precondition', 'Diese Planung ist voll.');
    }
    transaction.update(roomRef, { memberIds: [...memberIds, uid] });
    transaction.update(openingRef, {
      memberCount: memberIds.length + 1,
      audienceUids: (opening.audienceUids ?? []).filter((audienceUid) => audienceUid !== uid),
    });
  });
  return { ok: true };
});

exports.renameChatRoom = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireVerifiedAuth(request);
  const roomId = request.data?.roomId;
  if (!validActivityId(roomId)) {
    throw new HttpsError('invalid-argument', 'Ungültige Raum-ID.');
  }
  const title = cleanString(request.data?.title, 80, 'Name der Planung', true);

  const db = getFirestore();
  const roomRef = db.doc(`chats/${roomId}`);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(roomRef);
    if (!snapshot.exists) throw new HttpsError('not-found', 'Raum nicht gefunden.');
    const room = snapshot.data();
    // Activity chats mirror the activity title (edited via the activity
    // editor) — renaming here would desync the two.
    requireGroupAdmin(room, uid);
    transaction.update(roomRef, { title });
  });
  return { ok: true };
});

exports.createGroupChat = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireVerifiedAuth(request);
  await enforceRateLimit(uid, 'createGroup', 10, HOUR_MS);
  const memberUids = Array.isArray(request.data?.memberUids)
    ? [...new Set(request.data.memberUids)]
    : [];
  if (
    memberUids.length > 24 ||
    memberUids.some(
      (memberUid) => typeof memberUid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(memberUid),
    ) ||
    memberUids.includes(uid)
  ) {
    throw new HttpsError('invalid-argument', 'Ungültige Teilnehmer.');
  }
  const title = cleanString(request.data?.title ?? 'Neue Planung', 80, 'Name der Planung', true);
  const vibe = cleanString(request.data?.vibe, 60, 'Vibe');
  const db = getFirestore();
  const allowedUids = new Set([uid, ...(await directFriendUids(db, uid))]);
  if (memberUids.some((memberUid) => !allowedUids.has(memberUid))) {
    throw new HttpsError(
      'permission-denied',
      'Planungen können nur mit bestätigten Freunden gestartet werden.',
    );
  }
  const roomRef = db.collection('chats').doc();
  await roomRef.create({
    type: 'group',
    title,
    ...(vibe ? { vibe } : {}),
    memberIds: [uid, ...memberUids],
    // The creator is the first admin. Admins manage membership (add friends,
    // remove members, promote further admins) via the callables below.
    adminUids: [uid],
    messageCount: 0,
    readCount: {},
    createdAt: Timestamp.now(),
    expireAt: Timestamp.fromMillis(Date.now() + GROUP_RETENTION_MS),
  });
  return { ok: true, id: roomRef.id };
});

/** Legacy rooms have no adminUids — the first member (creator) counts as admin. */
/**
 * Resolves contact cards for an already joined chat. This is the only profile
 * lookup path for room members: it validates room membership first, performs
 * one bounded friendship read, and reveals username/avatar only to direct
 * friends (or the requester themselves).
 */
exports.getRoomMemberProfiles = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireAuth(request);
  await enforceRateLimit(uid, 'roomProfiles', 20, 60 * 1000);
  const roomId = request.data?.roomId;
  if (!validActivityId(roomId)) {
    throw new HttpsError('invalid-argument', 'Ungültiger Chat.');
  }

  const db = getFirestore();
  const roomSnapshot = await db.doc(`chats/${roomId}`).get();
  if (!roomSnapshot.exists) throw new HttpsError('not-found', 'Chat nicht gefunden.');
  const memberIds = Array.isArray(roomSnapshot.data().memberIds)
    ? roomSnapshot.data().memberIds.filter(validUid).slice(0, 100)
    : [];
  if (!memberIds.includes(uid)) {
    throw new HttpsError('permission-denied', 'Du bist kein Mitglied dieses Chats.');
  }

  const [friendUids, profileSnapshots] = await Promise.all([
    directFriendUids(db, uid),
    Promise.all(memberIds.map((memberUid) => db.doc(`users/${memberUid}`).get())),
  ]);
  const members = profileSnapshots.map((snapshot, index) => {
    const memberUid = memberIds[index];
    const profile = profileSnapshot(memberUid, snapshot.data() ?? {});
    if (memberUid === uid || friendUids.has(memberUid)) return profile;
    return {
      uid: profile.uid,
      displayName: profile.displayName,
      initials: profile.initials,
    };
  });
  return { members };
});

function roomAdminUids(room) {
  if (Array.isArray(room.adminUids) && room.adminUids.length) return room.adminUids;
  return Array.isArray(room.memberIds) ? room.memberIds.slice(0, 1) : [];
}

/** Shared guard for the member-management callables: group rooms only (activity
 * chat membership follows activity participation), caller must be an admin. */
function requireGroupAdmin(room, uid) {
  if (room.type !== 'group') {
    throw new HttpsError(
      'failed-precondition',
      'Mitglieder von Activity-Chats folgen der Teilnahme an der Activity.',
    );
  }
  if (!roomAdminUids(room).includes(uid)) {
    throw new HttpsError('permission-denied', 'Nur Admins können Mitglieder verwalten.');
  }
}

exports.removeChatMember = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireVerifiedAuth(request);
  const roomId = request.data?.roomId;
  const memberUid = request.data?.memberUid;
  if (!validActivityId(roomId) || !validUid(memberUid)) {
    throw new HttpsError('invalid-argument', 'Ungültige Anfrage.');
  }

  const db = getFirestore();
  const roomRef = db.doc(`chats/${roomId}`);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(roomRef);
    if (!snapshot.exists) throw new HttpsError('not-found', 'Raum nicht gefunden.');
    const room = snapshot.data();
    requireGroupAdmin(room, uid);
    const memberIds = Array.isArray(room.memberIds) ? room.memberIds : [];
    if (!memberIds.includes(memberUid)) return;
    // Admins cannot be removed — they leave on their own (leaveChatRoom).
    if (roomAdminUids(room).includes(memberUid)) {
      throw new HttpsError('failed-precondition', 'Admins können nicht entfernt werden.');
    }
    transaction.update(roomRef, {
      memberIds: memberIds.filter((id) => id !== memberUid),
      adminUids: roomAdminUids(room),
    });
  });
  return { ok: true };
});

exports.promoteChatAdmin = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireVerifiedAuth(request);
  const roomId = request.data?.roomId;
  const memberUid = request.data?.memberUid;
  if (!validActivityId(roomId) || !validUid(memberUid)) {
    throw new HttpsError('invalid-argument', 'Ungültige Anfrage.');
  }

  const db = getFirestore();
  const roomRef = db.doc(`chats/${roomId}`);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(roomRef);
    if (!snapshot.exists) throw new HttpsError('not-found', 'Raum nicht gefunden.');
    const room = snapshot.data();
    requireGroupAdmin(room, uid);
    const memberIds = Array.isArray(room.memberIds) ? room.memberIds : [];
    if (!memberIds.includes(memberUid)) {
      throw new HttpsError('failed-precondition', 'Diese Person ist kein Mitglied.');
    }
    const adminUids = roomAdminUids(room);
    if (adminUids.includes(memberUid)) return;
    transaction.update(roomRef, { adminUids: [...adminUids, memberUid] });
  });
  return { ok: true };
});

async function createChatMessage(request, kind, proposal) {
  const uid = requireVerifiedAuth(request);
  const roomId = request.data?.roomId;
  const text = request.data?.text?.trim?.();
  if (typeof roomId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(roomId)) {
    throw new HttpsError('invalid-argument', 'Ungültige Raum-ID.');
  }
  if (typeof text !== 'string' || text.length < 1 || text.length > 2000) {
    throw new HttpsError('invalid-argument', 'Die Nachricht ist leer oder zu lang.');
  }

  const authorName = request.data?.authorName?.trim?.() || 'Freund';
  const initials = request.data?.initials?.trim?.() || 'FR';
  if (authorName.length > 50 || initials.length > 8) {
    throw new HttpsError('invalid-argument', 'Ungültige Absenderdaten.');
  }

  const db = getFirestore();
  const roomRef = db.doc(`chats/${roomId}`);
  const rateRef = db.doc(`rateLimits/${uid}`);
  const roomRateRef = db.doc(`rateLimits/room_${roomId}`);
  const profileRef = db.doc(`publicProfiles/${uid}`);
  const messageRef = roomRef.collection('messages').doc();
  const pushOutboxRef = db.collection('pushOutbox').doc();
  const now = Date.now();
  const windowStart = Math.floor(now / CHAT_RATE_WINDOW_MS) * CHAT_RATE_WINDOW_MS;

  await db.runTransaction(async (transaction) => {
    const [roomSnapshot, rateSnapshot, roomRateSnapshot, profileSnapshot] = await Promise.all([
      transaction.get(roomRef),
      transaction.get(rateRef),
      transaction.get(roomRateRef),
      transaction.get(profileRef),
    ]);
    if (!roomSnapshot.exists) {
      throw new HttpsError('not-found', 'Chat nicht gefunden.');
    }

    const room = roomSnapshot.data();
    if (!Array.isArray(room.memberIds) || !room.memberIds.includes(uid)) {
      throw new HttpsError('permission-denied', 'Du bist kein Mitglied dieses Chats.');
    }
    const messageCount = Number.isSafeInteger(room.messageCount) ? room.messageCount + 1 : 1;
    const roomExpiry = room.expireAt?.toMillis?.() ?? 0;
    if (roomExpiry <= now) {
      throw new HttpsError('failed-precondition', 'Dieser Chat ist abgelaufen.');
    }

    const rate = rateSnapshot.exists ? rateSnapshot.data() : {};
    const count = rate.windowStart === windowStart ? (rate.count ?? 0) : 0;
    if (count >= CHAT_MESSAGES_PER_WINDOW) {
      throw new HttpsError('resource-exhausted', 'Zu viele Nachrichten. Bitte kurz warten.');
    }
    const roomRate = roomRateSnapshot.exists ? roomRateSnapshot.data() : {};
    const roomCount = roomRate.windowStart === windowStart ? (roomRate.count ?? 0) : 0;
    if (roomCount >= CHAT_ROOM_MESSAGES_PER_WINDOW) {
      throw new HttpsError(
        'resource-exhausted',
        'In diesem Chat werden gerade sehr viele Nachrichten gesendet. Bitte kurz warten.',
      );
    }

    const profile = profileSnapshot.exists ? profileSnapshot.data() : {};
    const serverAuthorName = cleanString(
      profile.displayName ?? request.auth.token.name ?? 'Freund',
      50,
      'Name',
      true,
    );
    const serverInitials = cleanString(
      profile.initials ?? serverAuthorName.slice(0, 2).toUpperCase(),
      8,
      'Initialen',
      true,
    );

    const messageCreatedAt = Timestamp.fromMillis(now);
    const messageExpiry =
      room.type === 'group'
        ? now + GROUP_RETENTION_MS
        : Math.min(roomExpiry, now + ACTIVITY_CHAT_RETENTION_MS);
    const message = {
      authorId: uid,
      authorName: serverAuthorName,
      initials: serverInitials,
      text,
      kind,
      createdAt: messageCreatedAt,
      expireAt: Timestamp.fromMillis(messageExpiry),
      ...(proposal ? { proposal } : {}),
    };

    transaction.create(messageRef, message);
    transaction.set(
      rateRef,
      {
        windowStart,
        count: count + 1,
        expireAt: Timestamp.fromMillis(windowStart + CHAT_RATE_WINDOW_MS),
      },
      { merge: true },
    );
    transaction.set(
      roomRateRef,
      {
        windowStart,
        count: roomCount + 1,
        expireAt: Timestamp.fromMillis(windowStart + CHAT_RATE_WINDOW_MS),
      },
      { merge: true },
    );
    transaction.update(roomRef, {
      lastMessage: {
        text,
        authorId: uid,
        authorName: serverAuthorName,
        at: messageCreatedAt,
      },
      messageCount,
      ...(room.type === 'group'
        ? { expireAt: Timestamp.fromMillis(now + GROUP_RETENTION_MS) }
        : {}),
    });

    // Chat push is an outbox-only signal: it does not create N notification
    // documents. The client updates a local badge and later reconciles the
    // authoritative room summary on foreground or when the list is opened.
    const recipients = room.memberIds.filter((memberUid) => memberUid !== uid);
    if (recipients.length) {
      transaction.create(pushOutboxRef, {
        items: recipients.map((recipientUid) =>
          pushOutboxItem({
            recipientUid,
            actorUid: uid,
            kind: 'chat_message',
            title: 'Neue Nachricht',
            body: 'Öffne Together, um sie zu lesen.',
            roomId,
            messageCount,
            ...(room.type === 'activity' ? { activityId: roomId } : {}),
          }),
        ),
        createdAt: messageCreatedAt,
        expireAt: Timestamp.fromMillis(now + NOTIFICATION_RETENTION_MS),
      });
    }

  });

  // No per-recipient Firestore notification documents are created for chat.
  // Push data contains only room metadata; it carries no chat text.

  return { ok: true, id: messageRef.id };
}

exports.sendChatMessage = onCall(CALLABLE_OPTS, (request) =>
  createChatMessage(request, 'text'),
);

exports.sendChatProposal = onCall(CALLABLE_OPTS, (request) => {
  const uid = requireAuth(request);
  const data = request.data ?? {};
  const proposal = {
    ...(data.what != null ? { what: cleanString(data.what, 200, 'Was') } : {}),
    ...(data.when != null ? { when: cleanString(data.when, 200, 'Wann') } : {}),
    ...(data.where != null ? { where: cleanString(data.where, 200, 'Wo') } : {}),
    confirmedBy: [uid],
  };
  return createChatMessage(
    { ...request, data: { ...data, text: proposal.what ?? 'Vorschlag' } },
    'proposal',
    proposal,
  );
});

/**
 * Revokes live and retained Safety access in both directions when the social
 * trust relationship disappears. If the removed person was the only
 * companion, the affected session ends instead of keeping an invalid or empty
 * audience. The owner can otherwise continue with the remaining companions.
 */
async function revokeSafetyAccessBetween(firstUid, secondUid) {
  const database = getDatabase();

  async function revokeOne(ownerUid, companionUid) {
    const sessionRef = database.ref(`heimwege/${ownerUid}`);
    const snapshot = await sessionRef.get();
    const session = snapshot.val();
    if (!session?.audienceUids?.[companionUid]) {
      await database.ref(`heimwegeIndex/${companionUid}/${ownerUid}`).remove();
      return;
    }

    await sessionRef.transaction((current) => {
      // The preceding read warms the Admin cache. Returning null still lets
      // RTDB retry safely if a cold worker supplies speculative local state.
      if (!current) return null;
      if (current.audienceUids?.[companionUid] !== true) return current;
      const audienceUids = { ...(current.audienceUids ?? {}) };
      const companions = { ...(current.companions ?? {}) };
      delete audienceUids[companionUid];
      delete companions[companionUid];
      if (!Object.keys(audienceUids).length) return null;
      return {
        ...current,
        audienceUids,
        companions,
        audienceRevision: Number(current.audienceRevision ?? 0) + 1,
      };
    });

    // Idempotent even when the session was deleted or changed concurrently.
    await database.ref(`heimwegeIndex/${companionUid}/${ownerUid}`).remove();
  }

  await Promise.all([revokeOne(firstUid, secondUid), revokeOne(secondUid, firstUid)]);
}

/**
 * Starts one bounded Heimweg session with an explicit initial audience of
 * accepted direct friends. The Admin SDK owns identity, timestamps and fan-out indexes;
 * clients can only update their own live status/location afterwards.
 */
exports.startSafetySession = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireAuth(request);
  const rawAudience = request.data?.audienceUids;
  if (!Array.isArray(rawAudience)) {
    throw new HttpsError('invalid-argument', 'Wähle mindestens eine Person aus.');
  }
  const audienceUids = [...new Set(rawAudience)].filter(
    (candidate) => validUid(candidate) && candidate !== uid,
  );
  if (
    audienceUids.length < 1 ||
    audienceUids.length > SAFETY_MAX_COMPANIONS ||
    audienceUids.length !== rawAudience.length
  ) {
    throw new HttpsError('invalid-argument', 'Die ausgewählten Personen sind ungültig.');
  }

  await enforceRateLimit(uid, 'safety_start', 5, 10 * 60 * 1000);
  const db = getFirestore();
  const [friends, blocked, profileSnapshotDoc] = await Promise.all([
    directFriendUids(db, uid),
    isBlockedBetweenAny(db, uid, audienceUids),
    db.doc(`publicProfiles/${uid}`).get(),
  ]);
  if (audienceUids.some((companionUid) => !friends.has(companionUid))) {
    throw new HttpsError(
      'permission-denied',
      'Ein Heimweg kann nur mit bestätigten Freunden geteilt werden.',
    );
  }
  if (blocked) {
    throw new HttpsError(
      'permission-denied',
      'Eine ausgewählte Person ist für diesen Heimweg nicht verfügbar.',
    );
  }

  const identity = profileSnapshot(uid, profileSnapshotDoc.data());
  const now = Date.now();
  const expiresAt = now + SAFETY_DEFAULT_DURATION_MS;
  const audienceMap = Object.fromEntries(audienceUids.map((companionUid) => [companionUid, true]));
  const session = {
    displayName: identity.displayName,
    initials: identity.initials,
    status: 'blue',
    startedAt: now,
    updatedAt: now,
    expiresAt,
    retainUntil: expiresAt + SAFETY_BLUE_RETENTION_MS,
    audienceUids: audienceMap,
    companions: {},
  };

  const database = getDatabase();
  const sessionRef = database.ref(`heimwege/${uid}`);
  let blockedByActiveSession = false;
  const transaction = await sessionRef.transaction((current) => {
    if (current && Number(current.expiresAt) > now) {
      blockedByActiveSession = true;
      return undefined;
    }
    return session;
  });
  if (!transaction.committed || blockedByActiveSession) {
    throw new HttpsError('already-exists', 'Dein Heimweg ist bereits aktiv.');
  }

  const indexWrites = {};
  audienceUids.forEach((companionUid) => {
    indexWrites[`heimwegeIndex/${companionUid}/${uid}`] = true;
  });

  try {
    await database.ref().update(indexWrites);
    await createNotifications(
      audienceUids.map((recipientUid) => ({
        recipientUid,
        actorUid: uid,
        kind: 'safety_request',
        title: `${identity.displayName} teilt den Heimweg`,
        body: 'Kannst du bestätigen, dass du erreichbar bist?',
        safetyOwnerUid: uid,
      })),
      { queuePush: true },
    );
  } catch (error) {
    const rollback = { [`heimwege/${uid}`]: null };
    audienceUids.forEach((companionUid) => {
      rollback[`heimwegeIndex/${companionUid}/${uid}`] = null;
    });
    await database.ref().update(rollback);
    throw error;
  }

  return { ok: true, expiresAt };
});

/**
 * Changes the concrete companion list only after an explicit owner action.
 * The full session transaction prevents a concurrent location/status write
 * from being overwritten and keeps the max/at-least-one invariants atomic.
 * Fan-out indexes are then repaired idempotently from the committed audience.
 */
exports.updateSafetyAudience = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireAuth(request);
  const rawAdd = request.data?.addUids ?? [];
  const rawRemove = request.data?.removeUids ?? [];
  if (!Array.isArray(rawAdd) || !Array.isArray(rawRemove)) {
    throw new HttpsError('invalid-argument', 'Ungültige Begleiter-Auswahl.');
  }
  const addUids = [...new Set(rawAdd)];
  const removeUids = [...new Set(rawRemove)];
  const removeSet = new Set(removeUids);
  if (
    (!addUids.length && !removeUids.length) ||
    addUids.length !== rawAdd.length ||
    removeUids.length !== rawRemove.length ||
    [...addUids, ...removeUids].some((candidate) => !validUid(candidate) || candidate === uid) ||
    addUids.some((candidate) => removeSet.has(candidate))
  ) {
    throw new HttpsError('invalid-argument', 'Ungültige Begleiter-Auswahl.');
  }

  await enforceRateLimit(uid, 'safety_audience', 20, 10 * 60 * 1000);
  const now = Date.now();
  const db = getFirestore();
  const database = getDatabase();
  const sessionRef = database.ref(`heimwege/${uid}`);
  const initialSnapshot = await sessionRef.get();
  const initial = initialSnapshot.val();
  if (!initial || Number(initial.expiresAt) <= now) {
    throw new HttpsError('failed-precondition', 'Dein Heimweg ist nicht mehr aktiv.');
  }

  if (addUids.length) {
    const [friends, blocked] = await Promise.all([
      directFriendUids(db, uid),
      isBlockedBetweenAny(db, uid, addUids),
    ]);
    if (addUids.some((companionUid) => !friends.has(companionUid))) {
      throw new HttpsError(
        'permission-denied',
        'Ein Heimweg kann nur mit bestätigten Freunden geteilt werden.',
      );
    }
    if (blocked) {
      throw new HttpsError(
        'permission-denied',
        'Eine ausgewählte Person ist für diesen Heimweg nicht verfügbar.',
      );
    }
  }

  let failure = 'not-active';
  const result = await sessionRef.transaction((current) => {
    // A cold Admin worker can invoke the callback once with speculative local
    // `null`. Returning null lets RTDB compare with the server and retry with
    // the real session; an actual concurrent deletion remains a harmless no-op.
    if (!current) return null;
    if (Number(current.expiresAt) <= now) return undefined;
    const nextAudience = new Set(Object.keys(current.audienceUids ?? {}).filter(validUid));
    removeUids.forEach((companionUid) => nextAudience.delete(companionUid));
    addUids.forEach((companionUid) => nextAudience.add(companionUid));
    if (!nextAudience.size) {
      failure = 'empty';
      return undefined;
    }
    if (nextAudience.size > SAFETY_MAX_COMPANIONS) {
      failure = 'too-many';
      return undefined;
    }
    const companions = { ...(current.companions ?? {}) };
    removeUids.forEach((companionUid) => delete companions[companionUid]);
    failure = '';
    return {
      ...current,
      audienceUids: Object.fromEntries(
        [...nextAudience].map((companionUid) => [companionUid, true]),
      ),
      companions,
      audienceRevision: Number(current.audienceRevision ?? 0) + 1,
    };
  });
  if (!result.committed || failure) {
    throw new HttpsError(
      'failed-precondition',
      failure === 'empty'
        ? 'Mindestens eine Person muss deinen Heimweg weiterhin sehen.'
        : failure === 'too-many'
          ? `Du kannst deinen Heimweg mit höchstens ${SAFETY_MAX_COMPANIONS} Personen teilen.`
          : 'Dein Heimweg ist nicht mehr aktiv.',
    );
  }

  const committed = result.snapshot.val();
  const audienceUids = Object.keys(committed.audienceUids ?? {}).filter(validUid);
  const finalAudience = new Set(audienceUids);
  const initialAudience = new Set(Object.keys(initial.audienceUids ?? {}).filter(validUid));
  const added = addUids.filter(
    (companionUid) => finalAudience.has(companionUid) && !initialAudience.has(companionUid),
  );

  // Write every requested index to its committed state, not only deltas. A
  // retry therefore repairs a partially failed fan-out without extra reads.
  const indexWrites = {};
  addUids.forEach((companionUid) => {
    indexWrites[`heimwegeIndex/${companionUid}/${uid}`] = finalAudience.has(companionUid)
      ? true
      : null;
  });
  removeUids.forEach((companionUid) => {
    indexWrites[`heimwegeIndex/${companionUid}/${uid}`] = finalAudience.has(companionUid)
      ? true
      : null;
  });
  if (Object.keys(indexWrites).length) await database.ref().update(indexWrites);

  if (added.length) {
    const displayName =
      typeof committed.displayName === 'string' && committed.displayName.trim()
        ? committed.displayName.trim().slice(0, 80)
        : 'Eine Person';
    const alertAt = Number(committed.alert?.at);
    const alertActive =
      ['orange', 'red'].includes(committed.status) && Number.isSafeInteger(alertAt) && alertAt > 0;
    await createNotifications(
      added.map((recipientUid) => ({
        recipientUid,
        actorUid: uid,
        safetyOwnerUid: uid,
        ...(alertActive ? { safetyAlertAt: alertAt } : {}),
        ...(committed.status === 'red' && alertActive
          ? {
              kind: 'safety_emergency',
              title: `${displayName} hat einen Hilferuf gesendet`,
              body: 'Prüfe den Live-Standort und kontaktiere die Person. Rufe bei Gefahr 112.',
            }
          : committed.status === 'orange' && alertActive
            ? {
                kind: 'safety_unwell',
                title: `${displayName} fühlt sich unsicher`,
                body: 'Bitte behalte den Heimweg aktiv im Blick. Der Standort wird häufiger aktualisiert.',
              }
            : {
                kind: 'safety_request',
                title: `${displayName} teilt den Heimweg`,
                body: 'Kannst du bestätigen, dass du erreichbar bist?',
              }),
      })),
      { queuePush: true },
    );
  }

  return { ok: true, audienceUids };
});

/**
 * Extends an active Heimweg by exactly one hour. The explicit action is the
 * proof of continued intent; an unattended session can therefore never run
 * beyond its two-hour deadline. Total duration is bounded against abuse.
 */
exports.extendSafetySession = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireAuth(request);
  await enforceRateLimit(uid, 'safety_extend', 12, SAFETY_MAX_TOTAL_MS);

  const now = Date.now();
  const sessionRef = getDatabase().ref(`heimwege/${uid}`);
  // Warm the Admin RTDB cache before the transaction. In a fresh Functions
  // worker the first speculative transaction callback may otherwise receive
  // `null`; aborting on that local placeholder would incorrectly report an
  // active server session as expired.
  const initialSnapshot = await sessionRef.get();
  if (!initialSnapshot.exists() || Number(initialSnapshot.val()?.expiresAt) <= now) {
    throw new HttpsError('failed-precondition', 'Dein Heimweg ist nicht mehr aktiv.');
  }
  let nextExpiresAt = 0;
  let failure = 'not-active';
  const result = await sessionRef.transaction((current) => {
    // A cold Admin worker invokes this once with a speculative local `null`.
    // Returning `null` (instead of aborting with `undefined`) lets RTDB compare
    // against the server and retry with the real session. If the session was
    // concurrently deleted this remains a harmless no-op and nextExpiresAt
    // stays zero, which is rejected below.
    if (!current) return null;
    if (Number(current.expiresAt) <= now) return undefined;
    const startedAt = Number(current.startedAt);
    const currentExpiresAt = Number(current.expiresAt);
    if (currentExpiresAt - now > SAFETY_EXTENSION_WINDOW_MS) {
      failure = 'too-early';
      return undefined;
    }
    const maximum = startedAt + SAFETY_MAX_TOTAL_MS;
    nextExpiresAt = Math.min(currentExpiresAt + SAFETY_EXTENSION_MS, maximum);
    if (!Number.isFinite(startedAt) || nextExpiresAt <= currentExpiresAt) {
      failure = 'max-duration';
      return undefined;
    }
    return {
      ...current,
      expiresAt: nextExpiresAt,
      retainUntil: nextExpiresAt + safetyRetentionMs(current.status),
      updatedAt: now,
    };
  });

  if (!result.committed || nextExpiresAt === 0) {
    throw new HttpsError(
      'failed-precondition',
      failure === 'max-duration'
        ? 'Die maximale Heimweg-Dauer ist erreicht.'
        : failure === 'too-early'
          ? 'Du kannst deinen Heimweg in den letzten 15 Minuten verlängern.'
          : 'Dein Heimweg ist nicht mehr aktiv.',
    );
  }
  return { ok: true, expiresAt: nextExpiresAt };
});

/**
 * Status changes are server-owned because Orange/Rot must produce the
 * corresponding in-app + system notification in the same backend operation.
 * A direct client RTDB write could recolor the map while locked companion
 * devices remain unaware.
 */
exports.setSafetyStatus = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireAuth(request);
  await enforceRateLimit(uid, 'safety_status', 10, 5 * 60 * 1000);
  const status = request.data?.status;
  if (!['blue', 'orange', 'red'].includes(status)) {
    throw new HttpsError('invalid-argument', 'Ungültiger Heimweg-Status.');
  }

  const now = Date.now();
  const sessionRef = getDatabase().ref(`heimwege/${uid}`);
  const snapshot = await sessionRef.get();
  if (!snapshot.exists() || Number(snapshot.val()?.expiresAt) <= now) {
    throw new HttpsError('failed-precondition', 'Dein Heimweg ist nicht mehr aktiv.');
  }

  const session = snapshot.val();
  if (session.status === status) return { ok: true, changed: false };
  const alertAt =
    status === 'orange' || status === 'red'
      ? Math.max(now, Number(session.alert?.at ?? 0) + 1)
      : null;

  await sessionRef.update({
    status,
    updatedAt: now,
    retainUntil: Number(session.expiresAt) + safetyRetentionMs(status),
    alert: alertAt ? { at: alertAt, status } : null,
    checkIn:
      status === 'orange' ? { requestedAt: now, dueAt: now + SAFETY_CHECKIN_DELAY_MS } : null,
  });

  const audienceUids = Object.keys(session.audienceUids ?? {}).filter(validUid);
  const displayName =
    typeof session.displayName === 'string' && session.displayName.trim()
      ? session.displayName.trim().slice(0, 80)
      : 'Eine Person';
  const notification =
    status === 'orange'
      ? {
          kind: 'safety_unwell',
          title: `${displayName} fühlt sich unsicher`,
          body: 'Bitte behalte den Heimweg aktiv im Blick. Der Standort wird häufiger aktualisiert.',
        }
      : status === 'red'
        ? {
            kind: 'safety_emergency',
            title: `${displayName} hat einen Hilferuf gesendet`,
            body: 'Prüfe den Live-Standort und kontaktiere die Person. Rufe bei Gefahr 112.',
          }
        : {
            kind: 'safety_resolved',
            title: `${displayName} hat Entwarnung gegeben`,
            body: 'Der Heimweg wird weiterhin geteilt.',
          };

  await createNotifications(
    audienceUids.map((recipientUid) => ({
      recipientUid,
      actorUid: uid,
      safetyOwnerUid: uid,
      ...(alertAt ? { safetyAlertAt: alertAt } : {}),
      ...notification,
    })),
    { queuePush: true },
  );
  return { ok: true, changed: true };
});

exports.confirmSafetyCompanion = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireAuth(request);
  const ownerUid = request.data?.ownerUid;
  if (!validUid(ownerUid) || ownerUid === uid) {
    throw new HttpsError('invalid-argument', 'Ungültiger Heimweg.');
  }

  const now = Date.now();
  const sessionRef = getDatabase().ref(`heimwege/${ownerUid}`);
  const preflight = (await sessionRef.get()).val();
  if (!preflight || Number(preflight.expiresAt) <= now || preflight.audienceUids?.[uid] !== true) {
    throw new HttpsError('permission-denied', 'Dieser Heimweg ist nicht mehr verfügbar.');
  }
  const confirmationRef = sessionRef.child(`companions/${uid}`);
  const result = await confirmationRef.transaction((current) => {
    const confirmedAt = Number(current?.confirmedAt ?? 0);
    const unavailableAt = Number(current?.unavailableAt ?? 0);
    if (confirmedAt > now - SAFETY_CONFIRMATION_MS && confirmedAt > unavailableAt) {
      return current;
    }
    const next = { ...(current && typeof current === 'object' ? current : {}), confirmedAt: now };
    // A fresh general reachability promise must not revive an old alert
    // acknowledgement that was explicitly withdrawn. Orange/Red always need
    // their own current-alert confirmation.
    delete next.unavailableAt;
    if (unavailableAt >= Number(current?.alertAcknowledgedAt ?? 0)) {
      delete next.alertAt;
      delete next.alertAcknowledgedAt;
    }
    return next;
  });

  if (!result.committed) {
    throw new HttpsError('permission-denied', 'Dieser Heimweg ist nicht mehr verfügbar.');
  }
  // If the owner ended the session between preflight and the child
  // transaction, the write could briefly recreate only `companions/{uid}`.
  // Re-check and remove that orphan before returning.
  const postflight = (await sessionRef.get()).val();
  if (
    !postflight ||
    Number(postflight.expiresAt) <= now ||
    postflight.audienceUids?.[uid] !== true
  ) {
    await confirmationRef.remove();
    throw new HttpsError('permission-denied', 'Dieser Heimweg ist nicht mehr verfügbar.');
  }

  const newlyConfirmed = Number(result.snapshot.val()?.confirmedAt) === now;
  if (newlyConfirmed) {
    const confirmerDoc = await getFirestore().doc(`publicProfiles/${uid}`).get();
    const confirmer = profileSnapshot(uid, confirmerDoc.data());
    await createNotifications(
      [
        {
          recipientUid: ownerUid,
          actorUid: uid,
          kind: 'safety_confirmed',
          title: `${confirmer.displayName} ist erreichbar`,
          body: 'Deine Heimweg-Anfrage wurde bestätigt.',
          safetyOwnerUid: ownerUid,
        },
      ],
      { queuePush: true },
    );
  }
  return { ok: true, alreadyConfirmed: !newlyConfirmed };
});

/**
 * A companion may explicitly withdraw only their active promise to accompany
 * a walk. They remain in the owner's selected audience until the owner ends or
 * edits that audience; "not reachable" must never silently alter location
 * access in either direction.
 */
exports.withdrawSafetyCompanion = onCall(
  CALLABLE_OPTS,
  async (request) => {
    const uid = requireAuth(request);
    const ownerUid = request.data?.ownerUid;
    if (!validUid(ownerUid) || ownerUid === uid) {
      throw new HttpsError('invalid-argument', 'UngÃ¼ltiger Heimweg.');
    }

    const now = Date.now();
    const sessionRef = getDatabase().ref(`heimwege/${ownerUid}`);
    const preflight = (await sessionRef.get()).val();
    if (!preflight || Number(preflight.expiresAt) <= now || preflight.audienceUids?.[uid] !== true) {
      throw new HttpsError('permission-denied', 'Dieser Heimweg ist nicht mehr verfÃ¼gbar.');
    }

    const existing = preflight.companions?.[uid];
    const confirmedAt = Number(existing?.confirmedAt ?? 0);
    const unavailableAt = Number(existing?.unavailableAt ?? 0);
    const active = confirmedAt > now - SAFETY_CONFIRMATION_MS && confirmedAt > unavailableAt;
    if (!active) return { ok: true, alreadyUnavailable: true };

    // This is intentionally a narrow single-field Admin write. The session's
    // audience, status and location remain untouched; the postflight check
    // below covers a concurrent owner-end. A fresh later confirmation may
    // legitimately supersede this explicit withdrawal.
    const confirmationRef = sessionRef.child(`companions/${uid}`);
    await confirmationRef.update({ unavailableAt: Math.max(now, confirmedAt + 1) });

    // The session could have been explicitly deleted between preflight and the
    // transaction. Never leave an orphaned confirmation behind in that race.
    const postflight = (await sessionRef.get()).val();
    if (
      !postflight ||
      Number(postflight.expiresAt) <= now ||
      postflight.audienceUids?.[uid] !== true
    ) {
      await sessionRef.child(`companions/${uid}`).remove();
      throw new HttpsError('permission-denied', 'Dieser Heimweg ist nicht mehr verfÃ¼gbar.');
    }

    const confirmerDoc = await getFirestore().doc(`publicProfiles/${uid}`).get();
    const confirmer = profileSnapshot(uid, confirmerDoc.data());
    await createNotifications(
      [
        {
          recipientUid: ownerUid,
          actorUid: uid,
          kind: 'safety_unavailable',
          title: `${confirmer.displayName} ist gerade nicht erreichbar`,
          body: 'Die BestÃ¤tigung fÃ¼r deinen Heimweg wurde zurÃ¼ckgenommen.',
          safetyOwnerUid: ownerUid,
        },
      ],
      { queuePush: true },
    );
    return { ok: true, alreadyUnavailable: false };
  },
);

/**
 * A start-time reachability confirmation is not proof that somebody noticed a
 * later Orange/Red escalation. Acknowledgements are therefore bound to the
 * exact server-generated alert timestamp and become stale on every new alert.
 */
exports.confirmSafetyAlert = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireAuth(request);
  const ownerUid = request.data?.ownerUid;
  const alertAt = request.data?.alertAt;
  if (!validUid(ownerUid) || ownerUid === uid || !Number.isSafeInteger(alertAt) || alertAt <= 0) {
    throw new HttpsError('invalid-argument', 'Ungültiger Safety-Hinweis.');
  }

  const now = Date.now();
  const sessionRef = getDatabase().ref(`heimwege/${ownerUid}`);
  const preflight = (await sessionRef.get()).val();
  if (!preflight || Number(preflight.expiresAt) <= now) {
    throw new HttpsError('failed-precondition', 'Dieser Hinweis ist nicht mehr aktuell.');
  }
  if (preflight.audienceUids?.[uid] !== true) {
    throw new HttpsError('permission-denied', 'Dieser Hinweis ist nicht für dich bestimmt.');
  }
  if (!['orange', 'red'].includes(preflight.status) || Number(preflight.alert?.at) !== alertAt) {
    throw new HttpsError('failed-precondition', 'Dieser Hinweis ist nicht mehr aktuell.');
  }

  const confirmationRef = sessionRef.child(`companions/${uid}`);
  const result = await confirmationRef.transaction((current) => {
    if (
      Number(current?.alertAt) === alertAt &&
      Number(current?.alertAcknowledgedAt) > now - SAFETY_CONFIRMATION_MS
    ) {
      return current;
    }
    return {
      ...(current && typeof current === 'object' ? current : {}),
      confirmedAt: now,
      unavailableAt: null,
      alertAt,
      alertAcknowledgedAt: now,
    };
  });
  if (!result.committed) {
    throw new HttpsError('failed-precondition', 'Dieser Hinweis ist nicht mehr aktuell.');
  }

  const postflight = (await sessionRef.get()).val();
  if (
    !postflight ||
    Number(postflight.expiresAt) <= now ||
    postflight.audienceUids?.[uid] !== true ||
    Number(postflight.alert?.at) !== alertAt
  ) {
    await confirmationRef.transaction((current) => {
      if (!current || Number(current.alertAt) !== alertAt) return current;
      const next = { ...current };
      delete next.alertAt;
      delete next.alertAcknowledgedAt;
      return next;
    });
    throw new HttpsError('failed-precondition', 'Dieser Hinweis ist nicht mehr aktuell.');
  }

  const newlyAcknowledged = Number(result.snapshot.val()?.alertAcknowledgedAt) === now;
  if (newlyAcknowledged) {
    const confirmerDoc = await getFirestore().doc(`publicProfiles/${uid}`).get();
    const confirmer = profileSnapshot(uid, confirmerDoc.data());
    const emergency = postflight.status === 'red';
    await createNotifications(
      [
        {
          recipientUid: ownerUid,
          actorUid: uid,
          kind: 'safety_alert_seen',
          title: emergency
            ? `${confirmer.displayName} hat deinen Hilferuf gesehen`
            : `${confirmer.displayName} schaut jetzt zu`,
          body: emergency
            ? 'Die Person hat deinen aktuellen Hilferuf bestätigt.'
            : 'Die Person hat bestätigt, deinen Heimweg jetzt im Blick zu behalten.',
          safetyOwnerUid: ownerUid,
          safetyAlertAt: alertAt,
        },
      ],
      { queuePush: true },
    );
  }
  return { ok: true, alreadyAcknowledged: !newlyAcknowledged };
});

exports.endSafetySession = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireAuth(request);
  const sessionSnapshot = await getDatabase().ref(`heimwege/${uid}`).get();
  if (!sessionSnapshot.exists()) return { ok: true };
  const audience = sessionSnapshot.val()?.audienceUids ?? {};
  const writes = { [`heimwege/${uid}`]: null };
  Object.keys(audience).forEach((companionUid) => {
    if (validUid(companionUid)) writes[`heimwegeIndex/${companionUid}/${uid}`] = null;
  });
  // cleanupSafetyIndexOnSessionDeleted fires for this deletion too and repeats
  // this same index cleanup plus the "sicher angekommen" notification — doing
  // it here as well keeps this callable's own result immediate and consistent
  // instead of making callers depend on the trigger's timing.
  await getDatabase().ref().update(writes);
  return { ok: true };
});

// A deliberate owner delete ends sharing immediately without a callable cold
// start. The deleted snapshot still carries the last explicit audience,
// allowing the trusted backend to clean every server-owned fan-out entry and
// notify companions asynchronously. This trigger fires on ANY deletion of
// heimwege/{uid} — a direct client remove() (the fast "Sicher angekommen"
// path) or the endSafetySession callable — so the arrival notification below
// reaches companions no matter which path ended the session.
exports.cleanupSafetyIndexOnSessionDeleted = onValueDeleted('heimwege/{uid}', async (event) => {
  const uid = event.params.uid;
  const session = event.data.val() ?? {};
  const companionUids = Object.keys(session.audienceUids ?? {}).filter(validUid);
  const writes = {};
  companionUids.forEach((companionUid) => {
    writes[`heimwegeIndex/${companionUid}/${uid}`] = null;
  });
  if (Object.keys(writes).length) await getDatabase().ref().update(writes);
  if (!companionUids.length) return;

  // Without this, the session just vanishes for whoever was watching —
  // indistinguishable from a device failure, and the "sicher angekommen"
  // moment (the emotional payoff of the whole feature) reaches nobody.
  // Wording rule (docs/safety-mode.md): describes the person's own action.
  const displayName =
    typeof session.displayName === 'string' && session.displayName.trim()
      ? session.displayName.trim()
      : 'Deine Begleitung';
  const wasAlert = session.status === 'orange' || session.status === 'red';
  await createNotifications(
    companionUids.map((companionUid) => ({
      recipientUid: companionUid,
      actorUid: uid,
      kind: 'safety_resolved',
      title: `${displayName} ist sicher angekommen`,
      body: wasAlert
        ? 'Der Alarm ist damit beendet. Danke fürs Aufpassen.'
        : 'Der Heimweg ist beendet, der Live-Standort wurde gelöscht.',
      safetyOwnerUid: uid,
    })),
    { queuePush: true },
  ).catch((error) => console.error('[safety] arrival notification failed', error));
});

exports.ensureJourneyMember = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireVerifiedAuth(request);
  await enforceRateLimit(uid, 'journeyControl', 12, 5 * 60 * 1000);
  const activityId = request.data?.activityId;
  if (typeof activityId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(activityId)) {
    throw new HttpsError('invalid-argument', 'Ungültige Aktivitäts-ID.');
  }

  const db = getFirestore();
  const activitySnapshot = await db.doc(`activities/${activityId}`).get();
  if (!activitySnapshot.exists) {
    throw new HttpsError('not-found', 'Aktivität nicht gefunden.');
  }

  const activity = activitySnapshot.data();
  const participantUids = Array.isArray(activity.participantUids)
    ? activity.participantUids
    : (activity.participants ?? []).map((participant) => participant.uid);
  if (activity.status !== 'active' || !participantUids.includes(uid)) {
    throw new HttpsError('permission-denied', 'Du bist kein Teilnehmer dieser Aktivität.');
  }

  const expiresAt = activityExpiry(activity);
  if (expiresAt <= Date.now()) {
    throw new HttpsError('failed-precondition', 'Diese Aktivität ist bereits beendet.');
  }

  await getDatabase()
    .ref(`journeys/${activityId}`)
    .update({ expiresAt, [`members/${uid}`]: true });

  return { ok: true };
});

/**
 * Maintains a small, location-free summary on the Activity document. The map
 * already listens to that document, so it can show "N unterwegs" without a
 * location listener per marker. Per-user state stays in a server-only
 * subcollection solely to make start/stop idempotent.
 */
async function updateJourneyUnderwayStatus(activityId, uid, underway) {
  const db = getFirestore();
  const activityRef = db.doc(`activities/${activityId}`);
  const stateRef = activityRef.collection('journeyStates').doc(uid);

  return db.runTransaction(async (transaction) => {
    const [activitySnapshot, stateSnapshot] = await Promise.all([
      transaction.get(activityRef),
      transaction.get(stateRef),
    ]);
    if (!activitySnapshot.exists) {
      if (underway) throw new HttpsError('not-found', 'Aktivität nicht gefunden.');
      return false;
    }

    const activity = activitySnapshot.data();
    if (underway) {
      const participantUids = Array.isArray(activity.participantUids)
        ? activity.participantUids
        : (activity.participants ?? []).map((participant) => participant.uid);
      if (activity.status !== 'active' || !participantUids.includes(uid)) {
        throw new HttpsError('permission-denied', 'Du bist kein Teilnehmer dieser Aktivität.');
      }
      if (activityExpiry(activity) <= Date.now()) {
        throw new HttpsError('failed-precondition', 'Diese Aktivität ist bereits beendet.');
      }
    }

    const wasUnderway = stateSnapshot.exists;
    if (wasUnderway === underway) return false;

    const currentCount = Number.isInteger(activity.journeyUnderwayCount)
      ? Math.max(0, activity.journeyUnderwayCount)
      : 0;
    const nextCount = Math.max(0, currentCount + (underway ? 1 : -1));

    if (underway) {
      transaction.set(stateRef, {
        startedAt: Timestamp.now(),
        expireAt: Timestamp.fromMillis(activityExpiry(activity)),
      });
    } else {
      transaction.delete(stateRef);
    }
    transaction.update(activityRef, { journeyUnderwayCount: nextCount });
    return true;
  });
}

exports.setJourneyLiveStatus = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireVerifiedAuth(request);
  await enforceRateLimit(uid, 'journeyControl', 12, 5 * 60 * 1000);
  const activityId = request.data?.activityId;
  const underway = request.data?.underway;
  if (!validActivityId(activityId) || typeof underway !== 'boolean') {
    throw new HttpsError('invalid-argument', 'Ungültiger Anreise-Status.');
  }
  await updateJourneyUnderwayStatus(activityId, uid, underway);
  return { ok: true };
});

// Covers disconnects: `onDisconnect().remove()` removes the RTDB location
// even when the app dies before it can call the callable stop action.
exports.clearJourneyStatusOnLocationRemoved = onValueDeleted(
  'journeys/{activityId}/locations/{uid}',
  async (event) => {
    await updateJourneyUnderwayStatus(event.params.activityId, event.params.uid, false);
  },
);

exports.claimUsername = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireAuth(request);
  await enforceRateLimit(uid, 'claimUsername', 10, HOUR_MS);
  const username = request.data?.username?.trim?.().toLowerCase?.();
  if (typeof username !== 'string' || !/^[a-z0-9][a-z0-9._-]{1,29}$/.test(username)) {
    throw new HttpsError('invalid-argument', 'Der Nutzername ist ungültig.');
  }

  const db = getFirestore();
  const claimRef = db.doc(`usernames/${username}`);
  const userRef = db.doc(`users/${uid}`);
  const publicProfileRef = db.doc(`publicProfiles/${uid}`);

  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(claimRef);
    if (existing.exists && existing.data().uid !== uid) {
      throw new HttpsError('already-exists', 'Dieser Nutzername ist bereits vergeben.');
    }

    transaction.set(
      claimRef,
      { uid, createdAt: existing.exists ? existing.data().createdAt : Timestamp.now() },
      { merge: true },
    );
    transaction.set(userRef, { username }, { merge: true });
    transaction.set(publicProfileRef, { username }, { merge: true });
  });

  return { ok: true, username };
});

/** Create the only possible relationship document for a pair. The server
 * resolves usernames and profile snapshots so clients cannot forge either. */
exports.sendFriendRequest = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireVerifiedAuth(request);
  await enforceRateLimit(uid, 'friendRequests', 20, HOUR_MS);
  const username = request.data?.username?.trim?.().replace?.(/^@/, '').toLowerCase?.();
  const targetUid = request.data?.targetUid;
  const activityId = request.data?.activityId;
  const usernameTarget =
    typeof username === 'string' && /^[a-z0-9][a-z0-9._-]{1,29}$/.test(username);
  const sharedActivityTarget = validUid(targetUid) && validActivityId(activityId);
  if (!usernameTarget && !sharedActivityTarget) {
    throw new HttpsError('invalid-argument', 'Bitte gib einen gültigen Nutzernamen ein.');
  }

  const db = getFirestore();
  if (usernameTarget && sharedActivityTarget) {
    throw new HttpsError('invalid-argument', 'Wähle genau einen Weg für die Freundschaftsanfrage.');
  }
  const claimRef = usernameTarget ? db.doc(`usernames/${username}`) : null;
  let outcome;
  let recipientUid;
  await db.runTransaction(async (transaction) => {
    if (claimRef) {
      const claimSnapshot = await transaction.get(claimRef);
      if (!claimSnapshot.exists || !validUid(claimSnapshot.data().uid)) {
        throw new HttpsError('not-found', 'Dieser Nutzername wurde nicht gefunden.');
      }
      recipientUid = claimSnapshot.data().uid;
    } else {
      recipientUid = targetUid;
    }
    if (recipientUid === uid) {
      throw new HttpsError('invalid-argument', 'Du kannst dich nicht selbst hinzufügen.');
    }
    const relationshipRef = db.doc(`friendships/${friendshipId(uid, recipientUid)}`);
    const senderUserRef = db.doc(`users/${uid}`);
    const recipientUserRef = db.doc(`users/${recipientUid}`);
    const [
      relationshipSnapshot,
      senderProfileSnapshot,
      recipientProfileSnapshot,
      activitySnapshot,
    ] = await Promise.all([
      transaction.get(relationshipRef),
      transaction.get(senderUserRef),
      transaction.get(recipientUserRef),
      sharedActivityTarget
        ? transaction.get(db.doc(`activities/${activityId}`))
        : Promise.resolve(null),
    ]);
    if (!recipientProfileSnapshot.exists) {
      throw new HttpsError('not-found', 'Dieses Profil ist nicht verfügbar.');
    }
    const recipient = contactSnapshot(recipientUid, recipientProfileSnapshot.data());
    const recipientPolicy = recipientProfileSnapshot.data().friendRequestPolicy ?? 'anyone';
    if (recipientPolicy === 'nobody') {
      throw new HttpsError(
        'permission-denied',
        'Diese Person nimmt derzeit keine Freundschaftsanfragen an.',
      );
    }
    const sharedParticipants = activitySnapshot?.data()?.participantUids;
    const hasSharedActivity =
      Array.isArray(sharedParticipants) &&
      sharedParticipants.includes(uid) &&
      sharedParticipants.includes(recipientUid);
    if (sharedActivityTarget && !hasSharedActivity) {
      throw new HttpsError('permission-denied', 'Ihr seid nicht beide bei dieser Activity dabei.');
    }
    if (recipientPolicy === 'shared_activity' && !hasSharedActivity) {
      throw new HttpsError(
        'permission-denied',
        'Diese Person kann nur nach einer gemeinsamen Activity angefragt werden.',
      );
    }
    if (relationshipSnapshot.exists) {
      const relationship = relationshipSnapshot.data();
      if (relationship.status === 'accepted') {
        outcome = { state: 'already_friends', friend: recipient };
        return;
      }
      outcome = {
        state: relationship.requesterUid === uid ? 'sent' : 'incoming_request',
        friend: recipient,
      };
      return;
    }
    if (await isBlockedBetween(db, uid, recipientUid)) {
      throw new HttpsError('permission-denied', 'Diese Person ist nicht verfügbar.');
    }
    const sender = contactSnapshot(uid, senderProfileSnapshot.data());
    transaction.create(relationshipRef, {
      participantUids: [uid, recipientUid].sort(),
      requesterUid: uid,
      status: 'pending',
      profiles: [sender, recipient],
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    bumpFriendshipsVersion(transaction, [
      { ref: senderUserRef, snapshot: senderProfileSnapshot },
      { ref: recipientUserRef, snapshot: recipientProfileSnapshot },
    ]);
    outcome = { state: 'sent', friend: recipient };
  });

  if (outcome?.state === 'sent' && recipientUid) {
    void createNotifications([
      {
        recipientUid,
        actorUid: uid,
        kind: 'system',
        title: 'Neue Freundschaftsanfrage',
        body: `${outcome.friend.displayName} möchte mit dir bei Together befreundet sein.`,
      },
    ]).catch((error) => console.error('[friends] request notification failed', error));
  }
  return outcome;
});

exports.respondToFriendRequest = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireVerifiedAuth(request);
  const friendshipDocId = request.data?.friendshipId;
  const accept = request.data?.accept;
  if (
    typeof friendshipDocId !== 'string' ||
    !/^[A-Za-z0-9_-]{3,300}$/.test(friendshipDocId) ||
    typeof accept !== 'boolean'
  ) {
    throw new HttpsError('invalid-argument', 'Ungültige Freundschaftsanfrage.');
  }
  const db = getFirestore();
  const relationshipRef = db.doc(`friendships/${friendshipDocId}`);
  let requesterUid;
  let responderName = 'Ein Freund';
  await db.runTransaction(async (transaction) => {
    const responderUserRef = db.doc(`users/${uid}`);
    const [relationshipSnapshot, responderProfileSnapshot] = await Promise.all([
      transaction.get(relationshipRef),
      transaction.get(responderUserRef),
    ]);
    if (!relationshipSnapshot.exists) throw new HttpsError('not-found', 'Anfrage nicht gefunden.');
    const relationship = relationshipSnapshot.data();
    if (
      relationship.status !== 'pending' ||
      !Array.isArray(relationship.participantUids) ||
      !relationship.participantUids.includes(uid) ||
      relationship.requesterUid === uid
    ) {
      throw new HttpsError('permission-denied', 'Diese Anfrage ist nicht verfügbar.');
    }
    requesterUid = relationship.requesterUid;
    const requesterUserRef = db.doc(`users/${requesterUid}`);
    const requesterProfileSnapshot = await transaction.get(requesterUserRef);
    responderName = responderProfileSnapshot.data()?.displayName ?? responderName;
    if (accept) {
      transaction.update(relationshipRef, {
        status: 'accepted',
        profiles: [
          profileSnapshot(requesterUid, requesterProfileSnapshot.data() ?? {}),
          profileSnapshot(uid, responderProfileSnapshot.data() ?? {}),
        ],
        updatedAt: Timestamp.now(),
      });
    } else {
      transaction.delete(relationshipRef);
    }
    bumpFriendshipsVersion(transaction, [
      { ref: requesterUserRef, snapshot: requesterProfileSnapshot },
      { ref: responderUserRef, snapshot: responderProfileSnapshot },
    ]);
  });
  if (accept && requesterUid) {
    void createNotifications([
      {
        recipientUid: requesterUid,
        actorUid: uid,
        kind: 'system',
        title: 'Freundschaft bestätigt',
        body: `${responderName} ist jetzt dein Freund bei Together.`,
      },
    ]).catch((error) => console.error('[friends] acceptance notification failed', error));
  }
  return { ok: true };
});

exports.removeFriend = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireVerifiedAuth(request);
  const otherUid = request.data?.uid;
  if (!validUid(otherUid) || otherUid === uid) {
    throw new HttpsError('invalid-argument', 'Ungültiger Freund.');
  }
  const db = getFirestore();
  const relationshipRef = db.doc(`friendships/${friendshipId(uid, otherUid)}`);
  let removed = false;
  await db.runTransaction(async (transaction) => {
    const ownUserRef = db.doc(`users/${uid}`);
    const otherUserRef = db.doc(`users/${otherUid}`);
    const [relationshipSnapshot, ownUserSnapshot, otherUserSnapshot] = await Promise.all([
      transaction.get(relationshipRef),
      transaction.get(ownUserRef),
      transaction.get(otherUserRef),
    ]);
    if (!relationshipSnapshot.exists || relationshipSnapshot.data().status !== 'accepted') return;
    const relationship = relationshipSnapshot.data();
    if (
      !relationship.participantUids?.includes(uid) ||
      !relationship.participantUids?.includes(otherUid)
    ) {
      throw new HttpsError('permission-denied', 'Diese Freundschaft ist nicht verfügbar.');
    }
    transaction.delete(relationshipRef);
    bumpFriendshipsVersion(transaction, [
      { ref: ownUserRef, snapshot: ownUserSnapshot },
      { ref: otherUserRef, snapshot: otherUserSnapshot },
    ]);
    removed = true;
  });
  if (!removed) return { ok: true };

  // Stop immediate open-status visibility in both directions. Existing joined
  // activities deliberately remain available until they end.
  await clearFriendDerivedState(db, uid, otherUid);
  await revokeSafetyAccessBetween(uid, otherUid);
  return { ok: true };
});

/** Removes social shortcuts that must never outlive a direct friendship. */
async function clearFriendDerivedState(db, firstUid, secondUid) {
  const [ownPresence, otherPresence, ownUser, otherUser, ownGroups, otherGroups] = await Promise.all([
    db.doc(`presence/${firstUid}`).get(),
    db.doc(`presence/${secondUid}`).get(),
    db.doc(`users/${firstUid}`).get(),
    db.doc(`users/${secondUid}`).get(),
    getAllDocuments(
      db.collection(`users/${firstUid}/privateCircles`).where('friendUids', 'array-contains', secondUid),
    ),
    getAllDocuments(
      db.collection(`users/${secondUid}/privateCircles`).where('friendUids', 'array-contains', firstUid),
    ),
  ]);
  const cleanup = db.batch();
  let hasWrites = false;
  if (ownPresence.exists) {
    cleanup.update(ownPresence.ref, {
      audienceUids: (ownPresence.data().audienceUids ?? []).filter((item) => item !== secondUid),
    });
    hasWrites = true;
  }
  if (otherPresence.exists) {
    cleanup.update(otherPresence.ref, {
      audienceUids: (otherPresence.data().audienceUids ?? []).filter((item) => item !== firstUid),
    });
    hasWrites = true;
  }
  if (ownUser.exists) {
    cleanup.update(ownUser.ref, { closeFriendUids: FieldValue.arrayRemove(secondUid) });
    hasWrites = true;
  }
  if (otherUser.exists) {
    cleanup.update(otherUser.ref, { closeFriendUids: FieldValue.arrayRemove(firstUid) });
    hasWrites = true;
  }
  ownGroups.forEach((group) => {
    cleanup.update(group.ref, {
      friendUids: (group.data().friendUids ?? []).filter((friendUid) => friendUid !== secondUid),
    });
    hasWrites = true;
  });
  otherGroups.forEach((group) => {
    cleanup.update(group.ref, {
      friendUids: (group.data().friendUids ?? []).filter((friendUid) => friendUid !== firstUid),
    });
    hasWrites = true;
  });
  if (hasWrites) await cleanup.commit();
}

/**
 * A block is stronger than an ordinary friendship removal: neither side may
 * retain access to an existing shared Activity, its chat, or its live journey.
 * The host keeps their Activity and removes the blocked contact; in an Activity
 * hosted by the blocked contact, the blocker leaves instead. This preserves
 * everyone else's plan while severing the shared context in both directions.
 */
async function severBlockedContactSpaces(firstUid, secondUid) {
  const db = getFirestore();
  const activitySnapshots = await getAllDocuments(
    db.collection('activities').where('audienceUids', 'array-contains', firstUid),
  );
  const activityRemovals = new Map();
  const operations = [];
  const rtdbRemovals = {};

  for (const activitySnapshot of activitySnapshots) {
    const activity = activitySnapshot.data();
    const audienceUids = Array.isArray(activity.audienceUids) ? activity.audienceUids : [];
    const participantUids = Array.isArray(activity.participantUids) ? activity.participantUids : [];
    if (!audienceUids.includes(secondUid) && !participantUids.includes(secondUid)) continue;

    const removeUid = activity.hostId === firstUid ? secondUid : firstUid;
    if (!audienceUids.includes(removeUid) && !participantUids.includes(removeUid)) continue;

    const journeyStateRef = activitySnapshot.ref.collection('journeyStates').doc(removeUid);
    const journeyState = await journeyStateRef.get();
    const patch = {
      audienceUids: audienceUids.filter((item) => item !== removeUid),
      participantUids: participantUids.filter((item) => item !== removeUid),
      participants: (activity.participants ?? []).filter((participant) => participant.uid !== removeUid),
    };
    if (journeyState.exists) {
      patch.journeyUnderwayCount = Math.max(
        0,
        (Number.isInteger(activity.journeyUnderwayCount) ? activity.journeyUnderwayCount : 0) - 1,
      );
      operations.push({ type: 'delete', ref: journeyStateRef });
    }
    operations.push({ type: 'update', ref: activitySnapshot.ref, data: patch });
    activityRemovals.set(activitySnapshot.id, removeUid);
    rtdbRemovals[`journeys/${activitySnapshot.id}/members/${removeUid}`] = null;
    rtdbRemovals[`journeys/${activitySnapshot.id}/locations/${removeUid}`] = null;
  }

  const chatSnapshots = await getAllDocuments(
    db.collection('chats').where('memberIds', 'array-contains', firstUid),
  );
  chatSnapshots.forEach((chatSnapshot) => {
    const room = chatSnapshot.data();
    const memberIds = Array.isArray(room.memberIds) ? room.memberIds : [];
    if (!memberIds.includes(secondUid)) return;
    const removeUid = activityRemovals.get(chatSnapshot.id) ?? firstUid;
    if (!memberIds.includes(removeUid)) return;
    const patch = { memberIds: memberIds.filter((memberUid) => memberUid !== removeUid) };
    if (Array.isArray(room.adminUids)) {
      patch.adminUids = room.adminUids.filter((adminUid) => adminUid !== removeUid);
    }
    operations.push({ type: 'update', ref: chatSnapshot.ref, data: patch });
  });

  await Promise.all([
    operations.length ? commitDeleteOperations(db, operations) : Promise.resolve(),
    Object.keys(rtdbRemovals).length ? getDatabase().ref().update(rtdbRemovals) : Promise.resolve(),
  ]);
}

exports.setFriendRequestPolicy = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireVerifiedAuth(request);
  const policy = request.data?.policy;
  if (!['anyone', 'shared_activity', 'nobody'].includes(policy)) {
    throw new HttpsError('invalid-argument', 'Ungültige Einstellung.');
  }
  const userRef = getFirestore().doc(`users/${uid}`);
  const snapshot = await userRef.get();
  if (!snapshot.exists) {
    throw new HttpsError('failed-precondition', 'Dein Profil ist noch nicht bereit.');
  }
  await userRef.update({
    profileVisibility: 'friends',
    friendRequestPolicy: policy,
  });
  return { ok: true };
});

exports.setJourneyRemindersEnabled = onCall(
  CALLABLE_OPTS,
  async (request) => {
    const uid = requireVerifiedAuth(request);
    const enabled = request.data?.enabled;
    if (typeof enabled !== 'boolean') {
      throw new HttpsError('invalid-argument', 'Ungültige Einstellung.');
    }
    const userRef = getFirestore().doc(`users/${uid}`);
    const snapshot = await userRef.get();
    if (!snapshot.exists) {
      throw new HttpsError('failed-precondition', 'Dein Profil ist noch nicht bereit.');
    }
    await userRef.update({ journeyRemindersEnabled: enabled });
    return { ok: true };
  },
);

exports.setCloseFriend = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireVerifiedAuth(request);
  const otherUid = request.data?.uid;
  const isClose = request.data?.isClose;
  if (!validUid(otherUid) || otherUid === uid || typeof isClose !== 'boolean') {
    throw new HttpsError('invalid-argument', 'Ungültiger Freund.');
  }
  const db = getFirestore();
  const userRef = db.doc(`users/${uid}`);
  const [relationship, userSnapshot] = await Promise.all([
    db.doc(`friendships/${friendshipId(uid, otherUid)}`).get(),
    userRef.get(),
  ]);
  if (!relationship.exists || relationship.data().status !== 'accepted') {
    throw new HttpsError('failed-precondition', 'Diese Person ist kein bestätigter Freund.');
  }
  if (!userSnapshot.exists)
    throw new HttpsError('failed-precondition', 'Dein Profil ist noch nicht bereit.');
  await userRef.update({
    closeFriendUids: isClose ? FieldValue.arrayUnion(otherUid) : FieldValue.arrayRemove(otherUid),
  });
  return { ok: true };
});

/** Private Circle membership is server-checked even though Circle documents
 * themselves are owner-only. That keeps "only confirmed friends" an invariant
 * rather than merely a UI convention. */
exports.setPrivateCircleFriends = onCall(
  CALLABLE_OPTS,
  async (request) => {
    const uid = requireVerifiedAuth(request);
    const circleId = request.data?.circleId;
    const friendUids = Array.isArray(request.data?.friendUids)
      ? [...new Set(request.data.friendUids)]
      : [];
    if (
      typeof circleId !== 'string' ||
      !/^[A-Za-z0-9_-]{1,100}$/.test(circleId) ||
      friendUids.length > 50 ||
      friendUids.some((friendUid) => !validUid(friendUid) || friendUid === uid)
    ) {
      throw new HttpsError('invalid-argument', 'Ungültige Circle-Mitglieder.');
    }
    const db = getFirestore();
    const [circleSnapshot, friends] = await Promise.all([
      db.doc(`users/${uid}/privateCircles/${circleId}`).get(),
      directFriendUids(db, uid),
    ]);
    if (!circleSnapshot.exists) throw new HttpsError('not-found', 'Circle nicht gefunden.');
    if (friendUids.some((friendUid) => !friends.has(friendUid))) {
      throw new HttpsError('permission-denied', 'Circles dürfen nur bestätigte Freunde enthalten.');
    }
    await circleSnapshot.ref.update({ friendUids, updatedAt: Timestamp.now() });
    return { ok: true };
  },
);

// Shared Circles were replaced by private per-user friend lists (see
// docs/backend-plan.md). These three callables stay only so an old client
// still gets a clear, explicit error instead of a missing-function crash.
exports.inviteToCircle = onCall(CALLABLE_OPTS, async (request) => {
  requireAuth(request);
  throw new HttpsError(
    'failed-precondition',
    'Geteilte Circles wurden durch private Freundeslisten ersetzt.',
  );
});

exports.removeFromCircle = onCall(CALLABLE_OPTS, async (request) => {
  requireAuth(request);
  throw new HttpsError(
    'failed-precondition',
    'Geteilte Circles wurden durch private Freundeslisten ersetzt.',
  );
});

exports.respondToCircleInvite = onCall(CALLABLE_OPTS, async (request) => {
  requireAuth(request);
  throw new HttpsError(
    'failed-precondition',
    'Geteilte Circles wurden durch private Freundeslisten ersetzt.',
  );
});

exports.blockUser = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireAuth(request);
  await enforceRateLimit(uid, 'blocks', 10, HOUR_MS);
  const targetUid = request.data?.targetUid;
  if (
    typeof targetUid !== 'string' ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(targetUid) ||
    targetUid === uid
  ) {
    throw new HttpsError('invalid-argument', 'Ungültiger Nutzer.');
  }
  const db = getFirestore();
  const relationshipRef = db.doc(`friendships/${friendshipId(uid, targetUid)}`);
  await db.runTransaction(async (transaction) => {
    const ownUserRef = db.doc(`users/${uid}`);
    const targetUserRef = db.doc(`users/${targetUid}`);
    const [relationship, ownUserSnapshot, targetUserSnapshot] = await Promise.all([
      transaction.get(relationshipRef),
      transaction.get(ownUserRef),
      transaction.get(targetUserRef),
    ]);
    transaction.set(db.doc(`blocks/${uid}_${targetUid}`), {
      blockerUid: uid,
      blockedUid: targetUid,
      createdAt: Timestamp.now(),
    });
    if (relationship.exists) {
      transaction.delete(relationshipRef);
      bumpFriendshipsVersion(transaction, [
        { ref: ownUserRef, snapshot: ownUserSnapshot },
        { ref: targetUserRef, snapshot: targetUserSnapshot },
      ]);
    }
  });
  await Promise.all([
    clearFriendDerivedState(db, uid, targetUid),
    severBlockedContactSpaces(uid, targetUid),
    revokeSafetyAccessBetween(uid, targetUid),
  ]);
  return { ok: true };
});

exports.unblockUser = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireAuth(request);
  const targetUid = request.data?.targetUid;
  if (typeof targetUid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(targetUid)) {
    throw new HttpsError('invalid-argument', 'Ungültiger Nutzer.');
  }
  await getFirestore().doc(`blocks/${uid}_${targetUid}`).delete();
  return { ok: true };
});

exports.reportUser = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireAuth(request);
  await enforceRateLimit(uid, 'reports', 10, DAY_MS);
  const targetUid = request.data?.targetUid;
  const reason = request.data?.reason;
  const reasons = new Set(['harassment', 'spam', 'unsafe', 'inappropriate', 'other']);
  if (
    typeof targetUid !== 'string' ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(targetUid) ||
    targetUid === uid ||
    typeof reason !== 'string' ||
    !reasons.has(reason)
  ) {
    throw new HttpsError('invalid-argument', 'Ungültige Meldung.');
  }
  const day = Math.floor(Date.now() / DAY_MS);
  await getFirestore().doc(`reports/${uid}_${targetUid}_${day}`).set({
    reporterUid: uid,
    targetUid,
    reason,
    createdAt: Timestamp.now(),
    status: 'open',
  });
  return { ok: true };
});

exports.registerPushToken = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireVerifiedAuth(request);
  const token = request.data?.token;
  if (typeof token !== 'string' || token.length < 10 || token.length > 512) {
    throw new HttpsError('invalid-argument', 'Ungültiger Push-Token.');
  }
  const userRef = getFirestore().doc(`users/${uid}`);
  // The Admin SDK bypasses firestore.rules' own 10-token cap on this field —
  // this transaction enforces the same limit server-side instead of relying
  // on an unbounded arrayUnion.
  await getFirestore().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(userRef);
    const existing = Array.isArray(snapshot.data()?.pushTokens) ? snapshot.data().pushTokens : [];
    if (existing.includes(token)) return;
    transaction.set(userRef, { pushTokens: [...existing, token].slice(-10) }, { merge: true });
  });
  return { ok: true };
});

exports.unregisterPushToken = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireVerifiedAuth(request);
  const token = request.data?.token;
  if (typeof token !== 'string' || token.length < 10 || token.length > 512) {
    throw new HttpsError('invalid-argument', 'Ungültiger Push-Token.');
  }
  await getFirestore()
    .doc(`users/${uid}`)
    .set({ pushTokens: FieldValue.arrayRemove(token) }, { merge: true });
  return { ok: true };
});

async function commitDeleteOperations(db, operations) {
  const CHUNK_SIZE = 450;
  for (let index = 0; index < operations.length; index += CHUNK_SIZE) {
    const batch = db.batch();
    operations.slice(index, index + CHUNK_SIZE).forEach((operation) => {
      if (operation.type === 'delete') batch.delete(operation.ref);
      else batch.update(operation.ref, operation.data);
    });
    await batch.commit();
  }
}

async function getAllDocuments(query, pageSize = 200) {
  const documents = [];
  let lastDocument = null;
  while (true) {
    const page = await (
      lastDocument ? query.startAfter(lastDocument).limit(pageSize) : query.limit(pageSize)
    ).get();
    documents.push(...page.docs);
    if (page.size < pageSize) return documents;
    lastDocument = page.docs[page.docs.length - 1];
  }
}

async function collectAccountMessageDeletes(chats, socialMatches, uid) {
  const chatOperations = await Promise.all(
    chats.map(async (snapshot) => {
      const room = snapshot.data();
      const remainingMembers = (room.memberIds ?? []).filter((memberUid) => memberUid !== uid);
      const messageQuery = remainingMembers.length
        ? snapshot.ref.collection('messages').where('authorId', '==', uid)
        : snapshot.ref.collection('messages');
      const messages = await messageQuery.get();
      return messages.docs.map((message) => ({ type: 'delete', ref: message.ref }));
    }),
  );
  const matchOperations = await Promise.all(
    socialMatches.map(async (snapshot) => {
      const messages = await snapshot.ref.collection('messages').get();
      return messages.docs.map((message) => ({ type: 'delete', ref: message.ref }));
    }),
  );
  return [...chatOperations.flat(), ...matchOperations.flat()];
}

exports.deleteMyAccount = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireAuth(request);
  const db = getFirestore();
  const operations = [];
  const [
    userSnapshot,
    circles,
    hostedActivities,
    joinedActivities,
    notifications,
    ownBlocks,
    blockedByOthers,
    chats,
    invitesIn,
    invitesOut,
    socialInterestsFrom,
    socialInterestsTo,
    socialMatches,
    friendships,
    ownPrivateCircles,
    privateCirclesContainingMe,
  ] = await Promise.all([
    db.doc(`users/${uid}`).get(),
    getAllDocuments(db.collection('circles').where('memberIds', 'array-contains', uid)),
    getAllDocuments(db.collection('activities').where('hostId', '==', uid)),
    getAllDocuments(db.collection('activities').where('participantUids', 'array-contains', uid)),
    getAllDocuments(db.collection('notifications').where('recipientUid', '==', uid)),
    getAllDocuments(db.collection('blocks').where('blockerUid', '==', uid)),
    getAllDocuments(db.collection('blocks').where('blockedUid', '==', uid)),
    getAllDocuments(db.collection('chats').where('memberIds', 'array-contains', uid)),
    getAllDocuments(db.collection('circleInvites').where('inviteeUid', '==', uid)),
    getAllDocuments(db.collection('circleInvites').where('inviterUid', '==', uid)),
    getAllDocuments(db.collection('socialInterests').where('fromUid', '==', uid)),
    getAllDocuments(db.collection('socialInterests').where('targetUid', '==', uid)),
    getAllDocuments(db.collection('socialMatches').where('memberUids', 'array-contains', uid)),
    getAllDocuments(db.collection('friendships').where('participantUids', 'array-contains', uid)),
    getAllDocuments(db.collection(`users/${uid}/privateCircles`)),
    getAllDocuments(
      db.collectionGroup('privateCircles').where('friendUids', 'array-contains', uid),
    ),
  ]);
  const accountMessageDeletes = await collectAccountMessageDeletes(chats, socialMatches, uid);
  operations.push(...accountMessageDeletes);

  circles.forEach((snapshot) => {
    const circle = snapshot.data();
    if (circle.ownerId === uid) operations.push({ type: 'delete', ref: snapshot.ref });
    else {
      operations.push({
        type: 'update',
        ref: snapshot.ref,
        data: {
          memberIds: (circle.memberIds ?? []).filter((memberId) => memberId !== uid),
          members: (circle.members ?? []).filter((member) => member.uid !== uid),
        },
      });
    }
  });
  // Private Circle lists are owner-only. Delete my own lists and remove me
  // from any other owner's saved shortcut list before the profile disappears.
  ownPrivateCircles.forEach((snapshot) => operations.push({ type: 'delete', ref: snapshot.ref }));
  privateCirclesContainingMe.forEach((snapshot) => {
    const ownerUid = snapshot.ref.parent.parent?.id;
    if (ownerUid === uid) return;
    operations.push({
      type: 'update',
      ref: snapshot.ref,
      data: {
        friendUids: (snapshot.data().friendUids ?? []).filter((friendUid) => friendUid !== uid),
      },
    });
  });
  friendships.forEach((snapshot) => {
    const otherUid = (snapshot.data().participantUids ?? []).find((participantUid) => participantUid !== uid);
    operations.push({ type: 'delete', ref: snapshot.ref });
    // The current account is deleted below. Only surviving friends need a
    // revision bump so their local cache cannot retain this account.
    if (validUid(otherUid)) {
      operations.push({
        type: 'update',
        ref: db.doc(`users/${otherUid}`),
        data: { friendshipsVersion: FieldValue.increment(1) },
      });
    }
  });

  const hostedIds = new Set(hostedActivities.map((snapshot) => snapshot.id));
  hostedActivities.forEach((snapshot) => operations.push({ type: 'delete', ref: snapshot.ref }));
  joinedActivities.forEach((snapshot) => {
    if (hostedIds.has(snapshot.id)) return;
    const activity = snapshot.data();
    operations.push({
      type: 'update',
      ref: snapshot.ref,
      data: {
        participantUids: (activity.participantUids ?? []).filter(
          (participantUid) => participantUid !== uid,
        ),
        participants: (activity.participants ?? []).filter(
          (participant) => participant.uid !== uid,
        ),
      },
    });
  });
  [
    notifications,
    ownBlocks,
    blockedByOthers,
    invitesIn,
    invitesOut,
    socialInterestsFrom,
    socialInterestsTo,
  ].forEach((querySnapshot) => {
    querySnapshot.forEach((snapshot) => operations.push({ type: 'delete', ref: snapshot.ref }));
  });
  chats.forEach((snapshot) => {
    const room = snapshot.data();
    const memberIds = (room.memberIds ?? []).filter((memberUid) => memberUid !== uid);
    if (memberIds.length === 0) operations.push({ type: 'delete', ref: snapshot.ref });
    else operations.push({ type: 'update', ref: snapshot.ref, data: { memberIds } });
  });
  socialMatches.forEach((snapshot) => operations.push({ type: 'delete', ref: snapshot.ref }));
  operations.push(
    { type: 'delete', ref: db.doc(`users/${uid}`) },
    { type: 'delete', ref: db.doc(`publicProfiles/${uid}`) },
    { type: 'delete', ref: db.doc(`presence/${uid}`) },
    { type: 'delete', ref: db.doc(`socialSessions/${uid}`) },
  );
  const username = userSnapshot.data()?.username;
  if (typeof username === 'string')
    operations.push({ type: 'delete', ref: db.doc(`usernames/${username}`) });

  await commitDeleteOperations(db, operations);
  const safetySession = (await getDatabase().ref(`heimwege/${uid}`).get()).val();
  const rtdbRemovals = {
    [`heimwege/${uid}`]: null,
    [`heimwegeIndex/${uid}`]: null,
  };
  Object.keys(safetySession?.audienceUids ?? {}).forEach((companionUid) => {
    if (validUid(companionUid)) {
      rtdbRemovals[`heimwegeIndex/${companionUid}/${uid}`] = null;
    }
  });
  // Live Anreise state already expires on its own short TTL, but an explicit
  // account deletion should not leave the deleted uid's last-known position
  // readable to remaining participants for that window either.
  new Set([...hostedActivities, ...joinedActivities].map((snapshot) => snapshot.id)).forEach(
    (activityId) => {
      rtdbRemovals[`journeys/${activityId}/members/${uid}`] = null;
      rtdbRemovals[`journeys/${activityId}/locations/${uid}`] = null;
    },
  );
  await getDatabase().ref().update(rtdbRemovals);
  await getAdminAuth().deleteUser(uid);
  return { ok: true };
});

exports.onActivityUpdate = onDocumentUpdated('activities/{activityId}', async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after) return;

  const activityId = event.params.activityId;
  const beforeParticipants = Array.isArray(before.participantUids) ? before.participantUids : [];
  const afterParticipants = Array.isArray(after.participantUids) ? after.participantUids : [];
  const added = afterParticipants.filter((uid) => !beforeParticipants.includes(uid));
  const hostId = after.hostId;
  const notifications = [];

  added.forEach((participantUid) => {
    const participant = (after.participants ?? []).find((item) => item.uid === participantUid);
    notifications.push({
      recipientUid: hostId,
      actorUid: participantUid,
      kind: 'activity_joined',
      title: 'Jemand ist dabei',
      body: `${participant?.displayName ?? 'Ein Freund'} ist deiner Activity beigetreten.`,
      activityId,
    });
  });

  if (before.status === 'active' && after.status === 'cancelled') {
    afterParticipants
      .filter((recipientUid) => recipientUid !== hostId)
      .forEach((recipientUid) => {
        notifications.push({
          recipientUid,
          actorUid: hostId,
          kind: 'activity_cancelled',
          title: 'Activity abgesagt',
          body: `„${after.title ?? 'Activity'}“ wurde abgesagt.`,
          activityId,
        });
      });
  }

  await createNotifications(notifications).catch((error) =>
    console.error('[notifications] activity update failed', error),
  );
});

function socialSessionFromData(uid, data) {
  return {
    radiusKm: data.radiusKm,
    expiresAt: data.expiresAt?.toMillis?.() ?? Date.now(),
    note: data.note ?? '',
    vibes: Array.isArray(data.vibes) ? data.vibes : [],
  };
}

function validateSocialSession(input) {
  const radiusKm = Number(input?.radiusKm);
  const expiresAt = Number(input?.expiresAt);
  const note = typeof input?.note === 'string' ? input.note.trim() : '';
  const vibes = Array.isArray(input?.vibes)
    ? input.vibes.filter((vibe) => typeof vibe === 'string').slice(0, 8)
    : [];
  if (![1, 3, 5].includes(radiusKm) || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw new HttpsError('invalid-argument', 'Ungültige Sichtbarkeitseinstellungen.');
  }
  if (expiresAt > Date.now() + 24 * 60 * 60 * 1000 || note.length > 280) {
    throw new HttpsError('invalid-argument', 'Die Sichtbarkeit oder der Text ist zu lang.');
  }
  return { radiusKm, expiresAt, note, vibes };
}

function socialMatchId(firstUid, secondUid) {
  return [firstUid, secondUid].sort().join('_');
}

async function requireSocialMatch(db, uid, targetUid) {
  const matchSnapshot = await db.doc(`socialMatches/${socialMatchId(uid, targetUid)}`).get();
  if (!matchSnapshot.exists || !matchSnapshot.data().memberUids?.includes(uid)) {
    throw new HttpsError('permission-denied', 'Dieser Chat ist noch nicht freigeschaltet.');
  }
  return matchSnapshot;
}

function requireSocializeEnabled() {
  if (!SOCIALIZE_ENABLED) {
    throw new HttpsError('failed-precondition', 'Socialize ist noch nicht verfügbar.');
  }
}

async function isBlockedBetween(db, firstUid, secondUid) {
  const [forward, reverse] = await Promise.all([
    db.doc(`blocks/${firstUid}_${secondUid}`).get(),
    db.doc(`blocks/${secondUid}_${firstUid}`).get(),
  ]);
  return forward.exists || reverse.exists;
}

/** Two bounded queries per <=30 recipients, instead of two document reads for
 * every selected person. Safety start is rare, but its privacy check is not optional. */
async function isBlockedBetweenAny(db, uid, targetUids) {
  for (let offset = 0; offset < targetUids.length; offset += 30) {
    const chunk = targetUids.slice(offset, offset + 30);
    const [outgoing, incoming] = await Promise.all([
      db
        .collection('blocks')
        .where('blockerUid', '==', uid)
        .where('blockedUid', 'in', chunk)
        .limit(1)
        .get(),
      db
        .collection('blocks')
        .where('blockedUid', '==', uid)
        .where('blockerUid', 'in', chunk)
        .limit(1)
        .get(),
    ]);
    if (!outgoing.empty || !incoming.empty) return true;
  }
  return false;
}

exports.startSocialSession = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireVerifiedAuth(request);
  requireSocializeEnabled();
  const session = validateSocialSession(request.data?.session);
  const db = getFirestore();
  const profile = (await db.doc(`publicProfiles/${uid}`).get()).data() ?? {};
  const displayName = cleanString(
    profile.displayName ?? request.auth.token.name ?? 'Together-Freund',
    50,
    'Name',
    true,
  );
  const initials = cleanString(
    profile.initials ?? displayName.slice(0, 2).toUpperCase(),
    8,
    'Initialen',
    true,
  );
  await db.doc(`socialSessions/${uid}`).set({
    uid,
    displayName,
    initials,
    radiusKm: session.radiusKm,
    expiresAt: Timestamp.fromMillis(session.expiresAt),
    note: session.note,
    vibes: session.vibes,
    updatedAt: Timestamp.now(),
  });
  return { session };
});

exports.updateSocialSession = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireVerifiedAuth(request);
  requireSocializeEnabled();
  const session = validateSocialSession(request.data?.session);
  const db = getFirestore();
  await db.doc(`socialSessions/${uid}`).update({
    radiusKm: session.radiusKm,
    expiresAt: Timestamp.fromMillis(session.expiresAt),
    note: session.note,
    vibes: session.vibes,
    updatedAt: Timestamp.now(),
  });
  return { session };
});

exports.stopSocialSession = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireVerifiedAuth(request);
  requireSocializeEnabled();
  await getFirestore().doc(`socialSessions/${uid}`).delete();
  return { ok: true };
});

exports.discoverSocial = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireAuth(request);
  requireSocializeEnabled();
  await enforceRateLimit(uid, 'discoverSocial', 30, 60 * 1000);
  const db = getFirestore();
  const [sessionSnapshot, matchesSnapshot, blockedByMe, blockedMe] = await Promise.all([
    db.collection('socialSessions').where('expiresAt', '>', Timestamp.now()).limit(50).get(),
    db.collection('socialMatches').where('memberUids', 'array-contains', uid).limit(50).get(),
    db.collection('blocks').where('blockerUid', '==', uid).limit(100).get(),
    db.collection('blocks').where('blockedUid', '==', uid).limit(100).get(),
  ]);
  const blockedUids = new Set();
  blockedByMe.forEach((snapshot) => blockedUids.add(snapshot.data().blockedUid));
  blockedMe.forEach((snapshot) => blockedUids.add(snapshot.data().blockerUid));
  const matchedUids = new Set();
  matchesSnapshot.forEach((match) => {
    (match.data().memberUids ?? []).forEach((memberUid) => {
      if (memberUid !== uid) matchedUids.add(memberUid);
    });
  });
  const cards = sessionSnapshot.docs
    .filter((snapshot) => snapshot.id !== uid && !blockedUids.has(snapshot.id))
    .map((snapshot) => {
      const data = snapshot.data();
      const matched = matchedUids.has(snapshot.id);
      return {
        id: snapshot.id,
        kind: 'person',
        displayName: matched ? (data.displayName ?? 'Together-Freund') : 'Person in deiner Nähe',
        initials: matched ? (data.initials ?? 'TN') : 'TN',
        distanceLabel: 'in deiner Nähe',
        note: data.note ?? '',
        vibes: (data.vibes ?? []).map((label) => ({ label })),
      };
    });
  return { cards };
});

exports.showSocialInterest = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireVerifiedAuth(request);
  requireSocializeEnabled();
  await enforceRateLimit(uid, 'socialInterests', 30, HOUR_MS);
  const targetUid = request.data?.targetId;
  if (typeof targetUid !== 'string' || targetUid === uid) {
    throw new HttpsError('invalid-argument', 'Ungültiges Ziel.');
  }
  const db = getFirestore();
  const target = await db.doc(`socialSessions/${targetUid}`).get();
  if (!target.exists || target.data().expiresAt.toMillis() <= Date.now()) {
    throw new HttpsError('failed-precondition', 'Diese Sichtbarkeit ist nicht mehr aktiv.');
  }
  if (await isBlockedBetween(db, uid, targetUid)) {
    throw new HttpsError('permission-denied', 'Diese Person ist nicht verfügbar.');
  }
  await db.doc(`socialInterests/${uid}_${targetUid}`).set({
    fromUid: uid,
    targetUid,
    createdAt: Timestamp.now(),
  });
  const reverse = await db.doc(`socialInterests/${targetUid}_${uid}`).get();
  if (!reverse.exists) return { state: 'interested' };
  await db.doc(`socialMatches/${socialMatchId(uid, targetUid)}`).set({
    memberUids: [uid, targetUid],
    createdAt: Timestamp.now(),
  });
  return { state: 'matched' };
});

exports.getSocialMessages = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireAuth(request);
  requireSocializeEnabled();
  const targetUid = request.data?.targetId;
  if (typeof targetUid !== 'string') throw new HttpsError('invalid-argument', 'Ungültiges Ziel.');
  const db = getFirestore();
  await requireSocialMatch(db, uid, targetUid);
  if (await isBlockedBetween(db, uid, targetUid)) {
    throw new HttpsError('permission-denied', 'Dieser Chat ist nicht mehr verfügbar.');
  }
  const snapshot = await db
    .collection(`socialMatches/${socialMatchId(uid, targetUid)}/messages`)
    .orderBy('createdAt', 'asc')
    .limit(50)
    .get();
  return {
    messages: snapshot.docs.map((message) => {
      const data = message.data();
      return {
        id: message.id,
        fromMe: data.authorId === uid,
        text: data.text,
        at: data.createdAt?.toMillis?.() ?? Date.now(),
      };
    }),
  };
});

exports.sendSocialMessage = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireVerifiedAuth(request);
  requireSocializeEnabled();
  await enforceRateLimit(uid, 'socialMessages', 30, CHAT_RATE_WINDOW_MS);
  const targetUid = request.data?.targetId;
  const text = typeof request.data?.text === 'string' ? request.data.text.trim() : '';
  if (typeof targetUid !== 'string' || !text || text.length > 500) {
    throw new HttpsError('invalid-argument', 'Die Nachricht ist leer oder zu lang.');
  }
  const db = getFirestore();
  await requireSocialMatch(db, uid, targetUid);
  if (await isBlockedBetween(db, uid, targetUid)) {
    throw new HttpsError('permission-denied', 'Dieser Chat ist nicht mehr verfügbar.');
  }
  const profile = (await db.doc(`publicProfiles/${uid}`).get()).data() ?? {};
  const displayName = cleanString(profile.displayName ?? 'Freund', 50, 'Name', true);
  const initials = cleanString(profile.initials ?? 'FR', 8, 'Initialen', true);
  const messageRef = db.collection(`socialMatches/${socialMatchId(uid, targetUid)}/messages`).doc();
  const createdAt = Timestamp.now();
  await messageRef.set({ authorId: uid, displayName, initials, text, createdAt });
  return {
    message: { id: messageRef.id, fromMe: true, text, at: createdAt.toMillis() },
  };
});

exports.cleanupJourneys = onSchedule('every 15 minutes', async () => {
  const root = getDatabase().ref('journeys');
  const snapshot = await root.orderByChild('expiresAt').endAt(Date.now()).limitToFirst(100).get();
  if (snapshot.exists()) {
    const removals = {};
    const activityIds = [];
    snapshot.forEach((child) => {
      removals[child.key] = null;
      activityIds.push(child.key);
      return false;
    });
    await root.update(removals);

    // The RTDB deletion trigger normally removes the private idempotency states.
    // Resetting the compact summary here is a bounded fallback for expiry cleanup.
    const db = getFirestore();
    await Promise.all(
      activityIds.map(async (activityId) => {
        const activityRef = db.doc(`activities/${activityId}`);
        const [activitySnapshot, statesSnapshot] = await Promise.all([
          activityRef.get(),
          activityRef.collection('journeyStates').limit(50).get(),
        ]);
        if (!activitySnapshot.exists) return;
        const batch = db.batch();
        batch.update(activityRef, { journeyUnderwayCount: 0 });
        statesSnapshot.docs.forEach((state) => batch.delete(state.ref));
        await batch.commit();
      }),
    );
  }

  // Reuse the same scheduler invocation for Safety timeout notification and
  // retention cleanup instead of adding another paid timer. Client timers
  // switch the UI exactly at expiresAt; this backend pass reaches locked
  // companion devices and later removes the retained last point.
  const safetyRoot = getDatabase().ref('heimwege');
  const safetyTimeoutSnapshot = await safetyRoot
    .orderByChild('expiresAt')
    .endAt(Date.now())
    .limitToFirst(100)
    .get();
  if (safetyTimeoutSnapshot.exists()) {
    const timeoutNotifications = [];
    const timeoutMarkers = {};
    safetyTimeoutSnapshot.forEach((child) => {
      const session = child.val() ?? {};
      if (session.timeoutNotifiedAt) return false;
      const displayName = cleanString(session.displayName ?? 'Eine Person', 80, 'Name', true);
      Object.keys(session.audienceUids ?? {}).forEach((recipientUid) => {
        if (!validUid(recipientUid)) return;
        timeoutNotifications.push({
          recipientUid,
          actorUid: child.key,
          safetyOwnerUid: child.key,
          kind: 'safety_timed_out',
          title: `${displayName}s Heimweg wurde automatisch beendet`,
          body: 'Die Ankunft wurde nicht bestätigt. Der letzte bekannte Standort bleibt vorübergehend sichtbar.',
        });
      });
      timeoutMarkers[`heimwege/${child.key}/timeoutNotifiedAt`] = Date.now();
      return false;
    });
    await createNotifications(timeoutNotifications, { queuePush: true });
    if (Object.keys(timeoutMarkers).length) await getDatabase().ref().update(timeoutMarkers);
  }

  const safetySnapshot = await safetyRoot
    .orderByChild('retainUntil')
    .endAt(Date.now())
    .limitToFirst(100)
    .get();
  if (!safetySnapshot.exists()) return;
  const safetyRemovals = {};
  safetySnapshot.forEach((child) => {
    safetyRemovals[`heimwege/${child.key}`] = null;
    Object.keys(child.val()?.audienceUids ?? {}).forEach((companionUid) => {
      if (validUid(companionUid)) {
        safetyRemovals[`heimwegeIndex/${companionUid}/${child.key}`] = null;
      }
    });
    return false;
  });
  await getDatabase().ref().update(safetyRemovals);
});

/**
 * One calm, activity-specific reminder. The document flag makes overlapping
 * scheduler windows idempotent, so a user never receives duplicate nudges.
 */
/** Local wall-clock label for the reminder copy (German market → Europe/Berlin). */
function formatBerlinClock(startsAt) {
  const ms = startsAt ? Date.parse(startsAt) : NaN;
  if (!Number.isFinite(ms)) return null;
  try {
    return new Intl.DateTimeFormat('de-DE', {
      timeZone: 'Europe/Berlin',
      hour: '2-digit',
      minute: '2-digit',
    }).format(ms);
  } catch {
    return null;
  }
}

/** One batched read of the recipients' user docs → those who opted out of the
 * Anreise reminder (journeyRemindersEnabled === false) are dropped. Absent = on. */
async function filterJourneyReminderRecipients(db, recipientUids, settingsCache = new Map()) {
  const uids = [...new Set(recipientUids.filter((uid) => validUid(uid)))];
  if (uids.length === 0) return [];
  const snapshots = await Promise.all(
    uids.map((uid) => {
      if (!settingsCache.has(uid)) settingsCache.set(uid, db.doc(`users/${uid}`).get());
      return settingsCache.get(uid);
    }),
  );
  const optedOut = new Set(
    snapshots
      .filter((snap) => snap.exists && snap.data().journeyRemindersEnabled === false)
      .map((snap) => snap.id),
  );
  return uids.filter((uid) => !optedOut.has(uid));
}

exports.sendJourneyReminders = onSchedule({ schedule: 'every 10 minutes', maxInstances: 1 }, async () => {
  const now = Date.now();
  const earliestStart = new Date(
    now + JOURNEY_REMINDER_LEAD_MS - JOURNEY_REMINDER_LOOKBACK_MS,
  ).toISOString();
  const latestStart = new Date(
    now + JOURNEY_REMINDER_LEAD_MS + JOURNEY_REMINDER_LOOKBACK_MS,
  ).toISOString();
  const db = getFirestore();
  const snapshot = await db
    .collection('activities')
    .where('status', '==', 'active')
    .where('startsAt', '>=', earliestStart)
    .where('startsAt', '<=', latestStart)
    .orderBy('startsAt', 'asc')
    .limit(100)
    .get();
  const notifications = [];
  const reminderSettingsCache = new Map();

  for (const activitySnapshot of snapshot.docs) {
    const activity = activitySnapshot.data();
    const journey = journeyNotificationPayload(activitySnapshot.id, activity);
    // An automatic arrival check needs a real map destination. Do not consume
    // the one-per-activity reminder flag for activities without one.
    if (!journey) continue;
    const recipients = await db.runTransaction(async (transaction) => {
      const current = await transaction.get(activitySnapshot.ref);
      if (!current.exists) return [];
      const activity = current.data();
      if (activity.status !== 'active' || activity.journeyReminderSentAt) return [];
      transaction.update(activitySnapshot.ref, { journeyReminderSentAt: Timestamp.now() });
      return Array.isArray(activity.participantUids) ? activity.participantUids : [];
    });
    const title = activity.title ?? 'Deine Activity';
    const startLabel = formatBerlinClock(activity.startsAt);
    // Only those who left the reminder ON. The reminder OFFERS; the actual
    // location release stays a per-activity confirmation (docs/safety-mode.md).
    const eligible = await filterJourneyReminderRecipients(db, recipients, reminderSettingsCache);
    eligible.forEach((recipientUid) => {
      notifications.push({
        recipientUid,
        kind: 'journey_reminder',
        title: startLabel ? `${title} beginnt um ${startLabel}` : `${title} beginnt bald`,
        body: 'Anreise teilen? Zum Aktivieren tippen.',
        activityId: activitySnapshot.id,
        journey,
      });
    });
  }

  await createNotifications(notifications);
});
