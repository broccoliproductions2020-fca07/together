const { initializeApp, getApp } = require('firebase-admin/app');
const { getAuth: getAdminAuth } = require('firebase-admin/auth');
const { getDatabase } = require('firebase-admin/database');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { getFunctions } = require('firebase-admin/functions');
const { getStorage } = require('firebase-admin/storage');
const { createHash, randomUUID } = require('node:crypto');
const { setGlobalOptions } = require('firebase-functions/v2/options');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const {
  onDocumentCreated,
  onDocumentUpdated,
  onDocumentWritten,
} = require('firebase-functions/v2/firestore');
const { onValueDeleted, onValueWritten } = require('firebase-functions/v2/database');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onTaskDispatched } = require('firebase-functions/v2/tasks');
const { defineSecret } = require('firebase-functions/params');
const { cleanupExpiredSurfaces } = require('./cleanup-expired-surfaces');
const { buildFriendSearchFields, parseFriendSearchQuery, resultScore } = require('./friend-search');

// Every function runs next to its data. Firestore and Storage live in
// europe-west3, so leaving the default (us-central1) would send each callable
// across the Atlantic twice — once for the request, then again for every
// Firestore read the function performs. Set before the first deploy on
// purpose: changing a function's region later means deleting and recreating
// it, with a gap where clients call an endpoint that no longer exists.
const FUNCTIONS_REGION = 'europe-west3';
setGlobalOptions({ region: FUNCTIONS_REGION });

// Firebase CLI gives demo projects the legacy `demo-together` RTDB namespace,
// while the app intentionally uses `demo-together-default-rtdb`. Pin the local
// Admin SDK to the same namespace; real projects keep Firebase's injected URL
// unless FIREBASE_DATABASE_URL explicitly overrides it.
const databaseURL =
  process.env.FIREBASE_DATABASE_URL ??
  (process.env.GCLOUD_PROJECT === 'demo-together'
    ? 'https://demo-together-default-rtdb.firebaseio.com'
    : undefined);
let firebaseConfig = {};
try {
  firebaseConfig = process.env.FIREBASE_CONFIG ? JSON.parse(process.env.FIREBASE_CONFIG) : {};
} catch {
  firebaseConfig = {};
}
const storageBucket = process.env.FIREBASE_STORAGE_BUCKET ?? firebaseConfig.storageBucket;
const appConfig = {
  ...firebaseConfig,
  ...(databaseURL ? { databaseURL } : {}),
  ...(storageBucket ? { storageBucket } : {}),
};
initializeApp(Object.keys(appConfig).length ? appConfig : undefined);

const DAY_MS = 24 * 60 * 60 * 1000;
const PROFILE_DISPLAY_NAME_CHANGES_PER_DAY = 3;
const PROFILE_AVATAR_CHANGES_PER_DAY = 5;
const PROFILE_DISPLAY_NAME_COOLDOWN_MS = 10 * 60 * 1000;
const PROFILE_AVATAR_MAX_BYTES = 1024 * 1024;
const PROFILE_AVATAR_PENDING_MS = 2 * 60 * 1000;
const GROUP_RETENTION_MS = 30 * DAY_MS;
const GROUP_CHAT_MAX_MEMBERS = 25;
// A targeted invitation may sit unanswered for a while — people plan ahead —
// but it must not outlive the plan it belongs to.
const GROUP_CHAT_INVITE_TTL_MS = 7 * DAY_MS;
// A wink is intentionally fleeting. It is an invitation to decide now, not a
// second social inbox that can quietly turn into pressure or stale plans.
const SPONTANEOUS_ROUND_DURATION_MS = 30 * 60 * 1000;
const SPONTANEOUS_ROUND_MAX_INVITEES = 20;
const JOURNEY_BUFFER_MS = 30 * 60 * 1000;
const JOURNEY_HARD_MAX_MS = 2 * 60 * 60 * 1000;
const JOURNEY_REMINDER_LEAD_MS = 60 * 60 * 1000;
const JOURNEY_REMINDER_LOOKBACK_MS = 15 * 60 * 1000;
const SAFETY_DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;
const SAFETY_EXTENSION_MS = 60 * 60 * 1000;
const SAFETY_EXTENSION_WINDOW_MS = 15 * 60 * 1000;
const SAFETY_MAX_TOTAL_MS = 12 * 60 * 60 * 1000;
const SAFETY_BLUE_RETENTION_MS = 3 * 60 * 1000;
const SAFETY_ALERT_RETENTION_MS = 30 * 60 * 1000;
const SAFETY_CONFIRMATION_MS = 30 * 60 * 1000;
const SAFETY_MAX_COMPANIONS = 25;
const SAFETY_CHECKIN_DELAY_MS = 90 * 1000;
const SAFETY_AUTO_EXTEND_MS = 20 * 60 * 1000;
const SAFETY_AUTO_EXTEND_MAX = 2;
// One scheduler period plus slack, so every session is seen at least once
// while still inside its final minutes ("every 5 minutes" cadence).
const SAFETY_AUTO_EXTEND_LOOKAHEAD_MS = 6 * 60 * 1000;
const RUNNING_FUNCTIONS_EMULATOR = process.env.FUNCTIONS_EMULATOR === 'true';
// Cloud deployments fail closed: App Check and verified e-mail are required
// unless this is the local Emulator Suite. Explicit true keeps the dedicated
// emulator gate tests available without weakening the cloud default.
const ENFORCE_APP_CHECK =
  !RUNNING_FUNCTIONS_EMULATOR || process.env.FUNCTIONS_ENFORCE_APP_CHECK === 'true';
// Production-only release gate, same shape as ENFORCE_APP_CHECK. Off for the
// local Emulator Suite: anonymous dev/test accounts have no email at all and
// would otherwise be locked out of every gated action. Guest sign-in itself
// stays blocked against real cloud Firebase (see firebaseAuthService.ts), so
// in a real deployment every caller has gone through email/password sign-up.
const ENFORCE_EMAIL_VERIFICATION =
  !RUNNING_FUNCTIONS_EMULATOR || process.env.FUNCTIONS_ENFORCE_EMAIL_VERIFICATION === 'true';
// Shared callable options: the App Check gate plus a conservative instance
// ceiling, so a traffic spike or scripted abuse burst is throttled
// (RESOURCE_EXHAUSTED) instead of scaling billing unbounded. Tune per-function
// once real load data exists.
// `invoker: 'public'` is the Cloud Run IAM binding, NOT an app-level permission.
// v2 callables run on Cloud Run, which rejects any caller lacking run.invoker
// before the function body executes — the client then sees a bare
// "unauthenticated" with nothing in the function logs but a 401. The CLI
// normally sets this during deploy, but a deploy that fails mid-build and is
// later only *updated* never re-applies it, which is exactly what happened
// here. Setting it explicitly makes the binding part of the source of truth.
// Real authorization is unchanged and still enforced inside every handler:
// requireAuth / requireVerifiedAuth, App Check, and the Firestore rules.
const CALLABLE_OPTS = {
  enforceAppCheck: ENFORCE_APP_CHECK,
  invoker: 'public',
  maxInstances: 20,
  concurrency: 20,
};
// This is deliberately a Secret Manager reference, not a client configuration
// value. It is injected only into the server-side Places callable below.
const GOOGLE_PLACES_API_KEY = defineSecret('GOOGLE_PLACES_API_KEY');
// Places is the only callable that performs a paid external request. Its work
// is overwhelmingly I/O (one guarded request to Google), not CPU-bound. Use
// the smaller gen-1 CPU profile and serve one request at a time. It scales to
// zero between requests, so Places has no reserved monthly CPU baseline.
const PLACES_CALLABLE_OPTS = {
  ...CALLABLE_OPTS,
  maxInstances: 5,
  cpu: 'gcf_gen1',
  concurrency: 1,
  minInstances: 0,
  secrets: [GOOGLE_PLACES_API_KEY],
};
const EVENT_TRIGGER_OPTS = { maxInstances: 10, concurrency: 10 };
// Realtime Database lives in europe-west1 — Frankfurt is not offered for RTDB.
// A v2 database trigger must be created in its DATABASE's region, not the
// global one, so the europe-west3 default is rejected outright ("cannot create
// a trigger in region europe-west3"). Emulators ignore regions entirely, so
// this only ever surfaces on a real deploy. Applies to the onValue* triggers
// only; every other function stays next to Firestore in europe-west3.
const RTDB_TRIGGER_OPTS = { ...EVENT_TRIGGER_OPTS, region: 'europe-west1' };
const PUSH_OUTBOX_TRIGGER_OPTS = {
  ...EVENT_TRIGGER_OPTS,
  maxInstances: 5,
  timeoutSeconds: 30,
};
const SERIAL_SCHEDULE_OPTS = { maxInstances: 1, concurrency: 1 };
const CHAT_RATE_WINDOW_MS = 60 * 1000;
const CHAT_MESSAGES_PER_WINDOW = 30;
// A person cannot physically type two distinct messages this quickly. It blocks
// double-taps and simple scripts without changing normal chat behaviour.
const CHAT_MIN_MESSAGE_INTERVAL_MS = 400;
const CHAT_DUPLICATE_WINDOW_MS = 30 * 1000;
const CHAT_MAX_IDENTICAL_MESSAGES_PER_WINDOW = 3;
const PLACE_SEARCHES_PER_USER_PER_DAY = 24;
// Google bills Autocomplete and Place Details Essentials as separate SKUs with
// 10,000 free requests each per billing month. The project-wide limits leave a
// 10% buffer and make a faulty client fail closed rather than create overage.
const PLACE_API_CALLS_PER_PROJECT_PER_WEEK = 1_800;
const PLACE_API_CALLS_PER_PROJECT_PER_MONTH = 9_000;
const PACIFIC_TIME_ZONE = 'America/Los_Angeles';
// A chat room is also a single Firestore summary document. Keeping the room
// below this burst rate prevents a large group from turning that document into
// a hot, costly fan-out point. Per-user limits still apply independently.
const CHAT_ROOM_MESSAGES_PER_WINDOW = 60;
// The open thread still receives every message immediately. Only the closed
// room-list summary is coalesced, which avoids one Firestore fan-out per message
// during a burst while keeping previews/unread counts fresh within a few seconds.
const CHAT_SUMMARY_COALESCE_SECONDS = 5;
const CHAT_SUMMARY_TASK_OPTS = {
  maxInstances: 2,
  concurrency: 10,
  timeoutSeconds: 15,
  retryConfig: {
    maxAttempts: 5,
    minBackoffSeconds: 5,
    maxBackoffSeconds: 60,
    maxDoublings: 3,
  },
  rateLimits: { maxConcurrentDispatches: 20, maxDispatchesPerSecond: 20 },
};
const JOURNEY_REMINDER_TASK_OPTS = {
  maxInstances: 5,
  concurrency: 10,
  timeoutSeconds: 60,
  retryConfig: {
    maxAttempts: 8,
    minBackoffSeconds: 30,
    maxBackoffSeconds: 15 * 60,
    maxDoublings: 5,
  },
  rateLimits: { maxConcurrentDispatches: 20, maxDispatchesPerSecond: 20 },
};
const SAFETY_AUTO_EXTEND_TASK_OPTS = {
  maxInstances: 5,
  concurrency: 10,
  timeoutSeconds: 30,
  retryConfig: {
    maxAttempts: 8,
    minBackoffSeconds: 30,
    maxBackoffSeconds: 15 * 60,
    maxDoublings: 5,
  },
  rateLimits: { maxConcurrentDispatches: 20, maxDispatchesPerSecond: 20 },
};
// A room summary already tells clients that newer messages exist. Coalescing
// chat pushes prevents an active group from fanning one message out to every
// device while retaining a prompt first notification.
const CHAT_PUSH_COOLDOWN_MS = 60 * 1000;
const PUSH_OUTBOX_MAX_ATTEMPTS = 5;
const EXPO_PUSH_TOKEN_RE = /^(?:Expo|Exponent)PushToken\[[A-Za-z0-9_-]{10,512}\]$/;
const MAX_PRIVATE_CIRCLES = 30;
const MAX_ACTIVE_ACTIVITIES_PER_HOST = 20;
const MAX_ACTIVE_ACTIVITIES_PER_PARTICIPANT = 50;
const MAX_ACTIVE_GROUP_CHATS_PER_CREATOR = 30;
const ACTIVITY_RETENTION_MS = 30 * DAY_MS;
const NOTIFICATION_RETENTION_MS = 30 * DAY_MS;
const INVITE_RETENTION_MS = 30 * DAY_MS;
// Time plans are pre-activities. They never become map objects before a host
// deliberately locks one time; expiry keeps abandoned availability private.
const TIME_PLAN_MAX_WINDOWS = 50;
const TIME_PLAN_MAX_MEMBERS = 50;
const TIME_PLAN_CREATIONS_PER_HOUR = 8;
const TIME_PLAN_MAX_AHEAD_MS = 180 * DAY_MS;
const TIME_PLAN_RETENTION_MS = 14 * DAY_MS;
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
    ...(item.actorUid ? { actorUid: item.actorUid } : {}),
    kind: item.kind,
    title: item.title.slice(0, 100),
    body: item.body.slice(0, 500),
    ...(item.activityId ? { activityId: item.activityId } : {}),
    ...(item.roomId ? { roomId: item.roomId } : {}),
    ...(item.timePlanId ? { timePlanId: item.timePlanId } : {}),
    ...(Number.isSafeInteger(item.messageCount) ? { messageCount: item.messageCount } : {}),
    ...(item.safetyOwnerUid ? { safetyOwnerUid: item.safetyOwnerUid } : {}),
    ...(Number.isFinite(item.safetyAlertAt) ? { safetyAlertAt: item.safetyAlertAt } : {}),
    ...(item.journey ? { journey: item.journey } : {}),
  };
}

/** Wall-clock label for notification copy (German market → Europe/Berlin).
 * A push must never make the reader work out which day "19:30" means. */
function formatGermanDateTime(ms) {
  if (!Number.isFinite(ms)) return '';
  try {
    return new Intl.DateTimeFormat('de-DE', {
      timeZone: 'Europe/Berlin',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(ms);
  } catch {
    return '';
  }
}

async function createNotifications(items, { queuePush = true } = {}) {
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
        ...(item.timePlanId ? { timePlanId: item.timePlanId } : {}),
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
  }
}

async function queuePushOnly(items) {
  const validItems = items.filter(
    (item) => item.recipientUid && item.recipientUid !== item.actorUid,
  );
  if (!validItems.length) return;
  const db = getFirestore();
  const expireAt = Timestamp.fromMillis(Date.now() + NOTIFICATION_RETENTION_MS);
  for (let index = 0; index < validItems.length; index += 100) {
    const chunk = validItems.slice(index, index + 100);
    await db
      .collection('pushOutbox')
      .doc()
      .set({
        items: chunk.map(pushOutboxItem),
        createdAt: Timestamp.now(),
        expireAt,
      });
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

function deterministicTaskId(prefix, ...parts) {
  const digest = createHash('sha256').update(parts.join('\u0000')).digest('hex');
  return `${prefix}-${digest}`;
}

function taskQueue(functionName) {
  const projectId =
    process.env.GCLOUD_PROJECT ??
    firebaseConfig.projectId ??
    (RUNNING_FUNCTIONS_EMULATOR ? 'demo-together' : null);
  if (!projectId) throw new Error('Cloud Tasks braucht eine Firebase-Projekt-ID.');
  return getFunctions().taskQueue(
    `projects/${projectId}/locations/${FUNCTIONS_REGION}/functions/${functionName}`,
  );
}

function taskAlreadyExists(error) {
  return (
    error?.code === 'task-already-exists' ||
    error?.code === 'functions/task-already-exists' ||
    error?.code === 'ALREADY_EXISTS' ||
    error?.code === 6
  );
}

function taskScheduleTime(dueAt) {
  return new Date(Math.max(dueAt, Date.now() + 5_000));
}

function journeyReminderTaskInput(activityId, activity) {
  const generation = activity?.journeyReminderGeneration;
  const startsAtMs = Date.parse(activity?.startsAt ?? '');
  if (
    typeof generation !== 'string' ||
    !generation ||
    activity?.status !== 'active' ||
    activity?.mode === 'now' ||
    !Number.isFinite(startsAtMs) ||
    !journeyNotificationPayload(activityId, activity)
  ) {
    return null;
  }
  return {
    generation,
    scheduleAt: startsAtMs - JOURNEY_REMINDER_LEAD_MS,
  };
}

async function enqueueJourneyReminderTask(activityId, activity) {
  const input = journeyReminderTaskInput(activityId, activity);
  if (!input) return;
  const id = deterministicTaskId('journey-reminder', activityId, input.generation);
  try {
    await taskQueue('dispatchJourneyReminder').enqueue(
      { activityId, generation: input.generation },
      { id, scheduleTime: taskScheduleTime(input.scheduleAt) },
    );
  } catch (error) {
    if (taskAlreadyExists(error)) return;
    throw error;
  }
}

async function enqueueSafetyAutoExtendTask(uid, expiresAt) {
  if (!validUid(uid) || !Number.isFinite(expiresAt)) return;
  const id = deterministicTaskId('safety-auto-extend', uid, String(expiresAt));
  try {
    await taskQueue('dispatchSafetyAutoExtend').enqueue(
      { uid, expiresAt },
      {
        id,
        scheduleTime: taskScheduleTime(expiresAt - SAFETY_AUTO_EXTEND_LOOKAHEAD_MS),
      },
    );
  } catch (error) {
    if (taskAlreadyExists(error)) return;
    throw error;
  }
}

async function enforceRateLimit(
  uid,
  key,
  max,
  windowMs,
  message = 'Zu viele Anfragen. Bitte kurz warten.',
) {
  const db = getFirestore();
  const ref = db.doc(`rateLimits/${uid}_${key}`);
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.exists ? snapshot.data() : {};
    const count = data.windowStart === windowStart ? (data.count ?? 0) : 0;
    if (count >= max) {
      throw new HttpsError('resource-exhausted', message);
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

function berlinDayKey(now = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(now));
}

/** Search has two server-side caps in one transaction. They are intentionally
 * separate from request creation: looking somebody up must never create social
 * pressure or make an unbounded directory query possible. */
async function enforceFriendSearchRateLimit(uid) {
  const db = getFirestore();
  const minuteRef = db.doc(`rateLimits/${uid}_friendSearchMinute`);
  const dailyRef = db.doc(`rateLimits/${uid}_friendSearchDaily`);
  const now = Date.now();
  const minuteStart = Math.floor(now / 60_000) * 60_000;
  const day = berlinDayKey(now);
  await db.runTransaction(async (transaction) => {
    const [minuteSnapshot, dailySnapshot] = await Promise.all([
      transaction.get(minuteRef),
      transaction.get(dailyRef),
    ]);
    const minuteCount =
      minuteSnapshot.data()?.windowStart === minuteStart ? (minuteSnapshot.data()?.count ?? 0) : 0;
    const dailyCount = dailySnapshot.data()?.day === day ? (dailySnapshot.data()?.count ?? 0) : 0;
    if (minuteCount >= 10) {
      throw new HttpsError('resource-exhausted', 'Du kannst höchstens zehnmal pro Minute suchen.');
    }
    if (dailyCount >= 50) {
      throw new HttpsError(
        'resource-exhausted',
        'Du hast heute bereits 50 Personen gesucht. Bitte probiere es morgen wieder.',
      );
    }
    transaction.set(
      minuteRef,
      {
        windowStart: minuteStart,
        count: minuteCount + 1,
        expireAt: Timestamp.fromMillis(minuteStart + 2 * HOUR_MS),
      },
      { merge: true },
    );
    transaction.set(
      dailyRef,
      {
        day,
        count: dailyCount + 1,
        expireAt: Timestamp.fromMillis(now + 2 * DAY_MS),
      },
      { merge: true },
    );
  });
}

function pacificDateParts(now = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PACIFIC_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(now));
  const valueFor = (type) => parts.find((part) => part.type === type)?.value;
  const year = Number(valueFor('year'));
  const month = Number(valueFor('month'));
  const day = Number(valueFor('day'));
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new HttpsError('internal', 'Das Ortskontingent konnte nicht bestimmt werden.');
  }
  return { year, month, day };
}

function placesQuotaPeriods(now = Date.now()) {
  const { year, month, day } = pacificDateParts(now);
  const pacificDayAsUtc = Date.UTC(year, month - 1, day);
  const weekday = new Date(pacificDayAsUtc).getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;
  const weekStart = new Date(pacificDayAsUtc - daysSinceMonday * DAY_MS);
  const weekYear = weekStart.getUTCFullYear();
  const weekMonth = String(weekStart.getUTCMonth() + 1).padStart(2, '0');
  const weekDay = String(weekStart.getUTCDate()).padStart(2, '0');
  return {
    monthKey: `${year}-${String(month).padStart(2, '0')}`,
    weekKey: `${weekYear}-${weekMonth}-${weekDay}`,
  };
}

/**
 * Project-wide circuit breaker for the two Google Places SKUs we use. This is
 * intentionally separate from the per-account limiter: it still protects the
 * billing account if many valid accounts misbehave simultaneously.
 */
async function enforcePlacesProjectQuota(sku) {
  const db = getFirestore();
  const now = Date.now();
  const { weekKey, monthKey } = placesQuotaPeriods(now);
  const weekRef = db.doc(`rateLimits/project_places_${sku}_week_${weekKey}`);
  const monthRef = db.doc(`rateLimits/project_places_${sku}_month_${monthKey}`);

  await db.runTransaction(async (transaction) => {
    const [weekSnapshot, monthSnapshot] = await Promise.all([
      transaction.get(weekRef),
      transaction.get(monthRef),
    ]);
    const weekCount = weekSnapshot.exists ? Number(weekSnapshot.data().count ?? 0) : 0;
    const monthCount = monthSnapshot.exists ? Number(monthSnapshot.data().count ?? 0) : 0;

    if (monthCount >= PLACE_API_CALLS_PER_PROJECT_PER_MONTH) {
      throw new HttpsError(
        'resource-exhausted',
        'Das monatliche Sicherheitskontingent für Ortssuchen ist erreicht. Bitte versuche es nächsten Monat erneut oder tippe einen Ort direkt auf der Karte an.',
      );
    }
    if (weekCount >= PLACE_API_CALLS_PER_PROJECT_PER_WEEK) {
      throw new HttpsError(
        'resource-exhausted',
        'Das wöchentliche Sicherheitskontingent für Ortssuchen ist erreicht. Bitte versuche es nächste Woche erneut oder tippe einen Ort direkt auf der Karte an.',
      );
    }

    transaction.set(
      weekRef,
      {
        scope: 'project',
        product: 'places',
        sku,
        period: 'week',
        periodKey: weekKey,
        count: weekCount + 1,
        expireAt: Timestamp.fromMillis(now + 21 * DAY_MS),
      },
      { merge: true },
    );
    transaction.set(
      monthRef,
      {
        scope: 'project',
        product: 'places',
        sku,
        period: 'month',
        periodKey: monthKey,
        count: monthCount + 1,
        expireAt: Timestamp.fromMillis(now + 62 * DAY_MS),
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
          recipientUid: snapshot.id,
          token,
          message: {
            to: token,
            sound: 'default',
            title: item.title,
            body: item.body,
            data: {
              activityId: item.activityId,
              roomId: item.roomId,
              timePlanId: item.timePlanId,
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
          },
        });
      }
    });
  });
  if (!messages.length) return;
  const staleTokensByUid = new Map();
  for (let index = 0; index < messages.length; index += 100) {
    const chunk = messages.slice(index, index + 100);
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chunk.map((entry) => entry.message)),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`Expo Push returned ${response.status}`);
    const result = await response.json().catch(() => null);
    const tickets = Array.isArray(result?.data) ? result.data : [];
    tickets.forEach((ticket, ticketIndex) => {
      if (ticket?.status !== 'error' || ticket?.details?.error !== 'DeviceNotRegistered') return;
      const entry = chunk[ticketIndex];
      if (!entry) return;
      const tokens = staleTokensByUid.get(entry.recipientUid) ?? new Set();
      tokens.add(entry.token);
      staleTokensByUid.set(entry.recipientUid, tokens);
    });
  }
  await Promise.all(
    [...staleTokensByUid.entries()].map(([uid, tokens]) =>
      getFirestore()
        .doc(`users/${uid}`)
        .update({ pushTokens: FieldValue.arrayRemove(...tokens) })
        .catch((error) => console.error('[push] stale token cleanup failed', error)),
    ),
  );
}

