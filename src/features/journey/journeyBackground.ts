import AsyncStorage from '@react-native-async-storage/async-storage';
import { onAuthStateChanged } from '@react-native-firebase/auth';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { notificationService } from '@/features/notifications/services/notificationService';
import { getFirebaseAuth } from '@/shared/services/firebase';

import { journeyService } from './services/journeyService';
import type { JourneyActor } from './services/journeyService.types';
import type { JourneyActivityContext, JourneyStartResult, UserJourneyRecord } from './types';
import type { GeoCoordinate } from '@/domain/geo';

export const JOURNEY_LOCATION_TASK = 'together.journey.location.v1';
export const JOURNEY_NOTIFICATION_TASK = 'together.journey.notification.v1';
export const JOURNEY_REMINDER_CATEGORY = 'together.journey.reminder.v1';
export const JOURNEY_AUTO_SHARE_ACTION = 'together.journey.auto-share.v1';
/** Data-only local trigger that (best-effort) starts the watcher at T-30 —
 * see `scheduleArmTrigger`. Never shown as the reminder push; no user copy. */
const JOURNEY_ARM_TRIGGER_KIND = 'journey_arm_due';
/** Android channel for the T-30 trigger: minimum importance, no sound — it has
 * no user-facing content. iOS has no equivalent suppression for LOCAL
 * notifications; verify actual on-screen behaviour on a real device before
 * relying on it (docs/safety-mode.md release gates). */
const JOURNEY_ARM_CHANNEL = 'together-journey-arm-trigger';

const STORAGE_KEY = 'together.journey.automation.v1';
const DETECTION_LEAD_MS = 30 * 60 * 1000;
const HARD_MAX_MS = 2 * 60 * 60 * 1000;
const EVENT_END_BUFFER_MS = 30 * 60 * 1000;
const ARRIVAL_RADIUS_METERS = 100;
const ARRIVAL_CONFIRMATIONS = 2;
const ARRIVAL_VISIBLE_MS = 15 * 60 * 1000;
const LOCATION_INTERVAL_MS = 30_000;
const LOCATION_DISTANCE_INTERVAL_METERS = 20;
const MAX_USABLE_ACCURACY_METERS = 45;
const MIN_MOVEMENT_METERS = 40;
const MIN_MOVEMENT_SPEED_MPS = 0.45;
const MAX_MOVEMENT_SAMPLE_GAP_MS = 4 * 60 * 1000;

type AutomationStatus = 'armed' | 'underway' | 'arrived';

interface MovementObservation {
  coordinate: GeoCoordinate;
  accuracyMeters?: number;
  at: number;
}

interface StoredJourney {
  version: 2;
  actor: JourneyActor;
  activity: JourneyActivityContext;
  status: AutomationStatus;
  armedAt: string;
  detectionStartsAt: number;
  startedAt?: string;
  updatedAt: string;
  currentCoordinate?: GeoCoordinate;
  lastObservation?: MovementObservation;
  arrivalHits: number;
  arrivalExpiresAt?: number;
  /** Pending local-notification id for the best-effort T-30 arm trigger
   * (see `scheduleArmTrigger`). Absent once the watcher is actually running. */
  armTriggerNotificationId?: string;
}

interface LegacyStoredJourney {
  actor?: JourneyActor;
  activity?: { id?: string };
  armTriggerNotificationId?: string;
}

interface JourneyNotificationPayload {
  activityId: string;
  title: string;
  startsAt?: string;
  endsAt?: string;
  target?: GeoCoordinate;
}

function coordinateFromLocation(location: Location.LocationObject): GeoCoordinate {
  return { latitude: location.coords.latitude, longitude: location.coords.longitude };
}

