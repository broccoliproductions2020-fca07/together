import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeyboardPadding } from '@/features/chat/utils/useKeyboardHeight';
import { useOpenStatus } from '@/features/presence';
import { FONT, TEXT_CAPPED, TYPE } from '@/shared/theme';

import { CORE_ACCENT } from '../core/coreTargets';
import { FLOATING_SHEET_SURFACE } from './FloatingSheet';
import { FloatingSheetHeader } from './FloatingSheetHeader';
import { OpenStatusCard } from './OpenStatusCard';

export interface OpenStatusSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Opens the friends list, which this sheet deliberately does NOT contain. */
  onOpenNearby: () => void;
}

/**
 * Your own open status, and nothing else.
 *
 * The core's tap lands here: publishing already happened on the defaults, so
 * this surface exists purely to refine or end it — which is why the card opens
 * unfolded instead of showing a summary you would have to tap open first.
 *
 * It reuses `OpenStatusCard` whole rather than restating its fields. Vibe,
 * duration, "Nähe teilen", the location-permission hint and the separated
 * "Offen beenden" row all keep their existing behaviour and their existing
 * write path through `useOpenStatus`; nothing about the status is re-derived
 * here.
 *
 * It is explicitly NOT the friends list. The nearby friends, the radius slider,
 * spontaneous rounds and group openings live in the NearbySheet and stay one
 * labelled tap away — a personal status sheet must not quietly swallow them.
 */
export function OpenStatusSheet({ visible, onClose, onOpenNearby }: OpenStatusSheetProps) {
  const insets = useSafeAreaInsets();
  const { isOpen, syncing, syncError } = useOpenStatus();
  // The vibe field sits inside this sheet, so the whole card rides the keyboard
  // up. Lifting works here precisely because the sheet is content-sized — the
  // composer avoids it only because a 90%-tall sheet has nowhere left to go.
  const keyboardPadding = useKeyboardPadding();

  return (
    <Modal
      transparent
      animationType="slide"
      visible={visible}
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <Pressable className="flex-1 justify-end bg-black/50" onPress={onClose}>
        {/* The cap lives on this wrapper so the card inside gets a definite
            height to bound its ScrollView, and so the keyboard padding lifts
            the whole card rather than growing it. */}
        <Animated.View className="max-h-[86%]" style={keyboardPadding}>
          <Pressable
            className="overflow-hidden rounded-t-[34px] border border-white/10"
            style={{ backgroundColor: '#0B1016' }}
            onPress={(event) => event.stopPropagation()}
          >
            <View className="items-center pt-3">
              <View className="h-1 w-10 rounded-full bg-white/20" />
            </View>

            <FloatingSheetHeader
              icon="person-outline"
              accent={CORE_ACCENT.open}
              surface={FLOATING_SHEET_SURFACE}
              title="Dein Status"
              subtitle={
                syncing
                  ? isOpen
                    ? 'Dein Status wird veröffentlicht …'
                    : 'Dein Status wird beendet …'
                  : syncError
                    ? 'Die Änderung konnte nicht gespeichert werden'
                    : isOpen
                      ? 'Alles optional — du bist bereits offen'
                      : 'Du bist nicht mehr offen'
              }
              closeLabel="Status schließen"
              onClose={onClose}
            />

            <ScrollView
              className="px-5"
              contentContainerStyle={{ paddingBottom: insets.bottom + 20, paddingTop: 8 }}
              keyboardShouldPersistTaps="handled"
            >
              <OpenStatusCard visible={visible} defaultExpanded />

              {/* The friends list is a separate function and says so. Removing
                  the old open-presence pill took away its entry point; this row
                  is a signpost to it, not a copy of it. */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Freunde in deiner Nähe öffnen"
                className="mt-3 flex-row items-center gap-3 rounded-[20px] border border-white/10 bg-white/5 px-4 py-3.5 active:opacity-80"
                onPress={onOpenNearby}
              >
                <Ionicons name="people-outline" size={19} color="rgba(244,245,247,0.75)" />
                <Text {...TEXT_CAPPED} style={styles.rowLabel}>
                  Freunde in deiner Nähe
                </Text>
                <Ionicons name="chevron-forward" size={17} color="rgba(244,245,247,0.4)" />
              </Pressable>
            </ScrollView>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  rowLabel: {
    color: '#F2EFE9',
    flex: 1,
    fontFamily: FONT.semibold,
    fontSize: TYPE.label.fontSize,
    lineHeight: TYPE.label.lineHeight,
  },
});
