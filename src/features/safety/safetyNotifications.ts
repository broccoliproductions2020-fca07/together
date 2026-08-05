import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export const SAFETY_REQUEST_CATEGORY_ID = 'together.safety.request.v1';
export const SAFETY_CONFIRM_ACTION_ID = 'together.safety.confirm.v1';
export const SAFETY_ALERT_CATEGORY_ID = 'together.safety.alert.v1';
export const SAFETY_ALERT_ACK_ACTION_ID = 'together.safety.alert.ack.v1';
export const SAFETY_CHECKIN_CATEGORY_ID = 'together.safety.checkin.v1';
export const SAFETY_CHECKIN_OK_ACTION_ID = 'together.safety.checkin.ok.v1';
export const SAFETY_STATIONARY_CATEGORY_ID = 'together.safety.stationary.v1';
export const SAFETY_STATIONARY_CONTINUE_ACTION_ID = 'together.safety.stationary.continue.v1';
export const SAFETY_STATIONARY_ARRIVED_ACTION_ID = 'together.safety.stationary.arrived.v1';
export const SAFETY_EXPIRY_CATEGORY_ID = 'together.safety.expiry.v1';
export const SAFETY_EXPIRY_EXTEND_ACTION_ID = 'together.safety.expiry.extend.v1';
export const SAFETY_EXPIRY_ARRIVED_ACTION_ID = 'together.safety.expiry.arrived.v1';
export const SAFETY_COMPANION_CONFIRMATION_CATEGORY_ID =
  'together.safety.companion-confirmation.v1';
export const SAFETY_COMPANION_CONTINUE_ACTION_ID =
  'together.safety.companion-confirmation.continue.v1';
export const SAFETY_COMPANION_UNAVAILABLE_ACTION_ID =
  'together.safety.companion-confirmation.unavailable.v1';
export const SAFETY_ALERT_CHANNEL_ID = 'safety-alerts';
const SAFETY_CHECKIN_CHANNEL_ID = 'safety-check-in';
const SAFETY_REMINDER_CHANNEL_ID = 'safety-reminders';

export async function registerSafetyNotificationCategory(): Promise<void> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('safety', {
      name: 'Safety',
      description: 'Heimweg-Anfragen und Bestätigungen',
      importance: Notifications.AndroidImportance.HIGH,
    });
    await Notifications.setNotificationChannelAsync(SAFETY_ALERT_CHANNEL_ID, {
      name: 'Safety-Hinweise',
      description: 'Hinweise bei Unsicherheit und Hilferufen',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 300, 180, 300],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
    await Notifications.setNotificationChannelAsync(SAFETY_CHECKIN_CHANNEL_ID, {
      name: 'Safety-Check-ins',
      description: 'Rückfragen während eines geteilten Heimwegs',
      importance: Notifications.AndroidImportance.HIGH,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    });
    await Notifications.setNotificationChannelAsync(SAFETY_REMINDER_CHANNEL_ID, {
      name: 'Heimweg-Erinnerungen',
      description: 'Stillstand und automatisches Ende eines geteilten Heimwegs',
      importance: Notifications.AndroidImportance.HIGH,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    });
  }
  await Notifications.setNotificationCategoryAsync(SAFETY_REQUEST_CATEGORY_ID, [
    {
      identifier: SAFETY_CONFIRM_ACTION_ID,
      buttonTitle: 'Ich bin erreichbar',
      options: { opensAppToForeground: true },
    },
  ]);
  await Notifications.setNotificationCategoryAsync(SAFETY_ALERT_CATEGORY_ID, [
    {
      identifier: SAFETY_ALERT_ACK_ACTION_ID,
      buttonTitle: 'Ich habe dich im Blick',
      options: { opensAppToForeground: true },
    },
  ]);
  await Notifications.setNotificationCategoryAsync(SAFETY_CHECKIN_CATEGORY_ID, [
    {
      identifier: SAFETY_CHECKIN_OK_ACTION_ID,
      buttonTitle: 'Alles okay',
      options: { opensAppToForeground: true },
    },
  ]);
  await Notifications.setNotificationCategoryAsync(SAFETY_STATIONARY_CATEGORY_ID, [
    {
      identifier: SAFETY_STATIONARY_ARRIVED_ACTION_ID,
      buttonTitle: 'Sicher angekommen',
      options: { opensAppToForeground: true },
    },
    {
      identifier: SAFETY_STATIONARY_CONTINUE_ACTION_ID,
      buttonTitle: 'Weiter teilen',
      options: { opensAppToForeground: true },
    },
  ]);
  await Notifications.setNotificationCategoryAsync(SAFETY_EXPIRY_CATEGORY_ID, [
    {
      identifier: SAFETY_EXPIRY_EXTEND_ACTION_ID,
      buttonTitle: '1 Stunde verlängern',
      options: { opensAppToForeground: true },
    },
    {
      identifier: SAFETY_EXPIRY_ARRIVED_ACTION_ID,
      buttonTitle: 'Sicher angekommen',
      options: { opensAppToForeground: true },
    },
  ]);
  await Notifications.setNotificationCategoryAsync(SAFETY_COMPANION_CONFIRMATION_CATEGORY_ID, [
    {
      identifier: SAFETY_COMPANION_CONTINUE_ACTION_ID,
      buttonTitle: 'Weitere 30 Min.',
      options: { opensAppToForeground: true },
    },
    {
      identifier: SAFETY_COMPANION_UNAVAILABLE_ACTION_ID,
      buttonTitle: 'Nicht mehr erreichbar',
      options: { opensAppToForeground: true },
    },
  ]);
}