function distanceMeters(a?: GeoCoordinate, b?: GeoCoordinate): number | undefined {
  if (!a || !b) return undefined;
  const earthRadiusMeters = 6_371_000;
  const latitudeDelta = ((b.latitude - a.latitude) * Math.PI) / 180;
  const longitudeDelta = ((b.longitude - a.longitude) * Math.PI) / 180;
  const startLatitude = (a.latitude * Math.PI) / 180;
  const endLatitude = (b.latitude * Math.PI) / 180;
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function journeyExpiry(state: StoredJourney, now: number) {
  // Arming may happen from the in-app entry up to six hours before start. The
  // two-hour safety cap therefore begins with movement (or the T-30 detection
  // window), not with that early, location-free consent tap.
  const hardStopBase = state.startedAt
    ? Date.parse(state.startedAt)
    : Math.max(Date.parse(state.armedAt), state.detectionStartsAt);
  const hardStopAt = hardStopBase + HARD_MAX_MS;
  const eventStopAt = state.activity.endsAt
    ? Date.parse(state.activity.endsAt) + EVENT_END_BUFFER_MS
    : Infinity;
  return Math.min(hardStopAt, eventStopAt, now + HARD_MAX_MS);
}

function recordFromStored(state: StoredJourney): UserJourneyRecord {
  const coordinate = state.currentCoordinate;
  const distance = distanceMeters(coordinate, state.activity.targetCoordinate);
  return {
    activityId: state.activity.id,
    title: state.activity.title,
    status: state.status,
    distanceKm: state.status === 'arrived' ? 0 : Number(((distance ?? 0) / 1000).toFixed(3)),
    startedAt: state.startedAt ?? state.armedAt,
    armedAt: state.armedAt,
    detectionStartsAt: new Date(state.detectionStartsAt).toISOString(),
    updatedAt: state.updatedAt,
    targetCoordinate: state.activity.targetCoordinate,
    currentCoordinate: coordinate,
    endsAt: state.activity.endsAt,
    backgroundManaged: true,
  };
}

async function readStoredJourney(): Promise<StoredJourney | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredJourney | LegacyStoredJourney;
    if ((parsed as StoredJourney).version !== 2) {
      // v1 stored destinations could have passed through the obsolete Berlin
      // canvas projection. End that consent instead of continuing to share a
      // journey against a potentially wrong destination.
      const legacy = parsed as LegacyStoredJourney;
      if (typeof legacy.armTriggerNotificationId === 'string') {
        await Notifications.cancelScheduledNotificationAsync(legacy.armTriggerNotificationId).catch(
          () => {},
        );
      }
      if (legacy.actor?.uid && legacy.activity?.id) {
        await journeyService.stopJourney(legacy.actor, legacy.activity.id).catch(() => {});
        await stopNativeLocationUpdates().catch(() => {});
      }
      await AsyncStorage.removeItem(STORAGE_KEY);
      return null;
    }
    const state = parsed as StoredJourney;
    if (!state.activity?.id || !state.actor?.uid) {
      await AsyncStorage.removeItem(STORAGE_KEY);
      return null;
    }
    if (state.status === 'arrived' && (state.arrivalExpiresAt ?? 0) <= Date.now()) {
      await AsyncStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return state;
  } catch {
    await AsyncStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

async function writeStoredJourney(state: StoredJourney | null) {
  if (!state) {
    await AsyncStorage.removeItem(STORAGE_KEY);
    return;
  }
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

async function currentFirebaseUid(): Promise<string | null> {
  const auth = getFirebaseAuth();
  if (auth.currentUser) return auth.currentUser.uid;

  return new Promise((resolve) => {
    let unsubscribe: () => void = () => {};
    const timeout = setTimeout(() => {
      unsubscribe();
      resolve(null);
    }, 4_000);
    unsubscribe = onAuthStateChanged(auth, (user) => {
      clearTimeout(timeout);
      unsubscribe();
      resolve(user?.uid ?? null);
    });
  });
}

async function hasMatchingSignedInUser(state: StoredJourney) {
  const uid = await currentFirebaseUid();
  return uid === state.actor.uid;
}

function locationIsUsable(location: Location.LocationObject) {
  const accuracy = location.coords.accuracy;
  return accuracy == null || accuracy <= MAX_USABLE_ACCURACY_METERS;
}

function isMeaningfulMovement(
  previous: MovementObservation,
  next: MovementObservation,
  reportedSpeed: number | null,
) {
  const elapsedMs = next.at - previous.at;
  if (elapsedMs <= 0 || elapsedMs > MAX_MOVEMENT_SAMPLE_GAP_MS) return false;

  const movedMeters = distanceMeters(previous.coordinate, next.coordinate) ?? 0;
  const calculatedSpeed = movedMeters / (elapsedMs / 1000);
  const speed = Math.max(
    reportedSpeed != null && reportedSpeed >= 0 ? reportedSpeed : 0,
    calculatedSpeed,
  );
  return movedMeters >= MIN_MOVEMENT_METERS && speed >= MIN_MOVEMENT_SPEED_MPS;
}

function activityFromPayload(value: unknown): JourneyActivityContext | null {
  if (!value || typeof value !== 'object') return null;
  const payload = value as JourneyNotificationPayload;
  if (typeof payload.activityId !== 'string' || typeof payload.title !== 'string') return null;
  const target = payload.target;
  const targetCoordinate =
    target && typeof target.latitude === 'number' && typeof target.longitude === 'number'
      ? target
      : undefined;
  return {
    id: payload.activityId,
    title: payload.title,
    participants: [],
    startsAt: typeof payload.startsAt === 'string' ? payload.startsAt : undefined,
    endsAt: typeof payload.endsAt === 'string' ? payload.endsAt : undefined,
    targetCoordinate,
  };
}

function responseData(response: Notifications.NotificationResponse) {
  return response.notification.request.content.data as Record<string, unknown>;
}

function taskPayloadData(
  payload: Notifications.NotificationTaskPayload,
): Record<string, unknown> | null {
  if ('actionIdentifier' in payload) return responseData(payload);
  const dataString = payload.data?.dataString;
  if (!dataString) return null;
  try {
    const parsed = JSON.parse(dataString) as Record<string, unknown>;
    return parsed;
  } catch {
    return null;
  }
}

function isAutoShareResponse(response: Notifications.NotificationResponse) {
  const data = responseData(response);
  return (
    response.actionIdentifier === JOURNEY_AUTO_SHARE_ACTION && data.kind === 'journey_reminder'
  );
}

/**
 * Consent (tapping "Anreise teilen") is recorded immediately, but the native
 * watcher — and its battery/foreground-notification footprint — should only
 * start at T-30, mirroring the reminder push. This schedules a data-only
 * local notification for that moment as a best-effort background trigger;
 * `ensureBackgroundWatcherArmed` (called from the foreground poll) is the
 * reliable backstop if the OS throttles background delivery.
 */
async function scheduleArmTrigger(state: StoredJourney): Promise<string | undefined> {
  try {
    return await Notifications.scheduleNotificationAsync({
      content: { data: { kind: JOURNEY_ARM_TRIGGER_KIND, activityId: state.activity.id } },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: state.detectionStartsAt,
        ...(Platform.OS === 'android' ? { channelId: JOURNEY_ARM_CHANNEL } : {}),
      },
    });
  } catch (error) {
    console.warn('[journey] Scharfschalt-Trigger konnte nicht geplant werden:', error);
    return undefined;
  }
}

async function cancelArmTrigger(state: StoredJourney) {
  if (!state.armTriggerNotificationId) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(state.armTriggerNotificationId);
  } catch {
    // Already fired or invalid — nothing to clean up.
  }
}

async function startNativeLocationUpdates() {
  const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(JOURNEY_LOCATION_TASK);
  if (alreadyStarted) return;

  await Location.startLocationUpdatesAsync(JOURNEY_LOCATION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: LOCATION_INTERVAL_MS,
    distanceInterval: LOCATION_DISTANCE_INTERVAL_METERS,
    pausesUpdatesAutomatically: true,
    showsBackgroundLocationIndicator: true,
    activityType: Location.ActivityType.OtherNavigation,
    ...(Platform.OS === 'android'
      ? {
          foregroundService: {
            notificationTitle: 'Together: Anreise vorbereitet',
            notificationBody: 'Dein Standort wird erst bei Bewegung mit Teilnehmern geteilt.',
            notificationColor: '#6E8BF7',
            killServiceOnDestroy: true,
          },
        }
      : {}),
  });
}

