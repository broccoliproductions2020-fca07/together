import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';

import { fitRange, pxPerHourFromPxPerMs, pxPerMsFromPxPerHour, timeToX } from './core';
import type { TimeRange } from './core';
import { hourTicks, hoursSinceEpoch, labelIntervalFor } from './ticks';
import { resolveTimeRangePickerTheme, withAlpha } from './theme';
import type { PartialTimeRangePickerTheme, TimeRangePickerDensity } from './theme';

export interface TimeRangeValue {
  start: Date;
  end: Date;
}

export interface TimeRangeLayer {
  startMs: number;
  endMs: number;
  level: number;
}

const PREFERRED_PX_PER_HOUR = 80;
const MIN_PX_PER_HOUR = 16;
const MAX_PX_PER_HOUR = 160;
const FIT_TARGET_FILL = 0.9;
const MAX_TICK_NODES = 160;
const RANGE_LABEL_FADE_PX = 18;
const TICK_LABEL_WIDTH = 40;

export interface TimeRangePickerPreviewProps {
  /** The selected time range, rendered with the same geometry as the app picker. */
  value: TimeRangeValue;
  /** The time frame visible behind the selected range. */
  viewportRange?: TimeRangeValue;
  layers?: TimeRangeLayer[];
  density?: TimeRangePickerDensity;
  accent?: string;
  theme?: PartialTimeRangePickerTheme;
  /** Replaces the duration label while retaining the app picker's bar and axis. */
  renderRangeLabel?: (range: TimeRangeValue) => React.ReactNode;
  accessibilityLabel?: string;
}

/**
 * Read-only counterpart to {@link TimeRangePicker}.
 *
 * It intentionally shares the real picker's theme, tick rules and viewport
 * maths, but owns no gesture or adjustable accessibility controls. A landing
 * preview therefore shows the product truthfully instead of presenting a
 * disabled control that looks usable.
 */
