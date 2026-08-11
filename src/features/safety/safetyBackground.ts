import AsyncStorage from '@react-native-async-storage/async-storage';
import { onAuthStateChanged } from '@react-native-firebase/auth';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { AppState, Platform } from 'react-native';

import { getFirebaseAuth } from '@/shared/services/firebase';
import { SEMANTIC_COLOR } from '@/shared/utils/semanticColors';

import {
  continueSafetyStationaryWindow,
  markSafetyMotionPublished,
  observeSafetyMotion,
  type SafetyMotionState,
} from './safetyMotion';
import {
  cancelSafetyNotification,
  scheduleSafetyStationaryNotification,
} from './safetyNotifications';
import { safetyService } from './services/safetyService';
import type { SafetyActor } from './services/safetyService.types';
import type { SafetyLocation, SafetyStatus } from './types';

export const SAFETY_LOCATION_TASK = 'together.safety.location.v1';
export const SAFETY_DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;

const STORAGE_KEY = 'together.safety.background.v1';
const TRAIL_WINDOW_MS = 15 * 60 * 1000;
const BLUE_INTERVAL_MS = 30_000;
const ALERT_INTERVAL_MS = 5_000;
const MAX_ACCURACY_METERS = 65;
const ANDROID_FOREGROUND_SETTLE_MS = 350;
const APP_FOREGROUND_TIMEOUT_MS = 15_000;

// Starting/stopping a native location task is not atomic. Session restoration
// and a freshly completed start/status action can arrive almost together, so
// serialize every native transition instead of racing two stop/start pairs.
let nativeTransition: Promise<void> = Promise.resolve();

function runNativeTransition(action: () => Promise<void>): Promise<void> {
  const result = nativeTransition.then(action, action);
  nativeTransition = result.catch(() => undefined);
  return result;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Android can resolve its background-location permission while MainActivity is
 * still completing onResume. Starting a location foreground service inside
 * that small lifecycle gap is rejected even though React Native already
 * reports the permission result. Wait for the real foreground transition and
 * give the Activity one frame-sized settling window before touching the FGS.
 */
async function waitForAppForeground(): Promise<void> {
  if (AppState.currentState === 'active') {
    if (Platform.OS === 'android') await delay(ANDROID_FOREGROUND_SETTLE_MS);
    return;
  }

  await new Promise<void>((resolve, reject) => {
    let subscription: ReturnType<typeof AppState.addEventListener> | null = null;
    const cleanup = () => {
      clearTimeout(timeout);
      subscription?.remove();
    };
    const finish = () => {
      cleanup();
      void (
        Platform.OS === 'android' ? delay(ANDROID_FOREGROUND_SETTLE_MS) : Promise.resolve()
      ).then(resolve, reject);
    };
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('APP_NOT_FOREGROUND'));
    }, APP_FOREGROUND_TIMEOUT_MS);

    subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') finish();
    });

    // Avoid missing a transition between the initial check and listener setup.
    if (AppState.currentState === 'active') finish();
  });
}

function isAndroidForegroundStartRace(error: unknown): boolean {
  if (Platform.OS !== 'android') return false;
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('Foreground service cannot be started') ||
    message.includes("Couldn't start the foreground service")
  );
}

interface StoredSafetyBackground extends SafetyMotionState {
  version: 1;
  actor: SafetyActor;
  expiresAt: number;
  status: SafetyStatus;
  stationaryNotificationId?: string | null;
  trail: SafetyLocation[];
}

export function safetyBackgroundRequired(): boolean {
  return Platform.OS !== 'web';
}

