import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  StyleSheet,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ActivityDraft, ActivityMode, SelectedPlace } from '../types';
import {
  classifyActivityTitle,
  classifyActivityTitleHybrid,
  shouldAutoApplyCategory,
} from '../utils/activityUnderstanding';
import { validateActivityDraft } from '../utils/activityValidation';
import { applyModeDefaults, createInitialActivityDraft } from '../utils/modeDefaults';
import { ActivityModeSwitch } from './ActivityModeSwitch';
import { LocationPicker } from './LocationPicker';
import { NowFields } from './NowFields';
import { ParticipantLimitField } from './ParticipantLimitField';
import { SoonFields } from './SoonFields';
import { VisibilityPicker } from './VisibilityPicker';

const MODE_INDEX: Record<ActivityMode, number> = {
  now: 0,
  soon: 1,
  open: 2,
};

const MODE_ACCENTS = {
  open: '#6E8BF7',
  soon: '#E0A23E',
  now: '#41C08D',
};

const SHEET_WASH = ['rgba(65,192,141,0.16)', 'rgba(224,162,62,0.16)', 'rgba(110,139,247,0.18)'];

const SHEET_WASH_STRONG = [
  'rgba(65,192,141,0.24)',
  'rgba(224,162,62,0.24)',
  'rgba(110,139,247,0.28)',
];

const FOOTER_WASH = ['rgba(65,192,141,0.14)', 'rgba(224,162,62,0.14)', 'rgba(110,139,247,0.16)'];

const EASE = Easing.bezier(0.22, 1, 0.36, 1);

export interface ActivityComposerSheetProps {
  visible: boolean;
  suspended?: boolean;
  initialMode: ActivityMode;
  initialPlace?: SelectedPlace;
  /** Prefills the activity name (e.g. when created from a chat proposal). */
  initialTitle?: string;
  /** Full prefill for editing an existing activity; overrides initialMode/Place/Title. */
  initialDraft?: ActivityDraft;
  /** True while editing an existing activity rather than creating a new one. */
  editing?: boolean;
  onClose: () => void;
  onOpenMapPicker?: (mode: ActivityMode, onPick: (place: SelectedPlace) => void) => void;
  onSubmit?: (draft: ActivityDraft) => void;
}

