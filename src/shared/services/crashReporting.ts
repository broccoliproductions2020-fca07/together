/**
 * Crash reporting (Firebase Crashlytics).
 *
 * The native module is loaded **lazily and defensively**, exactly like
 * `shared/utils/haptics.ts` and the image manipulator: `@react-native-firebase/
 * crashlytics` constructs its module at *import* time and throws when the native
 * side is absent. A top-level `import` therefore took the entire app down with a
 * black screen — before any `try/catch` in this file could run, because the
 * throw happened during module evaluation, not during a call.
 *
 * That is the exact opposite of what monitoring should do, so it now degrades to
 * a no-op instead: a build without the native module simply reports nothing.
 *
 * Crash reports stay off in local development and are enabled only by the signed
 * staging/production build profiles, keeping emulator and developer errors out
 * of the operational dashboard.
 */

type CrashlyticsModule = typeof import('@react-native-firebase/crashlytics');

let cached: CrashlyticsModule | null | undefined;
let collectionEnabled = false;

function crashlytics(): CrashlyticsModule | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('@react-native-firebase/crashlytics') as CrashlyticsModule;
  } catch {
    cached = null;
  }
  return cached;
}

export async function configureCrashReporting(enabled: boolean): Promise<void> {
  if (!enabled) {
    collectionEnabled = false;
    return;
  }
  try {
    const mod = crashlytics();
    if (!mod) return;
    await mod.setCrashlyticsCollectionEnabled(mod.getCrashlytics(), true);
    collectionEnabled = true;
  } catch {
    // Monitoring must never prevent a user from opening the app.
    collectionEnabled = false;
  }
}

export function reportAppError(error: unknown, context: string): void {
  if (!collectionEnabled) return;

  const normalized = error instanceof Error ? error : new Error(String(error));
  try {
    const mod = crashlytics();
    if (!mod) return;
    mod.recordError(mod.getCrashlytics(), normalized, context);
  } catch {
    // A reporting error is intentionally ignored to avoid an error loop.
  }
}
