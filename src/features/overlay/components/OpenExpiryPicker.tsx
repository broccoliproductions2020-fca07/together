import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  TimeRangePicker,
  type TimeRangeValue,
} from '@/shared/components/time-range-picker';
import { FONT, TEXT_CAPPED, TYPE } from '@/shared/theme';

const MINUTE_MS = 60_000;
const MIN_OPEN_MINUTES = 15;
const OPEN_COLOR = '#3B82F6';

function clock(ms: number): string {
  const date = new Date(ms);
  return `${date.getHours().toString().padStart(2, '0')}:${date
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;
}

export function OpenExpiryPicker({
  expiresAt,
  maxDurationMs,
  limitAt,
  onCommit,
}: {
  expiresAt: number | null;
  maxDurationMs: number;
  limitAt: number | null;
  onCommit: (expiresAt: number) => void;
}) {
  const [nowMs, setNowMs] = useState(Date.now);
  const hardMaxAt = nowMs + maxDurationMs;
  const maxAt = limitAt && limitAt > nowMs ? Math.min(limitAt, hardMaxAt) : hardMaxAt;
  const availableMinutes = Math.max(1, Math.floor((maxAt - nowMs) / MINUTE_MS));
  const minDurationMinutes = Math.min(MIN_OPEN_MINUTES, availableMinutes);
  const externalEnd = Math.min(
    maxAt,
    Math.max(expiresAt ?? nowMs + minDurationMinutes * MINUTE_MS, nowMs + MINUTE_MS),
  );
  const [draftEndMs, setDraftEndMs] = useState(externalEnd);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), MINUTE_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setDraftEndMs(externalEnd);
  }, [externalEnd]);

  const value = useMemo<TimeRangeValue>(
    () => ({ start: new Date(nowMs), end: new Date(draftEndMs) }),
    [draftEndMs, nowMs],
  );
  const viewportRange = useMemo<TimeRangeValue>(
    () => ({ start: new Date(nowMs), end: new Date(maxAt) }),
    [maxAt, nowMs],
  );

  return (
    <View>
      <View style={styles.summary}>
        <Text
          allowFontScaling={TEXT_CAPPED.allowFontScaling}
          maxFontSizeMultiplier={TEXT_CAPPED.maxFontSizeMultiplier}
          style={styles.now}
        >
          Jetzt
        </Text>
        <View style={styles.connection} />
        <Text
          allowFontScaling={TEXT_CAPPED.allowFontScaling}
          maxFontSizeMultiplier={TEXT_CAPPED.maxFontSizeMultiplier}
          style={styles.until}
        >
          bis {clock(draftEndMs)}
        </Text>
      </View>

      <TimeRangePicker
        value={value}
        min={new Date(nowMs)}
        max={new Date(maxAt)}
        viewportRange={viewportRange}
        interactionMode="end-only"
        stepMinutes={5}
        minDurationMinutes={minDurationMinutes}
        maxDurationMinutes={availableMinutes}
        rezoomOnRelease={false}
        accent={OPEN_COLOR}
        renderRangeLabel={(range) => (
          <Text
            numberOfLines={1}
            allowFontScaling={TEXT_CAPPED.allowFontScaling}
            maxFontSizeMultiplier={TEXT_CAPPED.maxFontSizeMultiplier}
            style={styles.rangeLabel}
          >
            bis {clock(range.end.getTime())}
          </Text>
        )}
        renderStartHandle={() => <View style={styles.startAnchor} />}
        theme={{
          container: {
            height: 56,
            radius: 16,
            background: 'rgba(59,130,246,0.08)',
            borderColor: 'rgba(59,130,246,0.22)',
            borderWidth: 1,
          },
          past: { color: '#05070B', opacity: 0.22 },
          range: { fillOpacity: 0.22, borderOpacity: 0.88 },
          startHandle: { width: 4, color: 'rgba(255,255,255,0.45)' },
          endHandle: { width: 7, color: '#FFFFFF', radius: 4 },
          labels: { color: 'rgba(244,245,247,0.56)', fontSize: TYPE.micro.fontSize },
          rangeLabel: { fontSize: TYPE.micro.fontSize },
        }}
        accessibilityLabelStart="Beginn jetzt"
        accessibilityLabelEnd="Ende deines Offen-Zeitraums"
        onChange={(range) => setDraftEndMs(range.end.getTime())}
        onChangeEnd={(range) => onCommit(range.end.getTime())}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { alignItems: 'center', flexDirection: 'row', marginBottom: 7 },
  now: {
    color: 'rgba(244,245,247,0.62)',
    fontFamily: FONT.medium,
    fontSize: TYPE.caption.fontSize,
  },
  connection: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    flex: 1,
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 10,
  },
  until: { color: '#FFFFFF', fontFamily: FONT.semibold, fontSize: TYPE.label.fontSize },
  rangeLabel: { color: '#FFFFFF', fontFamily: FONT.semibold, fontSize: TYPE.micro.fontSize },
  startAnchor: {
    backgroundColor: 'rgba(255,255,255,0.48)',
    borderRadius: 2,
    height: 20,
    width: 4,
  },
});