function pushOutboxErrorMessage(error) {
  return error instanceof Error ? error.message.slice(0, 280) : 'Unbekannter Push-Fehler';
}

/**
 * Reliable asynchronous push delivery for latency-sensitive Safety paths.
 * The Firestore event is retried until Expo accepts the batch; the outbox doc
 * is deleted only after success. External delivery is at-least-once by nature.
 */
exports.deliverPushOutbox = onDocumentCreated(
  { document: 'pushOutbox/{outboxId}', retry: true, ...PUSH_OUTBOX_TRIGGER_OPTS },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;
    const current = await snapshot.ref.get();
    if (!current.exists) return;
    const data = current.data() ?? {};
    const items = data.items;
    if (!Array.isArray(items) || !items.length) {
      await current.ref.delete();
      return;
    }
    // The job remains until Expo accepts it. Retry is deliberately
    // at-least-once: if delivery succeeds but deleting the job fails, a later
    // retry can duplicate a push but cannot silently discard it.
    const attempts = Number.isSafeInteger(data.attempts) ? data.attempts : 0;
    if (attempts >= PUSH_OUTBOX_MAX_ATTEMPTS) {
      console.error('[push] discarding permanently failed outbox job', current.id);
      await current.ref.delete();
      return;
    }
    try {
      await deliverPush(items);
      await current.ref.delete();
    } catch (error) {
      await current.ref.set(
        {
          attempts: attempts + 1,
          lastError: pushOutboxErrorMessage(error),
        },
        { merge: true },
      );
      throw error;
    }
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

function profileInitials(displayName) {
  return displayName
    .split(/\s+/)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function validProfileText(value, maxLength) {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text.length > 0 && text.length <= maxLength ? text : undefined;
}

function missingProfileFields(profile, displayName, initials, createdAt, includeUserDefaults) {
  const patch = {};
  if (!validProfileText(profile?.displayName, 50)) patch.displayName = displayName;
  if (!validProfileText(profile?.initials, 8)) patch.initials = initials;
  if (!timestampMillis(profile?.createdAt)) patch.createdAt = createdAt;
  if (includeUserDefaults) {
    if (profile?.profileVisibility !== 'friends') patch.profileVisibility = 'friends';
    if (!['anyone', 'shared_activity', 'nobody'].includes(profile?.friendRequestPolicy)) {
      patch.friendRequestPolicy = 'anyone';
    }
  }
  return patch;
}

function timestampMillis(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const millis = value?.toMillis?.();
  return Number.isFinite(millis) ? millis : NaN;
}

function profileChangeHistory(data, field, now) {
  return (Array.isArray(data?.[field]) ? data[field] : [])
    .map(timestampMillis)
    .filter(
      (changedAt) => Number.isFinite(changedAt) && changedAt > now - DAY_MS && changedAt <= now,
    )
    .sort((left, right) => left - right);
}

function profileChangeLimitError(label, retryAt, now) {
  const remainingMinutes = Math.max(1, Math.ceil((retryAt - now) / 60_000));
  const retryLabel = new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(retryAt));
  const message =
    remainingMinutes <= 60
      ? `Bitte warte noch ${remainingMinutes} ${remainingMinutes === 1 ? 'Minute' : 'Minuten'}, bevor du „${label}“ erneut änderst.`
      : `„${label}“ kannst du am ${retryLabel} Uhr wieder ändern.`;
  throw new HttpsError('resource-exhausted', message, { retryAt, field: label });
}

function nextProfileChangeHistory(data, field, maxChanges, cooldownMs, label, now) {
  const history = profileChangeHistory(data, field, now);
  const retryAt = Math.max(
    history.length >= maxChanges ? history[0] + DAY_MS : 0,
    cooldownMs > 0 && history.length ? history[history.length - 1] + cooldownMs : 0,
  );
  if (retryAt > now) profileChangeLimitError(label, retryAt, now);
  return [...history, now];
}

function parseAvatarBase64(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length % 4 !== 0) {
    throw new HttpsError('invalid-argument', 'Das Profilbild ist ungültig.');
  }
  if (
    value.length > Math.ceil((PROFILE_AVATAR_MAX_BYTES * 4) / 3) + 4 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value)
  ) {
    throw new HttpsError('invalid-argument', 'Das Profilbild ist zu groß.');
  }
  const bytes = Buffer.from(value, 'base64');
  const isJpeg =
    bytes.length >= 4 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[bytes.length - 2] === 0xff &&
    bytes[bytes.length - 1] === 0xd9;
  if (!isJpeg || bytes.length > PROFILE_AVATAR_MAX_BYTES) {
    throw new HttpsError(
      'invalid-argument',
      'Das Profilbild muss ein JPEG mit höchstens 1 MB sein.',
    );
  }
  return bytes;
}

function profileAvatarPath(uid, avatarId) {
  return `avatars/${uid}/${avatarId}.jpg`;
}

function profileAvatarUrl(bucketName, objectPath, token) {
  const host = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
  const baseUrl = host ? `http://${host}` : 'https://firebasestorage.googleapis.com';
  return `${baseUrl}/v0/b/${bucketName}/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`;
}

function managedAvatarPath(url, uid) {
  if (typeof url !== 'string') return null;
  const match = url.match(/\/o\/([^?]+)/);
  if (!match) return null;
  let path;
  try {
    path = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  return path === `avatars/${uid}.jpg` ||
    new RegExp(`^avatars/${uid}/[a-f0-9]{32}\\.jpg$`).test(path)
    ? path
    : null;
}

function profileRateState(data, now) {
  const pendingUntil = timestampMillis(data?.avatarPendingUntil);
  return {
    displayNameChanges: profileChangeHistory(data, 'displayNameChanges', now),
    avatarChanges: profileChangeHistory(data, 'avatarChanges', now),
    pendingAvatarId:
      typeof data?.pendingAvatarId === 'string' &&
      Number.isFinite(pendingUntil) &&
      pendingUntil > now
        ? data.pendingAvatarId
        : null,
  };
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
  const displayName = cleanString(profile?.displayName ?? 'Como-Freund', 50, 'Name', true);
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

/** Presence has a hard audience cap of 50. Resolve only accepted friendships
 * for a first open, rather than loading pending requests or an unrelated 200
 * document friendship page. */
async function directPresenceAudienceUids(db, uid) {
  const snapshot = await db
    .collection('friendships')
    .where('participantUids', 'array-contains', uid)
    .where('status', '==', 'accepted')
    .limit(50)
    .get();
  const friends = new Set();
  snapshot.forEach((relationship) => {
    (relationship.data().participantUids ?? []).forEach((participantUid) => {
      if (participantUid !== uid && typeof participantUid === 'string') friends.add(participantUid);
    });
  });
  return friends;
}

/** Audience cap, mirroring the 201-incl-host limit the invite path enforces. */
const MAX_SELECTED_AUDIENCE = 200;

/**
 * Activities are published to a context the SERVER can re-derive, never to a
 * recipient list the client is simply trusted on.
 *
 * `selection` widens what a context may be — an explicit set of people — without
 * widening what it may REACH: `audienceForContext` intersects it with the
 * caller's confirmed friendships, so the strongest thing a tampered client can
 * do is address a subset of the friends it could already have reached with
 * `all_friends`. Never resolve a selection without that intersection.
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
  if (input.kind === 'selection') {
    if (!Array.isArray(input.uids)) {
      throw new HttpsError('invalid-argument', 'Ungültiger Sichtbarkeitsraum.');
    }
    const uids = [...new Set(input.uids)];
    if (uids.some((candidate) => !validUid(candidate))) {
      throw new HttpsError('invalid-argument', 'Ungültige Personenauswahl.');
    }
    // Empty is rejected here rather than after the friendship filter: an empty
    // list is a client bug, while an empty RESULT can legitimately happen when a
    // friendship ends between opening the composer and publishing.
    if (uids.length === 0) {
      throw new HttpsError('invalid-argument', 'Wähle mindestens eine Person aus.');
    }
    if (uids.length > MAX_SELECTED_AUDIENCE) {
      throw new HttpsError('invalid-argument', 'Zu viele Personen ausgewählt.');
    }
    return { kind: 'selection', uids };
  }
  throw new HttpsError('invalid-argument', 'Ungültiger Sichtbarkeitsraum.');
}

async function audienceForContext(db, uid, context, friends) {
  if (context.kind === 'all_friends') return [...friends];

  if (context.kind === 'selection') {
    return context.uids.filter((friendUid) => friends.has(friendUid));
  }

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

function parseActivityPlace(input, { nullable = false } = {}) {
  if (input === null && nullable) return null;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpsError('invalid-argument', 'Ungültiger Ort.');
  }
  const allowedKeys = new Set(['label', 'latitude', 'longitude', 'visibility']);
  if (Object.keys(input).some((key) => !allowedKeys.has(key))) {
    throw new HttpsError('invalid-argument', 'Ungültige Ortsdaten.');
  }

  const label = cleanString(input.label, 200, 'Ort', true);
  const visibility = input.visibility;
  if (visibility !== 'pin' && visibility !== 'none') {
    throw new HttpsError('invalid-argument', 'Ungültige Ortsfreigabe.');
  }

  const hasLatitude = input.latitude != null;
  const hasLongitude = input.longitude != null;
  if (hasLatitude !== hasLongitude) {
    throw new HttpsError('invalid-argument', 'Koordinaten müssen vollständig sein.');
  }
  if (
    hasLatitude &&
    (typeof input.latitude !== 'number' ||
      input.latitude < -90 ||
      input.latitude > 90 ||
      typeof input.longitude !== 'number' ||
      input.longitude < -180 ||
      input.longitude > 180)
  ) {
    throw new HttpsError('invalid-argument', 'Ungültige Koordinaten.');
  }
  if (visibility === 'pin' && !hasLatitude) {
    throw new HttpsError('invalid-argument', 'Ein Karten-Pin braucht Koordinaten.');
  }
  if (visibility === 'none' && hasLatitude) {
    throw new HttpsError(
      'invalid-argument',
      'Ohne Standort dürfen keine Koordinaten gespeichert werden.',
    );
  }

  return {
    label,
    visibility,
    ...(hasLatitude ? { latitude: input.latitude, longitude: input.longitude } : {}),
  };
}

function sameActivityPlace(left, right) {
  if (!left || !right) return !left && !right;
  return (
    left.label === right.label &&
    left.visibility === right.visibility &&
    left.latitude === right.latitude &&
    left.longitude === right.longitude
  );
}

function validTimePlanWindowId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);
}

function parseTimePlanWindows(input) {
  if (!Array.isArray(input) || input.length < 1 || input.length > TIME_PLAN_MAX_WINDOWS) {
    throw new HttpsError(
      'invalid-argument',
      'Lege mindestens ein und höchstens 50 Zeitfenster fest.',
    );
  }
  const now = Date.now();
  const ids = new Set();
  return input
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new HttpsError('invalid-argument', 'Ungültiges Zeitfenster.');
      }
      if (Object.keys(item).some((key) => !['id', 'groupId', 'startsAt', 'endsAt'].includes(key))) {
        throw new HttpsError('invalid-argument', 'Ungültige Zeitfensterdaten.');
      }
      if (
        !validTimePlanWindowId(item.id) ||
        !validTimePlanWindowId(item.groupId) ||
        ids.has(item.id)
      ) {
        throw new HttpsError('invalid-argument', 'Ungültige Zeitfenster-ID.');
      }
      ids.add(item.id);
      const startsAt = cleanString(item.startsAt, 80, 'Startzeit', true);
      const endsAt = cleanString(item.endsAt, 80, 'Endzeit', true);
      const startMs = Date.parse(startsAt);
      const endMs = Date.parse(endsAt);
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
        throw new HttpsError(
          'invalid-argument',
          'Jedes Zeitfenster braucht einen gültigen Anfang und ein Ende.',
        );
      }
      if (startMs < now - 5 * 60 * 1000 || startMs > now + TIME_PLAN_MAX_AHEAD_MS) {
        throw new HttpsError(
          'failed-precondition',
          'Ein Zeitfenster liegt zu weit in der Vergangenheit oder Zukunft.',
        );
      }
      if (endMs - startMs < 5 * 60 * 1000 || endMs - startMs > 12 * HOUR_MS) {
        throw new HttpsError(
          'invalid-argument',
          'Ein Zeitfenster muss zwischen 5 Minuten und 12 Stunden lang sein.',
        );
      }
      if (startMs % (5 * 60 * 1000) !== 0 || endMs % (5 * 60 * 1000) !== 0) {
        throw new HttpsError('invalid-argument', 'Zeiten müssen im 5-Minuten-Raster liegen.');
      }
      return { id: item.id, groupId: item.groupId, startsAt, endsAt };
    })
    .sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt));
}

function parseTimePlanResponses(input, sourceWindows) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpsError('invalid-argument', 'Verfügbarkeiten fehlen.');
  }
  const windowsById = new Map(sourceWindows.map((window) => [window.id, window]));
  const keys = Object.keys(input);
  if (
    keys.length !== sourceWindows.length ||
    keys.some((key) => !windowsById.has(key)) ||
    sourceWindows.some((window) => !Object.prototype.hasOwnProperty.call(input, window.id))
  ) {
    throw new HttpsError(
      'failed-precondition',
      'Die Terminvorschläge wurden geändert. Bitte prüfe sie erneut.',
    );
  }
  const result = {};
  sourceWindows.forEach((window) => {
    const intervals = input[window.id];
    if (!Array.isArray(intervals) || intervals.length > 10) {
      throw new HttpsError('invalid-argument', 'Ungültige Verfügbarkeit.');
    }
    const windowStart = Date.parse(window.startsAt);
    const windowEnd = Date.parse(window.endsAt);
    let previousEnd = windowStart;
    result[window.id] = intervals.map((interval) => {
      if (!interval || typeof interval !== 'object' || Array.isArray(interval)) {
        throw new HttpsError('invalid-argument', 'Ungültiger Verfügbarkeitsbereich.');
      }
      if (Object.keys(interval).some((key) => key !== 'startsAt' && key !== 'endsAt')) {
        throw new HttpsError('invalid-argument', 'Ungültiger Verfügbarkeitsbereich.');
      }
      const startsAt = cleanString(interval.startsAt, 80, 'Startzeit', true);
      const endsAt = cleanString(interval.endsAt, 80, 'Endzeit', true);
      const startMs = Date.parse(startsAt);
      const endMs = Date.parse(endsAt);
      if (
        !Number.isFinite(startMs) ||
        !Number.isFinite(endMs) ||
        startMs < windowStart ||
        endMs > windowEnd ||
        endMs <= startMs ||
        startMs < previousEnd ||
        startMs % (5 * 60 * 1000) !== 0 ||
        endMs % (5 * 60 * 1000) !== 0
      ) {
        throw new HttpsError(
          'invalid-argument',
          'Ein Verfügbarkeitsbereich liegt nicht im angebotenen Zeitfenster.',
        );
      }
      previousEnd = endMs;
      return { startsAt, endsAt };
    });
  });
  return result;
}

function sameTimePlanResponses(left, right, sourceWindows) {
  if (!left || typeof left !== 'object' || Array.isArray(left)) return false;
  if (Object.keys(left).length !== sourceWindows.length) return false;
  return sourceWindows.every((window) => {
    const leftIntervals = left[window.id];
    const rightIntervals = right[window.id];
    return (
      Array.isArray(leftIntervals) &&
      Array.isArray(rightIntervals) &&
      leftIntervals.length === rightIntervals.length &&
      leftIntervals.every(
        (interval, index) =>
          interval?.startsAt === rightIntervals[index]?.startsAt &&
          interval?.endsAt === rightIntervals[index]?.endsAt,
      )
    );
  });
}

/**
 * A plan intentionally has no Activity document or map marker yet. Invited
 * friends can only join through a private server invitation, then read it.
 */
exports.createTimePlan = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireVerifiedAuth(request);
  const payload = request.data;
  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload) ||
    Object.keys(payload).some((key) => key !== 'plan' && key !== 'planId')
  ) {
    throw new HttpsError('invalid-argument', 'Ungültige Daten für die Terminfindung.');
  }
  const input = payload.plan;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpsError('invalid-argument', 'Daten für die Terminfindung fehlen.');
  }
  const requestedPlanId = payload.planId;
  if (requestedPlanId !== undefined && !validActivityId(requestedPlanId)) {
    throw new HttpsError('invalid-argument', 'Ungültige Terminfindungs-ID.');
  }
  const allowedKeys = new Set([
    'title',
    'visibility',
    'place',
    'category',
    'maxParticipants',
    'guestInvitesEnabled',
    'sourceWindows',
  ]);
  if (Object.keys(input).some((key) => !allowedKeys.has(key))) {
    throw new HttpsError('invalid-argument', 'Ungültige Daten für die Terminfindung.');
  }
  const title = cleanString(input.title, 60, 'Titel', true);
  const visibility = parseAudienceContext(input.visibility);
  const sourceWindows = parseTimePlanWindows(input.sourceWindows);
  let place;
  if (input.place != null) place = parseActivityPlace(input.place);
  let category;
  if (input.category != null) {
    if (typeof input.category !== 'string' || !ACTIVITY_CATEGORIES.has(input.category)) {
      throw new HttpsError('invalid-argument', 'Ungültige Kategorie.');
    }
    category = input.category;
  }
  let maxParticipants;
  if (input.maxParticipants != null) {
    if (
      !Number.isInteger(input.maxParticipants) ||
      input.maxParticipants < 2 ||
      input.maxParticipants > TIME_PLAN_MAX_MEMBERS
    ) {
      throw new HttpsError('invalid-argument', 'Ungültige Teilnehmergrenze.');
    }
    maxParticipants = input.maxParticipants;
  }
  if (input.guestInvitesEnabled != null && typeof input.guestInvitesEnabled !== 'boolean') {
    throw new HttpsError('invalid-argument', 'Ungültige Gäste-Einstellung.');
  }

  const db = getFirestore();
  const planRef = requestedPlanId
    ? db.doc(`timePlans/${requestedPlanId}`)
    : db.collection('timePlans').doc();
  if (requestedPlanId) {
    const existingPlan = await planRef.get();
    if (existingPlan.exists) {
      if (existingPlan.data()?.hostId === uid) return { ok: true, id: planRef.id };
      throw new HttpsError('already-exists', 'Diese Terminfindung existiert bereits.');
    }
  }
  await enforceRateLimit(uid, 'timePlans', TIME_PLAN_CREATIONS_PER_HOUR, HOUR_MS);
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
  const capacity = maxParticipants ?? TIME_PLAN_MAX_MEMBERS;
  const inviteeUids = [...new Set(await audienceForContext(db, uid, visibility, friends))]
    .filter((inviteeUid) => inviteeUid !== uid)
    .slice(0, capacity - 1);
  const latestWindowEnd = Math.max(...sourceWindows.map((window) => Date.parse(window.endsAt)));
  const expireAt = Timestamp.fromMillis(latestWindowEnd + TIME_PLAN_RETENTION_MS);
  const hostResponses = Object.fromEntries(
    sourceWindows.map((window) => [
      window.id,
      [{ startsAt: window.startsAt, endsAt: window.endsAt }],
    ]),
  );
  const pushItems = inviteeUids.map((recipientUid) => ({
    recipientUid,
    actorUid: uid,
    kind: 'time_plan_invite',
    title: `${displayName} sucht eine gemeinsame Zeit`,
    body: title,
    timePlanId: planRef.id,
  }));
  await db.runTransaction(async (transaction) => {
    const existingPlan = await transaction.get(planRef);
    if (existingPlan.exists) {
      if (existingPlan.data()?.hostId === uid) return;
      throw new HttpsError('already-exists', 'Diese Terminfindung existiert bereits.');
    }
    transaction.create(planRef, {
      hostId: uid,
      hostName: displayName,
      hostInitials: initials,
      title,
      ...(place ? { place } : {}),
      ...(category ? { category } : {}),
      ...(maxParticipants ? { maxParticipants } : {}),
      ...(input.guestInvitesEnabled === true ? { guestInvitesEnabled: true } : {}),
      sourceWindows,
      revision: 1,
      status: 'collecting',
      memberUids: [uid],
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      expireAt,
    });
    transaction.create(planRef.collection('timePlanMembers').doc(uid), {
      uid,
      displayName,
      initials,
      role: 'host',
      responseStatus: 'responded',
      responsesByWindow: hostResponses,
      updatedAt: Timestamp.now(),
      expireAt,
    });
    inviteeUids.forEach((inviteeUid, index) => {
      transaction.create(db.doc(`timePlanInvites/${planRef.id}_${inviteeUid}`), {
        planId: planRef.id,
        inviteeUid,
        status: 'pending',
        createdAt: Timestamp.now(),
        expireAt,
      });
      transaction.create(db.doc(`notifications/time_plan_${planRef.id}_${inviteeUid}`), {
        recipientUid: inviteeUid,
        kind: 'time_plan_invite',
        title: pushItems[index].title,
        body: title,
        timePlanId: planRef.id,
        createdAt: Timestamp.now(),
        expireAt,
      });
    });
    if (pushItems.length) {
      transaction.create(db.collection('pushOutbox').doc(), {
        items: pushItems.map(pushOutboxItem),
        timePlanId: planRef.id,
        createdAt: Timestamp.now(),
        expireAt,
      });
    }
  });
  return { ok: true, id: planRef.id };
});

exports.joinTimePlan = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireVerifiedAuth(request);
  await enforceRateLimit(uid, 'timePlanMembership', 12, 5 * 60 * 1000);
  const planId = request.data?.planId;
  if (!validActivityId(planId))
    throw new HttpsError('invalid-argument', 'Ungültige Terminfindungs-ID.');
  const db = getFirestore();
  const planRef = db.doc(`timePlans/${planId}`);
  const inviteRef = db.doc(`timePlanInvites/${planId}_${uid}`);
  const memberRef = planRef.collection('timePlanMembers').doc(uid);
  const profileRef = db.doc(`publicProfiles/${uid}`);
  await db.runTransaction(async (transaction) => {
    const [planSnapshot, inviteSnapshot, memberSnapshot, profileSnapshot] = await Promise.all([
      transaction.get(planRef),
      transaction.get(inviteRef),
      transaction.get(memberRef),
      transaction.get(profileRef),
    ]);
    if (!planSnapshot.exists)
      throw new HttpsError('not-found', 'Diese Terminfindung existiert nicht mehr.');
    const plan = planSnapshot.data();
    if (plan.status !== 'collecting' || (plan.expireAt?.toMillis?.() ?? 0) <= Date.now()) {
      throw new HttpsError('failed-precondition', 'Diese Terminfindung ist nicht mehr offen.');
    }
    // Joining IS answering. A member without an availability is a name in the
    // list that the host has to wait on forever, so the state is not creatable:
    // the response is parsed here and written in the same transaction, and
    // `parseTimePlanResponses` already insists on an entry for EVERY window.
    const responsesByWindow = parseTimePlanResponses(
      request.data?.responsesByWindow,
      Array.isArray(plan.sourceWindows) ? plan.sourceWindows : [],
    );
    if (memberSnapshot.exists) {
      // A retry after a lost response, or a legacy member left pending by the
      // older two-step flow — repair it rather than stranding them.
      if (memberSnapshot.data()?.responseStatus !== 'responded') {
        transaction.update(memberRef, {
          responseStatus: 'responded',
          responsesByWindow,
          basedOnRevision: plan.revision,
          updatedAt: Timestamp.now(),
        });
      }
      return;
    }
    if (!inviteSnapshot.exists || inviteSnapshot.data()?.status !== 'pending') {
      throw new HttpsError(
        'permission-denied',
        'Du wurdest nicht zu dieser Terminfindung eingeladen.',
      );
    }
    const memberUids = Array.isArray(plan.memberUids) ? plan.memberUids.filter(validUid) : [];
    const capacity = Number.isInteger(plan.maxParticipants)
      ? plan.maxParticipants
      : TIME_PLAN_MAX_MEMBERS;
    if (memberUids.length >= capacity || memberUids.length >= TIME_PLAN_MAX_MEMBERS) {
      throw new HttpsError('failed-precondition', 'Diese Terminfindung ist bereits voll.');
    }
    if (!profileSnapshot.exists)
      throw new HttpsError(
        'failed-precondition',
        'Dein Profil ist noch nicht vollständig eingerichtet.',
      );
    const profile = profileSnapshot.data();
    transaction.create(memberRef, {
      uid,
      displayName: cleanString(profile.displayName, 50, 'Name', true),
      initials: cleanString(profile.initials, 8, 'Initialen', true),
      role: 'member',
      responseStatus: 'responded',
      responsesByWindow,
      basedOnRevision: plan.revision,
      updatedAt: Timestamp.now(),
      expireAt: plan.expireAt,
    });
    transaction.update(planRef, { memberUids: [...memberUids, uid], updatedAt: Timestamp.now() });
    transaction.update(inviteRef, { status: 'joined', joinedAt: Timestamp.now() });
  });
  return { ok: true };
});

