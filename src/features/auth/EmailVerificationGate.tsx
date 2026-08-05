import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TogetherLockup } from '@/shared/components';
import { haptics } from '@/shared/utils/haptics';

import { useAuth } from './hooks/useAuth';

const ACCENT = '#6E8BF7';

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
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentAt, setSentAt] = useState<number | null>(null);
  const checkingRef = useRef(false);

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
          Alert.alert(
            'Noch nicht bestätigt',
            'Wir konnten die Bestätigung noch nicht sehen. Öffne den Link in der E-Mail und tippe danach erneut auf „Ich habe bestätigt“.',
          );
        }
      } catch {
        if (!silent) {
          Alert.alert('Prüfung fehlgeschlagen', 'Bitte versuche es in einem Moment erneut.');
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
    try {
      await sendEmailVerification();
      setSentAt(Date.now());
      haptics.success();
    } catch {
      haptics.warning();
      Alert.alert(
        'E-Mail konnte nicht gesendet werden',
        'Bitte prüfe deine Verbindung und versuche es erneut.',
      );
    } finally {
      setSending(false);
    }
  }

  function useDifferentAddress() {
    Alert.alert(
      'Andere E-Mail-Adresse?',
      'Dieses Konto wird gelöscht, damit du dich mit der richtigen Adresse neu registrieren kannst.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Konto löschen',
          style: 'destructive',
          onPress: () => {
            void deleteAccount().catch(() => {
              void signOut();
            });
          },
        },
      ],
    );
  }

  return (
    <View className="flex-1 bg-[#0E1116]">
      <SafeAreaView className="flex-1 px-7">
        <View className="flex-1 items-center justify-center">
          <TogetherLockup animated={false} width={200} />

          <View
            className="mt-10 h-16 w-16 items-center justify-center rounded-3xl"
            style={{ backgroundColor: `${ACCENT}22` }}
          >
            <Ionicons name="mail-open-outline" size={28} color={ACCENT} />
          </View>

          <Text className="mt-6 text-center text-2xl font-extrabold text-white">
            Bestätige deine E-Mail
          </Text>
          <Text className="mt-3 max-w-[320px] text-center text-sm leading-5 text-white/55">
            Wir haben dir einen Link geschickt an
          </Text>
          <Text className="mt-1 max-w-[320px] text-center text-sm font-bold text-white">
            {user?.email ?? ''}
          </Text>
          <Text className="mt-3 max-w-[320px] text-center text-sm leading-5 text-white/55">
            Öffne den Link, danach geht es hier automatisch weiter. Das ist nur einmal nötig.
          </Text>

          {sentAt ? (
            <Text className="mt-4 text-center text-xs text-[#41C08D]">
              E-Mail erneut gesendet. Schau auch im Spam-Ordner nach.
            </Text>
          ) : null}

          <View className="mt-9 w-full max-w-[300px] gap-2.5">
            <Pressable
              accessibilityRole="button"
              disabled={checking}
              className="min-h-[54px] items-center justify-center rounded-2xl bg-white active:opacity-90"
              onPress={() => void check()}
            >
              {checking ? (
                <ActivityIndicator color="#0E1116" />
              ) : (
                <Text className="text-base font-bold text-[#0E1116]">Ich habe bestätigt</Text>
              )}
            </Pressable>

            <Pressable
              accessibilityRole="button"
              disabled={sending}
              className="min-h-[48px] items-center justify-center rounded-2xl border border-white/15 active:opacity-80"
              onPress={() => void resend()}
            >
              <Text className="text-sm font-semibold text-white/80">
                {sending ? 'Wird gesendet …' : 'E-Mail erneut senden'}
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              className="min-h-[44px] items-center justify-center active:opacity-70"
              onPress={useDifferentAddress}
            >
              <Text className="text-sm font-semibold text-white/45">
                Andere E-Mail-Adresse verwenden
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              className="min-h-[40px] items-center justify-center active:opacity-70"
              onPress={() => void signOut()}
            >
              <Text className="text-xs text-white/35">Abmelden</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}
