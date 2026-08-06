import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Image, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { ProfileEditSheet, useAuth, type SignInProvider } from '@/features/auth';
import { FriendCodeSheet, useFriends, type FriendRequestPolicy } from '@/features/friends';
import { useMapStyle, type MapStylePreference } from '@/features/map';
import { BlockedUsersSheet, useModeration } from '@/features/moderation';
import { useNotifications } from '@/features/notifications';
import { PrivacyInfoSheet } from '@/features/settings';
import { useThemeColors, useThemePreference, type ColorSchemePreference } from '@/features/theme';
import { AppScreen, ScreenHeader } from '@/shared/components';
import { FONT, TEXT_CAPPED, TEXT_FLEXIBLE, TYPE } from '@/shared/theme';
import { DIAGNOSTICS_VISIBLE, getBuildInfo } from '@/shared/utils/buildInfo';
import { SEMANTIC_COLOR } from '@/shared/utils/semanticColors';

// Module scope: build identity cannot change while the app is running.
const buildInfo = getBuildInfo();

/**
 * The profile's own accent. Deliberately `SEMANTIC_COLOR.action` and never the
 * `open` blue (#6E8BF7) that used to sit here — that colour belongs to the Open
 * activity mode and must not explain an unrelated state (semanticColors.ts).
 */
const ACCENT = SEMANTIC_COLOR.action;
const SUCCESS = SEMANTIC_COLOR.social;
const WARNING = SEMANTIC_COLOR.safetyAttention;
const DANGER = SEMANTIC_COLOR.danger;

const THEME_OPTIONS: {
  value: ColorSchemePreference;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { value: 'system', label: 'Auto', icon: 'phone-portrait-outline' },
  { value: 'light', label: 'Hell', icon: 'sunny-outline' },
  { value: 'dark', label: 'Dunkel', icon: 'moon-outline' },
];

const MAP_STYLE_OPTIONS: {
  value: MapStylePreference;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { value: 'dynamic', label: 'Auto', icon: 'partly-sunny-outline' },
  { value: 'light', label: 'Tag', icon: 'sunny-outline' },
  { value: 'dark', label: 'Nacht', icon: 'moon-outline' },
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

const PROVIDER_LABEL: Record<SignInProvider, string> = {
  password: 'E-Mail',
  google: 'Google',
  apple: 'Apple',
  unknown: '—',
};

/** "März 2026" — a month is precise enough for a membership date. */
function formatMemberSince(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
}

/** Section heading with a rule running to the right edge. */
function GroupLabel({ children }: { children: ReactNode }) {
  const colors = useThemeColors();
  return (
    <View className="mb-2 mt-6 flex-row items-center gap-2">
      <Text
        {...TEXT_FLEXIBLE}
        style={{
          ...TYPE.micro,
          fontFamily: FONT.bold,
          color: colors.mutedForeground,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
        }}
      >
        {children}
      </Text>
      <View className="h-px flex-1" style={{ backgroundColor: colors.border }} />
    </View>
  );
}

function GroupCard({ children, tone = 'normal' }: { children: ReactNode; tone?: 'normal' | 'danger' }) {
  const colors = useThemeColors();
  return (
    <View
      className="overflow-hidden rounded-[20px] border"
      style={
        tone === 'danger'
          ? { borderColor: `${DANGER}52`, backgroundColor: `${DANGER}0D` }
          : { borderColor: colors.border, backgroundColor: colors.card }
      }
    >
      {children}
    </View>
  );
}

function SettingRow({
  icon,
  iconColor = ACCENT,
  title,
  titleColor,
  subtitle,
  value,
  onPress,
  trailing,
  first = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  title: string;
  titleColor?: string;
  subtitle?: string;
  /** Current setting, shown right-aligned so the page reads without tapping. */
  value?: string;
  onPress?: () => void;
  trailing?: ReactNode;
  first?: boolean;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={value ? `${title}, ${value}` : title}
      disabled={!onPress}
      className="min-h-[56px] flex-row items-center gap-3 px-3.5 py-2.5 active:opacity-70"
      style={first ? undefined : { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}
      onPress={onPress}
    >
      <View
        className="h-[34px] w-[34px] items-center justify-center rounded-[12px]"
        style={{ backgroundColor: `${iconColor}1F` }}
      >
        <Ionicons name={icon} size={17} color={iconColor} />
      </View>
      <View className="flex-1">
        <Text
          {...TEXT_FLEXIBLE}
          style={{ ...TYPE.label, fontFamily: FONT.semibold, color: titleColor ?? colors.foreground }}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            {...TEXT_FLEXIBLE}
            className="mt-0.5"
            style={{ ...TYPE.caption, fontFamily: FONT.medium, color: colors.mutedForeground }}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text
          {...TEXT_CAPPED}
          style={{ ...TYPE.caption, fontFamily: FONT.semibold, color: colors.mutedForeground }}
        >
          {value}
        </Text>
      ) : null}
      {trailing ??
        (onPress ? (
          <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
        ) : null)}
    </Pressable>
  );
}