exports.respondToTimePlan = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireVerifiedAuth(request);
  await enforceRateLimit(uid, 'timePlanResponses', 30, HOUR_MS);
  const planId = request.data?.planId;
  const revision = request.data?.revision;
  if (!validActivityId(planId) || !Number.isInteger(revision) || revision < 1) {
    throw new HttpsError('invalid-argument', 'Ungültige Terminfindung.');
  }
  const db = getFirestore();
  const planRef = db.doc(`timePlans/${planId}`);
  const memberRef = planRef.collection('timePlanMembers').doc(uid);
  await db.runTransaction(async (transaction) => {
    const [planSnapshot, memberSnapshot] = await Promise.all([
      transaction.get(planRef),
      transaction.get(memberRef),
    ]);
    if (!planSnapshot.exists || !memberSnapshot.exists) {
      throw new HttpsError('permission-denied', 'Tritt dieser Terminfindung zuerst bei.');
    }
    const plan = planSnapshot.data();
    if (plan.status !== 'collecting' || plan.revision !== revision) {
      throw new HttpsError(
        'failed-precondition',
        'Die Terminvorschläge wurden geändert. Bitte prüfe sie erneut.',
      );
    }
    const sourceWindows = Array.isArray(plan.sourceWindows) ? plan.sourceWindows : [];
    const responsesByWindow = parseTimePlanResponses(
      request.data?.responsesByWindow,
      sourceWindows,
    );
    const member = memberSnapshot.data();
    if (
      member.responseStatus === 'responded' &&
      member.basedOnRevision === revision &&
      sameTimePlanResponses(member.responsesByWindow, responsesByWindow, sourceWindows)
    ) {
      return;
    }
    transaction.update(memberRef, {
      responseStatus: 'responded',
      responsesByWindow,
      basedOnRevision: revision,
      updatedAt: Timestamp.now(),
    });
  });
  return { ok: true };
});

/**
 * The step that lets a Terminfindung END.
 *
 * Without it a plan collects answers and then expires, which is why every
 * display decision around it was decoration. Locking turns the round into an
 * ordinary Activity — from that moment the existing machinery (marker, chat,
 * Anreise, joining) applies and nothing here is special any more.
 *
 * Members whose answer COVERS the chosen slot are carried over as participants:
 * they already said they can, so making them tap again would be asking a
 * question they have answered. Everyone else is notified and can join normally.
 */
