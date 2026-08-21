import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { useThemeColors } from '@/features/theme';
import { TEXT_FLEXIBLE } from '@/shared/theme';

import { FRAME_COLOR } from '../planningTheme';
import type { TimePlanMember } from '../types';

/**
 * The compact head of a running round: who is in, and how the scheduling is
 * going. Two rows, ONE list — a hairline between them, a single border around
 * both — because they are two facts about the same thing and separate cards
 * would read as two unrelated widgets stacked by accident.
 *
 * Geometry, type and chevron are copied from the participant row in
 * `ActivityContent` on purpose. This surface has to feel like the same family;
 * a row that is four pixels taller or a shade bolder is exactly the kind of
 * difference nobody can name and everybody notices.
 *
 * The scheduling row deliberately gets NO avatar stack. Two stacked rows that
 * both open with a cluster of faces are hard to tell apart at a glance, and
 * the left edge is the cheapest place to make them distinct.
 */

const ICON_SLOT = 40;

function Row({
  label,
  detail,
  accessibilityLabel,
  onPress,
  children,
}: {
  label: string;
  detail?: string;
  accessibilityLabel: string;
  onPress: () => void;
  children: React.ReactNode;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className="min-h-16 flex-row items-center gap-3 px-3.5 py-2.5 active:opacity-75"
      onPress={onPress}
    >
      {children}
      <View className="flex-1">
        <Text {...TEXT_FLEXIBLE} className="text-sm font-bold text-foreground">
          {label}
        </Text>
        {detail ? (
          <Text
            {...TEXT_FLEXIBLE}
            // Two lines, not one: "18 von 20 Antworten · Aktueller Favorit:
            // Mi 26.8., 09:00–14:00" does not fit beside an icon and a chevron,
            // and clamping it hid the very time the row exists to report. The
            // row is min-height, not fixed, so it simply grows — which is also
            // what keeps it honest at large Dynamic Type sizes.
            numberOfLines={2}
            className="mt-0.5 text-xs text-muted-foreground"
          >
            {detail}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
    </Pressable>
  );
}

export function TimePlanRows({
  members,
  memberCount,
  status,
  onOpenMembers,
  onOpenMatching,
}: {
  /** Loaded only for people who have answered; empty otherwise, which is why
   * the count comes separately. */
  members: TimePlanMember[];
  memberCount: number;
  /** The scheduling line, already worded by `describePlanStatus`. */
  status: string;
  onOpenMembers: () => void;
  onOpenMatching: () => void;
}) {
  const shown = members.slice(0, 4);
  const countLabel = `${memberCount} dabei`;
  const names = members.slice(0, 3).map((member) => member.displayName);
  const detail =
    names.length > 0 && memberCount <= 3
      ? names.join(', ')
      : memberCount > 0
        ? `Alle ${memberCount} ansehen`
        : 'Noch niemand dabei';

  return (
    <View className="mt-4 overflow-hidden rounded-2xl border border-border bg-background/35">
      <Row
        label={countLabel}
        detail={detail}
        accessibilityLabel={`Teilnehmer ansehen, ${countLabel}`}
        onPress={onOpenMembers}
      >
        <View className="flex-row" style={{ minWidth: ICON_SLOT }}>
          {shown.length > 0 ? (
            shown.map((member, index) => (
              <View
                key={member.uid}
                className="h-9 w-9 items-center justify-center overflow-hidden rounded-full border-2 border-card bg-secondary"
                style={{ marginLeft: index === 0 ? 0 : -10, zIndex: shown.length + 1 - index }}
              >
                <Text className="text-xs font-bold text-foreground">{member.initials}</Text>
              </View>
            ))
          ) : (
            <View className="h-9 w-9 items-center justify-center rounded-full border-2 border-card bg-secondary">
              <Ionicons name="people-outline" size={16} color={FRAME_COLOR} />
            </View>
          )}
        </View>
      </Row>

      <View className="h-px bg-border" />

      <Row
        label="Terminfindung"
        detail={status}
        accessibilityLabel={`Terminfindung öffnen, ${status}`}
        onPress={onOpenMatching}
      >
        <View className="items-center justify-center" style={{ width: ICON_SLOT }}>
          <Ionicons name="calendar-outline" size={22} color={FRAME_COLOR} />
        </View>
      </Row>
    </View>
  );
}

/**
 * The round's members, for the drill-in behind the first row.
 *
 * Empty for anyone who has not answered — `timePlanMembers` is closed to them
 * by the rules, and that is deliberate: whoever has not shared their own times
 * does not read the others'. The empty state says so instead of rendering a
 * blank list, which would read as a round nobody joined.
 */
export function TimePlanMembersList({
  members,
  currentUid,
  hostId,
  canRead,
}: {
  members: TimePlanMember[];
  currentUid?: string;
  hostId: string;
  canRead: boolean;
}) {
  if (!canRead) {
    return (
      <Text {...TEXT_FLEXIBLE} className="py-2 text-sm text-muted-foreground">
        Wer schon dabei ist, siehst du, sobald du selbst geantwortet hast.
      </Text>
    );
  }

  return (
    <View>
      {members.map((member) => (
        <View key={member.uid} className="min-h-12 flex-row items-center gap-3 py-2">
          <View className="h-9 w-9 items-center justify-center rounded-full bg-card">
            <Text className="text-sm font-bold text-foreground">{member.initials}</Text>
          </View>
          <View className="flex-1">
            <Text {...TEXT_FLEXIBLE} numberOfLines={1} className="text-base font-medium text-foreground">
              {member.displayName}
              {member.uid === currentUid ? '  (Du)' : ''}
            </Text>
          </View>
          {member.uid === hostId ? (
            <Text {...TEXT_FLEXIBLE} className="text-xs text-muted-foreground">
              Host
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}