export function ActivityComposerSheet({
  visible,
  suspended = false,
  initialMode,
  initialPlace,
  initialTitle,
  initialDraft,
  editing = false,
  onClose,
  onOpenMapPicker,
  onSubmit,
}: ActivityComposerSheetProps) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const modeProgress = useSharedValue(MODE_INDEX[initialMode]);
  const [expanded, setExpanded] = useState(false);
  const [categoryManuallyChanged, setCategoryManuallyChanged] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  // A ref (not state) so a rapid double-tap can't slip a second submit() call
  // through before the disabled/opacity state has actually re-rendered.
  const submittingRef = useRef(false);
  const [draft, setDraft] = useState<ActivityDraft>(
    () => initialDraft ?? createInitialActivityDraft(initialMode, initialPlace, initialTitle),
  );

  useEffect(() => {
    if (!visible) return;

    setExpanded(false);
    setCategoryManuallyChanged(Boolean(initialDraft?.category));
    setValidationError(null);
    setDraft(initialDraft ?? createInitialActivityDraft(initialMode, initialPlace, initialTitle));
    submittingRef.current = false;
  }, [initialMode, initialPlace, initialTitle, initialDraft, visible]);

  useEffect(() => {
    modeProgress.value = reducedMotion
      ? MODE_INDEX[draft.mode]
      : withTiming(MODE_INDEX[draft.mode], { duration: 320, easing: EASE });
  }, [draft.mode, modeProgress, reducedMotion]);

  // Tier-2 category refinement. changeTitle() already applied the instant lexical
  // guess; only when that left the category unresolved (slang) do we consult the
  // bundled embedding fallback — debounced so the model runs at most once per
  // settled title, never per keystroke, and never overriding a manual choice.
  useEffect(() => {
    if (categoryManuallyChanged) return;
    const title = draft.title?.trim() ?? '';
    if (title.length < 2 || draft.category) return;

    let cancelled = false;
    const handle = setTimeout(() => {
      void classifyActivityTitleHybrid(title).then((guess) => {
        if (cancelled || categoryManuallyChanged || !shouldAutoApplyCategory(guess)) return;
        setDraft((current) =>
          current.title?.trim() === title && !current.category
            ? { ...current, category: guess.primary }
            : current,
        );
      });
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [draft.title, draft.category, categoryManuallyChanged]);

  const sheetHeight = expanded ? '92%' : '82%';
  const accent = MODE_ACCENTS[draft.mode];

  const sheetWashStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(modeProgress.value, [0, 1, 2], SHEET_WASH),
  }));

  const sheetTopWashStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(modeProgress.value, [0, 1, 2], SHEET_WASH_STRONG),
  }));

  const footerStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(modeProgress.value, [0, 1, 2], FOOTER_WASH),
    borderTopColor: interpolateColor(modeProgress.value, [0, 1, 2], SHEET_WASH_STRONG),
  }));

  const contentPaddingBottom = useMemo(() => Math.max(insets.bottom, 12) + 96, [insets.bottom]);

  function updateDraft(nextDraft: ActivityDraft) {
    setValidationError(null);
    submittingRef.current = false;
    setDraft(nextDraft);
  }

  function changeMode(mode: ActivityMode) {
    updateDraft(applyModeDefaults(draft, mode));
  }

  function changeTitle(title: string) {
    const categoryGuess = classifyActivityTitle(title);
    const autoCategory = categoryManuallyChanged
      ? draft.category
      : shouldAutoApplyCategory(categoryGuess)
        ? categoryGuess.primary
        : undefined;

    updateDraft({ ...draft, title, category: autoCategory });
  }

  function submit() {
    if (submittingRef.current) return;

    const error = validateActivityDraft(draft);
    if (error) {
      setValidationError(error);
      return;
    }

    submittingRef.current = true;
    onSubmit?.(draft);
  }

  return (
    <Modal
      animationType="slide"
      transparent
      visible={visible && !suspended}
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          className="flex-1 justify-end bg-black/20"
        >
          <View
            className="overflow-hidden rounded-t-[30px] border border-white/10 shadow-xl"
            style={{ backgroundColor: '#0E1116', height: sheetHeight }}
          >
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, sheetWashStyle]} />
            <Animated.View pointerEvents="none" style={[styles.topWash, sheetTopWashStyle]} />
            <View pointerEvents="none" style={styles.innerSurface} />

            <View className="px-5 pt-3">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={expanded ? 'Composer verkleinern' : 'Composer erweitern'}
                className="mb-3 items-center"
                onPress={() => setExpanded((current) => !current)}
              >
                <View className="h-1.5 w-12 rounded-full bg-white/20" />
              </Pressable>

              <View className="mb-4 flex-row items-center">
                <View className="h-11 w-11" />
                <View className="flex-1 items-center">
                  <Text className="text-center text-2xl font-bold text-white">
                    {editing ? 'Aktivität bearbeiten' : 'Aktivität erstellen'}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Composer schließen"
                  className="h-11 w-11 items-center justify-center rounded-full bg-white/10"
                  onPress={onClose}
                >
                  <Ionicons name="close" size={22} color="#F4F5F7" />
                </Pressable>
              </View>

              <ActivityModeSwitch mode={draft.mode} onChange={changeMode} />
            </View>

            <ScrollView
              className="mt-4 flex-1"
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                paddingHorizontal: 20,
                paddingBottom: contentPaddingBottom,
                gap: 18,
              }}
            >
              <View className="gap-2">
                <Text className="text-sm font-bold text-white">Aktivitätsname</Text>
                <TextInput
                  className="rounded-3xl border border-white/10 px-4 py-4 text-lg font-semibold text-white"
                  style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
                  placeholder="Name eingeben"
                  placeholderTextColor="rgba(244,245,247,0.4)"
                  value={draft.title ?? ''}
                  onChangeText={changeTitle}
                  returnKeyType="next"
                  maxLength={60}
                />
              </View>

              {draft.mode === 'soon' ? <SoonFields draft={draft} onChange={updateDraft} /> : null}
              {draft.mode === 'now' ? <NowFields draft={draft} onChange={updateDraft} /> : null}

              <View className="gap-2">
                <Text className="text-sm font-bold text-white">Ort</Text>
                <LocationPicker
                  draft={draft}
                  onChange={updateDraft}
                  onOpenMapPicker={onOpenMapPicker}
                />
              </View>

              {/* Audience can't be changed via an edit (see updateActivityFromDraft) —
                hide the picker rather than show a control that silently does nothing. */}
              {editing ? null : (
                <View className="gap-2">
                  <Text className="text-sm font-bold text-white">Sichtbarkeit</Text>
                  <VisibilityPicker draft={draft} onChange={updateDraft} />
                </View>
              )}

              <View className="gap-2">
                <Text className="text-sm font-bold text-white">Teilnehmer</Text>
                <ParticipantLimitField draft={draft} onChange={updateDraft} />
              </View>
            </ScrollView>

            <Animated.View
              className="absolute bottom-0 left-0 right-0 border-t px-5 pt-3"
              style={footerStyle}
            >
              <View pointerEvents="none" style={styles.footerSurface} />
              <View style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
                {validationError ? (
                  <Text className="mb-2 text-sm font-semibold text-destructive">
                    {validationError}
                  </Text>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={editing ? 'Änderungen speichern' : 'Aktivität erstellen'}
                  className="min-h-[54px] items-center justify-center rounded-[18px] px-5 py-3.5 active:opacity-90"
                  style={{ backgroundColor: accent }}
                  onPress={submit}
                >
                  <Text className="text-base font-bold text-white">
                    {editing ? 'Änderungen speichern' : 'Aktivität erstellen'}
                  </Text>
                </Pressable>
              </View>
            </Animated.View>
          </View>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  footerSurface: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(14,17,22,0.88)',
  },
  innerSurface: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(14,17,22,0.88)',
  },
  topWash: {
    height: 180,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
});
