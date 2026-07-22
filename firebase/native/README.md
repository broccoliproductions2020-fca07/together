# Native Firebase configuration

React Native Firebase needs one platform identity file per native app. Download both from
Firebase Console → Project settings → Your apps, then place them here **without renaming**:

- `google-services.json` for Android (`com.ossabossa.together`)
- `GoogleService-Info.plist` for iOS (`com.ossabossa.together`)

They are ignored by Git. `app.config.js` enables the native Firebase config plugins only when
both files exist, so mock-only builds remain offline and do not need Firebase configuration.

For a cloud release also set `EXPO_PUBLIC_FIREBASE_APP_CHECK_ENABLED=true` and configure App
Attest with DeviceCheck fallback on iOS plus Play Integrity on Android in Firebase App Check.
Enable the **App Attest** capability for the iOS App ID in the Apple Developer portal; the required
production entitlement is already declared in `app.json`. Internal/dev builds may instead use a
registered App Check debug token through `EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN` — never put
that token in a production release environment.
Do not enforce App Check in Firebase Console until a real native build has been verified.
