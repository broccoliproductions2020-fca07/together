import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useCallback, useMemo, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';

import type { TimePlanInterval, TimePlanWindow } from '../types';
import { PLANNING_SNAP_MINUTES, normalizeIntervals } from '../utils/intervals';

const MINUTE_MS = 60_000;

function clock(iso: string): string {
  const date = new Date(iso);
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * A compact availability editor. Drag across a green offer to cut out a time;
 * gaps remain visible, so a person never has to describe availability in text.
 */
export function AvailabilityBand({
  window,
  intervals,
  editable,
  onCut,
}: {
  window: TimePlanWindow;
  intervals: TimePlanInterval[];
  editable: boolean;
  onCut: (interval: TimePlanInterval) => void;
}) {
  const [width, setWidth] = useState(0);
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragEnd, setDragEnd] = useState<number | null>(null);
  const sourceStart = Date.parse(window.startsAt);
  const sourceEnd = Date.parse(window.endsAt);
  const duration = Math.max(1, sourceEnd - sourceStart);
  const normalized = useMemo(() => normalizeIntervals(intervals, window), [intervals, window]);

  const msForX = useCallback(
    (x: number) => {
      const raw = sourceStart + (clamp(x, 0, width || 1) / Math.max(width, 1)) * duration;
      const step = PLANNING_SNAP_MINUTES * MINUTE_MS;
      return clamp(Math.round(raw / step) * step, sourceStart, sourceEnd);
    },
    [duration, sourceEnd, sourceStart, width],
  );

  const begin = useCallback((x: number) => {
    const ms = msForX(x);
    setDragStart(ms);
    setDragEnd(ms);
  }, [msForX]);
  const move = useCallback((x: number) => setDragEnd(msForX(x)), [msForX]);
  const finish = useCallback(() => {
    if (dragStart == null || dragEnd == null) return;
    const start = Math.min(dragStart, dragEnd);
    const end = Math.max(dragStart, dragEnd);
    setDragStart(null);
    setDragEnd(null);
    if (end - start < PLANNING_SNAP_MINUTES * MINUTE_MS) return;
    onCut({ startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString() });
  }, [dragEnd, dragStart, onCut]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(editable && width > 0)
        .minDistance(2)
        .runOnJS(true)
        .onBegin((event) => begin(event.x))
        .onUpdate((event) => move(event.x))
        .onFinalize(finish),
    [begin, editable, finish, move, width],
  );

  const dragLeft = dragStart == null || dragEnd == null ? 0 : Math.min(dragStart, dragEnd);
  const dragRight = dragStart == null || dragEnd == null ? 0 : Math.max(dragStart, dragEnd);
  const percent = (ms: number) => ((ms - sourceStart) / duration) * 100;

  return (
    <View className="gap-2">
      <View className="flex-row items-baseline justify-between">
        <Text className="text-base font-extrabold tracking-[-0.2px] text-white">
          {clock(window.startsAt)} – {clock(window.endsAt)}
        </Text>
        <Text className="text-xs font-semibold text-white/45">
          {editable ? 'Über Zeiten ziehen, die nicht passen' : 'Deine Verfügbarkeit'}
        </Text>
      </View>
      <GestureDetector gesture={pan}>
        <View
          accessibilityRole="adjustable"
          accessibilityLabel="Verfügbarkeit im Zeitfenster"
          accessibilityHint={editable ? 'Ziehe über Zeiten, die dir nicht passen.' : undefined}
          style={styles.track}
          onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
        >
          {normalized.map((interval) => {
            const left = percent(Date.parse(interval.startsAt));
            const right = percent(Date.parse(interval.endsAt));
            return (
              <View
                key={`${interval.startsAt}-${interval.endsAt}`}
                pointerEvents="none"
                style={[styles.available, { left: `${left}%`, width: `${Math.max(0, right - left)}%` }]}
              />
            );
          })}
          {dragStart != null && dragEnd != null ? (
            <View
              pointerEvents="none"
              style={[
                styles.cutPreview,
                { left: `${percent(dragLeft)}%`, width: `${Math.max(0.8, percent(dragRight) - percent(dragLeft))}%` },
              ]}
            />
          ) : null}
        </View>
      </GestureDetector>
      <View className="flex-row justify-between px-0.5">
        <Text className="text-[11px] font-semibold text-white/40">{clock(window.startsAt)}</Text>
        <Text className="text-[11px] font-semibold text-white/40">{clock(window.endsAt)}</Text>
      </View>
      {editable ? (
        <Text className="text-xs leading-4 text-white/45">
          Grün bleibt verfügbar. Ein grauer Schnitt kann über „Zurücksetzen“ für dieses Fenster entfernt werden.
        </Text>
      ) : null}
    </View>
  );
}

export function AvailabilityMiniBand({
  window,
  intervals,
  color = '#41C08D',
}: {
  window: TimePlanWindow;
  intervals: TimePlanInterval[];
  color?: string;
}) {
  const sourceStart = Date.parse(window.startsAt);
  const sourceEnd = Date.parse(window.endsAt);
  const duration = Math.max(1, sourceEnd - sourceStart);
  const normalized = normalizeIntervals(intervals, window);
  return (
    <View style={styles.miniTrack}>
      {normalized.map((interval) => {
        const left = ((Date.parse(interval.startsAt) - sourceStart) / duration) * 100;
        const right = ((Date.parse(interval.endsAt) - sourceStart) / duration) * 100;
        return <View key={`${interval.startsAt}-${interval.endsAt}`} style={[styles.miniSegment, { backgroundColor: color, left: `${left}%`, width: `${Math.max(0, right - left)}%` }]} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(255,255,255,0.13)',
    borderRadius: 16,
    borderWidth: 1,
    height: 52,
    overflow: 'hidden',
    position: 'relative',
  },
  available: {
    backgroundColor: '#41C08D',
    bottom: 5,
    borderRadius: 11,
    position: 'absolute',
    top: 5,
  },
  cutPreview: {
    backgroundColor: 'rgba(243,103,94,0.86)',
    bottom: 3,
    borderColor: 'rgba(255,255,255,0.65)',
    borderRadius: 13,
    borderWidth: 1,
    position: 'absolute',
    top: 3,
  },
  miniTrack: {
    backgroundColor: 'rgba(255,255,255,0.11)',
    borderRadius: 99,
    height: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  miniSegment: {
    borderRadius: 99,
    bottom: 0,
    position: 'absolute',
    top: 0,
  },
});
