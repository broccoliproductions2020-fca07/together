import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { COLORS } from '../colors';

const TRUST_ITEMS = [
  { icon: 'lock-closed-outline' as const, label: 'Privat' },
  { icon: 'people-outline' as const, label: 'Nur Freunde' },
  { icon: 'eye-off-outline' as const, label: 'Kein Feed' },
];

export function TrustRow() {
  return (
    <View style={styles.trustRow}>
      {TRUST_ITEMS.map((item, index) => (
        <View key={item.label} style={styles.trustItem}>
          {index > 0 ? <View style={styles.trustDot} /> : null}
          <Ionicons name={item.icon} size={12} color={COLORS.quiet} />
          <Text style={styles.trustLabel}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  trustDot: {
    backgroundColor: COLORS.quiet,
    borderRadius: 2,
    height: 3,
    width: 3,
  },
  trustItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  trustLabel: {
    color: COLORS.quiet,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  trustRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
});
