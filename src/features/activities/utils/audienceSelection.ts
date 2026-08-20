import type { CircleDoc } from '@/features/circles';
import type { FriendProfile } from '@/features/friends';

import type { ActivityVisibility } from '../types';

/**
 * The two groups the app itself guarantees.
 *
 * They are not circles and not derived from data — every account has them, from
 * the very first launch onwards, and "Alle Freunde" is the default audience.
 * Treating them as ordinary groups here is what lets one row type serve all
 * three cases; `standard` only decides ordering and that they are never dropped.
 */
export const ALL_FRIENDS_GROUP_ID = '__all_friends__';
/** Close friends behave exactly like a circle here — a bulk selector over the
 * same people — so they travel as a pseudo-group instead of a fourth concept. */
export const CLOSE_FRIENDS_GROUP_ID = '__close_friends__';

export type CheckState = 'on' | 'off' | 'partial';

export interface AudienceGroup {
  id: string;
  name: string;
  emoji?: string;
  /** Members intersected with the LIVE friend list — see buildAudienceIndex. */
  memberUids: string[];
  /** One of the two app-owned groups. Always present, always listed first. */
  standard?: boolean;
}

export interface AudienceIndex {
  friends: FriendProfile[];
  friendUids: string[];
  groups: AudienceGroup[];
  /** uid → ids of every group containing them. The inverse index is what keeps
   * a single toggle O(groups of that person) instead of O(all groups). */
  memberOf: ReadonlyMap<string, string[]>;
  groupSizes: ReadonlyMap<string, number>;
}

export interface AudienceState {
  selected: ReadonlySet<string>;
  /** groupId → how many of its members are currently selected. */
  groupCounts: ReadonlyMap<string, number>;
}

/**
 * Builds the lookup tables the picker runs on.
 *
 * Group membership is intersected with the live friend list on purpose. The
 * server does clean circles when a friendship ends (`removeFriend` filters the
 * uid out of both sides' `privateCircles`), so the two agree in steady state —
 * but the circle cache can lag a listener update by a moment, and a group that
 * renders "4 von 5" while only four people are selectable can never reach the
 * fully-checked state. Intersecting makes that unreachable state impossible.
 *
 * An EMPTY CIRCLE is dropped: a user-made bulk selector that selects nothing is
 * a row people can only be confused by. The two standard groups are built
 * unconditionally instead, empty or not — they are part of the app's model
 * rather than of this data, so letting them blink in and out of the list would
 * make the same screen look structurally different from one account to the next.
 */
export function buildAudienceIndex(
  friends: FriendProfile[],
  circles: CircleDoc[],
  closeFriendUids: string[],
): AudienceIndex {
  const friendUids = friends.map((friend) => friend.uid);
  const friendSet = new Set(friendUids);

  const groups: AudienceGroup[] = [
    { id: ALL_FRIENDS_GROUP_ID, name: 'Alle Freunde', memberUids: friendUids, standard: true },
    {
      id: CLOSE_FRIENDS_GROUP_ID,
      name: 'Enge Freunde',
      memberUids: closeFriendUids.filter((uid) => friendSet.has(uid)),
      standard: true,
    },
  ];

  for (const circle of circles) {
    const memberUids = circle.friendUids.filter((uid) => friendSet.has(uid));
    if (memberUids.length === 0) continue;
    groups.push({ id: circle.id, name: circle.name, emoji: circle.emoji, memberUids });
  }

  const memberOf = new Map<string, string[]>();
  const groupSizes = new Map<string, number>();
  for (const group of groups) {
    groupSizes.set(group.id, group.memberUids.length);
    for (const uid of group.memberUids) {
      const existing = memberOf.get(uid);
      if (existing) existing.push(group.id);
      else memberOf.set(uid, [group.id]);
    }
  }

  return { friends, friendUids, groups, memberOf, groupSizes };
}

/** Full rebuild. Used on mount and whenever the whole selection is replaced. */
export function createAudienceState(
  index: AudienceIndex,
  selectedUids: Iterable<string>,
): AudienceState {
  const friendSet = new Set(index.friendUids);
  const selected = new Set<string>();
  for (const uid of selectedUids) if (friendSet.has(uid)) selected.add(uid);

  const groupCounts = new Map<string, number>();
  for (const group of index.groups) {
    let count = 0;
    for (const uid of group.memberUids) if (selected.has(uid)) count += 1;
    groupCounts.set(group.id, count);
  }
  return { selected, groupCounts };
}

/** Applies a set of uid changes and patches only the affected group counters. */
function applyChanges(
  index: AudienceIndex,
  state: AudienceState,
  changes: Map<string, boolean>,
): AudienceState {
  const selected = new Set(state.selected);
  const touched = new Map<string, number>();

  for (const [uid, next] of changes) {
    const current = selected.has(uid);
    if (current === next) continue;
    if (next) selected.add(uid);
    else selected.delete(uid);

    const delta = next ? 1 : -1;
    for (const groupId of index.memberOf.get(uid) ?? []) {
      touched.set(groupId, (touched.get(groupId) ?? state.groupCounts.get(groupId) ?? 0) + delta);
    }
  }

  if (touched.size === 0 && selected.size === state.selected.size) return state;

  const groupCounts = new Map(state.groupCounts);
  for (const [groupId, count] of touched) groupCounts.set(groupId, count);
  return { selected, groupCounts };
}

export function setFriendSelected(
  index: AudienceIndex,
  state: AudienceState,
  uid: string,
  next: boolean,
): AudienceState {
  return applyChanges(index, state, new Map([[uid, next]]));
}

