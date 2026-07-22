import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useModeration } from '../ModerationProvider';
import type { ReportReason } from '../services/moderationService.types';

const REASONS: { value: ReportReason; label: string }[] = [
  { value: 'harassment', label: 'Belästigung' },
  { value: 'spam', label: 'Spam oder Werbung' },
  { value: 'unsafe', label: 'Unsicheres Verhalten' },
  { value: 'inappropriate', label: 'Unangemessene Inhalte' },
  { value: 'other', label: 'Anderer Grund' },
];

export function SafetyActionsSheet({
  visible,
  targetUid,
  targetLabel,
  onClose,
  onBlocked,
}: {
  visible: boolean;
  targetUid: string;
  targetLabel: string;
  onClose: () => void;
  onBlocked?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { blockUser, reportUser } = useModeration();
  const [reporting, setReporting] = useState(false);
  const [busy, setBusy] = useState(false);

  async function report(reason: ReportReason) {
    setBusy(true);
    try {
      await reportUser(targetUid, reason);
      setReporting(false);
      Alert.alert(
        'Danke für deinen Hinweis',
        'Wir prüfen den Vorgang und schützen dich vor weiteren Kontakten.',
      );
      onClose();
    } catch {
      Alert.alert('Hinweis nicht gesendet', 'Bitte versuche es gleich noch einmal.');
    } finally {
      setBusy(false);
    }
  }

  async function block() {
    setBusy(true);
    try {
      await blockUser(targetUid);
      onBlocked?.();
      onClose();
    } catch {
      Alert.alert('Blockieren nicht möglich', 'Bitte versuche es gleich noch einmal.');
    } finally {
      setBusy(false);
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
      <Pressable className="flex-1 justify-end bg-black/45" onPress={onClose}>
        <Pressable
          className="rounded-t-[30px] border border-border bg-card px-5 pt-3"
          style={{ paddingBottom: Math.max(insets.bottom, 18) + 10 }}
          onPress={(event) => event.stopPropagation()}
        >
          <View className="mb-5 h-1.5 w-12 self-center rounded-full bg-border" />
          <Text className="text-xl font-extrabold text-foreground">Sicherheit</Text>
          <Text className="mt-1 text-sm text-muted-foreground">
            Du entscheidest jederzeit, mit wem du Kontakt hältst.
          </Text>

          {!reporting ? (
            <View className="mt-6 gap-2">
              <Pressable
                disabled={busy}
                className="min-h-13 flex-row items-center gap-3 rounded-2xl bg-secondary px-4 active:opacity-70"
                onPress={() => setReporting(true)}
              >
                <Ionicons name="flag-outline" size={20} color="#6E8BF7" />
                <View className="flex-1">
                  <Text className="text-sm font-bold text-foreground">{targetLabel} melden</Text>
                  <Text className="mt-0.5 text-xs text-muted-foreground">
                    Wir nehmen jeden Hinweis ernst.
                  </Text>
                </View>
              </Pressable>
              <Pressable
                disabled={busy}
                className="min-h-13 flex-row items-center gap-3 rounded-2xl bg-red-500/10 px-4 active:opacity-70"
                onPress={() => void block()}
              >
                <Ionicons name="ban-outline" size={20} color="#F28B8B" />
                <View className="flex-1">
                  <Text className="text-sm font-bold text-red-400">{targetLabel} blockieren</Text>
                  <Text className="mt-0.5 text-xs text-red-300/70">
                    Kein weiterer Kontakt und keine Vorschläge.
                  </Text>
                </View>
              </Pressable>
              <Pressable className="mt-2 min-h-11 items-center justify-center" onPress={onClose}>
                <Text className="text-sm font-bold text-muted-foreground">Abbrechen</Text>
              </Pressable>
            </View>
          ) : (
            <View className="mt-6 gap-2">
              <Text className="mb-2 text-sm font-bold text-foreground">Was ist passiert?</Text>
              {REASONS.map((reason) => (
                <Pressable
                  key={reason.value}
                  disabled={busy}
                  className="min-h-12 justify-center rounded-2xl bg-secondary px-4 active:opacity-70"
                  onPress={() => void report(reason.value)}
                >
                  <Text className="text-sm font-semibold text-foreground">{reason.label}</Text>
                </Pressable>
              ))}
              <Pressable
                className="mt-2 min-h-11 items-center justify-center"
                onPress={() => setReporting(false)}
              >
                <Text className="text-sm font-bold text-muted-foreground">Zurück</Text>
              </Pressable>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
