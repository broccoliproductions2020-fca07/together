import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, Switch, Text, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { DurationPicker } from '@/features/activities';
import { OPEN_MAX_DURATION_MS, useOpenStatus } from '@/features/presence';
import { AnimatedToggleIcon } from '@/shared/components/AnimatedToggleIcon';
import { openLocationSettings } from '@/shared/utils/locationPermission';

const OPEN_COLOR = '#6E8BF7';
/** Mirrors DurationPicker's own floor. Anything shorter is not a window. */
const MIN_OPEN_MINUTES = 15;
const DEFAULT_OPEN_MINUTES = 180;

function formatUntil(expiresAt: number): string {
  const date = new Date(expiresAt);
  const hh = date.getHours().toString().padStart(2, '0');
  const mm = date.getMinutes().toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * The card stores an absolute expiry; the shared DurationPicker speaks minutes
 * from now. Both directions are relative to "now" on purpose — while you are
 * open, the question you are actually answering is "how much longer?", not
 * "at what o'clock?". The summary line above still shows the resulting clock
 * time, so the absolute answer stays visible.
 */
function expiryToMinutes(expiresAt: number | null): number {
  if (!expiresAt) return DEFAULT_OPEN_MINUTES;
  const remaining = Math.round((expiresAt - Date.now()) / 60_000);
  return Math.max(MIN_OPEN_MINUTES, Math.min(OPEN_MAX_DURATION_MS / 60_000, remaining));
}

function minutesToExpiry(minutes: number): number {
  return Date.now() + minutes * 60_000;
}

function SubLabel({ children }: { children: string }) {
  return (
    <Text className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-white">
      {children}
    </Text>
  );
}

/** Chevron that turns with the section, the way a native disclosure does. */
function DisclosureChevron({ expanded }: { expanded: boolean }) {
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(expanded ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(expanded ? 1 : 0, {
      duration: reducedMotion ? 0 : 200,
      easing: Easing.out(Easing.cubic),
    });
  }, [expanded, progress, reducedMotion]);

  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${progress.value * 180}deg` }],
  }));

  return (
    <Animated.View style={style}>
      <Ionicons name="chevron-down" size={16} color="rgba(255,255,255,0.55)" />
    </Animated.View>
  );
}

/**
 * Top of the NearbySheet: the current user's own "I'm open" presence.
 *
 * Not open → ONE button, no form. Tapping it goes open on the defaults (no
 * vibe, +3 h, no location). There is no second confirm and no pre-open form: a
 * form you must walk past before you can say "I have time" is friction in front
 * of the one thing this app exists for, and every field is optional anyway.
 * Open → a summary row that unfolds the controls to refine (vibe, end time and
 * Nähe are set there, after the fact), with "Offen beenden" on its own full-width
 * line beneath. The destructive control never shares a row with the disclosure:
 * they used to sit 8 px apart, so reaching for the chevron ended your status.
 *
 * The mis-tap protection lives one level up instead: the map pill NEVER goes
 * open, it only opens this sheet. Announcing yourself still takes two deliberate
 * taps, they just sit in a different place than the refinement.
 *
 * No vibe set displays as "Egal" (display convention — the data stays null).
 * "open" was deliberately removed from the activity composer (open = presence,
 * not event).
 */
export function OpenStatusCard({ visible = true }: { visible?: boolean }) {
  const {
    isOpen,
    vibe,
    expiresAt,
    goOpen,
    setVibe,
    setExpiresAt,
    shareLocation,
    setShareLocation,
    shareLocationBlocked,
    close,
  } = useOpenStatus();
  const reducedMotion = useReducedMotion();
  // Only ever unfolds the refinement controls of an ALREADY open status; there
  // is nothing to unfold before that.
  const [expanded, setExpanded] = useState(false);

  // Each time the sheet appears, start folded — a panel left open from two
  // visits ago is noise, and the summary line is the thing you came to read.
  useEffect(() => {
    if (!visible) return;
    setExpanded(false);
  }, [visible]);

  // Local draft for the vibe field: typing only updates this; committing
  // (blur / keyboard "done") is the one point it's written through to the
  // presence backend — avoids a Firestore write per keystroke.
  const [customVibeDraft, setCustomVibeDraft] = useState(vibe ? vibe.label : '');
  const [customVibeFocused, setCustomVibeFocused] = useState(false);

  useEffect(() => {
    if (customVibeFocused) return;
    setCustomVibeDraft(vibe ? vibe.label : '');
  }, [vibe, customVibeFocused]);

  const commitCustomVibe = () => {
    const trimmed = customVibeDraft.trim();
    setVibe(trimmed ? { label: trimmed } : null);
  };

  if (!isOpen) {
    return (
      <Animated.View
        layout={reducedMotion ? undefined : LinearTransition.duration(220)}
        className="overflow-hidden rounded-[20px]"
        style={{
          backgroundColor: `${OPEN_COLOR}22`,
          borderWidth: 1,
          borderColor: `${OPEN_COLOR}55`,
        }}
      >
        {/* The whole closed state: one button, no form, no second confirm. It
            goes open on the defaults — everything is optional and refinable the
            moment after, in the panel below. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Jetzt offen stellen"
          accessibilityHint="Deine Freunde sehen sofort, dass du offen bist. Vibe, Zeit und Nähe kannst du danach anpassen."
          onPress={() => goOpen()}
          className="flex-row items-center gap-3 px-4 py-3.5 active:opacity-90"
        >
          <View
            className="h-9 w-9 items-center justify-center rounded-full"
            style={{ backgroundColor: OPEN_COLOR }}
          >
            <Ionicons name="add" size={22} color="#fff" />
          </View>
          <View className="flex-1">
            <Text className="text-base font-bold text-white">Offen stellen</Text>
            <Text className="text-xs text-white/55">
              Zeig deinen Freunden, dass du etwas unternehmen möchtest
            </Text>
          </View>
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      layout={reducedMotion ? undefined : LinearTransition.duration(220)}
      className="gap-3 rounded-[20px] px-4 py-3.5"
      style={{ backgroundColor: `${OPEN_COLOR}1f`, borderWidth: 1, borderColor: `${OPEN_COLOR}66` }}
    >
      {/* Summary line — the WHOLE row is the disclosure target, edge to edge.
          Nothing destructive shares it: the chevron used to sit 8 px from
          "Beenden", so aiming at one risked ending your status outright. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'Details einklappen' : 'Details anpassen'}
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((current) => !current)}
        className="min-h-9 flex-row items-center gap-2 active:opacity-70"
      >
        <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: OPEN_COLOR }} />
        <Text className="flex-1 text-sm font-bold text-white">
          Du bist offen · {vibe ? vibe.label : 'Egal'}
          {expiresAt ? ` · bis ${formatUntil(expiresAt)}` : ''}
        </Text>
        {shareLocation ? <Ionicons name="locate" size={13} color={OPEN_COLOR} /> : null}
        <DisclosureChevron expanded={expanded} />
      </Pressable>

      {expanded ? (
        <Animated.View
          entering={reducedMotion ? undefined : FadeIn.duration(160)}
          exiting={reducedMotion ? undefined : FadeOut.duration(120)}
          className="gap-3"
        >
          <RefineControls
            vibeValue={customVibeDraft}
            onVibeChange={setCustomVibeDraft}
            onVibeFocus={() => setCustomVibeFocused(true)}
            onVibeCommit={() => {
              setCustomVibeFocused(false);
              commitCustomVibe();
            }}
            expiresAt={expiresAt}
            onPickExpiry={setExpiresAt}
            shareLocation={shareLocation}
            onShareLocationChange={setShareLocation}
            shareLocationBlocked={shareLocationBlocked}
          />
        </Animated.View>
      ) : null}
      {/* Its own line, full width. Separated from the disclosure on the vertical
          axis, which a thumb cannot cross by accident the way it crossed 8 px of
          horizontal gap. It says what it does, in the colour that means
          "this stops something" — it was once a 2-letter "aus" chip that read as
          a label, and people did not know it ended their status. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Offen beenden"
        onPress={close}
        className="min-h-11 flex-row items-center justify-center gap-2 rounded-2xl active:opacity-70"
        style={{
          backgroundColor: 'rgba(214,69,87,0.16)',
          borderWidth: 1,
          borderColor: 'rgba(214,69,87,0.5)',
        }}
      >
        <Ionicons name="stop-circle-outline" size={16} color="#F08497" />
        <Text className="text-sm font-bold" style={{ color: '#F08497' }}>
          Offen beenden
        </Text>
      </Pressable>
    </Animated.View>
  );
}

/**
 * The three optional refinements — vibe, end time, proximity. Shared by both
 * card states on purpose: the form you fill in BEFORE going open and the one
 * you tweak afterwards must be the same form, or the second one reads as a
 * different feature.
 */
function RefineControls({
  vibeValue,
  onVibeChange,
  onVibeFocus,
  onVibeCommit,
  expiresAt,
  onPickExpiry,
  shareLocation,
  onShareLocationChange,
  shareLocationBlocked,
}: {
  vibeValue: string;
  onVibeChange: (value: string) => void;
  onVibeFocus?: () => void;
  onVibeCommit?: () => void;
  expiresAt: number | null;
  onPickExpiry: (ts: number) => void;
  shareLocation: boolean;
  onShareLocationChange: (value: boolean) => void;
  shareLocationBlocked: boolean;
}) {
  return (
    <>
      {/* Vibe first — the "what" is the social headline; time is just the frame.
          Free text only; empty = "Egal" (display convention, no data write) */}
      <View>
        <SubLabel>Offen für</SubLabel>
        <TextInput
          className="rounded-2xl border px-3 py-2.5 text-sm text-white"
          style={{
            borderColor: vibeValue.trim() ? OPEN_COLOR : 'rgba(255,255,255,0.15)',
            backgroundColor: 'rgba(255,255,255,0.05)',
          }}
          placeholder="Egal"
          placeholderTextColor="rgba(244,245,247,0.4)"
          value={vibeValue}
          onChangeText={onVibeChange}
          onFocus={onVibeFocus}
          onBlur={onVibeCommit}
          onSubmitEditing={onVibeCommit}
          maxLength={40}
          returnKeyType="done"
        />
      </View>

      {/* Duration — the SAME control the activity composer uses, in the open
          colour. A native time wheel here meant two different widgets answered
          the same question ("how long is this good for?") on two screens. Its
          15 min – 12 h range is exactly the open window's own range
          (OPEN_MAX_DURATION_MS), so nothing had to be adapted. The resulting
          clock time stays readable as "bis HH:MM" in the summary above. */}
      <View>
        <SubLabel>Bis wann?</SubLabel>
        <DurationPicker
          minutes={expiryToMinutes(expiresAt)}
          accent={OPEN_COLOR}
          onChange={(minutes) => onPickExpiry(minutesToExpiry(minutes))}
        />
      </View>

      {/* Optional coarse proximity — visible only inside the Offen-Fenster. */}
      <View>
        <SubLabel>Nähe</SubLabel>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: shareLocation }}
          accessibilityLabel="Nähe mit Freunden teilen"
          onPress={() => onShareLocationChange(!shareLocation)}
          className="flex-row items-center gap-3 rounded-2xl border px-3.5 py-2.5"
          style={{
            borderColor: shareLocation ? `${OPEN_COLOR}88` : 'rgba(255,255,255,0.12)',
            backgroundColor: shareLocation ? `${OPEN_COLOR}18` : 'rgba(255,255,255,0.04)',
          }}
        >
          <AnimatedToggleIcon
            icon="locate"
            active={shareLocation}
            size={17}
            activeColor={OPEN_COLOR}
            inactiveColor="rgba(244,245,247,0.6)"
          />
          <View className="flex-1">
            <Text className="text-sm font-semibold text-white">Nähe teilen</Text>
            <Text className="text-xs text-white/50">
              {shareLocation
                ? 'Freunde können dich grob als nah einordnen'
                : 'Freunde sehen dich ohne Näheangabe'}
            </Text>
          </View>
          <Switch
            value={shareLocation}
            onValueChange={onShareLocationChange}
            trackColor={{ false: 'rgba(255,255,255,0.15)', true: OPEN_COLOR }}
            thumbColor="#ffffff"
          />
        </Pressable>
        {shareLocation && shareLocationBlocked ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Standortzugriff in den Einstellungen erlauben"
            onPress={openLocationSettings}
            className="mt-2 flex-row items-start gap-2 rounded-2xl border border-[#E0A23E]/40 bg-[#E0A23E]/10 px-3 py-2.5 active:opacity-80"
          >
            <Ionicons name="alert-circle-outline" size={15} color="#E0A23E" />
            <Text className="flex-1 text-xs leading-4 text-white/70">
              Standortzugriff fehlt — deine Nähe wird gerade NICHT geteilt.{' '}
              <Text className="font-semibold text-[#E0A23E]">Einstellungen öffnen</Text>
            </Text>
          </Pressable>
        ) : null}
      </View>
    </>
  );
}