export async function ensureSafetyNotificationPermission(): Promise<boolean> {
  let permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted') permission = await Notifications.requestPermissionsAsync();
  return permission.status === 'granted';
}

function dateTrigger(date: number) {
  return {
    type: Notifications.SchedulableTriggerInputTypes.DATE,
    date: Math.max(Date.now() + 500, date),
    ...(Platform.OS === 'android' ? { channelId: SAFETY_REMINDER_CHANNEL_ID } : {}),
  } as const;
}

export async function scheduleSafetyCheckInNotification(dueAt: number): Promise<string | null> {
  if (!(await ensureSafetyNotificationPermission())) return null;

  return Notifications.scheduleNotificationAsync({
    content: {
      title: 'Alles okay?',
      body: 'Bestätige kurz, dass du deinen Heimweg weiter teilst.',
      data: { kind: 'safety_check_in' },
      categoryIdentifier: SAFETY_CHECKIN_CATEGORY_ID,
      sound: 'default',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: Math.max(Date.now() + 500, dueAt),
      ...(Platform.OS === 'android' ? { channelId: SAFETY_CHECKIN_CHANNEL_ID } : {}),
    },
  });
}

export async function scheduleSafetyStationaryNotification(dueAt: number): Promise<string | null> {
  const permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted') return null;
  return Notifications.scheduleNotificationAsync({
    content: {
      title: 'Bist du angekommen?',
      body: 'Du bist seit 45 Minuten am selben Ort.',
      data: { kind: 'safety_stationary' },
      categoryIdentifier: SAFETY_STATIONARY_CATEGORY_ID,
      sound: 'default',
    },
    trigger: dateTrigger(dueAt),
  });
}

export async function scheduleSafetyExpiryWarning(expiresAt: number): Promise<string | null> {
  if (!(await ensureSafetyNotificationPermission())) return null;
  return Notifications.scheduleNotificationAsync({
    content: {
      title: 'Bist du schon zuhause?',
      body: 'Dein Heimweg endet in 10 Minuten. Du kannst ihn um eine Stunde verlängern.',
      data: { kind: 'safety_expiry_warning' },
      categoryIdentifier: SAFETY_EXPIRY_CATEGORY_ID,
      sound: 'default',
    },
    trigger: dateTrigger(expiresAt - 10 * 60 * 1000),
  });
}

export async function scheduleSafetyExpiredNotification(expiresAt: number): Promise<string | null> {
  if (!(await ensureSafetyNotificationPermission())) return null;
  return Notifications.scheduleNotificationAsync({
    content: {
      title: 'Heimweg automatisch beendet',
      body: 'Deine Ankunft wurde nicht bestätigt. Es wird kein Standort mehr übertragen.',
      data: { kind: 'safety_expired' },
      sound: 'default',
    },
    trigger: dateTrigger(expiresAt),
  });
}

