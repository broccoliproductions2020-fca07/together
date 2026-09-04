import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeOut, useReducedMotion } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandBackdrop, TogetherFinalWordmark, TogetherLoader } from '@/shared/components';
import { FONT, shadow, TEXT_CAPPED, TEXT_FLEXIBLE, TYPE } from '@/shared/theme';
import { haptics } from '@/shared/utils/haptics';

import { useAuth } from './hooks/useAuth';
import { authErrorMessage } from './services/authErrors';

const COLORS = {
  // Matches AuthScreen's ground, so arriving here reads as the same room and
  // not as a second, plainer app.
  ground: '#080B14',
  paper: '#F4F5F7',
  ink: '#0E1116',
  soft: 'rgba(244,245,247,0.78)',
  muted: 'rgba(244,245,247,0.55)',
  quiet: 'rgba(244,245,247,0.4)',
  line: 'rgba(244,245,247,0.12)',
  panel: 'rgba(20,25,33,0.6)',
  field: 'rgba(244,245,247,0.06)',
  // The brand indigo, not the `open` blue this screen used to borrow: #3B82F6 is
  // an activity-mode colour and must not stand for unrelated state.
  accent: '#8991FF',
  success: '#41C08D',
  danger: '#FCA5A5',
};

type Notice = { tone: 'success' | 'error'; text: string };

/**
 * Hard gate between sign-up and the app: an account whose address is not
 * confirmed never reaches the map.
 *
 * Rationale (Produktentscheidung August 2026): the backend already rejects
 * gated callables for unverified accounts, so such a person previously got
 * *in* and then hit unexplained failures — the worst of both worlds. Blocking
 * with an explanation is both clearer and the honest place to state which
 * address we wrote to, which is what turns a typo ("gmail.con") from a silent
 * dead end into something the person can see and fix.
 *
 * Verification is a ONE-TIME step per account: `emailVerified` lives on the
 * Firebase user, not the device, so a new phone or reinstall never re-asks.
 */
