import { Pressable, Text, View } from 'react-native';

const ACCENT = '#6E8BF7';

export interface SuggestionChipsProps {
  options: string[];
  /** The currently selected/entered value, to highlight a matching chip. */
  value?: string;
  onSelect: (option: string) => void;
}

/**
 * Row of tappable suggestion chips. They only PREFILL a free-text field — the
 * value stays editable. Used for the free "Worauf hast du Lust?" input so there
 * are no rigid fixed categories, just a quick starting point.
 */
export function SuggestionChips({ options, value, onSelect }: SuggestionChipsProps) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {options.map((option) => {
        const active = value?.trim().toLowerCase() === option.toLowerCase();
        return (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(option)}
            className="rounded-full border px-3.5 py-1.5 active:opacity-80"
            style={{
              borderColor: active ? ACCENT : 'rgba(255,255,255,0.15)',
              backgroundColor: active ? `${ACCENT}22` : 'rgba(255,255,255,0.05)',
            }}
          >
            <Text
              className="text-sm font-semibold"
              style={{ color: active ? ACCENT : 'rgba(244,245,247,0.75)' }}
            >
              {option}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
