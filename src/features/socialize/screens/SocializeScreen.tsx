import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { DiscoverCardView } from '../components/DiscoverCardView';
import { MatchChatSheet } from '../components/MatchChatSheet';
import { SocializeSetupCard } from '../components/SocializeSetupCard';
import { SOCIALIZE_COLOR, useSocialize } from '../SocializeProvider';
import { useModeration } from '@/features/moderation';
import { TogetherLoader } from '@/shared/components';
import type { DiscoverCard } from '../types/socialize.types';

function ValueRow({
  icon,
  title,
  text,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  text: string;
}) {
  return (
    <View className="flex-row items-center gap-3">
      <View
        className="h-10 w-10 items-center justify-center rounded-full"
        style={{ backgroundColor: `${SOCIALIZE_COLOR}22` }}
      >
        <Ionicons name={icon} size={19} color={SOCIALIZE_COLOR} />
      </View>
      <View className="flex-1">
        <Text className="text-sm font-bold text-white">{title}</Text>
        <Text className="text-xs leading-4 text-white/55">{text}</Text>
      </View>
    </View>
  );
}

/** Smooth violet top wash — an SVG gradient, NOT a flat rectangle (a flat
 * rectangle leaves a visible hard edge where it ends). */
function TopWash() {
  return (
    <Svg
      pointerEvents="none"
      style={{ left: 0, position: 'absolute', right: 0, top: 0 }}
      height={340}
      width="100%"
    >
      <Defs>
        <LinearGradient id="socializeWash" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={SOCIALIZE_COLOR} stopOpacity={0.17} />
          <Stop offset="0.5" stopColor={SOCIALIZE_COLOR} stopOpacity={0.07} />
          <Stop offset="1" stopColor={SOCIALIZE_COLOR} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#socializeWash)" />
    </Svg>
  );
}

/** Softly pulsing glow ring around the hero icon (static under reduced motion). */
function HeroGlow() {
  const reducedMotion = useReducedMotion();
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) return;
    pulse.value = withRepeat(
      withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [pulse, reducedMotion]);

  const outerStyle = useAnimatedStyle(() => ({
    opacity: 0.25 + pulse.value * 0.35,
    transform: [{ scale: 1 + pulse.value * 0.08 }],
  }));

  return (
    <View className="items-center justify-center" style={{ height: 168 }}>
      <Animated.View
        pointerEvents="none"
        className="absolute rounded-full border-2"
        style={[{ borderColor: SOCIALIZE_COLOR, height: 150, width: 150 }, outerStyle]}
      />
      <View
        pointerEvents="none"
        className="absolute rounded-full"
        style={{ backgroundColor: `${SOCIALIZE_COLOR}14`, height: 120, width: 120 }}
      />
      <View
        className="h-20 w-20 items-center justify-center rounded-full"
        style={{ backgroundColor: `${SOCIALIZE_COLOR}33` }}
      >
        <Ionicons name="sparkles" size={34} color={SOCIALIZE_COLOR} />
      </View>
    </View>
  );
}

/**
 * Socialize — own fullscreen mode for meeting NEW people nearby. List-first
 * (no map, no exact positions); the map only appears later when a concrete
 * meetup place is proposed. Not visible → hero with a single 1-tap CTA;
 * visible → status card + discover feed. See AGENTS.md → Socialize.
 */