async function stopNativeLocationUpdates() {
  if (await Location.hasStartedLocationUpdatesAsync(JOURNEY_LOCATION_TASK)) {
    await Location.stopLocationUpdatesAsync(JOURNEY_LOCATION_TASK);
  }
}

async function publishLocation(
  state: StoredJourney,
  coordinate: GeoCoordinate,
  status: 'onTheWay' | 'arrived',
  now: number,
  initial = false,
) {
  const expiresAt =
    status === 'arrived'
      ? Math.min(now + ARRIVAL_VISIBLE_MS, journeyExpiry(state, now))
      : journeyExpiry(state, now);
  const location = {
    lat: coordinate.latitude,
    lng: coordinate.longitude,
    status,
    updatedAt: now,
    expiresAt,
  };
  if (initial) {
    await journeyService.startJourney(state.actor, state.activity, location);
  } else {
    await journeyService.updateJourney(state.actor, state.activity.id, location);
  }
}

async function finishForExpiry(state: StoredJourney) {
  await cancelArmTrigger(state);
  await journeyService.stopJourney(state.actor, state.activity.id).catch(() => {});
  await stopNativeLocationUpdates().catch(() => {});
  await writeStoredJourney(null);
}

/**
 * Starts the watcher for an already-consented journey once T-30 has arrived.
 * Idempotent (startNativeLocationUpdates no-ops if already running) — safe to
 * call from both the foreground poll (reliable) and the background arm
 * trigger (best-effort, may be throttled by the OS while backgrounded).
 */
