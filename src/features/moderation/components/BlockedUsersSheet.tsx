import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { useModeration } from '../ModerationProvider';
import type { BlockedProfile } from '../services/moderationService.types';

const ACCENT = '#6E8BF7';

export interface BlockedUsersSheetProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * Privacy-settings surface for the block list: shows who you blocked (resolved
 * via one-off profile reads) and lets you lift a block after confirmation.
 * Blocking itself happens in context (SafetyActionsSheet), never here.
 */
export function BlockedUsersSheet({ visible, onClose }: BlockedUsersSheetProps) {
  const { blockedUids, resolveBlockedProfiles, unblockUser } = useModeration();
  const [profiles, setProfiles] = useState<BlockedProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyUid, setBusyUid] = useState<string | null>(null);

  const blockedKey = blockedUids.join(',');
  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    resolveBlockedProfiles()
      .then(setProfiles)
      .catch(() => setProfiles([]))
      .finally(() => setLoading(false));
    // blockedKey re-resolves after an unblock shrank the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, blockedKey]);

  function confirmUnblock(profile: BlockedProfile) {
    Alert.alert(
      'Blockierung aufheben?',
      `${profile.displayName} kann dich danach wieder sehen und dir Anfragen senden.`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Aufheben',
          onPress: () => {
            setBusyUid(profile.uid);
            unblockUser(profile.uid)
              .catch((error) => {
                Alert.alert(
                  'Nicht möglich',
                  error instanceof Error ? error.message : 'Bitte versuche es erneut.',
                );
              })
              .finally(() => setBusyUid(null));
          },
        },
      ],
    );
  }

  return (
    <Modal
      transparent
      animationType="slide"
      visible={visible}
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View className="flex-1 justify-end bg-black/45">
        <View className="max-h-[80%] rounded-t-[32px] border border-white/10 bg-[#0E1116] px-5 pb-8 pt-3">
          <View className="mb-4 h-1.5 w-12 self-center rounded-full bg-white/20" />
          <View className="flex-row items-center justify-between">
            <View className="w-11" />
            <Text className="text-2xl font-extrabold text-white">Blockierte Personen</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Blockierte Personen schließen"
              className="h-11 w-11 items-center justify-center rounded-full bg-white/10"
              onPress={onClose}
            >
              <Ionicons name="close" size={21} color="#F4F5F7" />
            </Pressable>
          </View>

          <ScrollView className="mt-4" contentContainerStyle={{ gap: 10, paddingBottom: 8 }}>
            {blockedUids.length === 0 ? (
              <View className="items-center gap-3 rounded-3xl border border-white/10 bg-white/[0.04] px-6 py-10">
                <View className="h-14 w-14 items-center justify-center rounded-full bg-white/8">
                  <Ionicons name="shield-checkmark-outline" size={26} color="#41C08D" />
                </View>
                <Text className="text-base font-bold text-white">Niemand blockiert</Text>
                <Text className="text-center text-sm leading-5 text-white/50">
                  Blockieren kannst du Personen direkt in Chats oder Activities — sie
                  sehen dich danach nirgendwo mehr.
                </Text>
              </View>
            ) : loading && profiles.length === 0 ? (
              <Text className="rounded-2xl bg-white/[0.05] px-4 py-4 text-sm text-white/55">
                Lade Liste…
              </Text>
            ) : (
              <View className="divide-y divide-white/8 rounded-3xl border border-white/10 bg-white/[0.04] px-2">
                {profiles.map((profile) => (
                  <View key={profile.uid} className="flex-row items-center gap-3 px-2 py-3">
                    <View
                      className="h-11 w-11 items-center justify-center overflow-hidden rounded-full"
                      style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
                    >
                      {profile.avatarUrl ? (
                        <Image source={{ uri: profile.avatarUrl }} className="h-full w-full" />
                      ) : (
                        <Text className="text-sm font-bold text-white/70">{profile.initials}</Text>
                      )}
                    </View>
                    <View className="flex-1">
                      <Text className="text-base font-semibold text-white" numberOfLines={1}>
                        {profile.displayName}
                      </Text>
                      {profile.username ? (
                        <Text className="text-xs text-white/45">@{profile.username}</Text>
                      ) : null}
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Blockierung von ${profile.displayName} aufheben`}
                      disabled={busyUid === profile.uid}
                      onPress={() => confirmUnblock(profile)}
                      className="rounded-full border px-3.5 py-2 active:opacity-75"
                      style={{
                        borderColor: `${ACCENT}66`,
                        backgroundColor: `${ACCENT}14`,
                        opacity: busyUid === profile.uid ? 0.5 : 1,
                      }}
                    >
                      <Text className="text-xs font-bold" style={{ color: ACCENT }}>
                        Aufheben
                      </Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
