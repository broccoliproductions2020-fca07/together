import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { getApp as getNativeApp, type FirebaseApp } from '@react-native-firebase/app';
import { initializeAppCheck } from '@react-native-firebase/app-check';
import { connectAuthEmulator, getAuth, type Auth } from '@react-native-firebase/auth';
import { connectDatabaseEmulator, getDatabase, type Database } from '@react-native-firebase/database';
import {
  enablePersistentCacheIndexAutoCreation,
  getFirestore,
  getPersistentCacheIndexManager,
  initializeFirestore,
  type Firestore,
} from '@react-native-firebase/firestore';
import { connectFunctionsEmulator, getFunctions, type Functions } from '@react-native-firebase/functions';
import { connectStorageEmulator, getStorage, type FirebaseStorage } from '@react-native-firebase/storage';
import { Platform } from 'react-native';

/**
 * Central Firebase bootstrap. Everything Firebase-shaped goes through here so
 * the rest of the app never imports the SDK directly.
 *
 * Modes (see docs/backend-plan.md):
 *  - `EXPO_PUBLIC_BACKEND` unset or `mock` → the app never calls into this file
 *    at runtime (services stay mock-backed); zero network, zero cost.
 *  - `firebase` + emulators (default)      → local Emulator Suite against the
 *    offline `demo-together` project. Start it with `npm run emulators`.
 *  - `firebase` + `EXPO_PUBLIC_FIREBASE_EMULATORS=false` → real cloud project
 *    (staging/release only; native project identity comes from the platform
 *    configuration files, not JavaScript environment variables).
 */

export type BackendKind = 'mock' | 'firebase';

export const BACKEND: BackendKind =
  Platform.OS !== 'web' &&
  process.env.EXPO_PUBLIC_BACKEND === 'firebase'
    ? 'firebase'
    : 'mock';

// Exported so auth services can tell a real cloud project apart from the
// local Emulator Suite (e.g. to keep guest sign-in dev/test-only — see
// firebaseAuthService.ts).
export const USE_EMULATORS = process.env.EXPO_PUBLIC_FIREBASE_EMULATORS !== 'false';
const APP_CHECK_ENABLED = process.env.EXPO_PUBLIC_FIREBASE_APP_CHECK_ENABLED === 'true';
const APP_CHECK_DEBUG_TOKEN = process.env.EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN;

const AUTH_EMULATOR_PORT = 9099;
const DATABASE_EMULATOR_PORT = 9000;
const FIRESTORE_EMULATOR_PORT = 8080;
const FUNCTIONS_EMULATOR_PORT = 5001;
const STORAGE_EMULATOR_PORT = 9198;

/**
 * Host of the emulator machine. Android/iOS simulators use an adb/simulator
 * loopback connection; physical devices derive the dev machine's LAN IP from
 * Expo's host URI. `EXPO_PUBLIC_FIREBASE_EMULATOR_HOST` overrides both.
 */
function emulatorHost(): string {
  const override = process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST;
  if (override) return override;

  // Metro's hostUri can contain the Windows LAN address even when the Android
  // emulator was launched through localhost. All local Firebase ports are
  // forwarded with `adb reverse`, so loopback is the reliable endpoint here.
  if (Platform.OS !== 'web' && !Device.isDevice) return '127.0.0.1';

  const hostUri = Constants.expoConfig?.hostUri;
  const host = hostUri?.split(':')[0];
  return host && host.length > 0 ? host : 'localhost';
}

/**
 * Firestore's native settings API expects the actual TCP endpoint. The
 * RNFirebase useEmulator helper normally translates Android's loopback to the
 * host machine; we configure the same endpoint directly before Firestore is
 * ever used, which also stays safe across Fast Refresh.
 */
function firestoreEmulatorEndpoint(): string {
  const host = emulatorHost();
  const androidEmulatorLoopback = Platform.OS === 'android' && !Device.isDevice &&
    (host === 'localhost' || host === '127.0.0.1');
  return `${androidEmulatorLoopback ? '10.0.2.2' : host}:${FIRESTORE_EMULATOR_PORT}`;
}

let auth: Auth | null = null;
let realtimeDb: Database | null = null;
let db: Firestore | null = null;
let functions: Functions | null = null;
let storage: FirebaseStorage | null = null;
let nativeFirebasePreparation: Promise<void> | null = null;

function isAlreadyInitializedEmulatorError(error: unknown): boolean {
  return error instanceof Error && /useEmulator\(\) after instance has already been initialized/i.test(error.message);
}

type EmulatorConnectionRegistry = typeof globalThis & {
  __togetherEmulatorConnections?: Set<string>;
};

const emulatorConnections = (() => {
  const root = globalThis as EmulatorConnectionRegistry;
  root.__togetherEmulatorConnections ??= new Set<string>();
  return root.__togetherEmulatorConnections;
})();

/**
 * Native Firebase instances outlive a Fast Refresh while this JS module is
 * evaluated again. Calling useEmulator a second time is rejected asynchronously
 * by RNFirebase, so remember every configured service across JS reloads.
 */
function connectLocalEmulator(service: string, configure: () => void): void {
  if (emulatorConnections.has(service)) return;
  emulatorConnections.add(service);

  try {
    configure();
  } catch (error) {
    if (isAlreadyInitializedEmulatorError(error)) return;
    emulatorConnections.delete(service);
    throw error;
  }
}