export function setGroupSelected(
  index: AudienceIndex,
  state: AudienceState,
  groupId: string,
  next: boolean,
): AudienceState {
  const group = index.groups.find((candidate) => candidate.id === groupId);
  if (!group) return state;
  const changes = new Map<string, boolean>();
  for (const uid of group.memberUids) changes.set(uid, next);
  return applyChanges(index, state, changes);
}

export function groupCheckState(
  index: AudienceIndex,
  state: AudienceState,
  groupId: string,
): CheckState {
  const size = index.groupSizes.get(groupId) ?? 0;
  const count = state.groupCounts.get(groupId) ?? 0;
  if (size === 0 || count === 0) return 'off';
  return count >= size ? 'on' : 'partial';
}

/**
 * What a tap on a checkbox resolves to.
 *
 * `partial → on` is deliberate and the only genuinely contested case: going the
 * other way would silently discard the individual picks the user just made,
 * which is the expensive mistake. From `on`, one tap clears — also destructive,
 * but instantly visible in the count and undone by tapping again.
 */
export function nextCheckValue(state: CheckState): boolean {
  return state !== 'on';
}

/**
 * The context the server re-derives the audience from.
 *
 * "Everyone" stays `all_friends` rather than an enumerated selection: the
 * server resolves that from the live friendship graph, so it cannot be capped
 * out by a long list and stays correct if the graph changed a second ago.
 */
export function selectionToVisibility(
  index: AudienceIndex,
  state: AudienceState,
): ActivityVisibility {
  // With no friends there is nothing to narrow, and an empty `selection` would
  // fail validation on a screen that offers nothing to fix it with. An account
  // without friendships publishes to `all_friends` — which resolves to just the
  // host, exactly as it did before this picker existed.
  if (index.friendUids.length === 0) return { kind: 'all_friends' };
  if (state.selected.size >= index.friendUids.length) return { kind: 'all_friends' };
  return { kind: 'selection', uids: [...state.selected] };
}

/** Resolves a stored visibility back into concrete people (edit + prefill). */
export function visibilityToSelection(
  index: AudienceIndex,
  visibility: ActivityVisibility,
  closeFriendUids: string[],
): string[] {
  const friendSet = new Set(index.friendUids);
  switch (visibility.kind) {
    case 'all_friends':
      return index.friendUids;
    case 'close_friends':
      return closeFriendUids.filter((uid) => friendSet.has(uid));
    case 'group': {
      const group = index.groups.find((candidate) => candidate.id === visibility.groupId);
      return group ? group.memberUids : [];
    }
    case 'selection':
      return visibility.uids.filter((uid) => friendSet.has(uid));
    default:
      return index.friendUids;
  }
}

export interface AudienceSummary {
  /** What the collapsed row says the audience IS. */
  label: string;
  /** Second line, or null when the label already says everything. */
  detail: string | null;
  /** Nobody can see it — the one state worth colouring as a warning. */
  empty: boolean;
}

/**
 * The one line the collapsed row shows.
 *
 * It NAMES the audience wherever a name exists — "Alle Freunde", "Enge Freunde",
 * a circle, a single person — and falls back to a count only when the selection
 * matches nothing nameable. A bare "4 von 6" is a number the reader has to
 * decode; the group name is the answer they actually chose.
 */
export function describeAudience(index: AudienceIndex, state: AudienceState): AudienceSummary {
  const total = index.friendUids.length;
  const selected = state.selected.size;

  // No friendships yet: the default still HAS a name, and saying "Niemand"
  // about an empty graph would read as a setting the person got wrong.
  if (total === 0) {
    return { label: 'Alle Freunde', detail: 'Noch keine Freunde — bisher siehst nur du sie.', empty: false };
  }
  if (selected === 0) {
    return { label: 'Niemand', detail: 'Bisher siehst nur du die Activity.', empty: true };
  }
  if (selected >= total) {
    return { label: 'Alle Freunde', detail: `${total} ${total === 1 ? 'Person' : 'Personen'}`, empty: false };
  }

  for (const group of index.groups) {
    if (group.id === ALL_FRIENDS_GROUP_ID) continue;
    const size = index.groupSizes.get(group.id) ?? 0;
    if (size === 0 || size !== selected) continue;
    if ((state.groupCounts.get(group.id) ?? 0) === size) {
      return { label: group.name, detail: `${size} ${size === 1 ? 'Person' : 'Personen'}`, empty: false };
    }
  }

  if (selected === 1) {
    const only = index.friends.find((friend) => state.selected.has(friend.uid));
    if (only) return { label: only.displayName, detail: 'Nur diese Person', empty: false };
  }

  return {
    label: `${selected} von ${total} Freunden`,
    detail: describeExcluded(index, state),
    empty: false,
  };
}

/** Names the excluded people for the summary line, capped so it stays a line. */
export function describeExcluded(index: AudienceIndex, state: AudienceState, max = 2): string | null {
  const missing = index.friends.filter((friend) => !state.selected.has(friend.uid));
  if (missing.length === 0) return null;
  const names = missing.slice(0, max).map((friend) => friend.displayName.split(' ')[0]);
  if (missing.length <= max) {
    return names.length === 1 ? `${names[0]} sieht sie nicht` : `${names.join(' und ')} sehen sie nicht`;
  }
  return `${names.join(', ')} und ${missing.length - max} weitere sehen sie nicht`;
}
