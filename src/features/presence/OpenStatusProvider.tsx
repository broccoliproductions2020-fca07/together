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

import { useActivityEntities } from '@/features/activities';
import { useAuth } from '@/features/auth';

import {
  constrainOpenExpiry,
  OPEN_DURATION_MS,
  OPEN_MAX_DURATION_MS,
  OPEN_MIN_DURATION_MS,
} from './openWindow';
import { presenceService } from './services/presenceService';
import type {
  CoarseLocation,
  OpenVibe,
  PresenceActor,
  PresenceDoc,
  PresenceWriteResult,
} from './services/presenceService.types';

const STORAGE_KEY_PREFIX = 'together.open.status.v2.';
const LEGACY_STORAGE_KEY = 'together.open.status.v1';

function storageKeyFor(accountUid: string) {
  return `${STORAGE_KEY_PREFIX}${accountUid}`;
}

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
  /** Local start time used only for the owner's Core countdown ring. */
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
   * Become open. The explicit core tap may use the safe defaults (no vibe, +3 h,
   * no location); refinements use the same write path from the status card.
   */
  goOpen: (input?: GoOpenInput) => boolean;
  /** Optional refinement while open; pass null to clear the vibe. */
  setVibe: (vibe: OpenVibe | null) => void;
  /** Adjust when the open status ends (absolute epoch ms). */
  setExpiresAt: (ts: number) => void;
  /** Confirmed next Activity that limits this Open window. */
  openLimitAt: number | null;
  /** Present when a running or imminent Activity leaves no useful Open window. */
  openBlockedByActivity: { id: string; title: string; startsAt: number } | null;
  /** Whether friends may see your location on the map (pin) while you're open. */
  shareLocation: boolean;
  setShareLocation: (value: boolean) => void;
  /** Sharing is ON but the OS will not give us a position (permission denied
   * or no fix). The card surfaces this — a toggle that silently does nothing
   * is worse than one that admits it cannot work. */
  shareLocationBlocked: boolean;
  /** A local presence change is waiting for its backend acknowledgement. */
  syncing: boolean;
  /** The last presence write was not accepted; the local state was rolled back. */
  syncError: string | null;
  /** Retries the exact open-status change that was rolled back. */
  retrySync: () => void;
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

function presenceSyncErrorMessage(error: unknown, target: PersistedStatus): string {
  const code = (error as { code?: unknown } | null)?.code;
  const normalizedCode = typeof code === 'string' ? code.replace(/^functions\//, '') : '';
  const message = error instanceof Error ? error.message.replace(/^\[[^\]]+\]\s*/, '').trim() : '';

  if (normalizedCode === 'unavailable' || normalizedCode === 'deadline-exceeded') {
    return 'Keine Verbindung zum Server. Dein Offen-Status wurde nicht veröffentlicht.';
  }
  if (normalizedCode === 'resource-exhausted') {
    return message || 'Zu viele Änderungen. Bitte warte kurz und versuche es erneut.';
  }
  if (normalizedCode === 'failed-precondition') {
    return message || 'Dein Konto ist noch nicht bereit für diesen Schritt.';
  }
  if (
    normalizedCode === 'invalid-argument' &&
    /^(Name|Initialen) ist ungültig\.$/.test(message)
  ) {
    return 'Dein Profil wird noch eingerichtet. Starte die App kurz neu und versuche es erneut.';
  }
  return target.isOpen
    ? 'Dein Offen-Status konnte nicht veröffentlicht werden.'
    : 'Dein Offen-Status konnte noch nicht beendet werden.';
}

/**
 * Holds the current user's own "I'm open" presence AND the live list of friends
 * who are open through the Firebase presence service seam. Open is a
 * lightweight status, not an event. It auto-expires and going private removes
 * the shared location.
 */
