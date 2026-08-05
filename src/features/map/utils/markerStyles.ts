import type { ActivityMode } from '../types/map.types';

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
    color: 'rgb(110,139,247)',
  },
  soon: {
    label: 'Soon',
    ringClassName: 'border-soon',
    dotClassName: 'bg-soon',
    softClassName: 'bg-soon/15',
    color: 'rgb(224,162,62)',
  },
  now: {
    label: 'Now',
    ringClassName: 'border-now',
    dotClassName: 'bg-now',
    softClassName: 'bg-now/15',
    color: 'rgb(65,192,141)',
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
