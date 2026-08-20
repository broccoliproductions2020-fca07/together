import { useEffect, useRef, useState } from 'react';

import { describeCoordinate } from '@/features/map/utils/mapSelection';

/** ~11 m. Finer than any address boundary, coarse enough that a jittering GPS
 * fix keeps hitting the same cache entry instead of re-resolving every second. */
const PRECISION = 4;

function cacheKey(latitude: number, longitude: number): string {
  return `${latitude.toFixed(PRECISION)},${longitude.toFixed(PRECISION)}`;
}

/**
 * Module-level, so the address survives closing and reopening the composer.
 *
 * A `null` entry is a REMEMBERED failure and matters as much as a hit: without
 * it, a coordinate the geocoder cannot name would be looked up again on every
 * mount for as long as the person stands there.
 */
const cache = new Map<string, string | null>();

/**
 * The street address for a coordinate, or null while unknown.
 *
 * Exists because the composer's default place ("Aktueller Standort") is a label
 * with a position and no address, so the one thing a person wants to check —
 * *which* current location? — was the one thing not shown. The lookup is the
 * OS geocoder (see `describeCoordinate`), so this costs nothing per call.
 */
export function useCoordinateAddress(
  latitude: number | undefined,
  longitude: number | undefined,
  enabled = true,
): string | null {
  const key = latitude != null && longitude != null ? cacheKey(latitude, longitude) : null;
  const [address, setAddress] = useState<string | null>(() => (key ? (cache.get(key) ?? null) : null));
  // Guards against a second in-flight lookup for a key already being resolved,
  // which a re-render during the await would otherwise start.
  const pendingRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !key || latitude == null || longitude == null) return;
    if (cache.has(key)) {
      setAddress(cache.get(key) ?? null);
      return;
    }
    if (pendingRef.current === key) return;
    pendingRef.current = key;

    let cancelled = false;
    void describeCoordinate({ latitude, longitude })
      .then((result) => {
        // Prefer the full address line, fall back to the short title — both are
        // more useful than the bare words "Aktueller Standort".
        const resolved = result?.address ?? result?.title ?? null;
        cache.set(key, resolved);
        if (!cancelled) setAddress(resolved);
      })
      .finally(() => {
        if (pendingRef.current === key) pendingRef.current = null;
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, key, latitude, longitude]);

  return key ? address : null;
}
