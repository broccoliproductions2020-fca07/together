import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

import { arcAngles, obliqueSectorWeights } from './coreSelection';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/**
 * What the core shows about YOU in its centre.
 *
 * `now` and `soon` come from the current user's existing bounded activity feed.
 * It adds no listener and is never guessed from a map marker.
 * It opens the chosen activity detail instead of inventing another action.
 */
export type CoreStatus = 'idle' | 'open' | 'now' | 'soon';

export type CoreTargetId = 'search' | 'nearby' | 'activity' | 'postfach' | 'calendar';

/** Start choices. `open` stays presence; only `now` and `soon` open the composer. */
/** The two creatable activity modes. Open remains the Core's own tap action. */
export type CoreActivityId = 'now' | 'soon';

/**
 * The mode accents. Repeated locally like every other consumer in the app —
 * there is no shared constant for them yet, and inventing one here would be a
 * refactor of a dozen unrelated files rather than part of this migration.
 */
export const CORE_ACCENT = {
  now: '#41C08D',
  soon: '#E0A23E',
  open: '#3B82F6',
} as const;

export interface CoreTarget {
  id: CoreTargetId;
  label: string;
  /** Spoken by the screen reader; the visible label is often a single word. */
  accessibilityLabel: string;
  icon: IoniconName;
}

/**
 * Fixed order, left to right. These positions are NOT state-dependent: a target
 * that moves depending on what is going on destroys the muscle memory that is
 * the whole point of a radial menu.
 *
 * The five areas stay in this exact order. Nearby lives here now, so the map has
 * one unmistakable bottom-centre gateway instead of a second floating control.
 */
export const CORE_ROOT_TARGETS: readonly CoreTarget[] = [
  {
    id: 'search',
    label: 'Suchen',
    accessibilityLabel: 'Orte suchen',
    icon: 'search',
  },
  {
    id: 'nearby',
    label: 'Freunde',
    accessibilityLabel: 'Offene Freunde in deiner Nähe',
    icon: 'people-outline',
  },
  {
    id: 'activity',
    label: 'Starten',
    accessibilityLabel: 'Activity jetzt oder für später starten',
    // The core itself is the one-tap Open control. A second plus here made the
    // two actions look like the same thing.
    icon: 'add-circle-outline',
  },
  {
    id: 'postfach',
    label: 'Postfach',
    accessibilityLabel: 'Postfach öffnen',
    icon: 'chatbubbles-outline',
  },
  {
    id: 'calendar',
    label: 'Pläne',
    accessibilityLabel: 'Pläne öffnen',
    icon: 'calendar-outline',
  },
] as const;

/**
 * Index of the primary root target. It is NOT armed by default — nothing is,
 * because a highlighted target has to be one a release would actually run. This
 * index only marks the interaction anchor: it is where the bloom stagger starts
 * and the one target a rested thumb can unfold into Jetzt/Soon.
 */
export const CORE_PRIMARY_INDEX = CORE_ROOT_TARGETS.findIndex((target) => target.id === 'activity');

export interface CoreActivityTarget {
  id: CoreActivityId;
  label: string;
  accessibilityLabel: string;
  icon: IoniconName;
  accent: string;
}

/**
 * Second level. The order supplies a stable left/right mapping; neither option
 * is armed until the thumb actually moves onto it.
 *
 * Wording and glyphs are taken from `ActivityModeSwitch`, not invented here:
 * the composer calls them "Jetzt" and "Soon" and draws them with the filled
 * `flash` / `calendar-clear` pair, so the two surfaces that create the same two
 * activities have to look like the same two activities. `AnimatedToggleIcon`
 * derives the `-outline` form for the unselected state, which is why the FILLED
 * glyph is the one named here.
 */
export const CORE_ACTIVITY_TARGETS: readonly CoreActivityTarget[] = [
  {
    id: 'now',
    label: 'Jetzt',
    accessibilityLabel: 'Aktivität jetzt starten',
    icon: 'flash',
    accent: CORE_ACCENT.now,
  },
  {
    id: 'soon',
    label: 'Soon',
    accessibilityLabel: 'Aktivität für später planen',
    icon: 'calendar-clear',
    accent: CORE_ACCENT.soon,
  },
] as const;

/**
 * Arc geometry. Five root targets use a wider fan, while Jetzt/Soon sit above
 * the Core as one compact activity decision.
 */
export const CORE_ORBIT_RADIUS = 124;
/**
 * Distance from the core centre to the centre of an activity card.
 *
 * The pair sits STEEPLY (±26°, not the ±30° a two-item arc would suggest),
 * because the horizontal room between the core and the map's control column is
 * what caps this radius. Standing the cards up buys distance from the core
 * without costing width: at ±26° a 390 pt screen keeps ~39 px of clear space
 * between the core's rim and the nearest card corner, where ±30° left 15 px on
 * a 360 pt screen and the two nearly touched.
 */
export const CORE_ACTIVITY_RADIUS = 162;
export const CORE_ACTIVITY_RADIUS_MIN = 148;
export const CORE_ACTIVITY_CARD_WIDTH = 104;
export const CORE_ACTIVITY_CARD_HEIGHT = 78;
/**
 * Five functions need enough arc length for 52 px targets without returning to
 * the old edge-hugging 170-degree fan.
 */
const ROOT_SPREAD = (148 * Math.PI) / 180;
const SUB_SPREAD = (52 * Math.PI) / 180;

/**
 * How hard the oblique correction is pushed.
 *
 * Kept deliberately modest: the fan already gives five actions stable sectors,
 * while diagonals still receive a little more tolerance than orthogonal marks.
 * Calibrate on a device before raising it.
 */
const CORE_SECTOR_BIAS = 0.3;

export const CORE_ROOT_ANGLES = arcAngles(CORE_ROOT_TARGETS.length, ROOT_SPREAD);
export const CORE_ACTIVITY_ANGLES = arcAngles(CORE_ACTIVITY_TARGETS.length, SUB_SPREAD);
export const CORE_ROOT_WEIGHTS = obliqueSectorWeights(CORE_ROOT_ANGLES, CORE_SECTOR_BIAS);
/**
 * Jetzt/Soon use equal visual sectors; weighting this compact second level
 * would make one option easier to reach than the other.
 */
export const CORE_ACTIVITY_WEIGHTS = CORE_ACTIVITY_ANGLES.map(() => 1);

/**
 * The accent an armed root target renders in.
 *
 * Green marks the one currently armed root target. It is interaction feedback,
 * not a claim that the target itself is an activity state.
 */
export function rootTargetAccent(_id: CoreTargetId): string | null {
  return CORE_ACCENT.now;
}