exports.lockTimePlan = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireVerifiedAuth(request);
  await enforceRateLimit(uid, 'activities', 20, HOUR_MS);
  const planId = request.data?.planId;
  const windowId = request.data?.windowId;
  const activityId = request.data?.activityId;
  if (!validActivityId(planId) || !validActivityId(activityId) || typeof windowId !== 'string') {
    throw new HttpsError('invalid-argument', 'Ungültige Terminfindung.');
  }
  const startsAt = cleanString(request.data?.startsAt, 80, 'Startzeit', true);
  const endsAt = cleanString(request.data?.endsAt, 80, 'Endzeit', true);
  const startMs = Date.parse(startsAt);
  const endMs = Date.parse(endsAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    throw new HttpsError('invalid-argument', 'Ungültiger Zeitraum.');
  }

  const db = getFirestore();
  const planRef = db.doc(`timePlans/${planId}`);
  const activityRef = db.doc(`activities/${activityId}`);
  const roomRef = db.doc(`chats/${activityId}`);
  const journeyReminderGeneration = randomUUID();
  const activeActivitiesByHost = db
    .collection('activities')
    .where('hostId', '==', uid)
    .where('status', '==', 'active')
    .limit(MAX_ACTIVE_ACTIVITIES_PER_HOST);

  const notified = [];
  let lockedTitle = '';
  await db.runTransaction(async (transaction) => {
    const [planSnapshot, activitySnapshot, roomSnapshot, membersSnapshot, activeSnapshot] =
      await Promise.all([
        transaction.get(planRef),
        transaction.get(activityRef),
        transaction.get(roomRef),
        transaction.get(planRef.collection('timePlanMembers').limit(TIME_PLAN_MAX_MEMBERS)),
        transaction.get(activeActivitiesByHost),
      ]);
    if (!planSnapshot.exists) throw new HttpsError('not-found', 'Terminfindung nicht gefunden.');
    const plan = planSnapshot.data();
    if (plan.hostId !== uid) {
      throw new HttpsError('permission-denied', 'Nur der Host kann den Termin festlegen.');
    }
    if (activitySnapshot.exists) {
      // The client-generated activity id is the idempotency key, exactly as in
      // createActivity: a lost response may be retried, nobody else may claim it.
      if (activitySnapshot.data()?.hostId === uid) return;
      throw new HttpsError('already-exists', 'Diese Activity existiert bereits.');
    }
    if (plan.status !== 'collecting') {
      throw new HttpsError('failed-precondition', 'Diese Terminfindung ist bereits abgeschlossen.');
    }
    if (roomSnapshot.exists) {
      throw new HttpsError('failed-precondition', 'Der Activity-Chat ist bereits belegt.');
    }
    if (activeSnapshot.size >= MAX_ACTIVE_ACTIVITIES_PER_HOST) {
      throw new HttpsError(
        'resource-exhausted',
        `Du kannst maximal ${MAX_ACTIVE_ACTIVITIES_PER_HOST} aktive Activities gleichzeitig hosten.`,
      );
    }

    const sourceWindows = Array.isArray(plan.sourceWindows) ? plan.sourceWindows : [];
    const window = sourceWindows.find((entry) => entry?.id === windowId);
    if (!window) throw new HttpsError('not-found', 'Dieser Zeitvorschlag existiert nicht.');
    const windowStart = Date.parse(window.startsAt);
    const windowEnd = Date.parse(window.endsAt);
    if (startMs < windowStart || endMs > windowEnd) {
      throw new HttpsError('invalid-argument', 'Der Termin liegt außerhalb des Vorschlags.');
    }
    const now = Date.now();
    if (endMs <= now) {
      throw new HttpsError('failed-precondition', 'Dieser Zeitraum liegt bereits in der Vergangenheit.');
    }

    const members = membersSnapshot.docs
      .map((snapshot) => snapshot.data())
      .filter((member) => validUid(member?.uid));
    const hostMember = members.find((member) => member.uid === uid);
    // Everyone whose answer covers the whole slot. The host is first because
    // `participantUids[0] == hostId` is a firestore.rules invariant.
    const covering = members.filter((member) => {
      if (member.uid === uid || member.responseStatus !== 'responded') return false;
      const intervals = member.responsesByWindow?.[windowId];
      if (!Array.isArray(intervals)) return false;
      return intervals.some((interval) => {
        const from = Date.parse(interval?.startsAt);
        const to = Date.parse(interval?.endsAt);
        return Number.isFinite(from) && Number.isFinite(to) && from <= startMs && to >= endMs;
      });
    });
    const capacity = Number.isInteger(plan.maxParticipants)
      ? plan.maxParticipants
      : TIME_PLAN_MAX_MEMBERS;
    const carried = covering.slice(0, Math.max(0, capacity - 1));

    const hostName = cleanString(plan.hostName ?? hostMember?.displayName, 50, 'Name', true);
    const hostInitials = cleanString(
      plan.hostInitials ?? hostMember?.initials ?? hostName.slice(0, 2).toUpperCase(),
      8,
      'Initialen',
      true,
    );
    const participants = [
      { uid, displayName: hostName, initials: hostInitials },
      ...carried.map((member) => contactSnapshot(member.uid, member)),
    ];
    const participantUids = participants.map((participant) => participant.uid);
    // Only people who took part in the round. Someone invited who never
    // answered did not join it, and inheriting them would widen the audience
    // past what the round actually was.
    const audienceUids = [...new Set([...participantUids, ...members.map((m) => m.uid)])];

    const title = cleanString(plan.title, 60, 'Titel', true);
    lockedTitle = title;
    const chatExpireAt = endMs + ACTIVITY_CHAT_RETENTION_MS;
    transaction.create(activityRef, {
      hostId: uid,
      // A slot that has already begun is genuinely running; anything else is a
      // plan. `resolveActivityMode` would show it as `now` either way, but the
      // STORED mode is what decides whether an Anreise exists.
      mode: startMs <= now ? 'now' : 'soon',
      title,
      audienceUids,
      startsAt,
      endsAt,
      ...(plan.place ? { place: plan.place } : {}),
      ...(Number.isInteger(plan.maxParticipants) ? { maxParticipants: plan.maxParticipants } : {}),
      ...(plan.category ? { category: plan.category } : {}),
      ...(plan.guestInvitesEnabled === true ? { guestInvitesEnabled: true } : {}),
      participants,
      participantUids,
      status: 'active',
      journeyReminderGeneration,
      timePlanId: planId,
      createdAt: Timestamp.now(),
      visibleUntil: Timestamp.fromMillis(endMs),
      expireAt: Timestamp.fromMillis(chatExpireAt),
    });
    transaction.create(roomRef, {
      type: 'activity',
      title,
      memberIds: participantUids,
      messageCount: 0,
      readCount: {},
      createdAt: Timestamp.now(),
      expireAt: Timestamp.fromMillis(chatExpireAt),
    });
    transaction.update(planRef, {
      status: 'locked',
      activityId,
      lockedWindowId: windowId,
      lockedStartsAt: startsAt,
      lockedEndsAt: endsAt,
      updatedAt: Timestamp.now(),
    });

    members.forEach((member) => {
      if (member.uid === uid) return;
      notified.push(member.uid);
      transaction.create(db.doc(`notifications/timeplanlocked_${planId}_${member.uid}`), {
        recipientUid: member.uid,
        kind: 'time_plan_locked',
        title: 'Der Termin steht',
        body: `${title} · ${formatGermanDateTime(startMs)}`,
        activityId,
        timePlanId: planId,
        createdAt: Timestamp.now(),
        expireAt: Timestamp.fromMillis(chatExpireAt),
      });
    });
    if (notified.length) {
      transaction.create(db.collection('pushOutbox').doc(), {
        items: notified.map((recipientUid) =>
          pushOutboxItem({
            recipientUid,
            actorUid: uid,
            kind: 'time_plan_locked',
            title: 'Der Termin steht',
            body: `${title} · ${formatGermanDateTime(startMs)}`,
            activityId,
            timePlanId: planId,
          }),
        ),
        timePlanId: planId,
        createdAt: Timestamp.now(),
        expireAt: Timestamp.fromMillis(chatExpireAt),
      });
    }
  });

  return { ok: true, id: activityId, title: lockedTitle, notified: notified.length };
});

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

  if (input.guestInvitesEnabled != null && typeof input.guestInvitesEnabled !== 'boolean') {
    throw new HttpsError('invalid-argument', 'Ungültige Gäste-Einstellung.');
  }
  const guestInvitesEnabled = input.guestInvitesEnabled === true;

  let place;
  if (input.place != null) {
    place = parseActivityPlace(input.place);
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
  const journeyReminderGeneration = randomUUID();
  const activeActivitiesByHost = db
    .collection('activities')
    .where('hostId', '==', uid)
    .where('status', '==', 'active')
    .limit(MAX_ACTIVE_ACTIVITIES_PER_HOST);
  const chatExpireAt = Math.max(
    now + ACTIVITY_CHAT_RETENTION_MS,
    (Number.isFinite(endMs) ? endMs : Number.isFinite(startMs) ? startMs : now) +
      ACTIVITY_CHAT_RETENTION_MS,
  );
  // Activity membership and its host chat must appear together. A proposal can
  // intentionally promote an existing group room into its activity chat, so
  // this has to be a transaction rather than two unconditional creates.
  await db.runTransaction(async (transaction) => {
    const [activitySnapshot, roomSnapshot, activeActivitiesSnapshot] = await Promise.all([
      transaction.get(activityRef),
      transaction.get(roomRef),
      transaction.get(activeActivitiesByHost),
    ]);
    if (activitySnapshot.exists) {
      // A client can lose the callable response after this transaction already
      // committed. The client-generated activity id is therefore an idempotency
      // key: the original host may safely retry, nobody else may claim it.
      if (activitySnapshot.data()?.hostId === uid) return;
      throw new HttpsError('already-exists', 'Diese Activity existiert bereits.');
    }
    if (activeActivitiesSnapshot.size >= MAX_ACTIVE_ACTIVITIES_PER_HOST) {
      throw new HttpsError(
        'resource-exhausted',
        `Du kannst maximal ${MAX_ACTIVE_ACTIVITIES_PER_HOST} aktive Activities gleichzeitig hosten.`,
      );
    }

    let participantUids = [uid];
    let participants = [{ uid, displayName, initials }];
    let resolvedAudienceUids = audienceUids;
    let formingRoundMessages = null;
    let formingRoundInvites = null;
    const groupRoom = roomSnapshot.exists ? roomSnapshot.data() : null;
    if (groupRoom) {
      if (groupRoom.type !== 'group') {
        throw new HttpsError('failed-precondition', 'Der Activity-Chat ist bereits belegt.');
      }
      const groupMemberUids = Array.isArray(groupRoom.memberIds)
        ? [...new Set(groupRoom.memberIds.filter(validUid))].slice(0, 50)
        : [];
      if (!groupMemberUids.includes(uid) || !groupMemberUids.length) {
        throw new HttpsError('permission-denied', 'Du bist nicht Mitglied dieser Planung.');
      }
      if (maxParticipants && groupMemberUids.length > maxParticipants) {
        throw new HttpsError(
          'failed-precondition',
          'Die Teilnehmergrenze ist kleiner als die bestehende Runde.',
        );
      }
      const memberProfiles = await Promise.all(
        groupMemberUids.map((memberUid) => transaction.get(db.doc(`publicProfiles/${memberUid}`))),
      );
      if (groupRoom.roundStatus === 'forming') {
        formingRoundMessages = await transaction.get(
          roomRef.collection('messages').orderBy('createdAt', 'desc').limit(100),
        );
        formingRoundInvites = await transaction.get(
          db
            .collection('spontaneousRoundInvites')
            .where('roundId', '==', activityId)
            .limit(SPONTANEOUS_ROUND_MAX_INVITEES),
        );
      }
      participantUids = groupMemberUids;
      participants = memberProfiles.map((snapshot, index) =>
        contactSnapshot(groupMemberUids[index], snapshot.data()),
      );
      resolvedAudienceUids = [...new Set([...audienceUids, ...participantUids])];
    }

    transaction.create(activityRef, {
      hostId: uid,
      mode,
      title,
      ...(note ? { note } : {}),
      audienceUids: resolvedAudienceUids,
      ...(startsAt ? { startsAt } : {}),
      ...(endsAt ? { endsAt } : {}),
      ...(place ? { place } : {}),
      ...(maxParticipants ? { maxParticipants } : {}),
      ...(category ? { category } : {}),
      ...(guestInvitesEnabled ? { guestInvitesEnabled: true } : {}),
      participants,
      participantUids,
      status: 'active',
      journeyReminderGeneration,
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

    const room = groupRoom;
    transaction.update(roomRef, {
      type: 'activity',
      title,
      expireAt: Timestamp.fromMillis(chatExpireAt),
      ...(room.roundStatus === 'forming'
        ? { roundStatus: FieldValue.delete(), joinable: FieldValue.delete() }
        : {}),
    });
    if (room.roundStatus === 'forming') {
      formingRoundMessages?.docs.forEach((messageSnapshot) => {
        transaction.update(messageSnapshot.ref, { expireAt: Timestamp.fromMillis(chatExpireAt) });
      });
      participantUids.forEach((memberUid) => {
        transaction.delete(db.doc(`spontaneousRoundMemberships/${memberUid}`));
      });
      formingRoundInvites?.docs.forEach((inviteSnapshot) => {
        transaction.delete(inviteSnapshot.ref);
        transaction.delete(
          db.doc(`notifications/${activityId}_${inviteSnapshot.data().recipientUid}`),
        );
      });
      transaction.delete(db.doc(`groupOpenings/${activityId}`));
    }
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
  await enforceRateLimit(uid, 'activityMutations', 60, HOUR_MS);
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
    'guestInvitesEnabled',
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
  const journeyReminderGeneration = randomUUID();

  await db.runTransaction(async (transaction) => {
    const activitySnapshot = await transaction.get(activityRef);
    if (!activitySnapshot.exists) throw new HttpsError('not-found', 'Aktivität nicht gefunden.');

    const activity = activitySnapshot.data();
    if (activity.hostId !== uid) {
      throw new HttpsError('permission-denied', 'Nur der Host kann diese Aktivität bearbeiten.');
    }
    if (activity.status !== 'active') {
      throw new HttpsError('failed-precondition', 'Diese Aktivität ist nicht mehr aktiv.');
    }

    const patch = {};
    let journeyReminderScheduleChanged = false;
    const nextMode = has('mode') ? input.mode : activity.mode;
    if (nextMode !== 'soon' && nextMode !== 'now') {
      throw new HttpsError('invalid-argument', 'Ungültiger Aktivitätsmodus.');
    }
    if (has('mode') && nextMode !== activity.mode) {
      patch.mode = nextMode;
      journeyReminderScheduleChanged = true;
    }

    const nextTitle = has('title') ? cleanString(input.title, 60, 'Titel', true) : activity.title;
    const titleChanged = has('title') && nextTitle !== activity.title;
    if (titleChanged) patch.title = nextTitle;

    if (has('note')) {
      if (input.note === null) {
        if (Object.prototype.hasOwnProperty.call(activity, 'note')) {
          patch.note = FieldValue.delete();
        }
      } else {
        const note = cleanString(input.note, 500, 'Beschreibung');
        const normalizedNote = note || null;
        const currentNote =
          typeof activity.note === 'string' && activity.note ? activity.note : null;
        if (normalizedNote !== currentNote) {
          patch.note = normalizedNote ? normalizedNote : FieldValue.delete();
        }
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
    const startsAtChanged = has('startsAt') && nextStartsAt !== activity.startsAt;
    const endsAtChanged = has('endsAt') && nextEndsAt !== activity.endsAt;
    if (
      Number.isInteger(activity.journeyUnderwayCount) &&
      activity.journeyUnderwayCount > 0 &&
      startsAtChanged
    ) {
      throw new HttpsError(
        'failed-precondition',
        'Die Startzeit kann während einer laufenden Anreise nicht geändert werden.',
      );
    }
    if (startsAtChanged) patch.startsAt = nextStartsAt;
    if (endsAtChanged) {
      patch.endsAt = nextEndsAt;
      patch.visibleUntil = Timestamp.fromMillis(endsAtMs);
      patch.expireAt = Timestamp.fromMillis(endsAtMs + ACTIVITY_CHAT_RETENTION_MS);
    }
    if (startsAtChanged) {
      // A previous one-hour reminder belongs to the old start time.
      patch.journeyReminderSentAt = FieldValue.delete();
      patch.journeyReminderSentGeneration = FieldValue.delete();
      journeyReminderScheduleChanged = true;
    }

    if (has('maxParticipants')) {
      if (input.maxParticipants === null) {
        if (Object.prototype.hasOwnProperty.call(activity, 'maxParticipants')) {
          patch.maxParticipants = FieldValue.delete();
        }
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
      } else if (input.maxParticipants !== activity.maxParticipants) {
        patch.maxParticipants = input.maxParticipants;
      }
    }

    if (has('category')) {
      if (input.category === null) {
        if (Object.prototype.hasOwnProperty.call(activity, 'category')) {
          patch.category = FieldValue.delete();
        }
      } else if (typeof input.category !== 'string' || !ACTIVITY_CATEGORIES.has(input.category)) {
        throw new HttpsError('invalid-argument', 'Ungültige Kategorie.');
      } else if (input.category !== activity.category) {
        patch.category = input.category;
      }
    }

    if (has('guestInvitesEnabled')) {
      if (typeof input.guestInvitesEnabled !== 'boolean') {
        throw new HttpsError('invalid-argument', 'Ungültige Gäste-Einstellung.');
      }
      // Turning it off stops FUTURE invites only; already-invited guests keep
      // their access (the audience never shrinks silently).
      if (input.guestInvitesEnabled !== (activity.guestInvitesEnabled === true)) {
        patch.guestInvitesEnabled = input.guestInvitesEnabled ? true : FieldValue.delete();
      }
    }

    if (has('place')) {
      const nextPlace = parseActivityPlace(input.place, { nullable: true });
      if (
        Number.isInteger(activity.journeyUnderwayCount) &&
        activity.journeyUnderwayCount > 0 &&
        !sameActivityPlace(activity.place, nextPlace)
      ) {
        throw new HttpsError(
          'failed-precondition',
          'Der Ort kann während einer laufenden Anreise nicht geändert werden.',
        );
      }
      if (!sameActivityPlace(activity.place, nextPlace)) {
        patch.place = nextPlace ?? FieldValue.delete();
        journeyReminderScheduleChanged = true;
      }
    }

    if (journeyReminderScheduleChanged) {
      patch.journeyReminderGeneration = journeyReminderGeneration;
    }

    if (!Object.keys(patch).length) return;

    let roomSnapshot;
    if (titleChanged || endsAtChanged) {
      roomSnapshot = await transaction.get(roomRef);
    }
    transaction.update(activityRef, patch);

    // Only touch the room when its title or its end-based TTL actually moves.
    if (roomSnapshot?.exists) {
      const room = roomSnapshot.data();
      if (room.type === 'activity') {
        transaction.update(roomRef, {
          ...(titleChanged ? { title: nextTitle } : {}),
          ...(endsAtChanged
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

/** Cancellation removes the plan and its activity chat from members immediately. */
exports.cancelActivity = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireVerifiedAuth(request);
  await enforceRateLimit(uid, 'activityMutations', 60, HOUR_MS);
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
        expireAt: Timestamp.fromMillis(now),
      });
    }
  });

  // No Anreise position may outlive a cancellation. Activity status already
  // blocks any new writes.
  await clearActivityJourneys(activityId).catch((error) =>
    console.error('[activity] journey cleanup after cancellation failed', error),
  );
  return { ok: true };
});

function parsePlaceSessionToken(value) {
  const token = cleanString(value, 128, 'Suchsitzung', true);
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(token)) {
    throw new HttpsError('invalid-argument', 'Ungültige Suchsitzung.');
  }
  return token;
}

function parseGooglePlaceId(value) {
  const placeId = cleanString(value, 256, 'Ort', true);
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(placeId)) {
    throw new HttpsError('invalid-argument', 'Ungültiger Ort.');
  }
  return placeId;
}

function parsePlaceSearchArea(input) {
  const center = input?.center;
  const radiusMeters = Number(input?.radiusMeters ?? 10_000);
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
  return { center, radiusMeters };
}

async function autocompletePlaces(request) {
  const uid = requireVerifiedAuth(request);
  const query = cleanString(request.data?.query, 120, 'Suchtext', true);
  if (query.length < 3) return { suggestions: [] };
  const sessionToken = parsePlaceSessionToken(request.data?.sessionToken);
  const { center, radiusMeters } = parsePlaceSearchArea(request.data);
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    // The emulator intentionally has no paid Google secret; its valid caller
    // path is still exercised without making an external request.
    if (RUNNING_FUNCTIONS_EMULATOR) return { suggestions: [] };
    throw new HttpsError('failed-precondition', 'Die Ortssuche ist noch nicht konfiguriert.');
  }

  await enforceRateLimit(uid, 'placeAutocomplete', 10, 60 * 1000);
  await enforceRateLimit(
    uid,
    'placeAutocompleteDaily',
    PLACE_SEARCHES_PER_USER_PER_DAY,
    DAY_MS,
    'Du hast die tägliche Zahl der Ortssuchen erreicht. Bitte probiere es morgen erneut.',
  );
  await enforcePlacesProjectQuota('autocomplete');

  const body = {
    input: query,
    languageCode: 'de',
    regionCode: 'DE',
    sessionToken,
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
    response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask':
          'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat.mainText.text,suggestions.placePrediction.structuredFormat.secondaryText.text',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    });
  } catch (error) {
    console.error('[places] autocomplete request failed', error);
    throw new HttpsError('unavailable', 'Die Ortssuche ist gerade nicht erreichbar.');
  }
  if (!response.ok) {
    throw new HttpsError('unavailable', 'Die Ortssuche ist gerade nicht erreichbar.');
  }
  const payload = await response.json();
  return {
    suggestions: (payload.suggestions ?? [])
      .map((suggestion) => suggestion?.placePrediction)
      .filter((prediction) => typeof prediction?.placeId === 'string' && prediction?.text?.text)
      .slice(0, 5)
      .map((prediction) => ({
        id: prediction.placeId,
        name: prediction.structuredFormat?.mainText?.text ?? prediction.text.text,
        ...(prediction.structuredFormat?.secondaryText?.text
          ? { address: prediction.structuredFormat.secondaryText.text }
          : {}),
      })),
  };
}

async function resolvePlaceLocation(request) {
  const uid = requireVerifiedAuth(request);
  const placeId = parseGooglePlaceId(request.data?.placeId);
  const sessionToken = parsePlaceSessionToken(request.data?.sessionToken);
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    throw new HttpsError('failed-precondition', 'Die Ortssuche ist nicht konfiguriert.');
  }

  await enforceRateLimit(uid, 'placeResolve', 10, 60 * 1000);
  await enforceRateLimit(
    uid,
    'placeResolveDaily',
    PLACE_SEARCHES_PER_USER_PER_DAY,
    DAY_MS,
    'Du hast die tägliche Zahl der Ortsauswahlen erreicht. Bitte probiere es morgen erneut.',
  );
  await enforcePlacesProjectQuota('details_essentials');

  let response;
  try {
    response = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?sessionToken=${encodeURIComponent(sessionToken)}`,
      {
        headers: {
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'location',
        },
        signal: AbortSignal.timeout(8_000),
      },
    );
  } catch (error) {
    console.error('[places] location request failed', error);
    throw new HttpsError('unavailable', 'Der Ort ist gerade nicht erreichbar.');
  }
  if (!response.ok) {
    throw new HttpsError('unavailable', 'Der Ort ist gerade nicht erreichbar.');
  }
  const payload = await response.json();
  const latitude = payload.location?.latitude;
  const longitude = payload.location?.longitude;
  if (
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new HttpsError('failed-precondition', 'Der Ort hat keine Kartenkoordinate.');
  }
  return { place: { id: placeId, latitude, longitude } };
}

/**
 * The current app uses one Places callable for both phases of a search.
 * Keeping the dispatch here (rather than in the client) preserves identical
 * authentication, App Check, per-account limits and project quota accounting
 * for autocomplete and the selected place's coordinate resolution.
 */
exports.places = onCall(PLACES_CALLABLE_OPTS, async (request) => {
  const action = request.data?.action;
  if (action === 'autocomplete') return autocompletePlaces(request);
  if (action === 'resolve') return resolvePlaceLocation(request);
  throw new HttpsError('invalid-argument', 'Ungültige Ortssuche.');
});

exports.publishPresence = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireVerifiedAuth(request);
  await enforceRateLimit(uid, 'presence', 12, 5 * 60 * 1000);
  const input = request.data?.presence;
  if (!input || typeof input !== 'object') {
    throw new HttpsError('invalid-argument', 'Präsenzdaten fehlen.');
  }
  const now = Date.now();
  const expiresAt = Number(input.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= now || expiresAt > now + OPEN_MAX_DURATION_MS) {
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
  const presenceRef = db.doc(`presence/${uid}`);
  const existingPresence = await presenceRef.get();
  const existing = existingPresence.data() ?? {};
  const existingExpiresAt = existing.expireAt?.toMillis?.() ?? 0;
  const canRefineExisting =
    existingPresence.exists &&
    existingExpiresAt > now &&
    typeof existing.displayName === 'string' &&
    typeof existing.initials === 'string' &&
    Array.isArray(existing.audienceUids);

  let profile = existing;
  let audienceUids = new Set(
    canRefineExisting
      ? existing.audienceUids.filter((audienceUid) => validUid(audienceUid) && audienceUid !== uid)
      : [],
  );
  if (!canRefineExisting) {
    const [profileSnapshot, friends] = await Promise.all([
      db.doc(`publicProfiles/${uid}`).get(),
      directPresenceAudienceUids(db, uid),
    ]);
    profile = profileSnapshot.data() ?? {};
    audienceUids = friends;
  }

  await presenceRef.set({
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
  const userRef = db.doc(`users/${uid}`);
  const roomRef = db.doc(`chats/${activityId}`);
  const activeActivitiesByParticipant = db
    .collection('activities')
    .where('participantUids', 'array-contains', uid)
    .where('status', '==', 'active')
    .limit(MAX_ACTIVE_ACTIVITIES_PER_PARTICIPANT);
  let journeyReminder;
  await db.runTransaction(async (transaction) => {
    const [
      activitySnapshot,
      profileSnapshot,
      userSnapshot,
      roomSnapshot,
      activeActivitiesSnapshot,
    ] = await Promise.all([
      transaction.get(activityRef),
      transaction.get(profileRef),
      transaction.get(userRef),
      transaction.get(roomRef),
      transaction.get(activeActivitiesByParticipant),
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
      if (activeActivitiesSnapshot.size >= MAX_ACTIVE_ACTIVITIES_PER_PARTICIPANT) {
        throw new HttpsError(
          'resource-exhausted',
          `Du kannst an maximal ${MAX_ACTIVE_ACTIVITIES_PER_PARTICIPANT} aktiven Activities gleichzeitig teilnehmen.`,
        );
      }
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
      if (isNow && userSnapshot.data()?.journeyRemindersEnabled !== false) {
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
      (Number.isFinite(activityEndMs) ? activityEndMs : Date.now()) + ACTIVITY_CHAT_RETENTION_MS,
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
    if (activity.status !== 'active') return;
    const participantUids = Array.isArray(activity.participantUids) ? activity.participantUids : [];
    if (!participantUids.includes(uid)) return;
    const remainingParticipantUids = participantUids.filter(
      (participantUid) => participantUid !== uid,
    );
    const leavingHost = activity.hostId === uid;
    if (leavingHost && !remainingParticipantUids.length) {
      throw new HttpsError(
        'failed-precondition',
        'Du bist der letzte Teilnehmer. Sage die Activity ab, um sie zu beenden.',
      );
    }

    const participants = Array.isArray(activity.participants) ? activity.participants : [];
    const remainingParticipants = participants.filter((participant) => participant?.uid !== uid);
    let nextParticipantUids = remainingParticipantUids;
    let nextParticipants = remainingParticipants;
    let successorUid;
    if (leavingHost) {
      // Participant order is server-owned: the first remaining person is the
      // longest-standing participant. Move that same person to index zero so
      // the Activity document keeps its host/participant invariants intact.
      successorUid = remainingParticipantUids[0];
      const successor = remainingParticipants.find(
        (participant) => participant?.uid === successorUid,
      );
      if (!successor) {
        throw new HttpsError(
          'failed-precondition',
          'Die Teilnehmerdaten dieser Activity sind unvollständig.',
        );
      }
      nextParticipantUids = [
        successorUid,
        ...remainingParticipantUids.filter((participantUid) => participantUid !== successorUid),
      ];
      nextParticipants = [
        successor,
        ...remainingParticipants.filter((participant) => participant?.uid !== successorUid),
      ];
    }

    left = true;
    transaction.update(activityRef, {
      ...(successorUid ? { hostId: successorUid } : {}),
      participantUids: nextParticipantUids,
      participants: nextParticipants,
      ...(journeyStateSnapshot.exists
        ? {
            journeyUnderwayCount: Math.max(
              0,
              (Number.isInteger(activity.journeyUnderwayCount)
                ? activity.journeyUnderwayCount
                : 0) - 1,
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
          ...(successorUid && Array.isArray(room.adminUids)
            ? {
                adminUids: [
                  successorUid,
                  ...room.adminUids.filter(
                    (adminUid) => adminUid !== uid && adminUid !== successorUid,
                  ),
                ],
              }
            : {}),
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

/**
 * Participant-vouched guest invite ("Freunde dürfen Freunde mitbringen").
 * Trust boundary mirrors addChatMembers: the invitee must be a CONFIRMED
 * direct friend of the INVITER — never a stranger — and the host must have
 * opted in per activity (guestInvitesEnabled). The invite only widens the
 * read audience; joining still runs through joinActivity with all its checks.
 */
exports.inviteFriendToActivity = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireVerifiedAuth(request);
  await enforceRateLimit(uid, 'activityInvites', 30, HOUR_MS);
  const activityId = request.data?.activityId;
  const targetUid = request.data?.targetUid;
  if (!validActivityId(activityId) || !validUid(targetUid) || targetUid === uid) {
    throw new HttpsError('invalid-argument', 'Ungültige Einladung.');
  }

  const db = getFirestore();
  let activityTitle = 'Aktivität';
  let inviterName = 'Ein Freund';
  let alreadyInvited = false;
  await db.runTransaction(async (transaction) => {
    alreadyInvited = false;
    const activityRef = db.doc(`activities/${activityId}`);
    const [activitySnapshot, friendshipSnapshot, inviterSnapshot] = await Promise.all([
      transaction.get(activityRef),
      transaction.get(db.doc(`friendships/${friendshipId(uid, targetUid)}`)),
      transaction.get(db.doc(`publicProfiles/${uid}`)),
    ]);
    if (!activitySnapshot.exists) throw new HttpsError('not-found', 'Aktivität nicht gefunden.');
    const activity = activitySnapshot.data();
    if (activity.status !== 'active') {
      throw new HttpsError('failed-precondition', 'Diese Aktivität ist nicht mehr aktiv.');
    }
    if (activity.guestInvitesEnabled !== true) {
      throw new HttpsError(
        'failed-precondition',
        'Der Host erlaubt für diese Aktivität keine Gäste-Einladungen.',
      );
    }
    if (!(activity.participantUids ?? []).includes(uid)) {
      throw new HttpsError('permission-denied', 'Nur Teilnehmer können Freunde einladen.');
    }
    if (friendshipSnapshot.data()?.status !== 'accepted') {
      throw new HttpsError('permission-denied', 'Du kannst nur bestätigte Freunde einladen.');
    }
    const audience = activity.audienceUids ?? [];
    if (audience.includes(targetUid)) {
      alreadyInvited = true;
      return;
    }
    if (audience.length >= 201) {
      throw new HttpsError('resource-exhausted', 'Diese Aktivität hat ihr Publikum erreicht.');
    }
    if (
      (await isBlockedBetween(db, targetUid, activity.hostId)) ||
      (await isBlockedBetween(db, targetUid, uid))
    ) {
      throw new HttpsError('permission-denied', 'Diese Person ist nicht verfügbar.');
    }
    activityTitle = typeof activity.title === 'string' ? activity.title : activityTitle;
    inviterName = cleanString(inviterSnapshot.data()?.displayName ?? inviterName, 50, 'Name', true);
    transaction.update(activityRef, { audienceUids: FieldValue.arrayUnion(targetUid) });
  });

  if (!alreadyInvited) {
    await createNotifications(
      [
        {
          recipientUid: targetUid,
          actorUid: uid,
          kind: 'activity_invite',
          title: `Einladung zu „${activityTitle}“`,
          body: `${inviterName} möchte, dass du dabei bist.`,
          activityId,
        },
      ],
      { queuePush: true },
    );
  }
  return { ok: true, state: alreadyInvited ? 'already_invited' : 'invited' };
});

exports.joinChatRoom = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireVerifiedAuth(request);
  await enforceRateLimit(uid, 'chatMembership', 20, 5 * 60 * 1000);
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
      (Number.isFinite(activityEndMs) ? activityEndMs : Date.now()) + ACTIVITY_CHAT_RETENTION_MS,
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
  await enforceRateLimit(uid, 'blockedContacts', 6, 60 * 1000);
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
  await enforceRateLimit(uid, 'groupMutations', 20, HOUR_MS);
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
      kind: 'joinable',
      status: 'active',
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
  await enforceRateLimit(uid, 'groupMembership', 12, 5 * 60 * 1000);
  const roomId = request.data?.roomId;
  if (!validActivityId(roomId)) {
    throw new HttpsError('invalid-argument', 'Ungültige Raum-ID.');
  }

  const db = getFirestore();
  const roomRef = db.doc(`chats/${roomId}`);
  const openingRef = db.doc(`groupOpenings/${roomId}`);
  await db.runTransaction(async (transaction) => {
    const [roomSnapshot, openingSnapshot, pendingSnapshot] = await Promise.all([
      transaction.get(roomRef),
      transaction.get(openingRef),
      transaction.get(pendingGroupChatInvitesQuery(db, roomId)),
    ]);
    if (!roomSnapshot.exists || !openingSnapshot.exists) {
      throw new HttpsError('not-found', 'Diese Planung ist nicht mehr offen.');
    }
    const room = roomSnapshot.data();
    const opening = openingSnapshot.data();
    if (
      room.type !== 'group' ||
      room.joinable !== true ||
      opening.kind !== 'joinable' ||
      opening.status !== 'active' ||
      (opening.expireAt?.toMillis?.() ?? 0) <= Date.now()
    ) {
      throw new HttpsError('failed-precondition', 'Diese Planung ist nicht mehr offen.');
    }
    // The teaser's audience is the authorization: only invited-by-openness
    // friends may join — never arbitrary uid holders.
    if (!(opening.audienceUids ?? []).includes(uid)) {
      throw new HttpsError('permission-denied', 'Diese Planung ist für dich nicht sichtbar.');
    }
    const memberIds = Array.isArray(room.memberIds) ? room.memberIds : [];
    if (memberIds.includes(uid)) return;
    const now = Date.now();
    const activePending = pendingSnapshot.docs.filter(
      (entry) => (entry.data().expireAt?.toMillis?.() ?? 0) > now,
    );
    if (memberIds.length + activePending.length >= GROUP_CHAT_MAX_MEMBERS) {
      throw new HttpsError('failed-precondition', 'Diese Planung ist voll.');
    }
    // Expired invitations never reserve a seat. All reads above precede these
    // cleanup writes, so this remains a valid Firestore transaction.
    pendingSnapshot.docs
      .filter((entry) => (entry.data().expireAt?.toMillis?.() ?? 0) <= now)
      .forEach((entry) => {
        transaction.delete(entry.ref);
        const inviteeUid = entry.data().inviteeUid;
        if (validUid(inviteeUid)) {
          transaction.delete(
            db.doc(`notifications/${groupChatInviteNotificationId(roomId, inviteeUid)}`),
          );
        }
      });
    transaction.update(roomRef, {
      memberIds: [...memberIds, uid],
      pendingInviteCount: activePending.length,
    });
    transaction.update(openingRef, {
      memberCount: memberIds.length + 1,
      audienceUids: (opening.audienceUids ?? []).filter((audienceUid) => audienceUid !== uid),
    });
  });
  return { ok: true };
});

/**
 * Starts an invite-only, location-free spontaneous round. The selected people
 * are deliberately NOT chat members at this point: every recipient must make
 * their own explicit decision by returning the wink.
 */
exports.startSpontaneousRound = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireVerifiedAuth(request);
  await enforceRateLimit(uid, 'spontaneousRoundStart', 4, 30 * 60 * 1000);
  const rawInvitees = request.data?.inviteeUids;
  if (!Array.isArray(rawInvitees)) {
    throw new HttpsError('invalid-argument', 'Waehle mindestens eine offene Person aus.');
  }
  const inviteeUids = [...new Set(rawInvitees)];
  if (
    inviteeUids.length < 1 ||
    inviteeUids.length > SPONTANEOUS_ROUND_MAX_INVITEES ||
    inviteeUids.length !== rawInvitees.length ||
    inviteeUids.some((inviteeUid) => !validUid(inviteeUid) || inviteeUid === uid)
  ) {
    throw new HttpsError('invalid-argument', 'Die Auswahl ist ungueltig.');
  }

  const db = getFirestore();
  const openingRef = db.collection('groupOpenings').doc();
  const roundId = openingRef.id;
  const now = Date.now();
  const expireAt = Timestamp.fromMillis(now + SPONTANEOUS_ROUND_DURATION_MS);
  const hostMembershipRef = db.doc(`spontaneousRoundMemberships/${uid}`);
  const inviteRefs = inviteeUids.map((inviteeUid) =>
    db.doc(`spontaneousRoundInvites/${roundId}_${inviteeUid}`),
  );
  // Deterministic ids let the server retract a pending wink immediately when
  // its host cancels or the recipient joins a competing round. They are never
  // client-addressable: notification rules remain recipient-read-only.
  const notificationRefs = inviteeUids.map((inviteeUid) =>
    db.doc(`notifications/${roundId}_${inviteeUid}`),
  );
  const pushOutboxRef = db.collection('pushOutbox').doc();

  await db.runTransaction(async (transaction) => {
    const [hostMembershipSnapshot, hostProfileSnapshot, ...inviteeChecks] = await Promise.all([
      transaction.get(hostMembershipRef),
      transaction.get(db.doc(`publicProfiles/${uid}`)),
      ...inviteeUids.map(async (inviteeUid) => {
        const [friendshipSnapshot, presenceSnapshot, outgoingBlock, incomingBlock] =
          await Promise.all([
            transaction.get(db.doc(`friendships/${friendshipId(uid, inviteeUid)}`)),
            transaction.get(db.doc(`presence/${inviteeUid}`)),
            transaction.get(db.doc(`blocks/${uid}_${inviteeUid}`)),
            transaction.get(db.doc(`blocks/${inviteeUid}_${uid}`)),
          ]);
        return { inviteeUid, friendshipSnapshot, presenceSnapshot, outgoingBlock, incomingBlock };
      }),
    ]);

    const existingRound = hostMembershipSnapshot.data();
    const existingExpiry = existingRound?.expireAt?.toMillis?.() ?? 0;
    if (existingExpiry > now) {
      throw new HttpsError('failed-precondition', 'Du bist bereits in einer spontanen Runde.');
    }

    inviteeChecks.forEach((check) => {
      if (check.friendshipSnapshot.data()?.status !== 'accepted') {
        throw new HttpsError(
          'permission-denied',
          'Winken ist nur mit bestaetigten Freunden moeglich.',
        );
      }
      if (check.outgoingBlock.exists || check.incomingBlock.exists) {
        throw new HttpsError('permission-denied', 'Eine ausgewaehlte Person ist nicht verfuegbar.');
      }
      const presence = check.presenceSnapshot.data();
      const presenceExpiry = presence?.expireAt?.toMillis?.() ?? 0;
      if (presenceExpiry <= now || !(presence?.audienceUids ?? []).includes(uid)) {
        throw new HttpsError(
          'failed-precondition',
          'Eine ausgewaehlte Person ist nicht mehr offen.',
        );
      }
    });

    const host = contactSnapshot(uid, hostProfileSnapshot.data());
    const notificationItems = inviteeUids.map((recipientUid) => ({
      recipientUid,
      actorUid: uid,
      kind: 'spontaneous_round_invite',
      title: `${host.displayName} winkt dir zu`,
      body: 'Du bist offen. Willst du bei einer spontanen Runde dabei sein?',
      roomId: roundId,
    }));

    transaction.create(openingRef, {
      roomId: roundId,
      kind: 'spontaneous',
      status: 'active',
      hostUid: uid,
      title: 'Spontane Runde',
      memberIds: [uid],
      memberCount: 1,
      memberPreview: [host],
      audienceUids: [uid],
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      expireAt,
    });
    transaction.set(hostMembershipRef, { roundId, expireAt, createdAt: Timestamp.now() });
    // Starting a round is the host's own commitment too. Remove any existing
    // open presence immediately so it cannot collect competing winks.
    transaction.delete(db.doc(`presence/${uid}`));

    inviteeUids.forEach((recipientUid, index) => {
      transaction.create(inviteRefs[index], {
        roundId,
        hostUid: uid,
        recipientUid,
        createdAt: Timestamp.now(),
        expireAt,
      });
      transaction.create(notificationRefs[index], {
        recipientUid,
        kind: 'spontaneous_round_invite',
        title: notificationItems[index].title,
        body: notificationItems[index].body,
        roomId: roundId,
        createdAt: Timestamp.now(),
        expireAt,
      });
    });
    // The in-app invitation and its push nudge commit together. A push is only
    // a nudge; the recipient still has to open the app and accept server-side.
    transaction.create(pushOutboxRef, {
      items: notificationItems.map(pushOutboxItem),
      createdAt: Timestamp.now(),
      expireAt,
    });
  });

  return { ok: true, id: roundId };
});

/** Accepts one wink and atomically claims the recipient's sole forming round. */
exports.acceptSpontaneousRound = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireVerifiedAuth(request);
  await enforceRateLimit(uid, 'spontaneousRoundAccept', 8, 30 * 60 * 1000);
  const roundId = request.data?.roundId;
  if (!validActivityId(roundId)) {
    throw new HttpsError('invalid-argument', 'Ungueltige Runde.');
  }

  const db = getFirestore();
  const now = Date.now();
  const openingRef = db.doc(`groupOpenings/${roundId}`);
  const inviteRef = db.doc(`spontaneousRoundInvites/${roundId}_${uid}`);
  const membershipRef = db.doc(`spontaneousRoundMemberships/${uid}`);
  const roomRef = db.doc(`chats/${roundId}`);
  // A returning wink is exclusive. This bounded query makes every other
  // pending invitation unavailable in the same atomic commit, so a stale
  // notification cannot silently form a second round later.
  const pendingInvitationsQuery = db
    .collection('spontaneousRoundInvites')
    .where('recipientUid', '==', uid)
    .limit(SPONTANEOUS_ROUND_MAX_INVITEES);

  await db.runTransaction(async (transaction) => {
    const [
      openingSnapshot,
      inviteSnapshot,
      membershipSnapshot,
      presenceSnapshot,
      ownProfileSnapshot,
      roomSnapshot,
      pendingInvitationsSnapshot,
    ] = await Promise.all([
      transaction.get(openingRef),
      transaction.get(inviteRef),
      transaction.get(membershipRef),
      transaction.get(db.doc(`presence/${uid}`)),
      transaction.get(db.doc(`publicProfiles/${uid}`)),
      transaction.get(roomRef),
      transaction.get(pendingInvitationsQuery),
    ]);

    if (!openingSnapshot.exists) {
      throw new HttpsError('not-found', 'Diese Runde ist nicht mehr offen.');
    }
    const opening = openingSnapshot.data();
    const expiry = opening.expireAt?.toMillis?.() ?? 0;
    if (opening.kind !== 'spontaneous' || opening.status !== 'active' || expiry <= now) {
      throw new HttpsError('failed-precondition', 'Diese Runde ist nicht mehr offen.');
    }

    const currentMembership = membershipSnapshot.data();
    const membershipExpiry = currentMembership?.expireAt?.toMillis?.() ?? 0;
    if (membershipExpiry > now) {
      if (currentMembership.roundId === roundId) return; // idempotent retry
      throw new HttpsError(
        'failed-precondition',
        'Du bist bereits in einer Runde. Verlasse sie zuerst, bevor du beitrittst.',
      );
    }

    const invitation = inviteSnapshot.data();
    if (
      !inviteSnapshot.exists ||
      invitation.recipientUid !== uid ||
      invitation.roundId !== roundId ||
      (invitation.expireAt?.toMillis?.() ?? 0) <= now
    ) {
      throw new HttpsError('permission-denied', 'Diese Einladung ist nicht mehr verfuegbar.');
    }

    const hostUid = opening.hostUid;
    if (!validUid(hostUid)) {
      throw new HttpsError('failed-precondition', 'Diese Runde ist nicht mehr verfuegbar.');
    }
    const [friendshipSnapshot, outgoingBlock, incomingBlock] = await Promise.all([
      transaction.get(db.doc(`friendships/${friendshipId(uid, hostUid)}`)),
      transaction.get(db.doc(`blocks/${uid}_${hostUid}`)),
      transaction.get(db.doc(`blocks/${hostUid}_${uid}`)),
    ]);
    if (
      friendshipSnapshot.data()?.status !== 'accepted' ||
      outgoingBlock.exists ||
      incomingBlock.exists
    ) {
      throw new HttpsError('permission-denied', 'Diese Einladung ist nicht mehr verfuegbar.');
    }
    const presence = presenceSnapshot.data();
    if (
      (presence?.expireAt?.toMillis?.() ?? 0) <= now ||
      !(presence?.audienceUids ?? []).includes(hostUid)
    ) {
      throw new HttpsError('failed-precondition', 'Du bist nicht mehr offen.');
    }

    const memberIds = Array.isArray(opening.memberIds)
      ? opening.memberIds.filter(validUid).slice(0, SPONTANEOUS_ROUND_MAX_INVITEES + 1)
      : [];
    if (!memberIds.includes(hostUid) || memberIds.includes(uid)) {
      throw new HttpsError('failed-precondition', 'Diese Runde ist nicht mehr verfuegbar.');
    }
    if (memberIds.length >= SPONTANEOUS_ROUND_MAX_INVITEES + 1) {
      throw new HttpsError('resource-exhausted', 'Diese Runde ist bereits voll.');
    }
    if (roomSnapshot.exists) {
      const room = roomSnapshot.data();
      if (room.type !== 'group' || room.roundStatus !== 'forming') {
        throw new HttpsError('failed-precondition', 'Diese Runde ist nicht mehr verfuegbar.');
      }
    }

    const member = contactSnapshot(uid, ownProfileSnapshot.data());
    const nextMemberIds = [...memberIds, uid];
    const previousPreview = Array.isArray(opening.memberPreview)
      ? opening.memberPreview.filter((item) => item && typeof item.uid === 'string')
      : [];
    const nextPreview = [...previousPreview, member].slice(0, SPONTANEOUS_ROUND_MAX_INVITEES + 1);
    const expireAt = Timestamp.fromMillis(expiry);

    if (!roomSnapshot.exists) {
      transaction.create(roomRef, {
        type: 'group',
        roundStatus: 'forming',
        creatorUid: hostUid,
        title: 'Spontane Runde',
        memberIds: nextMemberIds,
        adminUids: [hostUid],
        messageCount: 0,
        readCount: {},
        createdAt: Timestamp.now(),
        expireAt,
      });
    } else {
      transaction.update(roomRef, { memberIds: nextMemberIds, expireAt });
    }
    transaction.update(openingRef, {
      memberIds: nextMemberIds,
      memberCount: nextMemberIds.length,
      memberPreview: nextPreview,
      audienceUids: nextMemberIds,
      updatedAt: Timestamp.now(),
    });
    transaction.set(membershipRef, { roundId, expireAt, createdAt: Timestamp.now() });
    pendingInvitationsSnapshot.docs.forEach((pendingInvite) => {
      transaction.delete(pendingInvite.ref);
      const pendingRoundId = pendingInvite.data().roundId;
      if (validActivityId(pendingRoundId)) {
        transaction.delete(db.doc(`notifications/${pendingRoundId}_${uid}`));
      }
    });
    // A returned wink is a real availability commitment. Delete the server
    // presence now; the client closes its local state after this callable too.
    transaction.delete(presenceSnapshot.ref);
  });

  return { ok: true };
});

/**
 * A one-off, recipient-authorized preview for the confirmation sheet.
 * Pending invites deliberately remain server-only: this exposes only the
 * current, compact member preview after proving that the caller owns the
 * unexpired invitation. It is not a listener and cannot be used to enumerate
 * rounds or their invitees.
 */
exports.getSpontaneousRoundInvitePreview = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireVerifiedAuth(request);
  await enforceRateLimit(uid, 'spontaneousRoundPreview', 30, 5 * 60 * 1000);
  const roundId = request.data?.roundId;
  if (!validActivityId(roundId)) {
    throw new HttpsError('invalid-argument', 'Ungueltige Runde.');
  }

  const db = getFirestore();
  const now = Date.now();
  const [inviteSnapshot, openingSnapshot] = await Promise.all([
    db.doc(`spontaneousRoundInvites/${roundId}_${uid}`).get(),
    db.doc(`groupOpenings/${roundId}`).get(),
  ]);
  const invite = inviteSnapshot.data();
  const opening = openingSnapshot.data();
  const expiry = opening?.expireAt?.toMillis?.() ?? 0;
  if (
    !inviteSnapshot.exists ||
    !openingSnapshot.exists ||
    invite?.recipientUid !== uid ||
    invite?.roundId !== roundId ||
    (invite.expireAt?.toMillis?.() ?? 0) <= now ||
    opening?.kind !== 'spontaneous' ||
    opening?.status !== 'active' ||
    expiry <= now
  ) {
    // Do not reveal whether a guessed id once referred to a real round.
    return { state: 'unavailable' };
  }

  const hostUid = opening.hostUid;
  if (!validUid(hostUid)) return { state: 'unavailable' };
  const [friendshipSnapshot, outgoingBlock, incomingBlock] = await Promise.all([
    db.doc(`friendships/${friendshipId(uid, hostUid)}`).get(),
    db.doc(`blocks/${uid}_${hostUid}`).get(),
    db.doc(`blocks/${hostUid}_${uid}`).get(),
  ]);
  if (
    friendshipSnapshot.data()?.status !== 'accepted' ||
    outgoingBlock.exists ||
    incomingBlock.exists
  ) {
    return { state: 'unavailable' };
  }

  const memberIds = Array.isArray(opening.memberIds)
    ? opening.memberIds.filter(validUid).slice(0, SPONTANEOUS_ROUND_MAX_INVITEES + 1)
    : [];
  const memberPreview = Array.isArray(opening.memberPreview)
    ? opening.memberPreview
        .flatMap((member) => {
          if (
            !member ||
            !validUid(member.uid) ||
            typeof member.displayName !== 'string' ||
            typeof member.initials !== 'string'
          ) {
            return [];
          }
          return [
            {
              uid: member.uid,
              displayName: member.displayName.slice(0, 50),
              initials: member.initials.slice(0, 8),
            },
          ];
        })
        .slice(0, 4)
    : [];
  const host = memberPreview.find((member) => member.uid === hostUid);
  if (!memberIds.includes(hostUid) || !host) return { state: 'unavailable' };

  return {
    state: 'available',
    roundId,
    host,
    memberCount: memberIds.length,
    memberPreview,
    expiresAt: expiry,
  };
});

/** A quiet decline removes only the caller's private invitation and card. */
exports.declineSpontaneousRound = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireVerifiedAuth(request);
  await enforceRateLimit(uid, 'spontaneousRoundDecline', 12, 30 * 60 * 1000);
  const roundId = request.data?.roundId;
  if (!validActivityId(roundId)) {
    throw new HttpsError('invalid-argument', 'Ungueltige Runde.');
  }

  const db = getFirestore();
  const inviteRef = db.doc(`spontaneousRoundInvites/${roundId}_${uid}`);
  const notificationRef = db.doc(`notifications/${roundId}_${uid}`);
  let declined = false;
  await db.runTransaction(async (transaction) => {
    const [inviteSnapshot, notificationSnapshot] = await Promise.all([
      transaction.get(inviteRef),
      transaction.get(notificationRef),
    ]);
    if (inviteSnapshot.exists) {
      const invite = inviteSnapshot.data();
      if (invite.recipientUid !== uid || invite.roundId !== roundId) {
        throw new HttpsError('permission-denied', 'Diese Einladung ist nicht verfuegbar.');
      }
      transaction.delete(inviteRef);
      declined = true;
    }
    if (
      notificationSnapshot.exists &&
      notificationSnapshot.data().recipientUid === uid &&
      notificationSnapshot.data().kind === 'spontaneous_round_invite' &&
      notificationSnapshot.data().roomId === roundId
    ) {
      transaction.delete(notificationRef);
    }
  });
  return { ok: true, state: declined ? 'declined' : 'unavailable' };
});

/** Host cancellation removes the entire round; another member can leave quietly. */
exports.leaveSpontaneousRound = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireVerifiedAuth(request);
  await enforceRateLimit(uid, 'spontaneousRoundLeave', 12, 30 * 60 * 1000);
  const roundId = request.data?.roundId;
  if (!validActivityId(roundId)) {
    throw new HttpsError('invalid-argument', 'Ungueltige Runde.');
  }

  const db = getFirestore();
  const openingRef = db.doc(`groupOpenings/${roundId}`);
  const roomRef = db.doc(`chats/${roundId}`);
  const pendingInvitationsQuery = db
    .collection('spontaneousRoundInvites')
    .where('roundId', '==', roundId)
    .limit(SPONTANEOUS_ROUND_MAX_INVITEES);
  const now = Date.now();
  await db.runTransaction(async (transaction) => {
    const [openingSnapshot, roomSnapshot, pendingInvitationsSnapshot] = await Promise.all([
      transaction.get(openingRef),
      transaction.get(roomRef),
      transaction.get(pendingInvitationsQuery),
    ]);
    if (!openingSnapshot.exists) return;
    const opening = openingSnapshot.data();
    const memberIds = Array.isArray(opening.memberIds) ? opening.memberIds.filter(validUid) : [];
    if (
      opening.kind !== 'spontaneous' ||
      opening.status !== 'active' ||
      (opening.expireAt?.toMillis?.() ?? 0) <= now ||
      !memberIds.includes(uid)
    ) {
      return;
    }

    if (opening.hostUid === uid) {
      transaction.delete(openingRef);
      pendingInvitationsSnapshot.docs.forEach((pendingInvite) => {
        transaction.delete(pendingInvite.ref);
        transaction.delete(db.doc(`notifications/${roundId}_${pendingInvite.data().recipientUid}`));
      });
      memberIds.forEach((memberUid) => {
        transaction.delete(db.doc(`spontaneousRoundMemberships/${memberUid}`));
      });
      if (roomSnapshot.exists && roomSnapshot.data().roundStatus === 'forming') {
        transaction.update(roomRef, { expireAt: Timestamp.fromMillis(now) });
      }
      return;
    }

    const nextMemberIds = memberIds.filter((memberUid) => memberUid !== uid);
    const nextPreview = Array.isArray(opening.memberPreview)
      ? opening.memberPreview.filter((item) => item?.uid !== uid)
      : [];
    transaction.update(openingRef, {
      memberIds: nextMemberIds,
      memberCount: nextMemberIds.length,
      memberPreview: nextPreview,
      audienceUids: nextMemberIds,
      updatedAt: Timestamp.now(),
    });
    transaction.delete(db.doc(`spontaneousRoundMemberships/${uid}`));
    if (roomSnapshot.exists && roomSnapshot.data().roundStatus === 'forming') {
      transaction.update(roomRef, { memberIds: nextMemberIds });
    }
  });

  return { ok: true };
});

exports.renameChatRoom = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireVerifiedAuth(request);
  await enforceRateLimit(uid, 'groupMutations', 20, HOUR_MS);
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
  const [friends, activeGroups] = await Promise.all([
    directFriendUids(db, uid),
    db
      .collection('chats')
      .where('creatorUid', '==', uid)
      .where('type', '==', 'group')
      .where('expireAt', '>', Timestamp.now())
      .limit(MAX_ACTIVE_GROUP_CHATS_PER_CREATOR)
      .get(),
  ]);
  if (activeGroups.size >= MAX_ACTIVE_GROUP_CHATS_PER_CREATOR) {
    throw new HttpsError(
      'resource-exhausted',
      `Du kannst maximal ${MAX_ACTIVE_GROUP_CHATS_PER_CREATOR} aktive Planungs-Chats gleichzeitig erstellen.`,
    );
  }
  const allowedUids = new Set([uid, ...friends]);
  if (memberUids.some((memberUid) => !allowedUids.has(memberUid))) {
    throw new HttpsError(
      'permission-denied',
      'Planungen können nur mit bestätigten Freunden gestartet werden.',
    );
  }
  const roomRef = db.collection('chats').doc();
  await roomRef.create({
    type: 'group',
    creatorUid: uid,
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
  await enforceRateLimit(uid, 'groupMutations', 20, HOUR_MS);
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
  await enforceRateLimit(uid, 'groupMutations', 20, HOUR_MS);
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

/**
 * Targeted invitation into a planning round.
 *
 * "Offen für Dazustoßer" answers "how do people find us"; this answers "can we
 * add Lisa" — a different question, and the reason it is a separate path: the
 * invitee makes their own decision instead of being silently added to a room
 * full of messages they never agreed to see. The invitation is a server-owned
 * document; the notification is only its delivery vehicle.
 */
function groupChatInviteId(roomId, inviteeUid) {
  return `${roomId}_${inviteeUid}`;
}

function groupChatInviteNotificationId(roomId, inviteeUid) {
  return `groupinvite_${roomId}_${inviteeUid}`;
}

function pendingGroupChatInvitesQuery(db, roomId) {
  // A room can reserve at most GROUP_CHAT_MAX_MEMBERS seats, so this bounded
  // query is both the authoritative reservation list and a hard cost cap.
  return db
    .collection('groupChatInvites')
    .where('roomId', '==', roomId)
    .where('status', '==', 'pending')
    .limit(GROUP_CHAT_MAX_MEMBERS);
}

function roomPendingInviteCount(room) {
  return Number.isInteger(room?.pendingInviteCount) ? Math.max(0, room.pendingInviteCount) : 0;
}

exports.inviteToGroupChat = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireVerifiedAuth(request);
  await enforceRateLimit(uid, 'groupInvite', 30, HOUR_MS);
  const roomId = request.data?.roomId;
  const rawInvitees = request.data?.inviteeUids;
  if (!validActivityId(roomId) || !Array.isArray(rawInvitees)) {
    throw new HttpsError('invalid-argument', 'Ungültige Anfrage.');
  }
  const inviteeUids = [...new Set(rawInvitees)];
  if (
    inviteeUids.length < 1 ||
    inviteeUids.length > GROUP_CHAT_MAX_MEMBERS ||
    inviteeUids.some((inviteeUid) => !validUid(inviteeUid) || inviteeUid === uid)
  ) {
    throw new HttpsError('invalid-argument', 'Die Auswahl ist ungültig.');
  }

  const db = getFirestore();
  const now = Date.now();
  const roomRef = db.doc(`chats/${roomId}`);
  const inviterProfileSnapshot = await db.doc(`users/${uid}`).get();
  const inviterName = cleanString(
    inviterProfileSnapshot.data()?.displayName ?? 'Ein Freund',
    50,
    'Name',
    true,
  );
  const expireAt = Timestamp.fromMillis(now + GROUP_CHAT_INVITE_TTL_MS);
  const result = await db.runTransaction(async (transaction) => {
    const targetChecks = inviteeUids.map(async (inviteeUid) => {
      const [friendshipSnapshot, outgoingBlock, incomingBlock] = await Promise.all([
        transaction.get(db.doc(`friendships/${friendshipId(uid, inviteeUid)}`)),
        transaction.get(db.doc(`blocks/${uid}_${inviteeUid}`)),
        transaction.get(db.doc(`blocks/${inviteeUid}_${uid}`)),
      ]);
      return { inviteeUid, friendshipSnapshot, outgoingBlock, incomingBlock };
    });
    const [roomSnapshot, pendingSnapshot, checks] = await Promise.all([
      transaction.get(roomRef),
      transaction.get(pendingGroupChatInvitesQuery(db, roomId)),
      Promise.all(targetChecks),
    ]);
    if (!roomSnapshot.exists) throw new HttpsError('not-found', 'Planung nicht gefunden.');
    const room = roomSnapshot.data();
    requireGroupAdmin(room, uid);
    if ((room.expireAt?.toMillis?.() ?? 0) <= now) {
      throw new HttpsError('failed-precondition', 'Diese Planung ist abgelaufen.');
    }
    if (checks.some((check) => check.friendshipSnapshot.data()?.status !== 'accepted')) {
      throw new HttpsError(
        'permission-denied',
        'Du kannst nur bestätigte Freunde in eine Planung einladen.',
      );
    }

    const memberIds = Array.isArray(room.memberIds) ? room.memberIds : [];
    const activePendingUids = new Set();
    const selectedInviteIds = new Set(
      inviteeUids.map((inviteeUid) => groupChatInviteId(roomId, inviteeUid)),
    );
    const expiredUnselected = [];
    pendingSnapshot.docs.forEach((entry) => {
      const pending = entry.data();
      if ((pending.expireAt?.toMillis?.() ?? 0) > now && validUid(pending.inviteeUid)) {
        activePendingUids.add(pending.inviteeUid);
      } else if (!selectedInviteIds.has(entry.id)) {
        expiredUnselected.push(entry);
      }
    });

    const invited = [];
    const skipped = [];
    for (const check of checks) {
      if (memberIds.includes(check.inviteeUid) || activePendingUids.has(check.inviteeUid)) {
        skipped.push(check.inviteeUid);
        continue;
      }
      if (memberIds.length + activePendingUids.size + invited.length >= GROUP_CHAT_MAX_MEMBERS) {
        throw new HttpsError('failed-precondition', 'Diese Planung ist voll.');
      }
      if (check.outgoingBlock.exists || check.incomingBlock.exists) {
        skipped.push(check.inviteeUid);
        continue;
      }
      invited.push(check.inviteeUid);
    }

    // Updating this same room document serializes reservation attempts: two
    // admins cannot both reserve the final seats from an outdated snapshot.
    expiredUnselected.forEach((entry) => {
      transaction.delete(entry.ref);
      const inviteeUid = entry.data().inviteeUid;
      if (validUid(inviteeUid)) {
        transaction.delete(
          db.doc(`notifications/${groupChatInviteNotificationId(roomId, inviteeUid)}`),
        );
      }
    });
    const roomTitle = cleanString(room.title ?? 'Planung', 80, 'Name der Planung', true);
    const notificationItems = invited.map((inviteeUid) => ({
      recipientUid: inviteeUid,
      actorUid: uid,
      kind: 'group_chat_invite',
      title: `${inviterName} lädt dich ein`,
      body: `Planung „${roomTitle}“`,
      roomId,
    }));
    invited.forEach((inviteeUid, index) => {
      transaction.set(db.doc(`groupChatInvites/${groupChatInviteId(roomId, inviteeUid)}`), {
        roomId,
        inviteeUid,
        inviterUid: uid,
        status: 'pending',
        createdAt: Timestamp.now(),
        expireAt,
      });
      transaction.set(
        db.doc(`notifications/${groupChatInviteNotificationId(roomId, inviteeUid)}`),
        {
          recipientUid: inviteeUid,
          kind: 'group_chat_invite',
          title: notificationItems[index].title,
          body: notificationItems[index].body,
          roomId,
          createdAt: Timestamp.now(),
          expireAt: Timestamp.fromMillis(now + NOTIFICATION_RETENTION_MS),
        },
      );
    });
    if (invited.length || expiredUnselected.length) {
      transaction.update(roomRef, {
        pendingInviteCount: activePendingUids.size + invited.length,
      });
    }

    return { invited: invited.length, skipped: skipped.length, notificationItems };
  });

  if (result.notificationItems.length) await queuePushOnly(result.notificationItems);
  return { ok: true, invited: result.invited, skipped: result.skipped };
});

/**
 * The invitee's own decision. Every guard from the invitation is re-checked at
 * accept time — membership, capacity, expiry and blocks can all have changed in
 * the days between the invite and the tap.
 */
exports.respondToGroupChatInvite = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireVerifiedAuth(request);
  await enforceRateLimit(uid, 'groupInviteResponse', 30, HOUR_MS);
  const roomId = request.data?.roomId;
  const accept = request.data?.accept === true;
  if (!validActivityId(roomId)) {
    throw new HttpsError('invalid-argument', 'Ungültige Anfrage.');
  }

  const db = getFirestore();
  const now = Date.now();
  const inviteRef = db.doc(`groupChatInvites/${groupChatInviteId(roomId, uid)}`);
  const roomRef = db.doc(`chats/${roomId}`);
  const notificationRef = db.doc(`notifications/${groupChatInviteNotificationId(roomId, uid)}`);

  const outcome = await db.runTransaction(async (transaction) => {
    const [inviteSnapshot, roomSnapshot] = await Promise.all([
      transaction.get(inviteRef),
      transaction.get(roomRef),
    ]);
    const invite = inviteSnapshot.data();
    const releaseReservation = () => {
      if (!roomSnapshot.exists || invite?.status !== 'pending') return;
      transaction.update(roomRef, {
        pendingInviteCount: Math.max(0, roomPendingInviteCount(roomSnapshot.data()) - 1),
      });
    };
    if (
      !inviteSnapshot.exists ||
      invite.inviteeUid !== uid ||
      invite.status !== 'pending' ||
      (invite.expireAt?.toMillis?.() ?? 0) <= now
    ) {
      // Throwing inside a Firestore transaction rolls back its deletes. Return
      // the error after commit so a stale card is actually retracted.
      if (inviteSnapshot.exists) transaction.delete(inviteRef);
      transaction.delete(notificationRef);
      releaseReservation();
      return { code: 'not-found', message: 'Diese Einladung ist nicht mehr gültig.' };
    }

    if (!accept) {
      transaction.delete(inviteRef);
      transaction.delete(notificationRef);
      releaseReservation();
      return { ok: true };
    }

    if (!roomSnapshot.exists) {
      transaction.delete(inviteRef);
      transaction.delete(notificationRef);
      return { code: 'not-found', message: 'Diese Planung gibt es nicht mehr.' };
    }
    const room = roomSnapshot.data();
    if (room.type !== 'group' || (room.expireAt?.toMillis?.() ?? 0) <= now) {
      transaction.delete(inviteRef);
      transaction.delete(notificationRef);
      releaseReservation();
      return { code: 'failed-precondition', message: 'Diese Planung ist abgelaufen.' };
    }
    const memberIds = Array.isArray(room.memberIds) ? room.memberIds : [];
    if (memberIds.includes(uid)) {
      transaction.delete(inviteRef);
      transaction.delete(notificationRef);
      releaseReservation();
      return { ok: true };
    }
    if (memberIds.length >= GROUP_CHAT_MAX_MEMBERS) {
      // Deliberately keeps the invitation: the round may free a seat again, and
      // silently dropping it would make a full round look like a revoked invite.
      return { code: 'failed-precondition', message: 'Diese Planung ist voll.' };
    }

    const inviterUid = invite.inviterUid;
    const [friendshipSnapshot, outgoingBlock, incomingBlock] = await Promise.all([
      transaction.get(db.doc(`friendships/${friendshipId(uid, inviterUid)}`)),
      transaction.get(db.doc(`blocks/${uid}_${inviterUid}`)),
      transaction.get(db.doc(`blocks/${inviterUid}_${uid}`)),
    ]);
    if (
      friendshipSnapshot.data()?.status !== 'accepted' ||
      outgoingBlock.exists ||
      incomingBlock.exists
    ) {
      transaction.delete(inviteRef);
      transaction.delete(notificationRef);
      releaseReservation();
      return { code: 'permission-denied', message: 'Diese Einladung ist nicht mehr verfügbar.' };
    }

    transaction.update(roomRef, {
      memberIds: [...memberIds, uid],
      pendingInviteCount: Math.max(0, roomPendingInviteCount(room) - 1),
    });
    transaction.delete(inviteRef);
    transaction.delete(notificationRef);
    return { ok: true };
  });

  if (outcome.code) throw new HttpsError(outcome.code, outcome.message);

  return { ok: true };
});

function chatMessageFingerprint(text) {
  return createHash('sha256')
    .update(text.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('de-DE'))
    .digest('hex');
}

function firestoreMillis(value) {
  return value?.toMillis?.() ?? (Number.isFinite(value) ? value : 0);
}

function chatInternalRef(roomRef) {
  // This state is deliberately a room-local server subdocument rather than a
  // top-level rateLimits document. Clients cannot read it, so its per-message
  // updates do not fan out to the room-list listeners.
  return roomRef.collection('chatInternal').doc('summary');
}

async function flushChatSummary(roomId) {
  if (typeof roomId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(roomId)) return;
  const db = getFirestore();
  const roomRef = db.doc(`chats/${roomId}`);
  const internalRef = chatInternalRef(roomRef);

  await db.runTransaction(async (transaction) => {
    const [roomSnapshot, internalSnapshot] = await Promise.all([
      transaction.get(roomRef),
      transaction.get(internalRef),
    ]);
    if (!internalSnapshot.exists) return;
    if (!roomSnapshot.exists) {
      transaction.delete(internalRef);
      return;
    }

    const room = roomSnapshot.data();
    const internal = internalSnapshot.data();
    const currentMessageCount = Number.isSafeInteger(room.messageCount) ? room.messageCount : 0;
    const bufferedMessageCount = Number.isSafeInteger(internal.messageCount)
      ? internal.messageCount
      : currentMessageCount;
    if (bufferedMessageCount <= currentMessageCount) {
      if (internal.flushAt) transaction.update(internalRef, { flushAt: FieldValue.delete() });
      return;
    }

    const lastMessage = internal.lastMessage;
    if (
      !lastMessage ||
      typeof lastMessage.text !== 'string' ||
      typeof lastMessage.authorId !== 'string' ||
      typeof lastMessage.authorName !== 'string' ||
      !lastMessage.at?.toMillis
    ) {
      // The document is server-owned; this is only a defensive escape hatch so
      // a malformed legacy/internal document can never make the task retry forever.
      transaction.update(internalRef, { flushAt: FieldValue.delete() });
      return;
    }

    const update = {
      lastMessage,
      messageCount: bufferedMessageCount,
      ...(Number.isSafeInteger(internal.lastPushAtMs)
        ? { lastPushAt: Timestamp.fromMillis(internal.lastPushAtMs) }
        : {}),
      ...(room.type === 'group' && Number.isSafeInteger(internal.roomExpireAtMs)
        ? { expireAt: Timestamp.fromMillis(internal.roomExpireAtMs) }
        : {}),
    };
    transaction.update(roomRef, update);
    transaction.update(internalRef, { flushAt: FieldValue.delete() });
  });
}

exports.flushChatSummary = onTaskDispatched(CHAT_SUMMARY_TASK_OPTS, async (request) => {
  await flushChatSummary(request.data?.roomId);
});

async function enqueueChatSummaryFlush(roomId) {
  if (RUNNING_FUNCTIONS_EMULATOR) {
    // Keep chat summaries synchronous in the integration suite so those tests
    // do not depend on queue timing; task queues are covered separately.
    await flushChatSummary(roomId);
    return;
  }

  try {
    await taskQueue('flushChatSummary').enqueue(
      { roomId },
      { scheduleDelaySeconds: CHAT_SUMMARY_COALESCE_SECONDS },
    );
  } catch (error) {
    // The message has already committed. Preserve correctness if queue setup is
    // incomplete or temporarily unavailable; this rare fallback costs one normal
    // room update instead of making the sender retry and possibly duplicate it.
    console.error('[chat] Summary-Task konnte nicht eingeplant werden:', error);
    await flushChatSummary(roomId);
  }
}

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
  const clientMessageId = request.data?.clientMessageId;
  if (
    clientMessageId != null &&
    (typeof clientMessageId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(clientMessageId))
  ) {
    throw new HttpsError('invalid-argument', 'Ungültige Nachrichten-ID.');
  }

  const db = getFirestore();
  const roomRef = db.doc(`chats/${roomId}`);
  const rateRef = db.doc(`rateLimits/${uid}`);
  const internalRef = chatInternalRef(roomRef);
  const profileRef = db.doc(`publicProfiles/${uid}`);
  // Stable client ids make a timed-out callable retry safe. Older clients keep
  // their generated server ids, so this remains fully backwards-compatible.
  const messageRef = clientMessageId
    ? roomRef.collection('messages').doc(clientMessageId)
    : roomRef.collection('messages').doc();
  const pushOutboxRef = db.collection('pushOutbox').doc();
  const now = Date.now();
  const windowStart = Math.floor(now / CHAT_RATE_WINDOW_MS) * CHAT_RATE_WINDOW_MS;
  const fingerprint = chatMessageFingerprint(text);

  const scheduleSummaryFlush = await db.runTransaction(async (transaction) => {
    const [roomSnapshot, rateSnapshot, internalSnapshot, profileSnapshot, messageSnapshot] =
      await Promise.all([
        transaction.get(roomRef),
        transaction.get(rateRef),
        transaction.get(internalRef),
        transaction.get(profileRef),
        transaction.get(messageRef),
      ]);
    if (messageSnapshot.exists) {
      if (messageSnapshot.data()?.authorId !== uid) {
        throw new HttpsError('permission-denied', 'Diese Nachrichten-ID ist bereits vergeben.');
      }
      return false;
    }
    if (!roomSnapshot.exists) {
      throw new HttpsError('not-found', 'Chat nicht gefunden.');
    }

    const room = roomSnapshot.data();
    if (!Array.isArray(room.memberIds) || !room.memberIds.includes(uid)) {
      throw new HttpsError('permission-denied', 'Du bist kein Mitglied dieses Chats.');
    }
    const internal = internalSnapshot.exists ? internalSnapshot.data() : {};
    const committedMessageCount = Number.isSafeInteger(room.messageCount) ? room.messageCount : 0;
    const bufferedMessageCount = Number.isSafeInteger(internal.messageCount)
      ? internal.messageCount
      : committedMessageCount;
    const messageCount = Math.max(committedMessageCount, bufferedMessageCount) + 1;
    const recipients = room.memberIds.filter((memberUid) => memberUid !== uid);
    const lastPushAt = Number.isSafeInteger(internal.lastPushAtMs)
      ? internal.lastPushAtMs
      : firestoreMillis(room.lastPushAt);
    const shouldQueuePush = recipients.length > 0 && now - lastPushAt >= CHAT_PUSH_COOLDOWN_MS;
    const roomExpiry = firestoreMillis(room.expireAt);
    if (roomExpiry <= now) {
      throw new HttpsError('failed-precondition', 'Dieser Chat ist abgelaufen.');
    }

    const rate = rateSnapshot.exists ? rateSnapshot.data() : {};
    const count = rate.windowStart === windowStart ? (rate.count ?? 0) : 0;
    if (count >= CHAT_MESSAGES_PER_WINDOW) {
      throw new HttpsError('resource-exhausted', 'Zu viele Nachrichten. Bitte kurz warten.');
    }
    const lastMessageAt = Number.isSafeInteger(rate.lastMessageAt) ? rate.lastMessageAt : 0;
    if (lastMessageAt && now - lastMessageAt < CHAT_MIN_MESSAGE_INTERVAL_MS) {
      throw new HttpsError(
        'resource-exhausted',
        'Bitte sende Nachrichten nicht mehrfach so schnell.',
      );
    }
    const duplicateCount =
      rate.lastMessageFingerprint === fingerprint && now - lastMessageAt <= CHAT_DUPLICATE_WINDOW_MS
        ? (Number.isSafeInteger(rate.duplicateCount) ? rate.duplicateCount : 0) + 1
        : 1;
    if (duplicateCount > CHAT_MAX_IDENTICAL_MESSAGES_PER_WINDOW) {
      throw new HttpsError(
        'resource-exhausted',
        'Diese Nachricht wurde gerade mehrfach gesendet. Bitte kurz warten.',
      );
    }
    const roomCount =
      internal.roomRateWindowStart === windowStart
        ? Number.isSafeInteger(internal.roomRateCount)
          ? internal.roomRateCount
          : 0
        : 0;
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
    const formingRound = room.type === 'group' && room.roundStatus === 'forming';
    const messageExpiry = formingRound
      ? roomExpiry
      : room.type === 'group'
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
        lastMessageAt: now,
        lastMessageFingerprint: fingerprint,
        duplicateCount,
        expireAt: Timestamp.fromMillis(windowStart + CHAT_RATE_WINDOW_MS),
      },
      { merge: true },
    );
    const scheduledFlushAt = firestoreMillis(internal.flushAt);
    const shouldScheduleSummary = scheduledFlushAt <= now;
    transaction.set(
      internalRef,
      {
        messageCount,
        lastMessage: {
          text,
          authorId: uid,
          authorName: serverAuthorName,
          at: messageCreatedAt,
        },
        roomRateWindowStart: windowStart,
        roomRateCount: roomCount + 1,
        ...(shouldQueuePush ? { lastPushAtMs: now } : {}),
        ...(room.type === 'group' && !formingRound
          ? { roomExpireAtMs: now + GROUP_RETENTION_MS }
          : {}),
        ...(shouldScheduleSummary
          ? { flushAt: Timestamp.fromMillis(now + CHAT_SUMMARY_COALESCE_SECONDS * 1000) }
          : {}),
        // The internal state survives long enough for a retry and the one-minute
        // room rate window, then TTL removes it even if the parent room expired.
        expireAt: Timestamp.fromMillis(now + CHAT_RATE_WINDOW_MS),
      },
      { merge: true },
    );

    // Chat push is an outbox-only signal: it does not create N notification
    // documents. The client updates a local badge and later reconciles the
    // authoritative room summary on foreground or when the list is opened.
    if (shouldQueuePush) {
      transaction.create(pushOutboxRef, {
        items: recipients.map((recipientUid) =>
          pushOutboxItem({
            recipientUid,
            actorUid: uid,
            kind: 'chat_message',
            title: 'Neue Nachricht',
            body: 'Öffne Como, um sie zu lesen.',
            roomId,
            messageCount,
            ...(room.type === 'activity' ? { activityId: roomId } : {}),
          }),
        ),
        createdAt: messageCreatedAt,
        expireAt: Timestamp.fromMillis(now + NOTIFICATION_RETENTION_MS),
      });
    }
    return shouldScheduleSummary;
  });

  if (scheduleSummaryFlush) await enqueueChatSummaryFlush(roomId);

  // No per-recipient Firestore notification documents are created for chat.
  // Push data contains only room metadata; it carries no chat text.

  return { ok: true, id: messageRef.id };
}

exports.sendChatMessage = onCall(CALLABLE_OPTS, (request) => createChatMessage(request, 'text'));

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
exports.withdrawSafetyCompanion = onCall(CALLABLE_OPTS, async (request) => {
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
});

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
  const session = sessionSnapshot.val() ?? {};
  const audience = session.audienceUids ?? {};
  const companionUids = Object.keys(audience).filter(validUid);
  const writes = { [`heimwege/${uid}`]: null };
  companionUids.forEach((companionUid) => {
    writes[`heimwegeIndex/${companionUid}/${uid}`] = null;
  });
  await getDatabase().ref().update(writes);
  if (companionUids.length) {
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
    );
  }
  return { ok: true };
});

// A deliberate owner delete ends sharing immediately without a callable cold
// start. The deleted snapshot still carries the last explicit audience,
// allowing the trusted backend to clean every server-owned fan-out entry.
// A deletion has no trustworthy semantic reason (arrival, timeout, revoked
// access, rollback or account deletion), so only the explicit callable above
// may create a "sicher angekommen" notification.
exports.cleanupSafetyIndexOnSessionDeleted = onValueDeleted(
  { ref: 'heimwege/{uid}', ...RTDB_TRIGGER_OPTS },
  async (event) => {
    const session = event.data.val() ?? {};
    const companionUids = Object.keys(session.audienceUids ?? {}).filter(validUid);
    const writes = {};
    companionUids.forEach((companionUid) => {
      writes[`heimwegeIndex/${companionUid}/${event.params.uid}`] = null;
    });
    if (Object.keys(writes).length) await getDatabase().ref().update(writes);
  },
);

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
async function updateJourneyUnderwayStatus(
  activityId,
  uid,
  underway,
  { removedLocationUpdatedAt } = {},
) {
  const db = getFirestore();
  const activityRef = db.doc(`activities/${activityId}`);
  const stateRef = activityRef.collection('journeyStates').doc(uid);
  let locationUpdatedAt;
  if (underway) {
    const locationSnapshot = await getDatabase()
      .ref(`journeys/${activityId}/locations/${uid}`)
      .get();
    locationUpdatedAt = Number(locationSnapshot.val()?.updatedAt);
    if (!Number.isFinite(locationUpdatedAt)) {
      throw new HttpsError('failed-precondition', 'Deine Anreise ist nicht mehr aktiv.');
    }
  }

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
    // A delayed onDisconnect deletion may arrive after the device has already
    // published a newer location for the same activity. Its stale deletion must
    // never clear the newer journey's location-free map summary.
    if (
      !underway &&
      wasUnderway &&
      Number.isFinite(removedLocationUpdatedAt) &&
      Number(stateSnapshot.data()?.locationUpdatedAt) > removedLocationUpdatedAt
    ) {
      return false;
    }
    if (wasUnderway === underway) return false;

    const currentCount = Number.isInteger(activity.journeyUnderwayCount)
      ? Math.max(0, activity.journeyUnderwayCount)
      : 0;
    const nextCount = Math.max(0, currentCount + (underway ? 1 : -1));

    if (underway) {
      transaction.set(stateRef, {
        startedAt: Timestamp.now(),
        locationUpdatedAt,
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
  { ref: 'journeys/{activityId}/locations/{uid}', ...RTDB_TRIGGER_OPTS },
  async (event) => {
    const removedLocationUpdatedAt = Number(event.data?.val()?.updatedAt);
    const currentLocation = await getDatabase()
      .ref(`journeys/${event.params.activityId}/locations/${event.params.uid}`)
      .get();
    if (currentLocation.exists()) return;
    await updateJourneyUnderwayStatus(event.params.activityId, event.params.uid, false, {
      removedLocationUpdatedAt,
    });
  },
);

exports.updateOwnProfile = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireAuth(request);
  const displayName = cleanString(request.data?.displayName, 50, 'Der Anzeigename', true);
  if (displayName.length < 2) {
    throw new HttpsError(
      'invalid-argument',
      'Der Anzeigename muss zwischen 2 und 50 Zeichen lang sein.',
    );
  }

  const wantsAvatar = Object.prototype.hasOwnProperty.call(request.data ?? {}, 'avatarBase64');
  const avatarBytes = wantsAvatar ? parseAvatarBase64(request.data.avatarBase64) : null;
  const db = getFirestore();
  const userRef = db.doc(`users/${uid}`);
  const publicProfileRef = db.doc(`publicProfiles/${uid}`);
  const friendSearchRef = db.doc(`friendSearch/${uid}`);
  const rateRef = db.doc(`rateLimits/${uid}_profile`);
  const avatarId = avatarBytes ? randomUUID().replace(/-/g, '') : null;
  const avatarPath = avatarId ? profileAvatarPath(uid, avatarId) : null;
  const avatarToken = avatarId ? randomUUID() : null;
  const bucket = avatarBytes ? getStorage().bucket() : null;
  const avatarUrl =
    avatarPath && avatarToken && bucket
      ? profileAvatarUrl(bucket.name, avatarPath, avatarToken)
      : null;

  const clearPendingAvatar = async () => {
    if (!avatarId) return;
    await db.runTransaction(async (transaction) => {
      const rateSnapshot = await transaction.get(rateRef);
      if (rateSnapshot.data()?.pendingAvatarId !== avatarId) return;
      transaction.set(
        rateRef,
        {
          pendingAvatarId: FieldValue.delete(),
          avatarPendingUntil: FieldValue.delete(),
        },
        { merge: true },
      );
    });
  };

  let committedProfile;
  const commitProfile = async (expectedPendingAvatarId = null) => {
    await db.runTransaction(async (transaction) => {
      const [userSnapshot, publicProfileSnapshot, rateSnapshot] = await Promise.all([
        transaction.get(userRef),
        transaction.get(publicProfileRef),
        transaction.get(rateRef),
      ]);
      if (!userSnapshot.exists || !publicProfileSnapshot.exists) {
        throw new HttpsError('failed-precondition', 'Dein Profil ist noch nicht bereit.');
      }

      const user = userSnapshot.data();
      const publicProfile = publicProfileSnapshot.data();
      const currentDisplayName =
        typeof publicProfile.displayName === 'string' && publicProfile.displayName.trim()
          ? publicProfile.displayName.trim()
          : typeof user.displayName === 'string' && user.displayName.trim()
            ? user.displayName.trim()
            : null;
      const username =
        typeof publicProfile.username === 'string' && publicProfile.username
          ? publicProfile.username
          : typeof user.username === 'string' && user.username
            ? user.username
            : null;
      if (!currentDisplayName || !username) {
        throw new HttpsError('failed-precondition', 'Dein Profil ist noch nicht bereit.');
      }

      const rate = rateSnapshot.exists ? rateSnapshot.data() : {};
      if (expectedPendingAvatarId && rate.pendingAvatarId !== expectedPendingAvatarId) {
        throw new HttpsError(
          'failed-precondition',
          'Dein Profilbild konnte nicht gespeichert werden. Bitte versuche es erneut.',
        );
      }

      const now = Date.now();
      const displayNameChanged = displayName !== currentDisplayName;
      const nextDisplayNameChanges = displayNameChanged
        ? nextProfileChangeHistory(
            rate,
            'displayNameChanges',
            PROFILE_DISPLAY_NAME_CHANGES_PER_DAY,
            PROFILE_DISPLAY_NAME_COOLDOWN_MS,
            'Anzeigenamen',
            now,
          )
        : profileChangeHistory(rate, 'displayNameChanges', now);
      const nextAvatarChanges = avatarBytes
        ? nextProfileChangeHistory(
            rate,
            'avatarChanges',
            PROFILE_AVATAR_CHANGES_PER_DAY,
            0,
            'Profilbild',
            now,
          )
        : profileChangeHistory(rate, 'avatarChanges', now);

      if (!displayNameChanged && !avatarBytes) {
        committedProfile = {
          displayName: currentDisplayName,
          avatarUrl: typeof publicProfile.avatarUrl === 'string' ? publicProfile.avatarUrl : null,
          username,
          changed: false,
          previousAvatarPath: null,
        };
        return;
      }

      const initials = profileInitials(displayName);
      const userPatch = {};
      const publicProfilePatch = {};
      if (displayNameChanged) {
        userPatch.displayName = displayName;
        userPatch.initials = initials;
        publicProfilePatch.displayName = displayName;
        publicProfilePatch.initials = initials;
      }
      if (avatarUrl) {
        userPatch.avatarUrl = avatarUrl;
        publicProfilePatch.avatarUrl = avatarUrl;
      }

      transaction.update(userRef, userPatch);
      transaction.update(publicProfileRef, publicProfilePatch);
      const searchFields = buildFriendSearchFields(
        {
          displayName,
          initials,
          username,
          avatarUrl:
            avatarUrl ??
            (typeof publicProfile.avatarUrl === 'string' ? publicProfile.avatarUrl : undefined),
        },
        user.friendRequestPolicy ?? 'anyone',
      );
      if (searchFields) {
        transaction.set(friendSearchRef, { ...searchFields, updatedAt: Timestamp.now() });
      }
      transaction.set(
        rateRef,
        {
          displayNameChanges: nextDisplayNameChanges.map((changedAt) =>
            Timestamp.fromMillis(changedAt),
          ),
          avatarChanges: nextAvatarChanges.map((changedAt) => Timestamp.fromMillis(changedAt)),
          expireAt: Timestamp.fromMillis(now + DAY_MS + PROFILE_AVATAR_PENDING_MS),
          ...(expectedPendingAvatarId
            ? {
                pendingAvatarId: FieldValue.delete(),
                avatarPendingUntil: FieldValue.delete(),
              }
            : {}),
        },
        { merge: true },
      );

      committedProfile = {
        displayName,
        avatarUrl:
          avatarUrl ??
          (typeof publicProfile.avatarUrl === 'string' ? publicProfile.avatarUrl : null),
        username,
        changed: true,
        previousAvatarPath: avatarBytes ? managedAvatarPath(publicProfile.avatarUrl, uid) : null,
      };
    });
  };

  if (avatarBytes && avatarId && avatarPath && avatarToken && bucket && avatarUrl) {
    await db.runTransaction(async (transaction) => {
      const [rateSnapshot, publicProfileSnapshot] = await Promise.all([
        transaction.get(rateRef),
        transaction.get(publicProfileRef),
      ]);
      const rate = rateSnapshot.exists ? rateSnapshot.data() : {};
      const now = Date.now();
      const state = profileRateState(rate, now);
      if (state.pendingAvatarId) {
        throw new HttpsError(
          'resource-exhausted',
          'Dein Profilbild wird bereits gespeichert. Bitte versuche es in einem Moment erneut.',
        );
      }
      nextProfileChangeHistory(
        rate,
        'avatarChanges',
        PROFILE_AVATAR_CHANGES_PER_DAY,
        0,
        'Profilbild',
        now,
      );
      const currentDisplayName = publicProfileSnapshot.data()?.displayName;
      if (typeof currentDisplayName === 'string' && displayName !== currentDisplayName.trim()) {
        nextProfileChangeHistory(
          rate,
          'displayNameChanges',
          PROFILE_DISPLAY_NAME_CHANGES_PER_DAY,
          PROFILE_DISPLAY_NAME_COOLDOWN_MS,
          'Anzeigenamen',
          now,
        );
      }
      transaction.set(
        rateRef,
        {
          pendingAvatarId: avatarId,
          avatarPendingUntil: Timestamp.fromMillis(now + PROFILE_AVATAR_PENDING_MS),
          expireAt: Timestamp.fromMillis(now + DAY_MS + PROFILE_AVATAR_PENDING_MS),
        },
        { merge: true },
      );
    });

    try {
      await bucket.file(avatarPath).save(avatarBytes, {
        resumable: false,
        metadata: {
          contentType: 'image/jpeg',
          cacheControl: 'public, max-age=604800, immutable',
          metadata: { firebaseStorageDownloadTokens: avatarToken },
        },
      });
      await commitProfile(avatarId);
    } catch (error) {
      await Promise.all([
        bucket
          .file(avatarPath)
          .delete({ ignoreNotFound: true })
          .catch(() => {}),
        clearPendingAvatar(),
      ]);
      throw error;
    }
  } else {
    await commitProfile();
  }

  if (committedProfile.changed) {
    await getAdminAuth()
      .updateUser(uid, {
        displayName: committedProfile.displayName,
        ...(avatarUrl ? { photoURL: avatarUrl } : {}),
      })
      .catch((error) => console.error(`updateOwnProfile: Auth sync failed for ${uid}`, error));
  }
  if (committedProfile.previousAvatarPath) {
    await getStorage()
      .bucket()
      .file(committedProfile.previousAvatarPath)
      .delete({ ignoreNotFound: true })
      .catch((error) =>
        console.warn(`updateOwnProfile: old avatar cleanup failed for ${uid}`, error),
      );
  }
  return {
    displayName: committedProfile.displayName,
    ...(committedProfile.avatarUrl ? { avatarUrl: committedProfile.avatarUrl } : {}),
    username: committedProfile.username,
    changed: committedProfile.changed,
  };
});

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
  const friendSearchRef = db.doc(`friendSearch/${uid}`);
  const authRecord = await getAdminAuth().getUser(uid);
  const initialDisplayName =
    typeof authRecord.displayName === 'string' && authRecord.displayName.trim()
      ? authRecord.displayName.trim().slice(0, 50)
      : 'Como-Freund';
  const claimedAt = Timestamp.now();
  const initialProfile = {
    displayName: initialDisplayName,
    username,
    initials: profileInitials(initialDisplayName),
    createdAt: claimedAt,
  };

  await db.runTransaction(async (transaction) => {
    const [existing, userSnapshot, publicProfileSnapshot] = await Promise.all([
      transaction.get(claimRef),
      transaction.get(userRef),
      transaction.get(publicProfileRef),
    ]);
    if (existing.exists && existing.data().uid !== uid) {
      throw new HttpsError('already-exists', 'Dieser Nutzername ist bereits vergeben.');
    }

    const userProfile = userSnapshot.data() ?? {};
    const publicProfile = publicProfileSnapshot.data() ?? {};
    const displayName =
      validProfileText(publicProfile.displayName, 50) ??
      validProfileText(userProfile.displayName, 50) ??
      initialDisplayName;
    const initials =
      validProfileText(publicProfile.initials, 8) ??
      validProfileText(userProfile.initials, 8) ??
      profileInitials(displayName);

    transaction.set(
      claimRef,
      { uid, createdAt: existing.exists ? existing.data().createdAt : claimedAt },
      { merge: true },
    );
    if (userSnapshot.exists) {
      transaction.set(
        userRef,
        { username, ...missingProfileFields(userProfile, displayName, initials, claimedAt, true) },
        { merge: true },
      );
    } else {
      transaction.create(userRef, {
        ...initialProfile,
        profileVisibility: 'friends',
        friendRequestPolicy: 'anyone',
      });
    }
    if (publicProfileSnapshot.exists) {
      transaction.set(
        publicProfileRef,
        {
          username,
          ...missingProfileFields(publicProfile, displayName, initials, claimedAt, false),
        },
        { merge: true },
      );
    } else {
      transaction.create(publicProfileRef, initialProfile);
    }
    const searchFields = buildFriendSearchFields(
      {
        displayName,
        initials,
        username,
        avatarUrl:
          typeof publicProfile.avatarUrl === 'string'
            ? publicProfile.avatarUrl
            : typeof userProfile.avatarUrl === 'string'
              ? userProfile.avatarUrl
              : undefined,
      },
      userProfile.friendRequestPolicy ?? 'anyone',
    );
    if (searchFields) {
      transaction.set(friendSearchRef, { ...searchFields, updatedAt: claimedAt });
    }
  });

  return { ok: true, username, profileReady: true };
});

/**
 * A deliberately small, callable-only people search. `friendSearch` is never
 * readable by clients, so a caller cannot turn the app into a user directory
 * or ask Firestore for more than this bounded response.
 */
exports.searchPeople = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireVerifiedAuth(request);
  const parsedQuery = parseFriendSearchQuery(request.data?.query);
  if (!parsedQuery.valid) {
    throw new HttpsError(
      'invalid-argument',
      'Gib mindestens drei Zeichen ein, oder einen @Nutzernamen mit mindestens zwei Zeichen.',
    );
  }
  await enforceFriendSearchRateLimit(uid);

  const db = getFirestore();
  const lookups = await Promise.all(
    parsedQuery.lookupVariants.slice(0, 2).map((prefix) =>
      db
        .collection('friendSearch')
        .where('discoverable', '==', true)
        .where('searchPrefixes', 'array-contains', prefix)
        .limit(8)
        .get(),
    ),
  );
  const candidates = new Map();
  lookups.flatMap((snapshot) => snapshot.docs).forEach((snapshot) => {
    if (snapshot.id !== uid) candidates.set(snapshot.id, snapshot.data());
  });
  const blockedUids = await blockedUidsBetweenAny(db, uid, [...candidates.keys()]);
  const people = [...candidates]
    .map(([candidateUid, profile]) => ({
      uid: candidateUid,
      displayName: typeof profile.displayName === 'string' ? profile.displayName : '',
      initials: typeof profile.initials === 'string' ? profile.initials : '',
      username: typeof profile.username === 'string' ? profile.username : '',
      ...(typeof profile.avatarUrl === 'string' ? { avatarUrl: profile.avatarUrl } : {}),
      score: resultScore(profile, parsedQuery),
    }))
    .filter(
      (candidate) =>
        !blockedUids.has(candidate.uid) &&
        candidate.score >= 0 &&
        candidate.displayName &&
        candidate.initials &&
        candidate.username,
    )
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.displayName.localeCompare(right.displayName, 'de') ||
        left.username.localeCompare(right.username),
    )
    .slice(0, 5)
    .map(({ score, ...profile }) => profile);

  return { people };
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
  let requestCreated = false;
  let requesterDisplayName = 'Ein Freund';
  await db.runTransaction(async (transaction) => {
    // Firestore may retry this callback. Reset state observed after commit so
    // an abandoned speculative create can never emit a duplicate push.
    requestCreated = false;
    requesterDisplayName = 'Ein Freund';
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
    requesterDisplayName = sender.displayName;
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
    requestCreated = true;
    outcome = { state: 'sent', friend: recipient };
  });

  if (requestCreated && recipientUid) {
    await queuePushOnly([
      {
        recipientUid,
        actorUid: uid,
        kind: 'friend_request',
        title: 'Neue Freundschaftsanfrage',
        body: `${requesterDisplayName} möchte mit dir bei Como befreundet sein.`,
      },
    ]);
  }
  return outcome;
});

exports.respondToFriendRequest = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireVerifiedAuth(request);
  await enforceRateLimit(uid, 'friendMutations', 30, HOUR_MS);
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
    await addFriendToActivePresenceAudiences(db, uid, requesterUid);
    void createNotifications([
      {
        recipientUid: requesterUid,
        actorUid: uid,
        kind: 'system',
        title: 'Freundschaft bestätigt',
        body: `${responderName} ist jetzt dein Freund bei Como.`,
      },
    ]).catch((error) => console.error('[friends] acceptance notification failed', error));
  }
  return { ok: true };
});

/** A new friendship should see an already-open friend immediately. This rare
 * friendship-time update lets ordinary presence refinements reuse their stored
 * server-derived audience instead of re-reading the whole friendship graph. */
async function addFriendToActivePresenceAudiences(db, firstUid, secondUid) {
  const [firstPresence, secondPresence] = await Promise.all([
    db.doc(`presence/${firstUid}`).get(),
    db.doc(`presence/${secondUid}`).get(),
  ]);
  const now = Date.now();
  const batch = db.batch();
  let changed = false;

  [
    { ownerUid: firstUid, friendUid: secondUid, snapshot: firstPresence },
    { ownerUid: secondUid, friendUid: firstUid, snapshot: secondPresence },
  ].forEach(({ ownerUid, friendUid, snapshot }) => {
    const data = snapshot.data();
    const expiresAt = data?.expireAt?.toMillis?.() ?? 0;
    const audienceUids = Array.isArray(data?.audienceUids)
      ? data.audienceUids.filter((audienceUid) => validUid(audienceUid) && audienceUid !== ownerUid)
      : [];
    if (
      !snapshot.exists ||
      expiresAt <= now ||
      audienceUids.includes(friendUid) ||
      audienceUids.length >= 50
    ) {
      return;
    }
    batch.update(snapshot.ref, { audienceUids: [...audienceUids, friendUid] });
    changed = true;
  });

  if (changed) await batch.commit();
}

exports.removeFriend = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireVerifiedAuth(request);
  await enforceRateLimit(uid, 'friendMutations', 30, HOUR_MS);
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
  const [ownPresence, otherPresence, ownUser, otherUser, ownGroups, otherGroups] =
    await Promise.all([
      db.doc(`presence/${firstUid}`).get(),
      db.doc(`presence/${secondUid}`).get(),
      db.doc(`users/${firstUid}`).get(),
      db.doc(`users/${secondUid}`).get(),
      getAllDocuments(
        db
          .collection(`users/${firstUid}/privateCircles`)
          .where('friendUids', 'array-contains', secondUid),
      ),
      getAllDocuments(
        db
          .collection(`users/${secondUid}/privateCircles`)
          .where('friendUids', 'array-contains', firstUid),
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
  // Pending invitations are also private social shortcuts. Remove both kinds
  // immediately on unfriend/block, rather than merely rejecting them later
  // when somebody taps an old card.
  await Promise.all([
    revokeSpontaneousRoundsBetween(db, firstUid, secondUid),
    revokeGroupChatInvitesBetween(db, firstUid, secondUid),
  ]);
}

/**
 * Cancels the small, temporary coordination surface between two people when
 * their direct relationship is removed or blocked. This intentionally does
 * not touch real activities: their documented leave/block lifecycle is owned
 * by severBlockedContactSpaces above.
 */
async function revokeSpontaneousRoundsBetween(db, firstUid, secondUid) {
  const [firstOpenings, secondOpenings, invitesToFirst, invitesToSecond] = await Promise.all([
    getAllDocuments(
      db.collection('groupOpenings').where('audienceUids', 'array-contains', firstUid),
    ),
    getAllDocuments(
      db.collection('groupOpenings').where('audienceUids', 'array-contains', secondUid),
    ),
    getAllDocuments(db.collection('spontaneousRoundInvites').where('recipientUid', '==', firstUid)),
    getAllDocuments(
      db.collection('spontaneousRoundInvites').where('recipientUid', '==', secondUid),
    ),
  ]);
  const roundIds = new Set();
  [...firstOpenings, ...secondOpenings].forEach((snapshot) => {
    const opening = snapshot.data();
    const memberIds = Array.isArray(opening.memberIds) ? opening.memberIds : [];
    if (
      opening.kind === 'spontaneous' &&
      memberIds.includes(firstUid) &&
      memberIds.includes(secondUid)
    ) {
      roundIds.add(snapshot.id);
    }
  });
  [...invitesToFirst, ...invitesToSecond].forEach((snapshot) => {
    const invite = snapshot.data();
    if (
      (invite.hostUid === firstUid && invite.recipientUid === secondUid) ||
      (invite.hostUid === secondUid && invite.recipientUid === firstUid)
    ) {
      roundIds.add(invite.roundId);
    }
  });
  if (!roundIds.size) return;

  const snapshots = await Promise.all(
    [...roundIds].filter(validActivityId).map(async (roundId) => {
      const [opening, room, invites] = await Promise.all([
        db.doc(`groupOpenings/${roundId}`).get(),
        db.doc(`chats/${roundId}`).get(),
        getAllDocuments(db.collection('spontaneousRoundInvites').where('roundId', '==', roundId)),
      ]);
      return { roundId, opening, room, invites };
    }),
  );
  const operations = [];
  const now = Timestamp.now();
  snapshots.forEach(({ roundId, opening, room, invites }) => {
    if (opening.data()?.kind === 'spontaneous') {
      operations.push({ type: 'delete', ref: opening.ref });
      (opening.data().memberIds ?? []).filter(validUid).forEach((memberUid) => {
        operations.push({
          type: 'delete',
          ref: db.doc(`spontaneousRoundMemberships/${memberUid}`),
        });
      });
    }
    if (room.data()?.roundStatus === 'forming') {
      operations.push({ type: 'update', ref: room.ref, data: { expireAt: now } });
    }
    invites.forEach((invite) => {
      operations.push({ type: 'delete', ref: invite.ref });
      const recipientUid = invite.data().recipientUid;
      if (validUid(recipientUid)) {
        operations.push({
          type: 'delete',
          ref: db.doc(`notifications/${roundId}_${recipientUid}`),
        });
      }
    });
  });
  if (operations.length) await commitDeleteOperations(db, operations);
}

/** Revokes targeted planning invitations when the direct relationship ends. */
async function revokeGroupChatInvitesBetween(db, firstUid, secondUid) {
  const [fromFirst, fromSecond] = await Promise.all([
    getAllDocuments(db.collection('groupChatInvites').where('inviterUid', '==', firstUid)),
    getAllDocuments(db.collection('groupChatInvites').where('inviterUid', '==', secondUid)),
  ]);
  const candidates = [...fromFirst, ...fromSecond].filter((snapshot) => {
    const invite = snapshot.data();
    return (
      invite.status === 'pending' &&
      ((invite.inviterUid === firstUid && invite.inviteeUid === secondUid) ||
        (invite.inviterUid === secondUid && invite.inviteeUid === firstUid)) &&
      validActivityId(invite.roomId)
    );
  });
  if (!candidates.length) return;

  const byRoom = new Map();
  candidates.forEach((snapshot) => {
    const roomId = snapshot.data().roomId;
    byRoom.set(roomId, [...(byRoom.get(roomId) ?? []), snapshot]);
  });
  await Promise.all(
    [...byRoom.entries()].map(async ([roomId, invites]) => {
      const roomRef = db.doc(`chats/${roomId}`);
      await db.runTransaction(async (transaction) => {
        const [roomSnapshot, ...inviteSnapshots] = await Promise.all([
          transaction.get(roomRef),
          ...invites.map((invite) => transaction.get(invite.ref)),
        ]);
        let released = 0;
        inviteSnapshots.forEach((snapshot) => {
          const invite = snapshot.data();
          if (!snapshot.exists || invite.status !== 'pending') return;
          transaction.delete(snapshot.ref);
          transaction.delete(
            db.doc(`notifications/${groupChatInviteNotificationId(roomId, invite.inviteeUid)}`),
          );
          released += 1;
        });
        if (roomSnapshot.exists && released) {
          transaction.update(roomRef, {
            pendingInviteCount: Math.max(0, roomPendingInviteCount(roomSnapshot.data()) - released),
          });
        }
      });
    }),
  );
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
      participants: (activity.participants ?? []).filter(
        (participant) => participant.uid !== removeUid,
      ),
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
  const db = getFirestore();
  const userRef = db.doc(`users/${uid}`);
  const publicProfileRef = db.doc(`publicProfiles/${uid}`);
  const friendSearchRef = db.doc(`friendSearch/${uid}`);
  await db.runTransaction(async (transaction) => {
    const [userSnapshot, publicProfileSnapshot] = await Promise.all([
      transaction.get(userRef),
      transaction.get(publicProfileRef),
    ]);
    if (!userSnapshot.exists || !publicProfileSnapshot.exists) {
      throw new HttpsError('failed-precondition', 'Dein Profil ist noch nicht bereit.');
    }
    const searchFields = buildFriendSearchFields(publicProfileSnapshot.data(), policy);
    if (!searchFields) {
      throw new HttpsError('failed-precondition', 'Dein Profil ist noch nicht bereit.');
    }
    transaction.update(userRef, {
      profileVisibility: 'friends',
      friendRequestPolicy: policy,
    });
    transaction.set(friendSearchRef, { ...searchFields, updatedAt: Timestamp.now() });
  });
  return { ok: true };
});

exports.setJourneyRemindersEnabled = onCall(CALLABLE_OPTS, async (request) => {
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
});

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

exports.createPrivateCircle = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireVerifiedAuth(request);
  await enforceRateLimit(uid, 'privateCircleMutations', 60, HOUR_MS);
  const name = cleanString(request.data?.name, 40, 'Circle-Name', true);
  const emoji = cleanString(request.data?.emoji, 8, 'Emoji');
  const db = getFirestore();
  const circles = db.collection(`users/${uid}/privateCircles`);
  const circleRef = circles.doc();
  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(circles.limit(MAX_PRIVATE_CIRCLES));
    if (existing.size >= MAX_PRIVATE_CIRCLES) {
      throw new HttpsError(
        'resource-exhausted',
        `Du kannst maximal ${MAX_PRIVATE_CIRCLES} private Circles anlegen.`,
      );
    }
    transaction.create(circleRef, {
      name,
      ...(emoji ? { emoji } : {}),
      friendUids: [],
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  });
  return { id: circleRef.id };
});

exports.deletePrivateCircle = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireVerifiedAuth(request);
  await enforceRateLimit(uid, 'privateCircleMutations', 60, HOUR_MS);
  const circleId = request.data?.circleId;
  if (typeof circleId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(circleId)) {
    throw new HttpsError('invalid-argument', 'Ungültiger Circle.');
  }
  await getFirestore().doc(`users/${uid}/privateCircles/${circleId}`).delete();
  return { ok: true };
});

/** Private Circle membership is server-checked even though Circle documents
 * themselves are owner-only. That keeps "only confirmed friends" an invariant
 * rather than merely a UI convention. */
exports.setPrivateCircleFriends = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireVerifiedAuth(request);
  await enforceRateLimit(uid, 'privateCircleMutations', 60, HOUR_MS);
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
});

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
  if (typeof token !== 'string' || !EXPO_PUSH_TOKEN_RE.test(token)) {
    throw new HttpsError('invalid-argument', 'Ungültiger Push-Token.');
  }
  await enforceRateLimit(uid, 'pushTokenRegistration', 30, HOUR_MS);
  const db = getFirestore();
  const userRef = db.doc(`users/${uid}`);
  const tokenClaimRef = db.doc(
    `pushTokenOwners/${createHash('sha256').update(token).digest('hex')}`,
  );
  const legacyOwners = await db
    .collection('users')
    .where('pushTokens', 'array-contains', token)
    .get();

  // The claim serializes concurrent registrations of the same physical token.
  // The indexed equality query also repairs every legacy duplicate created
  // before claims existed. The token itself never becomes a document id or
  // claim payload.
  await db.runTransaction(async (transaction) => {
    const claimSnapshot = await transaction.get(tokenClaimRef);
    const ownerUids = new Set([uid, ...legacyOwners.docs.map((snapshot) => snapshot.id)]);
    const claimedUid = claimSnapshot.data()?.uid;
    if (validUid(claimedUid)) ownerUids.add(claimedUid);
    const userRefs = [...ownerUids].map((ownerUid) => db.doc(`users/${ownerUid}`));
    const userSnapshots = await Promise.all(userRefs.map((ref) => transaction.get(ref)));

    const ownSnapshot = userSnapshots.find((snapshot) => snapshot.id === uid);
    if (!ownSnapshot?.exists) {
      throw new HttpsError('failed-precondition', 'Dein Profil ist noch nicht bereit.');
    }
    const rawOwnTokens = Array.isArray(ownSnapshot.data()?.pushTokens)
      ? ownSnapshot.data().pushTokens
      : [];
    const ownTokens = [
      ...new Set(rawOwnTokens.filter((candidate) => typeof candidate === 'string')),
    ];
    const nextOwnTokens = [...ownTokens.filter((candidate) => candidate !== token), token].slice(
      -10,
    );
    const evictedTokens = ownTokens.filter((candidate) => !nextOwnTokens.includes(candidate));
    const evictedClaimRefs = evictedTokens.map((candidate) =>
      db.doc(`pushTokenOwners/${createHash('sha256').update(candidate).digest('hex')}`),
    );
    const evictedClaimSnapshots = await Promise.all(
      evictedClaimRefs.map((ref) => transaction.get(ref)),
    );

    userSnapshots.forEach((snapshot) => {
      if (snapshot.id === uid || !snapshot.exists) return;
      const otherTokens = Array.isArray(snapshot.data()?.pushTokens)
        ? snapshot.data().pushTokens
        : [];
      if (otherTokens.includes(token)) {
        transaction.update(snapshot.ref, {
          pushTokens: [
            ...new Set(
              otherTokens.filter(
                (candidate) => typeof candidate === 'string' && candidate !== token,
              ),
            ),
          ].slice(-10),
        });
      }
    });

    evictedClaimSnapshots.forEach((snapshot) => {
      if (snapshot.data()?.uid === uid) transaction.delete(snapshot.ref);
    });
    const ownTokensChanged =
      rawOwnTokens.length !== nextOwnTokens.length ||
      rawOwnTokens.some((candidate, index) => candidate !== nextOwnTokens[index]);
    if (ownTokensChanged) transaction.update(userRef, { pushTokens: nextOwnTokens });
    if (claimSnapshot.data()?.uid !== uid) {
      transaction.set(tokenClaimRef, { uid, updatedAt: Timestamp.now() });
    }
  });
  return { ok: true };
});

exports.unregisterPushToken = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireVerifiedAuth(request);
  const token = request.data?.token;
  if (typeof token !== 'string' || !EXPO_PUSH_TOKEN_RE.test(token)) {
    throw new HttpsError('invalid-argument', 'Ungültiger Push-Token.');
  }
  const db = getFirestore();
  const tokenClaimRef = db.doc(
    `pushTokenOwners/${createHash('sha256').update(token).digest('hex')}`,
  );
  await db.runTransaction(async (transaction) => {
    const userRef = db.doc(`users/${uid}`);
    const [claimSnapshot, userSnapshot] = await Promise.all([
      transaction.get(tokenClaimRef),
      transaction.get(userRef),
    ]);
    if (userSnapshot.exists) {
      const rawTokens = Array.isArray(userSnapshot.data()?.pushTokens)
        ? userSnapshot.data().pushTokens
        : [];
      const nextTokens = [
        ...new Set(
          rawTokens.filter((candidate) => typeof candidate === 'string' && candidate !== token),
        ),
      ].slice(-10);
      const tokensChanged =
        rawTokens.length !== nextTokens.length ||
        rawTokens.some((candidate, index) => candidate !== nextTokens[index]);
      if (tokensChanged) transaction.update(userRef, { pushTokens: nextTokens });
    }
    if (claimSnapshot.data()?.uid === uid) transaction.delete(tokenClaimRef);
  });
  return { ok: true };
});

async function clearOwnedPushTokenClaims(db, uid, tokens) {
  const claimRefs = [
    ...new Set(
      (Array.isArray(tokens) ? tokens : []).filter(
        (token) => typeof token === 'string' && token.length <= 512,
      ),
    ),
  ].map((token) => db.doc(`pushTokenOwners/${createHash('sha256').update(token).digest('hex')}`));
  if (!claimRefs.length) return;
  await db.runTransaction(async (transaction) => {
    const snapshots = await Promise.all(claimRefs.map((ref) => transaction.get(ref)));
    snapshots.forEach((snapshot) => {
      if (snapshot.data()?.uid === uid) transaction.delete(snapshot.ref);
    });
  });
}

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
    ownRoundMembership,
    roundOpenings,
    roundInvitesReceived,
    roundInvitesSent,
    hostedTimePlans,
    ownTimePlanMemberships,
    timePlanInvitesReceived,
  ] = await Promise.all([
    db.doc(`users/${uid}`).get(),
    getAllDocuments(db.collection('circles').where('memberIds', 'array-contains', uid)),
    getAllDocuments(db.collection('activities').where('hostId', '==', uid)),
    getAllDocuments(db.collection('activities').where('participantUids', 'array-contains', uid)),
    getAllDocuments(db.collection('notifications').where('recipientUid', '==', uid)),
    getAllDocuments(db.collection('blocks').where('blockerUid', '==', uid)),
    getAllDocuments(db.collection('blocks').where('blockedUid', '==', uid)),
    getAllDocuments(db.collection('chats').where('memberIds', 'array-contains', uid)),
    getAllDocuments(db.collection('groupChatInvites').where('inviteeUid', '==', uid)),
    getAllDocuments(db.collection('groupChatInvites').where('inviterUid', '==', uid)),
    getAllDocuments(db.collection('socialInterests').where('fromUid', '==', uid)),
    getAllDocuments(db.collection('socialInterests').where('targetUid', '==', uid)),
    getAllDocuments(db.collection('socialMatches').where('memberUids', 'array-contains', uid)),
    getAllDocuments(db.collection('friendships').where('participantUids', 'array-contains', uid)),
    getAllDocuments(db.collection(`users/${uid}/privateCircles`)),
    getAllDocuments(
      db.collectionGroup('privateCircles').where('friendUids', 'array-contains', uid),
    ),
    db.doc(`spontaneousRoundMemberships/${uid}`).get(),
    getAllDocuments(db.collection('groupOpenings').where('audienceUids', 'array-contains', uid)),
    getAllDocuments(db.collection('spontaneousRoundInvites').where('recipientUid', '==', uid)),
    getAllDocuments(db.collection('spontaneousRoundInvites').where('hostUid', '==', uid)),
    getAllDocuments(db.collection('timePlans').where('hostId', '==', uid)),
    getAllDocuments(db.collectionGroup('timePlanMembers').where('uid', '==', uid)),
    getAllDocuments(db.collection('timePlanInvites').where('inviteeUid', '==', uid)),
  ]);
  const [hostedTimePlanCleanup, ownTimePlanMembershipsWithPlans] = await Promise.all([
    Promise.all(
      hostedTimePlans.map(async (planSnapshot) => {
        const [members, invites, outbox] = await Promise.all([
          getAllDocuments(planSnapshot.ref.collection('timePlanMembers')),
          getAllDocuments(db.collection('timePlanInvites').where('planId', '==', planSnapshot.id)),
          getAllDocuments(db.collection('pushOutbox').where('timePlanId', '==', planSnapshot.id)),
        ]);
        return { planSnapshot, members, invites, outbox };
      }),
    ),
    Promise.all(
      ownTimePlanMemberships.map(async (memberSnapshot) => ({
        memberSnapshot,
        planSnapshot: await memberSnapshot.ref.parent.parent.get(),
      })),
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
  const hostedFormingRoundIds = new Set();
  let ownRoundMembershipDeleted = false;
  roundOpenings.forEach((snapshot) => {
    const opening = snapshot.data();
    if (opening.kind !== 'spontaneous') return;
    if (opening.hostUid === uid) {
      hostedFormingRoundIds.add(snapshot.id);
      operations.push({ type: 'delete', ref: snapshot.ref });
      (opening.memberIds ?? []).filter(validUid).forEach((memberUid) => {
        operations.push({
          type: 'delete',
          ref: db.doc(`spontaneousRoundMemberships/${memberUid}`),
        });
        if (memberUid === uid) ownRoundMembershipDeleted = true;
      });
      return;
    }
    operations.push({
      type: 'update',
      ref: snapshot.ref,
      data: {
        memberIds: (opening.memberIds ?? []).filter((memberUid) => memberUid !== uid),
        memberCount: Math.max(
          0,
          (opening.memberIds ?? []).filter((memberUid) => memberUid !== uid).length,
        ),
        memberPreview: (opening.memberPreview ?? []).filter((member) => member?.uid !== uid),
        audienceUids: (opening.audienceUids ?? []).filter((memberUid) => memberUid !== uid),
        updatedAt: Timestamp.now(),
      },
    });
  });
  if (ownRoundMembership.exists && !ownRoundMembershipDeleted) {
    operations.push({ type: 'delete', ref: ownRoundMembership.ref });
  }
  // Pending winks are server-only documents. Retract both directions on
  // account deletion so neither the invitation nor its notification can
  // outlive the account that created or received it.
  [...roundInvitesReceived, ...roundInvitesSent].forEach((snapshot) => {
    const invite = snapshot.data();
    operations.push({ type: 'delete', ref: snapshot.ref });
    if (
      invite.hostUid === uid &&
      validActivityId(invite.roundId) &&
      validUid(invite.recipientUid)
    ) {
      operations.push({
        type: 'delete',
        ref: db.doc(`notifications/${invite.roundId}_${invite.recipientUid}`),
      });
    }
  });
  friendships.forEach((snapshot) => {
    const otherUid = (snapshot.data().participantUids ?? []).find(
      (participantUid) => participantUid !== uid,
    );
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

  const hostedTimePlanIds = new Set(hostedTimePlans.map((snapshot) => snapshot.id));
  const deletedTimePlanMemberPaths = new Set();
  hostedTimePlanCleanup.forEach(({ planSnapshot, members, invites, outbox }) => {
    operations.push({ type: 'delete', ref: planSnapshot.ref });
    members.forEach((memberSnapshot) => {
      deletedTimePlanMemberPaths.add(memberSnapshot.ref.path);
      operations.push({ type: 'delete', ref: memberSnapshot.ref });
    });
    invites.forEach((inviteSnapshot) => {
      const invite = inviteSnapshot.data();
      operations.push({ type: 'delete', ref: inviteSnapshot.ref });
      if (validUid(invite.inviteeUid)) {
        operations.push({
          type: 'delete',
          ref: db.doc(`notifications/time_plan_${planSnapshot.id}_${invite.inviteeUid}`),
        });
      }
    });
    outbox.forEach((outboxSnapshot) =>
      operations.push({ type: 'delete', ref: outboxSnapshot.ref }),
    );
  });
  ownTimePlanMembershipsWithPlans.forEach(({ memberSnapshot, planSnapshot }) => {
    if (deletedTimePlanMemberPaths.has(memberSnapshot.ref.path)) return;
    operations.push({ type: 'delete', ref: memberSnapshot.ref });
    if (!planSnapshot.exists || hostedTimePlanIds.has(planSnapshot.id)) return;
    operations.push({
      type: 'update',
      ref: planSnapshot.ref,
      data: {
        memberUids: FieldValue.arrayRemove(uid),
        updatedAt: Timestamp.now(),
      },
    });
  });
  timePlanInvitesReceived.forEach((snapshot) =>
    operations.push({ type: 'delete', ref: snapshot.ref }),
  );

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
    if (room.roundStatus === 'forming' && hostedFormingRoundIds.has(snapshot.id)) {
      operations.push({ type: 'update', ref: snapshot.ref, data: { expireAt: Timestamp.now() } });
      return;
    }
    const memberIds = (room.memberIds ?? []).filter((memberUid) => memberUid !== uid);
    if (memberIds.length === 0) operations.push({ type: 'delete', ref: snapshot.ref });
    else operations.push({ type: 'update', ref: snapshot.ref, data: { memberIds } });
  });
  socialMatches.forEach((snapshot) => operations.push({ type: 'delete', ref: snapshot.ref }));
  operations.push(
    { type: 'delete', ref: db.doc(`users/${uid}`) },
    { type: 'delete', ref: db.doc(`publicProfiles/${uid}`) },
    { type: 'delete', ref: db.doc(`friendSearch/${uid}`) },
    { type: 'delete', ref: db.doc(`presence/${uid}`) },
    { type: 'delete', ref: db.doc(`socialSessions/${uid}`) },
  );
  const username = userSnapshot.data()?.username;
  if (typeof username === 'string')
    operations.push({ type: 'delete', ref: db.doc(`usernames/${username}`) });

  await clearOwnedPushTokenClaims(db, uid, userSnapshot.data()?.pushTokens);
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
  // The avatar file must not outlive the account: its tokened download URL
  // stays readable without auth. Best-effort — a storage hiccup (or the
  // storage-less functions test emulator) must never block leaving the app.
  try {
    await getStorage().bucket().file(`avatars/${uid}.jpg`).delete({ ignoreNotFound: true });
  } catch (error) {
    console.warn(`deleteMyAccount: avatar cleanup failed for ${uid}`, error);
  }
  await getAdminAuth().deleteUser(uid);
  return { ok: true };
});

exports.onActivityUpdate = onDocumentUpdated(
  { document: 'activities/{activityId}', ...EVENT_TRIGGER_OPTS },
  async (event) => {
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

    if (
      before.status === 'active' &&
      after.status === 'active' &&
      validUid(before.hostId) &&
      validUid(after.hostId) &&
      before.hostId !== after.hostId
    ) {
      const nextHost = (after.participants ?? []).find((item) => item?.uid === after.hostId);
      const nextHostName = nextHost?.displayName ?? 'Ein Teilnehmer';
      afterParticipants.forEach((recipientUid) => {
        notifications.push({
          recipientUid,
          actorUid: before.hostId,
          kind: 'activity_host_changed',
          title: recipientUid === after.hostId ? 'Du übernimmst die Activity' : 'Neuer Host',
          body:
            recipientUid === after.hostId
              ? `Du bist jetzt Host von „${after.title ?? 'dieser Activity'}“.`
              : `${nextHostName} übernimmt „${after.title ?? 'diese Activity'}“.`,
          activityId,
          roomId: activityId,
        });
      });
    }

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

    const timeChanged = before.startsAt !== after.startsAt || before.endsAt !== after.endsAt;
    const relevantChanges = [
      ...(before.title !== after.title ? ['Titel'] : []),
      ...(timeChanged ? ['Zeit'] : []),
      ...(!sameActivityPlace(before.place, after.place) ? ['Ort'] : []),
      ...(before.mode !== after.mode ? ['Status'] : []),
    ];
    if (before.status === 'active' && after.status === 'active' && relevantChanges.length) {
      const changeLabel =
        relevantChanges.length === 1
          ? relevantChanges[0]
          : `${relevantChanges.slice(0, -1).join(', ')} und ${relevantChanges.at(-1)}`;
      afterParticipants
        .filter((recipientUid) => recipientUid !== hostId)
        .forEach((recipientUid) => {
          notifications.push({
            recipientUid,
            actorUid: hostId,
            kind: 'activity_updated',
            title: 'Activity aktualisiert',
            body: `Bei „${after.title ?? 'deiner Activity'}“ wurden folgende Angaben geändert: ${changeLabel}.`,
            activityId,
            roomId: activityId,
          });
        });
    }

    await createNotifications(notifications).catch((error) =>
      console.error('[notifications] activity update failed', error),
    );
  },
);

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

/** The same two-query block check used by Safety, but returns every blocked
 * candidate so private search can omit them without exposing why. */
async function blockedUidsBetweenAny(db, uid, targetUids) {
  const blocked = new Set();
  for (let offset = 0; offset < targetUids.length; offset += 30) {
    const chunk = targetUids.slice(offset, offset + 30);
    if (!chunk.length) continue;
    const [outgoing, incoming] = await Promise.all([
      db
        .collection('blocks')
        .where('blockerUid', '==', uid)
        .where('blockedUid', 'in', chunk)
        .limit(chunk.length)
        .get(),
      db
        .collection('blocks')
        .where('blockedUid', '==', uid)
        .where('blockerUid', 'in', chunk)
        .limit(chunk.length)
        .get(),
    ]);
    outgoing.forEach((snapshot) => blocked.add(snapshot.data().blockedUid));
    incoming.forEach((snapshot) => blocked.add(snapshot.data().blockerUid));
  }
  return blocked;
}

exports.startSocialSession = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireVerifiedAuth(request);
  requireSocializeEnabled();
  const session = validateSocialSession(request.data?.session);
  const db = getFirestore();
  const profile = (await db.doc(`publicProfiles/${uid}`).get()).data() ?? {};
  const displayName = cleanString(
    profile.displayName ?? request.auth.token.name ?? 'Como-Freund',
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
        displayName: matched ? (data.displayName ?? 'Como-Freund') : 'Person in deiner Nähe',
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

async function cleanupExpiredRuntime(now) {
  const db = getFirestore();
  await cleanupExpiredSurfaces(db, Timestamp.fromMillis(now));

  const root = getDatabase().ref('journeys');
  const snapshot = await root.orderByChild('expiresAt').endAt(now).limitToFirst(100).get();
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
    .endAt(now)
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
      timeoutMarkers[`heimwege/${child.key}/timeoutNotifiedAt`] = now;
      return false;
    });
    await createNotifications(timeoutNotifications, { queuePush: true });
    if (Object.keys(timeoutMarkers).length) await getDatabase().ref().update(timeoutMarkers);
  }

  const safetySnapshot = await safetyRoot
    .orderByChild('retainUntil')
    .endAt(now)
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
}

/**
 * Grace extension for Safety sessions whose owner missed the "Bist du schon
 * zuhause?" prompt: PROACTIVELY (before expiresAt) extend by 20 minutes, at
 * most twice. Deliberately NO updatedAt bump (a session without a fresh fix
 * must not look fresh) and NO signal to companions or the owner ("Keine
 * Antwort seit …" would be pure alarmism at the routine end of a normal blue
 * walk). Client-scheduled warn/end notifications hang on expiresAt and move
 * along automatically. After both windows the session still ends honestly as
 * "Automatisch beendet · Ankunft nicht bestätigt" (see maintainRuntime).
 */
async function reconcileSafetyAutoExtensions(now) {
  const safetyRoot = getDatabase().ref('heimwege');
  const snapshot = await safetyRoot
    .orderByChild('expiresAt')
    .startAt(now)
    .endAt(now + SAFETY_AUTO_EXTEND_LOOKAHEAD_MS)
    .limitToFirst(100)
    .get();
  if (!snapshot.exists()) return;

  const candidates = [];
  snapshot.forEach((child) => {
    const expiresAt = Number(child.val()?.expiresAt);
    if (typeof child.key === 'string' && Number.isFinite(expiresAt)) {
      candidates.push({ uid: child.key, expiresAt });
    }
    return false;
  });
  await Promise.all(
    candidates.map(({ uid, expiresAt }) => autoExtendSafetySessionFromTask(uid, expiresAt)),
  );
}

function safetySessionRestUrl(uid) {
  const databaseUrl = getDatabase().app.options.databaseURL;
  if (typeof databaseUrl !== 'string' || !databaseUrl) {
    throw new Error('Safety-Task findet keine RTDB-URL.');
  }
  const emulatorHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
  if (emulatorHost) {
    const namespace = new URL(databaseUrl).hostname.split('.')[0];
    return `http://${emulatorHost}/heimwege/${encodeURIComponent(uid)}.json?ns=${encodeURIComponent(namespace)}`;
  }
  return `${databaseUrl.replace(/\/$/, '')}/heimwege/${encodeURIComponent(uid)}.json`;
}

async function safetySessionRestHeaders(headers = {}) {
  if (process.env.FIREBASE_DATABASE_EMULATOR_HOST) {
    return { ...headers, Authorization: 'Bearer owner' };
  }
  const accessToken = await getApp().options.credential?.getAccessToken?.();
  if (typeof accessToken?.access_token !== 'string' || !accessToken.access_token) {
    throw new Error('Safety-Task konnte keinen RTDB-Zugriffstoken beziehen.');
  }
  return { ...headers, Authorization: `Bearer ${accessToken.access_token}` };
}

async function autoExtendSafetySessionFromTask(uid, expectedExpiresAt) {
  const url = safetySessionRestUrl(uid);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const read = await fetch(url, {
      headers: await safetySessionRestHeaders({ 'X-Firebase-ETag': 'true' }),
    });
    if (!read.ok) throw new Error(`Safety-Task konnte die Session nicht lesen (${read.status}).`);
    const etag = read.headers.get('etag');
    const current = await read.json();
    const now = Date.now();
    if (!current || typeof current !== 'object' || !etag) return false;
    const count = Number(current.autoExtendCount ?? 0);
    const startedAt = Number(current.startedAt);
    const currentExpiresAt = Number(current.expiresAt);
    if (
      currentExpiresAt !== expectedExpiresAt ||
      count >= SAFETY_AUTO_EXTEND_MAX ||
      !Number.isFinite(startedAt) ||
      currentExpiresAt < now ||
      currentExpiresAt > now + SAFETY_AUTO_EXTEND_LOOKAHEAD_MS
    ) {
      return false;
    }
    const nextExpiresAt = Math.min(
      currentExpiresAt + SAFETY_AUTO_EXTEND_MS,
      startedAt + SAFETY_MAX_TOTAL_MS,
    );
    if (nextExpiresAt <= currentExpiresAt) return false;
    const next = {
      ...current,
      expiresAt: nextExpiresAt,
      retainUntil: nextExpiresAt + safetyRetentionMs(current.status),
      autoExtendCount: count + 1,
    };
    const write = await fetch(url, {
      method: 'PUT',
      headers: await safetySessionRestHeaders({
        'Content-Type': 'application/json',
        'if-match': etag,
      }),
      body: JSON.stringify(next),
    });
    if (write.ok) return true;
    if (write.status !== 412) {
      throw new Error(`Safety-Task konnte die Session nicht sichern (${write.status}).`);
    }
  }
  throw new Error('Safety-Task konnte die Session wegen paralleler Änderungen nicht sichern.');
}