export function EmailVerificationGate() {
  const { user, sendEmailVerification, refreshSession, signOut, deleteAccount } = useAuth();
  const { height } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [deleting, setDeleting] = useState(false);
  const checkingRef = useRef(false);
  const compact = height < 730;

  const check = useCallback(
    async (silent = false) => {
      if (checkingRef.current) return;
      checkingRef.current = true;
      setChecking(true);
      try {
        const verified = await refreshSession();
        if (verified) {
          haptics.success();
        } else if (!silent) {
          haptics.warning();
          setNotice({
            tone: 'error',
            text: 'Noch keine Bestätigung zu sehen. Öffne den Link in der E-Mail und tippe danach erneut hier.',
          });
        }
      } catch {
        if (!silent) {
          setNotice({ tone: 'error', text: 'Die Prüfung hat nicht geklappt. Gleich nochmal?' });
        }
      } finally {
        checkingRef.current = false;
        setChecking(false);
      }
    },
    [refreshSession],
  );

  // Returning from the mail app is when the link was most likely clicked —
  // re-check then, so the common path needs no button press at all.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check(true);
    });
    return () => subscription.remove();
  }, [check]);

  async function resend() {
    if (sending) return;
    setSending(true);
    setNotice(null);
    try {
      await sendEmailVerification();
      setNotice({
        tone: 'success',
        text: 'E-Mail ist unterwegs. Schau auch kurz im Spam-Ordner nach.',
      });
      haptics.success();
    } catch (error) {
      haptics.warning();
      // The callable answers in German already (rate limit, missing address);
      // a blanket "prüfe deine Verbindung" would name the wrong cause.
      setNotice({ tone: 'error', text: authErrorMessage(error, 'profile') });
    } finally {
      setSending(false);
    }
  }

  function confirmDifferentAddress() {
    Alert.alert(
      'Andere E-Mail-Adresse?',
      'Dieses Konto wird gelöscht, damit du dich mit der richtigen Adresse neu registrieren kannst.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Konto löschen',
          style: 'destructive',
          onPress: () => {
            if (deleting) return;
            setDeleting(true);
            void deleteAccount()
              .catch(() => {
                setNotice({
                  tone: 'error',
                  text: 'Das Konto ließ sich nicht löschen. Du bist weiterhin angemeldet.',
                });
              })
              .finally(() => setDeleting(false));
          },
        },
      ],
    );
  }

  const busy = checking || sending || deleting;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <BrandBackdrop quiet />

      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.wordmarkWrap}>
            <TogetherFinalWordmark width={compact ? 132 : 152} />
          </View>

          <View style={styles.card}>
            <View style={styles.iconTile}>
              <Ionicons name="mail-open-outline" size={24} color={COLORS.accent} />
            </View>

            <Text {...TEXT_FLEXIBLE} style={styles.title}>
              Fast geschafft.
            </Text>

            <Text {...TEXT_FLEXIBLE} style={styles.body}>
              Wir haben dir einen Bestätigungslink geschickt an:
            </Text>

            {/* The address gets its own block on purpose: a mistyped domain is
                the one failure this screen exists to make visible. */}
            <View style={styles.addressField}>
              <Text {...TEXT_FLEXIBLE} selectable style={styles.address}>
                {user?.email ?? ''}
              </Text>
            </View>

            <Text {...TEXT_FLEXIBLE} style={styles.hint}>
              Tippe den Link in der E-Mail an — danach geht es hier von allein weiter. Das ist nur
              einmal nötig.
            </Text>
          </View>

          {notice ? (
            <Animated.View
              entering={reducedMotion ? undefined : FadeIn.duration(180)}
              exiting={reducedMotion ? undefined : FadeOut.duration(120)}
              style={[
                styles.notice,
                notice.tone === 'success' ? styles.noticeSuccess : styles.noticeError,
              ]}
            >
              <Ionicons
                name={notice.tone === 'success' ? 'checkmark-circle' : 'alert-circle'}
                size={15}
                color={notice.tone === 'success' ? COLORS.success : COLORS.danger}
              />
              <Text
                {...TEXT_FLEXIBLE}
                accessibilityLiveRegion="polite"
                style={[
                  styles.noticeText,
                  { color: notice.tone === 'success' ? COLORS.success : COLORS.danger },
                ]}
              >
                {notice.text}
              </Text>
            </Animated.View>
          ) : null}

          <View style={styles.actions}>
            <Pressable
              accessibilityLabel="Ich habe bestätigt"
              accessibilityRole="button"
              accessibilityState={{ busy: checking, disabled: busy }}
              disabled={busy}
              onPress={() => void check()}
              style={({ pressed }) => [
                styles.primary,
                busy ? styles.dimmed : null,
                pressed && !busy ? styles.pressed : null,
              ]}
            >
              <View pointerEvents="none" style={styles.primarySheen} />
              {checking ? (
                <TogetherLoader accessibilityLabel="" color={COLORS.ink} size={24} />
              ) : null}
              <Text {...TEXT_CAPPED} style={styles.primaryLabel}>
                {checking ? 'Wird geprüft …' : 'Ich habe bestätigt'}
              </Text>
            </Pressable>

            <Pressable
              accessibilityLabel="E-Mail erneut senden"
              accessibilityRole="button"
              accessibilityState={{ busy: sending, disabled: busy }}
              disabled={busy}
              onPress={() => void resend()}
              style={({ pressed }) => [
                styles.secondary,
                busy ? styles.dimmed : null,
                pressed && !busy ? styles.pressed : null,
              ]}
            >
              {sending ? (
                <TogetherLoader accessibilityLabel="" color={COLORS.soft} size={20} />
              ) : null}
              <Text {...TEXT_CAPPED} style={styles.secondaryLabel}>
                {sending ? 'Wird gesendet …' : 'E-Mail erneut senden'}
              </Text>
            </Pressable>

            <View style={styles.quietRow}>
              <Pressable
                accessibilityLabel="Andere E-Mail-Adresse verwenden"
                accessibilityRole="button"
                disabled={deleting}
                hitSlop={8}
                onPress={confirmDifferentAddress}
                style={({ pressed }) => [styles.quietButton, pressed ? styles.pressedSoft : null]}
              >
                <Text {...TEXT_CAPPED} style={styles.quietLabel}>
                  {deleting ? 'Konto wird gelöscht …' : 'Andere Adresse'}
                </Text>
              </Pressable>

              <View style={styles.quietDot} />

              <Pressable
                accessibilityLabel="Abmelden"
                accessibilityRole="button"
                disabled={deleting}
                hitSlop={8}
                onPress={() => void signOut()}
                style={({ pressed }) => [styles.quietButton, pressed ? styles.pressedSoft : null]}
              >
                <Text {...TEXT_CAPPED} style={styles.quietLabel}>
                  Abmelden
                </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: 10,
    marginTop: 20,
  },
  address: {
    color: COLORS.paper,
    fontFamily: FONT.bold,
    textAlign: 'center',
    ...TYPE.body,
  },
  addressField: {
    backgroundColor: COLORS.field,
    borderColor: COLORS.line,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  body: {
    color: COLORS.muted,
    fontFamily: FONT.medium,
    ...TYPE.label,
  },
  card: {
    backgroundColor: COLORS.panel,
    borderColor: COLORS.line,
    borderRadius: 24,
    borderWidth: 1,
    gap: 12,
    padding: 24,
  },
  dimmed: {
    opacity: 0.72,
  },
  hint: {
    color: COLORS.muted,
    fontFamily: FONT.medium,
    ...TYPE.caption,
  },
  iconTile: {
    alignItems: 'center',
    backgroundColor: 'rgba(137,145,255,0.15)',
    borderRadius: 18,
    height: 52,
    justifyContent: 'center',
    marginBottom: 4,
    width: 52,
  },
  notice: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  noticeError: {
    backgroundColor: 'rgba(252,165,165,0.1)',
    borderColor: 'rgba(252,165,165,0.26)',
  },
  noticeSuccess: {
    backgroundColor: 'rgba(65,192,141,0.1)',
    borderColor: 'rgba(65,192,141,0.26)',
  },
  noticeText: {
    flex: 1,
    fontFamily: FONT.medium,
    ...TYPE.caption,
  },
  pressed: {
    transform: [{ scale: 0.985 }],
  },
  pressedSoft: {
    opacity: 0.7,
  },
  primary: {
    alignItems: 'center',
    backgroundColor: COLORS.paper,
    borderRadius: 20,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 56,
    overflow: 'hidden',
    paddingHorizontal: 20,
    ...shadow({ color: '#000000', offsetY: 8, radius: 16, opacity: 0.28, elevation: 6 }),
  },
  primaryLabel: {
    color: COLORS.ink,
    fontFamily: FONT.bold,
    ...TYPE.body,
  },
  primarySheen: {
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderRadius: 1,
    height: 1.5,
    left: 18,
    position: 'absolute',
    right: 18,
    top: 1,
  },
  quietButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 8,
  },
  quietDot: {
    backgroundColor: COLORS.quiet,
    borderRadius: 2,
    height: 3,
    width: 3,
  },
  quietLabel: {
    color: COLORS.quiet,
    fontFamily: FONT.semibold,
    ...TYPE.caption,
  },
  quietRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    paddingTop: 2,
  },
  root: {
    backgroundColor: COLORS.ground,
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: 28,
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  secondary: {
    alignItems: 'center',
    borderColor: COLORS.line,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 20,
  },
  secondaryLabel: {
    color: COLORS.soft,
    fontFamily: FONT.semibold,
    ...TYPE.label,
  },
  title: {
    color: COLORS.paper,
    fontFamily: FONT.bold,
    ...TYPE.displayCompact,
  },
  wordmarkWrap: {
    alignItems: 'center',
    marginBottom: 28,
  },
});
