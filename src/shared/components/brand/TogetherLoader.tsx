import { StyleSheet, View } from 'react-native';

import { TOGETHER_BRAND } from './brandTokens';
import { TogetherMark } from './TogetherMark';

export type TogetherLoaderProps = {
  size?: number;
  tile?: boolean;
  accessibilityLabel?: string;
};

/** A moving highlight travels along Together's woven paths. */
export function TogetherLoader({
  size = 36,
  tile = false,
  accessibilityLabel = 'Wird geladen',
}: TogetherLoaderProps) {
  const markSize = tile ? size * 0.68 : size;

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="progressbar"
      style={[
        styles.container,
        tile
          ? {
              backgroundColor: TOGETHER_BRAND.inkRaised,
              borderColor: TOGETHER_BRAND.line,
              borderRadius: size * 0.24,
              borderWidth: 1,
              height: size,
              width: size,
            }
          : { height: size * 0.76, width: size },
      ]}
    >
      <TogetherMark accessibilityLabel="" animated={false} idle size={markSize} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
