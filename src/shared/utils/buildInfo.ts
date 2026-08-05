import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { Platform, UIManager } from 'react-native';

/**
 * Internal build identity, for answering one question on a test device: "am I
 * actually running the OTA update I just published?"
 *
 * `internalVersion` (app.json → extra) is bumped by hand on every OTA push and
 * is the number a human reads out. The update id is the machine truth — two
 * OTA bundles published from the same source share a version string but never
 * an id, so the id is what actually proves which bundle is live.
 */
const INTERNAL_VERSION =
  (Constants.expoConfig?.extra?.internalVersion as string | undefined) ?? '0.0.0';

/**
 * Which native map renderer is actually live. Mirrors MAP_PROVIDER in
 * MapCanvas exactly. This matters because Apple Maps ignores `customMapStyle`
 * outright — if this reads `apple`, no map palette will ever apply, however
 * correct the style JSON is.
 */
export const MAP_RENDERER: 'google' | 'apple' =
  Platform.OS === 'android' ||
  (Platform.OS === 'ios' &&
    Constants.appOwnership !== 'expo' &&
    UIManager.hasViewManagerConfig('AIRGoogleMap'))
    ? 'google'
    : 'apple';

export interface BuildInfo {
  /** Hand-maintained internal number, e.g. "0.1.0". */
  internalVersion: string;
  /** Store version + native build, e.g. "1.0.0 (1)". */
  nativeVersion: string;
  /** Short OTA update id, or a label when no OTA bundle is running. */
  updateLabel: string;
  /** Single line for display. */
  line: string;
}

export function getBuildInfo(): BuildInfo {
  const version = Constants.expoConfig?.version ?? '?';
  const build =
    Constants.expoConfig?.ios?.buildNumber ??
    String(Constants.expoConfig?.android?.versionCode ?? '?');
  const nativeVersion = `${version} (${build})`;

  // In Expo Go / a dev client there is no OTA bundle at all, and an embedded
  // launch means the build is running its baked-in JS — both are "not an OTA",
  // which is exactly what you need to see when an update did NOT arrive.
  const updateLabel = Updates.isEmbeddedLaunch
    ? 'eingebettet'
    : (Updates.updateId?.slice(0, 8) ?? 'dev');

  return {
    internalVersion: INTERNAL_VERSION,
    nativeVersion,
    updateLabel,
    line: `v${INTERNAL_VERSION} · ${nativeVersion} · ${updateLabel} · ${MAP_RENDERER}`,
  };
}
