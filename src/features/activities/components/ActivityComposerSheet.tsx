import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
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

import { useKeyboardPadding } from '@/features/chat/utils/useKeyboardHeight';
import { useCircles } from '@/features/circles';
import { SquircleButton } from '@/shared/components/SquircleButton';

import { FieldDivider, FieldGroup, FieldRow } from './FieldGroup';

import type { ActivityCategory, ActivityDraft, ActivityMode, SelectedPlace } from '../types';
import {
  classifyActivityTitle,
  classifyActivityTitleHybrid,
  shouldAutoApplyCategory,
} from '../utils/activityUnderstanding';
import {
  forgetCategory,
  loadCategoryMemory,
  recallCategory,
  rememberCategory,
} from '../utils/categoryMemory';
import { validateActivityDraft } from '../utils/activityValidation';
import { applyModeDefaults, createInitialActivityDraft } from '../utils/modeDefaults';
import { ActivityModeSwitch } from './ActivityModeSwitch';
import { CategoryIconSlot } from './CategoryIconSlot';
import { GuestInvitesField } from './GuestInvitesField';
import { LocationPicker } from './LocationPicker';
import { NowFields } from './NowFields';
import { ParticipantLimitField } from './ParticipantLimitField';
import { SoonFields } from './SoonFields';
import { VisibilityPicker } from './VisibilityPicker';

/** Mirrors `contextLabel` in VisibilityPicker — the folded row has to say the
 * same thing the unfolded chips do, or folding it would hide information. */
