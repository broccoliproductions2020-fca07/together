import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ACTIVITY_CATEGORIES } from '@/features/map/utils/activityCategories';

import type { ActivityCategory } from '../types';

const MODE_ACCENTS = {
  open: '#3B82F6',
  soon: '#E0A23E',
  now: '#41C08D',
};

export interface CategoryIconSlotProps {
  category?: ActivityCategory;
  accent: string;
  /** Fired only for a deliberate human choice, so it can be learned. */
  onPick: (category: ActivityCategory | null) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `inline` sits INSIDE the name field; `block` is the standalone tile. */
  variant?: 'block' | 'inline';
}

/**
 * The category as a single icon slot beside the title field, replacing the old
 * chip row.
 *
 * Rationale: the classifier answers this most of the time, so a full row of
 * chips asked a question that was usually already answered — seven visible
 * decisions where there were only four. The slot shows the answer instead:
 * empty while nothing matches, filled the moment the classifier is confident,
 * and tappable to override. One element, no row, no label.
 */
export function CategoryIconSlot({
  category,
  accent,
  onPick,
  open,
  onOpenChange,
  variant = 'block',
}: CategoryIconSlotProps) {
  const insets = useSafeAreaInsets();
  const meta = ACTIVITY_CATEGORIES.find((item) => item.value === category);
  const inline = variant === 'inline';
  const size = inline ? 38 : 58;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={meta ? `Kategorie ${meta.label}, ändern` : 'Kategorie wählen'}
        hitSlop={inline ? 8 : 0}
        style={{
          alignItems: 'center',
          // Inline it lives inside the name field's own border, so it carries a
          // fill but no second outline — two nested borders read as a control
          // that fell into another control.
          backgroundColor: meta ? `${accent}24` : 'rgba(255,255,255,0.07)',
          borderColor: meta ? accent : 'rgba(255,255,255,0.12)',
          borderRadius: inline ? 12 : 24,
          borderWidth: inline ? 0 : 1,
          height: size,
          justifyContent: 'center',
          width: size,
        }}
        onPress={() => onOpenChange(true)}
      >
        {meta ? (
          <Ionicons name={meta.icon} size={inline ? 19 : 25} color={accent} />
        ) : (
          // Empty state is a quiet placeholder, not a prompt: an unrecognised
          // title must never read as an error the person has to fix.
          <Ionicons
            name="ellipse-outline"
            size={inline ? 16 : 20}
            color="rgba(244,245,247,0.3)"
          />
        )}
      </Pressable>

      <Modal
        transparent
        animationType="slide"
        visible={open}
        onRequestClose={() => onOpenChange(false)}
        statusBarTranslucent
        navigationBarTranslucent
      >
        <Pressable className="flex-1 justify-end bg-black/55" onPress={() => onOpenChange(false)}>
          <Pressable
            className="max-h-[70%] rounded-t-[32px] border border-white/10 bg-[#0E1116] px-5 pt-3"
            style={{ paddingBottom: Math.max(insets.bottom, 16) + 8 }}
            onPress={(event) => event.stopPropagation()}
          >
            <View className="mb-4 h-1.5 w-12 self-center rounded-full bg-white/20" />
            <View className="flex-row items-start justify-between gap-3">
              <View className="flex-1">
                <Text className="text-xl font-extrabold tracking-[-0.4px] text-white">
                  Kategorie
                </Text>
                <Text className="mt-1 text-sm leading-5 text-white/55">
                  Bestimmt das Symbol auf der Karte.
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Schließen"
                className="h-11 w-11 items-center justify-center rounded-full bg-white/10"
                onPress={() => onOpenChange(false)}
              >
                <Ionicons name="close" size={21} color="#F4F5F7" />
              </Pressable>
            </View>

            <ScrollView
              className="mt-4"
              contentContainerStyle={{ paddingBottom: 8 }}
              showsVerticalScrollIndicator={false}
            >
              <View className="flex-row flex-wrap gap-2.5">
                {ACTIVITY_CATEGORIES.map((item) => {
                  const active = item.value === category;
                  return (
                    <Pressable
                      key={item.value}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={
                        active ? `${item.label} entfernen` : `Kategorie ${item.label} wählen`
                      }
                      className="min-w-[104px] flex-1 flex-row items-center gap-2 rounded-2xl border px-3 py-3 active:opacity-80"
                      style={{
                        backgroundColor: active ? `${accent}25` : 'rgba(255,255,255,0.04)',
                        borderColor: active ? accent : 'rgba(255,255,255,0.10)',
                      }}
                      onPress={() => {
                        // Tapping the active one clears it — a category is
                        // always optional.
                        onPick(active ? null : item.value);
                        onOpenChange(false);
                      }}
                    >
                      <Ionicons
                        name={item.icon}
                        size={19}
                        color={active ? accent : 'rgba(244,245,247,0.75)'}
                      />
                      <Text className="flex-1 text-sm font-bold text-white/90">{item.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

export { MODE_ACCENTS };
