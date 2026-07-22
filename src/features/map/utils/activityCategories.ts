import type { Ionicons } from '@expo/vector-icons';

import type { ActivityCategory } from '../types/map.types';

export interface ActivityCategoryMeta {
  value: ActivityCategory;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

/**
 * Single source of truth for activity categories: the composer's icon chips
 * and the marker badges both render from this list, so the icon language never
 * drifts between the two.
 */
export const ACTIVITY_CATEGORIES: ActivityCategoryMeta[] = [
  { value: 'essen', label: 'Essen', icon: 'restaurant' },
  { value: 'drinks', label: 'Drinks', icon: 'beer' },
  { value: 'kaffee', label: 'Kaffee', icon: 'cafe' },
  { value: 'sport', label: 'Sport', icon: 'basketball' },
  { value: 'outdoor', label: 'Outdoor', icon: 'leaf' },
  { value: 'feiern', label: 'Feiern', icon: 'musical-notes' },
  { value: 'kultur', label: 'Kultur', icon: 'film' },
  { value: 'spiele', label: 'Spiele', icon: 'game-controller' },
  { value: 'lernen', label: 'Lernen', icon: 'book' },
  { value: 'chillen', label: 'Chillen', icon: 'bed' },
  { value: 'shopping', label: 'Shopping', icon: 'bag' },
  { value: 'sonstiges', label: 'Sonstiges', icon: 'ellipsis-horizontal' },
];

export function categoryMeta(category: ActivityCategory): ActivityCategoryMeta {
  return (
    ACTIVITY_CATEGORIES.find((meta) => meta.value === category) ??
    ACTIVITY_CATEGORIES[ACTIVITY_CATEGORIES.length - 1]
  );
}
