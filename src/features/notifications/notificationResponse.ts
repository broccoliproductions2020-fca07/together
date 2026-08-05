import type * as Notifications from 'expo-notifications';

const handledByConsumer = new Map<string, Set<string>>();

export function claimNotificationResponse(
  consumer: 'map' | 'journey' | 'safety' | 'chat',
  response: Notifications.NotificationResponse,
) {
  const key = `${response.notification.request.identifier}:${response.actionIdentifier}`;
  const handled = handledByConsumer.get(consumer) ?? new Set<string>();
  if (handled.has(key)) return false;
  handled.add(key);
  if (handled.size > 100) {
    const oldest = handled.values().next().value;
    if (typeof oldest === 'string') handled.delete(oldest);
  }
  handledByConsumer.set(consumer, handled);
  return true;
}
