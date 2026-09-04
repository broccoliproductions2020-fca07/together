import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  Alert,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { useCircles } from '@/features/circles';
import { useFriends } from '@/features/friends';
import {
  FLOATING_SHEET_SURFACE,
  FloatingSheet,
} from '@/features/overlay/components/FloatingSheet';
import { FloatingSheetHeader } from '@/features/overlay/components/FloatingSheetHeader';
import {
  PlanningOfferFields,
  initialPlanningOfferGroups,
  offerGroupsToWindows,
} from '@/features/time-planning/components/PlanningOfferFields';
import type { TimePlanCreation } from '@/features/time-planning/services/timePlanningService.types';
import type { TimePlanOfferGroup } from '@/features/time-planning/types';
import { SquircleButton } from '@/shared/components/SquircleButton';
import { FONT, TEXT_FLEXIBLE, TYPE } from '@/shared/theme';
import { haptics } from '@/shared/utils/haptics';

import type { ActivityCategory, ActivityDraft, ActivityMode, SelectedPlace } from '../types';
import {
  classifyActivityTitle,
  classifyActivityTitleHybrid,
  shouldAutoApplyCategory,
} from '../utils/activityUnderstanding';
import { validateActivityDraft } from '../utils/activityValidation';
import {
  buildAudienceIndex,
  createAudienceState,
  selectionToVisibility,
  visibilityToSelection,
  type AudienceState,
} from '../utils/audienceSelection';
import {
  forgetCategory,
  loadCategoryMemory,
  recallCategory,
  rememberCategory,
} from '../utils/categoryMemory';
import { CURRENT_LOCATION_PLACE } from '../utils/currentPlace';
import { addMinutes, parseISO } from '../utils/datetime';
import { MODE_ACCENTS, MODE_ACCENT_INDEX } from '../utils/modeAccent';
import { createInitialActivityDraft, draftDurationMinutes } from '../utils/modeDefaults';
import { CategoryIconSlot } from './CategoryIconSlot';
import {
  ComposerTabs,
  type ComposerBench,
  type ComposerTab,
} from './ComposerTabs';
import { AudienceBench } from './benches/AudienceBench';
import { CapacityBench } from './benches/CapacityBench';
import { LocationBench } from './benches/LocationBench';
import { ScheduleBench } from './benches/ScheduleBench';

const SHEET_WASH = ['rgba(65,192,141,0.16)', 'rgba(224,162,62,0.16)'];
const SHEET_WASH_STRONG = ['rgba(65,192,141,0.24)', 'rgba(224,162,62,0.24)'];
const HEADER_ICON_WASH = ['rgba(65,192,141,0.15)', 'rgba(224,162,62,0.15)'];
const EASE = Easing.bezier(0.22, 1, 0.36, 1);
/** Mirrors the hard ceiling in firestore.rules (`participantUids.size() <= 50`
 * and `maxParticipants` 2–50). Shown so "unbegrenzt" stops being a lie. */
const SYSTEM_PARTICIPANT_CAP = 50;

/**
 * The guided walk — every setting gets its turn, in the order the sheet is
 * filled in.
 *
 * `title` is deliberately in the list although it is NOT a tab: it is the field
 * above the strip, so a step has to be able to send you to either kind of
 * target. The walk is what the CTA follows and what greys the tabs out; it is
 * never a gate, since `validateActivityDraft` stays the only authority on what
 * may be published.
 */
const GUIDE_STEPS = ['title', 'time', 'place', 'audience', 'capacity'] as const;
type GuideStep = (typeof GUIDE_STEPS)[number];
const LAST_GUIDE_STEP = GUIDE_STEPS.length - 1;
const GUIDE_LABEL: Record<GuideStep, string> = {
  audience: 'Wer',
  capacity: 'Anzahl',
  place: 'Wo',
  time: 'Wann',
  title: 'Name',
};

