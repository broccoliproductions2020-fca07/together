import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { TEXT_CAPPED, TEXT_FLEXIBLE } from '../theme/textScaling';
import { TYPE } from '../theme/typography';

import type { ProductUiFonts } from './types';

export type TimeMatchingHighlightTheme = {
  background: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  accentSoft: string;
  fonts: ProductUiFonts;
};

export type TimeMatchingHighlightProps = {
  label: string;
  time: string;
  /**
   * How many of the people who ANSWERED can make this slot. Never the same
   * figure as `responses` — the two count different things, and showing one
   * number twice is exactly the mix-up the planning surfaces avoid
   * (AGENTS.md → Terminfindung).
   */
  availability: string;
  /** How many of the invited people answered at all. */
  responses: string;
  theme: TimeMatchingHighlightTheme;
  leading?: ReactNode;
};

/** The selected common time, shared by the native matching card and web previews. */
export function TimeMatchingHighlight({
  label,
  time,
  availability,
  responses,
  theme,
  leading,
}: TimeMatchingHighlightProps) {
  return (
    <View style={[styles.root, { backgroundColor: theme.background, borderColor: theme.border }]}>
      <Text {...TEXT_FLEXIBLE} style={[TYPE.caption, theme.fonts.body, { color: theme.muted }]}>
        {label}
      </Text>
      <Text {...TEXT_FLEXIBLE} style={[TYPE.body, theme.fonts.semibold, styles.time, { color: theme.text }]}>
        {time}
      </Text>
      <View style={styles.meta}>
        <View style={[styles.availability, { backgroundColor: theme.accentSoft }]}>
          {leading}
          <Text {...TEXT_CAPPED} style={[TYPE.caption, theme.fonts.semibold, { color: theme.text }]}>
            {availability}
          </Text>
        </View>
        <Text {...TEXT_FLEXIBLE} style={[TYPE.caption, theme.fonts.body, { color: theme.muted }]}>
          {responses}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { borderRadius: 16, borderWidth: 1, padding: 12 },
  time: { marginTop: 3 },
  meta: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  availability: {
    alignItems: 'center',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 6,
    minHeight: 32,
    paddingHorizontal: 10,
  },
});