function getApp(): FirebaseApp {
  try {
    // The native SDK gets its project identity from GoogleService-Info.plist
    // and google-services.json. Those files are bound to the iOS bundle id and
    // Android package at build time; no Firebase identity lives in JS anymore.
    return getNativeApp();
  } catch {
    throw new Error(
      'Die native Firebase-Konfiguration fehlt. Hinterlege GoogleService-Info.plist und google-services.json vor dem nächsten Firebase-Build.',
    );
  }
}

/**
 * Initializes native Firebase before any authenticated provider can mount.
 *
 * Emulators deliberately skip App Check: they are local, offline and the
 * emulator suite cannot validate device attestations. Cloud builds fail closed
 * until App Check has explicitly been enabled, so no production release can
 * silently run without device-attestation protection.
 */
export function prepareNativeFirebase(): Promise<void> {
  if (BACKEND !== 'firebase' || Platform.OS === 'web') return Promise.resolve();
  if (nativeFirebasePreparation) return nativeFirebasePreparation;

  nativeFirebasePreparation = (async () => {
    const app = getApp();
    if (USE_EMULATORS) {
      // `connectFirestoreEmulator` is asynchronous in RNFirebase Android but
      // typed as void. A Fast Refresh can therefore issue a second native call
      // after Firestore already exists and leave an unhandled rejection. Set
      // the local endpoint through Firestore settings before any provider can
      // create a query instead.
      db = await initializeFirestore(app, {
        host: firestoreEmulatorEndpoint(),
        ssl: false,
      });
      const cacheIndexManager = getPersistentCacheIndexManager(db);
      if (cacheIndexManager) {
        void enablePersistentCacheIndexAutoCreation(cacheIndexManager).catch(() => {});
      }
      return;
    }
    if (!APP_CHECK_ENABLED) {
      throw new Error(
        'Firebase App Check ist für diesen Cloud-Build nicht aktiviert. Setze EXPO_PUBLIC_FIREBASE_APP_CHECK_ENABLED=true erst nach der App-Check-Konfiguration.',
      );
    }
    const useDebugProvider = Boolean(APP_CHECK_DEBUG_TOKEN);
    await initializeAppCheck(app, {
      provider: {
        providerOptions: {
          android: useDebugProvider
            ? { provider: 'debug', debugToken: APP_CHECK_DEBUG_TOKEN }
            : { provider: 'playIntegrity' },
          apple: useDebugProvider
            ? { provider: 'debug', debugToken: APP_CHECK_DEBUG_TOKEN }
            : { provider: 'appAttestWithDeviceCheckFallback' },
        },
      },
      isTokenAutoRefreshEnabled: true,
    });
  })();

  return nativeFirebasePreparation;
}

/** Lazily initialized Auth instance (emulator-connected in dev). */
export function getFirebaseAuth(): Auth {
  if (!auth) {
    const instance = getAuth(getApp());
    // Publish the singleton before native configuration. Several providers can
    // mount in the same React commit; without this assignment a second caller
    // can try to configure the already-initialized native instance.
    auth = instance;
    if (USE_EMULATORS) {
      connectLocalEmulator('auth', () =>
        connectAuthEmulator(instance, `http://${emulatorHost()}:${AUTH_EMULATOR_PORT}`, {
          disableWarnings: true,
        }),
      );
    }
  }
  return auth;
}

/** Lazily initialized Firestore instance (emulator-connected in dev). */
export function getFirebaseDb(): Firestore {
  if (!db) {
    const instance = getFirestore(getApp());
    db = instance;
    // Persistent disk cache is native Firestore's default. Local query indexes
    // keep bounded cached queries fast after longer offline periods.
    const cacheIndexManager = getPersistentCacheIndexManager(instance);
    if (cacheIndexManager) {
      void enablePersistentCacheIndexAutoCreation(cacheIndexManager).catch(() => {});
    }
  }
  return db;
}

/** Lazily initialized Realtime Database instance for ephemeral live journey state. */
export function getFirebaseRealtimeDb(): Database {
  if (!realtimeDb) {
    const instance = getDatabase(getApp());
    realtimeDb = instance;
    if (USE_EMULATORS) {
      connectLocalEmulator('database', () =>
        connectDatabaseEmulator(instance, emulatorHost(), DATABASE_EMULATOR_PORT),
      );
    }
  }
  return realtimeDb;
}

/** Lazily initialized callable/scheduled Functions client. */
export function getFirebaseFunctions(): Functions {
  if (!functions) {
    const instance = getFunctions(getApp());
    functions = instance;
    if (USE_EMULATORS) {
      connectLocalEmulator('functions', () =>
        connectFunctionsEmulator(instance, emulatorHost(), FUNCTIONS_EMULATOR_PORT),
      );
    }
  }
  return functions;
}

/** Lazily initialized Storage instance for user-controlled profile media. */
export function getFirebaseStorage(): FirebaseStorage {
  if (!storage) {
    const instance = getStorage(getApp());
    storage = instance;
    if (USE_EMULATORS) {
      connectLocalEmulator('storage', () =>
        connectStorageEmulator(instance, emulatorHost(), STORAGE_EMULATOR_PORT),
      );
    }
  }
  return storage;
}