/** Shared segmented control for the two appearance preferences. */
function Segmented<T extends string>({
  title,
  subtitle,
  options,
  value,
  onChange,
}: {
  title: string;
  subtitle: string;
  options: { value: T; label: string; icon: keyof typeof Ionicons.glyphMap }[];
  value: T;
  onChange: (next: T) => void;
}) {
  const colors = useThemeColors();
  return (
    <View>
      <Text
        {...TEXT_FLEXIBLE}
        style={{ ...TYPE.label, fontFamily: FONT.semibold, color: colors.foreground }}
      >
        {title}
      </Text>
      <Text
        {...TEXT_FLEXIBLE}
        className="mb-2.5 mt-0.5"
        style={{ ...TYPE.caption, fontFamily: FONT.medium, color: colors.mutedForeground }}
      >
        {subtitle}
      </Text>
      <View
        className="flex-row gap-1 rounded-[16px] p-1"
        style={{ backgroundColor: colors.secondary }}
      >
        {options.map((option) => {
          const active = value === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${title} ${option.label}`}
              className="min-h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-[12px] active:opacity-75"
              style={
                active
                  ? {
                      backgroundColor: colors.card,
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.14,
                      shadowRadius: 3,
                      elevation: 2,
                    }
                  : undefined
              }
              onPress={() => onChange(option.value)}
            >
              <Ionicons
                name={option.icon}
                size={14}
                color={active ? ACCENT : colors.mutedForeground}
              />
              <Text
                {...TEXT_CAPPED}
                numberOfLines={1}
                style={{
                  ...TYPE.caption,
                  fontFamily: FONT.semibold,
                  color: active ? ACCENT : colors.mutedForeground,
                }}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function ProfileScreen() {
  // Diagnostic only: reads the CURRENT permission without prompting, so the
  // build line can distinguish "code is wrong" from "the OS never granted
  // location to this bundle id". Staging is a separate install from dev, and
  // permissions do not carry across.
  const [locationState, setLocationState] = useState('…');
  useEffect(() => {
    if (!DIAGNOSTICS_VISIBLE) return;
    let active = true;
    Location.getForegroundPermissionsAsync()
      .then((result) => {
        if (active) setLocationState(result.granted ? 'ok' : result.status);
      })
      .catch(() => {
        if (active) setLocationState('err');
      });
    return () => {
      active = false;
    };
  }, []);

  const { user, signOut, updateProfile, sendEmailVerification, deleteAccount } = useAuth();
  const [editVisible, setEditVisible] = useState(false);
  const [avatarPickerOnShow, setAvatarPickerOnShow] = useState(false);
  const [verificationBusy, setVerificationBusy] = useState(false);
  const [privacyBusy, setPrivacyBusy] = useState(false);
  const [blockedVisible, setBlockedVisible] = useState(false);
  const [privacyInfoVisible, setPrivacyInfoVisible] = useState(false);
  const [requestPolicyOpen, setRequestPolicyOpen] = useState(false);
  const [codeVisible, setCodeVisible] = useState(false);
  const [journeyBusy, setJourneyBusy] = useState(false);
  const colors = useThemeColors();
  const { preference: themePreference, setPreference: setThemePreference } = useThemePreference();
  const { preference: mapStyle, setPreference: setMapStyle } = useMapStyle();
  const { pushEnabled, enablePush, disablePush } = useNotifications();
  const {
    friends,
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

  async function handleSignOut() {
    try {
      await signOut();
    } catch {
      Alert.alert(
        'Abmelden gerade nicht möglich',
        'Die Push-Verknüpfung konnte nicht sicher gelöst werden. Prüfe deine Verbindung und versuche es erneut.',
      );
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
  const requestPolicyLabel =
    FRIEND_REQUEST_OPTIONS.find((option) => option.value === friendRequestPolicy)?.label ?? 'Alle';
  const themeLabel = THEME_OPTIONS.find((option) => option.value === themePreference)?.label;
  const mapStyleLabel = MAP_STYLE_OPTIONS.find((option) => option.value === mapStyle)?.label;

  // The membership card. Paper stock in light, ink-dark in dark — both designed,
  // not one inverted. Deliberately carries NO ornament: the type and the two
  // brand colours do the work.
  const cardSurface = colors.primaryForeground === '#FAF7F2' ? '#F6F1E6' : '#171D1A';
  const cardInk = colors.primary;
  const cardRule = `${colors.primary}4D`;

  return (
    <AppScreen scroll contentClassName="px-5 pb-8 pt-3">
      <View className="flex-1">
        <ScreenHeader
          title="Profil"
          subtitle="Dein Konto und deine Einstellungen"
          onBack={() => router.back()}
        />

        {user ? (
          <>
            <View
              className="mt-5 overflow-hidden rounded-[24px] p-4"
              style={{
                backgroundColor: cardSurface,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: `${colors.primary}33`,
              }}
            >
              <View className="flex-row items-start justify-between">
                <Text
                  {...TEXT_FLEXIBLE}
                  style={{
                    ...TYPE.micro,
                    fontFamily: FONT.bold,
                    color: cardInk,
                    letterSpacing: 1.6,
                    textTransform: 'uppercase',
                  }}
                >
                  Together · Mitglied
                </Text>
                {/* "Zeig mal deinen Code" — the most common real-life add-friends
                    moment. Hidden when the request policy blocks incoming requests. */}
                {user.username && friendRequestPolicy === 'anyone' ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Meinen QR-Code zeigen"
                    className="h-[38px] w-[38px] items-center justify-center rounded-[12px] active:opacity-80"
                    style={{ backgroundColor: cardInk }}
                    onPress={() => setCodeVisible(true)}
                  >
                    <Ionicons name="qr-code-outline" size={21} color={cardSurface} />
                  </Pressable>
                ) : null}
              </View>

              <View className="mt-6 flex-row items-end gap-3">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Profilbild ändern"
                  accessibilityHint="Kamera oder Fotos öffnen"
                  className="h-14 w-14 items-center justify-center overflow-hidden rounded-[19px] active:opacity-80"
                  style={{ backgroundColor: cardInk }}
                  onPress={() => {
                    setAvatarPickerOnShow(true);
                    setEditVisible(true);
                  }}
                >
                  {user.avatarUrl ? (
                    <Image
                      accessibilityIgnoresInvertColors
                      source={{ uri: user.avatarUrl }}
                      className="h-full w-full"
                    />
                  ) : (
                    <Text
                      {...TEXT_CAPPED}
                      style={{ ...TYPE.body, fontFamily: FONT.bold, color: cardSurface }}
                    >
                      {initials || 'DU'}
                    </Text>
                  )}
                </Pressable>
                <View className="flex-1">
                  <Text
                    {...TEXT_FLEXIBLE}
                    numberOfLines={1}
                    style={{
                      ...TYPE.body,
                      fontFamily: FONT.bold,
                      letterSpacing: -0.35,
                      color: colors.foreground,
                    }}
                  >
                    {displayName}
                  </Text>
                  {user.username ? (
                    <Text
                      {...TEXT_FLEXIBLE}
                      numberOfLines={1}
                      className="mt-0.5"
                      style={{
                        ...TYPE.caption,
                        fontFamily: FONT.medium,
                        color: colors.mutedForeground,
                      }}
                    >
                      @{user.username}
                    </Text>
                  ) : null}
                </View>
              </View>

              {/* Three facts the app already stores and never showed. */}
              <View
                className="mt-4 flex-row gap-3 pt-3"
                style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: cardRule }}
              >
                {[
                  { key: 'Mitglied seit', value: formatMemberSince(user.createdAt) },
                  { key: 'Freunde', value: String(friends.length) },
                  { key: 'Anmeldung', value: PROVIDER_LABEL[user.signInProvider] },
                ].map((fact) => (
                  <View key={fact.key} className="flex-1">
                    <Text
                      {...TEXT_FLEXIBLE}
                      style={{
                        ...TYPE.micro,
                        fontFamily: FONT.bold,
                        color: colors.mutedForeground,
                        letterSpacing: 1,
                        textTransform: 'uppercase',
                      }}
                    >
                      {fact.key}
                    </Text>
                    <Text
                      {...TEXT_FLEXIBLE}
                      numberOfLines={1}
                      className="mt-0.5"
                      style={{ ...TYPE.caption, fontFamily: FONT.bold, color: cardInk }}
                    >
                      {fact.value}
                    </Text>
                  </View>
                ))}
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Profil bearbeiten"
                className="mt-3.5 min-h-11 flex-row items-center justify-center gap-2 rounded-[14px] active:opacity-90"
                style={{ backgroundColor: cardInk }}
                onPress={() => setEditVisible(true)}
              >
                <Ionicons name="create-outline" size={16} color={cardSurface} />
                <Text
                  {...TEXT_CAPPED}
                  style={{ ...TYPE.label, fontFamily: FONT.bold, color: cardSurface }}
                >
                  Profil bearbeiten
                </Text>
              </Pressable>
            </View>

            {/* An open task, not a permanent badge. Once the address is
                confirmed this disappears entirely — a green tick for doing
                something mandatory is noise, not status. */}
            {!user.emailVerified ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="E-Mail bestätigen, Link erneut senden"
                accessibilityState={{ busy: verificationBusy }}
                disabled={verificationBusy}
                className="mt-2.5 min-h-[52px] flex-row items-center gap-2.5 rounded-[16px] px-3.5 py-2.5 active:opacity-70"
                style={{ backgroundColor: `${WARNING}1F`, borderWidth: 1, borderColor: `${WARNING}66` }}
                onPress={() => void handleVerification()}
              >
                <Ionicons name="mail-unread-outline" size={17} color={WARNING} />
                <View className="flex-1">
                  <Text
                    {...TEXT_FLEXIBLE}
                    style={{ ...TYPE.label, fontFamily: FONT.bold, color: WARNING }}
                  >
                    E-Mail bestätigen
                  </Text>
                  <Text
                    {...TEXT_FLEXIBLE}
                    className="mt-0.5"
                    style={{
                      ...TYPE.caption,
                      fontFamily: FONT.medium,
                      color: colors.mutedForeground,
                    }}
                  >
                    {verificationBusy ? 'Link wird gesendet …' : 'Link erneut senden'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={WARNING} />
              </Pressable>
            ) : null}
          </>
        ) : null}

        <GroupLabel>Netzwerk</GroupLabel>
        <GroupCard>
          <SettingRow
            first
            icon="people-outline"
            title="Freunde & Gruppen"
            subtitle="Freundschaften und deine privaten Listen"
            value={friends.length > 0 ? String(friends.length) : undefined}
            onPress={() => router.push('/friends')}
          />
        </GroupCard>

        <GroupLabel>Privatsphäre</GroupLabel>
        <GroupCard>
          <SettingRow
            first
            icon="hand-left-outline"
            iconColor={DANGER}
            title="Blockierte Personen"
            value={
              blockedUids.length === 0
                ? 'Niemand'
                : `${blockedUids.length} ${blockedUids.length === 1 ? 'Person' : 'Personen'}`
            }
            onPress={() => setBlockedVisible(true)}
          />
          {/* Collapsed: shows the current choice like a normal settings row;
              the three radio options only unfold on demand. */}
          <SettingRow
            icon="person-add-outline"
            title="Freundschaftsanfragen"
            subtitle="Wer dir Anfragen senden darf"
            value={requestPolicyLabel}
            onPress={() => setRequestPolicyOpen((open) => !open)}
            trailing={
              <Ionicons
                name={requestPolicyOpen ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={colors.mutedForeground}
              />
            }
          />
          {requestPolicyOpen ? (
            <View className="gap-1.5 px-3.5 pb-3.5">
              <Text
                {...TEXT_FLEXIBLE}
                className="mb-0.5"
                style={{
                  ...TYPE.caption,
                  fontFamily: FONT.medium,
                  color: colors.mutedForeground,
                }}
              >
                Jede Anfrage musst du trotzdem bestätigen.
              </Text>
              {FRIEND_REQUEST_OPTIONS.map((option) => {
                const selected = friendRequestPolicy === option.value;
                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="radio"
                    accessibilityState={{ selected, disabled: privacyBusy }}
                    disabled={privacyBusy}
                    className="min-h-[54px] flex-row items-center gap-3 rounded-[14px] border px-3 py-2.5 active:opacity-75"
                    style={{
                      borderColor: selected ? ACCENT : colors.border,
                      backgroundColor: selected ? `${ACCENT}12` : colors.secondary,
                      opacity: privacyBusy ? 0.6 : 1,
                    }}
                    onPress={() => void handleFriendRequestPolicy(option.value)}
                  >
                    <View
                      className="h-[18px] w-[18px] items-center justify-center rounded-full border-[1.5px]"
                      style={{ borderColor: selected ? ACCENT : colors.mutedForeground }}
                    >
                      {selected ? (
                        <View
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: ACCENT }}
                        />
                      ) : null}
                    </View>
                    <View className="flex-1">
                      <Text
                        {...TEXT_FLEXIBLE}
                        style={{
                          ...TYPE.label,
                          fontFamily: FONT.semibold,
                          color: colors.foreground,
                        }}
                      >
                        {option.label}
                      </Text>
                      <Text
                        {...TEXT_FLEXIBLE}
                        className="mt-0.5"
                        style={{
                          ...TYPE.caption,
                          fontFamily: FONT.medium,
                          color: colors.mutedForeground,
                        }}
                      >
                        {option.description}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          {/* All fixed guarantees live behind this one row — the settings list
              itself contains only things the user can actually change. */}
          <SettingRow
            icon="shield-checkmark-outline"
            iconColor={SUCCESS}
            title="So schützt dich Together"
            subtitle="Profil, Standort, Chats — was immer gilt"
            onPress={() => setPrivacyInfoVisible(true)}
          />
          <SettingRow
            icon="document-text-outline"
            title="Datenschutzerklärung"
            subtitle="Rechtliche Informationen zur Datenverarbeitung"
            onPress={() => router.push('/datenschutz')}
          />
          <SettingRow
            icon="reader-outline"
            title="Nutzungsbedingungen"
            subtitle="Regeln für die Nutzung von Together"
            onPress={() => router.push('/nutzungsbedingungen')}
          />
          <SettingRow
            icon="information-circle-outline"
            title="Impressum"
            subtitle="Anbieterkennzeichnung"
            onPress={() => router.push('/impressum')}
          />
        </GroupCard>

        <GroupLabel>Darstellung</GroupLabel>
        <GroupCard>
          <View className="gap-4 p-3.5">
            <Segmented
              title="Erscheinungsbild"
              subtitle="Passt sich auf Wunsch automatisch deinem Gerät an."
              options={THEME_OPTIONS}
              value={themePreference}
              onChange={setThemePreference}
            />
            <View className="h-px" style={{ backgroundColor: colors.border }} />
            <Segmented
              title="Kartenstil"
              subtitle="Dynamisch folgt dem Tageslicht und dem Sonnenuntergang."
              options={MAP_STYLE_OPTIONS}
              value={mapStyle}
              onChange={setMapStyle}
            />
          </View>
        </GroupCard>

        <GroupLabel>Mitteilungen</GroupLabel>
        <GroupCard>
          <SettingRow
            first
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
          {/* The reminder only OFFERS to share; each activity's location
              release is still confirmed individually (docs/safety-mode.md). */}
          <SettingRow
            icon="navigate-outline"
            title="Anreise-Erinnerungen"
            subtitle="Eine Stunde vor beigetretenen Aktivitäten fragen."
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
        </GroupCard>

        <GroupLabel>Konto</GroupLabel>
        <GroupCard>
          <SettingRow
            first
            icon="log-out-outline"
            iconColor={WARNING}
            title="Abmelden"
            subtitle="Du kannst dich jederzeit wieder anmelden."
            onPress={() => void handleSignOut()}
          />
        </GroupCard>

        {/* Irreversible, so it stands alone rather than sharing a card with
            "Abmelden" — the two are not peers. */}
        <View className="mt-2.5">
          <GroupCard tone="danger">
            <SettingRow
              first
              icon="trash-outline"
              iconColor={DANGER}
              title="Account löschen"
              titleColor={DANGER}
              subtitle="Entfernt deine Daten dauerhaft."
              onPress={handleDeleteAccount}
            />
          </GroupCard>
        </View>

        {/* Build identity — answers "is the OTA update actually on this
            device?". The update id is the part that proves it: two bundles
            published from the same source share a version string but never
            an id. Dev/staging only; it is noise to a real user. */}
        {DIAGNOSTICS_VISIBLE ? (
          <Text
            {...TEXT_FLEXIBLE}
            className="pb-2 pt-5 text-center"
            style={{
              ...TYPE.micro,
              fontFamily: FONT.medium,
              color: colors.mutedForeground,
              opacity: 0.7,
            }}
          >
            {buildInfo.line} · loc:{locationState}
          </Text>
        ) : (
          <View className="pb-2 pt-5" />
        )}
      </View>

      {user ? (
        <ProfileEditSheet
          visible={editVisible}
          initialDisplayName={user.displayName}
          initialAvatarUrl={user.avatarUrl}
          openAvatarPickerOnShow={avatarPickerOnShow}
          onAvatarPickerRequestConsumed={() => setAvatarPickerOnShow(false)}
          onClose={() => {
            setAvatarPickerOnShow(false);
            setEditVisible(false);
          }}
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