exports.scheduleSafetyAutoExtend = onValueWritten(
  { ref: 'heimwege/{uid}/expiresAt', ...RTDB_TRIGGER_OPTS, retry: true, maxInstances: 5 },
  async (event) => {
    const before = Number(event.data.before.val());
    const expiresAt = Number(event.data.after.val());
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() || expiresAt === before) return;
    await enqueueSafetyAutoExtendTask(event.params.uid, expiresAt);
  },
);

exports.dispatchSafetyAutoExtend = onTaskDispatched(
  SAFETY_AUTO_EXTEND_TASK_OPTS,
  async (request) => {
    const uid = request.data?.uid;
    const expiresAt = Number(request.data?.expiresAt);
    if (!validUid(uid) || !Number.isFinite(expiresAt)) return;
    return { extended: await autoExtendSafetySessionFromTask(uid, expiresAt) };
  },
);

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

async function claimJourneyReminder(activityId, generation) {
  const db = getFirestore();
  const activityRef = db.doc(`activities/${activityId}`);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(activityRef);
    if (!snapshot.exists) return null;
    const activity = snapshot.data();
    if (
      activity.status !== 'active' ||
      activity.mode === 'now' ||
      activity.journeyReminderGeneration !== generation ||
      !journeyNotificationPayload(activityId, activity)
    ) {
      return null;
    }
    if (activity.journeyReminderSentAt) {
      return activity.journeyReminderSentGeneration === generation ? activity : null;
    }
    transaction.update(activityRef, {
      journeyReminderSentAt: Timestamp.now(),
      journeyReminderSentGeneration: generation,
    });
    return activity;
  });
}

