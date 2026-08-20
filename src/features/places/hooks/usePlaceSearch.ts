import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { SelectedPlace } from '@/features/activities';

import { placeService } from '../services/placeService';
import type { PlaceSuggestion } from '../services/placeService.types';

const MIN_QUERY_LENGTH = 3;
const MAX_QUERY_LENGTH = 120;
const DEBOUNCE_MS = 300;

export interface PlaceSearchCenter {
  latitude: number;
  longitude: number;
}

export interface UsePlaceSearchOptions {
  enabled: boolean;
  /** A local ranking bias only; it never leaves the Places request. */
  center?: PlaceSearchCenter;
  radiusMeters?: number;
}

function failureMessage(error: unknown) {
  const code = (error as { code?: unknown } | null)?.code;
  const message = error instanceof Error ? error.message.trim() : '';
  if (
    typeof code === 'string' &&
    (code === 'failed-precondition' ||
      code === 'resource-exhausted' ||
      code === 'invalid-argument' ||
      code === 'permission-denied') &&
    message
  ) {
    return message.replace(/^\[[^\]]+\]\s*/, '');
  }
  return 'Die Ortssuche ist gerade nicht erreichbar. Bitte versuche es gleich noch einmal.';
}

function createSessionToken() {
  return Crypto.randomUUID();
}

/**
 * The paid Google Places session, separated from any particular screen.
 *
 * The full-screen map picker and compact composer search deliberately get
 * separate hook instances, but every instance owns exactly one autocomplete →
 * details session at a time. That keeps billing, cancellation and stale-result
 * handling identical without forcing either surface into the other's layout.
 */
export function usePlaceSearch({
  enabled,
  center,
  radiusMeters = 5_000,
}: UsePlaceSearchOptions) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [completed, setCompleted] = useState(false);
  const [requestVersion, setRequestVersion] = useState(0);

  const centerRef = useRef(center);
  const requestRef = useRef(0);
  const signatureRef = useRef<string | undefined>(undefined);
  const submitRef = useRef(false);
  const sessionTokenRef = useRef(createSessionToken());
  const sessionHasInputRef = useRef(false);
  const sessionResolvedRef = useRef(false);
  const resolvingRef = useRef(false);

  centerRef.current = center;

  const reset = useCallback(() => {
    requestRef.current += 1;
    signatureRef.current = undefined;
    submitRef.current = false;
    sessionTokenRef.current = createSessionToken();
    sessionHasInputRef.current = false;
    sessionResolvedRef.current = false;
    resolvingRef.current = false;
    setQuery('');
    setResults([]);
    setLoading(false);
    setResolving(false);
    setError(undefined);
    setCompleted(false);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (!enabled || trimmed.length < MIN_QUERY_LENGTH) {
      signatureRef.current = undefined;
      setResults([]);
      setLoading(false);
      setError(undefined);
      setCompleted(false);
      return;
    }

    const searchCenter = centerRef.current;
    const normalized = trimmed.replace(/\s+/g, ' ').toLocaleLowerCase('de-DE');
    const signature = `${normalized}:${searchCenter?.latitude.toFixed(3) ?? ''}:${searchCenter?.longitude.toFixed(3) ?? ''}`;
    if (signatureRef.current === signature) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const requestId = ++requestRef.current;
    const runImmediately = submitRef.current;
    submitRef.current = false;
    setLoading(true);
    setError(undefined);
    setCompleted(false);
    const timer = setTimeout(
      () => {
        signatureRef.current = signature;
        void placeService
          .search({
            query: trimmed,
            sessionToken: sessionTokenRef.current,
            center: searchCenter,
            radiusMeters,
          })
          .then((nextResults) => {
            if (cancelled || requestId !== requestRef.current) return;
            setResults(nextResults);
            setLoading(false);
            setCompleted(true);
          })
          .catch((nextError: unknown) => {
            if (cancelled || requestId !== requestRef.current) return;
            signatureRef.current = undefined;
            setResults([]);
            setLoading(false);
            setError(failureMessage(nextError));
            setCompleted(true);
          });
      },
      runImmediately ? 0 : DEBOUNCE_MS,
    );

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, query, radiusMeters, requestVersion]);

  const updateQuery = useCallback((rawQuery: string) => {
    const nextQuery = rawQuery.slice(0, MAX_QUERY_LENGTH);
    const hasInput = nextQuery.trim().length > 0;
    if (hasInput && (!sessionHasInputRef.current || sessionResolvedRef.current)) {
      sessionTokenRef.current = createSessionToken();
      sessionResolvedRef.current = false;
    }
    sessionHasInputRef.current = hasInput;
    submitRef.current = false;
    setResults([]);
    setError(undefined);
    setCompleted(false);
    setQuery(nextQuery);
  }, []);

  const submit = useCallback(() => {
    submitRef.current = true;
    setRequestVersion((version) => version + 1);
  }, []);

  const resolve = useCallback(async (suggestion: PlaceSuggestion): Promise<SelectedPlace | null> => {
    if (resolvingRef.current) return null;

    const requestId = ++requestRef.current;
    resolvingRef.current = true;
    setResolving(true);
    setError(undefined);
    try {
      const place = await placeService.resolve({
        placeId: suggestion.id,
        sessionToken: sessionTokenRef.current,
        name: suggestion.name,
      });
      if (requestId !== requestRef.current) return null;
      if (place.latitude == null || place.longitude == null) {
        throw new Error('Der Ort hat keine Kartenkoordinate.');
      }

      sessionResolvedRef.current = true;
      signatureRef.current = undefined;
      setQuery('');
      setResults([]);
      setLoading(false);
      setCompleted(false);
      return { ...place, source: 'map' };
    } catch (nextError) {
      if (requestId === requestRef.current) {
        signatureRef.current = undefined;
        sessionResolvedRef.current = true;
        setResults([]);
        setError(failureMessage(nextError));
        setCompleted(true);
      }
      return null;
    } finally {
      if (requestId === requestRef.current) {
        resolvingRef.current = false;
        setResolving(false);
      }
    }
  }, []);

  return {
    completed,
    error,
    loading,
    query,
    reset,
    resolving,
    resolve,
    results,
    submit,
    updateQuery,
  };
}
