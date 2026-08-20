import Constants from 'expo-constants';
import { Platform, UIManager } from 'react-native';
import { PROVIDER_DEFAULT, PROVIDER_GOOGLE } from 'react-native-maps';

/**
 * Which native map renderer every MapView in the app uses.
 *
 * Google on BOTH platforms, because POI tapping (`onPoiClick`) — the core
 * "tap a place → create an activity there" flow — only exists in the Google
 * provider (react-native-maps implements it only in AirGoogleMaps).
 *
 * - Android: always Google (the Android backend IS Google Maps).
 * - iOS dev/production build with the native Google renderer: Google.
 * - iOS in Expo Go: Apple Maps — Expo Go ships no Google Maps SDK on iOS and
 *   would crash otherwise. POI labels are not tappable there.
 *
 * This lives in one file because a SECOND MapView now exists (the composer's
 * place preview). Two independent provider decisions could drift into an app
 * that renders Google on one surface and Apple on the other, which would show
 * up as two different-looking maps rather than as an obvious error.
 */
const IS_EXPO_GO = Constants.appOwnership === 'expo';

// `ios.config.googleMapsApiKey` is deliberately not exposed to JS at runtime, so
// checking Expo config would always select Apple Maps. Ask the native layer
// instead. This also keeps older preview builds safe: without AIRGoogleMap they
// cleanly retain the Apple Maps fallback.
export const IOS_HAS_GOOGLE_RENDERER =
  Platform.OS === 'ios' && !IS_EXPO_GO && UIManager.hasViewManagerConfig('AIRGoogleMap');

export const MAP_PROVIDER =
  Platform.OS === 'android' || IOS_HAS_GOOGLE_RENDERER ? PROVIDER_GOOGLE : PROVIDER_DEFAULT;

/** Android renders a cheap static bitmap map in lite mode — exactly what a
 * non-interactive preview wants. iOS has no equivalent.
 *
 * Caveat found August 2026 and NOT yet solved: the composer's place preview
 * ignores `customMapStyle` entirely, so it renders Google's stock light map
 * even while the main map is in the night palette. Removing lite mode did not
 * fix it, so lite mode is not the cause and the cheap path is kept. */
export const SUPPORTS_LITE_MODE = Platform.OS === 'android';