async function createIdempotentJourneyReminderNotifications(activityId, generation, items) {
  const validItems = items.filter((item) => item.recipientUid);
  if (!validItems.length) return;
  const db = getFirestore();
  const deliveryId = deterministicTaskId('journey-reminder-delivery', activityId, generation);
  const outboxRef = db.doc(`pushOutbox/${deliveryId}`);
  if ((await outboxRef.get()).exists) return;

  const expireAt = Timestamp.fromMillis(Date.now() + NOTIFICATION_RETENTION_MS);
  const batch = db.batch();
  validItems.forEach((item) => {
    batch.create(db.doc(`notifications/${deterministicTaskId(deliveryId, item.recipientUid)}`), {
      recipientUid: item.recipientUid,
      kind: item.kind,
      title: item.title.slice(0, 100),
      body: item.body.slice(0, 500),
      activityId,
      createdAt: Timestamp.now(),
      expireAt,
    });
  });
  batch.create(outboxRef, {
    items: validItems.map(pushOutboxItem),
    createdAt: Timestamp.now(),
    expireAt,
  });
  try {
    await batch.commit();
  } catch (error) {
    if (taskAlreadyExists(error) || (await outboxRef.get()).exists) return;
    throw error;
  }
}

async function dispatchJourneyReminder(activityId, generation) {
  if (!validActivityId(activityId) || typeof generation !== 'string' || !generation) return;
  const activity = await claimJourneyReminder(activityId, generation);
  if (!activity) return;
  const journey = journeyNotificationPayload(activityId, activity);
  if (!journey) return;
  const recipients = Array.isArray(activity.participantUids) ? activity.participantUids : [];
  const eligible = await filterJourneyReminderRecipients(getFirestore(), recipients);
  const startLabel = formatBerlinClock(activity.startsAt);
  await createIdempotentJourneyReminderNotifications(
    activityId,
    generation,
    eligible.map((recipientUid) => ({
      recipientUid,
      kind: 'journey_reminder',
      title: startLabel
        ? `${activity.title ?? 'Deine Activity'} beginnt um ${startLabel}`
        : `${activity.title ?? 'Deine Activity'} beginnt bald`,
      body: 'Anreise teilen? Zum Aktivieren tippen.',
      activityId,
      journey,
    })),
  );
}

