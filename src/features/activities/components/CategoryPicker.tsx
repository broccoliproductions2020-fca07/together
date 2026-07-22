import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { ACTIVITY_CATEGORIES } from '@/features/map/utils/activityCategories';

import type { ActivityCategory } from '../types';

export interface CategoryPickerProps {
  value?: ActivityCategory;
  /** Current mode accent — selected chip background (never tailwind bg classes). */
  accent: string;
  onChange: (category?: ActivityCategory) => void;
}

/**
 * Optional activity category as icon chips (single-select, tap again to
 * deselect). Deliberately manual instead of Google-Places `types`: free, works
 * for POI-less spots, and describes the ACTIVITY, not the venue. The chosen
 * icon shows as a badge on the map marker.
 */
export function CategoryPicker({ value, accent, onChange }: CategoryPickerProps) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {ACTIVITY_CATEGORIES.map((category) => {
        const selected = category.value === value;
        return (
          <Pressable
            key={category.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`Kategorie ${category.label}`}
            className="flex-row items-center gap-1.5 rounded-full border px-3 py-2 active:opacity-80"
            style={{
              backgroundColor: selected ? accent : 'rgba(255,255,255,0.08)',
              borderColor: selected ? accent : 'rgba(255,255,255,0.1)',
            }}
            onPress={() => onChange(selected ? undefined : category.value)}
          >
            <Ionicons
              name={category.icon}
              size={15}
              color={selected ? '#0E1116' : 'rgba(244,245,247,0.75)'}
            />
            <Text
              className="text-sm font-semibold"
              style={{ color: selected ? '#0E1116' : '#F4F5F7' }}
            >
              {category.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
