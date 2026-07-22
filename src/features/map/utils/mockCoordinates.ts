import type { MockMapPosition } from '../types/map.types';

/**
 * Mock-only viewport positions for the abstract canvas.
 * When MapCanvas switches to react-native-maps, these become latitude/longitude
 * coordinates loaded from Firestore or a Places result.
 */
export const mockMapCenter: MockMapPosition = { x: 50, y: 48 };

export const mockMapBounds = {
  minX: 6,
  maxX: 84,
  minY: 16,
  maxY: 78,
};

export const berlinRegion = {
  latitude: 52.5208,
  longitude: 13.4095,
  latitudeDelta: 0.07,
  longitudeDelta: 0.055,
};

const latitudeSpan = 0.08;
const longitudeSpan = 0.065;

export function mockPositionToCoordinate(position: MockMapPosition) {
  const normalizedX = (position.x - 50) / 100;
  const normalizedY = (position.y - 50) / 100;

  return {
    latitude: berlinRegion.latitude - normalizedY * latitudeSpan,
    longitude: berlinRegion.longitude + normalizedX * longitudeSpan,
  };
}

/** Inverse of mockPositionToCoordinate — maps a real coordinate back to canvas {x,y}%. */
export function coordinateToMockPosition(coordinate: {
  latitude: number;
  longitude: number;
}): MockMapPosition {
  const x = 50 + ((coordinate.longitude - berlinRegion.longitude) / longitudeSpan) * 100;
  const y = 50 - ((coordinate.latitude - berlinRegion.latitude) / latitudeSpan) * 100;
  return {
    x: Math.max(5, Math.min(95, x)),
    y: Math.max(5, Math.min(95, y)),
  };
}
