import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';

import type { FriendProfile } from '@/features/friends';
import { PersonAvatar, SearchField } from '@/shared/components';
import { AudienceSummary } from '@/shared/product-ui/AudienceSummary';
import { NATIVE_FONTS } from '@/shared/product-ui/nativeFonts';
import { FONT, TEXT_CAPPED, TEXT_FLEXIBLE, TYPE } from '@/shared/theme';

import {
  ALL_FRIENDS_GROUP_ID,
  CLOSE_FRIENDS_GROUP_ID,
  describeAudience,
  groupCheckState,
  nextCheckValue,
  setFriendSelected,
  setGroupSelected,
  type AudienceGroup,
  type AudienceIndex,
  type AudienceState,
} from '../../utils/audienceSelection';
import { TriCheckbox } from '../TriCheckbox';


type Row =
  | { key: string; type: 'section'; label: string; hint?: string }
  | {
      key: string;
      type: 'group';
      group: AudienceGroup;
      /** Show its tri-state checkbox. False while searching and for empty groups. */
      checkable: boolean;
      /** Drill into the member list. False for a group with no members. */
      openable: boolean;
      /** Opening it must also end the search that surfaced it. */
      fromSearch: boolean;
    }
  | { key: string; type: 'friend'; friend: FriendProfile }
  | { key: string; type: 'empty'; label: string };

function initialsOf(friend: FriendProfile): string {
  return friend.initials || friend.displayName.slice(0, 2).toUpperCase();
}

/**
 * Why a standard group is empty, in the group's own terms.
 *
 * The two app-owned groups are always listed, so they need to explain their own
 * zero — "0 von 0" would read as a broken counter rather than as "you have not
 * starred anyone yet".
 */
function emptyGroupHint(groupId: string, size: number): string {
  if (groupId === ALL_FRIENDS_GROUP_ID) return 'Noch keine Freunde';
  if (groupId === CLOSE_FRIENDS_GROUP_ID) return 'Noch niemand als eng markiert';
  return `${size} Personen`;
}

/** Stable per-uid tint so the same person keeps the same colour across rows. */
const AVATAR_TINTS = ['#8FB6E8', '#E8B98F', '#A5D9BE', '#C9A7E8', '#E8A7B4', '#B8D08F', '#8FD6E8'];
function tintFor(uid: string): string {
  let hash = 0;
  for (let index = 0; index < uid.length; index += 1) hash = (hash * 31 + uid.charCodeAt(index)) | 0;
  return AVATAR_TINTS[Math.abs(hash) % AVATAR_TINTS.length];
}

export interface AudienceBenchProps {
  index: AudienceIndex;
  state: AudienceState;
  accent: string;
  onChange: (next: AudienceState) => void;
}

/**
 * Who can see the activity — one set of people, with groups as bulk selectors.
 *
 * The load-bearing rule: a person has exactly ONE checkbox. Groups are windows
 * onto the same set, never separate lists, which is why removing someone via
 * one group leaves every other group they belong to showing "partial".
 *
 * "Alle Freunde" is a GROUP ROW, not a master switch on the header. It carries
 * exactly the semantics a master switch would, and shipping both would put two
 * identical controls on one screen — the collapsed header is therefore a pure
 * disclosure, which also means a stray tap on it can no longer wipe the
 * audience.
 *
 * The search rules are deliberately absolute rather than clever: while a query
 * is active there is no master checkbox and no group checkbox, so every box on
 * screen means exactly "this one person can see it". A bulk action over a
 * filtered list is ambiguous in a way users cannot detect afterwards — does
 * "all" mean the three matches or all eighteen friends? — and the damage is
 * silent. Group hits stay tappable and simply end the search.
 */
