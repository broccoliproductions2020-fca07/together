import DateTimePicker from '@react-native-community/datetimepicker';
import { Platform, useColorScheme } from 'react-native';

interface DayStripDatePickerProps {
  value: Date;
  minimumDate: Date;
  onChange: (date?: Date) => void;
}

export function DayStripDatePicker({ value, minimumDate, onChange }: DayStripDatePickerProps) {
  const themeVariant = useColorScheme() === 'dark' ? 'dark' : 'light';

  return (
    <DateTimePicker
      value={value}
      mode="date"
      display={Platform.OS === 'ios' ? 'inline' : 'default'}
      minimumDate={minimumDate}
      themeVariant={themeVariant}
      onChange={(event, date) => onChange(event.type === 'set' ? date : undefined)}
    />
  );
}
