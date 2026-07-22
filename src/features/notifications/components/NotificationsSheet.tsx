import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/features/auth';
import {
  isCompanionConfirmationActive,
  isCompanionWatchingAlert,
  useSafety,
} from '@/features/safety';
import { TogetherLoader } from '@/shared/components';

import { useNotifications } from '../NotificationsProvider';

function relativeTime(timestamp: number) {
  const minutes = Math.max(1, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 60) return `vor ${minutes} Min.`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  return `vor ${Math.floor(hours / 24)} Tg.`;
}

export function NotificationsSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { notifications, isLoading, unreadCount, markRead, markAllRead, setListActive } =
    useNotifications();

  // Attach the notifications listener only while this sheet is visible.
  useEffect(() => {
    setListActive(visible);
    return () => setListActive(false);
  }, [visible, setListActive]);
  const { user } = useAuth();
  const { friendSessions, confirmReachable, confirmAlert } = useSafety();
  const [confirmingOwnerUid, setConfirmingOwnerUid] = useState<string | null>(null);
  const myUid = user?.id ?? 'u_you';

  async function confirmSafety(ownerUid: string, notificationId: string, alertAt?: number) {
    if (confirmingOwnerUid) return;
    setConfirmingOwnerUid(ownerUid);
    try {
      if (alertAt) await confirmAlert(ownerUid, alertAt);
      else await confirmReachable(ownerUid);
      markRead(notificationId);
    } catch (error) {
      Alert.alert(
        'Bestätigung nicht möglich',
        error instanceof Error ? error.message : 'Bitte versuche es erneut.',
      );
    } finally {
      setConfirmingOwnerUid(null);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable className="flex-1 justify-end bg-black/50" onPress={onClose}>
        <Pressable
          className="max-h-[84%] rounded-t-[34px] border border-border bg-card px-5 pt-3"
          style={{ paddingBottom: Math.max(insets.bottom, 16) + 8 }}
          onPress={(event) => event.stopPropagation()}
        >
          <View className="mb-5 h-1 w-10 self-center rounded-full bg-border" />
          <View className="mb-4 flex-row items-center justify-between gap-3">
            <View className="flex-1">
              <Text className="text-[22px] font-extrabold tracking-[-0.4px] text-foreground">
                Benachrichtigungen
              </Text>
              <Text className="mt-1 text-sm text-muted-foreground">
                {unreadCount ? `${unreadCount} ungelesen` : 'Alles auf dem neuesten Stand'}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Benachrichtigungen schließen"
              className="h-10 w-10 items-center justify-center rounded-full bg-secondary active:opacity-70"
              onPress={onClose}
            >
              <Ionicons name="close" size={20} color="#8F8B84" />
            </Pressable>
          </View>

          {unreadCount ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Alle Benachrichtigungen als gelesen markieren"
              className="mb-3 self-start rounded-full bg-primary/10 px-3 py-2 active:opacity-70"
              onPress={markAllRead}
            >
              <Text className="text-xs font-bold text-primary">Alle als gelesen markieren</Text>
            </Pressable>
          ) : null}

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 8 }}
          >
            {isLoading ? (
              <View className="items-center px-8 py-14">
                <TogetherLoader size={46} tile />
                <Text className="mt-5 text-center text-base font-bold text-foreground">
                  Neuigkeiten werden geladen
                </Text>
                <Text className="mt-1.5 text-center text-sm text-muted-foreground">
                  Einen kurzen Moment …
                </Text>
              </View>
            ) : notifications.length === 0 ? (
              <View className="items-center px-8 py-14">
                <View className="mb-4 h-16 w-16 items-center justify-center rounded-3xl bg-primary/10">
                  <Ionicons name="notifications-outline" size={28} color="#6E8BF7" />
                </View>
                <Text className="text-center text-base font-bold text-foreground">
                  Noch nichts Neues
                </Text>
                <Text className="mt-2 text-center text-sm leading-5 text-muted-foreground">
                  Neue Teilnehmer, Nachrichten und wichtige Activity-Updates erscheinen hier.
                </Text>
              </View>
            ) : (
              notifications.map((notification) => {
                const safetySession = notification.safetyOwnerUid
                  ? friendSessions.find((session) => session.uid === notification.safetyOwnerUid)
                  : undefined;
                const safetyAlertNotification =
                  notification.kind === 'safety_unwell' || notification.kind === 'safety_emergency';
                const notificationColor =
                  notification.kind === 'safety_emergency'
                    ? '#FF5A5A'
                    : notification.kind === 'safety_unwell'
                      ? '#E0A23E'
                      : notification.kind === 'safety_unavailable'
                        ? '#E0A23E'
                      : notification.kind === 'safety_resolved'
                        ? '#41C08D'
                        : '#6E8BF7';
                const notificationIcon =
                  notification.kind === 'chat_message'
                    ? 'chatbubble-outline'
                    : notification.kind === 'journey_reminder'
                      ? 'navigate-outline'
                      : notification.kind === 'safety_emergency'
                        ? 'warning-outline'
                        : notification.kind === 'safety_unwell'
                          ? 'alert-circle-outline'
                          : notification.kind === 'safety_request' ||
                            notification.kind === 'safety_confirmed' ||
                              notification.kind === 'safety_unavailable' ||
                              notification.kind === 'safety_alert_seen' ||
                              notification.kind === 'safety_resolved'
                            ? 'shield-checkmark-outline'
                            : 'sparkles-outline';
                const safetyConfirmed = isCompanionConfirmationActive(
                  safetySession?.companions?.[myUid],
                  Date.now(),
                );
                const currentSafetyAlert = Boolean(
                  safetyAlertNotification &&
                  notification.safetyAlertAt &&
                  safetySession?.alert?.at === notification.safetyAlertAt,
                );
                const safetyAlertAcknowledged = currentSafetyAlert
                  ? isCompanionWatchingAlert(
                      safetySession?.companions?.[myUid],
                      safetySession?.alert,
                      Date.now(),
                    )
                  : false;
                return (
                  <Pressable
                    key={notification.id}
                    className={`mb-2 flex-row gap-3 rounded-[20px] border border-border px-3 py-3.5 ${
                      notification.readAt ? 'bg-background/40' : 'bg-primary/5'
                    }`}
                    onPress={() => markRead(notification.id)}
                  >
                    <View
                      className="mt-0.5 h-10 w-10 items-center justify-center rounded-2xl"
                      style={{ backgroundColor: `${notificationColor}1F` }}
                    >
                      <Ionicons name={notificationIcon} size={19} color={notificationColor} />
                    </View>
                    <View className="flex-1">
                      <View className="flex-row items-start justify-between gap-2">
                        <Text className="flex-1 text-sm font-bold text-foreground">
                          {notification.title}
                        </Text>
                        <Text className="text-[11px] text-muted-foreground">
                          {relativeTime(notification.createdAt)}
                        </Text>
                      </View>
                      <Text className="mt-1 text-sm leading-5 text-muted-foreground">
                        {notification.body}
                      </Text>
                      {notification.kind === 'safety_request' &&
                      notification.safetyOwnerUid &&
                      safetySession ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Ich bin erreichbar"
                          accessibilityState={{ disabled: safetyConfirmed }}
                          disabled={safetyConfirmed || confirmingOwnerUid !== null}
                          className="mt-3 self-start flex-row items-center gap-1.5 rounded-full bg-primary/12 px-3 py-2 active:opacity-75"
                          onPress={(event) => {
                            event.stopPropagation();
                            void confirmSafety(notification.safetyOwnerUid!, notification.id);
                          }}
                        >
                          <Ionicons
                            name={safetyConfirmed ? 'checkmark-circle' : 'hand-left-outline'}
                            size={14}
                            color={safetyConfirmed ? '#41C08D' : '#6E8BF7'}
                          />
                          <Text
                            className="text-xs font-extrabold"
                            style={{ color: safetyConfirmed ? '#41C08D' : '#6E8BF7' }}
                          >
                            {confirmingOwnerUid === notification.safetyOwnerUid
                              ? 'Wird bestätigt …'
                              : safetyConfirmed
                                ? 'Erreichbarkeit bestätigt'
                                : 'Ich bin erreichbar'}
                          </Text>
                        </Pressable>
                      ) : null}
                      {currentSafetyAlert &&
                      notification.safetyOwnerUid &&
                      notification.safetyAlertAt ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Ich habe dich im Blick"
                          accessibilityState={{ disabled: safetyAlertAcknowledged }}
                          disabled={safetyAlertAcknowledged || confirmingOwnerUid !== null}
                          className="mt-3 self-start flex-row items-center gap-1.5 rounded-full px-3 py-2 active:opacity-75"
                          style={{
                            backgroundColor: safetyAlertAcknowledged
                              ? 'rgba(65,192,141,0.12)'
                              : `${notificationColor}1F`,
                          }}
                          onPress={(event) => {
                            event.stopPropagation();
                            void confirmSafety(
                              notification.safetyOwnerUid!,
                              notification.id,
                              notification.safetyAlertAt,
                            );
                          }}
                        >
                          <Ionicons
                            name={safetyAlertAcknowledged ? 'checkmark-circle' : 'eye-outline'}
                            size={14}
                            color={safetyAlertAcknowledged ? '#41C08D' : notificationColor}
                          />
                          <Text
                            className="text-xs font-extrabold"
                            style={{
                              color: safetyAlertAcknowledged ? '#41C08D' : notificationColor,
                            }}
                          >
                            {confirmingOwnerUid === notification.safetyOwnerUid
                              ? 'Wird bestätigt …'
                              : safetyAlertAcknowledged
                                ? 'Du schaust gerade zu'
                                : 'Ich habe dich im Blick'}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                    {!notification.readAt ? (
                      <View className="mt-2 h-2 w-2 rounded-full bg-primary" />
                    ) : null}
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
