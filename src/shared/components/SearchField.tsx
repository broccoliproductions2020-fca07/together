import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { FONT, TYPE } from '@/shared/theme';

export interface SearchFieldProps extends Omit<TextInputProps, 'accessibilityLabel' | 'onChangeText' | 'style' | 'value'> {
  value: string;
  onChangeText: (value: string) => void;
  accessibilityLabel: string;
  clearAccessibilityLabel?: string;
  accessory?: ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  variant?: 'field' | 'pill';
}

/**
 * Shared dark search input chrome. It owns the controlled input and clear
 * action; result panels stay local because their meanings differ by feature.
 */
export function SearchField({
  value,
  onChangeText,
  accessibilityLabel,
  clearAccessibilityLabel = 'Suche löschen',
  accessory,
  containerStyle,
  inputStyle,
  variant = 'field',
  autoCapitalize = 'none',
  autoCorrect = false,
  maxLength = 120,
  placeholderTextColor = 'rgba(244,245,247,0.40)',
  returnKeyType = 'search',
  ...inputProps
}: SearchFieldProps) {
  return (
    <View style={[styles.root, variant === 'pill' ? styles.pill : styles.field, containerStyle]}>
      <Ionicons name="search" size={17} color="rgba(244,245,247,0.45)" />
      <TextInput
        accessibilityLabel={accessibilityLabel}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        maxLength={maxLength}
        placeholderTextColor={placeholderTextColor}
        returnKeyType={returnKeyType}
        style={[styles.input, inputStyle]}
        value={value}
        onChangeText={onChangeText}
        {...inputProps}
      />
      {accessory}
      {value ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={clearAccessibilityLabel}
          hitSlop={8}
          onPress={() => onChangeText('')}
          style={styles.clear}
        >
          <Ionicons name="close-circle" size={18} color="rgba(244,245,247,0.42)" />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  clear: { alignItems: 'center', justifyContent: 'center', minHeight: 32, minWidth: 24 },
  field: { borderRadius: 16 },
  input: {
    color: '#F4F5F7',
    flex: 1,
    fontFamily: FONT.medium,
    fontSize: TYPE.label.fontSize,
    minWidth: 0,
    paddingVertical: 0,
  },
  pill: { borderRadius: 999 },
  root: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.055)',
    borderColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    minHeight: 44,
    paddingHorizontal: 14,
  },
});
