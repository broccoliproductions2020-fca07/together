import type { ActivityMode } from '../types/map.types';

// Hex, never `rgb(...)`: these accents are widely composed as `${accent}22`,
// and React Native drops such a suffix silently on an rgb() string — the fill
// then draws fully opaque instead of translucent.
export const markerModeStyles: Record<
  ActivityMode,
  {
    label: string;
    ringClassName: string;
    dotClassName: string;
    softClassName: string;
    color: string;
  }
> = {
  open: {
    label: 'Open',
    ringClassName: 'border-open',
    dotClassName: 'bg-open',
    softClassName: 'bg-open/15',
    color: '#3B82F6',
  },
  soon: {
    label: 'Soon',
    ringClassName: 'border-soon',
    dotClassName: 'bg-soon',
    softClassName: 'bg-soon/15',
    color: '#E0A23E',
  },
  now: {
    label: 'Now',
    ringClassName: 'border-now',
    dotClassName: 'bg-now',
    softClassName: 'bg-now/15',
    color: '#41C08D',
  },
};

export function getModeLabel(mode?: ActivityMode) {
  return mode ? markerModeStyles[mode].label : 'Mixed';
}

export function colorWithAlpha(color: string, alpha: number) {
  const normalizedAlpha = Math.max(0, Math.min(1, alpha));
  if (/^rgb\(/i.test(color)) {
    return color.replace(/^rgb\(/i, 'rgba(').replace(/\)$/, `, ${normalizedAlpha})`);
  }

  const hex = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
  if (!hex) return color;
  const expanded = hex.length === 3 ? [...hex].map((digit) => `${digit}${digit}`).join('') : hex;
  const red = Number.parseInt(expanded.slice(0, 2), 16);
  const green = Number.parseInt(expanded.slice(2, 4), 16);
  const blue = Number.parseInt(expanded.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${normalizedAlpha})`;
}

/**
 * A darker face of the same colour, for the marker's base edge and fin. Depth
 * reads as the SAME material in shadow, so this multiplies the channels rather
 * than mixing toward a grey — mixing would drift the hue and the socle would
 * stop looking like the underside of the card above it.
 */
export function darkenColor(color: string, factor: number) {
  const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value * factor)));
  const rgb = color.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgb) {
    return `rgb(${clamp(Number(rgb[1]))}, ${clamp(Number(rgb[2]))}, ${clamp(Number(rgb[3]))})`;
  }
  const hex = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
  if (!hex) return color;
  const expanded = hex.length === 3 ? [...hex].map((digit) => `${digit}${digit}`).join('') : hex;
  return `rgb(${clamp(Number.parseInt(expanded.slice(0, 2), 16))}, ${clamp(
    Number.parseInt(expanded.slice(2, 4), 16),
  )}, ${clamp(Number.parseInt(expanded.slice(4, 6), 16))})`;
}
