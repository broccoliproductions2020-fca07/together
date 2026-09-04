import { Circle, Path, Svg } from 'react-native-svg';
import { StyleSheet, View } from 'react-native';

const PIN_WIDTH = 44;
const PIN_HEIGHT = 54;

export function PlacePreviewPin({ color }: { color: string }) {
  return (
    <View pointerEvents="none" style={styles.root}>
      <Svg height={PIN_HEIGHT} viewBox="0 0 44 54" width={PIN_WIDTH}>
        <Path
          d="M22 2C10.95 2 2 10.79 2 21.5 2 35.5 22 52 22 52s20-16.5 20-30.5C42 10.79 33.05 2 22 2Z"
          fill={color}
          stroke="rgba(255,255,255,0.9)"
          strokeWidth={2.5}
        />
        <Circle cx="22" cy="21" fill="rgba(244,245,247,0.88)" r="9" />
        <Circle cx="22" cy="21" fill="#0E1116" r="4" />
      </Svg>
    </View>
  );
}

export const PLACE_PREVIEW_PIN_HEIGHT = PIN_HEIGHT;

const styles = StyleSheet.create({
  root: {
    elevation: 4,
    height: PIN_HEIGHT,
    shadowColor: '#000',
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.28,
    shadowRadius: 4,
    width: PIN_WIDTH,
  },
});
