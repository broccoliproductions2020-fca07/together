import * as Location from 'expo-location';
import { Alert, Linking } from 'react-native';

/**
 * One shared foreground-permission request so every surface treats a denial
 * the same way. A denied permission must never be swallowed silently — the
 * user believes a location feature works while it quietly does nothing.
 */
export async function requestForegroundLocationPermission(): Promise<boolean> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    return permission.status === Location.PermissionStatus.GRANTED;
  } catch {
    return false;
  }
}

export function openLocationSettings() {
  Linking.openSettings().catch(() => {});
}

/** Blocking variant for explicit user actions (e.g. "Aktuellen Standort verwenden"). */
export function showLocationPermissionAlert() {
  Alert.alert(
    'Standortzugriff benötigt',
    'Together hat keinen Zugriff auf deinen Standort. Du kannst ihn in den Systemeinstellungen erlauben.',
    [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Einstellungen öffnen', onPress: openLocationSettings },
    ],
  );
}
