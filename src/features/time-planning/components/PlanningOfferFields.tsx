import { Ionicons } from '@expo/vector-icons';
import { memo, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Animated, {
  FadeInDown,
  FadeOutUp,
  LinearTransition,
  useReducedMotion,
  type SharedValue,
  useSharedValue,
} from 'react-native-reanimated';

import {
  TimeBand,
  type LinkedTimePreview,
  type Span,
  type TimeBandDensity,
  type TimeBandDragKind,
} from '@/features/activities/components/TimeBand';

import type { TimePlanOfferGroup, TimePlanWindow } from '../types';

const ACCENT = '#E0A23E';
const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTES_PER_DAY = 24 * 60;
const MAX_PLAN_DURATION_MINUTES = 12 * 60;
const PLANNING_RAIL_MINUTES = MINUTES_PER_DAY + MAX_PLAN_DURATION_MINUTES;
const DEFAULT_START_MINUTES = 18 * 60;
const DEFAULT_END_MINUTES = 21 * 60;
const MIN_PLAN_DURATION_MINUTES = 30;
const MAX_WINDOWS = 50;
const CHOOSER_DAYS = 31;
const EMPTY_LINKED_PREVIEW: LinkedTimePreview = {
  sourceId: '',
  startMinutes: 0,
  endMinutes: 0,
  pixelsPerMinute: 0,
  railOffset: 0,
  revision: 0,
};

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateFromKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function atMinutes(key: string, minutes: number): Date {
  const next = dateFromKey(key);
  next.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return next;
}

function isSameDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function roundUpToFiveMinutes(date: Date): number {
  return Math.min(MINUTES_PER_DAY, Math.ceil((date.getHours() * 60 + date.getMinutes()) / 5) * 5);
}

function defaultsForDay(day: Date, now: Date) {
  if (!isSameDay(day, now)) {
    return { startMinutes: DEFAULT_START_MINUTES, endMinutes: DEFAULT_END_MINUTES };
  }
  const startMinutes = Math.max(DEFAULT_START_MINUTES, roundUpToFiveMinutes(now));
  return {
    startMinutes,
    endMinutes: startMinutes + (DEFAULT_END_MINUTES - DEFAULT_START_MINUTES),
  };
}

function spanFor(row: TimePlanOfferGroup): Span {
  const key = row.dateKeys[0];
  return {
    startMs: atMinutes(key, row.startMinutes).getTime(),
    endMs: atMinutes(key, row.endMinutes).getTime(),
  };
}

function minutesFor(key: string, span: Span) {
  const dayStart = atMinutes(key, 0).getTime();
  return {
    start: Math.round((span.startMs - dayStart) / 60_000),
    end: Math.round((span.endMs - dayStart) / 60_000),
  };
}

function clock(minutes: number): string {
  const localMinutes = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${Math.floor(localMinutes / 60)
    .toString()
    .padStart(2, '0')}:${(localMinutes % 60).toString().padStart(2, '0')}`;
}

function clockWithDayOffset(minutes: number): string {
  const dayOffset = Math.floor(minutes / MINUTES_PER_DAY);
  return `${clock(minutes)}${dayOffset > 0 ? ` +${dayOffset}` : ''}`;
}

function shortDay(day: Date): string {
  return day.toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', '');
}

function fullDay(day: Date): string {
  return day
    .toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' })
    .replace('.', '');
}

function nextGroupId(): string {
  return `offer_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/** One editor row maps to one source day. Older grouped drafts are expanded locally. */
function asDayGroups(groups: TimePlanOfferGroup[]): TimePlanOfferGroup[] {
  return groups
    .flatMap((group) =>
      group.dateKeys.map((key) => ({
        ...group,
        id: group.dateKeys.length === 1 ? group.id : `${group.id}_${key.replaceAll('-', '')}`,
        dateKeys: [key],
      })),
    )
    .sort((left, right) => left.dateKeys[0].localeCompare(right.dateKeys[0]));
}

export function initialPlanningOfferGroups(): TimePlanOfferGroup[] {
  return [];
}

/** Turns the local editor state into one concrete source window per date. */
export function offerGroupsToWindows(groups: TimePlanOfferGroup[]): TimePlanWindow[] {
  return groups.flatMap((group) =>
    group.dateKeys.map((key) => {
      const start = atMinutes(key, group.startMinutes);
      const end = atMinutes(key, group.endMinutes);
      return {
        id: `${group.id}_${key.replaceAll('-', '')}`,
        groupId: group.id,
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
      };
    }),
  );
}

const TimePlanDayRow = memo(function TimePlanDayRow({
  row,
  linked,
  syncLinked,
  isLinkedMaster,
  linkedSnapshot,
  activeKind,
  nowMs,
  compact,
  density,
  railOffset,
  onToggleLink,
  onRemove,
  onCommit,
  onDragKindChange,
  onRailOffsetCommit,
  linkedTimeline,
}: {
  row: TimePlanOfferGroup;
  linked: boolean;
  syncLinked: boolean;
  isLinkedMaster: boolean;
  linkedSnapshot?: LinkedTimePreview;
  activeKind: TimeBandDragKind | null;
  nowMs: number;
  compact: boolean;
  density: TimeBandDensity;
  railOffset?: number;
  onToggleLink: (id: string) => void;
  onRemove: (row: TimePlanOfferGroup) => void;
  onCommit: (row: TimePlanOfferGroup, span: Span) => void;
  onDragKindChange: (id: string, kind: TimeBandDragKind | null) => void;
  onRailOffsetCommit: (id: string, offset: number) => void;
  linkedTimeline: SharedValue<LinkedTimePreview>;
}) {
  const key = row.dateKeys[0];
  const day = dateFromKey(key);
  const railNowMs = isSameDay(day, new Date(nowMs)) ? nowMs : atMinutes(key, 0).getTime();
  const committed = spanFor(row);
  const [preview, setPreview] = useState<Span>(committed);
  const visible = minutesFor(key, preview);
  const startHighlighted = activeKind === 'start' || activeKind === 'move';
  const endHighlighted = activeKind === 'end' || activeKind === 'move';

  useEffect(() => {
    setPreview(committed);
  }, [committed.endMs, committed.startMs]);

  return (
    <Animated.View
      entering={FadeInDown.duration(180)}
      exiting={FadeOutUp.duration(140)}
      layout={LinearTransition.duration(220)}
      className="rounded-2xl p-1"
      style={{ backgroundColor: linked ? `${ACCENT}14` : 'transparent' }}
    >
      <View className="mb-1 flex-row items-center px-1" style={{ height: compact ? 20 : 22 }}>
        <Text className="w-[112px] text-xs font-extrabold text-white" numberOfLines={1}>
          {fullDay(day)}
        </Text>
        <View className="flex-1 flex-row items-center">
          <Text
            className="text-xs font-extrabold"
            style={{ color: startHighlighted ? '#F4F5F7' : 'rgba(244,245,247,0.58)' }}
          >
            {clockWithDayOffset(visible.start)}
          </Text>
          <Text className="px-1 text-xs font-semibold text-white/35">–</Text>
          <Text
            className="text-xs font-extrabold"
            style={{ color: endHighlighted ? '#F4F5F7' : 'rgba(244,245,247,0.58)' }}
          >
            {clockWithDayOffset(visible.end)}
          </Text>
        </View>
        {/* Removing a window belongs on the window. The day chooser can still
            un-toggle it, but that means going back to the other stage for
            something the row itself makes obvious. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${fullDay(day)} entfernen`}
          hitSlop={8}
          className="h-6 w-6 items-center justify-center rounded-full active:opacity-60"
          onPress={() => onRemove(row)}
        >
          <Ionicons name="close" size={14} color="rgba(244,245,247,0.45)" />
        </Pressable>
      </View>

      <View className="flex-row items-center" style={{ gap: compact ? 6 : 8 }}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: linked }}
          accessibilityLabel={`${fullDay(day)} gemeinsam bearbeiten`}
          className="h-11 w-11 items-center justify-center rounded-2xl border active:opacity-75"
          style={{
            backgroundColor: linked ? `${ACCENT}20` : 'rgba(255,255,255,0.04)',
            borderColor: linked ? `${ACCENT}AA` : 'rgba(255,255,255,0.10)',
          }}
          onPress={() => onToggleLink(row.id)}
        >
          <Ionicons
            name={linked ? 'checkmark' : 'ellipse-outline'}
            size={linked ? 20 : 18}
            color={linked ? ACCENT : 'rgba(244,245,247,0.52)'}
          />
        </Pressable>
        <View className="flex-1">
          <TimeBand
            startMs={committed.startMs}
            endMs={committed.endMs}
            originMs={atMinutes(key, 0).getTime()}
            railMinutes={PLANNING_RAIL_MINUTES}
            accent={ACCENT}
            startFixed={false}
            nowMs={railNowMs}
            minDurationMinutes={MIN_PLAN_DURATION_MINUTES}
            commitOnFinalize
            keepSpanVisible
            density={density}
            spanLabel={`${clockWithDayOffset(visible.start)}–${clockWithDayOffset(visible.end)}`}
            linkedSync={
              syncLinked
                ? {
                    id: row.id,
                    isMaster: isLinkedMaster,
                    initialSnapshot: linkedSnapshot,
                    timeline: linkedTimeline,
                  }
                : undefined
            }
            railOffset={railOffset}
            onPreviewChange={(span, offset) => {
              setPreview(span);
            }}
            onLinkedPreviewChange={setPreview}
            onDragKindChange={(kind) => onDragKindChange(row.id, kind)}
            onRailOffsetCommit={(offset) => onRailOffsetCommit(row.id, offset)}
            onChange={(span) => onCommit(row, span)}
          />
        </View>
      </View>
    </Animated.View>
  );
});

/**
 * Multiple time windows to vote on, inside the composer's Wann workbench.
 *
 * The day chooser stays on screen the whole time (product decision, August
 * 2026 — this replaced a staged version where picking a day folded the chooser
 * away and a "Weiterer Tag" button was the only way back). Proposing days is
 * not a step you finish; it is the thing you keep doing while you look at the
 * rails you already have, and hiding the chooser meant every additional day
 * cost a tap on a button whose only job was to undo the hiding.
 *
 * The cost is height: chooser plus a stack of rails is more than one
 * screenful, which is what the staging was avoiding. That is carried by the
 * composer's ScrollView — the sheet caps at its own ceiling and scrolls — and
 * not by hiding half the control.
 */
export function PlanningOfferFields({
  groups,
  onChange,
  onExit,
}: {
  groups: TimePlanOfferGroup[];
  onChange: (groups: TimePlanOfferGroup[]) => void;
  /** Back to a single fixed time. */
  onExit?: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const [today] = useState(() => startOfDay(new Date()));
  const [linkedRowIds, setLinkedRowIds] = useState<string[]>([]);
  const [linkedSnapshot, setLinkedSnapshot] = useState<LinkedTimePreview>();
  const [dragState, setDragState] = useState<{ id: string; kind: TimeBandDragKind } | null>(null);
  const [railOffsets, setRailOffsets] = useState<Record<string, number>>({});
  const linkedTimeline = useSharedValue<LinkedTimePreview>({ ...EMPTY_LINKED_PREVIEW });
  const currentNow = new Date();
  const rows = useMemo(() => asDayGroups(groups), [groups]);
  const rowIds = useMemo(() => new Set(rows.map((row) => row.id)), [rows]);
  const linkedIds = linkedRowIds.filter((id) => rowIds.has(id));
  const linkedReference = rows.find((row) => row.id === linkedIds[0]);

  useEffect(() => {
    if (linkedIds.length < 2) {
      linkedTimeline.value = { ...EMPTY_LINKED_PREVIEW };
      setLinkedSnapshot(undefined);
    }
  }, [linkedIds.length, linkedTimeline]);
  const isAtWindowLimit = rows.length >= MAX_WINDOWS;
  const compact = rows.length >= 3;
  // One window can have the scheduler's full band; every further one is paid
  // again in height, so the rows give up chrome as the stack grows.
  const bandDensity: TimeBandDensity =
    rows.length <= 1 ? 'regular' : rows.length === 2 ? 'snug' : 'compact';
  const days = useMemo(
    () =>
      Array.from(
        { length: CHOOSER_DAYS },
        (_, index) => new Date(today.getTime() + index * DAY_MS),
      ),
    [today],
  );

  function writeRows(nextRows: TimePlanOfferGroup[]) {
    onChange(
      [...nextRows].sort((left, right) => left.dateKeys[0].localeCompare(right.dateKeys[0])),
    );
  }

  function removeRow(row: TimePlanOfferGroup) {
    const remaining = rows.filter((item) => item.id !== row.id);
    writeRows(remaining);
    setLinkedRowIds((current) => current.filter((id) => id !== row.id));
    setRailOffsets((current) => {
      const { [row.id]: _removed, ...rest } = current;
      return rest;
    });
    if (dragState?.id === row.id) setDragState(null);
  }

  function toggleDate(day: Date) {
    const key = dateKey(day);
    const row = rows.find((item) => item.dateKeys[0] === key);
    if (row) {
      removeRow(row);
      return;
    }
    if (isAtWindowLimit) return;
    const defaults = defaultsForDay(day, new Date());
    if (defaults.endMinutes - defaults.startMinutes < MIN_PLAN_DURATION_MINUTES) return;
    writeRows([
      ...rows,
      {
        id: nextGroupId(),
        dateKeys: [key],
        ...defaults,
      },
    ]);
  }

  function toggleLink(rowId: string) {
    if (linkedIds.includes(rowId)) {
      setLinkedRowIds((current) => current.filter((id) => id !== rowId));
      return;
    }
    if (linkedReference) {
      const currentSnapshot = linkedTimeline.value;
      if (currentSnapshot.revision > 0) setLinkedSnapshot({ ...currentSnapshot });
      writeRows(
        rows.map((row) =>
          row.id === rowId
            ? {
                ...row,
                startMinutes: linkedReference.startMinutes,
                endMinutes: linkedReference.endMinutes,
              }
            : row,
        ),
      );
      const referenceOffset = railOffsets[linkedReference.id];
      if (referenceOffset != null) {
        setRailOffsets((current) => ({ ...current, [rowId]: referenceOffset }));
      }
    }
    setLinkedRowIds([...linkedIds, rowId]);
  }

  function commitRailOffset(sourceId: string, offset: number) {
    const targetIds =
      linkedIds.length >= 2 && linkedIds.includes(sourceId) ? linkedIds : [sourceId];
    setRailOffsets((current) => {
      const unchanged = targetIds.every((id) => current[id] === offset);
      if (unchanged) return current;
      const next = { ...current };
      targetIds.forEach((id) => {
        next[id] = offset;
      });
      return next;
    });
  }

  function applySpan(source: TimePlanOfferGroup, span: Span) {
    const key = source.dateKeys[0];
    const dayStart = atMinutes(key, 0).getTime();
    const dayEnd = dayStart + PLANNING_RAIL_MINUTES * 60_000;
    if (span.startMs < dayStart || span.endMs > dayEnd) return;
    const startMinutes = Math.round((span.startMs - dayStart) / 60_000);
    const endMinutes = Math.round((span.endMs - dayStart) / 60_000);
    const targetIds =
      linkedIds.length >= 2 && linkedIds.includes(source.id) ? linkedIds : [source.id];
    writeRows(
      rows.map((row) => (targetIds.includes(row.id) ? { ...row, startMinutes, endMinutes } : row)),
    );
  }

  function activeKindFor(row: TimePlanOfferGroup): TimeBandDragKind | null {
    if (!dragState) return null;
    if (dragState.id === row.id) return dragState.kind;
    if (linkedIds.length >= 2 && linkedIds.includes(dragState.id) && linkedIds.includes(row.id)) {
      return dragState.kind;
    }
    return null;
  }

  return (
    <Animated.View
      layout={reducedMotion ? undefined : LinearTransition.duration(220)}
      className="gap-3"
    >
      <View className="flex-row items-center gap-2">
        <Text className="flex-1 text-sm font-bold text-white">
          {rows.length === 0
            ? 'Mögliche Zeiten festlegen'
            : `${rows.length} Zeitfenster zur Abstimmung`}
        </Text>
        {/* Leaving is always one tap away, from either stage — proposing times
            is a detour inside the composer, never a mode you get stuck in. */}
        {onExit ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Doch einen festen Termin wählen"
            className="h-9 flex-row items-center gap-1 rounded-full bg-white/8 px-3 active:opacity-70"
            onPress={onExit}
          >
            <Ionicons name="close" size={14} color="rgba(244,245,247,0.7)" />
            <Text className="text-[11px] font-bold text-white/70">Fester Termin</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Always on screen: adding a day is not a step you finish, so it must
          not cost a tap to get back to. */}
      <View className="gap-2">
          <Text className="text-xs font-medium leading-4 text-white/45">Wähle die Tage aus</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingRight: 8 }}
          >
            {days.map((day) => {
          const key = dateKey(day);
          const selected = rows.some((row) => row.dateKeys[0] === key);
          return (
            <Pressable
              key={key}
              accessibilityRole="checkbox"
              accessibilityState={{
                checked: selected,
                disabled: !selected && isAtWindowLimit,
              }}
              accessibilityLabel={selected ? `${fullDay(day)} entfernen` : fullDay(day)}
              disabled={!selected && isAtWindowLimit}
              className="h-[66px] w-[52px] items-center justify-center rounded-2xl border active:opacity-75"
              style={{
                backgroundColor: selected ? `${ACCENT}24` : 'rgba(255,255,255,0.035)',
                borderColor: selected ? `${ACCENT}AA` : 'rgba(255,255,255,0.09)',
                opacity: !selected && isAtWindowLimit ? 0.35 : 1,
              }}
              onPress={() => toggleDate(day)}
            >
              <Text
                className="text-[10px] font-bold"
                style={{ color: selected ? ACCENT : 'rgba(255,255,255,0.58)' }}
              >
                {shortDay(day)}
              </Text>
              <Text className="mt-0.5 text-xs font-extrabold text-white">{day.getDate()}.</Text>
              <View
                className="mt-1.5 h-3 w-3 items-center justify-center rounded-full"
                style={{ backgroundColor: selected ? ACCENT : 'rgba(255,255,255,0.12)' }}
              >
                {selected ? <Ionicons name="checkmark" size={10} color="#17130D" /> : null}
              </View>
            </Pressable>
          );
            })}
          </ScrollView>
      </View>

      {linkedIds.length >= 2 ? (
        <Animated.View
          entering={FadeInDown.duration(150)}
          exiting={FadeOutUp.duration(120)}
          className="flex-row items-center justify-between rounded-2xl border border-[#E0A23E]/45 bg-[#E0A23E]/[0.10] px-3 py-2"
        >
          <View className="flex-row items-center gap-2">
            <Ionicons name="link-outline" size={16} color={ACCENT} />
            <Text className="text-xs font-extrabold" style={{ color: ACCENT }}>
              {linkedIds.length} gemeinsam ·{' '}
              {linkedReference
                ? `${clockWithDayOffset(linkedReference.startMinutes)}–${clockWithDayOffset(linkedReference.endMinutes)}`
                : ''}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Gemeinsame Auswahl aufheben"
            className="h-9 w-9 items-center justify-center rounded-full active:opacity-70"
            onPress={() => setLinkedRowIds([])}
          >
            <Ionicons name="close" size={17} color={ACCENT} />
          </Pressable>
        </Animated.View>
      ) : null}

      {rows.length === 0 ? null : (
        <Animated.View
          key="windows"
          entering={reducedMotion ? undefined : FadeInDown.duration(220)}
          exiting={reducedMotion ? undefined : FadeOutUp.duration(140)}
          className="gap-2"
          style={{ gap: compact ? 6 : 8 }}
        >
          {rows.map((row) => (
            <TimePlanDayRow
              key={row.id}
              row={row}
              linked={linkedIds.includes(row.id)}
              syncLinked={linkedIds.length >= 2 && linkedIds.includes(row.id)}
              isLinkedMaster={linkedIds[0] === row.id}
              linkedSnapshot={linkedSnapshot}
              activeKind={activeKindFor(row)}
              nowMs={currentNow.getTime()}
              compact={compact}
              density={bandDensity}
              railOffset={railOffsets[row.id]}
              onToggleLink={toggleLink}
              onRemove={removeRow}
              onCommit={applySpan}
              onDragKindChange={(id, kind) => setDragState(kind ? { id, kind } : null)}
              onRailOffsetCommit={commitRailOffset}
              linkedTimeline={linkedTimeline}
            />
          ))}

        </Animated.View>
      )}
    </Animated.View>
  );
}
