import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Alert, Image, Pressable, Switch, Text, View } from 'react-native';

import { ProfileEditSheet, useAuth } from '@/features/auth';
import { FriendCodeSheet, useFriends, type FriendRequestPolicy } from '@/features/friends';
import { BlockedUsersSheet, useModeration } from '@/features/moderation';
import { useNotifications } from '@/features/notifications';
import { PrivacyInfoSheet } from '@/features/settings';
import { useThemeColors, useThemePreference, type ColorSchemePreference } from '@/features/theme';
import { AppScreen, AppText, ScreenHeader } from '@/shared/components';

const ACCENT = '#6E8BF7';

const THEME_OPTIONS: {
  value: ColorSchemePreference;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { value: 'system', label: 'Auto', icon: 'phone-portrait-outline' },
  { value: 'light', label: 'Hell', icon: 'sunny-outline' },
  { value: 'dark', label: 'Dunkel', icon: 'moon-outline' },
];

const FRIEND_REQUEST_OPTIONS: {
  value: FriendRequestPolicy;
  label: string;
  description: string;
}[] = [
  { value: 'anyone', label: 'Alle', description: 'Über @Namen oder QR-Code' },
  {
    value: 'shared_activity',
    label: 'Gemeinsame Activity',
    description: 'Nur Leute aus gemeinsamen Activities',
  },
  { value: 'nobody', label: 'Niemand', description: 'Neue Anfragen blockieren' },
];