export async function ensureBackgroundWatcherArmed() {
  if (Platform.OS === 'web') return;
  const state = await readStoredJourney();
  if (!state || state.status !== 'armed') return;
  if (!(await hasMatchingSignedInUser(state))) return;

  const now = Date.now();
  if (now >= journeyExpiry(state, now)) {
    await finishForExpiry(state);
    return;
  }
  if (now < state.detectionStartsAt) return;
  await cancelArmTrigger(state);
  await startNativeLocationUpdates();
}

async function processLocation(location: Location.LocationObject) {
  const state = await readStoredJourney();
  if (!state || state.status === 'arrived') return;
  if (!(await hasMatchingSignedInUser(state))) return;

  const now = Date.now();
  if (now >= journeyExpiry(state, now)) {
    await finishForExpiry(state);
    return;
  }
  // An explicit in-app tap may arm before the T-60 reminder. Until T-30 every
  // reading is discarded locally: no coordinate is persisted and no RTDB
  // write is made.
  if (now < state.detectionStartsAt || !locationIsUsable(location)) return;

  const observation: MovementObservation = {
    coordinate: coordinateFromLocation(location),
    accuracyMeters: location.coords.accuracy ?? undefined,
    at: location.timestamp || now,
  };

  if (state.status === 'armed') {
    const previous = state.lastObservation;
    state.lastObservation = observation;
    state.updatedAt = new Date(now).toISOString();
    if (!previous || !isMeaningfulMovement(previous, observation, location.coords.speed)) {
      await writeStoredJourney(state);
      return;
    }

    state.status = 'underway';
    state.startedAt = new Date(now).toISOString();
    state.currentCoordinate = observation.coordinate;
    await publishLocation(state, observation.coordinate, 'onTheWay', now, true);
    await writeStoredJourney(state);
    await notificationService.showJourneyStatus({
      activityId: state.activity.id,
      title: state.activity.title,
      state: 'started',
    });
    return;
  }

  state.currentCoordinate = observation.coordinate;
  state.updatedAt = new Date(now).toISOString();
  const distanceToTarget = distanceMeters(observation.coordinate, state.activity.targetCoordinate);
  state.arrivalHits =
    distanceToTarget != null && distanceToTarget <= ARRIVAL_RADIUS_METERS
      ? state.arrivalHits + 1
      : 0;

  if (state.arrivalHits >= ARRIVAL_CONFIRMATIONS) {
    state.status = 'arrived';
    state.arrivalExpiresAt = Math.min(now + ARRIVAL_VISIBLE_MS, journeyExpiry(state, now));
    await publishLocation(state, observation.coordinate, 'arrived', now);
    await writeStoredJourney(state);
    await stopNativeLocationUpdates().catch(() => {});
    await notificationService.showJourneyStatus({
      activityId: state.activity.id,
      title: state.activity.title,
      state: 'arrived',
    });
    return;
  }

  await publishLocation(state, observation.coordinate, 'onTheWay', now);
  await writeStoredJourney(state);
}