export function OpenStatusProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { openPresenceConstraint } = useActivityEntities();

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
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const remotePresenceRef = useRef(false);
  const activeAccountUidRef = useRef(actor.uid);
  activeAccountUidRef.current = actor.uid;
  const statusRef = useRef<PersistedStatus>(CLOSED);
  statusRef.current = status;
  const hydrationRevisionRef = useRef(0);
  const storageWriteChainRef = useRef<Promise<void>>(Promise.resolve());
  const presenceWriteChainRef = useRef<Promise<void>>(Promise.resolve());
  const statusRevisionRef = useRef(0);
  const confirmedStatusRef = useRef<PersistedStatus>(CLOSED);
  const suppressedWriteRevisionRef = useRef<number | null>(null);
  const failedTargetRef = useRef<PersistedStatus | null>(null);
  const hasIssuedOpenWriteRef = useRef(false);
  // Gate the write-through until we've loaded the persisted status, so we don't
  // momentarily delete-then-recreate the presence doc on every app start. The
  // uid makes a previous account's status ineligible during an account switch.
  const [hydratedAccountUid, setHydratedAccountUid] = useState<string | null>(null);

  const queueStorageWrite = useCallback((accountUid: string, next: PersistedStatus) => {
    const key = storageKeyFor(accountUid);
    const write = async () => {
      if (next.isOpen) await AsyncStorage.setItem(key, JSON.stringify(next));
      else await AsyncStorage.removeItem(key);
    };
    storageWriteChainRef.current = storageWriteChainRef.current
      .catch(() => {})
      .then(write)
      .catch(() => {});
  }, []);

  const queuePresenceWrite = useCallback((write: () => Promise<unknown> | unknown) => {
    const next = presenceWriteChainRef.current.catch(() => {}).then(write);
    presenceWriteChainRef.current = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }, []);

  // Restore a still-valid open status across reloads; drop it if already expired.
  useEffect(() => {
    const accountUid = actor.uid;
    const revision = ++hydrationRevisionRef.current;
    let cancelled = false;
    remotePresenceRef.current = false;
    hasIssuedOpenWriteRef.current = false;
    confirmedStatusRef.current = CLOSED;
    failedTargetRef.current = null;
    statusRef.current = CLOSED;
    setStatus(CLOSED);
    setSyncError(null);
    setSyncing(false);
    setCoarse(null);
    setShareLocationBlocked(false);
    setHydratedAccountUid(null);
    // The old global key carries no account id, so importing it could announce
    // one person's status as another person's. Discard it instead of guessing.
    void AsyncStorage.removeItem(LEGACY_STORAGE_KEY).catch(() => {});

    AsyncStorage.getItem(storageKeyFor(accountUid))
      .then((stored) => {
        if (
          cancelled ||
          activeAccountUidRef.current !== accountUid ||
          revision !== hydrationRevisionRef.current
        ) {
          return;
        }
        if (stored) {
          const parsed = JSON.parse(stored) as PersistedStatus;
          if (
            parsed.isOpen &&
            parsed.expiresAt &&
            parsed.expiresAt > Date.now() &&
            parsed.expiresAt <= Date.now() + OPEN_MAX_DURATION_MS
          ) {
            // A status persisted before openedAt existed still has to draw a
            // sensible ring: assume it started one default window before it ends.
            const next = {
              ...parsed,
              openedAt: parsed.openedAt ?? parsed.expiresAt - OPEN_DURATION_MS,
            };
            remotePresenceRef.current = true;
            confirmedStatusRef.current = next;
            statusRef.current = next;
            setStatus(next);
          } else {
            void AsyncStorage.removeItem(storageKeyFor(accountUid)).catch(() => {});
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (
          !cancelled &&
          activeAccountUidRef.current === accountUid &&
          revision <= hydrationRevisionRef.current
        ) {
          setHydratedAccountUid(accountUid);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [actor.uid]);

  const persist = useCallback(
    (next: PersistedStatus) => {
      hydrationRevisionRef.current += 1;
      statusRevisionRef.current += 1;
      statusRef.current = next;
      setStatus(next);
      queueStorageWrite(actor.uid, next);
      failedTargetRef.current = null;
      setSyncError(null);
    },
    [actor.uid, queueStorageWrite],
  );

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
    if (hydratedAccountUid !== actor.uid) return;
    const revision = statusRevisionRef.current;
    const target = status;
    if (suppressedWriteRevisionRef.current === revision) {
      suppressedWriteRevisionRef.current = null;
      return;
    }

    const fail = (error: unknown) => {
      if (revision !== statusRevisionRef.current) return;
      const rollback = confirmedStatusRef.current;
      failedTargetRef.current = target;
      const rollbackRevision = ++statusRevisionRef.current;
      suppressedWriteRevisionRef.current = rollbackRevision;
      statusRef.current = rollback;
      setStatus(rollback);
      queueStorageWrite(actor.uid, rollback);
      setSyncing(false);
      setSyncError(presenceSyncErrorMessage(error, target));
    };

    const complete = (rawResult: unknown) => {
      if (revision !== statusRevisionRef.current) return;
      const result = (rawResult ?? {}) as PresenceWriteResult;
      const serverExpiry =
        target.isOpen && Number.isFinite(result.expiresAt) ? (result.expiresAt ?? null) : null;
      const confirmed =
        target.isOpen && result.closed === true
          ? CLOSED
          : serverExpiry != null && target.expiresAt != null && serverExpiry < target.expiresAt
            ? { ...target, expiresAt: serverExpiry }
            : target;
      confirmedStatusRef.current = confirmed;
      remotePresenceRef.current = confirmed.isOpen;
      if (!confirmed.isOpen) hasIssuedOpenWriteRef.current = false;
      if (confirmed !== target) {
        const confirmedRevision = ++statusRevisionRef.current;
        suppressedWriteRevisionRef.current = confirmedRevision;
        statusRef.current = confirmed;
        setStatus(confirmed);
        queueStorageWrite(actor.uid, confirmed);
      }
      failedTargetRef.current = null;
      setSyncError(null);
      setSyncing(false);
    };

    const submit = (write: () => Promise<unknown> | unknown) => {
      setSyncing(true);
      void queuePresenceWrite(write).then(complete, fail);
    };

    if (!status.isOpen) {
      if (remotePresenceRef.current || hasIssuedOpenWriteRef.current) {
        submit(() => presenceService.clearPresence(actor));
      } else {
        setSyncing(false);
      }
      return;
    }

    const writeDelay =
      remotePresenceRef.current || hasIssuedOpenWriteRef.current ? PRESENCE_WRITE_DEBOUNCE_MS : 0;
    const timer = setTimeout(() => {
      // No `audienceUids` here on purpose: the `publishPresence` callable
      // derives the audience server-side from the caller's real friend edges
      // and ignores anything the client sends. Sending it would imply the
      // client decides who may see it, which is not true and must not look
      // true to the next reader.
      hasIssuedOpenWriteRef.current = true;
      submit(() =>
        presenceService.setPresence(actor, {
          vibe: status.vibe,
          expiresAt: status.expiresAt ?? Date.now() + OPEN_DURATION_MS,
          shareLocation: status.shareLocation,
          coarseLocation: status.shareLocation ? coarse : null,
        }),
      );
    }, writeDelay);

    return () => clearTimeout(timer);
  }, [hydratedAccountUid, actor, status, coarse, queuePresenceWrite, queueStorageWrite]);

  // Friend presence is only map chrome. Keep the own open-status write-through
  // above alive everywhere, but do not keep paying for friend updates while the
  // permanently-mounted map layer is hidden behind Calendar or Socialize.
  useEffect(() => {
    const accountUid = actor.uid;
    setOpenFriends([]);
    if (!friendPresenceListening) return;
    return presenceService.subscribeOpenFriends(actor, (friends) => {
      if (activeAccountUidRef.current !== accountUid) return;
      setOpenFriends(friends);
    });
  }, [actor, friendPresenceListening]);

  // Patch fields while open (no-op if closed), persisting the result.
  const patch = useCallback(
    (partial: Partial<PersistedStatus>) => {
      const current = statusRef.current;
      if (!current.isOpen) return;
      const next = { ...current, ...partial };
      persist(next);
    },
    [persist],
  );

  const openLimitAt = openPresenceConstraint?.isRunning
    ? null
    : (openPresenceConstraint?.startsAt ?? null);
  const openBlockedByActivity = useMemo(() => {
    if (
      !openPresenceConstraint ||
      (!openPresenceConstraint.isRunning &&
        openPresenceConstraint.startsAt - Date.now() >= OPEN_MIN_DURATION_MS)
    ) {
      return null;
    }
    return {
      id: openPresenceConstraint.id,
      title: openPresenceConstraint.title,
      startsAt: openPresenceConstraint.startsAt,
    };
  }, [openPresenceConstraint]);

  // Activity changes can arrive from another device. They may shorten an Open
  // promise, never extend or resurrect it when a plan moves or disappears.
  useEffect(() => {
    if (!status.isOpen || !openPresenceConstraint) return;
    const now = Date.now();
    if (openPresenceConstraint.isRunning || openPresenceConstraint.startsAt <= now) {
      persist(CLOSED);
      return;
    }
    if (status.expiresAt && status.expiresAt > openPresenceConstraint.startsAt) {
      patch({ expiresAt: openPresenceConstraint.startsAt });
    }
  }, [openPresenceConstraint, patch, persist, status.expiresAt, status.isOpen]);

  const goOpen = useCallback(
    (input?: GoOpenInput) => {
      const now = Date.now();
      const boundary = openPresenceConstraint?.startsAt ?? null;
      if (
        openPresenceConstraint?.isRunning ||
        (boundary != null && boundary - now < OPEN_MIN_DURATION_MS)
      ) {
        return false;
      }
      // The explicit core tap is a real server-bound action. Show that it is
      // pending before the first render, while keeping every exit control live.
      setSyncing(true);
      persist({
        isOpen: true,
        vibe: input?.vibe ?? null,
        expiresAt: constrainOpenExpiry(
          input?.expiresAt ?? now + OPEN_DURATION_MS,
          now,
          boundary,
        ),
        openedAt: now,
        shareLocation: input?.shareLocation ?? false,
      });
      return true;
    },
    [openPresenceConstraint, persist],
  );

  const setVibe = useCallback((vibe: OpenVibe | null) => patch({ vibe }), [patch]);
  const setExpiresAt = useCallback(
    (ts: number) => {
      const now = Date.now();
      patch({ expiresAt: constrainOpenExpiry(ts, now, openLimitAt) });
    },
    [openLimitAt, patch],
  );
  const setShareLocation = useCallback(
    (value: boolean) => patch({ shareLocation: value }),
    [patch],
  );
  const close = useCallback(() => persist(CLOSED), [persist]);
  const retrySync = useCallback(() => {
    const target = failedTargetRef.current;
    if (target) persist(target);
  }, [persist]);

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
      openLimitAt,
      openBlockedByActivity,
      shareLocation: status.shareLocation,
      setShareLocation,
      shareLocationBlocked,
      syncing,
      syncError,
      retrySync,
      close,
    }),
    [
      status,
      openFriends,
      setFriendPresenceListening,
      goOpen,
      setVibe,
      setExpiresAt,
      openLimitAt,
      openBlockedByActivity,
      setShareLocation,
      shareLocationBlocked,
      syncing,
      syncError,
      retrySync,
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
