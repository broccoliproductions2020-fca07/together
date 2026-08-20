import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { FONT, TEXT_CAPPED, TEXT_FLEXIBLE, TYPE } from '@/shared/theme';

import { PersonAvatar, type PersonAvatarProps, type PersonIdentity } from './PersonAvatar';

export interface SelectablePersonRowProps {
  person: PersonIdentity;
  selected: boolean;
  accent: string;
  onPress: () => void;
  disabled?: boolean;
  /** Use when the default username line is not the useful context. */
  subtitle?: string;
  avatarProps?: Omit<PersonAvatarProps, 'accessibilityLabel' | 'avatarUrl' | 'initials'>;
  style?: StyleProp<ViewStyle>;
}

/**
 * The common, binary person choice used for explicit audiences. Deliberately
 * small: group controls, limits and server rules remain with their feature.
 */
export function SelectablePersonRow({
  person,
  selected,
  accent,
  onPress,
  disabled = false,
  subtitle,
  avatarProps,
  style,
}: SelectablePersonRowProps) {
  const detail = subtitle ?? (person.username ? `@${person.username}` : undefined);

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected, disabled }}
      accessibilityLabel={`${person.displayName} ${selected ? 'abwählen' : 'auswählen'}`}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && !disabled && styles.pressed, disabled && styles.disabled, style]}
    >
      <PersonAvatar
        avatarUrl={person.avatarUrl}
        initials={person.initials}
        {...avatarProps}
      />
      <View style={styles.copy}>
        <Text numberOfLines={1} style={styles.name} {...TEXT_FLEXIBLE}>
          {person.displayName}
        </Text>
        {detail ? (
          <Text numberOfLines={1} style={styles.subtitle} {...TEXT_CAPPED}>
            {detail}
          </Text>
        ) : null}
      </View>
      <View
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
        style={[
          styles.check,
          {
            backgroundColor: selected ? accent : 'transparent',
            borderColor: selected ? accent : 'rgba(255,255,255,0.22)',
          },
        ]}
      >
        {selected ? <Ionicons name="checkmark" size={15} color="#ffffff" /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  check: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  copy: { flex: 1, minWidth: 0 },
  disabled: { opacity: 0.42 },
  name: { color: '#F4F5F7', fontFamily: FONT.bold, fontSize: TYPE.label.fontSize },
  pressed: { backgroundColor: 'rgba(255,255,255,0.05)' },
  row: {
    alignItems: 'center',
    borderRadius: 16,
    flexDirection: 'row',
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  subtitle: { color: 'rgba(244,245,247,0.45)', fontFamily: FONT.medium, fontSize: TYPE.caption.fontSize, marginTop: 2 },
});
