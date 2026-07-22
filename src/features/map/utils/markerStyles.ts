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

export function colorWithAlpha(rgb: string, alpha: number) {
  return rgb.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
}
