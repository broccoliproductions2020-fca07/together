import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { FONT, TEXT_CAPPED, TEXT_FLEXIBLE, TYPE } from '@/shared/theme';
import { haptics } from '@/shared/utils/haptics';

import type { ActivityDraft } from '../../types';

export const MIN_PARTICIPANTS = 2;
export const MAX_PARTICIPANTS = 50;

export interface CapacityBenchProps {
  draft: ActivityDraft;
  accent: string;
  onChange: (draft: ActivityDraft) => void;
}

/**
 * Capacity and guests in one workbench, because they answer one question:
 * who can end up in this?
 *
 * The default reads "Bis 50", never "Unbegrenzt": `firestore.rules` caps
 * `participantUids` at 50, so unlimited was a promise the backend refuses to
 * keep. The DATA still stays absent — writing 50 would turn a system limit into
 * a host decision and freeze today's activities at 50 if the cap is ever
 * raised. Only the label tells the truth.
 *
 * The limit is a stepper whose LEFTMOST position is that no-own-limit state —
 * the scale runs (kein Limit) · 2 · 3 · … · 50, so minus from 2 lands back on it. That is
 * what keeps the default reachable without a separate on/off switch: the
 * earlier design made setting a limit cost two actions (flip the switch, then
 * step up from the minimum), and a drag-slider replaced that with something
 * precise values were hard to hit on.
 */
export function CapacityBench({ draft, accent, onChange }: CapacityBenchProps) {
  const limit = draft.maxPeople;
  const limited = limit != null;
  const guestsEnabled = draft.guestInvitesEnabled === true;

  function apply(next: number | undefined) {
    haptics.selection();
    onChange({ ...draft, maxPeople: next });
  }

  /** ∞ sits one step below the minimum, so the scale has no gap and no switch. */
  function step(delta: 1 | -1) {
    if (!limited) {
      if (delta === 1) apply(MIN_PARTICIPANTS);
      return;
    }
    const next = limit + delta;
    if (next < MIN_PARTICIPANTS) apply(undefined);
    else if (next <= MAX_PARTICIPANTS) apply(next);
  }

  const canDecrease = limited;
  const canIncrease = !limited || limit < MAX_PARTICIPANTS;

  return (
    <View style={styles.root}>
      <View style={styles.stepperRow}>
        <View style={styles.readout}>
          <Text
            style={[styles.value, { color: limited ? accent : 'rgba(244,245,247,0.62)' }]}
            {...TEXT_CAPPED}
          >
            {limited ? limit : `Bis ${MAX_PARTICIPANTS}`}
          </Text>
          <Text style={styles.caption} {...TEXT_FLEXIBLE}>
            {limited
              ? `Plätze · du plus ${limit - 1}`
              : 'Kein eigenes Limit — mehr lässt die App nicht zu'}
          </Text>
        </View>

        <View style={styles.stepper}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Weniger Plätze"
            accessibilityState={{ disabled: !canDecrease }}
            disabled={!canDecrease}
            onPress={() => step(-1)}
            style={({ pressed }) => [styles.stepButton, pressed && styles.pressed]}
          >
            <Ionicons
              name="remove"
              size={20}
              color={canDecrease ? '#F4F5F7' : 'rgba(244,245,247,0.25)'}
            />
          </Pressable>
          <View style={styles.stepDivider} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mehr Plätze"
            accessibilityState={{ disabled: !canIncrease }}
            disabled={!canIncrease}
            onPress={() => step(1)}
            style={({ pressed }) => [styles.stepButton, pressed && styles.pressed]}
          >
            <Ionicons
              name="add"
              size={20}
              color={canIncrease ? '#F4F5F7' : 'rgba(244,245,247,0.25)'}
            />
          </Pressable>
        </View>
      </View>

      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: guestsEnabled }}
        accessibilityLabel="Freunde von Freunden erlauben"
        onPress={() =>
          onChange({ ...draft, guestInvitesEnabled: guestsEnabled ? undefined : true })
        }
        style={({ pressed }) => [styles.guestRow, pressed && styles.pressed]}
      >
        <Ionicons
          name="person-add-outline"
          size={17}
          color={guestsEnabled ? accent : 'rgba(244,245,247,0.5)'}
        />
        <View style={styles.guestText}>
          <Text style={styles.guestTitle} {...TEXT_CAPPED}>
            Freunde von Freunden erlauben
          </Text>
          <Text style={styles.guestSub} {...TEXT_FLEXIBLE}>
            {guestsEnabled
              ? 'Teilnehmer dürfen eigene Freunde mitbringen — auch solche, die du abgewählt hast.'
              : 'Nur die ausgewählten Freunde sehen die Activity.'}
          </Text>
        </View>
        <View pointerEvents="none">
          <Switch
            value={guestsEnabled}
            trackColor={{ false: 'rgba(255,255,255,0.15)', true: accent }}
            thumbColor="#ffffff"
          />
        </View>
      </Pressable>

      {limited && guestsEnabled ? (
        <View style={styles.warning}>
          <Ionicons name="alert-circle-outline" size={14} color="#E8B98F" />
          <Text style={styles.warningText} {...TEXT_FLEXIBLE}>
            Mitgebrachte Freunde zählen auf die {limit} Plätze mit.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  caption: {
    color: 'rgba(244,245,247,0.5)',
    fontFamily: FONT.medium,
    fontSize: TYPE.caption.fontSize,
    marginTop: 2,
  },
  guestRow: {
    alignItems: 'center',
    borderTopColor: 'rgba(255,255,255,0.08)',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 11,
    minHeight: 52,
    paddingTop: 11,
  },
  guestSub: {
    color: 'rgba(244,245,247,0.5)',
    fontFamily: FONT.medium,
    fontSize: TYPE.micro.fontSize,
    marginTop: 2,
  },
  guestText: { flex: 1 },
  guestTitle: { color: '#F4F5F7', fontFamily: FONT.semibold, fontSize: TYPE.caption.fontSize },
  pressed: { opacity: 0.7 },
  readout: { flex: 1, minWidth: 0 },
  root: { gap: 12 },
  stepButton: { alignItems: 'center', height: 46, justifyContent: 'center', width: 52 },
  stepDivider: { backgroundColor: 'rgba(255,255,255,0.12)', width: 1 },
  stepper: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  stepperRow: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  value: { fontFamily: FONT.bold, fontSize: 26, letterSpacing: -0.9, lineHeight: 30 },
  warning: { alignItems: 'flex-start', flexDirection: 'row', gap: 7 },
  warningText: {
    color: '#E8B98F',
    flex: 1,
    fontFamily: FONT.medium,
    fontSize: TYPE.micro.fontSize,
  },
});