async function handleBackgroundNotification(payload: Notifications.NotificationTaskPayload) {
  // Tapped the reminder action → arm from scratch (existing flow).
  if ('actionIdentifier' in payload) {
    if (payload.actionIdentifier !== JOURNEY_AUTO_SHARE_ACTION) return;
    const data = taskPayloadData(payload);
    if (!data || data.kind !== 'journey_reminder') return;
    const activity = activityFromPayload(data.journey);
    if (!activity) return;
    const uid = await currentFirebaseUid();
    if (!uid) return;
    await armBackgroundJourney({
      activity,
      actor: { uid, displayName: 'Du', initials: 'DU' },
      requestPermission: false,
    });
    return;
  }

  // Delivered without interaction — the T-30 trigger for an already-consented
  // journey (see scheduleArmTrigger). Best-effort; the foreground poll in
  // JourneyProvider catches up if the OS throttled this delivery.
  const data = taskPayloadData(payload);
  if (data?.kind === JOURNEY_ARM_TRIGGER_KIND) {
    await ensureBackgroundWatcherArmed();
  }
}

if (Platform.OS !== 'web' && !TaskManager.isTaskDefined(JOURNEY_LOCATION_TASK)) {
  TaskManager.defineTask<{ locations?: Location.LocationObject[] }>(
    JOURNEY_LOCATION_TASK,
    async ({ data, error }) => {
      if (error) {
        console.warn('[journey] Hintergrund-Standort fehlgeschlagen:', error.message);
        return;
      }
      for (const location of data?.locations ?? []) {
        await processLocation(location);
      }
    },
  );
}

if (Platform.OS !== 'web' && !TaskManager.isTaskDefined(JOURNEY_NOTIFICATION_TASK)) {
  TaskManager.defineTask<Notifications.NotificationTaskPayload>(
    JOURNEY_NOTIFICATION_TASK,
    async ({ data, error }) => {
      if (error) {
        console.warn('[journey] Hintergrund-Benachrichtigung fehlgeschlagen:', error.message);
        return;
      }
      await handleBackgroundNotification(data);
    },
  );
}

/** Registers the silent notification action and its Android headless handler. */
export async function prepareJourneyAutomation() {
  if (Platform.OS === 'web') return false;
  if (!(await TaskManager.isAvailableAsync())) return false;

  await Notifications.setNotificationCategoryAsync(JOURNEY_REMINDER_CATEGORY, [
    {
      identifier: JOURNEY_AUTO_SHARE_ACTION,
      buttonTitle: 'Anreise teilen',
      // Opens the app so the foreground arm path can REQUEST background
      // permission on first use — a headless action cannot prompt, so a fresh
      // install would otherwise tap "Aktivieren" and silently do nothing.
      // Robustness beats slickness for a safety-adjacent action.
      options: { opensAppToForeground: true },
    },
  ]);

  if (Platform.OS === 'android') {
    // Minimum importance, no sound/vibration: the T-30 arm trigger carries no
    // user-facing content, so it should be as close to invisible as Android
    // allows (no heads-up, no status-bar icon on most OEMs).
    await Notifications.setNotificationChannelAsync(JOURNEY_ARM_CHANNEL, {
      name: 'Anreise-Vorbereitung',
      importance: Notifications.AndroidImportance.MIN,
      sound: null,
      vibrationPattern: [0],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.SECRET,
    });
  }

  const registered = await TaskManager.getRegisteredTasksAsync();
  if (!registered.some((task) => task.taskName === JOURNEY_NOTIFICATION_TASK)) {
    await Notifications.registerTaskAsync(JOURNEY_NOTIFICATION_TASK);
  }
  return true;
}

/** Requests the explicit, system-level permission required before any silent action can work. */
export async function requestJourneyAutomationPermission() {
  if (Platform.OS === 'web') return false;
  const foreground = await Location.getForegroundPermissionsAsync();
  const foregroundResult = foreground.granted
    ? foreground
    : await Location.requestForegroundPermissionsAsync();
  if (!foregroundResult.granted) return false;

  const background = await Location.getBackgroundPermissionsAsync();
  const backgroundResult = background.granted
    ? background
    : await Location.requestBackgroundPermissionsAsync();
  return backgroundResult.granted;
}

