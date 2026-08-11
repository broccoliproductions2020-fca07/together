import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
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
import { Alert, AppState } from 'react-native';

import { useAuth } from '@/features/auth';
import { claimNotificationResponse } from '@/features/notifications/notificationResponse';

import {
  continueSafetyAfterStationary,
  getSafetyBackgroundTrail,
  requestSafetyBackgroundPermission,
  resumeSafetyBackground,
  SAFETY_DEFAULT_DURATION_MS,
  safetyBackgroundRequired,
  startSafetyBackground,
  stopSafetyBackground,
} from './safetyBackground';
import {
  continueSafetyStationaryWindow,
  markSafetyMotionPublished,
  observeSafetyMotion,
  SAFETY_STATIONARY_PROMPT_MS,
  type SafetyMotionState,
} from './safetyMotion';
import { safetyService } from './services/safetyService';
import type { SafetyActor } from './services/safetyService.types';
import {
  cancelSafetyNotification,
  cancelSafetyCheckInNotification,
  ensureSafetyNotificationPermission,
  isSafetyCheckInResponse,
  safetyCompanionActionFromResponse,
  registerSafetyNotificationCategory,
  safetyAlertFromResponse,
  safetyOwnerActionFromResponse,
  safetyOwnerFromResponse,
  scheduleSafetyCheckInNotification,
  scheduleSafetyCompanionConfirmationReminder,
  scheduleSafetyExpiredNotification,
  scheduleSafetyExpiryWarning,
  scheduleSafetyStationaryNotification,
  type SafetyOwnerNotificationAction,
} from './safetyNotifications';
import {
  COMPANION_CONFIRMATION_MS,
  isCompanionConfirmationActive,
  type SafetyLocation,
  type SafetySession,
  type SafetyStartPhase,
  type SafetyStatus,
} from './types';

/** Zielwerte laut Safety-Vertrag — das OS darf verzögern, die UI bleibt ehrlich. */
const INTERVAL_BLUE_MS = 30_000;
const INTERVAL_ALERT_MS = 5_000;
/** Orange → nach kurzer Zeit diskreter Check-in ("Alles okay?"). */
/** Erneuter Check-in, solange Orange aktiv bleibt. */
const TRAIL_WINDOW_MS = 15 * 60_000;
const INCIDENT_KEY = 'together.safety.incident.v1';
const COMPANION_CONFIRMATION_REMINDER_LEAD_MS = 5 * 60 * 1000;

interface SafetyContextValue {
  /** My running Heimweg session (null = none). */
  session: SafetySession | null;
  /** Friends' sessions I'm a companion of. */
  friendSessions: SafetySession[];
  /** Console visibility: session active but user minimised to the app. */
  consoleMinimized: boolean;
  /** Explicit arrival is being committed; prevents duplicate end requests. */
  endingHeimweg: boolean;
  /** Start was explicitly requested and is being committed by the backend. */
  startingHeimweg: boolean;
  /** Current honest activation phase for progressive feedback. */
  startPhase: SafetyStartPhase | null;
  /** A status escalation/de-escalation is waiting for RTDB acknowledgement. */
  statusUpdating: boolean;
  /** A rejected status change leaves the last confirmed Safety status intact. */
  statusError: string | null;
  checkInUpdating: boolean;
  checkInError: string | null;
  setConsoleMinimized: (minimized: boolean) => void;
  /**
   * Heimweg-Fokus: the map shows ONLY shared walks (activities and chrome
   * hidden). Derived severity-first: with an own session it is simply the
   * open split console (Fall 2); without one it is the manual companion view
   * toggled via the shield (Fall 3).
   */
  heimwegFocusActive: boolean;
  /** Manual Fall-3 toggle — ignored while an own session runs. */
  setCompanionFocus: (active: boolean) => void;
  startHeimweg: (audienceUids: string[]) => Promise<void>;
  /** Deliberately add/remove concrete companions during a running session. */
  updateAudience: (addUids: string[], removeUids: string[]) => Promise<void>;
  extendHeimweg: () => Promise<void>;
  /** Orange — "Ich fühle mich unsicher". */
  setUnwell: () => void;
  /** Rot — "Hilfe". Only ever triggered by a deliberate human hold. */
  setEmergency: () => void;
  /** Orange → Blau ("Alles wieder okay"); sharing continues. */
  allClear: () => void;
  /** Rot → Blau ("Ich bin sicher"). */
  imSafe: () => void;
  /** Grün — "Sicher angekommen": ends the session, wipes live data. */
  arriveSafe: () => void;
  continueAfterStationary: () => void;
  answerCheckIn: () => void;
  confirmReachable: (ownerUid: string) => Promise<void>;
  /** Withdraws only the active reachability promise, never location access. */
  withdrawReachability: (ownerUid: string) => Promise<void>;
  /** Confirms that this exact Orange/Red escalation is actively being watched. */
  confirmAlert: (ownerUid: string, alertAt: number) => Promise<void>;
  /** "Auf Karte zeigen": minimises the console and asks the map to focus. */
  focusOnMap: (target: SafetyLocation) => void;
  /** Consumed by MapScreen — the pending focus coordinate, cleared after use. */
  mapFocusRequest: SafetyLocation | null;
  clearMapFocusRequest: () => void;
}

