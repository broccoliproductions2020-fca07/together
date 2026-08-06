import { Ionicons } from '@expo/vector-icons';
import { Pressable, Switch, Text, View } from 'react-native';

import { AnimatedToggleIcon } from '@/shared/components/AnimatedToggleIcon';

import type { ActivityDraft } from '../types';

const MODE_ACCENTS = {
  open: '#6E8BF7',
  soon: '#E0A23E',
  now: '#41C08D',
};

const MIN_LIMIT = 2;
const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 2;

export interface ParticipantLimitFieldProps {
  /** Drop the own card shell — the row lives inside a shared FieldGroup. */
  bare?: boolean;
  draft: ActivityDraft;
  onChange: (draft: ActivityDraft) => void;
}

/**
 * Progressive disclosure instead of a ghosted stepper: a "Teilnehmer begrenzen"
 * switch row (same idiom as the location toggle in OpenStatusCard); the −/+
 * stepper only unfolds while a limit is active. Off (default) = unlimited.
 */
export function ParticipantLimitField({
  draft,
  onChange,
  bare = false,
}: ParticipantLimitFieldProps) {
  const accent = MODE_ACCENTS[draft.mode];
  const limit = draft.maxPeople;
  const limited = limit != null;

  function setLimit(next?: number) {
    onChange({ ...draft, maxPeople: next });
  }

  function toggle(next: boolean) {
    setLimit(next ? DEFAULT_LIMIT : undefined);
  }

  function step(delta: number) {
    setLimit(Math.max(MIN_LIMIT, Math.min(MAX_LIMIT, (limit ?? DEFAULT_LIMIT) + delta)));
  }

  return (
    <View
      className={bare ? 'px-4 py-3' : 'rounded-2xl border border-white/10 px-4 py-3.5'}
      style={bare ? undefined : { backgroundColor: 'rgba(255,255,255,0.07)' }}
    >
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: limited }}
        accessibilityLabel="Teilnehmer begrenzen"
        className="flex-row items-center gap-3"
        onPress={() => toggle(!limited)}
      >
        <AnimatedToggleIcon
          icon="people"
          active={limited}
          size={17}
          activeColor={accent}
          inactiveColor="rgba(244,245,247,0.6)"
        />
        <View className="flex-1">
          <Text className="text-sm font-semibold text-white">Teilnehmer begrenzen</Text>
          <Text className="mt-0.5 text-xs text-white/50">
            {limited ? `Voll bei ${limit} Teilnehmern` : 'Unbegrenzt'}
          </Text>
        </View>
        <Switch
          value={limited}
          onValueChange={toggle}
          trackColor={{ false: 'rgba(255,255,255,0.15)', true: accent }}
          thumbColor="#ffffff"
        />
      </Pressable>

      {limited ? (
        <View className="mt-3 flex-row items-center justify-between border-t border-white/10 pt-3">
          <Text className="text-sm font-semibold text-white/70">Maximal</Text>
          <View
            className="flex-row items-center rounded-full border"
            style={{ backgroundColor: 'rgba(255,255,255,0.08)', borderColor: `${accent}88` }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Teilnehmerlimit verringern"
              className="h-10 w-10 items-center justify-center active:opacity-70"
              onPress={() => step(-1)}
            >
              <Ionicons
                name="remove"
                size={18}
                color={limit === MIN_LIMIT ? 'rgba(244,245,247,0.3)' : accent}
              />
            </Pressable>
            <Text className="min-w-[44px] text-center text-base font-bold text-white">{limit}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Teilnehmerlimit erhöhen"
              className="h-10 w-10 items-center justify-center active:opacity-70"
              onPress={() => step(1)}
            >
              <Ionicons
                name="add"
                size={18}
                color={limit === MAX_LIMIT ? 'rgba(244,245,247,0.3)' : accent}
              />
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}