exports.scheduleJourneyReminder = onDocumentWritten(
  { document: 'activities/{activityId}', ...EVENT_TRIGGER_OPTS, retry: true, maxInstances: 5 },
  async (event) => {
    const before = event.data?.before.data();
    const activity = event.data?.after.data();
    if (!activity || before?.journeyReminderGeneration === activity.journeyReminderGeneration)
      return;
    await enqueueJourneyReminderTask(event.params.activityId, activity);
  },
);

exports.dispatchJourneyReminder = onTaskDispatched(JOURNEY_REMINDER_TASK_OPTS, async (request) => {
  await dispatchJourneyReminder(request.data?.activityId, request.data?.generation);
});

async function journeyReminderRecoveryGeneration(activityId) {
  const db = getFirestore();
  const activityRef = db.doc(`activities/${activityId}`);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(activityRef);
    if (!snapshot.exists) return null;
    const activity = snapshot.data();
    if (
      activity.status !== 'active' ||
      activity.mode === 'now' ||
      !journeyNotificationPayload(activityId, activity)
    ) {
      return null;
    }
    const generation = activity.journeyReminderGeneration;
    if (typeof generation === 'string' && generation) return generation;
    // A pre-migration reminder without a generation may already have been sent.
    if (activity.journeyReminderSentAt) return null;
    const recoveryGeneration = randomUUID();
    transaction.update(activityRef, { journeyReminderGeneration: recoveryGeneration });
    return recoveryGeneration;
  });
}

