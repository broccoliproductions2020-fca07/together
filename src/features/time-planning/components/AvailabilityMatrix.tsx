import { Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';

import type { TimePlanMember, TimePlanWindow } from '../types';
import { fullAvailability } from '../utils/intervals';
import { AvailabilityMiniBand } from './AvailabilityBand';

const HOST = '#E0A23E';
const MEMBER = '#41C08D';
const ACTIVE_WIDTH = 176;
const COMPACT_WIDTH = 94;

type TimelineItem =
  | { kind: 'window'; window: TimePlanWindow }
  | { kind: 'gap'; id: string; label: string };

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
}

function clock(iso: string): string {
  const date = new Date(iso);
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

function gapLabel(from: string, to: string): string | null {
  const difference = new Date(to).getTime() - new Date(from).getTime();
  if (difference <= 3 * 60 * 60 * 1000) return null;
  const days = Math.floor(difference / (24 * 60 * 60 * 1000));
  return days ? `${days} T` : `${Math.round(difference / (60 * 60 * 1000))} Std`;
}

function timelineItems(windows: TimePlanWindow[]): TimelineItem[] {
  const sorted = [...windows].sort((first, second) => new Date(first.startsAt).getTime() - new Date(second.startsAt).getTime());
  return sorted.flatMap((window, index) => {
    const previous = sorted[index - 1];
    const gap = previous ? gapLabel(previous.endsAt, window.startsAt) : null;
    return gap ? [{ kind: 'gap' as const, id: `${previous.id}_${window.id}`, label: gap }, { kind: 'window' as const, window }] : [{ kind: 'window' as const, window }];
  });
}

function intervalsFor(member: TimePlanMember, window: TimePlanWindow) {
  if (member.role === 'host') return fullAvailability(window);
  return member.responseStatus === 'responded' ? (member.responsesByWindow[window.id] ?? []) : null;
}

/**
 * One shared, compressed chronological axis makes every member row directly comparable.
 * Gaps are compressed globally, never separately per person.
 */
export function AvailabilityMatrix({
  windows,
  members,
  activeWindowId,
  onSelectWindow,
}: {
  windows: TimePlanWindow[];
  members: TimePlanMember[];
  activeWindowId?: string;
  onSelectWindow?: (window: TimePlanWindow) => void;
}) {
  const items = timelineItems(windows);
  const pendingCount = members.filter((member) => member.role === 'member' && member.responseStatus === 'pending').length;

  return (
    <View className="gap-3 rounded-3xl border border-white/10 p-4" style={{ backgroundColor: 'rgba(255,255,255,0.035)' }}>
      <View className="flex-row items-baseline justify-between gap-3">
        <View>
          <Text className="text-sm font-bold text-white">Gemeinsame Übersicht</Text>
          <Text className="mt-0.5 text-xs text-white/45">Alle Zeilen nutzen dieselbe Zeitachse.</Text>
        </View>
        {pendingCount ? <Text className="text-xs font-semibold text-white/45">{pendingCount} offen</Text> : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 4 }}>
        <Animated.View layout={LinearTransition.duration(180)} className="gap-2">
          <View className="flex-row items-end gap-1.5">
            <View className="w-[82px]" />
            {items.map((item) => {
              if (item.kind === 'gap') {
                return (
                  <View key={item.id} className="w-8 items-center">
                    <Text className="text-center text-[9px] font-bold text-white/30">{item.label}</Text>
                    <Text className="mt-0.5 text-[10px] text-white/20">···</Text>
                  </View>
                );
              }
              const active = item.window.id === activeWindowId;
              return (
                <Pressable
                  key={item.window.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${dateLabel(item.window.startsAt)}, ${clock(item.window.startsAt)} bis ${clock(item.window.endsAt)} auswählen`}
                  className="rounded-xl px-2 py-1.5 active:opacity-75"
                  style={{ width: active ? ACTIVE_WIDTH : COMPACT_WIDTH, backgroundColor: active ? `${HOST}18` : 'rgba(255,255,255,0.035)' }}
                  onPress={() => onSelectWindow?.(item.window)}
                >
                  <Text className="text-[10px] font-extrabold" style={{ color: active ? HOST : 'rgba(244,245,247,0.6)' }} numberOfLines={1}>{dateLabel(item.window.startsAt)}</Text>
                  <Text className="mt-0.5 text-[10px] font-semibold text-white/42">{clock(item.window.startsAt)}–{clock(item.window.endsAt)}</Text>
                </Pressable>
              );
            })}
          </View>

          {members.map((member) => (
            <View key={member.uid} className="flex-row items-center gap-1.5">
              <View className="w-[82px] flex-row items-center gap-1.5 pr-1">
                <View className="h-7 w-7 items-center justify-center rounded-full" style={{ backgroundColor: member.role === 'host' ? `${HOST}24` : `${MEMBER}20` }}>
                  <Text className="text-[10px] font-extrabold" style={{ color: member.role === 'host' ? HOST : '#6BDBA8' }}>{member.initials}</Text>
                </View>
                <Text className="flex-1 text-[11px] font-semibold text-white/75" numberOfLines={1}>{member.displayName}</Text>
              </View>
              {items.map((item) => {
                if (item.kind === 'gap') return <View key={item.id} className="w-8" />;
                const intervals = intervalsFor(member, item.window);
                const active = item.window.id === activeWindowId;
                return (
                  <Pressable
                    key={item.window.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${member.displayName}, ${dateLabel(item.window.startsAt)} auswählen`}
                    className="justify-center rounded-xl border px-1.5 py-1 active:opacity-75"
                    style={{ width: active ? ACTIVE_WIDTH : COMPACT_WIDTH, minHeight: 38, borderColor: active ? `${HOST}70` : 'rgba(255,255,255,0.07)', backgroundColor: intervals === null ? 'rgba(255,255,255,0.018)' : 'rgba(255,255,255,0.035)' }}
                    onPress={() => onSelectWindow?.(item.window)}
                  >
                    {intervals === null ? (
                      <Text className="text-center text-[10px] font-semibold text-white/30">offen</Text>
                    ) : (
                      <AvailabilityMiniBand window={item.window} intervals={intervals} color={member.role === 'host' ? HOST : MEMBER} />
                    )}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </Animated.View>
      </ScrollView>
    </View>
  );
}
