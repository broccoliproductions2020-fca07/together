import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TogetherMark } from '@/shared/components';

const STORAGE_KEY = 'together:welcomeSeen:v2';

// Product-mode colors remain functional UI signals; the brand itself now has
// an independent woven-path mark.
const COLORS = {
  now: '#41C08D',
  soon: '#E0A23E',
  open: '#6E8BF7',
};

function ValueRow({
  icon,
  tint,
  title,
  text,
  delay,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  title: string;
  text: string;
  delay: number;
}) {
  const reducedMotion = useReducedMotion();
  return (
    <Animated.View
      className="flex-row items-center gap-3.5"
      entering={reducedMotion ? undefined : FadeInDown.delay(delay).duration(320)}
    >
      <View
        className="h-11 w-11 items-center justify-center rounded-2xl"
        style={{ backgroundColor: `${tint}22` }}
      >
        <Ionicons name={icon} size={20} color={tint} />
      </View>
      <View className="flex-1">
        <Text className="text-base font-bold text-white">{title}</Text>
        <Text className="text-[13px] leading-[18px] text-white/55">{text}</Text>
      </View>
    </Animated.View>
  );
}

/** The two open routes from the Together brand weave through one another. */
function BrandGlow() {
  return (
    <View className="items-center justify-center" style={{ height: 190 }}>
      <TogetherMark animated idle size={158} />
    </View>
  );
}

/**
 * One-time welcome hero shown after the first sign-in (persisted via
 * AsyncStorage). Explains the two current Together surfaces — map and calendar.
 * Never blocks returning users.
 */
export function WelcomeIntro() {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((seen) => {
        if (active && !seen) setVisible(true);
      })
      .catch(() => {
        // Storage unavailable — skip the intro rather than risk showing it forever.
      });
    return () => {
      active = false;
    };
  }, []);

  function dismiss() {
    setVisible(false);
    AsyncStorage.setItem(STORAGE_KEY, '1').catch(() => {});
  }

  if (!visible) return null;

  return (
    <Modal
      animationType="fade"
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      visible
      onRequestClose={dismiss}
    >
      <View
        className="flex-1 justify-center px-7"
        style={{
          backgroundColor: '#0E1116',
          paddingBottom: insets.bottom + 16,
          paddingTop: insets.top,
        }}
      >
        <BrandGlow />

        <Animated.View entering={reducedMotion ? undefined : FadeInDown.duration(320)}>
          <Text className="text-center text-3xl font-bold text-white">Willkommen bei Together</Text>
          <Text className="mt-2 text-center text-base leading-6 text-white/60">
            Deine Zeit, deine Leute — ganz ohne Feed.
          </Text>
        </Animated.View>

        <View className="mt-9 gap-5">
          <ValueRow
            icon="people-outline"
            tint={COLORS.open}
            title="Freunde"
            text="Together lebt von deinen Leuten — nur bestätigte Freunde sehen dich."
            delay={120}
          />
          <ValueRow
            icon="map-outline"
            tint={COLORS.now}
            title="Karte"
            text="Sieh, welche Freunde jetzt oder bald etwas vorhaben — und sei mit einem Tap dabei."
            delay={200}
          />
          <ValueRow
            icon="calendar-outline"
            tint={COLORS.soon}
            title="Kalender"
            text="Alle gemeinsamen Pläne in einer Agenda — von heute bis in ein paar Wochen."
            delay={280}
          />
        </View>

        <Animated.View
          className="mt-10"
          entering={reducedMotion ? undefined : FadeInDown.delay(360).duration(320)}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Zuerst Freunde hinzufügen"
            className="min-h-[54px] items-center justify-center rounded-2xl bg-white active:opacity-90"
            onPress={() => {
              dismiss();
              router.push('/friends');
            }}
          >
            <Text className="text-base font-bold text-[#0E1116]">Freunde hinzufügen</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Erst mal umsehen"
            className="mt-2 min-h-[44px] items-center justify-center rounded-2xl active:opacity-80"
            onPress={dismiss}
          >
            <Text className="text-sm font-semibold text-white/60">Erst mal umsehen</Text>
          </Pressable>
          <Text className="mt-3 text-center text-xs text-white/35">
            Privat · Nur deine Gruppen · Kein Feed
          </Text>
        </Animated.View>
      </View>
    </Modal>
  );
}