async function reconcileMissedJourneyReminders(now) {
  const earliestStart = new Date(
    now + JOURNEY_REMINDER_LEAD_MS - JOURNEY_REMINDER_LOOKBACK_MS,
  ).toISOString();
  const latestStart = new Date(now + JOURNEY_REMINDER_LEAD_MS).toISOString();
  const snapshot = await getFirestore()
    .collection('activities')
    .where('status', '==', 'active')
    .where('startsAt', '>=', earliestStart)
    .where('startsAt', '<=', latestStart)
    .orderBy('startsAt', 'asc')
    .limit(100)
    .get();

  for (const activitySnapshot of snapshot.docs) {
    const generation = await journeyReminderRecoveryGeneration(activitySnapshot.id);
    if (!generation) continue;
    await dispatchJourneyReminder(activitySnapshot.id, generation);
  }
}

function shouldRunQuarterHourlyMaintenance(now) {
  return new Date(now).getUTCMinutes() % 15 < 5;
}

exports.maintainRuntime = onSchedule(
  { schedule: 'every 5 minutes', ...SERIAL_SCHEDULE_OPTS },
  async () => {
    const now = Date.now();
    await reconcileSafetyAutoExtensions(now);
    if (!shouldRunQuarterHourlyMaintenance(now)) return;
    await Promise.all([cleanupExpiredRuntime(now), reconcileMissedJourneyReminders(now)]);
  },
);