function visibilitySummary(draft: ActivityDraft, circles: { id: string; name: string }[]): string {
  if (draft.visibility.kind === 'all_friends') return 'Alle Freunde';
  if (draft.visibility.kind === 'close_friends') return 'Enge Freunde';
  const groupId = draft.visibility.kind === 'group' ? draft.visibility.groupId : undefined;
  return circles.find((circle) => circle.id === groupId)?.name ?? 'Private Gruppe';
}

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
  onOpenMapPicker?: (
    mode: ActivityMode,
    onPick: (place: SelectedPlace) => void,
    options?: { focusCurrentLocation?: boolean; autoConfirm?: boolean; searchMode?: boolean },
  ) => void;
  onSubmit?: (draft: ActivityDraft) => void | Promise<void>;
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
  const [categorySheetOpen, setCategorySheetOpen] = useState(false);
  // Folded by default: the chip row is three lines tall, and most activities go
  // to "Alle Freunde" without anyone touching it. The row still SHOWS the value.
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const { circles } = useCircles();
  const [validationError, setValidationError] = useState<string | null>(null);
  // On publish the sheet vanishes instantly (no slide-down) so the map's
  // "Wurf & Pop" seed can take over from the button's exact position — a
  // sliding sheet would fight the marker morphing upward. Cancel/close still slide.
  const [instantClose, setInstantClose] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // A ref (not state) so a rapid double-tap can't slip a second submit() call
  // through before the disabled/opacity state has actually re-rendered.
  const submittingRef = useRef(false);
  const requestRevisionRef = useRef(0);
  const [draft, setDraft] = useState<ActivityDraft>(
    () => initialDraft ?? createInitialActivityDraft(initialMode, initialPlace, initialTitle),
  );

  // Hydrate the learned wording→category map once; recallCategory() is a
  // synchronous no-op until it resolves, so typing is never blocked on storage.
  useEffect(() => {
    void loadCategoryMemory();
  }, []);

  useEffect(() => {
    if (!visible) return;

    requestRevisionRef.current += 1;
    setExpanded(false);
    setCategoryManuallyChanged(Boolean(initialDraft?.category));
    setValidationError(null);
    setDraft(initialDraft ?? createInitialActivityDraft(initialMode, initialPlace, initialTitle));
    submittingRef.current = false;
    setSubmitting(false);
    setInstantClose(false);
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
  const footerKeyboardPadding = useKeyboardPadding(Math.max(insets.bottom, 12));

  function updateDraft(nextDraft: ActivityDraft) {
    setValidationError(null);
    setDraft(nextDraft);
  }

  function changeMode(mode: ActivityMode) {
    updateDraft(applyModeDefaults(draft, mode));
  }

  function changeTitle(title: string) {
    // Tier 0: what this person already taught us about this wording beats the
    // bundled knowledge base — it is an explicit past correction, not a guess.
    const learned = categoryManuallyChanged ? null : recallCategory(title);
    const categoryGuess = learned ? null : classifyActivityTitle(title);
    const autoCategory = categoryManuallyChanged
      ? draft.category
      : (learned ?? (shouldAutoApplyCategory(categoryGuess) ? categoryGuess.primary : undefined));

    updateDraft({ ...draft, title, category: autoCategory });
  }

  /** A category chosen by hand is a correction: remember it for this wording so
   * the same slang resolves instantly next time (on-device only). */
  function pickCategory(category: ActivityCategory | null) {
    setCategoryManuallyChanged(true);
    const title = draft.title?.trim() ?? '';
    if (title.length < 2) return;
    if (category) rememberCategory(title, category);
    else forgetCategory(title);
  }

  async function submit() {
    if (submittingRef.current) return;

    const error = validateActivityDraft(draft);
    if (error) {
      setValidationError(error);
      return;
    }

    // (a new activity with a real pin, motion allowed) — otherwise slide as usual.
    // A new activity owns the map immediately after this tap. Its optimistic
    // marker can launch before Firebase confirms the callable, so never leave
    // the composer in front of that animation. Edits still wait for their write
    // because they have no equivalent local visual to roll back to.
    setInstantClose(!editing);

    const requestRevision = ++requestRevisionRef.current;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      await onSubmit?.(draft);
    } catch (error) {
      if (requestRevision !== requestRevisionRef.current) return;
      const rawMessage = error instanceof Error ? error.message : '';
      const message = rawMessage.replace(/^\[[^\]]+\]\s*/, '').trim();
      setValidationError(
        message && message.length <= 240
          ? message
          : 'Die Änderungen konnten nicht gespeichert werden. Bitte versuche es erneut.',
      );
      setInstantClose(false);
    } finally {
      if (requestRevision !== requestRevisionRef.current) return;
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  function dismiss() {
    requestRevisionRef.current += 1;
    onClose();
  }

  return (
    <Modal
      animationType={instantClose ? 'none' : 'slide'}
      transparent
      visible={visible && !suspended}
      onRequestClose={dismiss}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        {/* Plain View, NOT a KeyboardAvoidingView. Padding the whole backdrop
            lifted the entire sheet by the keyboard height — a sheet that is
            already 82–92% tall then has nowhere to go and ends up floating in
            the middle of the screen with a gap underneath, detached from the
            bottom edge it is supposed to grow out of. The keyboard is handled
            INSIDE instead: the footer rides it, the ScrollView scrolls under
            it. Same reason the chat surfaces avoid KAV (useKeyboardHeight). */}
        <View className="flex-1 justify-end bg-black/20">
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
                <View pointerEvents="none" className="h-11 w-11" />
                <View pointerEvents={submitting ? 'none' : 'auto'} className="flex-1 items-center">
                  <Text className="text-center text-2xl font-bold text-white">
                    {editing ? 'Aktivität bearbeiten' : 'Aktivität erstellen'}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Composer schließen"
                  className="h-11 w-11 items-center justify-center rounded-full bg-white/10"
                  onPress={dismiss}
                >
                  <Ionicons name="close" size={22} color="#F4F5F7" />
                </Pressable>
              </View>

              <ActivityModeSwitch mode={draft.mode} onChange={changeMode} />
            </View>

            <ScrollView
              className="mt-4 flex-1"
              pointerEvents={submitting ? 'none' : 'auto'}
              keyboardShouldPersistTaps="handled"
              // The sheet no longer moves, so a focused field has to be able to
              // scroll clear of the keyboard on its own (iOS; ignored elsewhere).
              automaticallyAdjustKeyboardInsets
              contentContainerStyle={{
                paddingHorizontal: 20,
                paddingBottom: contentPaddingBottom,
                gap: 20,
              }}
            >
              <View className="gap-2">
                {/* No "Aktivitätsname" caption: the placeholder already says
                    what the field is, and a heading above every control was what
                    made six sections weigh exactly the same.
                    The category lives here as a single slot rather than its own
                    labelled chip row: the classifier answers it while you type,
                    so showing the ANSWER next to the field beats asking the
                    question again further down the form. */}
                <View className="flex-row items-center gap-2.5">
                  <TextInput
                    className="flex-1 rounded-3xl border border-white/10 px-4 py-4 text-lg font-semibold text-white"
                    style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
                    placeholder="Name eingeben"
                    placeholderTextColor="rgba(244,245,247,0.4)"
                    value={draft.title ?? ''}
                    onChangeText={changeTitle}
                    returnKeyType="next"
                    maxLength={60}
                  />
                  <CategoryIconSlot
                    category={draft.category}
                    accent={accent}
                    open={categorySheetOpen}
                    onOpenChange={setCategorySheetOpen}
                    onPick={(category) => {
                      updateDraft({ ...draft, category: category ?? undefined });
                      pickCategory(category);
                    }}
                  />
                </View>
              </View>

              {draft.mode === 'soon' ? <SoonFields draft={draft} onChange={updateDraft} /> : null}
              {draft.mode === 'now' ? <NowFields draft={draft} onChange={updateDraft} /> : null}

              {/* Everything that is not the name or the time lives in ONE card
                  with hairlines between the rows. Four separate boxes under four
                  identical bold captions read as a ladder in which nothing is
                  more important than anything else; a group reads as a group. */}
              <FieldGroup>
                <LocationPicker
                  variant="row"
                  draft={draft}
                  onChange={updateDraft}
                  onOpenMapPicker={onOpenMapPicker}
                />

                {/* Audience can't be changed via an edit (see updateActivityFromDraft) —
                    hide the picker rather than show a control that silently does nothing. */}
                {editing ? null : (
                  <>
                    <FieldDivider />
                    <FieldRow
                      label="Sichtbarkeit"
                      value={visibilityOpen ? undefined : visibilitySummary(draft, circles)}
                      accessibilityLabel="Sichtbarkeit ändern"
                      expandable
                      expanded={visibilityOpen}
                      onPress={() => setVisibilityOpen((current) => !current)}
                    >
                      {visibilityOpen ? (
                        <VisibilityPicker draft={draft} onChange={updateDraft} />
                      ) : null}
                    </FieldRow>
                  </>
                )}

                <FieldDivider />
                <ParticipantLimitField bare draft={draft} onChange={updateDraft} />
                <FieldDivider />
                <GuestInvitesField bare draft={draft} onChange={updateDraft} />
              </FieldGroup>
            </ScrollView>

            <Animated.View
              className="absolute bottom-0 left-0 right-0 border-t px-5 pt-3"
              style={footerStyle}
            >
              <View pointerEvents="none" style={styles.footerSurface} />
              {/* The CTA is the one thing that must never sit behind the
                  keyboard, so it — and only it — grows with it. */}
              <Animated.View style={footerKeyboardPadding}>
                {validationError ? (
                  <Text className="mb-2 text-sm font-semibold text-destructive">
                    {validationError}
                  </Text>
                ) : null}
                <SquircleButton
                  color={accent}
                  loading={submitting}
                  accessibilityLabel={editing ? 'Änderungen speichern' : 'Aktivität erstellen'}
                  label={
                    submitting
                      ? editing
                        ? 'Wird gespeichert …'
                        : 'Wird erstellt …'
                      : editing
                        ? 'Änderungen speichern'
                        : 'Aktivität erstellen'
                  }
                  onPress={() => void submit()}
                />
              </Animated.View>
            </Animated.View>
          </View>
        </View>
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