export function SocializeScreen({ active = true }: { active?: boolean }) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const { session, cards, discovering, cardStates, goVisible, showInterest, setScreenActive } =
    useSocialize();
  const { blockedUids } = useModeration();
  const [chatCard, setChatCard] = useState<DiscoverCard | null>(null);
  const [chatOpen, setChatOpen] = useState(false);

  const visible = session != null;
  const visibleCards = cards.filter((card) => !blockedUids.includes(card.id));

  useEffect(() => {
    setScreenActive(active);
    return () => setScreenActive(false);
  }, [active, setScreenActive]);

  return (
    <View className="flex-1" style={{ backgroundColor: '#0E1116' }}>
      {/* Violet top wash — the mode's own identity, like the composer washes */}
      <TopWash />

      {!visible ? (
        /* ---------- Hero: not visible ---------- */
        <View
          className="flex-1 justify-center px-6"
          style={{ paddingTop: insets.top, paddingBottom: insets.bottom + 88 }}
        >
          <HeroGlow />

          <Text className="mt-2 text-center text-3xl font-bold text-white">Socialize</Text>
          <Text className="mt-2 text-center text-base leading-6 text-white/60">
            Lerne spontan neue Leute in deiner Nähe kennen — ohne Profile-Scrollen, ohne Karte
            voller Fremder.
          </Text>

          <View className="mt-8 gap-4">
            <ValueRow
              icon="eye-off-outline"
              title="Privat bis zum Match"
              text={
                'Andere sehen nur „Person in deiner Nähe“ — dein Name erst nach gegenseitigem Interesse.'
              }
            />
            <ValueRow
              icon="location-outline"
              title="Nur grobe Entfernung"
              text="Nie dein genauer Standort. Die Karte kommt erst beim Treffpunkt ins Spiel."
            />
            <ValueRow
              icon="time-outline"
              title="Endet automatisch"
              text="Deine Sichtbarkeit läuft von selbst ab — nichts bleibt dauerhaft an."
            />
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Jetzt sichtbar werden"
            className="mt-9 min-h-[54px] flex-row items-center justify-center gap-2 rounded-2xl active:opacity-90"
            style={{ backgroundColor: SOCIALIZE_COLOR }}
            onPress={goVisible}
          >
            <Ionicons name="sparkles-outline" size={20} color="#0E1116" />
            <Text className="text-base font-bold text-[#0E1116]">Jetzt sichtbar werden</Text>
          </Pressable>
          <Text className="mt-2.5 text-center text-xs text-white/40">
            Standard: 5 km · 1 Stunde — danach jederzeit anpassbar
          </Text>
        </View>
      ) : (
        /* ---------- Active: visible + discover feed ---------- */
        <ScrollView
          className="flex-1"
          contentContainerStyle={{
            paddingTop: insets.top + 14,
            paddingHorizontal: 20,
            paddingBottom: insets.bottom + 96,
            gap: 14,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View>
            <View className="flex-row items-center gap-2">
              <Ionicons name="sparkles" size={20} color={SOCIALIZE_COLOR} />
              <Text className="text-2xl font-bold text-white">Socialize</Text>
            </View>
            <Text className="mt-0.5 text-sm text-white/50">
              Neue Leute in deiner Nähe kennenlernen
            </Text>
          </View>

          <SocializeSetupCard />

          <View className="mt-2 flex-row items-center gap-2">
            <Text className="text-xs font-bold uppercase tracking-wide text-white/40">
              In deiner Nähe
            </Text>
            <View
              className="rounded-full px-2 py-0.5"
              style={{ backgroundColor: `${SOCIALIZE_COLOR}26` }}
            >
              <Text className="text-[11px] font-bold" style={{ color: SOCIALIZE_COLOR }}>
                {visibleCards.length}
              </Text>
            </View>
          </View>

          {discovering && visibleCards.length === 0 ? (
            <View
              className="items-center rounded-3xl border border-white/10 px-6 py-10"
              style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
            >
              <TogetherLoader size={48} tile />
              <Text className="mt-5 text-center text-base font-bold text-white/85">
                Wir schauen, wer gerade offen ist
              </Text>
              <Text className="mt-1.5 text-center text-sm leading-5 text-white/45">
                Sichtbarkeit und Matches werden sicher abgeglichen.
              </Text>
            </View>
          ) : visibleCards.length === 0 ? (
            <View
              className="items-center gap-2 rounded-3xl border border-white/10 px-6 py-10"
              style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
            >
              <Ionicons name="sparkles-outline" size={26} color="rgba(244,245,247,0.4)" />
              <Text className="text-center text-base font-bold text-white/80">
                Gerade ist hier niemand sichtbar
              </Text>
              <Text className="text-center text-sm leading-5 text-white/50">
                Du bist die erste Person — bleib sichtbar, wir zeigen dir sofort, wenn jemand in
                deiner Nähe auftaucht.
              </Text>
            </View>
          ) : (
            visibleCards.map((card, index) => (
              <Animated.View
                key={card.id}
                entering={reducedMotion ? undefined : FadeInDown.delay(60 * index).duration(220)}
              >
                <DiscoverCardView
                  card={card}
                  state={cardStates[card.id] ?? 'idle'}
                  onInterest={() => showInterest(card.id)}
                  onOpenChat={() => {
                    setChatCard(card);
                    setChatOpen(true);
                  }}
                />
              </Animated.View>
            ))
          )}

          <View className="mt-1 flex-row items-center justify-center gap-1.5">
            <Ionicons name="shield-checkmark-outline" size={13} color="rgba(244,245,247,0.35)" />
            <Text className="text-[11px] text-white/35">
              Chat erst bei gegenseitigem Interesse · Blockieren & Melden jederzeit
            </Text>
          </View>
        </ScrollView>
      )}

      <MatchChatSheet card={chatCard} visible={chatOpen} onClose={() => setChatOpen(false)} />
    </View>
  );
}
