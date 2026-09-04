import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TEXT_CAPPED, TEXT_FLEXIBLE } from '../theme/textScaling';
import { TYPE } from '../theme/typography';

import type { ProductUiFonts } from './types';

export type AudienceSummaryTheme = {
  text: string;
  muted: string;
  accent: string;
  empty: string;
  emptySoft: string;
  accentSoft: string;
  fonts: ProductUiFonts;
};

export type AudienceSummaryProps = {
  label: string;
  detail?: string;
  empty?: boolean;
  leading: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityExpanded?: boolean;
  theme: AudienceSummaryTheme;
};

/** Collapsed activity-audience answer, shared by the composer and web previews. */
export function AudienceSummary({
  label,
  detail,
  empty = false,
  leading,
  trailing,
  onPress,
  accessibilityLabel,
  accessibilityExpanded,
  theme,
}: AudienceSummaryProps) {
  const content = (
    <>
      <View style={[styles.icon, { backgroundColor: empty ? theme.emptySoft : theme.accentSoft }]}>
        {leading}
      </View>
      <View style={styles.copy}>
        <Text
          {...TEXT_FLEXIBLE}
          numberOfLines={1}
          style={[TYPE.label, theme.fonts.semibold, { color: empty ? theme.empty : theme.text }]}
        >
          {label}
        </Text>
        {detail ? (
          <Text
            {...TEXT_CAPPED}
            numberOfLines={1}
            style={[TYPE.micro, theme.fonts.body, styles.detail, { color: theme.muted }]}
          >
            {detail}
          </Text>
        ) : null}
      </View>
      {trailing}
    </>
  );

  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={
        accessibilityExpanded === undefined ? undefined : { expanded: accessibilityExpanded }
      }
      // The audience changes underneath this line while checkboxes are tapped,
      // so the consequence has to be announced, not just re-rendered.
      accessibilityLiveRegion="polite"
      onPress={onPress}
      style={({ pressed }) => [styles.root, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  ) : (
    <View style={styles.root}>{content}</View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', flexDirection: 'row', gap: 10, minHeight: 48 },
  icon: { alignItems: 'center', borderRadius: 999, height: 32, justifyContent: 'center', width: 32 },
  copy: { flex: 1, minWidth: 0 },
  detail: { marginTop: 1 },
  pressed: { opacity: 0.7 },
});