export function AudienceBench({ index, state, accent, onChange }: AudienceBenchProps) {
  const reducedMotion = useReducedMotion();
  const [query, setQuery] = useState('');
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  /**
   * Collapsed until someone wants to narrow it.
   *
   * Almost every activity goes to everyone, and for that answer a search field
   * plus every group plus every friend is a wall of controls in front of a
   * decision nobody is making. The summary row IS the answer; opening it is the
   * deliberate act of restricting.
   */
  const [expanded, setExpanded] = useState(false);

  const openGroup = useMemo(
    () => index.groups.find((group) => group.id === openGroupId) ?? null,
    [index.groups, openGroupId],
  );

  const friendsByUid = useMemo(() => {
    const map = new Map<string, FriendProfile>();
    for (const friend of index.friends) map.set(friend.uid, friend);
    return map;
  }, [index.friends]);

  const matches = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('de');
    if (!needle) return null;
    return {
      friends: index.friends.filter(
        (friend) =>
          friend.displayName.toLocaleLowerCase('de').includes(needle) ||
          (friend.username?.toLocaleLowerCase('de').includes(needle) ?? false),
      ),
      groups: index.groups.filter((group) => group.name.toLocaleLowerCase('de').includes(needle)),
    };
  }, [index.friends, index.groups, query]);

  const rows = useMemo<Row[]>(() => {
    if (openGroup) {
      return openGroup.memberUids
        .map((uid) => friendsByUid.get(uid))
        .filter((friend): friend is FriendProfile => Boolean(friend))
        .map((friend) => ({ key: `m:${friend.uid}`, type: 'friend' as const, friend }));
    }

    if (matches) {
      const result: Row[] = [];
      if (matches.groups.length > 0) {
        result.push({
          key: 'sec:groups',
          type: 'section',
          label: 'Gruppen',
          hint: 'zum Öffnen tippen',
        });
        for (const group of matches.groups) {
          result.push({
            key: `g:${group.id}`,
            type: 'group',
            group,
            checkable: false,
            openable: (index.groupSizes.get(group.id) ?? 0) > 0,
            fromSearch: true,
          });
        }
      }
      if (matches.friends.length > 0) {
        result.push({ key: 'sec:people', type: 'section', label: 'Personen' });
        for (const friend of matches.friends) {
          result.push({ key: `f:${friend.uid}`, type: 'friend', friend });
        }
      }
      if (result.length === 0) {
        result.push({ key: 'empty', type: 'empty', label: `Keine Treffer für „${query.trim()}“` });
      }
      return result;
    }

    const result: Row[] = [];
    result.push({ key: 'sec:groups', type: 'section', label: 'Gruppen' });
    for (const group of index.groups) {
      // An empty group has nothing to toggle and nothing to drill into, so it
      // renders as a plain informational row rather than as a control that
      // looks live and does nothing.
      const filled = (index.groupSizes.get(group.id) ?? 0) > 0;
      result.push({
        key: `g:${group.id}`,
        type: 'group',
        group,
        checkable: filled,
        openable: filled,
        fromSearch: false,
      });
    }
    result.push({ key: 'sec:friends', type: 'section', label: 'Freunde' });
    if (index.friends.length === 0) {
      result.push({
        key: 'empty',
        type: 'empty',
        label: 'Noch keine Freunde — bisher siehst nur du die Activity.',
      });
      return result;
    }
    for (const friend of index.friends) {
      result.push({ key: `f:${friend.uid}`, type: 'friend', friend });
    }
    return result;
  }, [friendsByUid, index.friends, index.groupSizes, index.groups, matches, openGroup, query]);

  const summary = describeAudience(index, state);

  function toggleFriend(uid: string) {
    onChange(setFriendSelected(index, state, uid, !state.selected.has(uid)));
  }

  function toggleGroup(group: AudienceGroup) {
    const next = nextCheckValue(groupCheckState(index, state, group.id));
    onChange(setGroupSelected(index, state, group.id, next));
  }

  function openGroupFromSearch(group: AudienceGroup) {
    setQuery('');
    setOpenGroupId(group.id);
  }

  const renderRow = ({ item }: { item: Row }) => {
    if (item.type === 'section') {
      return (
        <View style={styles.sectionRow}>
          <Text style={styles.sectionLabel} {...TEXT_CAPPED}>
            {item.label}
          </Text>
          {item.hint ? (
            <Text style={styles.sectionHint} {...TEXT_CAPPED}>
              {item.hint}
            </Text>
          ) : null}
        </View>
      );
    }

    if (item.type === 'empty') {
      return (
        <Text style={styles.emptyRow} {...TEXT_FLEXIBLE}>
          {item.label}
        </Text>
      );
    }

    if (item.type === 'group') {
      const size = index.groupSizes.get(item.group.id) ?? 0;
      const count = state.groupCounts.get(item.group.id) ?? 0;
      const checkState = groupCheckState(index, state, item.group.id);
      const sub = !item.checkable
        ? emptyGroupHint(item.group.id, size)
        : item.fromSearch
          ? `${size} Personen`
          : `${count} von ${size}`;
      const body = (
        <View style={styles.rowText}>
          <Text style={styles.rowTitle} numberOfLines={1} {...TEXT_FLEXIBLE}>
            {item.group.emoji ? `${item.group.emoji} ` : ''}
            {item.group.name}
          </Text>
          <Text style={styles.rowSub} numberOfLines={1} {...TEXT_CAPPED}>
            {sub}
          </Text>
        </View>
      );
      return (
        <View style={styles.row}>
          {/* Two separate accessible elements on purpose: a screen-reader user
              needs both the toggle and the drill-in, and a single row with a
              hidden custom action is something almost nobody discovers. */}
          {item.checkable ? (
            <TriCheckbox
              state={checkState}
              accent={accent}
              accessibilityLabel={`${item.group.name}, ${count} von ${size} ausgewählt`}
              onPress={() => toggleGroup(item.group)}
            />
          ) : (
            <View style={styles.checkboxSpacer}>
              <Ionicons name="people-outline" size={17} color="rgba(244,245,247,0.4)" />
            </View>
          )}
          {item.openable ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.group.name} öffnen`}
              onPress={() =>
                item.fromSearch ? openGroupFromSearch(item.group) : setOpenGroupId(item.group.id)
              }
              style={({ pressed }) => [styles.rowBody, pressed && styles.pressed]}
            >
              {body}
              <Ionicons name="chevron-forward" size={16} color="rgba(244,245,247,0.32)" />
            </Pressable>
          ) : (
            <View style={styles.rowBody}>{body}</View>
          )}
        </View>
      );
    }

    const selected = state.selected.has(item.friend.uid);
    // "Alle Freunde" is omitted: it holds every person, so naming it on every
    // row would print the same word down the whole list and say nothing.
    const groupNames = (index.memberOf.get(item.friend.uid) ?? [])
      .filter((groupId) => groupId !== ALL_FRIENDS_GROUP_ID)
      .map((groupId) => index.groups.find((group) => group.id === groupId)?.name)
      .filter(Boolean)
      .join(' · ');

    return (
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected }}
        accessibilityLabel={item.friend.displayName}
        onPress={() => toggleFriend(item.friend.uid)}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        <PersonAvatar
          avatarUrl={item.friend.avatarUrl}
          initials={initialsOf(item.friend)}
          size={32}
          backgroundColor={tintFor(item.friend.uid)}
          initialsColor="#0B0E13"
        />
        <View style={styles.rowText}>
          <Text
            style={[styles.rowTitle, !selected && styles.rowTitleOff]}
            numberOfLines={1}
            {...TEXT_FLEXIBLE}
          >
            {item.friend.displayName}
          </Text>
          <Text style={styles.rowSub} numberOfLines={1} {...TEXT_CAPPED}>
            {groupNames || (item.friend.username ? `@${item.friend.username}` : ' ')}
          </Text>
        </View>
        {/* Non-interactive: the whole row is the tap target, so a nested
            pressable would only create a dead zone inside it. Hidden from
            accessibility as well — the row already carries the checkbox role,
            and a second one would be announced twice. */}
        <View pointerEvents="none" importantForAccessibility="no-hide-descendants">
          <TriCheckbox
            state={selected ? 'on' : 'off'}
            accent={accent}
            accessibilityLabel={item.friend.displayName}
            onPress={() => undefined}
          />
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.root}>
      {/* Summary first in the tree so a screen reader reads the consequence
          before the controls that change it. */}
      {expanded ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Wer kann es sehen. Schließen"
          accessibilityState={{ expanded: true }}
          onPress={() => {
            setQuery('');
            setOpenGroupId(null);
            setExpanded(false);
          }}
          style={styles.summary}
        >
          <View style={styles.checkboxSpacer} />
          <Text style={styles.summaryHeading} numberOfLines={1} {...TEXT_FLEXIBLE}>
            Wer kann es sehen
          </Text>
          <Ionicons name="chevron-up" size={17} color="rgba(244,245,247,0.4)" />
        </Pressable>
      ) : (
        <AudienceSummary
          label={summary.label}
          detail={summary.detail ?? undefined}
          empty={summary.empty}
          leading={
            <Ionicons
              name={summary.empty ? 'eye-off-outline' : 'people'}
              size={17}
              color={summary.empty ? '#E8756B' : accent}
            />
          }
          trailing={<Ionicons name="chevron-down" size={17} color="rgba(244,245,247,0.4)" />}
          accessibilityLabel={`Sichtbar für ${summary.label}${summary.detail ? `, ${summary.detail}` : ''}. Ändern`}
          accessibilityExpanded={false}
          onPress={() => setExpanded(true)}
          theme={{
            text: '#F4F5F7',
            muted: 'rgba(244,245,247,0.42)',
            accent,
            empty: '#E8756B',
            emptySoft: 'rgba(232,117,107,0.16)',
            accentSoft: `${accent}22`,
            fonts: NATIVE_FONTS,
          }}
        />
      )}

      {!expanded ? null : openGroup ? (
        <View style={styles.groupHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Zurück zur Übersicht"
            onPress={() => setOpenGroupId(null)}
            hitSlop={8}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          >
            <Ionicons name="chevron-back" size={18} color="#F4F5F7" />
          </Pressable>
          <TriCheckbox
            state={groupCheckState(index, state, openGroup.id)}
            accent={accent}
            accessibilityLabel={`Ganze Gruppe ${openGroup.name}`}
            onPress={() => toggleGroup(openGroup)}
          />
          <View style={styles.rowText}>
            <Text style={styles.rowTitle} numberOfLines={1} {...TEXT_FLEXIBLE}>
              {openGroup.name}
            </Text>
            <Text style={styles.rowSub} {...TEXT_CAPPED}>
              {state.groupCounts.get(openGroup.id) ?? 0} von {openGroup.memberUids.length} dabei
            </Text>
          </View>
        </View>
      ) : (
        <SearchField
          accessibilityLabel="Person oder Gruppe suchen"
          clearAccessibilityLabel="Suche löschen"
          containerStyle={styles.search}
          inputStyle={styles.searchInput}
          placeholder="Person oder Gruppe suchen"
          value={query}
          onChangeText={setQuery}
          variant="pill"
        />
      )}

      {/* Deliberately NOT a FlatList and deliberately not scrollable.
          It lives inside the composer's own ScrollView, and a virtualised list
          nested in a scroller of the same orientation is a documented React
          Native error: the two fight over the drag, rows get clipped rather
          than scrolled, and virtualisation cannot measure anything. Rendering
          the rows plainly lets the ONE outer scroller own the gesture. The
          cost is real but bounded — a direct friend list, rendered as simple
          rows, is the kind of length RN handles without virtualisation. */}
      {expanded ? (
        <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(160)}>
          {rows.map((row) => (
            <View key={row.key}>{renderRow({ item: row })}</View>
          ))}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 999,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  checkboxSpacer: { alignItems: 'center', height: 24, justifyContent: 'center', width: 24 },
  emptyRow: {
    color: 'rgba(244,245,247,0.5)',
    fontFamily: FONT.medium,
    fontSize: TYPE.caption.fontSize,
    paddingVertical: 14,
    textAlign: 'center',
  },
  groupHeader: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    flexDirection: 'row',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 10,
  },
  pressed: { opacity: 0.7 },
  root: { gap: 9 },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 11,
    minHeight: 48,
    paddingVertical: 4,
  },
  rowBody: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 10, minHeight: 44 },
  rowSub: {
    color: 'rgba(244,245,247,0.42)',
    fontFamily: FONT.medium,
    fontSize: TYPE.micro.fontSize,
    marginTop: 1,
  },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { color: '#F4F5F7', fontFamily: FONT.semibold, fontSize: TYPE.label.fontSize },
  rowTitleOff: { color: 'rgba(244,245,247,0.5)' },
  search: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 42,
    paddingHorizontal: 13,
  },
  searchInput: {
    color: '#F4F5F7',
    flex: 1,
    fontFamily: FONT.medium,
    fontSize: TYPE.label.fontSize,
    paddingVertical: 0,
  },
  sectionHint: {
    color: 'rgba(244,245,247,0.32)',
    fontFamily: FONT.medium,
    fontSize: TYPE.micro.fontSize,
  },
  sectionLabel: {
    color: 'rgba(244,245,247,0.34)',
    fontFamily: FONT.semibold,
    fontSize: TYPE.micro.fontSize,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  sectionRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 4,
    paddingTop: 12,
  },
  summary: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 11,
    minHeight: 44,
  },
  summaryDetail: {
    color: 'rgba(244,245,247,0.45)',
    fontFamily: FONT.medium,
    fontSize: TYPE.micro.fontSize,
    marginTop: 2,
  },
  summaryHeading: {
    color: 'rgba(244,245,247,0.62)',
    flex: 1,
    fontFamily: FONT.semibold,
    fontSize: TYPE.label.fontSize,
    minWidth: 0,
  },
  summaryIcon: {
    alignItems: 'center',
    borderRadius: 999,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  summaryLine: { color: '#F4F5F7', fontFamily: FONT.semibold, fontSize: TYPE.label.fontSize },
  summaryText: { flex: 1, minWidth: 0 },
});