const SafetyContext = createContext<SafetyContextValue | null>(null);
const SAFETY_REQUEST_TIMEOUT_MS = 15_000;

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((part) => part.charAt(0))
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'DU'
  );
}

/**
 * Owns the Heimweg session: persistent native background updates when the OS
 * permits them, with a foreground watcher as an honest fallback,
 * the check-in state machine after Orange, the on-device 15-minute trail and
 * the local incident log (Orange/Rot). See docs/safety-mode.md.
 */
export function SafetyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const actor = useMemo<SafetyActor>(
    () => ({
      uid: user?.id ?? 'u_you',
      displayName: user?.displayName ?? 'Du',
      initials: initialsOf(user?.displayName ?? 'Du'),
    }),
    [user?.id, user?.displayName],
  );

  const [session, setSession] = useState<SafetySession | null>(null);
  const [sessionResolved, setSessionResolved] = useState(false);
  const [friendSessions, setFriendSessions] = useState<SafetySession[]>([]);
  const [consoleMinimized, setConsoleMinimized] = useState(false);
  const [companionFocus, setCompanionFocus] = useState(false);
  const [mapFocusRequest, setMapFocusRequest] = useState<SafetyLocation | null>(null);
  const [backgroundManaged, setBackgroundManaged] = useState(false);
  const [endingHeimweg, setEndingHeimweg] = useState(false);
  const [startingHeimweg, setStartingHeimweg] = useState(false);
  const [startPhase, setStartPhase] = useState<SafetyStartPhase | null>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [checkInUpdating, setCheckInUpdating] = useState(false);
  const [checkInError, setCheckInError] = useState<string | null>(null);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');

  // A later walk must never re-open the companion view unasked: the manual
  // toggle dies together with the last shared session.
  useEffect(() => {
    if (!friendSessions.length) setCompanionFocus(false);
  }, [friendSessions.length]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      setAppActive(nextState === 'active');
    });
    return () => subscription.remove();
  }, []);

  const heimwegFocusActive =
    friendSessions.length > 0 && (session ? !consoleMinimized : companionFocus);

  const watcherRef = useRef<Location.LocationSubscription | null>(null);
  const checkInNotificationRef = useRef<string | null>(null);
  const expiryWarningNotificationRef = useRef<string | null>(null);
  const expiredNotificationRef = useRef<string | null>(null);
  const scheduledExpiryAtRef = useRef<number | null>(null);
  const stationaryNotificationRef = useRef<string | null>(null);
  const foregroundMotionRef = useRef<SafetyMotionState | undefined>(undefined);
  // On-device only (safety contract): live sharing stays last-point-only.
  const trailRef = useRef<SafetyLocation[]>([]);
  const sessionRef = useRef<SafetySession | null>(null);
  const endingHeimwegRef = useRef(false);
  const startingHeimwegRef = useRef(false);
  const pendingOwnCheckInResponseRef = useRef(false);
  const statusWriteChainRef = useRef<Promise<void>>(Promise.resolve());
  const statusRequestRevisionRef = useRef(0);
  const requestedStatusRef = useRef<SafetyStatus | null>(null);
  const checkInInFlightRef = useRef(false);
  const checkInRequestRevisionRef = useRef(0);
  const pendingOwnerActionRef = useRef<SafetyOwnerNotificationAction | null>(null);
  const companionConfirmationNotificationRefs = useRef(
    new Map<string, { confirmedAt: number; identifier: string | null }>(),
  );
  sessionRef.current = session;

  const fireAndForget = useCallback((action: string, promise: Promise<unknown>) => {
    promise.catch((error) => console.warn(`[safety] ${action} fehlgeschlagen:`, error));
  }, []);

  const finishHeimweg = useCallback(async () => {
    const current = sessionRef.current;
    if (!current || endingHeimwegRef.current) return;
    endingHeimwegRef.current = true;
    setEndingHeimweg(true);
    try {
      // Delete the server-visible session first. Once that succeeds, update
      // local UI immediately instead of waiting for the RTDB listener roundtrip.
      await safetyService.endSession(actor, current.audienceUids);
      sessionRef.current = null;
      setSession(null);
      setConsoleMinimized(false);
      setBackgroundManaged(false);
      await stopSafetyBackground();
    } finally {
      endingHeimwegRef.current = false;
      setEndingHeimweg(false);
    }
  }, [actor]);

  const extendHeimweg = useCallback(async () => {
    await safetyService.extendSession(actor);
  }, [actor]);

  const continueAfterStationary = useCallback(() => {
    fireAndForget(
      'continueAfterStationary',
      (async () => {
        if (safetyBackgroundRequired()) {
          await continueSafetyAfterStationary();
          return;
        }
        const now = Date.now();
        foregroundMotionRef.current = continueSafetyStationaryWindow(
          foregroundMotionRef.current,
          now,
        );
        await cancelSafetyNotification(stationaryNotificationRef.current);
        stationaryNotificationRef.current = await scheduleSafetyStationaryNotification(
          now + SAFETY_STATIONARY_PROMPT_MS,
        );
      })(),
    );
  }, [fireAndForget]);

  const runOwnerNotificationAction = useCallback(
    (action: SafetyOwnerNotificationAction) => {
      if (action === 'stationary_continue') {
        continueAfterStationary();
      } else if (action === 'expiry_extend') {
        fireAndForget('extendFromNotification', extendHeimweg());
      } else {
        fireAndForget('arriveFromNotification', finishHeimweg());
      }
    },
    [continueAfterStationary, extendHeimweg, finishHeimweg, fireAndForget],
  );

  // My session (also restores a running session after an app restart).
  useEffect(() => {
    setSession(null);
    setSessionResolved(false);
    return safetyService.subscribeMySession(actor, (next) => {
      setSession(next);
      if (next && requestedStatusRef.current === next.status) {
        requestedStatusRef.current = null;
        setStatusUpdating(false);
        setStatusError(null);
      }
      setSessionResolved(true);
    });
  }, [actor]);

  const ownSessionUid = session?.uid;
  const ownSessionExpiresAt = session?.expiresAt;
  const ownSessionStatus = session?.status;

  // A backgrounded companion cannot inspect the map. Pushes remain the urgent
  // nudge there; detach live RTDB listeners until the app is foregrounded.
  // Keep the last local state so its already-scheduled reachability reminder is
  // not cancelled just because the app moved to the background.
  useEffect(() => {
    if (!appActive) return;
    return safetyService.subscribeFriendSessions(actor, setFriendSessions);
  }, [actor, appActive]);

  // "Ich bin erreichbar" is deliberately a short, conscious promise. The
  // reminder is entirely local: no poll, no scheduled Function and no owner
  // notification when it simply expires.
  useEffect(() => {
    let cancelled = false;
    const now = Date.now();
    const active = new Map<string, { confirmedAt: number; displayName: string }>();
    friendSessions.forEach((friendSession) => {
      const confirmation = friendSession.companions?.[actor.uid];
      if (
        friendSession.expiresAt <= now ||
        friendSession.status !== 'blue' ||
        !isCompanionConfirmationActive(confirmation, now) ||
        !confirmation
      ) {
        return;
      }
      const dueAt =
        confirmation.confirmedAt +
        COMPANION_CONFIRMATION_MS -
        COMPANION_CONFIRMATION_REMINDER_LEAD_MS;
      if (dueAt > now) {
        active.set(friendSession.uid, {
          confirmedAt: confirmation.confirmedAt,
          displayName: friendSession.displayName,
        });
      }
    });

    void (async () => {
      for (const [ownerUid, scheduled] of companionConfirmationNotificationRefs.current) {
        const next = active.get(ownerUid);
        if (next && next.confirmedAt === scheduled.confirmedAt) continue;
        companionConfirmationNotificationRefs.current.delete(ownerUid);
        await cancelSafetyNotification(scheduled.identifier);
      }

      for (const [ownerUid, next] of active) {
        if (companionConfirmationNotificationRefs.current.has(ownerUid)) continue;
        const identifier = await scheduleSafetyCompanionConfirmationReminder(
          ownerUid,
          next.displayName,
          next.confirmedAt + COMPANION_CONFIRMATION_MS - COMPANION_CONFIRMATION_REMINDER_LEAD_MS,
        );
        if (cancelled) {
          await cancelSafetyNotification(identifier);
          return;
        }
        companionConfirmationNotificationRefs.current.set(ownerUid, {
          confirmedAt: next.confirmedAt,
          identifier,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [actor.uid, friendSessions]);

  useEffect(
    () => () => {
      for (const { identifier } of companionConfirmationNotificationRefs.current.values()) {
        void cancelSafetyNotification(identifier);
      }
      companionConfirmationNotificationRefs.current.clear();
    },
    [],
  );

  // Restore the native task after a JS/app restart. A missing permission does
  // not fabricate safety: the foreground fallback below remains active and
  // companions can see its honest last-update timestamp.
  useEffect(() => {
    if (!sessionResolved) return;
    let cancelled = false;
    if (!ownSessionUid || !ownSessionExpiresAt || !ownSessionStatus) {
      setBackgroundManaged(false);
      void stopSafetyBackground();
      return;
    }
    if (!safetyBackgroundRequired()) {
      setBackgroundManaged(false);
      return;
    }
    void resumeSafetyBackground(actor, ownSessionExpiresAt, ownSessionStatus)
      .then((active) => {
        if (!cancelled) setBackgroundManaged(active);
      })
      .catch(() => {
        if (!cancelled) setBackgroundManaged(false);
      });
    return () => {
      cancelled = true;
    };
  }, [actor, ownSessionExpiresAt, ownSessionStatus, ownSessionUid, sessionResolved]);

  // A companion can confirm directly from the actionable system notification.
  // The action opens the app so iOS/Android can run the authenticated callable
  // reliably; a normal notification tap simply reveals the Shield request.
  useEffect(() => {
    void registerSafetyNotificationCategory().catch(() => undefined);

    const handleResponse = (response: Notifications.NotificationResponse) => {
      if (!claimNotificationResponse('safety', response)) return;
      const ownerAction = safetyOwnerActionFromResponse(response);
      if (ownerAction) {
        if (sessionRef.current) runOwnerNotificationAction(ownerAction);
        else pendingOwnerActionRef.current = ownerAction;
        return;
      }
      const companionAction = safetyCompanionActionFromResponse(response);
      if (companionAction) {
        if (companionAction.action === 'continue') {
          fireAndForget(
            'confirmReachableFromReminder',
            safetyService.confirmReachable(actor, companionAction.ownerUid),
          );
        } else {
          fireAndForget(
            'withdrawReachabilityFromReminder',
            safetyService.withdrawReachability(actor, companionAction.ownerUid),
          );
        }
        return;
      }
      if (isSafetyCheckInResponse(response)) {
        pendingOwnCheckInResponseRef.current = true;
        const current = sessionRef.current;
        if (current?.checkIn && !current.checkIn.answeredAt) {
          pendingOwnCheckInResponseRef.current = false;
          fireAndForget(
            'answerCheckInFromNotification',
            safetyService.updateSession(actor, {
              checkIn: { ...current.checkIn, answeredAt: Date.now() },
            }),
          );
        }
        return;
      }
      const alert = safetyAlertFromResponse(response);
      if (alert) {
        fireAndForget(
          'confirmAlertFromNotification',
          safetyService.confirmAlert(actor, alert.ownerUid, alert.alertAt),
        );
        return;
      }
      const ownerUid = safetyOwnerFromResponse(response);
      if (!ownerUid) return;
      fireAndForget(
        'confirmReachableFromNotification',
        safetyService.confirmReachable(actor, ownerUid),
      );
    };

    const subscription = Notifications.addNotificationResponseReceivedListener(handleResponse);
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) handleResponse(response);
    });
    return () => subscription.remove();
  }, [actor, fireAndForget, runOwnerNotificationAction]);

  // A check-in action may launch a previously terminated app before the RTDB
  // subscription has restored the session. Complete it as soon as that state
  // arrives instead of silently losing the response.
  useEffect(() => {
    if (!pendingOwnCheckInResponseRef.current || !session?.checkIn || session.checkIn.answeredAt) {
      return;
    }
    pendingOwnCheckInResponseRef.current = false;
    fireAndForget(
      'answerDeferredCheckIn',
      safetyService.updateSession(actor, {
        checkIn: { ...session.checkIn, answeredAt: Date.now() },
      }),
    );
  }, [actor, fireAndForget, session?.checkIn]);

  useEffect(() => {
    const action = pendingOwnerActionRef.current;
    if (!action || !session) return;
    pendingOwnerActionRef.current = null;
    runOwnerNotificationAction(action);
  }, [runOwnerNotificationAction, session]);

  // The prompt is a local notification: no Firebase read/write and it still
  // appears while the phone is locked. RTDB already carries the server-owned
  // dueAt so companions derive non-response consistently on every device.
  const checkInDueAt = session?.checkIn?.dueAt;
  const checkInAnsweredAt = session?.checkIn?.answeredAt;
  useEffect(() => {
    let cancelled = false;
    void cancelSafetyCheckInNotification(checkInNotificationRef.current);
    checkInNotificationRef.current = null;
    if (!checkInDueAt || checkInAnsweredAt || ownSessionStatus !== 'orange') return;
    void scheduleSafetyCheckInNotification(checkInDueAt).then((identifier) => {
      if (cancelled) {
        void cancelSafetyCheckInNotification(identifier);
        return;
      }
      checkInNotificationRef.current = identifier;
    });
    return () => {
      cancelled = true;
    };
  }, [checkInAnsweredAt, checkInDueAt, ownSessionStatus]);

  // Two-hour default: warn ten minutes before and state the automatic end
  // honestly. An explicit extension updates expiresAt and reschedules both.
  useEffect(() => {
    let cancelled = false;
    const previouslyScheduledExpiry = scheduledExpiryAtRef.current;
    void cancelSafetyNotification(expiryWarningNotificationRef.current);
    expiryWarningNotificationRef.current = null;
    if (!ownSessionExpiresAt) {
      // Do not cancel the exact-expiry notification when the listener removes
      // a naturally timed-out session at the same instant. A deliberate early
      // finish still cancels it.
      const endedByTimeout =
        previouslyScheduledExpiry !== null && Date.now() >= previouslyScheduledExpiry - 1_500;
      if (!endedByTimeout) void cancelSafetyNotification(expiredNotificationRef.current);
      expiredNotificationRef.current = null;
      scheduledExpiryAtRef.current = null;
      return;
    }

    void cancelSafetyNotification(expiredNotificationRef.current);
    expiredNotificationRef.current = null;
    scheduledExpiryAtRef.current = ownSessionExpiresAt;

    void ensureSafetyNotificationPermission().then(async (granted) => {
      if (!granted || cancelled) return;
      const [warningId, expiredId] = await Promise.all([
        scheduleSafetyExpiryWarning(ownSessionExpiresAt),
        scheduleSafetyExpiredNotification(ownSessionExpiresAt),
      ]);
      if (cancelled) {
        await Promise.all([
          cancelSafetyNotification(warningId),
          cancelSafetyNotification(expiredId),
        ]);
        return;
      }
      expiryWarningNotificationRef.current = warningId;
      expiredNotificationRef.current = expiredId;
    });

    return () => {
      cancelled = true;
    };
  }, [ownSessionExpiresAt]);

  const pushLocation = useCallback(
    (coords: { latitude: number; longitude: number }) => {
      fireAndForget(
        'processForegroundLocation',
        (async () => {
          const now = Date.now();
          const fix: SafetyLocation = {
            lat: Number(coords.latitude.toFixed(5)),
            lng: Number(coords.longitude.toFixed(5)),
            at: now,
          };
          const status = sessionRef.current?.status ?? 'blue';
          const decision = observeSafetyMotion(foregroundMotionRef.current, fix, status, now);
          foregroundMotionRef.current = decision.next;

          if (decision.stationaryWindowReset) {
            await cancelSafetyNotification(stationaryNotificationRef.current);
            stationaryNotificationRef.current = await scheduleSafetyStationaryNotification(
              decision.stationaryDueAt,
            );
          }

          if (!decision.shouldPublishLocation && !decision.shouldHeartbeat) return;
          await safetyService.updateSession(
            actor,
            decision.shouldPublishLocation ? { location: fix } : {},
          );
          foregroundMotionRef.current = markSafetyMotionPublished(
            foregroundMotionRef.current,
            decision.shouldPublishLocation ? fix : undefined,
            now,
          );
          if (decision.shouldPublishLocation) {
            trailRef.current = [...trailRef.current, fix].filter(
              (point) => now - point.at <= TRAIL_WINDOW_MS,
            );
          }
        })(),
      );
    },
    [actor, fireAndForget],
  );

  useEffect(() => {
    if (session) return;
    foregroundMotionRef.current = undefined;
    void cancelSafetyNotification(stationaryNotificationRef.current);
    stationaryNotificationRef.current = null;
  }, [session]);

  // Foreground location watcher — restarted whenever the status changes the
  // target interval. Denied permission is NOT fatal: the session keeps running
  // and companions honestly see the data gap.
  const sessionActive = Boolean(session);
  const alertMode = session?.status === 'orange' || session?.status === 'red';
  useEffect(() => {
    if (!sessionActive || backgroundManaged) {
      trailRef.current = [];
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (cancelled || permission.status !== Location.PermissionStatus.GRANTED) return;
        watcherRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: alertMode ? INTERVAL_ALERT_MS : INTERVAL_BLUE_MS,
            distanceInterval: alertMode ? 5 : 15,
          },
          (position) => pushLocation(position.coords),
        );
      } catch {
        // No location → companions see "kein Update" — the honest signal.
      }
    })();
    return () => {
      cancelled = true;
      watcherRef.current?.remove();
      watcherRef.current = null;
    };
  }, [sessionActive, alertMode, backgroundManaged, pushLocation]);

  // Local incident log (safety contract data exception): Orange/Rot snapshots
  // the on-device trail so an incident cannot simply vanish. Export/cloud
  // storage is follow-up work; max age is enforced on write.
  const recordIncident = useCallback((status: SafetyStatus) => {
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(INCIDENT_KEY);
        const incidents: unknown[] = raw ? JSON.parse(raw) : [];
        const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
        const kept = incidents.filter(
          (item) => (item as { at?: number }).at && (item as { at: number }).at > cutoff,
        );
        const backgroundTrail = await getSafetyBackgroundTrail();
        kept.push({
          at: Date.now(),
          status,
          trail: backgroundTrail.length ? backgroundTrail : trailRef.current,
        });
        await AsyncStorage.setItem(INCIDENT_KEY, JSON.stringify(kept.slice(-20)));
      } catch {
        // best-effort — the live alert to friends is the primary channel
      }
    })();
  }, []);

  const setStatus = useCallback(
    (status: SafetyStatus) => {
      if (!sessionRef.current) return;
      if (statusUpdating && requestedStatusRef.current === status) return;
      const requestRevision = ++statusRequestRevisionRef.current;
      requestedStatusRef.current = status;
      setStatusUpdating(true);
      setStatusError(null);
      const timeout = setTimeout(() => {
        if (requestRevision !== statusRequestRevisionRef.current) return;
        setStatusUpdating(false);
        setStatusError(
          'Deine Sicherheitsmeldung wartet noch auf eine Verbindung. Der aktuelle Status bleibt unverändert.',
        );
      }, SAFETY_REQUEST_TIMEOUT_MS);
      const write = statusWriteChainRef.current
        .catch(() => {})
        .then(async () => {
          // A newer hold supersedes a queued older one. If the older write has
          // already reached RTDB, the chain still serializes the newer intent
          // behind it so a late response cannot overwrite the final choice.
          if (requestRevision !== statusRequestRevisionRef.current) return;
          await safetyService.setStatus(actor, status);
        });
      statusWriteChainRef.current = write.catch(() => {});
      void write.then(
        () => {
          clearTimeout(timeout);
          if (requestRevision !== statusRequestRevisionRef.current) return;
          setStatusUpdating(false);
          setStatusError(null);
        },
        () => {
          clearTimeout(timeout);
          if (requestRevision !== statusRequestRevisionRef.current) return;
          requestedStatusRef.current = null;
          setStatusUpdating(false);
          setStatusError('Deine Sicherheitsmeldung konnte nicht übermittelt werden. Bitte erneut halten.');
        },
      );
    },
    [actor, statusUpdating],
  );

  const value = useMemo<SafetyContextValue>(
    () => ({
      session,
      friendSessions,
      consoleMinimized,
      endingHeimweg,
      startingHeimweg,
      startPhase,
      statusUpdating,
      statusError,
      checkInUpdating,
      checkInError,
      setConsoleMinimized,
      heimwegFocusActive,
      setCompanionFocus,
      startHeimweg: async (audienceUids) => {
        if (sessionRef.current) {
          setConsoleMinimized(false);
          return;
        }
        if (startingHeimwegRef.current) return;
        startingHeimwegRef.current = true;
        setStartingHeimweg(true);
        setStartPhase('permissions');
        // Keep the console hidden while the native start sheet dismisses. Its
        // caller reveals the console after the interaction; otherwise Android
        // can lose the second Modal during the brief overlap.
        setConsoleMinimized(true);
        let serverStarted = false;
        try {
          await registerSafetyNotificationCategory();
          await ensureSafetyNotificationPermission();
          if (safetyBackgroundRequired() && !(await requestSafetyBackgroundPermission())) {
            throw new Error(
              'Für einen zuverlässigen Heimweg benötigt Como den Standortzugriff „Immer“. Es wird nichts im Hintergrund geteilt, bevor du den Heimweg startest.',
            );
          }
          setStartPhase('session');
          // Enter the real Safety surface immediately. Firebase still creates
          // the authoritative session in the background, but the user no
          // longer waits on a technical progress screen or a Functions cold
          // start. Actions remain visually disabled until the start finishes.
          const startedAt = Date.now();
          const optimisticSession: SafetySession = {
            uid: actor.uid,
            displayName: actor.displayName,
            initials: actor.initials,
            status: 'blue',
            startedAt,
            updatedAt: startedAt,
            expiresAt: startedAt + SAFETY_DEFAULT_DURATION_MS,
            retainUntil: startedAt + SAFETY_DEFAULT_DURATION_MS + 3 * 60_000,
            audienceUids: [...audienceUids],
            companions: {},
          };
          sessionRef.current = optimisticSession;
          setSession(optimisticSession);
          setSessionResolved(true);
          setStartingHeimweg(false);

          const expiresAt = await safetyService.startSession(actor, audienceUids);
          serverStarted = true;
          // Keep the optimistic surface, but reconcile the authoritative
          // deadline immediately even if the RTDB listener is reconnecting.
          const confirmedSession = {
            ...(sessionRef.current ?? optimisticSession),
            expiresAt,
            retainUntil: expiresAt + 3 * 60_000,
          };
          sessionRef.current = confirmedSession;
          setSession(confirmedSession);
          if (safetyBackgroundRequired()) {
            setStartPhase('location');
            const active = await startSafetyBackground(actor, expiresAt, 'blue');
            if (!active) throw new Error('Die Hintergrundfreigabe konnte nicht gestartet werden.');
            setBackgroundManaged(true);
          }
        } catch (error) {
          if (serverStarted) {
            await safetyService.endSession(actor, audienceUids).catch(() => undefined);
          }
          sessionRef.current = null;
          setSession(null);
          await stopSafetyBackground();
          setBackgroundManaged(false);
          setConsoleMinimized(false);
          throw error;
        } finally {
          startingHeimwegRef.current = false;
          setStartingHeimweg(false);
          setStartPhase(null);
        }
      },
      updateAudience: async (addUids, removeUids) => {
        const audienceUids = await safetyService.updateAudience(actor, addUids, removeUids);
        const current = sessionRef.current;
        if (!current) return;
        const companions = { ...current.companions };
        removeUids.forEach((uid) => delete companions[uid]);
        const next = { ...current, audienceUids, companions };
        // Do not wait for the listener round-trip after the authoritative
        // callable succeeds. The listener still reconciles the exact state.
        sessionRef.current = next;
        setSession(next);
      },
      extendHeimweg,
      setUnwell: () => {
        recordIncident('orange');
        setStatus('orange');
      },
      setEmergency: () => {
        recordIncident('red');
        setStatus('red');
      },
      allClear: () => setStatus('blue'),
      imSafe: () => setStatus('blue'),
      arriveSafe: () => {
        void finishHeimweg().catch((error) => {
          console.warn('[safety] endSession fehlgeschlagen:', error);
          Alert.alert(
            'Heimweg konnte nicht beendet werden',
            'Bitte prüfe deine Verbindung und versuche es erneut.',
          );
        });
      },
      continueAfterStationary,
      answerCheckIn: () => {
        const current = sessionRef.current;
        if (!current?.checkIn || checkInInFlightRef.current) return;
        const requestRevision = ++checkInRequestRevisionRef.current;
        checkInInFlightRef.current = true;
        setCheckInUpdating(true);
        setCheckInError(null);
        const answeredAt = Date.now();
        const timeout = setTimeout(() => {
          if (requestRevision !== checkInRequestRevisionRef.current) return;
          checkInInFlightRef.current = false;
          setCheckInUpdating(false);
          setCheckInError(
            'Die Bestätigung wartet noch auf eine Verbindung. Dein Check-in gilt erst nach einer Bestätigung als gesendet.',
          );
        }, SAFETY_REQUEST_TIMEOUT_MS);
        void safetyService
          .updateSession(actor, {
            checkIn: { ...current.checkIn, answeredAt },
          })
          .then(() => {
            clearTimeout(timeout);
            if (requestRevision !== checkInRequestRevisionRef.current) return;
            setCheckInError(null);
            const latest = sessionRef.current;
            if (!latest?.checkIn || latest.checkIn.dueAt !== current.checkIn?.dueAt) return;
            const next = { ...latest, checkIn: { ...latest.checkIn, answeredAt } };
            sessionRef.current = next;
            setSession(next);
          })
          .catch(() => {
            clearTimeout(timeout);
            if (requestRevision !== checkInRequestRevisionRef.current) return;
            setCheckInError('Deine Bestätigung konnte nicht gesendet werden. Bitte erneut tippen.');
          })
          .finally(() => {
            if (requestRevision !== checkInRequestRevisionRef.current) return;
            checkInInFlightRef.current = false;
            setCheckInUpdating(false);
          });
      },
      confirmReachable: (ownerUid) => safetyService.confirmReachable(actor, ownerUid),
      withdrawReachability: (ownerUid) => safetyService.withdrawReachability(actor, ownerUid),
      confirmAlert: (ownerUid, alertAt) => safetyService.confirmAlert(actor, ownerUid, alertAt),
      focusOnMap: (target) => {
        if (session && friendSessions.length) setConsoleMinimized(false);
        else setCompanionFocus(true);
        setMapFocusRequest(target);
      },
      mapFocusRequest,
      clearMapFocusRequest: () => setMapFocusRequest(null),
    }),
    [
      session,
      friendSessions,
      consoleMinimized,
      endingHeimweg,
      startingHeimweg,
      startPhase,
      statusUpdating,
      statusError,
      checkInUpdating,
      checkInError,
      heimwegFocusActive,
      mapFocusRequest,
      actor,
      continueAfterStationary,
      extendHeimweg,
      finishHeimweg,
      fireAndForget,
      recordIncident,
      setStatus,
    ],
  );

  return <SafetyContext.Provider value={value}>{children}</SafetyContext.Provider>;
}

export function useSafety() {
  const context = useContext(SafetyContext);
  if (!context) throw new Error('useSafety must be used within SafetyProvider');
  return context;
}