async function readState(): Promise<StoredSafetyBackground | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const state = JSON.parse(raw) as StoredSafetyBackground;
    if (state.version !== 1 || !state.actor?.uid || !Number.isFinite(state.expiresAt)) {
      await AsyncStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return { ...state, trail: Array.isArray(state.trail) ? state.trail : [] };
  } catch {
    await AsyncStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

async function writeState(state: StoredSafetyBackground | null): Promise<void> {
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

function locationOptions(status: SafetyStatus): Location.LocationTaskOptions {
  const urgent = status === 'orange' || status === 'red';
  const color =
    status === 'red'
      ? SEMANTIC_COLOR.danger
      : status === 'orange'
        ? SEMANTIC_COLOR.safetyAttention
        : SEMANTIC_COLOR.safetyNormal;
  const notificationBody =
    status === 'red'
      ? 'Hilferuf aktiv · Dein Standort wird häufiger aktualisiert.'
      : status === 'orange'
        ? 'Unsicher gemeldet · Dein Standort wird häufiger aktualisiert.'
        : 'Dein Live-Standort wird mit ausgewählten Freunden geteilt.';

  return {
    accuracy: urgent ? Location.Accuracy.High : Location.Accuracy.Balanced,
    timeInterval: urgent ? ALERT_INTERVAL_MS : BLUE_INTERVAL_MS,
    distanceInterval: urgent ? 5 : 15,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    activityType: Location.ActivityType.OtherNavigation,
    ...(Platform.OS === 'android'
      ? {
          foregroundService: {
            notificationTitle: 'Como: Heimweg aktiv',
            notificationBody,
            notificationColor: color,
            // Keep the explicit Safety service alive when the task switcher is
            // closed. OEM battery managers can still intervene; the UI remains
            // honest through its last-update timestamp.
            killServiceOnDestroy: false,
          },
        }
      : {}),
  };
}

async function startNativeUpdates(status: SafetyStatus, restart = false): Promise<void> {
  await runNativeTransition(async () => {
    const started = await Location.hasStartedLocationUpdatesAsync(SAFETY_LOCATION_TASK);
    if (started && restart) await Location.stopLocationUpdatesAsync(SAFETY_LOCATION_TASK);
    if (started && !restart) return;
    await waitForAppForeground();
    try {
      await Location.startLocationUpdatesAsync(SAFETY_LOCATION_TASK, locationOptions(status));
    } catch (error) {
      if (!isAndroidForegroundStartRace(error)) throw error;

      // Permission screens can briefly report AppState "active" before the
      // Activity is fully resumed. Retry this one known transient race once.
      await waitForAppForeground();
      await Location.startLocationUpdatesAsync(SAFETY_LOCATION_TASK, locationOptions(status));
    }
  });
}

async function stopNativeUpdates(): Promise<void> {
  await runNativeTransition(async () => {
    if (await Location.hasStartedLocationUpdatesAsync(SAFETY_LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(SAFETY_LOCATION_TASK);
    }
  });
}

async function expireBackgroundState(): Promise<void> {
  const state = await readState();
  await cancelSafetyNotification(state?.stationaryNotificationId ?? null);
  await stopNativeUpdates().catch(() => undefined);
  await writeState(null);
}

async function processLocation(location: Location.LocationObject): Promise<void> {
  if (!safetyBackgroundRequired()) return;
  const state = await readState();
  if (!state) return;

  const now = Date.now();
  if (state.expiresAt <= now) {
    await expireBackgroundState();
    return;
  }
  if ((await currentFirebaseUid()) !== state.actor.uid) {
    await expireBackgroundState();
    return;
  }
  const accuracy = location.coords.accuracy;
  if (accuracy != null && accuracy > MAX_ACCURACY_METERS) return;

  const point: SafetyLocation = {
    lat: Number(location.coords.latitude.toFixed(5)),
    lng: Number(location.coords.longitude.toFixed(5)),
    at: location.timestamp || now,
  };
  const decision = observeSafetyMotion(state, point, state.status, now);
  let nextState: StoredSafetyBackground = { ...state, ...decision.next };

  if (decision.stationaryWindowReset) {
    await cancelSafetyNotification(state.stationaryNotificationId ?? null);
    nextState.stationaryNotificationId = await scheduleSafetyStationaryNotification(
      decision.stationaryDueAt,
    );
  }

  const minimumInterval =
    state.status === 'blue' ? BLUE_INTERVAL_MS - 2_000 : ALERT_INTERVAL_MS - 750;
  const intervalReady = !state.lastPublishedAt || now - state.lastPublishedAt >= minimumInterval;
  const publishLocation = decision.shouldPublishLocation && intervalReady;
  if (publishLocation || decision.shouldHeartbeat) {
    await safetyService.updateSession(state.actor, publishLocation ? { location: point } : {});
    nextState = {
      ...nextState,
      ...markSafetyMotionPublished(nextState, publishLocation ? point : undefined, now),
    };
    if (publishLocation) {
      nextState.trail = [...state.trail, point].filter((item) => now - item.at <= TRAIL_WINDOW_MS);
    }
  }
  await writeState(nextState);
}

if (Platform.OS !== 'web' && !TaskManager.isTaskDefined(SAFETY_LOCATION_TASK)) {
  TaskManager.defineTask<{ locations?: Location.LocationObject[] }>(
    SAFETY_LOCATION_TASK,
    async ({ data, error }) => {
      if (error) {
        console.warn('[safety] Hintergrund-Standort fehlgeschlagen:', error.message);
        return;
      }
      // Android/iOS may batch fixes. Publishing only the newest usable point
      // preserves the last-point-only model and avoids unnecessary RTDB writes.
      const latest = data?.locations?.at(-1);
      if (!latest) return;
      try {
        await processLocation(latest);
      } catch (taskError) {
        console.warn('[safety] Hintergrund-Update fehlgeschlagen:', taskError);
      }
    },
  );
}

export async function requestSafetyBackgroundPermission(): Promise<boolean> {
  if (!safetyBackgroundRequired()) return true;
  if (
    !(await TaskManager.isAvailableAsync()) ||
    !(await Location.isBackgroundLocationAvailableAsync())
  ) {
    return false;
  }

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

export async function startSafetyBackground(
  actor: SafetyActor,
  expiresAt: number,
  status: SafetyStatus,
): Promise<boolean> {
  if (!safetyBackgroundRequired()) return false;
  if (!(await Location.getBackgroundPermissionsAsync()).granted) return false;

  const state: StoredSafetyBackground = {
    version: 1,
    actor,
    expiresAt,
    status,
    trail: [],
  };
  await writeState(state);
  try {
    await startNativeUpdates(status, true);
  } catch (error) {
    console.warn('[safety] Nativer Standortdienst konnte nicht starten:', error);
    await writeState(null);
    if (error instanceof Error && error.message === 'APP_NOT_FOREGROUND') {
      throw new Error('Öffne Como erneut und starte den Heimweg noch einmal.');
    }
    throw new Error(
      'Der Standortdienst konnte auf diesem Gerät nicht gestartet werden. Prüfe den Standortzugriff und versuche es erneut.',
    );
  }

  // Seed the map promptly after the explicit start instead of waiting for the
  // first OS batch. Failure is harmless; the background task remains active.
  void Location.getCurrentPositionAsync({
    accuracy: status === 'blue' ? Location.Accuracy.Balanced : Location.Accuracy.High,
  })
    .then(processLocation)
    .catch(() => undefined);
  return true;
}

/** Restores a still-running session after JS/app restart without prompting. */
export async function resumeSafetyBackground(
  actor: SafetyActor,
  expiresAt: number,
  status: SafetyStatus,
): Promise<boolean> {
  if (!safetyBackgroundRequired()) return false;
  if (!(await Location.getBackgroundPermissionsAsync()).granted) return false;

  const current = await readState();
  const next: StoredSafetyBackground =
    current?.actor.uid === actor.uid
      ? { ...current, actor, expiresAt, status }
      : { version: 1, actor, expiresAt, status, trail: [] };
  await writeState(next);
  // Android restores TaskManager registrations before MainActivity is fully
  // foregrounded. Expo can then report the task as "started" although the OS
  // rejected its foreground service. A real stop/start after the app becomes
  // active is the only reliable recovery after a process restart. It also
  // applies fresh options when the Safety status changed.
  await startNativeUpdates(status, true);
  return true;
}

export async function stopSafetyBackground(): Promise<void> {
  if (!safetyBackgroundRequired()) return;
  const state = await readState();
  await cancelSafetyNotification(state?.stationaryNotificationId ?? null);
  await stopNativeUpdates().catch(() => undefined);
  await writeState(null);
}

/** User explicitly chose "Weiter teilen" after the 45-minute prompt. */
export async function continueSafetyAfterStationary(): Promise<void> {
  if (!safetyBackgroundRequired()) return;
  const state = await readState();
  if (!state || state.expiresAt <= Date.now()) return;
  const now = Date.now();
  await cancelSafetyNotification(state.stationaryNotificationId ?? null);
  const next = continueSafetyStationaryWindow(state, now);
  const stationaryNotificationId = await scheduleSafetyStationaryNotification(now + 45 * 60 * 1000);
  await writeState({ ...state, ...next, stationaryNotificationId });
}

export async function getSafetyBackgroundTrail(): Promise<SafetyLocation[]> {
  return (await readState())?.trail ?? [];
}
