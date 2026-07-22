import { MockMapCanvas, type MockMapCanvasProps } from './MockMapCanvas';

/**
 * Web build of MapCanvas. `react-native-maps` is native-only (its native
 * component imports break web bundling), so Metro must never pull it into the
 * web bundle — this platform file makes the mock canvas the web map, matching
 * the "web always runs the mock map" rule in AGENTS.md.
 */
export function MapCanvas(props: MockMapCanvasProps) {
  return <MockMapCanvas {...props} />;
}
