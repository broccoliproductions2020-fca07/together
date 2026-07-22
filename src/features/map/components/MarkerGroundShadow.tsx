import Svg, { Circle, Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

/**
 * Soft radial "ground shadow" behind a marker circle. Native elevation/shadow*
 * is banned on markers (it breaks the Android bitmap snapshot bounds — see
 * markerCapture.tsx), but an SVG gradient is simply part of the captured
 * pixels, so it gives the floating circles depth without touching that bug.
 * Two layers: a soft ambient occlusion behind the bubble, plus a flattened
 * contact shadow lower down so the pin reads as grounded and floating rather
 * than pasted flat on the map. Both scale off cx/cy/r, so every caller size
 * (activity bubble, journey avatar) stays proportional.
 */
export function MarkerGroundShadow({
  width,
  height,
  cx,
  cy,
  r,
}: {
  width: number;
  height: number;
  cx: number;
  cy: number;
  r: number;
}) {
  return (
    <Svg pointerEvents="none" width={width} height={height} style={{ position: 'absolute' }}>
      <Defs>
        {/* objectBoundingBox units — one shared id works for every size. */}
        <RadialGradient id="marker-ground-shadow" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#14211C" stopOpacity={0.26} />
          <Stop offset="0.5" stopColor="#14211C" stopOpacity={0.15} />
          <Stop offset="1" stopColor="#14211C" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="marker-contact-shadow" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#14211C" stopOpacity={0.3} />
          <Stop offset="1" stopColor="#14211C" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={cx} cy={cy} r={r} fill="url(#marker-ground-shadow)" />
      {/* Flattened contact shadow just under the pin tail for a grounded float. */}
      <Ellipse
        cx={cx}
        cy={cy + r * 0.82}
        rx={r * 0.6}
        ry={r * 0.2}
        fill="url(#marker-contact-shadow)"
      />
    </Svg>
  );
}