export async function armBackgroundJourney(input: {
  activity: JourneyActivityContext;
  actor: JourneyActor;
  requestPermission: boolean;
}): Promise<JourneyStartResult> {
  if (Platform.OS === 'web') {
    return { ok: false, reason: 'background-unavailable' };
  }
  if (!input.activity.targetCoordinate) return { ok: false, reason: 'destination-required' };
  if (
    !(await TaskManager.isAvailableAsync()) ||
    !(await Location.isBackgroundLocationAvailableAsync())
  ) {
    return { ok: false, reason: 'background-unavailable' };
  }

  if (input.requestPermission && !(await requestJourneyAutomationPermission())) {
    return { ok: false, reason: 'location-permission' };
  }
  if (!(await Location.getBackgroundPermissionsAsync()).granted) {
    return { ok: false, reason: 'location-permission' };
  }

  const current = await readStoredJourney();
  if (current && current.status !== 'arrived' && current.activity.id !== input.activity.id) {
    return { ok: false, conflict: recordFromStored(current) };
  }
  if (current?.activity.id === input.activity.id) return { ok: true };

  try {
    // Membership is authorized before tracking is armed, but deliberately no
    // live location node is created until movement is confirmed.
    await journeyService.ensureJourneyMember(input.actor, input.activity.id);
    const now = Date.now();
    const startsAt = input.activity.startsAt ? Date.parse(input.activity.startsAt) : NaN;
    const detectionStartsAt = Number.isFinite(startsAt)
      ? Math.max(now, startsAt - DETECTION_LEAD_MS)
      : now;
    const state: StoredJourney = {
      version: 2,
      actor: input.actor,
      activity: input.activity,
      status: 'armed',
      armedAt: new Date(now).toISOString(),
      detectionStartsAt,
      updatedAt: new Date(now).toISOString(),
      arrivalHits: 0,
    };
    await writeStoredJourney(state);
    if (now >= detectionStartsAt) {
      // Joining a "now" activity, or arming inside the T-30 window: there is
      // no future point to defer to, so start immediately.
      await startNativeLocationUpdates();
    } else {
      state.armTriggerNotificationId = await scheduleArmTrigger(state);
      await writeStoredJourney(state);
    }
    return { ok: true };
  } catch (error) {
    await writeStoredJourney(null);
    console.warn('[journey] Automatische Anreise konnte nicht vorbereitet werden:', error);
    return { ok: false, reason: 'location-unavailable' };
  }
}

export async function stopBackgroundJourney(actor: JourneyActor, activityId: string) {
  const state = await readStoredJourney();
  if (!state || state.activity.id !== activityId) return;
  await cancelArmTrigger(state);
  await stopNativeLocationUpdates().catch(() => {});
  await journeyService.stopJourney(actor, activityId).catch(() => {});
  await writeStoredJourney(null);
}

export async function markBackgroundJourneyArrived(actor: JourneyActor, activityId: string) {
  const state = await readStoredJourney();
  if (
    !state ||
    state.activity.id !== activityId ||
    state.status !== 'underway' ||
    !state.currentCoordinate
  ) {
    await stopBackgroundJourney(actor, activityId);
    return;
  }
  const now = Date.now();
  state.status = 'arrived';
  state.arrivalExpiresAt = Math.min(now + ARRIVAL_VISIBLE_MS, journeyExpiry(state, now));
  state.updatedAt = new Date(now).toISOString();
  await publishLocation(state, state.currentCoordinate, 'arrived', now);
  await writeStoredJourney(state);
  await stopNativeLocationUpdates().catch(() => {});
  await notificationService.showJourneyStatus({
    activityId,
    title: state.activity.title,
    state: 'arrived',
  });
}

export async function getBackgroundJourneyRecord() {
  const state = await readStoredJourney();
  return state ? recordFromStored(state) : null;
}

export function isJourneyAutoShareResponse(response: Notifications.NotificationResponse) {
  return isAutoShareResponse(response);
}

export function journeyContextFromNotification(response: Notifications.NotificationResponse) {
  return activityFromPayload(responseData(response).journey);
}