export function TimeRangePickerPreview({
  value,
  viewportRange,
  layers,
  density = 'default',
  accent = '#41C08D',
  theme: themeOverride,
  renderRangeLabel,
  accessibilityLabel,
}: TimeRangePickerPreviewProps) {
  const theme = useMemo(
    () => resolveTimeRangePickerTheme(density, accent, themeOverride),
    [accent, density, themeOverride],
  );
  const [width, setWidth] = useState(0);
  const range = useMemo<TimeRange>(
    () => ({ startMs: value.start.getTime(), endMs: value.end.getTime() }),
    [value.end, value.start],
  );
  const framingRange = useMemo<TimeRange>(
    () =>
      viewportRange
        ? { startMs: viewportRange.start.getTime(), endMs: viewportRange.end.getTime() }
        : range,
    [range, viewportRange],
  );
  const viewport = useMemo(() => {
    if (width <= 0) return null;
    return fitRange(
      framingRange,
      { width, safeInsetPx: theme.interaction.safeInsetPx },
      {
        minPxPerMs: pxPerMsFromPxPerHour(MIN_PX_PER_HOUR),
        maxPxPerMs: pxPerMsFromPxPerHour(MAX_PX_PER_HOUR),
      },
      pxPerMsFromPxPerHour(PREFERRED_PX_PER_HOUR),
      FIT_TARGET_FILL,
    );
  }, [framingRange, theme.interaction.safeInsetPx, width]);
  const ticks = useMemo(() => {
    if (!viewport || width <= 0) return [];
    return hourTicks(
      viewport.startMs,
      viewport.startMs + width / viewport.pxPerMs,
      MAX_TICK_NODES,
    );
  }, [viewport, width]);
  const labelEvery = useMemo(
    () => (viewport ? labelIntervalFor(1, pxPerHourFromPxPerMs(viewport.pxPerMs)) : 1),
    [viewport],
  );

  const trackHeight = theme.container.height - theme.ticks.bottom;
  const barTop = Math.max(0, Math.round((trackHeight - theme.range.height) / 2));
  const layerTop = Math.max(0, barTop - theme.layers.height - theme.layers.gap);
  const rangeLeft = viewport ? timeToX(viewport, range.startMs) : 0;
  const rangeWidth = viewport ? Math.max(0, timeToX(viewport, range.endMs) - rangeLeft) : 0;
  const labelMinWidth = theme.rangeLabel.fontSize * 8.2;
  const labelOpacity = Math.max(0, Math.min(1, (rangeWidth - labelMinWidth) / RANGE_LABEL_FADE_PX));
  const durationText = defaultFormatDuration(range.endMs - range.startMs);

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel ?? `Zeitfenster ${formatTime(value.start)} bis ${formatTime(value.end)}`}
      onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
      style={[
        styles.container,
        {
          height: theme.container.height,
          borderRadius: theme.container.radius,
          backgroundColor: theme.container.background,
          borderColor: theme.container.borderColor,
          borderWidth: theme.container.borderWidth,
          borderStyle: theme.container.borderStyle,
          paddingHorizontal: theme.container.paddingHorizontal,
          paddingVertical: theme.container.paddingVertical,
        },
      ]}
    >
      {viewport
        ? layers?.map((layer) => {
            if (layer.level <= 0) return null;
            const left = timeToX(viewport, layer.startMs);
            const right = timeToX(viewport, layer.endMs);
            const color =
              theme.layers.colors[Math.min(layer.level, theme.layers.colors.length) - 1] ??
              theme.layers.colors[theme.layers.colors.length - 1];
            return (
              <View
                key={`${layer.startMs}-${layer.endMs}`}
                pointerEvents="none"
                style={[
                  styles.layer,
                  {
                    top: layerTop,
                    left,
                    width: Math.max(0, right - left),
                    height: theme.layers.height,
                    borderRadius: theme.layers.radius,
                    backgroundColor: color,
                  },
                ]}
              />
            );
          })
        : null}

      {viewport
        ? ticks.map((tickMs) => {
            const x = timeToX(viewport, tickMs);
            const showLabel = hoursSinceEpoch(tickMs) % labelEvery === 0;
            return (
              <View key={tickMs} pointerEvents="none" style={[styles.tick, { left: x }]}> 
                <View
                  style={{
                    width: theme.ticks.width,
                    height: theme.ticks.height,
                    backgroundColor: theme.ticks.color,
                    bottom: theme.ticks.bottom,
                  }}
                />
                {showLabel ? (
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.tickLabel,
                      {
                        bottom: theme.labels.bottom,
                        color: theme.labels.color,
                        fontFamily: theme.labels.fontFamily,
                        fontSize: theme.labels.fontSize,
                      },
                    ]}
                  >
                    {formatTime(new Date(tickMs))}
                  </Text>
                ) : null}
              </View>
            );
          })
        : null}

      <View
        pointerEvents="none"
        style={[
          styles.range,
          {
            top: barTop,
            left: rangeLeft,
            width: rangeWidth,
            height: theme.range.height,
            borderRadius: theme.range.radius,
            backgroundColor: withAlpha(theme.range.color, theme.range.fillOpacity),
            borderColor: withAlpha(theme.range.borderColor, theme.range.borderOpacity),
            borderWidth: theme.range.borderWidth,
          },
        ]}
      >
        <View style={[styles.handle, { left: -theme.startHandle.width / 2, width: theme.startHandle.width, height: handleHeight(theme.startHandle.height, theme.range.height), borderRadius: theme.startHandle.radius, backgroundColor: theme.startHandle.color, borderColor: theme.startHandle.borderColor, borderWidth: theme.startHandle.borderWidth }]} />
        <View style={[styles.handle, { right: -theme.endHandle.width / 2, width: theme.endHandle.width, height: handleHeight(theme.endHandle.height, theme.range.height), borderRadius: theme.endHandle.radius, backgroundColor: theme.endHandle.color, borderColor: theme.endHandle.borderColor, borderWidth: theme.endHandle.borderWidth }]} />
        <View style={[styles.rangeLabel, { opacity: labelOpacity }]}> 
          {renderRangeLabel ? (
            renderRangeLabel(value)
          ) : (
            <Text
              numberOfLines={1}
              style={{
                color: theme.rangeLabel.color,
                fontFamily: theme.rangeLabel.fontFamily,
                fontSize: theme.rangeLabel.fontSize,
              }}
            >
              {durationText}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

function handleHeight(height: number | 'fill', rangeHeight: number): number {
  return height === 'fill' ? rangeHeight : height;
}

function formatTime(date: Date): string {
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

function defaultFormatDuration(durationMs: number): string {
  const totalMinutes = Math.max(0, Math.round(durationMs / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} Min`;
  if (minutes === 0) return `${hours} Std`;
  return `${hours} Std ${minutes} Min`;
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden', position: 'relative', width: '100%' },
  layer: { position: 'absolute' },
  tick: { alignItems: 'center', bottom: 0, position: 'absolute', top: 0, width: 1 },
  tickLabel: {
    left: -TICK_LABEL_WIDTH / 2,
    position: 'absolute',
    textAlign: 'center',
    width: TICK_LABEL_WIDTH,
  },
  range: { alignItems: 'center', justifyContent: 'center', overflow: 'visible', position: 'absolute' },
  rangeLabel: { alignItems: 'center', justifyContent: 'center' },
  handle: { position: 'absolute', top: 0 },
});
