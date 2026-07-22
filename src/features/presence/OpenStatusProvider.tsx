import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { useAuth } from '@/features/auth';
import { useFriends } from '@/features/friends';

import { presenceService } from './services/presenceService';
import type {
  CoarseLocation,
  OpenVibe,
  PresenceActor,
  PresenceDoc,
} from './services/presenceService.types';

const STORAGE_KEY = 'together.open.status.v1';

/** How long "open" lasts before it auto-expires, so the pool never rots. */
export const OPEN_DURATION_MS = 3 * 60 * 60 * 1000;
/** A deliberate hard ceiling: an open status must stay trustworthy, never stale. */
export const OPEN_MAX_DURATION_MS = 12 * 60 * 60 * 1000;

/** Debounce for the Firestore write-through: the free-text vibe field fires a
 * status change on every keystroke, and each one is a full `setDoc` — without
 * this, typing a sentence would cost one write per character. */
const PRESENCE_WRITE_DEBOUNCE_MS = 500;

export type { OpenVibe };

/** One-tap vibe chips = the fast path. A free-text escape hatch (in the card)
 * covers everything the chips don't — optional refine AFTER you're open. */
export const OPEN_VIBES: OpenVibe[] = [
  { label: 'Kaffee', emoji: '☕' },
  { label: 'Drink', emoji: '🍺' },
  { label: 'Essen', emoji: '🍽️' },
  { label: 'Spazieren', emoji: '🚶' },
  { label: 'Sport', emoji: '🏃' },
  { label: 'Chillen', emoji: '🛋️' },
  { label: 'Egal', emoji: '🤷' },
];

interface PersistedStatus {
  isOpen: boolean;
  vibe: OpenVibe | null;
  expiresAt: number | null;
  /** Whether friends may see your location (pin) while you're open, vs. list-only
   * (none). Privacy-first: resets to false each time you go open. */
  shareLocation: boolean;
}

export interface OpenStatusValue {
  isOpen: boolean;
  vibe: OpenVibe | null;
  /** Epoch ms when the open status auto-expires. */
  expiresAt: number | null;
  vibes: OpenVibe[];
  /** Friends who are currently open (via the presence seam; empty in single-device mock). */
  openFriends: PresenceDoc[];
  /**
   * Starts the friend-presence listener only while a surface actually renders
   * it. The own status write-through deliberately stays independent of this.
   */
  setFriendPresenceListening: (enabled: boolean) => void;
  /** One tap: become open for OPEN_DURATION_MS with default (all-friends) reach. */
  goOpen: () => void;
  /** Optional refinement while open; pass null to clear the vibe. */
  setVibe: (vibe: OpenVibe | null) => void;
  /** Adjust when the open status ends (absolute epoch ms). */
  setExpiresAt: (ts: number) => void;
  /** Whether friends may see your location on the map (pin) while you're open. */
  shareLocation: boolean;
  setShareLocation: (value: boolean) => void;
  /** Turn open off. */
  close: () => void;
}

const CLOSED: PersistedStatus = {
  isOpen: false,
  vibe: null,
  expiresAt: null,
  shareLocation: false,
};

const OpenStatusContext = createContext<OpenStatusValue | null>(null);

/** Round to ~3 decimals (~110 m) so the shared location is deliberately coarse. */
function coarsen(lat: number, lng: number): CoarseLocation {
  return { lat: Math.round(lat * 1000) / 1000, lng: Math.round(lng * 1000) / 1000 };
}

/**
 * Holds the current user's own "I'm open" presence AND the live list of friends
 * who are open (both through the presence service seam: mock offline by default,
 * Firestore when `EXPO_PUBLIC_BACKEND=firebase`). Open is a lightweight status,
 * not an event. Auto-expires; going private removes the shared location.
 */
