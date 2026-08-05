import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { DEFAULT_MAP_REGION } from '../utils/defaultRegion';
import { resolveSunPhase, type SunPhaseState } from '../utils/sunPhase';

/**
 * Never sleep longer than this, even when the next solar boundary is hours
 * away: it bounds the drift from DST switches, manual clock changes and
 * timezone travel, and keeps us clear of the platforms' unreliable handling of
 * very long timers. Fifteen minutes makes the local palette shift imperceptibly
 * while keeping wake-ups negligible and entirely offline.
 */
const MAX_SLEEP_MS = 5 * 60 * 1000;
/** Progress only re-renders when it actually moved — see the tick below. */
const PROGRESS_EPSILON = 0.01;

function fallbackSunPhase(): SunPhaseState {
  return {
    phase: 'day',
    nextPhase: 'day',
    progress: 0,
    endsAt: Date.now() + MAX_SLEEP_MS,
  };
}

/** A map colour preference must never prevent the app from opening. */
function resolveSunPhaseSafely(latitude: number, longitude: number): SunPhaseState {
  try {
    return resolveSunPhase(new Date(), latitude, longitude);
  } catch {
    return fallbackSunPhase();
  }
}

/**
 * The current solar phase at `latitude`/`longitude`, kept fresh without
 * polling: each tick schedules exactly one timer for the next phase boundary.
 *
 * Defaults to {@link DEFAULT_MAP_REGION} rather than asking for the device
 * position — a location permission prompt for a colour palette would be a bad
 * trade, and across Germany the sunset spread is under half an hour, which is
 * invisible in a four-step palette. Pass real coordinates once the app already
 * has them for another reason and it becomes exact for free.
 */
export function useSunPhase(
  latitude: number = DEFAULT_MAP_REGION.latitude,
  longitude: number = DEFAULT_MAP_REGION.longitude,
): SunPhaseState {
  const [state, setState] = useState<SunPhaseState>(() =>
    resolveSunPhaseSafely(latitude, longitude),
  );

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    function tick() {
      if (cancelled) return;
      const next = resolveSunPhaseSafely(latitude, longitude);
      // Re-render only on a real change. During a 13 h day phase this fires a
      // couple of dozen times a day instead of on every timer wake-up.
      setState((previous) =>
        previous.phase === next.phase &&
        Math.abs(previous.progress - next.progress) < PROGRESS_EPSILON
          ? previous
          : next,
      );
      const delay = Math.min(Math.max(next.endsAt - Date.now(), 1_000), MAX_SLEEP_MS);
      timer = setTimeout(tick, delay);
    }

    tick();

    // Timers are throttled or suspended in the background, so a phase can pass
    // unnoticed while the app is away. Returning to the foreground at night
    // must show the night map immediately, not after the next timer.
    const subscription = AppState.addEventListener('change', (status) => {
      if (status !== 'active' || cancelled) return;
      if (timer) clearTimeout(timer);
      tick();
    });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      subscription.remove();
    };
  }, [latitude, longitude]);

  return state;
}
