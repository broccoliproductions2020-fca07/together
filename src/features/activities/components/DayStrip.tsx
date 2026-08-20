import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';

import { FONT, TEXT_CAPPED, TYPE } from '@/shared/theme';

/** How far ahead the one-tap chips reach. Anything beyond goes through the
 * calendar button — the strip is a shortcut, never a ceiling. */
const QUICK_DAYS = 14;

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function sameDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

function chipLabel(day: Date, today: Date): { top: string; bottom: string } {
  const dayIndex = Math.round(
    (startOfDay(day).getTime() - startOfDay(today).getTime()) / 86_400_000,
  );
  if (dayIndex === 0) return { top: 'Heute', bottom: '' };
  if (dayIndex === 1) return { top: 'Morgen', bottom: '' };
  return {
    top: day.toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', ''),
    bottom: `${day.getDate()}.`,
  };
}

export interface DayStripProps {
  /** The currently selected start; only its date part matters here. */
  value: Date;
  /** Emits the same wall-clock time on the newly chosen day. */
  onChange: (date: Date) => void;
}

/**
 * The date half of the Soon scheduler. The TimeBand owns one day's worth of
 * hours, so the day itself has to be picked somewhere — and a two-week strip of
 * chips answers the realistic case ("Samstag") in one tap, where the old
 * datetime field needed a modal, a wheel and a confirm.
 *
 * The calendar button is not decoration: it preserves the arbitrary-date
 * capability the datetime field had. Dropping it would quietly turn "plan
 * anything" into "plan within a fortnight".
 */
/**
 * Selection is a STATE, not a mode.
 *
 * The chosen day used to be tinted in the activity's mode colour, which put it
 * in the same visual class as the span itself — one of nine accent surfaces on
 * the Wann bench, at which point the colour stopped meaning "mode". A brighter
 * neutral says "chosen" just as clearly and claims no meaning it does not have.
 */
const CHIP_SELECTED_BORDER = 'rgba(255,255,255,0.34)';
const CHIP_SELECTED_FILL = 'rgba(255,255,255,0.12)';
const CHIP_SELECTED_TEXT = '#F4F5F7';
const CHIP_IDLE_BORDER = 'rgba(255,255,255,0.12)';
const CHIP_IDLE_FILL = 'rgba(255,255,255,0.04)';
const CHIP_IDLE_TEXT = 'rgba(244,245,247,0.72)';

export function DayStrip({ value, onChange }: DayStripProps) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const [pickerOpen, setPickerOpen] = useState(false);
  const today = new Date();
  const days = Array.from({ length: QUICK_DAYS }, (_, index) => {
    const day = startOfDay(today);
    day.setDate(day.getDate() + index);
    return day;
  });
  const beyondStrip = !days.some((day) => sameDay(day, value));

  /** Keep the time of day; only move the date. Re-picking the day must never
   * silently reset an end time the user already dialled in. */
  function applyDate(next: Date) {
    const merged = new Date(value);
    merged.setFullYear(next.getFullYear(), next.getMonth(), next.getDate());
    onChange(merged);
  }

  return (
    <View className="flex-row items-center gap-2">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 6, paddingRight: 4 }}
      >
        {days.map((day) => {
          const active = sameDay(day, value);
          const label = chipLabel(day, today);
          return (
            <Pressable
              key={day.getTime()}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={day.toLocaleDateString('de-DE', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
              onPress={() => applyDate(day)}
              className="min-w-11 items-center justify-center rounded-2xl border px-3 py-1.5 active:opacity-80"
              style={{
                borderColor: active ? CHIP_SELECTED_BORDER : CHIP_IDLE_BORDER,
                backgroundColor: active ? CHIP_SELECTED_FILL : CHIP_IDLE_FILL,
              }}
            >
              <Text
                style={[styles.chipTop, { color: active ? CHIP_SELECTED_TEXT : CHIP_IDLE_TEXT }]}
                {...TEXT_CAPPED}
              >
                {label.top}
              </Text>
              {label.bottom ? (
                <Text style={styles.chipBottom} {...TEXT_CAPPED}>
                  {label.bottom}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Anderes Datum wählen"
        onPress={() => setPickerOpen(true)}
        className="h-10 w-10 items-center justify-center rounded-2xl border active:opacity-80"
        style={{
          borderColor: beyondStrip ? CHIP_SELECTED_BORDER : CHIP_IDLE_BORDER,
          backgroundColor: beyondStrip ? CHIP_SELECTED_FILL : CHIP_IDLE_FILL,
        }}
      >
        <Ionicons
          name="calendar-outline"
          size={17}
          color={beyondStrip ? CHIP_SELECTED_TEXT : CHIP_IDLE_TEXT}
        />
      </Pressable>

      {pickerOpen ? (
        <DateTimePicker
          value={value}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          minimumDate={startOfDay(today)}
          themeVariant={scheme}
          onChange={(event, date) => {
            setPickerOpen(false);
            if (event.type === 'set' && date) applyDate(date);
          }}
        />
      ) : null}
    </View>
  );
}

/** The app ships STATIC Schibsted files, so a Tailwind weight class without a
 * `fontFamily` silently rendered these chips in the system font — next to a
 * sheet that is Schibsted throughout. Weight comes from the family, never from
 * `fontWeight`. */
const styles = StyleSheet.create({
  chipBottom: {
    color: 'rgba(244,245,247,0.42)',
    fontFamily: FONT.medium,
    fontSize: TYPE.micro.fontSize,
  },
  chipTop: { fontFamily: FONT.bold, fontSize: TYPE.caption.fontSize },
});