export function OpenStatusProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { friendUids } = useFriends();

  const actor = useMemo<PresenceActor>(
    () => ({
      uid: user?.id ?? 'u_you',
      displayName: user?.displayName ?? 'Du',
      initials: (user?.displayName ?? 'Du').slice(0, 2).toUpperCase(),
    }),
    [user?.id, user?.displayName],
  );

  const [status, setStatus] = useState<PersistedStatus>(CLOSED);
  const [coarse, setCoarse] = useState<CoarseLocation | null>(null);
  const [openFriends, setOpenFriends] = useState<PresenceDoc[]>([]);
  const [friendPresenceListening, setFriendPresenceListening] = useState(false);
  const remotePresenceRef = useRef(false);
  // Gate the write-through until we've loaded the persisted status, so we don't
  // momentarily delete-then-recreate the presence doc on every app start.
  const [hydrated, setHydrated] = useState(false);

  // Restore a still-valid open status across reloads; drop it if already expired.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored) {
          const parsed = JSON.parse(stored) as PersistedStatus;
          remotePresenceRef.current = parsed.isOpen;
          if (
            parsed.isOpen &&
            parsed.expiresAt &&
            parsed.expiresAt > Date.now() &&
            parsed.expiresAt <= Date.now() + OPEN_MAX_DURATION_MS
          ) {
            setStatus(parsed);
          } else {
            AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
          }
        }
      })
      .catch(() => {})
      .finally(() => setHydrated(true));
  }, []);

  const persist = useCallback((next: PersistedStatus) => {
    setStatus(next);
    if (next.isOpen) {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
    } else {
      AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
    }
  }, []);

  // Auto-expire: schedule a close exactly when the window ends.
  useEffect(() => {
    if (!status.isOpen || !status.expiresAt) return;
    const remaining = status.expiresAt - Date.now();
    if (remaining <= 0) {
      persist(CLOSED);
      return;
    }
    const timer = setTimeout(() => persist(CLOSED), remaining);
    return () => clearTimeout(timer);
  }, [status.isOpen, status.expiresAt, persist]);

  // Fetch a coarse location only while sharing; drop it as soon as sharing is off.
  useEffect(() => {
    if (!status.isOpen || !status.shareLocation) {
      setCoarse(null);
      return;
    }
    if (coarse) return;
    let cancelled = false;
    (async () => {
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status !== Location.PermissionStatus.GRANTED) return;
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!cancelled) setCoarse(coarsen(pos.coords.latitude, pos.coords.longitude));
      } catch {
        // Permission denied / unavailable → stay list-only (no pin).
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status.isOpen, status.shareLocation, coarse]);

  // Write-through: mirror my own status into the presence backend. Going closed
  // deletes the doc so friends' listeners drop me immediately (not on TTL);
  // that path stays instant. The open/refine path is debounced — every render
  // cancels the previous pending write via the effect cleanup, so a burst of
  // changes (typing, quick chip taps) collapses into a single `setDoc`.
  useEffect(() => {
    if (!hydrated) return;
    if (!status.isOpen) {
      if (remotePresenceRef.current) {
        remotePresenceRef.current = false;
        presenceService.clearPresence(actor);
      }
      return;
    }

    remotePresenceRef.current = true;

    const timer = setTimeout(() => {
      presenceService.setPresence(actor, {
        vibe: status.vibe,
        expiresAt: status.expiresAt ?? Date.now() + OPEN_DURATION_MS,
        shareLocation: status.shareLocation,
        coarseLocation: status.shareLocation ? coarse : null,
        audienceUids: [actor.uid, ...friendUids].slice(0, 50),
      });
    }, PRESENCE_WRITE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [hydrated, actor, status, coarse, friendUids]);

  // Friend presence is only map chrome. Keep the own open-status write-through
  // above alive everywhere, but do not keep paying for friend updates while the
  // permanently-mounted map layer is hidden behind Calendar or Socialize.
  useEffect(() => {
    setOpenFriends([]);
    if (!friendPresenceListening) return;
    return presenceService.subscribeOpenFriends(actor, setOpenFriends);
  }, [actor, friendPresenceListening]);

  // Patch fields while open (no-op if closed), persisting the result.
  const patch = useCallback((partial: Partial<PersistedStatus>) => {
    setStatus((current) => {
      if (!current.isOpen) return current;
      const next = { ...current, ...partial };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const goOpen = useCallback(() => {
    persist({
      isOpen: true,
      vibe: null,
      expiresAt: Date.now() + OPEN_DURATION_MS,
      shareLocation: false,
    });
  }, [persist]);

  const setVibe = useCallback((vibe: OpenVibe | null) => patch({ vibe }), [patch]);
  const setExpiresAt = useCallback(
    (ts: number) => patch({ expiresAt: Math.min(ts, Date.now() + OPEN_MAX_DURATION_MS) }),
    [patch],
  );
  const setShareLocation = useCallback(
    (value: boolean) => patch({ shareLocation: value }),
    [patch],
  );
  const close = useCallback(() => persist(CLOSED), [persist]);

  const value = useMemo<OpenStatusValue>(
    () => ({
      isOpen: status.isOpen,
      vibe: status.vibe,
      expiresAt: status.expiresAt,
      vibes: OPEN_VIBES,
      openFriends,
      setFriendPresenceListening,
      goOpen,
      setVibe,
      setExpiresAt,
      shareLocation: status.shareLocation,
      setShareLocation,
      close,
    }),
    [
      status,
      openFriends,
      setFriendPresenceListening,
      goOpen,
      setVibe,
      setExpiresAt,
      setShareLocation,
      close,
    ],
  );

  return <OpenStatusContext.Provider value={value}>{children}</OpenStatusContext.Provider>;
}

export function useOpenStatus() {
  const context = useContext(OpenStatusContext);
  if (!context) {
    throw new Error('useOpenStatus must be used within OpenStatusProvider');
  }
  return context;
}
