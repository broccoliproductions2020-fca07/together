import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { SpontaneousRoundInvitePreview } from '@/features/chat';
import { useThemeColors } from '@/features/theme';
import { SquircleButton, TogetherLoader } from '@/shared/components';
import { TEXT_CAPPED, TEXT_FLEXIBLE } from '@/shared/theme';

const ACCENT = '#3B82F6';
/** How many faces are shown before the rest collapse into "+ N weitere". The
 * backend already caps `memberPreview`; this is the visual guard, not the
 * privacy one. */
const MAX_FACES = 4;
/** Re-read of the wall clock while the sheet is open. Half a minute is fine for
 * a label that counts in minutes, and it costs one setState — no listener, no
 * request, no backend cost. */
const COUNTDOWN_TICK_MS = 30_000;

/** "Noch 18 Min. offen" — minutes while it is minutes, then hours. Never a
 * bare timestamp: the only thing that matters is how long you have to decide. */
function remainingLabel(expiresAt: number, now: number): string {
  const minutes = Math.round((expiresAt - now) / 60_000);
  if (minutes <= 0) return 'Läuft gerade ab';
  if (minutes < 60) return `Noch ${minutes} Min. offen`;
  const hours = Math.floor(minutes / 60);
  return `Noch ${hours} Std. offen`;
}

function Face({ initials }: { initials: string }) {
  return (
    <View
      className="h-11 w-11 items-center justify-center rounded-full border-2"
      style={{ backgroundColor: `${ACCENT}22`, borderColor: `${ACCENT}55` }}
    >
      <Text {...TEXT_CAPPED} className="text-sm font-extrabold" style={{ color: ACCENT }}>
        {initials}
      </Text>
    </View>
  );
}

export interface SpontaneousRoundInviteSheetProps {
  visible: boolean;
  /** null while the one-off preview callable is still in flight. */
  preview: SpontaneousRoundInvitePreview | null;
  loading: boolean;
  /** True while `acceptSpontaneousRound` runs — both actions lock. */
  joining: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onClose: () => void;
}

/**
 * The step between "someone invited you" and "you are in a room with them".
 *
 * Tapping an invite used to join immediately. That is the wrong default for
 * this feature specifically: a spontaneous round deliberately puts people
 * together who may not all know each other, so the recipient has to be able to
 * SEE who is already in before committing — and to walk away without the
 * starter being told.
 *
 * Everything shown here comes from the one-off `getSpontaneousRoundInvitePreview`
 * callable. The sheet fetches nothing itself and subscribes to no data — its
 * only timer is a local clock read for the expiry label — and it shows nothing
 * beyond name and initials: no location, no contact detail, no chat, until the
 * person has actually accepted.
 */
export function SpontaneousRoundInviteSheet({
  visible,
  preview,
  loading,
  joining,
  onAccept,
  onDecline,
  onClose,
}: SpontaneousRoundInviteSheetProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  // The expiry has to keep counting while the sheet sits open. Reading
  // `Date.now()` at render only meant it froze at whatever it said on arrival:
  // a sheet showing "Noch 1 Min. offen" would still say so ten minutes later,
  // and "Läuft gerade ab" was unreachable in practice. Ticks only while
  // visible, and re-reads immediately on open so a reopened sheet is never
  // stale for up to half a minute.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!visible) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), COUNTDOWN_TICK_MS);
    return () => clearInterval(timer);
  }, [visible]);

  const hostName = preview?.host.displayName ?? '';
  const faces = preview?.memberPreview.slice(0, MAX_FACES) ?? [];
  const overflow = preview ? Math.max(0, preview.memberCount - faces.length) : 0;

  return (
    <Modal
      transparent
      animationType="slide"
      visible={visible}
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View className="flex-1 justify-end">
        <Pressable
          accessible={false}
          className="absolute inset-0"
          style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
          onPress={onClose}
        />

        <View
          accessibilityViewIsModal
          className="rounded-t-[30px] border px-5 pt-3"
          style={{
            backgroundColor: colors.card,
            borderColor: colors.border,
            paddingBottom: Math.max(insets.bottom, 16) + 4,
          }}
        >
          <View className="items-center pb-1">
            <View className="h-1 w-10 rounded-full" style={{ backgroundColor: colors.border }} />
          </View>

          {loading ? (
            // Honest and compact: it says what is happening and reserves roughly
            // the height the loaded sheet will take, so nothing jumps.
            <View className="items-center gap-3 py-12">
              <TogetherLoader size={40} />
              <Text
                {...TEXT_FLEXIBLE}
                className="text-sm font-semibold"
                style={{ color: colors.mutedForeground }}
              >
                Einladung wird geladen …
              </Text>
            </View>
          ) : !preview ? null : (
            <View className="gap-5 pt-3">
              <View className="gap-1.5">
                <Text
                  {...TEXT_FLEXIBLE}
                  className="text-2xl font-extrabold tracking-[-0.4px]"
                  style={{ color: colors.foreground }}
                >
                  {hostName} startet eine spontane Runde
                </Text>
                <Text
                  {...TEXT_FLEXIBLE}
                  className="text-sm"
                  style={{ color: colors.mutedForeground }}
                >
                  {hostName} hat dich eingeladen.
                </Text>
              </View>

              {faces.length ? (
                <View className="flex-row items-center gap-2">
                  {faces.map((member) => (
                    <Face key={member.uid} initials={member.initials} />
                  ))}
                  {overflow > 0 ? (
                    <Text
                      {...TEXT_FLEXIBLE}
                      className="ml-1 text-sm font-semibold"
                      style={{ color: colors.mutedForeground }}
                    >
                      + {overflow} weitere
                    </Text>
                  ) : null}
                </View>
              ) : null}

              {/* Said plainly, before the decision — not discovered afterwards. */}
              <View
                className="flex-row items-start gap-2.5 rounded-2xl px-3.5 py-3"
                style={{ backgroundColor: `${ACCENT}14` }}
              >
                <Ionicons name="people-outline" size={17} color={ACCENT} />
                <Text
                  {...TEXT_FLEXIBLE}
                  className="flex-1 text-[13px] leading-5"
                  style={{ color: colors.mutedForeground }}
                >
                  Ihr kennt euch vielleicht nicht alle. Ihr trefft euch über {hostName}.
                </Text>
              </View>

              <View className="flex-row items-center gap-2">
                <Ionicons name="time-outline" size={15} color={colors.mutedForeground} />
                <Text
                  {...TEXT_FLEXIBLE}
                  className="text-[13px] font-semibold"
                  style={{ color: colors.mutedForeground }}
                >
                  {remainingLabel(preview.expiresAt, now)}
                </Text>
              </View>

              <View className="gap-2">
                <SquircleButton
                  color={ACCENT}
                  label={joining ? 'Wird beigetreten …' : 'Dabei sein'}
                  accessibilityLabel="Der spontanen Runde beitreten"
                  loading={joining}
                  disabled={joining}
                  onPress={onAccept}
                />
                {/* Quiet on purpose. Declining is a normal answer, not a failure,
                    and the starter is never told — so it gets no weight, no
                    colour and no confirmation step. */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Jetzt nicht beitreten"
                  onPress={onDecline}
                  className="min-h-11 items-center justify-center rounded-2xl active:opacity-60"
                >
                  <Text
                    {...TEXT_CAPPED}
                    className="text-sm font-semibold"
                    style={{ color: colors.mutedForeground }}
                  >
                    Nicht jetzt
                  </Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