function clock(date: Date): string {
  return `${date.getHours().toString().padStart(2, '0')}:${date
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;
}

function dayPrefix(date: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const days = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (days <= 0) return '';
  if (days === 1) return 'Morgen ';
  if (days < 7) return `${date.toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', '')} `;
  return `${date.getDate()}.${date.getMonth() + 1}. `;
}

function durationLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} Min`;
  if (rest === 0) return `${hours} Std`;
  return `${hours} Std ${rest} Min`;
}

export interface ActivityComposerSheetProps {
  visible: boolean;
  suspended?: boolean;
  initialMode: ActivityMode;
  initialPlace?: SelectedPlace;
  /** Prefills the activity name (e.g. when created from a chat proposal). */
  initialTitle?: string;
  /** Full prefill for editing an existing activity; overrides the three above. */
  initialDraft?: ActivityDraft;
  editing?: boolean;
  onClose: () => void;
  onOpenMapPicker?: (
    mode: ActivityMode,
    onPick: (place: SelectedPlace) => void,
    options?: { focusCurrentLocation?: boolean; autoConfirm?: boolean; searchMode?: boolean },
  ) => void;
  onSubmit?: (draft: ActivityDraft) => void | Promise<void>;
  /** Creates the separate pre-activity time planning surface. */
  onStartTimePlan?: (draft: ActivityDraft, offers: TimePlanOfferGroup[]) => TimePlanCreation;
  onTimePlanCreated?: (creation: TimePlanCreation) => void;
  /**
   * The device position the map already knows.
   *
   * Two jobs: it biases place-search ranking towards nearby results, and it is
   * what "Aktueller Standort" actually resolves to. No new location request is
   * made for either — this is the position the map surface already holds.
   */
  searchCenter?: { latitude: number; longitude: number };
  /** The control the sheet morphs out of — the core button that opened it. */
  originRef?: RefObject<View | null>;
  /** Shared 0→1 morph value, so the origin can fade on the very same number. */
  morphProgress?: SharedValue<number>;
}

/**
 * Creating an activity: a name, a time, and three things you rarely change.
 *
 * It is a `FloatingSheet`, like the open-friends sheet: a narrow, even map
 * border on all four edges, no backdrop, and NOT a native Modal. Three fixed
 * zones — the header, one field carrying the name and its category, and a tab
 * strip fused to the open workbench. This replaced six stacked
 * sections of equal visual weight, in which a draft that was already valid
 * still looked like six open tasks.
 *
 * Three rules hold it together and are easy to break by accident:
 *
 * 1. At most one workbench is open at a time, and none while the name field has
 *    the keyboard — that is how the sheet stays short enough to sit above it.
 *    The TAB STRIP always stays mounted though: an earlier version unmounted it
 *    on focus, and losing most of the sheet on a tap reads as a crash, not as
 *    making room.
 * 2. The keyboard is compensated in exactly ONE place — `FloatingSheet`'s
 *    `avoidKeyboard`, which lifts the whole sheet (clamped there, so it can
 *    never ride above the safe area). Adding a second (a `KeyboardAvoidingView`,
 *    or the ScrollView's `automaticallyAdjustKeyboardInsets`) scrolls the
 *    content out of a viewport shorter than the inset, and the sheet goes black.
 * 3. "Jetzt" carries NO start time until publish. The draft holds a provisional
 *    stamp purely so the rail has something to draw; `resolveDraftForPublish`
 *    replaces it with the real moment in the provider. Never write a Jetzt
 *    draft's `startsAt` straight through — a two-minute composing session would
 *    publish an activity that already started.
 */
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
  onStartTimePlan,
  onTimePlanCreated,
  searchCenter,
  originRef,
  morphProgress,
}: ActivityComposerSheetProps) {
  const reducedMotion = useReducedMotion();
  const { circles } = useCircles();
  const { friends, closeFriendUids } = useFriends();

  const [draft, setDraft] = useState<ActivityDraft>(
    () => initialDraft ?? createInitialActivityDraft(initialMode, initialPlace, initialTitle),
  );
  /**
   * `null` = every tab closed.
   *
   * The sheet opens with the keyboard on the name field, and a workbench behind
   * that keyboard is a decision nobody is making yet. Note this is NOT the old
   * "hide the tabs on focus" bug: the strip stays mounted and only the panel has
   * no height, so nothing visibly disappears — it just has not opened yet.
   * Committing the name opens Wann.
   */
  const [openBench, setOpenBench] = useState<ComposerBench | null>(() =>
    initialDraft || initialTitle ? 'time' : null,
  );
  /**
   * The HIGH-WATER MARK of the walk — the furthest step it has reached.
   *
   * Deliberately NOT "where you are": that is `openBench`, and the two must be
   * separate. One number doing both jobs is what let the CTA describe a step
   * you had since navigated away from. This one only ever grows, so tapping
   * back to an earlier tab cannot un-decide the tabs you already passed.
   *
   * A prefilled or edited draft starts past the end: those values are already
   * facts, and walking someone through five steps to fix a typo would be the
   * wizard this deliberately is not.
   */
  const [maxStep, setMaxStep] = useState(() =>
    initialDraft || initialTitle ? GUIDE_STEPS.length : 0,
  );
  const [titleFocused, setTitleFocused] = useState(false);
  const [locationSearchFocused, setLocationSearchFocused] = useState(false);
  const [categoryManuallyChanged, setCategoryManuallyChanged] = useState(false);
  const [categorySheetOpen, setCategorySheetOpen] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /**
   * Proposing several windows instead of fixing one time.
   *
   * It used to be a second full-screen sheet stacked over this one, which meant
   * leaving the activity you were in the middle of creating to answer a question
   * about that same activity. It is a state of the Wann workbench now; the
   * name, place, audience and capacity you already set stay on screen and stay
   * editable, and the CTA switches to sending the proposals.
   */
  const [planning, setPlanning] = useState(false);
  const [planOffers, setPlanOffers] = useState<TimePlanOfferGroup[]>(() =>
    initialPlanningOfferGroups(),
  );

  // A ref, not state: a rapid double-tap must not slip a second submit through
  // before the disabled state has re-rendered.
  const submittingRef = useRef(false);
  const requestRevisionRef = useRef(0);
  const titleRef = useRef<TextInput>(null);
  /**
   * The workbench that was open when the name field took focus, so committing
   * the name puts the same one back rather than always jumping to Wann.
   */
  const benchBeforeTitleRef = useRef<ComposerBench | null>(null);
  const modeProgress = useSharedValue(MODE_ACCENT_INDEX[initialMode]);

  // ------------------------------------------------------------- audience
  const audienceIndex = useMemo(
    () => buildAudienceIndex(friends, circles, closeFriendUids),
    [friends, circles, closeFriendUids],
  );
  const initialVisibilityRef = useRef(draft.visibility);
  const audienceTouchedRef = useRef(false);
  const [audience, setAudience] = useState<AudienceState>(() =>
    createAudienceState(
      audienceIndex,
      visibilityToSelection(audienceIndex, draft.visibility, closeFriendUids),
    ),
  );

  /**
   * Friends and circles both arrive over listeners, so the index can change
   * AFTER the sheet is on screen. Rebuilding is not optional: a selection built
   * against an empty list would leave the default "everyone" meaning nobody, and
   * stale group counters would display numbers that are quietly wrong. Explicit
   * picks survive the rebuild; an untouched sheet re-derives its default.
   */
  useEffect(() => {
    setAudience((current) =>
      audienceTouchedRef.current
        ? createAudienceState(audienceIndex, current.selected)
        : createAudienceState(
            audienceIndex,
            visibilityToSelection(audienceIndex, initialVisibilityRef.current, closeFriendUids),
          ),
    );
  }, [audienceIndex, closeFriendUids]);

  const changeAudience = useCallback(
    (next: AudienceState) => {
      audienceTouchedRef.current = true;
      setAudience(next);
      setValidationError(null);
      setDraft((current) => ({
        ...current,
        visibility: selectionToVisibility(audienceIndex, next),
      }));
    },
    [audienceIndex],
  );

  // ---------------------------------------------------------------- lifecycle
  useEffect(() => {
    if (!visible) return;
    const next = initialDraft ?? createInitialActivityDraft(initialMode, initialPlace, initialTitle);
    requestRevisionRef.current += 1;
    setDraft(next);
    initialVisibilityRef.current = next.visibility;
    audienceTouchedRef.current = false;
    setCategoryManuallyChanged(Boolean(initialDraft?.category));
    setValidationError(null);
    // Matches the initial state exactly: a fresh sheet that will auto-focus the
    // name opens with every tab closed, a prefilled one opens on Wann.
    setOpenBench(initialDraft || initialTitle ? 'time' : null);
    benchBeforeTitleRef.current = null;
    setTitleFocused(false);
    setLocationSearchFocused(false);
    submittingRef.current = false;
    setSubmitting(false);
    setPlanning(false);
    setPlanOffers(initialPlanningOfferGroups());
  }, [initialMode, initialPlace, initialTitle, initialDraft, visible]);

  // Hydrate the learned wording→category map once; recallCategory is a
  // synchronous no-op until it resolves, so typing is never blocked on storage.
  useEffect(() => {
    void loadCategoryMemory();
  }, []);

  /**
   * Gives "Aktueller Standort" a real coordinate.
   *
   * The default place is a placeholder that deliberately carries none, and
   * `activityPlaceFromDraft` turns a place without coordinates into
   * `visibility: 'none'` — no map pin, no distance, not counted as nearby. So
   * the most common path of all (open the composer, change nothing, publish)
   * produced an activity that never appeared on the map, while the sheet said
   * "Aktueller Standort" the whole time.
   *
   * The position is taken from the map, which already has it, and is frozen
   * here: an activity happens at a fixed spot, so the coordinate should not
   * wander with the host afterwards.
   */
  useEffect(() => {
    if (!visible || editing || !searchCenter) return;
    setDraft((current) => {
      if (current.locationChoice !== 'current') return current;
      if (current.place?.latitude != null && current.place?.longitude != null) return current;
      return {
        ...current,
        place: {
          ...(current.place ?? CURRENT_LOCATION_PLACE),
          latitude: searchCenter.latitude,
          longitude: searchCenter.longitude,
        },
        locationPrecision: 'exact',
      };
    });
  }, [editing, searchCenter, visible]);

  /**
   * The name is the only thing that has to be typed, so the keyboard comes up
   * with the sheet. `autoFocus` alone is unreliable inside a Modal on Android —
   * it fires before the window has settled and is silently dropped — so the
   * focus is re-issued once the slide-in is over. Not for an edit or a prefill:
   * there the person came to change something specific, not to type a name.
   */
  useEffect(() => {
    if (!visible || suspended || editing || initialTitle) return;
    const handle = setTimeout(() => titleRef.current?.focus(), 260);
    return () => clearTimeout(handle);
  }, [editing, initialTitle, suspended, visible]);

  // The keyboard controller is app-wide: a chat or place-search keyboard must
  // never lift this footer while the composer has no focused input.
  useEffect(() => {
    if (!visible || suspended) {
      setTitleFocused(false);
      setLocationSearchFocused(false);
    }
  }, [suspended, visible]);

  useEffect(() => {
    modeProgress.value = reducedMotion
      ? MODE_ACCENT_INDEX[draft.mode]
      : withTiming(MODE_ACCENT_INDEX[draft.mode], { duration: 320, easing: EASE });
  }, [draft.mode, modeProgress, reducedMotion]);

  // Tier-2 category refinement, consulted only when the instant lexical guess
  // left the category unresolved — debounced so the model runs at most once per
  // settled title and never overrides a manual choice.
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

  // ------------------------------------------------------------------ derived
  const accent = MODE_ACCENTS[draft.mode];
  const isNow = draft.mode === 'now';
  // Memoised because `new Date()` would otherwise be a fresh object on every
  // render, which the tab list depends on — the tabs would rebuild continuously.
  const start = useMemo(
    () => (draft.startsAt ? parseISO(draft.startsAt) : new Date()),
    [draft.startsAt],
  );
  const minutes = draftDurationMinutes(draft);
  const end = useMemo(
    () => (draft.endsAt ? parseISO(draft.endsAt) : new Date(start.getTime() + minutes * 60_000)),
    [draft.endsAt, minutes, start],
  );


  const placeLabel =
    draft.locationChoice === 'open'
      ? 'Ohne Ort'
      : (draft.place?.name ?? 'Aktueller Standort');
  /**
   * A place counts as answered only once it carries a COORDINATE.
   *
   * The draft's default is `CURRENT_LOCATION_PLACE`, which is a label with no
   * position until the map hands one over — and an activity published in that
   * state gets `visibility: 'none'`, i.e. no pin, no distance, invisible on the
   * map. That is exactly the silent failure the required marker exists to
   * surface, so the test is the coordinate and never the label.
   */
  const placeIsSet =
    draft.locationChoice !== 'open' &&
    draft.place?.latitude != null &&
    draft.place?.longitude != null;

  /**
   * "∞" was a lie: `firestore.rules` caps `participantUids` at 50 and validates
   * `maxParticipants` to 2–50, so no activity can ever exceed it.
   *
   * The DATA still stays absent by default — writing 50 would turn a system
   * limit into a host decision, and every activity created today would stay
   * frozen at 50 if the cap were ever raised. The label only states the ceiling.
   */
  const capacityLabel = `Bis ${draft.maxPeople ?? SYSTEM_PARTICIPANT_CAP}`;

  const titleIsSet = Boolean((draft.title ?? '').trim());
  const missingRequired = [...(titleIsSet ? [] : ['Name']), ...(placeIsSet ? [] : ['Ort'])];

  /**
   * Everything an activity cannot exist without has an answer.
   *
   * Name and a place WITH COORDINATES, nothing else: the time always carries a
   * valid default, and Wer/Anzahl are optional by design — changing either must
   * never move this. It reports; it gates nothing, since `validateActivityDraft`
   * remains the single authority on what may be published.
   */
  const isReady = missingRequired.length === 0;

  /**
   * The guide, expressed as one button.
   *
   * It reads off TWO independent things, and keeping them apart is the whole
   * point: `maxStep` is how far the walk has got (it greys the tabs and only
   * grows), while the OPEN tab is where you actually are. An earlier version
   * used one number for both, so tapping back to a previous tab left the button
   * naming a step that was no longer on screen.
   *
   * Priority, in order:
   *   1. The step you are STANDING on is required and unanswered → repair it.
   *      It names the gap and puts you there, and does not move the walk on.
   *   2. The walk is not finished → advance to whatever follows the open tab.
   *      Wann, Wer and Anzahl always carry a valid default, so they can only
   *      ever advance.
   *   3. Otherwise it is the real CTA — unless something required is still
   *      missing anywhere, which is the safety net for jumping ahead by hand.
   *
   * The last step has no "Weiter": a confirming tap at the end of every
   * creation is friction this app cannot afford. It only ADVANCES; it never
   * publishes early, so the guide cannot become a second, softer gate that
   * disagrees with `validateActivityDraft`.
   */
  const walkDone = maxStep >= LAST_GUIDE_STEP;
  const cursorIndex = Math.max(0, GUIDE_STEPS.indexOf(openBench ?? 'title'));
  const cursorStep = GUIDE_STEPS[cursorIndex];
  const cursorBlocked =
    (cursorStep === 'title' && !titleIsSet) || (cursorStep === 'place' && !placeIsSet);
  const missingStep: GuideStep | null = !titleIsSet ? 'title' : !placeIsSet ? 'place' : null;
  const advanceIndex = !walkDone && cursorIndex < LAST_GUIDE_STEP ? cursorIndex + 1 : null;

  const repairFor = (step: GuideStep) => ({
    go: () => repairStep(step),
    label: step === 'title' ? 'Name eingeben' : 'Ort wählen',
  });

  const nextStep = cursorBlocked
    ? repairFor(cursorStep)
    : advanceIndex != null
      ? {
          go: () => advanceGuide(advanceIndex),
          label: `Weiter: ${GUIDE_LABEL[GUIDE_STEPS[advanceIndex]]}`,
        }
      : missingStep
        ? repairFor(missingStep)
        : null;
  /**
   * ONE form, always: how many people can see it.
   *
   * The audience is a SET OF PEOPLE — groups are only windows onto it, and they
   * combine freely — so no name describes the result. "Mädels und Uni, ohne
   * zwei" fits in no quarter-width tab, and every naming attempt breaks on the
   * first combination. Two earlier versions did break: "Nur du" for an account
   * without friends read as a verdict on your social life, and "Alle Freunde"
   * claimed a group that a multi-group selection is not. The count is the only
   * statement that is true in every state and fits in every one. The bench
   * spells out WHO; the tab answers HOW MANY.
   */
  const audienceLabel = `${audience.selected.size} gewählt`;

  /**
   * Silent while something is still missing.
   *
   * Naming the gap up here read as nagging on a sheet that had only just
   * opened, and it said a second time what the accordion already marks
   * precisely — on the row that can actually fix it, and where the CTA repeats
   * it at the moment it matters. The line keeps its height while empty (see
   * `styles.subtitle`), so the header does not move when the draft becomes
   * complete under the person's hands.
   */
  const subtitle = editing
    ? 'Wer es sehen darf, bleibt unverändert'
    : isReady
      ? 'Bereit zum Teilen'
      : '';

  const sheetWashStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(modeProgress.value, [0, 1], SHEET_WASH),
  }));
  const headerIconStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(modeProgress.value, [0, 1], HEADER_ICON_WASH),
  }));
  const topWashStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(modeProgress.value, [0, 1], SHEET_WASH_STRONG),
  }));

  /**
   * Required vs optional, and it is the honest split.
   *
   * Name, Zeit and Ort are what an activity IS — without them there is nothing
   * to show a friend. Wer and Anzahl both have defaults that are already the
   * right answer for almost every activity ("alle Freunde", the system cap), so
   * marking them the same way would invent four open tasks in front of a draft
   * that is ready to publish.
   */
  const tabs = useMemo<ComposerTab[]>(
    () => [
      {
        id: 'time',
        label: 'Wann',
        /**
         * The SPAN, and only the span — no "Heute"/"Morgen" prefix.
         *
         * The row answers "wann am Tag". The day is not lost: the bench's own
         * line spells it out ("Samstag · 18:00 – 21:00 · 3 Std"), the day strip
         * shows it selected, and the CTA names it ("Für Sa 18:00 eintragen").
         *
         * Jetzt stays a DURATION — its start is provisional until publish, so a
         * printed clock time would drift while the sheet is still open.
         */
        value:
          planOffers.length > 0
            ? `${planOffers.length} ${planOffers.length === 1 ? 'Vorschlag' : 'Vorschläge'}`
            : isNow
              ? `bis ${clock(addMinutes(new Date(), minutes))}`
              : `${clock(start)}–${clock(end)}`,
        /**
         * Weights sum to 4, so each one reads directly as "share of an equal
         * quarter". They are sized against the WIDEST value each tab can hold,
         * never against the value currently in it:
         *   Wann  1.05 — "12:45–14:45" is a fixed 11 characters and needs ~80.
         *   Wo    1.25 — the only unbounded value, so every spare point lands
         *                here; it ellipsizes regardless, just later.
         *   Wer   0.90 — "16 gewählt" is the longest audience phrase.
         *   Anzahl 0.80 — its VALUE is two characters, but "ANZAHL" is the
         *                longest label in the strip and sets the floor.
         */
        weight: 1.05,
        set: walkDone || GUIDE_STEPS.indexOf('time') < maxStep,
      },
      {
        id: 'place',
        label: 'Wo',
        value: placeIsSet ? placeLabel : 'Kein Pin',
        weight: 1.25,
        set: walkDone || GUIDE_STEPS.indexOf('place') < maxStep,
      },
      {
        id: 'audience',
        label: 'Wer',
        value: audienceLabel,
        weight: 0.9,
        set: walkDone || GUIDE_STEPS.indexOf('audience') < maxStep,
        disabled: false,
      },
      {
        id: 'capacity',
        label: 'Anzahl',
        value: capacityLabel,
        weight: 0.8,
        set: walkDone || GUIDE_STEPS.indexOf('capacity') < maxStep,
      },
    ],
    [
      audienceLabel,
      capacityLabel,
      end,
      planOffers.length,
      isNow,
      minutes,
      placeIsSet,
      placeLabel,
      start,
      maxStep,
      walkDone,
    ],
  );

  // ------------------------------------------------------------------ actions
  function updateDraft(nextDraft: ActivityDraft) {
    setValidationError(null);
    setDraft(nextDraft);
  }

  /**
   * The name field takes focus — fold the workbench away for the duration.
   *
   * The keyboard claims roughly half the screen, and a sheet carrying an open
   * workbench on top of that no longer fits above it: it was lifted straight
   * off the top edge, header and close button included. Folding the panel is
   * the honest way to make room, and it lands the sheet in exactly the state a
   * fresh composer opens in. Note this is NOT the old "hide the tabs on focus"
   * bug — the strip stays mounted, so nothing you were looking at disappears.
   */
  function focusTitle() {
    setLocationSearchFocused(false);
    setTitleFocused(true);
    benchBeforeTitleRef.current = openBench;
    setOpenBench(null);
  }

  /**
   * The name is committed — reopen the workbench.
   *
   * Called from blur and from the return key rather than on every keystroke: a
   * panel unfolding under a half-typed word is motion nobody asked for. Only
   * ever opens; it never closes a bench the person opened themselves.
   */
  function commitTitle() {
    setTitleFocused(false);
    const restored = benchBeforeTitleRef.current;
    benchBeforeTitleRef.current = null;
    setOpenBench((current) => current ?? restored ?? 'time');
  }

  function selectBench(bench: ComposerBench) {
    // A tap on a tab is its own decision about which bench to open, so the one
    // remembered for the blur must not overwrite it a moment later. Blur and
    // press arrive in a platform-dependent order, so neither may win by luck.
    benchBeforeTitleRef.current = null;
    // Unconditionally, never behind a "was a field focused?" check: tapping a
    // tab blurs the input first, so by the time this runs the focus flags have
    // already flipped to false and the guard would skip the dismiss. The order
    // of blur and press differs per platform, which makes any state guard here
    // a coin flip — and `Keyboard.dismiss()` is a no-op when nothing is open,
    // so there is nothing to guard against.
    Keyboard.dismiss();
    setTitleFocused(false);
    setLocationSearchFocused(false);
    if (bench !== openBench) haptics.selection();
    setOpenBench(bench);
  }

  /** `title` is a field, not a tab — the guide has to reach both. */
  function goToStep(step: GuideStep) {
    if (step === 'title') {
      setOpenBench(null);
      titleRef.current?.focus();
      return;
    }
    selectBench(step);
  }

  /**
   * A required step with no answer yet: name it and put the person on it — the
   * walk does NOT move on. Only when they are already standing on it does the
   * gap get spelled out, because at that point the tap produced no visible
   * movement and silence would read as a broken button.
   */
  function repairStep(step: GuideStep) {
    const alreadyThere = step === 'title' ? titleFocused : openBench === step;
    haptics.warning();
    if (alreadyThere) {
      setValidationError(
        step === 'title' ? 'Gib deiner Activity einen Namen.' : 'Wähle einen Ort für die Activity.',
      );
      return;
    }
    goToStep(step);
  }

  /** Never lowers the mark: walking forward again from an earlier tab must not
   * re-grey the tabs that were already passed. */
  function advanceGuide(index: number) {
    const next = GUIDE_STEPS[index];
    if (!next) return;
    setValidationError(null);
    haptics.selection();
    setMaxStep((current) => Math.max(current, index));
    goToStep(next);
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
      haptics.warning();
      setValidationError(error);
      // Send the person to the control that can fix it. An error under the CTA
      // is useless while the field it refers to is closed.
      if (error.includes('Person')) selectBench('audience');
      else if (error.includes('Ort')) selectBench('place');
      else if (error.includes('Dauer') || error.includes('Ende') || error.includes('Start')) {
        selectBench('time');
      }
      return;
    }

    const requestRevision = ++requestRevisionRef.current;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      await onSubmit?.(draft);
    } catch (submitError) {
      if (requestRevision !== requestRevisionRef.current) return;
      const rawMessage = submitError instanceof Error ? submitError.message : '';
      const message = rawMessage.replace(/^\[[^\]]+\]\s*/, '').trim();
      haptics.warning();
      setValidationError(
        message && message.length <= 240
          ? message
          : 'Die Änderungen konnten nicht gespeichert werden. Bitte versuche es erneut.',
      );
    } finally {
      if (requestRevision !== requestRevisionRef.current) return;
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  function submitTimePlan() {
    if (!onStartTimePlan) return;
    if (submittingRef.current) return;

    const planWindows = offerGroupsToWindows(planOffers);
    const validationDraft = planWindows[0]
      ? { ...draft, startsAt: planWindows[0].startsAt, endsAt: planWindows[0].endsAt }
      : draft;
    const error = validateActivityDraft(validationDraft);
    if (error) {
      haptics.warning();
      setValidationError(error);
      // Same routing as `submit`: the planner shares the sheet with the fields
      // it can fail on, and an error under the CTA is useless while the control
      // that fixes it is closed.
      if (error.includes('Person')) selectBench('audience');
      else if (error.includes('Ort')) selectBench('place');
      return;
    }
    if (!planWindows.length) {
      haptics.warning();
      setValidationError('Lege mindestens ein Zeitfenster fest.');
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    try {
      onTimePlanCreated?.(onStartTimePlan(draft, planOffers));
    } catch (planError) {
      const rawMessage = planError instanceof Error ? planError.message : '';
      const message = rawMessage.replace(/^\[[^\]]+\]\s*/, '').trim();
      setValidationError(
        message && message.length <= 240
          ? message
          : 'Die Zeitvorschläge konnten nicht gespeichert werden. Bitte versuche es erneut.',
      );
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  function dismiss() {
    requestRevisionRef.current += 1;
    submittingRef.current = false;
    benchBeforeTitleRef.current = null;
    setTitleFocused(false);
    setLocationSearchFocused(false);
    Keyboard.dismiss();
    setSubmitting(false);
    setPlanning(false);
    onClose();
  }

  const offerCount = planOffers.length;
  const offerNoun = offerCount === 1 ? 'Vorschlag' : 'Vorschläge';

  const ctaLabel = submitting
    ? editing
      ? 'Wird gespeichert …'
      : 'Wird erstellt …'
    : nextStep
      ? nextStep.label
      : editing
        ? 'Änderungen speichern'
        : offerCount > 0
          ? `${offerCount} ${offerNoun} senden`
          : isNow
            ? 'Jetzt loslegen'
            : `Für ${dayPrefix(start) || 'heute '}${clock(start)} eintragen`;

  /**
   * The planner is an EDITOR, not a destination — so it never sends anything.
   *
   * Its button used to be the same filled accent CTA, in the same place, as the
   * one that creates the activity. Two different outcomes wearing one button is
   * how someone taps "senden" believing they still have the capacity and
   * audience to set. So while the planner is open the footer switches to an
   * outlined button that only closes it, the sheet you return to is the one you
   * left, and the filled CTA below keeps its single meaning: this creates the
   * activity — with several proposed windows once the planner has produced any.
   */
  const runCta =
    planOffers.length > 0 && onStartTimePlan ? submitTimePlan : () => void submit();

  /**
   * Back to ONE fixed time — which means the windows go.
   *
   * "Fester Termin" used to leave the proposals in the draft, so the Wann bench
   * kept showing the count and the single band never came back: the control
   * promised the opposite of what it did, and the only way to a fixed time was
   * to delete every window by hand. Discarding is what the label means, so it
   * asks first whenever there is something to discard.
   */
  function backToFixedTime() {
    const drop = () => {
      setPlanOffers([]);
      setPlanning(false);
      setValidationError(null);
    };
    if (planOffers.length === 0) {
      setPlanning(false);
      return;
    }
    Alert.alert(
      'Feste Zeit wählen?',
      `Die ${planOffers.length} ${planOffers.length === 1 ? 'vorgeschlagene Zeit wird' : 'vorgeschlagenen Zeiten werden'} verworfen.`,
      [
        { style: 'cancel', text: 'Abbrechen' },
        { onPress: drop, style: 'destructive', text: 'Verwerfen' },
      ],
    );
  }

  function applyPlanning() {
    if (planOffers.length === 0) {
      haptics.warning();
      setValidationError('Lege mindestens ein Zeitfenster fest.');
      return;
    }
    setValidationError(null);
    haptics.selection();
    setPlanning(false);
  }


  return (
    <FloatingSheet
      visible={visible && !suspended}
      onRequestClose={dismiss}
      originRef={originRef}
      progress={morphProgress}
      originColor={`${accent}29`}
      originBorderColor={`${accent}b8`}
      // The one floating sheet with text fields in it, so the only one that has
      // to move: the name field takes focus the moment it opens.
      avoidKeyboard
      // The wash belongs to the SHEET, not to this column: handed to
      // FloatingSheet it also covers the grabber strip and the bottom inset,
      // which used to sit outside it as two black bands.
      surfaceLayer={
        <>
          <Animated.View style={[StyleSheet.absoluteFill, sheetWashStyle]} />
          <Animated.View style={[styles.topWash, topWashStyle]} />
          <View style={styles.innerSurface} />
        </>
      }
      accessibilityLabel="Activity erstellen"
    >
      {/* No `flex-1` anywhere down this column: FloatingSheet is as tall as its
          content, and a flex child would claim the ceiling on every open.
          `flexShrink` has to run unbroken from here to the ScrollView — one
          plain View in the chain and the column stops giving way at the
          sheet's ceiling, which clips the CTA instead of scrolling. */}
      <View style={styles.sheetBody}>
              {/* Fixed header: icon tile, title, a subtitle that names what is
                  still open, and the close control at the right edge — the same
                  header the open sheet uses. It stays put while the content
                  scrolls, so the way out never scrolls away under the keyboard.
                  The grabber above it belongs to FloatingSheet. */}
              <FloatingSheetHeader
                icon={isNow ? 'flash' : 'calendar-outline'}
                accent={accent}
                surface={FLOATING_SHEET_SURFACE}
                iconTileStyle={headerIconStyle}
                title={
                  editing ? 'Activity bearbeiten' : isNow ? 'Jetzt loslegen' : 'Activity planen'
                }
                subtitle={subtitle}
                closeLabel="Composer schließen"
                onClose={dismiss}
              />

              <ScrollView
                style={styles.scroll}
                pointerEvents={submitting ? 'none' : 'auto'}
                keyboardShouldPersistTaps="handled"
                // NOT automaticallyAdjustKeyboardInsets: the sheet itself already
                // rides the keyboard, so a second inset here made iOS scroll the
                // content clear out of a viewport shorter than the inset — the
                // sheet went black with the keyboard up. One compensation only.
                showsVerticalScrollIndicator={false}
                // No bottom padding for a floating CTA any more: the footer is
                // a real sibling below this, so the content simply ends.
                contentContainerStyle={styles.content}
              >
                {/* Name and category share ONE field: the category is the answer
                    to what you just typed, so it belongs beside the words rather
                    than in a tile of its own competing with them. */}
                <View
                  style={[
                    styles.nameField,
                    titleFocused && { borderColor: `${accent}99`, backgroundColor: `${accent}10` },
                  ]}
                >
                  <TextInput
                    ref={titleRef}
                    style={styles.titleInput}
                    placeholder="Name der Aktivität"
                    placeholderTextColor="rgba(244,245,247,0.38)"
                    value={draft.title ?? ''}
                    onChangeText={changeTitle}
                    onFocus={focusTitle}
                    onBlur={commitTitle}
                    returnKeyType="done"
                    onSubmitEditing={() => {
                      Keyboard.dismiss();
                      commitTitle();
                    }}
                    autoFocus={!editing && !initialTitle}
                    maxLength={60}
                    accessibilityLabel="Name der Activity"
                  />
                  <CategoryIconSlot
                    variant="inline"
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

                {/* Always mounted. Hiding it while the name field had focus was
                    a deliberate choice and a bad one: tapping the field wiped
                    most of the sheet, which reads as a crash rather than as
                    making room. The sheet scrolls instead — the focused field
                    sits at the top, so it stays visible either way. */}
                {/* One strip, one panel: only the ACTIVE bench is mounted,
                    which is what makes four settings cost 56 px of height
                    instead of four rows of 52. */}
                <ComposerTabs
                  tabs={tabs}
                  active={openBench}
                  accent={accent}
                  onSelect={selectBench}
                >
                  {openBench === 'time' ? (
                    <ScheduleBench
                      draft={draft}
                      accent={accent}
                      editing={editing}
                      accentProgress={modeProgress}
                      onChange={updateDraft}
                      planning={planning}
                      offerCount={planOffers.length}
                      onPlanningChange={onStartTimePlan ? setPlanning : undefined}
                      onFixedTime={onStartTimePlan ? backToFixedTime : undefined}
                      planner={
                        <PlanningOfferFields
                          groups={planOffers}
                          onChange={(nextGroups) => {
                            setValidationError(null);
                            setPlanOffers(nextGroups);
                          }}
                          onExit={backToFixedTime}
                        />
                      }
                    />
                  ) : null}

                  {openBench === 'place' ? (
                    <LocationBench
                      draft={draft}
                      accent={accent}
                      onChange={updateDraft}
                      onOpenMapPicker={onOpenMapPicker}
                      onSearchFocusChange={setLocationSearchFocused}
                      searchCenter={searchCenter}
                    />
                  ) : null}

                  {/* The same picker when editing. It used to be a locked panel
                      explaining that the audience was fixed — which answered a
                      question nobody had asked (it talked about typos) and
                      refused the one thing the person had opened the tab to do.
                      Changing it is a real edit now: the server re-resolves the
                      context against the host's friendships and keeps everyone
                      who already joined, so widening and narrowing are both
                      safe. */}
                  {openBench === 'audience' ? (
                    <AudienceBench
                      index={audienceIndex}
                      state={audience}
                      accent={accent}
                      onChange={changeAudience}
                    />
                  ) : null}

                  {openBench === 'capacity' ? (
                    <CapacityBench draft={draft} accent={accent} onChange={updateDraft} />
                  ) : null}
                </ComposerTabs>
              </ScrollView>

              {/* In FLOW, not absolute. The sheet is content-sized now, so an
                  absolutely-positioned footer would have no height to anchor to
                  and would overlap the last workbench row. The ScrollView above
                  carries `flexShrink: 1`, which is what makes it — and not the
                  footer — give way once the column hits the sheet's ceiling. */}
              <View style={styles.footer}>
                {validationError ? (
                  <Text style={styles.error} {...TEXT_FLEXIBLE}>
                    {validationError}
                  </Text>
                ) : null}
                {planning ? (
                  /* Outlined, and it says what it does: it takes the windows
                     back into the sheet. Nothing is sent from here. */
                  <SquircleButton
                    variant="outline"
                    surface={FLOATING_SHEET_SURFACE}
                    color={accent}
                    icon="checkmark"
                    accessibilityLabel="Zeitfenster übernehmen und zurück"
                    label={
                      offerCount === 0
                        ? 'Zeitfenster festlegen'
                        : `${offerCount} ${offerNoun} übernehmen`
                    }
                    onPress={applyPlanning}
                  />
                ) : (
                  <SquircleButton
                    color={accent}
                    loading={submitting}
                    accessibilityLabel={
                      nextStep
                        ? nextStep.label
                        : editing
                          ? 'Änderungen speichern'
                          : offerCount > 0
                            ? 'Zeitvorschläge senden'
                            : 'Activity erstellen'
                    }
                    label={ctaLabel}
                    onPress={nextStep ? nextStep.go : runCta}
                  />
                )}
              </View>
      </View>
    </FloatingSheet>
  );
}

const styles = StyleSheet.create({
  close: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 999,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  content: { gap: 12, paddingHorizontal: 20, paddingTop: 8 },
  nameField: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 54,
    paddingLeft: 14,
    paddingRight: 8,
  },
  error: {
    color: '#E8756B',
    fontFamily: FONT.semibold,
    fontSize: TYPE.caption.fontSize,
    marginBottom: 8,
  },
  footer: { paddingBottom: 4, paddingHorizontal: 20, paddingTop: 12 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    paddingBottom: 8,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  headerIcon: {
    alignItems: 'center',
    borderRadius: 17,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  headerText: { flex: 1, minWidth: 0 },
  innerSurface: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(11,16,22,0.9)' },
  pressed: { opacity: 0.72 },
  /**
   * Sized by its content, capped by the sheet — NOT `flex: 1`.
   *
   * The sheet deliberately has no fixed height so it can hug whatever workbench
   * is open. Its parent is therefore content-sized, and a `flex: 1` child of a
   * content-sized parent has nothing to flex into: it collapses to zero, which
   * left the sheet as a bare 20px handle at the bottom of the screen with the
   * keyboard up and nothing visible above it.
   */
  /** `flexShrink: 1` is what lets the sheet be shorter than its content: the
   * column is content-sized and FloatingSheet caps it, so this is the child
   * that has to give way and scroll. Never `flex: 1` — that claims the ceiling
   * on every open and the sheet stops hugging short workbenches. */
  scroll: { flexGrow: 0, flexShrink: 1 },
  /** Surface, radius, border, grabber AND the mode wash all belong to
   * FloatingSheet now (the wash goes in via `surfaceLayer`). This is only the
   * column, and it must shrink so the ScrollView inside it can. */
  sheetBody: { flexShrink: 1 },
  subtitle: {
    color: 'rgba(244,245,247,0.45)',
    fontFamily: FONT.medium,
    fontSize: TYPE.caption.fontSize,
    lineHeight: TYPE.caption.lineHeight,
    marginTop: 2,
    /** Held even while the line is empty, so the header keeps its height when
     * the draft flips to complete under the person's hands. */
    minHeight: TYPE.caption.lineHeight,
  },
  title: {
    color: '#F2EFE9',
    fontFamily: FONT.bold,
    fontSize: TYPE.body.fontSize,
    letterSpacing: -0.3,
    lineHeight: TYPE.body.lineHeight,
  },
  titleInput: {
    color: '#F4F5F7',
    flex: 1,
    fontFamily: FONT.bold,
    fontSize: TYPE.body.fontSize,
    letterSpacing: -0.3,
    paddingVertical: 8,
  },
  topWash: { height: 190, left: 0, position: 'absolute', right: 0, top: 0 },
});
