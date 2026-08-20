import { Image, StyleSheet, Text, View, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native';

import { FONT, TEXT_CAPPED } from '@/shared/theme';

/** Minimal identity data shared by people-facing controls across features. */
export interface PersonIdentity {
  displayName: string;
  initials: string;
  username?: string;
  avatarUrl?: string;
}

export interface PersonAvatarProps {
  initials: string;
  avatarUrl?: string;
  size?: number;
  backgroundColor?: string;
  initialsColor?: string;
  initialsFontSize?: number;
  borderColor?: string;
  borderWidth?: number;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
  /** Omit this for an avatar that is already described by its surrounding row. */
  accessibilityLabel?: string;
}

function initialsFontSizeFor(size: number): number {
  if (size <= 32) return 11;
  if (size <= 44) return 14;
  if (size <= 60) return 18;
  return 30;
}

/**
 * A visual identity only. Rows and profile surfaces own the spoken label, so
 * this stays decorative unless it is deliberately given one.
 */
export function PersonAvatar({
  initials,
  avatarUrl,
  size = 44,
  backgroundColor = 'rgba(255,255,255,0.10)',
  initialsColor = '#F4F5F7',
  initialsFontSize,
  borderColor,
  borderWidth = 0,
  style,
  imageStyle,
  accessibilityLabel,
}: PersonAvatarProps) {
  const radius = size / 2;

  return (
    <View
      accessible={Boolean(accessibilityLabel)}
      accessibilityLabel={accessibilityLabel}
      importantForAccessibility={accessibilityLabel ? 'yes' : 'no'}
      style={[
        styles.root,
        {
          backgroundColor,
          borderColor,
          borderRadius: radius,
          borderWidth,
          height: size,
          width: size,
        },
        style,
      ]}
    >
      {avatarUrl ? (
        <Image
          accessibilityIgnoresInvertColors
          source={{ uri: avatarUrl }}
          style={[styles.image, { borderRadius: Math.max(0, radius - borderWidth) }, imageStyle]}
        />
      ) : (
        <Text
          numberOfLines={1}
          {...TEXT_CAPPED}
          style={{
            color: initialsColor,
            fontFamily: FONT.bold,
            fontSize: initialsFontSize ?? initialsFontSizeFor(size),
          }}
        >
          {initials}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  image: { height: '100%', width: '100%' },
  root: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