/** A local, companion-only nudge shortly before an active promise ends. It is
 * deliberately not a push to the owner: a quiet expiry is not an emergency. */
export async function scheduleSafetyCompanionConfirmationReminder(
  ownerUid: string,
  ownerName: string,
  dueAt: number,
): Promise<string | null> {
  const permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted') return null;
  return Notifications.scheduleNotificationAsync({
    content: {
      title: `Begleitung fÃ¼r ${ownerName}`,
      body: 'Deine BestÃ¤tigung endet in 5 Minuten.',
      data: { kind: 'safety_companion_confirmation', safetyOwnerUid: ownerUid },
      categoryIdentifier: SAFETY_COMPANION_CONFIRMATION_CATEGORY_ID,
      sound: 'default',
    },
    trigger: dateTrigger(dueAt),
  });
}

export async function cancelSafetyCheckInNotification(identifier: string | null): Promise<void> {
  if (!identifier) return;
  await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => undefined);
}

export const cancelSafetyNotification = cancelSafetyCheckInNotification;

export type SafetyOwnerNotificationAction =
  'stationary_continue' | 'stationary_arrived' | 'expiry_extend' | 'expiry_arrived';

export function safetyOwnerActionFromResponse(
  response: Notifications.NotificationResponse,
): SafetyOwnerNotificationAction | null {
  const kind = response.notification.request.content.data?.kind;
  if (
    kind === 'safety_stationary' &&
    response.actionIdentifier === SAFETY_STATIONARY_CONTINUE_ACTION_ID
  ) {
    return 'stationary_continue';
  }
  if (
    kind === 'safety_stationary' &&
    response.actionIdentifier === SAFETY_STATIONARY_ARRIVED_ACTION_ID
  ) {
    return 'stationary_arrived';
  }
  if (
    kind === 'safety_expiry_warning' &&
    response.actionIdentifier === SAFETY_EXPIRY_EXTEND_ACTION_ID
  ) {
    return 'expiry_extend';
  }
  if (
    kind === 'safety_expiry_warning' &&
    response.actionIdentifier === SAFETY_EXPIRY_ARRIVED_ACTION_ID
  ) {
    return 'expiry_arrived';
  }
  return null;
}

export type SafetyCompanionNotificationAction = 'continue' | 'unavailable';

export function safetyCompanionActionFromResponse(
  response: Notifications.NotificationResponse,
): { action: SafetyCompanionNotificationAction; ownerUid: string } | null {
  if (response.notification.request.content.data?.kind !== 'safety_companion_confirmation') {
    return null;
  }
  const ownerUid = response.notification.request.content.data?.safetyOwnerUid;
  if (typeof ownerUid !== 'string' || !ownerUid.length) return null;
  if (response.actionIdentifier === SAFETY_COMPANION_CONTINUE_ACTION_ID) {
    return { action: 'continue', ownerUid };
  }
  if (response.actionIdentifier === SAFETY_COMPANION_UNAVAILABLE_ACTION_ID) {
    return { action: 'unavailable', ownerUid };
  }
  return null;
}

export function safetyOwnerFromResponse(
  response: Notifications.NotificationResponse,
): string | null {
  if (response.actionIdentifier !== SAFETY_CONFIRM_ACTION_ID) return null;
  const ownerUid = response.notification.request.content.data?.safetyOwnerUid;
  return typeof ownerUid === 'string' && ownerUid.length > 0 ? ownerUid : null;
}

export function safetyAlertFromResponse(
  response: Notifications.NotificationResponse,
): { ownerUid: string; alertAt: number } | null {
  if (response.actionIdentifier !== SAFETY_ALERT_ACK_ACTION_ID) return null;
  const data = response.notification.request.content.data;
  const ownerUid = data?.safetyOwnerUid;
  const alertAt = data?.safetyAlertAt;
  if (
    typeof ownerUid !== 'string' ||
    !ownerUid.length ||
    typeof alertAt !== 'number' ||
    !Number.isSafeInteger(alertAt)
  ) {
    return null;
  }
  return { ownerUid, alertAt };
}

export function isSafetyCheckInResponse(response: Notifications.NotificationResponse): boolean {
  return (
    response.actionIdentifier === SAFETY_CHECKIN_OK_ACTION_ID &&
    response.notification.request.content.data?.kind === 'safety_check_in'
  );
}
