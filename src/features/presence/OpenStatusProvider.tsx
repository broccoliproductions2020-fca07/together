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
  /** When this open window began. Local only — friends never need it; it exists
   * so the map pill can draw how much of YOUR window is left, the same way an
   * activity marker draws its countdown ring. */
  openedAt: number | null;
  /** Whether friends may see your location (pin) while you're open, vs. list-only
   * (none). Privacy-first: resets to false each time you go open. */
  shareLocation: boolean;
}

/** Everything the "Offen stellen" form can set before you actually go open. */
export interface GoOpenInput {
  vibe?: OpenVibe | null;
  expiresAt?: number;
  shareLocation?: boolean;
}

export interface OpenStatusValue {
  isOpen: boolean;
  vibe: OpenVibe | null;
  /** Epoch ms when the open status auto-expires. */
  expiresAt: number | null;
  /** Epoch ms when the current open window started (null while closed). */
  openedAt: number | null;
  vibes: OpenVibe[];
  /** Friends who are currently open (via the presence seam; empty in single-device mock). */
  openFriends: PresenceDoc[];
  /**
   * Starts the friend-presence listener only while a surface actually renders
   * it. The own status write-through deliberately stays independent of this.
   */
  setFriendPresenceListening: (enabled: boolean) => void;
  /**
   * Become open. Called ONLY by the form's confirm button — going open sends a
   * real signal to real friends, so it must never be the side effect of opening
   * a sheet. Without an argument it uses the defaults (no vibe, +3 h, no
   * location); the form passes what the user actually chose, in one write.
   */
  goOpen: (input?: GoOpenInput) => void;
  /** Optional refinement while open; pass null to clear the vibe. */
  setVibe: (vibe: OpenVibe | null) => void;
  /** Adjust when the open status ends (absolute epoch ms). */
  setExpiresAt: (ts: number) => void;
  /** Whether friends may see your location on the map (pin) while you're open. */
  shareLocation: boolean;
  setShareLocation: (value: boolean) => void;
  /** Sharing is ON but the OS will not give us a position (permission denied
   * or no fix). The card surfaces this — a toggle that silently does nothing
   * is worse than one that admits it cannot work. */
  shareLocationBlocked: boolean;
  /** Turn open off. */
  close: () => void;
}

const CLOSED: PersistedStatus = {
  isOpen: false,
  vibe: null,
  expiresAt: null,
  openedAt: null,
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
  const [shareLocationBlocked, setShareLocationBlocked] = useState(false);
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
            // A status persisted before openedAt existed still has to draw a
            // sensible ring: assume it started one default window before it ends.
            setStatus({
              ...parsed,
              openedAt: parsed.openedAt ?? parsed.expiresAt - OPEN_DURATION_MS,
            });
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
      setShareLocationBlocked(false);
      return;
    }
    if (coarse) return;
    let cancelled = false;
    (async () => {
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        // A denial must never be swallowed: the toggle says you are sharing a
        // location while the OS is refusing to give one, so the card has to be
        // able to say so (`shareLocationBlocked` → hint in OpenStatusCard).
        if (perm.status !== Location.PermissionStatus.GRANTED) {
          setShareLocationBlocked(true);
          return;
        }
        setShareLocationBlocked(false);
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!cancelled) setCoarse(coarsen(pos.coords.latitude, pos.coords.longitude));
      } catch {
        // No fix available → stay list-only (no pin), and say so.
        if (!cancelled) setShareLocationBlocked(true);
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
      // No `audienceUids` here on purpose: the `publishPresence` callable
      // derives the audience server-side from the caller's real friend edges
      // and ignores anything the client sends. Sending it would imply the
      // client decides who may see it, which is not true and must not look
      // true to the next reader.
      presenceService.setPresence(actor, {
        vibe: status.vibe,
        expiresAt: status.expiresAt ?? Date.now() + OPEN_DURATION_MS,
        shareLocation: status.shareLocation,
        coarseLocation: status.shareLocation ? coarse : null,
      });
    }, PRESENCE_WRITE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [hydrated, actor, status, coarse]);

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

  const goOpen = useCallback(
    (input?: GoOpenInput) => {
      const now = Date.now();
      persist({
        isOpen: true,
        vibe: input?.vibe ?? null,
        expiresAt: Math.min(input?.expiresAt ?? now + OPEN_DURATION_MS, now + OPEN_MAX_DURATION_MS),
        openedAt: now,
        shareLocation: input?.shareLocation ?? false,
      });
    },
    [persist],
  );

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
      openedAt: status.openedAt,
      vibes: OPEN_VIBES,
      openFriends,
      setFriendPresenceListening,
      goOpen,
      setVibe,
      setExpiresAt,
      shareLocation: status.shareLocation,
      setShareLocation,
      shareLocationBlocked,
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
      shareLocationBlocked,
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
