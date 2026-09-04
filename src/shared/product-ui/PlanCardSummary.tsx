import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TEXT_CAPPED, TEXT_FLEXIBLE } from '../theme/textScaling';
import { TYPE } from '../theme/typography';

import type { ProductUiFonts } from './types';

export type PlanCardSummaryTheme = {
  background: string;
  text: string;
  muted: string;
  accent: string;
  accentSoft: string;
  accentBorder: string;
  fonts: ProductUiFonts;
};

export interface PlanCardSummaryProps {
  time: string;
  endTime?: string;
  title: string;
  stateLabel: string;
  location?: string;
  people?: ReactNode;
  circleName?: string;
  locationIcon?: ReactNode;
  theme: PlanCardSummaryTheme;
  onPress?: () => void;
  accessibilityLabel?: string;
  animatePress?: boolean;
  /** Elevation is a native/web split, so the host supplies it. */
  elevation?: object;
  children?: ReactNode;
}

/** Shared collapsed plan surface. App-only actions live around this component. */
export function PlanCardSummary({
  time,
  endTime,
  title,
  stateLabel,
  location,
  people,
  circleName,
  locationIcon,
  theme,
  onPress,
  accessibilityLabel,
  animatePress = true,
  elevation,
  children,
}: PlanCardSummaryProps) {
  const surface = [
    styles.root,
    { backgroundColor: theme.background, borderColor: theme.accentBorder },
    elevation,
  ];

  const content = (
    <>
      <View style={styles.row}>
        <View style={styles.time}>
          <Text {...TEXT_FLEXIBLE} style={[TYPE.body, theme.fonts.bold, { color: theme.accent }]}>
            {time}
          </Text>
          {endTime ? (
            <Text {...TEXT_FLEXIBLE} style={[TYPE.caption, theme.fonts.body, { color: theme.muted }]}>
              {endTime}
            </Text>
          ) : null}
        </View>
        <View style={styles.body}>
          <View style={styles.titleRow}>
            <Text
              {...TEXT_FLEXIBLE}
              numberOfLines={1}
              style={[TYPE.body, theme.fonts.bold, styles.title, { color: theme.text }]}
            >
              {title}
            </Text>
            <View style={[styles.state, { backgroundColor: theme.accentSoft }]}>
              <Text
                {...TEXT_CAPPED}
                style={[TYPE.caption, theme.fonts.semibold, { color: theme.accent }]}
              >
                {stateLabel}
              </Text>
            </View>
          </View>
          {location ? (
            <View style={styles.locationRow}>
              {locationIcon ? <View>{locationIcon}</View> : null}
              <Text
                {...TEXT_FLEXIBLE}
                numberOfLines={1}
                style={[TYPE.label, theme.fonts.body, styles.location, { color: theme.muted }]}
              >
                {location}
              </Text>
            </View>
          ) : null}
          {people || circleName ? (
            <View style={styles.footer}>
              {people ? <View style={styles.people}>{people}</View> : <View />}
              {circleName ? (
                <Text
                  {...TEXT_FLEXIBLE}
                  style={[TYPE.caption, theme.fonts.semibold, { color: theme.muted }]}
                >
                  {circleName}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
      {children}
    </>
  );

  // See ActivityChatPreview: no handler means illustration, and an illustration
  // must not reach the web as a disabled button.
  if (!onPress) return <View style={surface}>{content}</View>;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? `Plan ${title}`}
      onPress={onPress}
      style={({ pressed }) => [...surface, pressed && animatePress ? styles.pressed : null]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { borderRadius: 26, borderWidth: 1, padding: 16 },
  pressed: { opacity: 0.95, transform: [{ scale: 0.985 }] },
  row: { flexDirection: 'row', gap: 12 },
  time: { paddingTop: 2, width: 56 },
  body: { flex: 1, gap: 8, minWidth: 0 },
  titleRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
  title: { flex: 1 },
  state: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  locationRow: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  location: { flex: 1 },
  footer: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingTop: 2 },
  people: { minWidth: 0 },
});
