const fs = require('node:fs');
const path = require('node:path');

const APP_VARIANTS = {
  development: { label: 'Dev', suffix: 'dev', firebaseEnv: 'dev' },
  staging: { label: 'Staging', suffix: 'staging', firebaseEnv: 'staging' },
  production: { label: null, suffix: null, firebaseEnv: 'prod' },
};

module.exports = ({ config }) => {
  const isLocalDevServer = process.env.EXPO_LOCAL_DEV === '1';
  const isEasBuildWorker = process.env.EAS_BUILD === '1' || process.env.EAS_BUILD === 'true';
  const isCi = process.env.CI === 'true';
  const configuredVariant = process.env.APP_VARIANT?.trim();
  // A local config/prebuild must never silently receive the production native
  // identity. EAS profiles set APP_VARIANT explicitly; an incomplete remote
  // profile is rejected instead of guessing.
  const variantName = configuredVariant || (isEasBuildWorker ? undefined : 'development');
  if (!variantName) {
    throw new Error(
      'EAS-Build ohne APP_VARIANT. Das verwendete EAS-Profil muss sie explizit setzen.',
    );
  }
  const variant = APP_VARIANTS[variantName];
  if (!variant) {
    throw new Error(
      `Unbekannte APP_VARIANT "${variantName}". Erlaubt sind: ${Object.keys(APP_VARIANTS).join(', ')}.`,
    );
  }
  const firebaseEmulators = process.env.EXPO_PUBLIC_FIREBASE_EMULATORS?.trim();
  if (firebaseEmulators !== 'true' && firebaseEmulators !== 'false') {
    if (isEasBuildWorker || !isCi) {
      throw new Error(
        'EXPO_PUBLIC_FIREBASE_EMULATORS muss explizit "true" (lokale Entwicklung) oder "false" (Cloud-Build) sein.',
      );
    }
  }
  // EAS evaluates app.config.js locally before it uploads a cloud build. At
  // that point EAS_BUILD is not set yet, but the selected staging/production
  // profile has supplied its explicit variant and cloud Firebase setting.
  // Only local development runs must remain emulator-only.
  if (!isEasBuildWorker && !isCi && variantName === 'development' && firebaseEmulators !== 'true') {
    throw new Error('Lokale Builds dürfen nur mit EXPO_PUBLIC_FIREBASE_EMULATORS=true starten.');
  }
  const isCloudRelease = firebaseEmulators === 'false';
  const nonBlankEnv = (name) => process.env[name]?.trim() || undefined;
  const androidKey = nonBlankEnv('GOOGLE_MAPS_API_KEY_ANDROID');
  const iosKey = nonBlankEnv('GOOGLE_MAPS_API_KEY_IOS');
  const reactNativeMapsPlugin = [
    'react-native-maps',
    {
      ...(androidKey ? { androidGoogleMapsApiKey: androidKey } : {}),
      ...(iosKey ? { iosGoogleMapsApiKey: iosKey } : {}),
    },
  ];
  const googleWebClientId = nonBlankEnv('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID');
  const googleSignInEnabled = process.env.EXPO_PUBLIC_GOOGLE_SIGN_IN_ENABLED === 'true';
  const androidGoogleServicesFile =
    nonBlankEnv('GOOGLE_SERVICES_JSON') ??
    `./firebase/native/${variant.firebaseEnv}/google-services.json`;
  const iosGoogleServicesFile =
    nonBlankEnv('GOOGLE_SERVICE_INFO_PLIST') ??
    `./firebase/native/${variant.firebaseEnv}/GoogleService-Info.plist`;
  const fileExists = (filePath) =>
    fs.existsSync(path.isAbsolute(filePath) ? filePath : path.join(__dirname, filePath));

  // EAS secret-file variables exist only inside the remote worker. EAS first
  // evaluates this config on the developer machine, with an explicit cloud
  // profile but without those files; defer that check until the worker. Local
  // development still fails early and names missing native files.
  const isCloudProfilePreflight =
    !isEasBuildWorker && variantName !== 'development' && firebaseEmulators === 'false';
  if (
    !isCloudProfilePreflight &&
    (!fileExists(androidGoogleServicesFile) || !fileExists(iosGoogleServicesFile))
  ) {
    throw new Error(
      `Firebase-Konfiguration fehlt für "${variantName}". Erwartet werden:\n` +
        `  ${androidGoogleServicesFile}\n  ${iosGoogleServicesFile}`,
    );
  }
  if (
    isEasBuildWorker &&
    isCloudRelease &&
    (!androidKey || !iosKey || (googleSignInEnabled && !googleWebClientId))
  ) {
    throw new Error(
      'Cloud-Build benötigt GOOGLE_MAPS_API_KEY_ANDROID und GOOGLE_MAPS_API_KEY_IOS; bei Google-Login außerdem EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID.',
    );
  }

  const suffix = variant.suffix ? `.${variant.suffix}` : '';
  return {
    ...config,
    name: variant.label ? `${config.name} ${variant.label}` : config.name,
    scheme: variant.suffix ? `${config.scheme}-${variant.suffix}` : config.scheme,
    ...(isLocalDevServer ? { runtimeVersion: undefined } : {}),
    plugins: [
      ...(config.plugins ?? []),
      '@react-native-firebase/app',
      '@react-native-firebase/app-check',
      '@react-native-firebase/auth',
      '@react-native-firebase/crashlytics',
      '@react-native-google-signin/google-signin',
      'expo-apple-authentication',
      reactNativeMapsPlugin,
      ['expo-build-properties', { ios: { useFrameworks: 'static' } }],
      './plugins/withStaticFrameworkFixes',
    ],
    android: {
      ...config.android,
      package: `${config.android.package}${suffix}`,
      ...(androidKey
        ? {
            config: {
              ...config.android?.config,
              googleMaps: { ...config.android?.config?.googleMaps, apiKey: androidKey },
            },
          }
        : {}),
      googleServicesFile: androidGoogleServicesFile,
    },
    ios: {
      ...config.ios,
      usesAppleSignIn: true,
      bundleIdentifier: `${config.ios.bundleIdentifier}${suffix}`,
      ...(iosKey ? { config: { ...config.ios?.config, googleMapsApiKey: iosKey } } : {}),
      googleServicesFile: iosGoogleServicesFile,
    },
  };
};