function ThemeSwitcher() {
  const { preference, setPreference } = useThemePreference();
  const colors = useThemeColors();

  return (
    <View className="flex-row rounded-[18px] bg-secondary p-1">
      {THEME_OPTIONS.map((option) => {
        const active = preference === option.value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            className={`min-h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-[14px] ${
              active ? 'bg-card shadow-sm' : ''
            } active:opacity-75`}
            onPress={() => setPreference(option.value)}
          >
            <Ionicons name={option.icon} size={15} color={active ? ACCENT : colors.mutedForeground} />
            <Text
              className={`text-xs font-bold ${active ? 'text-foreground' : 'text-muted-foreground'}`}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SettingRow({
  icon,
  iconColor = ACCENT,
  title,
  subtitle,
  onPress,
  trailing,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  trailing?: ReactNode;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress}
      className="min-h-[68px] flex-row items-center gap-3 px-4 py-3 active:bg-secondary/70"
      onPress={onPress}
    >
      <View
        className="h-10 w-10 items-center justify-center rounded-[15px]"
        style={{ backgroundColor: `${iconColor}18` }}
      >
        <Ionicons name={icon} size={19} color={iconColor} />
      </View>
      <View className="flex-1">
        <Text className="text-[15px] font-bold tracking-[-0.15px] text-foreground">{title}</Text>
        {subtitle ? (
          <Text className="mt-0.5 text-xs leading-4 text-muted-foreground">{subtitle}</Text>
        ) : null}
      </View>
      {trailing ??
        (onPress ? (
          <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
        ) : null)}
    </Pressable>
  );
}

function SectionCard({ children }: { children: ReactNode }) {
  return (
    <View className="overflow-hidden rounded-[26px] border border-border bg-card shadow-sm">
      {children}
    </View>
  );
}

function Divider() {
  return <View className="ml-[68px] h-px bg-border" />;
}

export default function ProfileScreen() {
  const { user, signOut, updateProfile, sendEmailVerification, deleteAccount } = useAuth();
  const [editVisible, setEditVisible] = useState(false);
  const [verificationBusy, setVerificationBusy] = useState(false);
  const [privacyBusy, setPrivacyBusy] = useState(false);
  const [blockedVisible, setBlockedVisible] = useState(false);
  const [privacyInfoVisible, setPrivacyInfoVisible] = useState(false);
  const [requestPolicyOpen, setRequestPolicyOpen] = useState(false);
  const [codeVisible, setCodeVisible] = useState(false);
  const [journeyBusy, setJourneyBusy] = useState(false);
  const colors = useThemeColors();
  const { pushEnabled, enablePush, disablePush } = useNotifications();
  const {
    friendRequestPolicy,
    setFriendRequestPolicy,
    journeyRemindersEnabled,
    setJourneyRemindersEnabled,
  } = useFriends();
  const { blockedUids } = useModeration();

  async function handleVerification() {
    setVerificationBusy(true);
    try {
      await sendEmailVerification();
      Alert.alert('Link gesendet', 'Prüfe dein Postfach und bestätige deine E-Mail-Adresse.');
    } catch (error) {
      Alert.alert(
        'Nicht möglich',
        error instanceof Error ? error.message : 'Bitte erneut versuchen.',
      );
    } finally {
      setVerificationBusy(false);
    }
  }

  async function handlePushToggle() {
    if (pushEnabled) {
      await disablePush();
      return;
    }
    const enabled = await enablePush();
    if (!enabled) {
      Alert.alert(
        'Benachrichtigungen nicht aktiviert',
        'Erlaube Together Benachrichtigungen in den Systemeinstellungen deines Geräts.',
      );
    }
  }

  async function handleFriendRequestPolicy(policy: FriendRequestPolicy) {
    if (privacyBusy || policy === friendRequestPolicy) return;
    setPrivacyBusy(true);
    try {
      await setFriendRequestPolicy(policy);
      setRequestPolicyOpen(false);
    } catch (error) {
      Alert.alert(
        'Einstellung nicht gespeichert',
        error instanceof Error ? error.message : 'Bitte versuche es erneut.',
      );
    } finally {
      setPrivacyBusy(false);
    }
  }

  async function handleJourneyRemindersToggle() {
    // Server round-trip — guard against double taps while it is in flight.
    if (journeyBusy) return;
    setJourneyBusy(true);
    try {
      await setJourneyRemindersEnabled(!journeyRemindersEnabled);
    } catch (error) {
      Alert.alert(
        'Einstellung nicht gespeichert',
        error instanceof Error ? error.message : 'Bitte versuche es erneut.',
      );
    } finally {
      setJourneyBusy(false);
    }
  }

  function handleDeleteAccount() {
    Alert.alert(
      'Account endgültig löschen?',
      'Deine Freundschaften, Gruppen, Activities, Chats und Profildaten werden dauerhaft entfernt.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Account löschen',
          style: 'destructive',
          onPress: () => {
            void deleteAccount().catch((error) =>
              Alert.alert(
                'Löschen fehlgeschlagen',
                error instanceof Error ? error.message : 'Bitte erneut versuchen.',
              ),
            );
          },
        },
      ],
    );
  }

  const displayName = user?.displayName || user?.username || 'Du';
  const initials = displayName
    .split(/\s+/)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <AppScreen scroll contentClassName="px-5 pb-8 pt-3">
      <View className="flex-1 gap-7">
        <ScreenHeader
          title="Profil"
          subtitle="Dein Konto und deine Einstellungen"
          onBack={() => router.back()}
        />

        {user ? (
          <View className="overflow-hidden rounded-[30px] bg-[#101923] p-5 shadow-lg">
            <View
              pointerEvents="none"
              className="absolute -right-8 -top-10 h-40 w-40 rounded-full"
              style={{ backgroundColor: `${ACCENT}25` }}
            />
            <View
              pointerEvents="none"
              className="absolute -bottom-16 left-12 h-32 w-32 rounded-full"
              style={{ backgroundColor: '#41C08D18' }}
            />

            <View className="flex-row items-center gap-4">
              <View className="h-[72px] w-[72px] items-center justify-center overflow-hidden rounded-[26px] border border-white/15 bg-white/10">
                {user.avatarUrl ? (
                  <Image source={{ uri: user.avatarUrl }} className="h-full w-full" />
                ) : (
                  <Text className="text-xl font-extrabold text-white">{initials || 'DU'}</Text>
                )}
              </View>
              <View className="flex-1">
                <Text className="text-xl font-extrabold tracking-[-0.4px] text-white">
                  {displayName}
                </Text>
                {user.username ? (
                  <Text className="mt-0.5 text-sm font-semibold text-white/70">
                    @{user.username}
                  </Text>
                ) : null}
                <Text className="mt-1 text-sm text-white/50">{user.email}</Text>
                <View className="mt-2 flex-row items-center gap-1.5">
                  <Ionicons
                    name={user.emailVerified ? 'checkmark-circle' : 'alert-circle-outline'}
                    size={14}
                    color={user.emailVerified ? '#41C08D' : '#E0A23E'}
                  />
                  <Text
                    className="text-xs font-bold"
                    style={{ color: user.emailVerified ? '#41C08D' : '#E0A23E' }}
                  >
                    {user.emailVerified ? 'Verifiziert' : 'E-Mail offen'}
                  </Text>
                </View>
              </View>
            </View>

            {!user.emailVerified ? (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ busy: verificationBusy }}
                disabled={verificationBusy}
                className="mt-4 flex-row items-center gap-2 rounded-2xl bg-white/8 px-3 py-3 active:opacity-70"
                onPress={() => void handleVerification()}
              >
                <Ionicons name="mail-unread-outline" size={17} color="#E0A23E" />
                <Text className="flex-1 text-sm font-semibold text-white/75">
                  {verificationBusy ? 'Link wird gesendet …' : 'Bestätigungslink erneut senden'}
                </Text>
              </Pressable>
            ) : null}

            <View className="mt-4 flex-row gap-2">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Profil bearbeiten"
                className="min-h-12 flex-1 flex-row items-center justify-center gap-2 rounded-[18px] bg-white active:opacity-90"
                onPress={() => setEditVisible(true)}
              >
                <Ionicons name="create-outline" size={17} color="#101923" />
                <Text className="text-sm font-extrabold text-[#101923]">Profil bearbeiten</Text>
              </Pressable>
              {/* "Zeig mal deinen Code" — the most common real-life add-friends
                  moment gets one-tap access right from the profile header.
                  Hidden when the request policy blocks incoming requests. */}
              {user.username && friendRequestPolicy === 'anyone' ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Meinen QR-Code zeigen"
                  className="h-12 w-12 items-center justify-center rounded-[18px] border border-white/15 bg-white/10 active:opacity-80"
                  onPress={() => setCodeVisible(true)}
                >
                  <Ionicons name="qr-code-outline" size={20} color="#F4F5F7" />
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}

        <View className="gap-2.5">
          <AppText variant="label">Netzwerk</AppText>
          <SectionCard>
            <SettingRow
              icon="people-outline"
              title="Freunde & Gruppen"
              subtitle="Freundschaften und deine privaten Listen"
              onPress={() => router.push('/friends')}
            />
          </SectionCard>
        </View>

        <View className="gap-2.5">
          <AppText variant="label">Privatsphäre</AppText>
          <SectionCard>
            <SettingRow
              icon="hand-left-outline"
              iconColor="#E56A6A"
              title="Blockierte Personen"
              subtitle={
                blockedUids.length === 0
                  ? 'Niemand blockiert'
                  : `${blockedUids.length} ${blockedUids.length === 1 ? 'Person' : 'Personen'} blockiert`
              }
              onPress={() => setBlockedVisible(true)}
            />
            <Divider />
            {/* Collapsed: shows the current choice like a normal settings row;
                the three radio options only unfold on demand. */}
            <SettingRow
              icon="person-add-outline"
              title="Wer kann dir Freundschaftsanfragen senden?"
              subtitle={
                FRIEND_REQUEST_OPTIONS.find((option) => option.value === friendRequestPolicy)
                  ?.label ?? 'Alle'
              }
              onPress={() => setRequestPolicyOpen((open) => !open)}
              trailing={
                <Ionicons
                  name={requestPolicyOpen ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={colors.mutedForeground}
                />
              }
            />
            {requestPolicyOpen ? (
              <View className="gap-2 px-4 pb-4">
                <Text className="text-xs leading-4 text-muted-foreground">
                  Jede Anfrage muss von dir bestätigt werden.
                </Text>
                {FRIEND_REQUEST_OPTIONS.map((option) => {
                  const selected = friendRequestPolicy === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      accessibilityRole="radio"
                      accessibilityState={{ selected, disabled: privacyBusy }}
                      disabled={privacyBusy}
                      className={`min-h-[58px] flex-row items-center gap-3 rounded-2xl border px-3 py-2.5 active:opacity-75 ${
                        selected
                          ? 'border-primary/40 bg-primary/5'
                          : 'border-border bg-secondary/45'
                      }`}
                      onPress={() => void handleFriendRequestPolicy(option.value)}
                    >
                      <View
                        className="h-5 w-5 items-center justify-center rounded-full border"
                        style={{ borderColor: selected ? ACCENT : colors.mutedForeground }}
                      >
                        {selected ? <View className="h-2.5 w-2.5 rounded-full bg-primary" /> : null}
                      </View>
                      <View className="flex-1">
                        <Text className="text-sm font-bold text-foreground">{option.label}</Text>
                        <Text className="mt-0.5 text-xs text-muted-foreground">
                          {option.description}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
            <Divider />
            {/* All fixed guarantees live behind this one row — the settings list
                itself contains only things the user can actually change. */}
            <SettingRow
              icon="shield-checkmark-outline"
              iconColor="#41C08D"
              title="So schützt dich Together"
              subtitle="Profil, Standort, Chats — was immer gilt"
              onPress={() => setPrivacyInfoVisible(true)}
            />
          </SectionCard>
        </View>

        <View className="gap-2.5">
          <AppText variant="label">Darstellung</AppText>
          <SectionCard>
            <View className="gap-3 p-4">
              <View>
                <Text className="text-[15px] font-bold text-foreground">Erscheinungsbild</Text>
                <Text className="mt-0.5 text-xs text-muted-foreground">
                  Passt sich auf Wunsch automatisch deinem Gerät an.
                </Text>
              </View>
              <ThemeSwitcher />
            </View>
          </SectionCard>
        </View>

        <View className="gap-2.5">
          <AppText variant="label">Mitteilungen</AppText>
          <SectionCard>
            <SettingRow
              icon={pushEnabled ? 'notifications' : 'notifications-off-outline'}
              title="Push-Benachrichtigungen"
              subtitle={
                pushEnabled
                  ? 'Wichtige Updates zu Activities und Sicherheit sind aktiv.'
                  : 'Aktiviere Hinweise für relevante Updates.'
              }
              onPress={() => void handlePushToggle()}
              trailing={
                <Switch
                  value={pushEnabled}
                  onValueChange={() => void handlePushToggle()}
                  trackColor={{ false: colors.border, true: ACCENT }}
                  thumbColor="#ffffff"
                />
              }
            />
            <Divider />
            {/* The reminder only OFFERS to share; each activity's location
                release is still confirmed individually (docs/safety-mode.md). */}
            <SettingRow
              icon="navigate-outline"
              title="Anreise-Erinnerungen"
              subtitle="Eine Stunde vor beigetretenen Aktivitäten fragen, ob du deine Anreise teilen möchtest."
              onPress={() => void handleJourneyRemindersToggle()}
              trailing={
                <Switch
                  value={journeyRemindersEnabled}
                  disabled={journeyBusy}
                  onValueChange={() => void handleJourneyRemindersToggle()}
                  trackColor={{ false: colors.border, true: ACCENT }}
                  thumbColor="#ffffff"
                />
              }
            />
          </SectionCard>
        </View>

        <View className="gap-2.5">
          <AppText variant="label">Konto</AppText>
          <SectionCard>
            <SettingRow
              icon="log-out-outline"
              iconColor="#E0A23E"
              title="Abmelden"
              subtitle="Du kannst dich jederzeit wieder anmelden."
              onPress={() => void signOut()}
            />
            <Divider />
            <SettingRow
              icon="trash-outline"
              iconColor="#E56A6A"
              title="Account löschen"
              subtitle="Entfernt deine Daten dauerhaft."
              onPress={handleDeleteAccount}
            />
          </SectionCard>
        </View>
      </View>

      {user ? (
        <ProfileEditSheet
          visible={editVisible}
          initialDisplayName={user.displayName}
          initialAvatarUrl={user.avatarUrl}
          onClose={() => setEditVisible(false)}
          onSave={updateProfile}
        />
      ) : null}

      <BlockedUsersSheet visible={blockedVisible} onClose={() => setBlockedVisible(false)} />
      <PrivacyInfoSheet visible={privacyInfoVisible} onClose={() => setPrivacyInfoVisible(false)} />
      {user?.username ? (
        <FriendCodeSheet
          visible={codeVisible}
          username={user.username}
          onClose={() => setCodeVisible(false)}
        />
      ) : null}
    </AppScreen>
  );
}
