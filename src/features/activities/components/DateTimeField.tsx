import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, Text, useColorScheme, View } from 'react-native';

import { formatDateTimeLabel } from '../utils/datetime';

export interface DateTimeFieldProps {
  label: string;
  value: Date;
  onChange: (date: Date) => void;
  minimumDate?: Date;
}

/**
 * Free, minute-level date + time input — behaves like a calendar entry.
 * iOS shows the native compact picker inline; Android opens the native date then
 * time dialogs. No fixed slots.
 */
export function DateTimeField({ label, value, onChange, minimumDate }: DateTimeFieldProps) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const [androidMode, setAndroidMode] = useState<'date' | 'time' | null>(null);

  const labelBlock = (
    <View className="flex-row items-center gap-3">
      <Text className="text-base font-bold text-white">{label}</Text>
    </View>
  );

  if (Platform.OS === 'ios') {
    return (
      <View
        className="min-h-14 flex-row items-center justify-between rounded-2xl border border-white/10 px-4 py-2"
        style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
      >
        {labelBlock}
        <DateTimePicker
          value={value}
          mode="datetime"
          display="compact"
          minimumDate={minimumDate}
          themeVariant={scheme}
          onChange={(_event, date) => {
            if (date) onChange(date);
          }}
        />
      </View>
    );
  }

  function handleAndroidChange(event: DateTimePickerEvent, selected?: Date) {
    if (event.type !== 'set' || !selected) {
      setAndroidMode(null);
      return;
    }

    if (androidMode === 'date') {
      const next = new Date(value);
      next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
      onChange(next);
      setAndroidMode('time');
      return;
    }

    const next = new Date(value);
    next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
    onChange(next);
    setAndroidMode(null);
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} einstellen`}
        className="min-h-14 flex-row items-center justify-between rounded-2xl border border-white/10 px-4 active:opacity-90"
        style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
        onPress={() => setAndroidMode('date')}
      >
        {labelBlock}
        <Text className="text-base font-semibold text-white/60">{formatDateTimeLabel(value)}</Text>
      </Pressable>
      {androidMode ? (
        <DateTimePicker
          value={value}
          mode={androidMode}
          is24Hour
          minimumDate={minimumDate}
          onChange={handleAndroidChange}
        />
      ) : null}
    </>
  );
}
