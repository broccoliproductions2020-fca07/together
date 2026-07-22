/**
 * Dynamic Expo config. Extends app.json and injects the Google Maps SDK keys
 * from `.env` at build/start time (NOT `EXPO_PUBLIC_` — the map SDK keys are
 * consumed natively via the config plugins, they don't ship in the JS bundle;
 * restrict them to the app signature / bundle id in the Google Cloud console).
 *
 * Without keys set, nothing changes: Android in Expo Go uses Expo's built-in
 * key; iOS falls back to Apple Maps (see MapCanvas provider logic).
 */
const fs = require('node:fs');
const path = require('node:path');

module.exports = ({ config }) => {
  const isLocalDevServer = process.env.EXPO_LOCAL_DEV === '1';
  const androidKey = process.env.GOOGLE_MAPS_API_KEY_ANDROID;
  const iosKey = process.env.GOOGLE_MAPS_API_KEY_IOS;
  const androidGoogleServicesFile = './firebase/native/google-services.json';
  const iosGoogleServicesFile = './firebase/native/GoogleService-Info.plist';
  const hasAndroidFirebaseConfig = fs.existsSync(path.join(__dirname, androidGoogleServicesFile));
  const hasIosFirebaseConfig = fs.existsSync(path.join(__dirname, iosGoogleServicesFile));

  const hasAnyNativeFirebaseConfig = hasAndroidFirebaseConfig || hasIosFirebaseConfig;
  const plugins = hasAnyNativeFirebaseConfig
    ? [
        ...(config.plugins ?? []),
        '@react-native-firebase/app',
        '@react-native-firebase/app-check',
        '@react-native-firebase/auth',
      ]
    : config.plugins;

  return {
    ...config,
    // A development client loads from Metro, not EAS Update. Omitting this
    // release-only value keeps the local manifest handshake fast and offline.
    ...(isLocalDevServer ? { runtimeVersion: undefined } : {}),
    plugins,
    android: androidKey
      ? {
          ...config.android,
          config: {
            ...config.android?.config,
            googleMaps: { ...config.android?.config?.googleMaps, apiKey: androidKey },
          },
          ...(hasAndroidFirebaseConfig ? { googleServicesFile: androidGoogleServicesFile } : {}),
        }
      : {
          ...config.android,
          ...(hasAndroidFirebaseConfig ? { googleServicesFile: androidGoogleServicesFile } : {}),
        },
    ios: iosKey
      ? {
          ...config.ios,
          config: { ...config.ios?.config, googleMapsApiKey: iosKey },
          ...(hasIosFirebaseConfig ? { googleServicesFile: iosGoogleServicesFile } : {}),
        }
      : {
          ...config.ios,
          ...(hasIosFirebaseConfig ? { googleServicesFile: iosGoogleServicesFile } : {}),
        },
  };
};
